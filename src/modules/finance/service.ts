import { paymentInput, type Actor } from '@/modules/shared/contracts';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import { BusinessError } from '@/lib/errors';
import { D } from '@/lib/money';
import { netReceived } from './ledger';
export async function recordPayment(actor: Actor, raw: unknown) {
  const input = paymentInput.parse(raw);
  if (D(input.amount).lte(0))
    throw new BusinessError('Informe um valor maior que zero.');
  return atomic(async (tx) => {
    const existing = await tx.payment.findUnique({
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
    let expenseId: string | undefined;
    if (input.kind === 'EXPENSE') {
      const expense = await tx.expense.create({
        data: {
          organizationId: actor.organizationId,
          description: input.description,
          amount: input.amount,
        },
      });
      expenseId = expense.id;
    } else {
      if (!input.referenceId)
        throw new BusinessError('Escolha a venda ou compra.');
      const record =
        input.kind === 'SALE'
          ? await tx.sale.findFirst({
              where: {
                id: input.referenceId,
                organizationId: actor.organizationId,
                status: 'CONFIRMED',
              },
              include: { payments: true },
            })
          : await tx.purchase.findFirst({
              where: {
                id: input.referenceId,
                organizationId: actor.organizationId,
              },
              include: { payments: true },
            });
      if (!record) throw new BusinessError('Registro não encontrado.');
      const paid =
        input.kind === 'SALE'
          ? netReceived(record.payments)
          : record.payments.reduce((s, p) => s.plus(p.amount.toString()), D(0));
      if (paid.plus(input.amount).gt(record.total.toString()))
        throw new BusinessError('O valor ultrapassa o saldo pendente.');
    }
    const payment = await tx.payment.create({
      data: {
        organizationId: actor.organizationId,
        saleId: input.kind === 'SALE' ? input.referenceId : undefined,
        purchaseId: input.kind === 'PURCHASE' ? input.referenceId : undefined,
        expenseId,
        direction: input.kind === 'SALE' ? 'IN' : 'OUT',
        method: input.method,
        amount: input.amount,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        requestHash: hash(input),
      },
    });
    if (input.kind === 'SALE') {
      let remaining = D(input.amount);
      const parts = await tx.installment.findMany({
        where: {
          organizationId: actor.organizationId,
          saleId: input.referenceId,
          supersededAt: null,
        },
        orderBy: { position: 'asc' },
      });
      for (const part of parts) {
        const balance = D(part.amount.toString()).minus(
          part.received.toString(),
        );
        const applied = remaining.lt(balance) ? remaining : balance;
        if (applied.gt(0))
          await tx.installment.update({
            where: { id: part.id },
            data: { received: { increment: applied.toFixed(2) } },
          });
        remaining = remaining.minus(applied);
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: input.kind === 'SALE' ? 'RECEIPT' : 'PAYMENT',
        description: input.description,
        referenceId: payment.id,
        amount: input.amount,
      },
    });
    return payment;
  });
}
