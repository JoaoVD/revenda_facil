import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { D, brl } from '@/lib/money';
import { requireActor } from '@/modules/auth/server';
import { PageTitle, Empty } from '@/components/ui';
import {
  orderInclude,
  pendingBalance,
  isLate,
  fulfillmentLabel,
} from '@/modules/orders/queries';
import { OrderReceipt } from '@/modules/orders/order-receipt';
import { brDate, nextDue } from '@/modules/orders/installments';
import { firstName, whatsappLink } from '@/lib/whatsapp';

function chargeMessage(
  name: string | undefined,
  amount: string,
  items: string,
  due: { date: string; lateDays: number } | null,
) {
  const hello = firstName(name)
    ? `Olá, ${firstName(name)}! Tudo bem?`
    : 'Olá! Tudo bem?';
  const when = due
    ? due.lateDays > 0
      ? `, que venceu em ${brDate(due.date)}`
      : `, com vencimento em ${brDate(due.date)}`
    : '';
  return `${hello} Passando para lembrar do valor de ${amount} referente a ${items}${when}. Se precisar, posso enviar a chave Pix. Agradeço desde já!`;
}
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
        ? isLate(s, today)
        : query.filter === 'undated'
          ? !s.installments.length ||
            s.installments.some(
              (p) =>
                !p.dueDate && D(p.received.toString()).lt(p.amount.toString()),
            )
          : true),
  );
  const due = new Map(sales.map((s) => [s.id, nextDue(s.installments, today)]));
  sales.sort((a, b) => {
    const x = due.get(a.id),
      y = due.get(b.id);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return x.date.localeCompare(y.date);
  });
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
                  <DueTag due={due.get(s.id) ?? null} today={today} />
                </Link>
                <strong className="receivable-value">
                  {brl(pendingBalance(s))}
                </strong>
              </div>
              {(() => {
                const link = whatsappLink(
                  s.customer?.phone,
                  chargeMessage(
                    s.customer?.name,
                    brl(pendingBalance(s)),
                    s.items.map((i) => i.productName).join(', '),
                    due.get(s.id) ?? null,
                  ),
                );
                return (
                  link && (
                    <div className="quick-picks">
                      <a
                        className="whatsapp"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle size={16} />
                        Cobrar no WhatsApp
                      </a>
                    </div>
                  )
                );
              })()}
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

function DueTag({
  due,
  today,
}: {
  due: { date: string; lateDays: number } | null;
  today: string;
}) {
  if (!due) return <span className="due-tag">Sem data combinada</span>;
  const late = due.lateDays > 0;
  return (
    <span className="due-tag" data-late={late}>
      {late
        ? `Atrasado há ${due.lateDays} ${due.lateDays === 1 ? 'dia' : 'dias'} · venceu ${brDate(due.date)}`
        : due.date === today
          ? 'Vence hoje'
          : `Próxima parcela em ${brDate(due.date)}`}
    </span>
  );
}
