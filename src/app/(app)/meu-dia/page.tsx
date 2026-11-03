import Link from 'next/link';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { PageTitle } from '@/components/ui';
import { OrderCards } from '@/modules/orders/order-cards';
import { orderInclude } from '@/modules/orders/queries';
export default async function MyDay({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireActor(),
    { filter } = await searchParams;
  const pending = filter === 'pending';
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const sales = await db.sale.findMany({
    where: {
      organizationId: actor.organizationId,
      status: 'CONFIRMED',
      ...(pending ? { fulfillmentStatus: 'PENDING' } : { expectedDate: today }),
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <>
      <PageTitle
        title={`Olá, ${actor.organization.ownerName.split(' ')[0]}!`}
        description="Vamos organizar seu dia?"
      />
      <Link className="button day-new" href="/pedidos/novo">
        + Novo pedido
      </Link>
      <nav className="day-filters" aria-label="Pedidos do meu dia">
        <Link aria-current={!pending ? 'page' : undefined} href="/meu-dia">
          Hoje
        </Link>
        <Link
          aria-current={pending ? 'page' : undefined}
          href="/meu-dia?filter=pending"
        >
          Pendentes
        </Link>
      </nav>
      <OrderCards sales={sales} />
      <p className="hint">
        Hoje mostra previsões para {today.split('-').reverse().join('/')}.
        Pendentes mostra até 100 entregas e retiradas aguardando conclusão.
        Todos os pedidos estão em Pedidos.
      </p>
    </>
  );
}
