import { db } from '@/lib/db';
import { D } from '@/lib/money';
import { netReceived } from '@/modules/finance/ledger';
import type { Actor } from '@/modules/shared/contracts';
export const orderInclude = {
  customer: true,
  items: true,
  payments: true,
  installments: {
    where: { supersededAt: null },
    orderBy: { position: 'asc' as const },
  },
};
export const pendingBalance = (sale: {
  total: { toString(): string };
  status?: string;
  payments: { amount: { toString(): string }; direction?: string }[];
}) =>
  sale.status === 'CANCELLED'
    ? D(0)
    : D(sale.total.toString()).minus(netReceived(sale.payments));
/** Parcela vencida (antes de hoje, AAAA-MM-DD) e ainda não quitada. */
export const isLate = (
  sale: {
    installments: {
      dueDate: string | null;
      amount: { toString(): string };
      received: { toString(): string };
    }[];
  },
  today: string,
) =>
  sale.installments.some(
    (p) =>
      p.dueDate &&
      p.dueDate < today &&
      D(p.received.toString()).lt(p.amount.toString()),
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
