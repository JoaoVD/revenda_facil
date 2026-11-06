import Link from 'next/link';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { D, brl } from '@/lib/money';
import { OrderCards } from '@/modules/orders/order-cards';
import { orderInclude, orders, pendingBalance } from '@/modules/orders/queries';

const tabs = [
  ['today', 'Hoje', '/'],
  ['pending', 'Pendentes', '/?filter=pending'],
  ['all', 'Todos', '/?filter=all'],
] as const;

export default async function MyDay({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const actor = await requireActor(),
    query = await searchParams;
  const filter =
    query.filter === 'pending' || query.filter === 'all'
      ? query.filter
      : 'today';
  const parsed = Number(query.page),
    page = Number.isFinite(parsed)
      ? Math.max(1, Math.min(10000, Math.floor(parsed)))
      : 1;
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const sales =
    filter === 'all'
      ? await orders(actor, page)
      : await db.sale.findMany({
          where: {
            organizationId: actor.organizationId,
            status: 'CONFIRMED',
            ...(filter === 'pending'
              ? { fulfillmentStatus: 'PENDING' }
              : { expectedDate: today }),
          },
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
  const open = sales.filter(
    (s) => s.status === 'CONFIRMED' && s.fulfillmentStatus === 'PENDING',
  ).length;
  const toReceive = sales
    .filter((s) => s.status === 'CONFIRMED')
    .reduce((sum, s) => sum.plus(pendingBalance(s)), D(0));
  const summary =
    filter === 'today'
      ? `${open} ${open === 1 ? 'atendimento' : 'atendimentos'} para hoje`
      : filter === 'pending'
        ? `${open} ${open === 1 ? 'atendimento pendente' : 'atendimentos pendentes'}`
        : `Página ${page}`;
  return (
    <>
      <div className="page-title day-head">
        <div>
          <h1 className="greeting">
            Olá, {actor.organization.ownerName.split(' ')[0]}
          </h1>
          <p>
            {summary}
            {filter !== 'all' && toReceive.gt(0) && (
              <>
                {' · '}
                <strong>{brl(toReceive)}</strong> a receber
              </>
            )}
          </p>
        </div>
        <Link className="button desktop-only" href="/pedidos/novo">
          + Novo pedido
        </Link>
      </div>
      <nav className="day-filters" aria-label="Filtrar pedidos">
        {tabs.map(([key, label, href]) => (
          <Link
            key={key}
            prefetch={false}
            href={href}
            aria-current={filter === key ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <OrderCards
        sales={sales}
        empty={
          filter === 'today'
            ? `Nenhum atendimento previsto para ${today.split('-').reverse().join('/')}.`
            : filter === 'pending'
              ? 'Nenhuma entrega ou retirada pendente.'
              : 'Nenhum pedido nesta página.'
        }
      />
      {filter === 'all' && (
        <nav className="pagination" aria-label="Páginas">
          <Link
            aria-disabled={page <= 1}
            aria-label="Página anterior"
            href={`/?filter=all&page=${Math.max(1, page - 1)}`}
          >
            ‹
          </Link>
          <span>Página {page}</span>
          <Link
            aria-label="Próxima página"
            href={`/?filter=all&page=${page + 1}`}
          >
            ›
          </Link>
        </nav>
      )}
    </>
  );
}
