import Link from 'next/link';
import { Empty } from '@/components/ui';
import { brl } from '@/lib/money';
import { pendingBalance, fulfillmentLabel, type OrderRecord } from './queries';
export function OrderCards({
  sales,
  empty = 'Nenhum pedido aqui.',
}: {
  sales: OrderRecord[];
  empty?: string;
}) {
  if (!sales.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="order-card-list">
      {sales.map((s) => {
        const balance = pendingBalance(s),
          cancelled = s.status === 'CANCELLED',
          units = s.items.reduce((sum, i) => sum + i.quantity, 0);
        return (
          <li key={s.id}>
            <Link
              prefetch={false}
              href={`/pedidos/${s.id}`}
              className="order-row"
              data-state={
                cancelled ? 'cancelled' : balance.gt(0) ? 'open' : 'paid'
              }
            >
              <span className="order-row-main">
                <strong>{s.customer?.name || 'Sem cadastro'}</strong>
                <span className="order-row-total">
                  {brl(s.total.toString())}
                </span>
              </span>
              <span className="order-row-meta">
                <span>
                  {fulfillmentLabel(s)}
                  {s.expectedDate &&
                    ` · ${s.expectedDate.split('-').reverse().join('/')}`}
                  {` · ${units} un.`}
                </span>
                <span className="order-row-balance">
                  {cancelled
                    ? 'Cancelado'
                    : balance.gt(0)
                      ? `Falta ${brl(balance)}`
                      : 'Pago'}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
