import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ensureNoPendingFacts } from '@/modules/orders/guards';
import { saleInput, type Actor, id } from '@/modules/shared/contracts';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import { D, money } from '@/lib/money';
import { BusinessError } from '@/lib/errors';
export async function finalizeSale(actor: Actor, raw: unknown) {
  const input = saleInput.parse(raw);
  if (new Set(input.items.map((x) => x.productId)).size !== input.items.length)
    throw new BusinessError('Agrupe as quantidades de cada produto.');
  return atomic(async (tx) => {
    const existing = await tx.sale.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: actor.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      sameRequest(existing.requestHash, input);
      return existing;
    }
    if (input.customerId && input.newCustomer)
      throw new BusinessError(
        'Escolha um cadastro existente ou informe um cliente novo.',
      );
    let customerId = input.customerId;
    if (input.newCustomer) {
      const quick = input.newCustomer;
      const previous = await tx.customer.findUnique({
        where: { id: quick.id },
      });
      if (previous) {
        if (
          previous.organizationId !== actor.organizationId ||
          !previous.active ||
          previous.name !== quick.name ||
          (previous.phone || '') !== quick.phone
        )
          throw new BusinessError(
            'Cadastro rápido mudou. Confira o cliente antes de continuar.',
          );
      } else {
        await tx.customer.create({
          data: {
            id: quick.id,
            name: quick.name,
            phone: quick.phone,
            organizationId: actor.organizationId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            type: 'CUSTOMER',
            referenceId: quick.id,
            description: 'Cliente cadastrado na confirmação do pedido',
          },
        });
      }
      customerId = quick.id;
    }
    if (
      input.customerId &&
      !(await tx.customer.findFirst({
        where: {
          id: customerId,
          organizationId: actor.organizationId,
          active: true,
        },
      }))
    )
      throw new BusinessError('Cliente não encontrado.');
    const products = await tx.product.findMany({
      where: {
        organizationId: actor.organizationId,
        id: { in: input.items.map((i) => i.productId) },
        active: true,
      },
    });
    const items = input.items.map((item) => {
      const p = products.find((p) => p.id === item.productId);
      if (!p || p.stock - p.reserved < item.quantity)
        throw new BusinessError('Estoque insuficiente. Revise o carrinho.');
      return {
        ...item,
        productName: p.name,
        unitPrice: p.salePrice,
        unitCost: p.averageCost,
        total: money(D(p.salePrice.toString()).mul(item.quantity)),
      };
    });
    const subtotal = items.reduce((s, i) => s.plus(i.total), D(0));
    const total = subtotal.minus(input.discount);
    if (input.expectedTotal && !total.eq(input.expectedTotal))
      throw new BusinessError(
        'O preço mudou desde a consulta no aparelho. Pedido preservado para conferência.',
      );
    if (total.lt(0) || D(input.paid).gt(total))
      throw new BusinessError(
        'Desconto ou recebimento maior que o valor da venda.',
      );
    if (D(input.paid).lt(total) && !customerId)
      throw new BusinessError(
        'Escolha um cliente para acompanhar o valor a receber.',
      );
    const immediate = input.fulfillmentMode === 'IMMEDIATE';
    if (!immediate && !customerId)
      throw new BusinessError('Escolha um cliente para o pedido.');
    if (input.fulfillmentMode === 'DELIVERY' && !input.address.trim())
      throw new BusinessError('Informe o endereço de entrega.');
    if (
      input.installments.length &&
      (input.installments.some((part) => D(part.amount).lte(0)) ||
        !input.installments
          .reduce((sum, part) => sum.plus(part.amount), D(0))
          .eq(total.minus(input.paid)))
    )
      throw new BusinessError(
        'A soma das parcelas deve corresponder ao saldo pendente.',
      );
    if (input.method === 'CREDIT' && D(input.paid).gt(0))
      throw new BusinessError(
        'Selecione a forma do valor recebido (Pix, dinheiro ou cartão).',
      );
    const costTotal = items.reduce(
      (s, i) => s.plus(D(i.unitCost.toString()).mul(i.quantity)),
      D(0),
    );
    const sale = await tx.sale.create({
      data: {
        id: input.orderId,
        organizationId: actor.organizationId,
        customerId,
        subtotal: money(subtotal),
        discount: input.discount,
        total: money(total),
        costTotal: money(costTotal),
        idempotencyKey: input.idempotencyKey,
        requestHash: hash(input),
        fulfillmentMode: input.fulfillmentMode,
        fulfillmentStatus: immediate ? 'COMPLETED' : 'PENDING',
        completedAt: immediate ? new Date() : null,
        expectedDate: input.expectedDate,
        address: input.address,
        deliveryNotes: input.deliveryNotes,
        agreementNotes: input.agreementNotes,
        installments: {
          create: input.installments.map((part, index) => ({
            position: index + 1,
            amount: part.amount,
            dueDate: part.dueDate,
          })),
        },
      },
    });
    for (const item of [...items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const changed = immediate
        ? await tx.$executeRaw`UPDATE "Product" SET "stock" = "stock" - ${item.quantity}, "updatedAt" = NOW() WHERE "id" = ${item.productId} AND "organizationId" = ${actor.organizationId} AND "stock" - "reserved" >= ${item.quantity}`
        : await tx.$executeRaw`UPDATE "Product" SET "reserved" = "reserved" + ${item.quantity}, "updatedAt" = NOW() WHERE "id" = ${item.productId} AND "organizationId" = ${actor.organizationId} AND "stock" - "reserved" >= ${item.quantity}`;
      if (changed !== 1)
        throw new BusinessError(
          'O estoque mudou durante a venda. Revise o carrinho.',
        );
    }
    // Escritas independentes em lote, mantendo as baixas condicionais e a transação.
    await tx.saleItem.createMany({
      data: items.map((item) => ({
        ...item,
        organizationId: actor.organizationId,
        saleId: sale.id,
      })),
    });
    if (immediate)
      await tx.inventoryMovement.createMany({
        data: items.map((item) => ({
          organizationId: actor.organizationId,
          productId: item.productId,
          type: 'SALE',
          quantity: -item.quantity,
          unitCost: item.unitCost,
          referenceId: sale.id,
        })),
      });
    await tx.auditLog.createMany({
      data: items.map((item) => ({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: immediate ? 'SALE' : 'RESERVATION',
        description: `${immediate ? 'Venda' : 'Reserva'}: ${item.productName}`,
        referenceId: sale.id,
        quantity: item.quantity,
        amount: item.total,
      })),
    });
    if (D(input.paid).gt(0)) {
      await tx.payment.create({
        data: {
          organizationId: actor.organizationId,
          saleId: sale.id,
          direction: 'IN',
          method: input.method,
          amount: input.paid,
          description: 'Recebimento da venda',
          idempotencyKey: input.idempotencyKey,
          requestHash: hash(input),
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          type: 'RECEIPT',
          description: 'Recebimento da venda',
          referenceId: sale.id,
          amount: input.paid,
        },
      });
    }
    if (immediate)
      await tx.fiscalDocument.create({
        data: { organizationId: actor.organizationId, saleId: sale.id },
      });
    return sale;
  });
}
export async function cancelSale(actor: Actor, raw: unknown) {
  const input = z
    .object({
      saleId: id,
      reason: z.string().trim().min(5).max(300),
      itemsReturned: z.boolean().default(false),
    })
    .parse(raw);
  return atomic((tx) => cancelSaleInTransaction(tx, actor, input));
}
export async function cancelSaleInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: { saleId: string; reason: string; itemsReturned?: boolean },
) {
  const sale = await tx.sale.findFirst({
    where: { id: input.saleId, organizationId: actor.organizationId },
    include: { items: true, payments: true, fiscalDocument: true },
  });
  if (!sale) throw new BusinessError('Venda não encontrada.');
  if (sale.status === 'CANCELLED') return sale;
  await ensureNoPendingFacts(tx, actor, sale.id);
  if (
    sale.fiscalDocument &&
    sale.fiscalDocument.status !== 'PENDING' &&
    sale.fiscalDocument.status !== 'CANCELLED'
  )
    throw new BusinessError(
      'Resolva o documento fiscal antes do cancelamento comercial.',
    );
  if (
    sale.fiscalDocument?.status === 'PENDING' &&
    sale.fiscalDocument.activeRequestId
  )
    throw new BusinessError(
      'Há uma solicitação fiscal preparada. Resolva-a antes de cancelar.',
    );
  const received = sale.payments.reduce(
    (s, p) =>
      p.direction === 'IN'
        ? s.plus(p.amount.toString())
        : s.minus(p.amount.toString()),
    D(0),
  );
  if (received.gt(0))
    throw new BusinessError(
      'Venda já recebida: utilize o cancelamento com reembolso no detalhe do pedido.',
    );
  if (sale.fulfillmentStatus === 'COMPLETED' && !input.itemsReturned)
    throw new BusinessError(
      'Confirme o retorno físico de todos os produtos antes de repor o estoque.',
    );
  for (const item of [...sale.items].sort((a, b) =>
    a.productId.localeCompare(b.productId),
  )) {
    if (sale.fulfillmentStatus === 'PENDING') {
      const changed = await tx.product.updateMany({
        where: {
          id: item.productId,
          organizationId: actor.organizationId,
          reserved: { gte: item.quantity },
        },
        data: { reserved: { decrement: item.quantity } },
      });
      if (changed.count !== 1)
        throw new BusinessError('Reserva inconsistente. Revise o pedido.');
      continue;
    }
    const product = await tx.product.findUniqueOrThrow({
      where: { id: item.productId },
    });
    const average = D(product.averageCost.toString())
      .mul(product.stock)
      .plus(D(item.unitCost.toString()).mul(item.quantity))
      .div(product.stock + item.quantity)
      .toFixed(4);
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity }, averageCost: average },
    });
    await tx.inventoryMovement.create({
      data: {
        organizationId: actor.organizationId,
        productId: item.productId,
        type: 'RETURN',
        quantity: item.quantity,
        unitCost: item.unitCost,
        referenceId: sale.id,
      },
    });
  }
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      type:
        sale.fulfillmentStatus === 'PENDING' ? 'RESERVATION_RELEASE' : 'RETURN',
      description: `Venda cancelada: ${input.reason}`,
      referenceId: sale.id,
      amount: money(sale.total.toString()),
    },
  });
  return tx.sale.update({
    where: { id: sale.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: input.reason,
      version: { increment: 1 },
    },
  });
}

/** Conclusão integral: recebimentos e parcelas não são alterados. */
export async function completeOrder(actor: Actor, raw: unknown) {
  const input = z
    .object({ saleId: id, expectedVersion: z.coerce.number().int().positive() })
    .parse(raw);
  return atomic(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, organizationId: actor.organizationId },
      include: { items: true },
    });
    if (!sale) throw new BusinessError('Pedido não encontrado.');
    if (sale.status !== 'CONFIRMED')
      throw new BusinessError('Pedido cancelado não pode ser entregue.');
    // Reenvio após resposta perdida é inofensivo, inclusive entre abas.
    if (sale.fulfillmentStatus === 'COMPLETED') return sale;
    if (sale.version !== input.expectedVersion)
      throw new BusinessError(
        'A versão do pedido mudou. Atualize antes de confirmar.',
      );
    for (const item of [...sale.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const changed = await tx.product.updateMany({
        where: {
          id: item.productId,
          organizationId: actor.organizationId,
          reserved: { gte: item.quantity },
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
          reserved: { decrement: item.quantity },
        },
      });
      if (changed.count !== 1)
        throw new BusinessError(
          'Reserva inconsistente. Não foi possível concluir.',
        );
    }
    await tx.inventoryMovement.createMany({
      data: sale.items.map((item) => ({
        organizationId: actor.organizationId,
        productId: item.productId,
        type: 'SALE',
        quantity: -item.quantity,
        unitCost: item.unitCost,
        referenceId: sale.id,
      })),
    });
    await tx.auditLog.createMany({
      data: sale.items.map((item) => ({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'SALE',
        description: `Pedido concluído: ${item.productName}`,
        referenceId: sale.id,
        quantity: item.quantity,
        amount: item.total,
      })),
    });
    await tx.fiscalDocument.create({
      data: { organizationId: actor.organizationId, saleId: sale.id },
    });
    return tx.sale.update({
      where: { id: sale.id },
      data: {
        fulfillmentStatus: 'COMPLETED',
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
  });
}
