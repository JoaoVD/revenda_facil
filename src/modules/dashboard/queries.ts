import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { D, monthRange } from '@/lib/money';
import type { Actor } from '@/modules/shared/contracts';
export async function dashboard(actor: Actor, month: string, type?: string) {
  const organizationId = actor.organizationId,
    range = monthRange(month);
  return db.$transaction(
    async (tx) => {
      const [
        payments,
        sales,
        stock,
        recentSales,
        entries,
        history,
        cancelled,
        expenses,
      ] = await Promise.all([
        tx.payment.findMany({ where: { organizationId, occurredAt: range } }),
        tx.sale.findMany({ where: { organizationId, completedAt: range } }),
        tx.product.aggregate({
          where: { organizationId },
          _sum: { stock: true, reserved: true },
        }),
        tx.saleItem.findMany({
          where: {
            organizationId,
            sale: { completedAt: range, status: 'CONFIRMED' },
          },
          include: { sale: true },
          orderBy: { sale: { completedAt: 'desc' } },
          take: 5,
        }),
        tx.inventoryMovement.findMany({
          where: { organizationId, type: 'PURCHASE', createdAt: range },
          include: { product: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        tx.auditLog.findMany({
          where: {
            organizationId,
            createdAt: range,
            ...(type ? { type } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.sale.findMany({
          where: {
            organizationId,
            cancelledAt: range,
            completedAt: { not: null },
            NOT: { completedAt: range },
          },
        }),
        tx.expense.findMany({
          where: { organizationId, saleId: { not: null }, createdAt: range },
        }),
      ]);
      const sum = (direction: string) =>
        payments
          .filter((p) => p.direction === direction)
          .reduce((s, p) => s.plus(p.amount.toString()), D(0));
      // Faturamento: vendas concluídas no mês, com o mesmo estorno do resultado.
      let revenue = sales.reduce((s, v) => s.plus(v.total.toString()), D(0));
      let profit = sales.reduce(
        (s, v) => s.plus(D(v.total.toString()).minus(v.costTotal.toString())),
        D(0),
      );
      // Estorna resultado no mês do cancelamento, preservando meses anteriores.
      const reversals = [
        ...sales.filter(
          (s) =>
            s.cancelledAt &&
            s.cancelledAt >= range.gte &&
            s.cancelledAt < range.lt,
        ),
        ...cancelled,
      ];
      for (const sale of reversals)
        revenue = revenue.minus(sale.total.toString());
      for (const sale of reversals)
        profit = profit.minus(
          D(sale.total.toString()).minus(sale.costTotal.toString()),
        );
      for (const expense of expenses)
        profit = profit.minus(expense.amount.toString());
      return {
        incoming: sum('IN').toFixed(2),
        outgoing: sum('OUT').toFixed(2),
        stock: (stock._sum.stock ?? 0) - (stock._sum.reserved ?? 0),
        physicalStock: stock._sum.stock ?? 0,
        reservedStock: stock._sum.reserved ?? 0,
        revenue: revenue.toFixed(2),
        profit: profit.toFixed(2),
        recentSales,
        entries,
        history,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
