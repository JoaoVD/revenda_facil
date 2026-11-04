import { Prisma } from '@prisma/client';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import type { Actor } from '@/modules/shared/contracts';
import { BusinessError } from '@/lib/errors';
import { D, money } from '@/lib/money';
import { netReceived } from '@/modules/finance/ledger';
import { cancelSaleInTransaction } from '@/modules/sales/service';
import { ensureNoPendingFacts } from './guards';
import { editOrderInput, refundCancelInput } from './change-contracts';

const snapshot = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
async function previousChange(
  tx: Prisma.TransactionClient,
  actor: Actor,
  key: string,
  input: unknown,
  type: string,
) {
  const previous = await tx.orderChange.findUnique({ where: { id: key } });
  if (!previous) return null;
  if (
    previous.organizationId !== actor.organizationId ||
    previous.actorId !== actor.userId ||
    previous.type !== type
  )
    throw new BusinessError('Operação vinculada a outra conta ou finalidade.');
  sameRequest(previous.requestHash, input);
  return tx.sale.findFirstOrThrow({
    where: { id: previous.saleId, organizationId: actor.organizationId },
  });
}
export async function editOrder(actor: Actor, raw: unknown) {
  const input = editOrderInput.parse(raw);
  if (new Set(input.items.map((i) => i.productId)).size !== input.items.length)
    throw new BusinessError('Agrupe as quantidades de cada produto.');
  return atomic(async (tx) => {
    const previous = await previousChange(
      tx,
      actor,
      input.idempotencyKey,
      input,
      'EDIT',
    );
    if (previous) return previous;
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, organizationId: actor.organizationId },
      include: {
        items: true,
        payments: true,
        installments: true,
        fiscalDocument: true,
      },
    });
    if (!sale) throw new BusinessError('Pedido não encontrado.');
    if (sale.status !== 'CONFIRMED' || sale.fulfillmentStatus !== 'PENDING')
      throw new BusinessError(
        'Somente pedidos ainda não entregues podem ser editados.',
      );
    if (sale.version !== input.expectedVersion)
      throw new BusinessError(
        'O pedido mudou em outra tela. Atualize antes de editar.',
      );
    if (
      sale.fiscalDocument &&
      (sale.fiscalDocument.status !== 'PENDING' ||
        sale.fiscalDocument.activeRequestId)
    )
      throw new BusinessError(
        'Resolva a preparação fiscal antes de editar o pedido.',
      );
    await ensureNoPendingFacts(tx, actor, sale.id);
    if (
      !(await tx.customer.findFirst({
        where: {
          id: input.customerId,
          organizationId: actor.organizationId,
          active: true,
        },
      }))
    )
      throw new BusinessError('Cliente não encontrado.');
    if (sale.payments.length && input.customerId !== sale.customerId)
      throw new BusinessError(
        'Pedido com recebimentos não pode ser transferido a outro cliente.',
      );
    if (input.fulfillmentMode === 'DELIVERY' && !input.address.trim())
      throw new BusinessError('Informe o endereço de entrega.');
    const ids = [
      ...new Set([
        ...sale.items.map((i) => i.productId),
        ...input.items.map((i) => i.productId),
      ]),
    ].sort();
    const products = await tx.product.findMany({
      where: { organizationId: actor.organizationId, id: { in: ids } },
    });
    const items = input.items.map((item) => {
      const old = sale.items.find((i) => i.productId === item.productId),
        product = products.find((p) => p.id === item.productId);
      if (!product || (!product.active && item.quantity > (old?.quantity || 0)))
        throw new BusinessError(
          'Produto indisponível para acrescentar ao pedido.',
        );
      const price = old?.unitPrice || product.salePrice,
        cost = old?.unitCost || product.averageCost;
      return {
        ...item,
        productName: old?.productName || product.name,
        unitPrice: price,
        unitCost: cost,
        total: money(D(price.toString()).mul(item.quantity)),
      };
    });
    const subtotal = items.reduce((sum, i) => sum.plus(i.total), D(0)),
      total = subtotal.minus(input.discount);
    if (total.lt(0) || !total.eq(input.expectedTotal))
      throw new BusinessError(
        'O total mudou. Confira os valores antes de salvar.',
      );
    const received = netReceived(sale.payments),
      balance = total.minus(received);
    if (balance.lt(0))
      throw new BusinessError(
        'O novo total não pode ser menor que o valor já recebido.',
      );
    const parts = input.installments;
    if (parts.some((part) => D(part.amount).lte(0)))
      throw new BusinessError('Cada parcela precisa ser maior que zero.');
    if (
      parts.length &&
      !parts.reduce((sum, p) => sum.plus(p.amount), D(0)).eq(balance)
    )
      throw new BusinessError(
        'As parcelas precisam corresponder ao saldo ainda a receber.',
      );
    const version = sale.version + 1;
    await tx.orderChange.create({
      data: {
        id: input.idempotencyKey,
        organizationId: actor.organizationId,
        actorId: actor.userId,
        saleId: sale.id,
        type: 'EDIT',
        version,
        requestHash: hash(input),
        payload: snapshot(input),
        before: snapshot(sale),
      },
    });
    for (const productId of ids) {
      const before =
          sale.items.find((i) => i.productId === productId)?.quantity || 0,
        after = items.find((i) => i.productId === productId)?.quantity || 0;
      const delta = after - before;
      if (delta > 0) {
        const changed =
          await tx.$executeRaw`UPDATE "Product" SET "reserved" = "reserved" + ${delta}, "updatedAt" = NOW() WHERE "id" = ${productId} AND "organizationId" = ${actor.organizationId} AND "active" = true AND "stock" - "reserved" >= ${delta}`;
        if (changed !== 1)
          throw new BusinessError('Estoque insuficiente para esta alteração.');
      } else if (delta < 0) {
        const changed = await tx.product.updateMany({
          where: {
            id: productId,
            organizationId: actor.organizationId,
            reserved: { gte: -delta },
          },
          data: { reserved: { decrement: -delta } },
        });
        if (changed.count !== 1)
          throw new BusinessError('Reserva inconsistente. Confira o pedido.');
      }
    }
    await tx.saleItem.deleteMany({
      where: { saleId: sale.id, organizationId: actor.organizationId },
    });
    await tx.saleItem.createMany({
      data: items.map((i) => ({
        ...i,
        saleId: sale.id,
        organizationId: actor.organizationId,
      })),
    });
    await tx.installment.updateMany({
      where: {
        saleId: sale.id,
        organizationId: actor.organizationId,
        supersededAt: null,
      },
      data: { supersededAt: new Date() },
    });
    if (parts.length)
      await tx.installment.createMany({
        data: parts.map((p, index) => ({
          organizationId: actor.organizationId,
          saleId: sale.id,
          planVersion: version,
          position: index + 1,
          amount: p.amount,
          dueDate: p.dueDate,
        })),
      });
    const cost = items.reduce(
      (sum, i) => sum.plus(D(i.unitCost.toString()).mul(i.quantity)),
      D(0),
    );
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: {
        version,
        customerId: input.customerId,
        fulfillmentMode: input.fulfillmentMode,
        address: input.address,
        expectedDate: input.expectedDate || null,
        deliveryNotes: input.deliveryNotes,
        agreementNotes: input.agreementNotes,
        subtotal: money(subtotal),
        discount: input.discount,
        total: money(total),
        costTotal: money(cost),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'ORDER_EDIT',
        referenceId: sale.id,
        description: `Pedido atualizado: ${input.reason}`,
        amount: money(total),
      },
    });
    return updated;
  });
}

/** Registra dinheiro efetivamente devolvido e cancela integralmente na mesma transação. */
export async function refundAndCancel(actor: Actor, raw: unknown) {
  const input = refundCancelInput.parse(raw);
  return atomic(async (tx) => {
    const previous = await previousChange(
      tx,
      actor,
      input.idempotencyKey,
      input,
      'REFUND_CANCEL',
    );
    if (previous) return previous;
    const sale = await tx.sale.findFirst({
      where: { id: input.saleId, organizationId: actor.organizationId },
      include: { payments: true, items: true, installments: true },
    });
    if (!sale) throw new BusinessError('Pedido não encontrado.');
    if (sale.status !== 'CONFIRMED' || sale.version !== input.expectedVersion)
      throw new BusinessError(
        'O pedido mudou. Confira os dados antes de devolver.',
      );
    await ensureNoPendingFacts(tx, actor, sale.id);
    const received = netReceived(sale.payments);
    if (received.lte(0) || !received.eq(input.amount))
      throw new BusinessError(
        'Confirme a devolução integral do valor efetivamente recebido.',
      );
    await tx.orderChange.create({
      data: {
        id: input.idempotencyKey,
        organizationId: actor.organizationId,
        actorId: actor.userId,
        saleId: sale.id,
        type: 'REFUND_CANCEL',
        version: sale.version + 1,
        requestHash: hash(input),
        payload: snapshot(input),
        before: snapshot(sale),
      },
    });
    const refund = await tx.payment.create({
      data: {
        organizationId: actor.organizationId,
        saleId: sale.id,
        direction: 'OUT',
        method: input.method,
        amount: input.amount,
        description: `Reembolso integral: ${input.reason}`,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash(input),
      },
    });
    const cancelled = await cancelSaleInTransaction(tx, actor, {
      saleId: sale.id,
      reason: input.reason,
      itemsReturned: input.itemsReturned,
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'REFUND',
        referenceId: refund.id,
        description: 'Reembolso integral registrado no cancelamento',
        amount: input.amount,
      },
    });
    return cancelled;
  });
}
