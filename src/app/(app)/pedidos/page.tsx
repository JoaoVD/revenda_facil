import Link from 'next/link';
import { PageTitle } from '@/components/ui';
import { requireActor } from '@/modules/auth/server';
import { orders } from '@/modules/orders/queries';
import { OrderCards } from '@/modules/orders/order-cards';
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await requireActor(),
    query = await searchParams;
  const parsed = Number(query.page),
    page = Number.isFinite(parsed)
      ? Math.max(1, Math.min(10000, Math.floor(parsed)))
      : 1;
  return (
    <>
      <PageTitle title="Pedidos">
        <Link className="button desktop-only" href="/pedidos/novo">
          + Novo pedido
        </Link>
      </PageTitle>
      <OrderCards sales={await orders(actor, page)} />
      <nav className="pagination" aria-label="Páginas">
        <Link
          aria-disabled={page <= 1}
          aria-label="Página anterior"
          href={`/pedidos?page=${Math.max(1, page - 1)}`}
        >
          ‹
        </Link>
        <span>Página {page}</span>
        <Link aria-label="Próxima página" href={`/pedidos?page=${page + 1}`}>
          ›
        </Link>
      </nav>
    </>
  );
}
