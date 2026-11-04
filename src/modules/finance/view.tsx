import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import { db } from '@/lib/db';
import { brl, dateTime, D } from '@/lib/money';
import { Card, Table, Empty, Badge } from '@/components/ui';
import { PaymentForm } from '@/components/domain-forms';
import { netReceived } from './ledger';
export async function FinanceView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const skip = (query.page - 1) * 25;
  const [payments, sales, purchases] = await Promise.all([
    db.payment.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'desc' },
      take: 25,
      skip,
    }),
    db.sale.findMany({
      where: { organizationId, status: 'CONFIRMED' },
      include: { customer: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.purchase.findMany({
      where: { organizationId },
      include: { supplier: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  const saleOptions = sales
    .filter((s) => D(s.total.toString()).gt(netReceived(s.payments)))
    .map((s) => ({
      id: s.id,
      label: `${s.customer?.name || 'Sem cadastro'} · #${s.id.slice(0, 8)} · ${brl(
        D(s.total.toString()).minus(netReceived(s.payments)).toString(),
      )} pendentes`,
    }));
  const purchaseOptions = purchases
    .filter((p) =>
      D(p.total.toString()).gt(
        p.payments.reduce((s, x) => s.plus(x.amount.toString()), D(0)),
      ),
    )
    .map((p) => ({
      id: p.id,
      label: `${p.supplier.name} · #${p.id.slice(0, 8)} · ${brl(
        D(p.total.toString())
          .minus(p.payments.reduce((s, x) => s.plus(x.amount.toString()), D(0)))
          .toString(),
      )} pendentes`,
    }));
  return (
    <div>
      <Card>
        <div className="section-heading">
          <h2>Movimentações financeiras</h2>
          <div className="ux-actions">
            <ActionDialog title="Receber" trigger="Receber">
              <PaymentForm
                sales={saleOptions}
                purchases={purchaseOptions}
                initialKind="SALE"
              />
            </ActionDialog>
            <ActionDialog title="Pagar compra" trigger="Pagar compra">
              <PaymentForm
                sales={saleOptions}
                purchases={purchaseOptions}
                initialKind="PURCHASE"
              />
            </ActionDialog>
            <ActionDialog title="Registrar despesa" trigger="Registrar despesa">
              <PaymentForm
                sales={saleOptions}
                purchases={purchaseOptions}
                initialKind="EXPENSE"
              />
            </ActionDialog>
          </div>
        </div>
        {payments.length ? (
          <Table headers={['Data', 'Descrição', 'Tipo', 'Valor']}>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{dateTime(p.occurredAt)}</td>
                <td>{p.description}</td>
                <td>
                  <Badge>{p.direction === 'IN' ? 'Entrada' : 'Saída'}</Badge>
                </td>
                <td>{brl(p.amount.toString())}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            Nenhum dinheiro movimentado ainda. Compras e vendas a prazo não
            entram aqui até serem pagas.
          </Empty>
        )}
        <div className="notice">
          {saleOptions.length} vendas com saldo a receber ·{' '}
          {purchaseOptions.length} compras com saldo a pagar (até 200 registros
          recentes de cada tipo).
        </div>
      </Card>
    </div>
  );
}
