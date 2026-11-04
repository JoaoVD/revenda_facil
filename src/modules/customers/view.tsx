import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import { db } from '@/lib/db';
import { brl, D } from '@/lib/money';
import { Card, Table, Empty } from '@/components/ui';
import { CustomerForm } from '@/components/domain-forms';
import { netReceived } from '@/modules/finance/ledger';
export async function CustomersView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const skip = (query.page - 1) * 25;
  const customers = await db.customer.findMany({
    where: {
      organizationId,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { document: { contains: query.q } },
            ],
          }
        : {}),
    },
    include: {
      sales: { where: { status: 'CONFIRMED' }, include: { payments: true } },
    },
    orderBy: { name: 'asc' },
    take: 25,
    skip,
  });
  return (
    <div>
      <Card>
        <div className="section-heading">
          <h2>Seus clientes</h2>
          <ActionDialog title="Novo cliente" trigger="Novo cliente">
            <CustomerForm />
          </ActionDialog>
        </div>
        <form className="inline-form search-form">
          <input
            aria-label="Pesquisar clientes"
            name="q"
            defaultValue={query.q}
            placeholder="Pesquisar nome, contato ou documento"
          />
          <button className="small-button">Buscar</button>
        </form>
        {customers.length ? (
          <Table headers={['Nome', 'Contato', 'Compras', 'A receber']}>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td>
                  {c.phone || '—'}
                  <small>{c.email}</small>
                </td>
                <td>{c.sales.length}</td>
                <td>
                  {brl(
                    c.sales
                      .reduce(
                        (s, v) =>
                          s
                            .plus(v.total.toString())
                            .minus(netReceived(v.payments)),
                        D(0),
                      )
                      .toString(),
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Cadastre clientes para acompanhar vendas a prazo.</Empty>
        )}
      </Card>
    </div>
  );
}
