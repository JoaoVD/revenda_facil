import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { D, money } from '@/lib/money';
import { BusinessError } from '@/lib/errors';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import {
  saleInput,
  paymentInput,
  type Actor,
} from '@/modules/shared/contracts';
import { applySyncCommand } from './service';
import { commandInput } from './contracts';
import { resolutionInput, type ConflictReview } from './resolution-contracts';

function owned(actor: Actor, commandId: string) {
  return {
    id: commandId,
    organizationId: actor.organizationId,
    userId: actor.userId,
  };
}
export async function conflictReview(
  actor: Actor,
  commandId: string,
): Promise<ConflictReview> {
  const command = await db.syncCommand.findFirst({
    where: owned(actor, commandId),
  });
  if (!command)
    throw new BusinessError('Pendência não encontrada nesta conta.');
  const payload = commandInput.shape.payload.parse(
    command.resolvedPayload ?? command.payload,
  );
  const dependencies = commandInput.shape.dependencies.parse(
    command.dependencies,
  );
  const blockedBy = await db.syncCommand.findMany({
    where: {
      id: { in: dependencies },
      organizationId: actor.organizationId,
      userId: actor.userId,
    },
    select: { id: true, type: true, status: true },
  });
  const pendingDependencies = dependencies.flatMap((id) => {
    const found = blockedBy.find((dep) => dep.id === id);
    return found?.status === 'APPLIED'
      ? []
      : [found || { id, type: 'UNKNOWN', status: 'MISSING' }];
  });
  const result: ConflictReview = {
    id: command.id,
    type: command.type,
    status: command.status,
    message: command.message,
    revision: command.resolutionVersion,
    capturedAt: command.capturedAt.toISOString(),
    blockedBy: pendingDependencies,
  };
  if (command.type === 'ORDER') {
    const input = saleInput.parse(payload);
    const products = await db.product.findMany({
      where: {
        organizationId: actor.organizationId,
        id: { in: input.items.map((i) => i.productId) },
      },
    });
    result.items = input.items.map((i) => {
      const product = products.find((p) => p.id === i.productId);
      return {
        name: product?.name || 'Produto indisponível',
        quantity: i.quantity,
        available: product?.active ? product.stock - product.reserved : 0,
        price: product?.salePrice.toString() || '0',
      };
    });
    result.currentTotal = money(
      result.items
        .reduce((sum, i) => sum.plus(D(i.price).mul(i.quantity)), D(0))
        .minus(input.discount),
    );
    const original = commandInput.shape.payload.parse(command.payload);
    result.originalAmount = String(
      original.localTotal ?? original.expectedTotal ?? result.currentTotal,
    );
    result.paid = input.paid;
    result.installments = input.installments;
  } else if (command.type === 'DELIVERY' || command.type === 'PAYMENT') {
    const saleId = String(
      command.type === 'DELIVERY' ? payload.saleId : payload.referenceId,
    );
    const sale = await db.sale.findFirst({
      where: { id: saleId, organizationId: actor.organizationId },
      include: { payments: true, customer: true },
    });
    if (sale) {
      const netReceived = sale.payments.reduce(
        (sum, p) =>
          p.direction === 'IN'
            ? sum.plus(p.amount.toString())
            : sum.minus(p.amount.toString()),
        D(0),
      );
      result.sale = {
        id: sale.id,
        version: sale.version,
        status: sale.status,
        fulfillmentStatus: sale.fulfillmentStatus,
        balance: money(D(sale.total.toString()).minus(netReceived)),
      };
      result.customerName = sale.customer?.name || 'Sem cadastro';
      if (command.type === 'PAYMENT') {
        const input = paymentInput.parse(payload);
        result.originalAmount = input.amount;
        const candidates = await db.sale.findMany({
          where: {
            organizationId: actor.organizationId,
            customerId: sale.customerId,
            status: 'CONFIRMED',
            ...(sale.customerId ? {} : { id: sale.id }),
          },
          include: { payments: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
        result.targets = candidates
          .map((s) => {
            const received = s.payments.reduce(
              (sum, p) =>
                p.direction === 'IN'
                  ? sum.plus(p.amount.toString())
                  : sum.minus(p.amount.toString()),
              D(0),
            );
            return {
              id: s.id,
              label: `Pedido #${s.id.slice(0, 8)}`,
              balance: money(D(s.total.toString()).minus(received)),
            };
          })
          .filter((s) => D(s.balance).gte(input.amount));
      }
    }
  } else if (command.type === 'CUSTOMER') {
    const customer = await db.customer.findFirst({
      where: {
        id: String(payload.customerId),
        organizationId: actor.organizationId,
        active: true,
      },
    });
    result.customerName = customer?.name;
  }
  return result;
}

/** Registra uma decisão auditável. Nunca reescreve o payload e hash capturados. */
export async function resolveConflict(actor: Actor, raw: unknown) {
  const input = resolutionInput.parse(raw);
  await atomic(async (tx) => {
    const previous = await tx.syncResolution.findUnique({
      where: { id: input.idempotencyKey },
    });
    if (previous) {
      if (
        previous.organizationId !== actor.organizationId ||
        previous.userId !== actor.userId ||
        previous.commandId !== input.commandId
      )
        throw new BusinessError('Decisão vinculada a outra conta.');
      sameRequest(previous.requestHash, input);
      return;
    }
    const command = await tx.syncCommand.findFirst({
      where: owned(actor, input.commandId),
    });
    if (!command)
      throw new BusinessError('Pendência não encontrada nesta conta.');
    if (
      !['ATTENTION', 'WAITING'].includes(command.status) ||
      command.resolutionVersion !== input.expectedRevision ||
      (command.leaseUntil && command.leaseUntil > new Date())
    )
      throw new BusinessError(
        'A pendência mudou ou está sendo processada. Atualize antes de confirmar.',
      );
    const dependencies = commandInput.shape.dependencies.parse(
      command.dependencies,
    );
    if (
      (await tx.syncCommand.count({
        where: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          id: { in: dependencies },
          status: 'APPLIED',
        },
      })) !== new Set(dependencies).size
    )
      throw new BusinessError(
        'Resolva primeiro o registro anterior indicado nesta pendência.',
      );
    const payload = commandInput.shape.payload.parse(
      command.resolvedPayload ?? command.payload,
    );
    let effective = { ...payload };
    if (input.action === 'ORDER_PRICES') {
      if (command.type !== 'ORDER' || !input.expectedTotal)
        throw new BusinessError('Decisão inválida para esta pendência.');
      const order = saleInput.parse(payload);
      if (
        await tx.sale.findFirst({
          where: {
            organizationId: actor.organizationId,
            OR: [
              { idempotencyKey: order.idempotencyKey },
              ...(order.orderId ? [{ id: order.orderId }] : []),
            ],
          },
        })
      )
        throw new BusinessError(
          'Pedido já registrado. Consulte o pedido ou tente recuperar a confirmação original.',
        );
      // O recebimento capturado não muda. Parcelas só mudam com confirmação explícita.
      effective = {
        ...effective,
        expectedTotal: input.expectedTotal,
        localTotal: input.expectedTotal,
        installments: input.installments ?? order.installments,
      };
    } else if (input.action === 'DELIVERY_VERSION') {
      if (command.type !== 'DELIVERY' || !input.expectedVersion)
        throw new BusinessError('Decisão inválida para esta pendência.');
      const sale = await tx.sale.findFirst({
        where: {
          id: String(payload.saleId),
          organizationId: actor.organizationId,
          status: 'CONFIRMED',
        },
      });
      if (!sale || sale.version !== input.expectedVersion)
        throw new BusinessError('O atendimento mudou. Confira a versão atual.');
      effective = { ...effective, expectedVersion: sale.version };
    } else if (input.action === 'PAYMENT_TARGET') {
      if (command.type !== 'PAYMENT' || !input.targetSaleId)
        throw new BusinessError('Decisão inválida para esta pendência.');
      const payment = paymentInput.parse(payload);
      if (payment.kind !== 'SALE')
        throw new BusinessError(
          'A conferência permite apenas recebimentos de vendas.',
        );
      if (
        await tx.payment.findFirst({
          where: {
            organizationId: actor.organizationId,
            idempotencyKey: payment.idempotencyKey,
          },
        })
      )
        throw new BusinessError(
          'Recebimento já aplicado. Não pode ser transferido por esta tela.',
        );
      const source = await tx.sale.findFirst({
        where: {
          id: payment.referenceId,
          organizationId: actor.organizationId,
        },
      });
      const target = await tx.sale.findFirst({
        where: {
          id: input.targetSaleId,
          organizationId: actor.organizationId,
          status: 'CONFIRMED',
        },
      });
      if (
        !source ||
        !target ||
        source.customerId !== target.customerId ||
        (!source.customerId && source.id !== target.id)
      )
        throw new BusinessError(
          'Escolha um pedido do mesmo cliente nesta revenda.',
        );
      effective = { ...effective, referenceId: target.id };
    } else if (input.action === 'CUSTOMER_CURRENT') {
      if (command.type !== 'CUSTOMER')
        throw new BusinessError('Decisão inválida para esta pendência.');
      const customer = await tx.customer.findFirst({
        where: {
          id: String(payload.customerId),
          organizationId: actor.organizationId,
          active: true,
        },
      });
      if (!customer) throw new BusinessError('Cadastro atual não encontrado.');
      effective = {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone || '',
        document: customer.document || '',
        email: customer.email || '',
        notes: customer.notes || '',
      };
    }
    effective = JSON.parse(JSON.stringify(effective));
    const nextVersion = command.resolutionVersion + 1;
    const updated = await tx.syncCommand.updateMany({
      where: {
        ...owned(actor, command.id),
        resolutionVersion: input.expectedRevision,
        status: command.status,
      },
      data: {
        resolvedPayload: effective as Prisma.InputJsonObject,
        resolutionVersion: nextVersion,
        status: 'PENDING',
        message: null,
        leaseUntil: null,
        attempts: 0,
      },
    });
    if (updated.count !== 1)
      throw new BusinessError(
        'Outra conferência foi registrada. Atualize a tela.',
      );
    await tx.syncResolution.create({
      data: {
        id: input.idempotencyKey,
        organizationId: actor.organizationId,
        userId: actor.userId,
        commandId: command.id,
        version: nextVersion,
        action: input.action,
        reason: input.reason,
        requestHash: hash(input),
        payload: effective as Prisma.InputJsonObject,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'SYNC_RESOLUTION',
        referenceId: command.id,
        description: `Conferência ${input.action}: ${input.reason}`,
      },
    });
  });
  return applySyncCommand(actor, input.commandId);
}
