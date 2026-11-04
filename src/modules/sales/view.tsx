import { ViewTabs } from '@/components/view-tabs';
import type { ViewProps } from '@/modules/shared/view-types';
import { db } from '@/lib/db';
import { brl, dateTime, D } from '@/lib/money';
import { Card, Table, Empty, Badge } from '@/components/ui';
import { SalesTerminal, CancelForm } from '@/components/domain-forms';
import { productOptions } from '@/modules/products/options';
import { netReceived } from '@/modules/finance/ledger';
const statusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  ISSUED: 'Emitida · informada',
  AUTHORIZED: 'Autorizada · informada',
  REJECTED: 'Rejeitada · informada',
  CANCELLED: 'Cancelada',
  CONFIRMED: 'Confirmada',
};
export async function SalesView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const skip = (query.page - 1) * 25;
  const options = await productOptions(actor);
  const [customers, sales] = await Promise.all([
    db.customer.findMany({
      where: { organizationId, active: true },
      select: { id: true, name: true },
      take: 200,
      orderBy: { name: 'asc' },
    }),
    db.sale.findMany({
      where: { organizationId },
      include: { customer: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
      skip,
    }),
  ]);
  return (
    <ViewTabs
      primaryLabel="Nova venda"
      secondaryLabel="Histórico"
      primary={<SalesTerminal products={options} customers={customers} />}
      secondary={
        <Card>
          <h2>Vendas registradas</h2>
          {sales.length ? (
            <Table
              headers={[
                'Data',
                'Cliente',
                'Total',
                'A receber',
                'Situação',
                'Ações',
              ]}
            >
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>
                    {dateTime(s.createdAt)}
                    <small>#{s.id.slice(0, 8)}</small>
                  </td>
                  <td>{s.customer?.name || 'Sem cadastro'}</td>
                  <td>{brl(s.total.toString())}</td>
                  <td>
                    {s.status === 'CANCELLED'
                      ? '—'
                      : brl(
                          D(s.total.toString())
                            .minus(netReceived(s.payments))
                            .toString(),
                        )}
                  </td>
                  <td>
                    <Badge>{statusLabel[s.status]}</Badge>
                  </td>
                  <td>
                    {s.status === 'CONFIRMED' && (
                      <details className="ux-sale-details">
                        <summary>Detalhes da venda</summary>
                        <CancelForm saleId={s.id} />
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nenhuma venda registrada ainda.</Empty>
          )}
        </Card>
      }
    />
  );
}
