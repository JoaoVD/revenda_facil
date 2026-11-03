import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import Link from 'next/link';
import { db } from '@/lib/db';
import { brl, dateTime, D } from '@/lib/money';
import { Card, Table, Empty } from '@/components/ui';
import { PurchaseForm } from '@/components/domain-forms';
import { productOptions } from '@/modules/products/options';
export async function PurchasesView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const skip = (query.page - 1) * 25;
  const options = await productOptions(actor);
  const purchases = await db.purchase.findMany({
    where: { organizationId },
    include: { supplier: true, payments: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
    skip,
  });
  return (
    <div>
      <Card>
        <div className="section-heading">
          <h2>Compras registradas</h2>
          <ActionDialog
            title="Receber mercadorias"
            trigger="Receber mercadorias"
          >
            {' '}
            {options.length ? (
              <PurchaseForm products={options} />
            ) : (
              <Empty>
                Primeiro, <Link href="/produtos">cadastre um produto</Link>.
              </Empty>
            )}
          </ActionDialog>
        </div>
        {purchases.length ? (
          <Table headers={['Data', 'Fornecedor', 'Total', 'A pagar']}>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td>{dateTime(p.date)}</td>
                <td>
                  {p.supplier.name}
                  <small>
                    {p.documentationStatus === 'NOT_PROVIDED'
                      ? 'Documentação não informada'
                      : 'Destinatário conferido; demais dados não validados'}
                  </small>
                </td>
                <td>{brl(p.total.toString())}</td>
                <td>
                  {brl(
                    D(p.total.toString())
                      .minus(
                        p.payments.reduce(
                          (s, x) => s.plus(x.amount.toString()),
                          D(0),
                        ),
                      )
                      .toString(),
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>As compras confirmadas aparecerão aqui.</Empty>
        )}
        <Link className="card-link" href="/financeiro">
          Registrar pagamento de uma compra →
        </Link>
      </Card>
    </div>
  );
}
