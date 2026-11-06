import Link from 'next/link';
import { db } from '@/lib/db';
import { D, brl } from '@/lib/money';
import { requireActor } from '@/modules/auth/server';
import { PageTitle, Empty } from '@/components/ui';
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
  const total = sales.reduce((sum, s) => sum.plus(pendingBalance(s)), D(0));
  const filters = [
    ['', 'Em aberto'],
    ['late', 'Atrasados'],
    ['undated', 'Sem data'],
  ] as const;
  const current =
    query.filter === 'late' || query.filter === 'undated' ? query.filter : '';
  const href = (filter: string) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (filter) params.set('filter', filter);
    const search = params.toString();
    return search ? `/receber?${search}` : '/receber';
  };
  return (
    <>
      <PageTitle title="Receber">
        <p className="receivable-total">
          <small>Total em aberto</small>
          <strong>{brl(total)}</strong>
        </p>
      </PageTitle>
      <form className="search-row" role="search">
        {current && <input type="hidden" name="filter" value={current} />}
        <input
          aria-label="Buscar cliente"
          placeholder="Buscar cliente"
          type="search"
          name="q"
          defaultValue={query.q}
        />
        <button className="small-button">Buscar</button>
      </form>
      <nav className="chips" aria-label="Filtrar valores a receber">
        {filters.map(([key, label]) => (
          <Link
            key={key || 'open'}
            prefetch={false}
            href={href(key)}
            aria-current={current === key ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {sales.length ? (
        <ul className="receivable-list">
          {sales.map((s) => (
            <li key={s.id} className="card receivable">
              <div className="receivable-head">
                <Link prefetch={false} href={`/pedidos/${s.id}`}>
                  <strong>{s.customer?.name || 'Sem cadastro'}</strong>
                  <small>
                    {fulfillmentLabel(s)} ·{' '}
                    {s.items.map((i) => i.productName).join(', ')}
                  </small>
                </Link>
                <strong className="receivable-value">
                  {brl(pendingBalance(s))}
                </strong>
              </div>
              <details className="receipt-panel">
                <summary>Registrar recebimento</summary>
                <OrderReceipt
                  saleId={s.id}
                  balance={pendingBalance(s).toFixed(2)}
                />
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhum valor a receber neste filtro.</Empty>
      )}
    </>
  );
}
