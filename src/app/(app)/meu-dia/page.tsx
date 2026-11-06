import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { D, brl, currentMonth, dateTime } from '@/lib/money';
import { Card, Empty } from '@/components/ui';
import { OrderCards } from '@/modules/orders/order-cards';
import {
  isLate,
  orderInclude,
  orders,
  pendingBalance,
} from '@/modules/orders/queries';
import { dashboard } from '@/modules/dashboard/queries';
import { MonthMetrics } from '@/modules/dashboard/month-metrics';
import { isPhoneRequest } from '@/lib/device';

const tabs = [
  ['today', 'Hoje', ''],
  ['pending', 'Pendentes', 'pending'],
  ['all', 'Todos', 'all'],
] as const;

export default async function MyDay({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string; month?: string }>;
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
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month || '')
    ? query.month!
    : currentMonth();
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  // No celular os números do mês e o painel lateral ficam ocultos:
  // não vale a pena buscá-los.
  const wide = !(await isPhoneRequest());
  const [sales, metrics, confirmed] = await Promise.all([
    filter === 'all'
      ? orders(actor, page)
      : db.sale.findMany({
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
        }),
    wide ? dashboard(actor, month) : null,
    // Mesma base da tela Receber: até 500 pedidos confirmados.
    wide
      ? db.sale.findMany({
          where: { organizationId: actor.organizationId, status: 'CONFIRMED' },
          include: { payments: true, installments: orderInclude.installments },
          orderBy: { createdAt: 'asc' },
          take: 500,
        })
      : [],
  ]);
  const open = sales.filter(
    (s) => s.status === 'CONFIRMED' && s.fulfillmentStatus === 'PENDING',
  ).length;
  const toReceive = sales
    .filter((s) => s.status === 'CONFIRMED')
    .reduce((sum, s) => sum.plus(pendingBalance(s)), D(0));
  const owing = confirmed.filter((s) => pendingBalance(s).gt(0));
  const owingTotal = owing.reduce(
    (sum, s) => sum.plus(pendingBalance(s)),
    D(0),
  );
  const late = owing.filter((s) => isLate(s, today)).length;
  const summary =
    filter === 'today'
      ? `${open} ${open === 1 ? 'atendimento' : 'atendimentos'} para hoje`
      : filter === 'pending'
        ? `${open} ${open === 1 ? 'atendimento pendente' : 'atendimentos pendentes'}`
        : `Página ${page}`;
  const link = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== '') search.set(key, String(value));
    if (query.month) search.set('month', month);
    const text = search.toString();
    return text ? `/?${text}` : '/';
  };
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
        {metrics && (
          <form className="period-bar desktop-only">
            {filter !== 'today' && (
              <input type="hidden" name="filter" value={filter} />
            )}
            <label>
              Mês{' '}
              <input
                aria-label="Mês dos números"
                type="month"
                name="month"
                defaultValue={month}
              />
            </label>
            <button className="small-button">Ver</button>
          </form>
        )}
      </div>
      {metrics && (
        <div className="desktop-block">
          <MonthMetrics data={metrics} />
        </div>
      )}
      <div className="day-grid">
        <section className="day-main" aria-label="Atendimentos">
          <nav className="day-filters" aria-label="Filtrar pedidos">
            {tabs.map(([key, label, value]) => (
              <Link
                key={key}
                prefetch={false}
                href={link({ filter: value })}
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
                href={link({ filter: 'all', page: Math.max(1, page - 1) })}
              >
                ‹
              </Link>
              <span>Página {page}</span>
              <Link
                aria-label="Próxima página"
                href={link({ filter: 'all', page: page + 1 })}
              >
                ›
              </Link>
            </nav>
          )}
        </section>
        {metrics && (
          <aside className="day-side desktop-block" aria-label="Resumo do dia">
            <Card className="side-panel">
              <h2>A receber</h2>
              <strong className="side-value">{brl(owingTotal)}</strong>
              <p>
                {owing.length} {owing.length === 1 ? 'pedido' : 'pedidos'} em
                aberto
                {late > 0 && (
                  <>
                    {' · '}
                    <span className="late">
                      {late} {late === 1 ? 'atrasado' : 'atrasados'}
                    </span>
                  </>
                )}
              </p>
              <Link className="card-link" href="/receber">
                Ver valores a receber <ArrowRight size={16} />
              </Link>
            </Card>
            <Card className="side-panel">
              <h2>Últimas vendas</h2>
              {metrics.recentSales.length ? (
                <ul className="side-list">
                  {metrics.recentSales.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.productName}</strong>
                        <small>
                          {item.quantity} un. · {dateTime(item.sale.createdAt)}
                        </small>
                      </span>
                      <strong>{brl(item.total.toString())}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nenhuma venda concluída neste mês.</Empty>
              )}
              <Link className="card-link" href={`/dashboard?month=${month}`}>
                Ver resumo do mês <ArrowRight size={16} />
              </Link>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
