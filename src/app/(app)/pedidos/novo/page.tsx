import { requireActor } from '@/modules/auth/server';
import { productOptions } from '@/modules/products/options';
import { db } from '@/lib/db';
import { PageTitle } from '@/components/ui';
import { OrderWizard } from '@/modules/orders/order-wizard';
export default async function NewOrder() {
  const actor = await requireActor();
  const [products, customers] = await Promise.all([
    productOptions(actor),
    db.customer.findMany({
      where: { organizationId: actor.organizationId, active: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
  ]);
  return (
    <>
      <PageTitle title="Novo pedido" />
      <OrderWizard
        key={`${actor.userId}:${actor.organizationId}`}
        scope={{ userId: actor.userId, organizationId: actor.organizationId }}
        products={products}
        customers={customers}
      />
    </>
  );
}
