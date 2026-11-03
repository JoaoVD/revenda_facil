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
      <PageTitle
        title="Pedidos e vendas"
        description="Atendimento e recebimento, cada um no seu tempo."
      >
        <Link className="button" href="/pedidos/novo">
          + Novo pedido
        </Link>
      </PageTitle>
      <OrderCards sales={await orders(actor, page)} />
      <div className="pagination">
        <Link href={`/pedidos?page=${Math.max(1, page - 1)}`}>Anterior</Link>
        <span>Página {page} · 25 registros</span>
        <Link href={`/pedidos?page=${page + 1}`}>Próxima</Link>
      </div>
    </>
  );
}
