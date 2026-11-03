import Link from 'next/link';
import { db } from '@/lib/db';
import { D, brl } from '@/lib/money';
import { requireActor } from '@/modules/auth/server';
import { Card, PageTitle, Empty, Badge } from '@/components/ui';
import {
  orderInclude,
  pendingBalance,
  fulfillmentLabel,
} from '@/modules/orders/queries';
import { OrderReceipt } from '@/modules/orders/order-receipt';
export default async function Receivables({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const actor = await requireActor(),
    query = await searchParams;
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const all = await db.sale.findMany({
    where: {
      organizationId: actor.organizationId,
      status: 'CONFIRMED',
      ...(query.q
        ? { customer: { name: { contains: query.q, mode: 'insensitive' } } }
        : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const sales = all.filter(
    (s) =>
      pendingBalance(s).gt(0) &&
      (query.filter === 'late'
        ? s.installments.some(
            (p) =>
              p.dueDate &&
              p.dueDate < today &&
              D(p.received.toString()).lt(p.amount.toString()),
          )
        : query.filter === 'undated'
          ? !s.installments.length ||
            s.installments.some(
              (p) =>
                !p.dueDate && D(p.received.toString()).lt(p.amount.toString()),
            )
          : true),
  );
  return (
    <>
      <PageTitle
        title="Valores a receber"
        description="Acompanhe os combinados, mesmo depois da entrega."
      />
      <form className="inline-form">
        <input
          aria-label="Buscar cliente"
          placeholder="Buscar cliente"
          name="q"
          defaultValue={query.q}
        />
        <select
          aria-label="Filtro de recebíveis"
          name="filter"
          defaultValue={query.filter || ''}
        >
          <option value="">Em aberto</option>
          <option value="late">Atrasados</option>
          <option value="undated">Sem data</option>
        </select>
        <button className="small-button">Buscar</button>
      </form>
      <div className="order-card-list">
        {sales.map((s) => (
          <Card key={s.id}>
            <div className="section-heading">
              <h2>{s.customer?.name || 'Sem cadastro'}</h2>
              <Badge>{fulfillmentLabel(s)}</Badge>
            </div>
            <p>Saldo pendente</p>
            <strong className="receivable-value">
              {brl(pendingBalance(s))}
            </strong>
            <p>{s.items.map((i) => i.productName).join(' · ')}</p>
            <Link className="text-link" href={`/pedidos/${s.id}`}>
              Ver pedido e parcelas →
            </Link>
            <details className="receipt-panel">
              <summary>Registrar recebimento</summary>
              <OrderReceipt
                saleId={s.id}
                balance={pendingBalance(s).toFixed(2)}
              />
            </details>
          </Card>
        ))}
      </div>
      {!sales.length && <Empty>Nenhum saldo encontrado neste filtro.</Empty>}
      <p className="hint">
        Consulta limitada aos 500 pedidos mais antigos por busca. Cada
        recebimento atualiza o saldo; adiar a conferência não quita dívidas.
      </p>
    </>
  );
}
