import { db } from '@/lib/db';
import { D } from '@/lib/money';
import type { Actor } from '@/modules/shared/contracts';
export const orderInclude = {
  customer: true,
  items: true,
  payments: true,
  installments: { orderBy: { position: 'asc' as const } },
};
export const pendingBalance = (sale: {
  total: { toString(): string };
  payments: { amount: { toString(): string } }[];
}) =>
  D(sale.total.toString()).minus(
    sale.payments.reduce((sum, p) => sum.plus(p.amount.toString()), D(0)),
  );
export async function orders(actor: Actor, page = 1) {
  return db.sale.findMany({
    where: { organizationId: actor.organizationId },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 25,
    skip: (page - 1) * 25,
  });
}
export type OrderRecord = Awaited<ReturnType<typeof orders>>[number];
export function fulfillmentLabel(
  sale: Pick<OrderRecord, 'status' | 'fulfillmentStatus' | 'fulfillmentMode'>,
) {
  if (sale.status === 'CANCELLED') return 'Cancelado';
  if (sale.fulfillmentStatus === 'COMPLETED')
    return sale.fulfillmentMode === 'PICKUP' ? 'Retirado' : 'Entregue';
  return sale.fulfillmentMode === 'PICKUP'
    ? 'Retirada pendente'
    : 'Entrega pendente';
}
