import Link from 'next/link';
import { Package, UserRound, ArrowRight, Wallet } from 'lucide-react';
import { Card, Badge, Empty } from '@/components/ui';
import { brl } from '@/lib/money';
import { pendingBalance, fulfillmentLabel, type OrderRecord } from './queries';
export function OrderCards({ sales }: { sales: OrderRecord[] }) {
  return (
    <div className="order-card-list">
      {!sales.length && <Empty>Nenhum pedido neste filtro.</Empty>}
      {sales.map((s) => {
        const balance = pendingBalance(s);
        return (
          <Card key={s.id} className="day-order">
            <div className="day-customer">
              <span className="customer-icon">
                <UserRound size={22} />
              </span>
              <div>
                <h2>{s.customer?.name || 'Sem cadastro'}</h2>
                <p>
                  {s.items.reduce((sum, i) => sum + i.quantity, 0)} unidades ·{' '}
                  {brl(s.total.toString())}
                </p>
              </div>
            </div>
            <p className="order-status">
              <Package size={18} />
              {fulfillmentLabel(s)}
              {s.expectedDate &&
                ` · ${s.expectedDate.split('-').reverse().join('/')}`}
            </p>
            <div className="section-heading">
              <Badge>
                <Wallet size={16} />
                {s.status === 'CANCELLED'
                  ? 'Cancelado'
                  : balance.gt(0)
                    ? `Falta receber ${brl(balance)}`
                    : 'Pago'}
              </Badge>
              <Link className="text-link" href={`/pedidos/${s.id}`}>
                Ver pedido <ArrowRight size={17} />
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
