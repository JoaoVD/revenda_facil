import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { Card, PageTitle } from '@/components/ui';
import { EditOrderForm } from '@/modules/orders/edit-form';
import { orderInclude } from '@/modules/orders/queries';
import { netReceived } from '@/modules/finance/ledger';
import { D } from '@/lib/money';
export default async function EditOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor(),
    { id } = await params;
  const sale = await db.sale.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: orderInclude,
  });
  if (!sale) notFound();
  const editable =
    sale.status === 'CONFIRMED' && sale.fulfillmentStatus === 'PENDING';
  const [products, customers] = await Promise.all([
    db.product.findMany({
      where: { organizationId: actor.organizationId, active: true },
      select: {
        id: true,
        name: true,
        salePrice: true,
        stock: true,
        reserved: true,
      },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
    db.customer.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ active: true }, { id: sale.customerId || '' }],
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
  ]);
  return (
    <>
      <Link className="text-link" href={`/pedidos/${sale.id}`}>
        ← Voltar ao pedido
      </Link>
      <PageTitle
        title="Editar pedido pendente"
        description="Revise produtos, atendimento e combinado sem perder o histórico."
      />
      <Card>
        {editable ? (
          <EditOrderForm
            key={`${sale.id}:${sale.version}`}
            order={{
              id: sale.id,
              version: sale.version,
              customerId: sale.customerId || '',
              fulfillmentMode: sale.fulfillmentMode,
              address: sale.address || '',
              expectedDate: sale.expectedDate || '',
              deliveryNotes: sale.deliveryNotes || '',
              agreementNotes: sale.agreementNotes || '',
              discount: sale.discount.toString(),
              received: netReceived(sale.payments).toFixed(2),
              items: sale.items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.unitPrice.toString(),
                name: i.productName,
              })),
              installments: sale.installments
                .filter((p) => D(p.amount.toString()).gt(p.received.toString()))
                .map((p) => ({
                  amount: D(p.amount.toString())
                    .minus(p.received.toString())
                    .toFixed(2),
                  dueDate: p.dueDate || '',
                })),
            }}
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              price:
                sale.items
                  .find((i) => i.productId === p.id)
                  ?.unitPrice.toString() || p.salePrice.toString(),
              stock:
                p.stock -
                p.reserved +
                (sale.items.find((i) => i.productId === p.id)?.quantity || 0),
            }))}
            customers={customers}
          />
        ) : (
          <p>
            Este pedido já foi concluído ou cancelado. A edição não está
            disponível.
          </p>
        )}
      </Card>
    </>
  );
}
