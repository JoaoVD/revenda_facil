import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import { db } from '@/lib/db';
import { brl, D, currentMonth, monthRange } from '@/lib/money';
import { Empty } from '@/components/ui';
import { PaymentForm } from '@/components/domain-forms';
import {
  FilterBar,
  ItemCard,
  Pager,
  PAGE_SIZE,
  StatTiles,
  hrefWith,
  pick,
  type Option,
} from '@/components/list-tools';
import { netReceived } from './ledger';

const BASE = '/financeiro';
const directions: Option[] = [
  ['', 'Tudo'],
  ['entradas', 'Entradas'],
  ['saidas', 'Saídas'],
];
const categories: Option[] = [
  ['', 'Todas'],
  ['vendas', 'Vendas'],
  ['compras', 'Compras'],
  ['despesas', 'Despesas'],
];
const methods: Option[] = [
  ['', 'Todos'],
  ['PIX', 'Pix'],
  ['CASH', 'Dinheiro'],
  ['CARD', 'Cartão'],
];
const methodLabel: Record<string, string> = {
  PIX: 'Pix',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  CREDIT: 'Crédito',
};
const day = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});
const time = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});
const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-15T12:00:00Z`));

export async function FinanceView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId,
    params = query.params,
    direction = pick(params.tipo, directions),
    category = pick(params.categoria, categories),
    method = pick(params.meio, methods),
    month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes || '')
      ? params.mes!
      : currentMonth(),
    q = (params.q || '').trim();
  const period = { organizationId, occurredAt: monthRange(month) };
  const where = {
    ...period,
    ...(direction
      ? { direction: direction === 'entradas' ? 'IN' : 'OUT' }
      : {}),
    ...(category === 'vendas'
      ? { saleId: { not: null } }
      : category === 'compras'
        ? { purchaseId: { not: null } }
        : category === 'despesas'
          ? { expenseId: { not: null } }
          : {}),
    ...(method ? { method } : {}),
    ...(q
      ? { description: { contains: q, mode: 'insensitive' as const } }
      : {}),
  };
  const [total, sums, sales, purchases] = await Promise.all([
    db.payment.count({ where }),
    // Resumo do mês inteiro, independente dos demais filtros.
    db.payment.groupBy({
      by: ['direction'],
      where: period,
      _sum: { amount: true },
    }),
    db.sale.findMany({
      where: { organizationId, status: 'CONFIRMED' },
      include: { customer: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.purchase.findMany({
      where: { organizationId },
      include: { supplier: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE)),
    page = Math.min(query.page, pageCount);
  const payments = await db.payment.findMany({
    where,
    include: {
      sale: { include: { customer: true } },
      purchase: { include: { supplier: true } },
    },
    orderBy: { occurredAt: 'desc' },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });
  const sum = (dir: string) =>
    D(sums.find((s) => s.direction === dir)?._sum.amount?.toString() || '0');
  const inflow = sum('IN'),
    outflow = sum('OUT'),
    balance = inflow.minus(outflow);

  const saleOptions = sales
    .filter((s) => D(s.total.toString()).gt(netReceived(s.payments)))
    .map((s) => ({
      id: s.id,
      label: `${s.customer?.name || 'Sem cadastro'} · #${s.id.slice(0, 8)} · ${brl(
        D(s.total.toString()).minus(netReceived(s.payments)).toString(),
      )} pendentes`,
    }));
  const purchaseOptions = purchases
    .filter((p) =>
      D(p.total.toString()).gt(
        p.payments.reduce((s, x) => s.plus(x.amount.toString()), D(0)),
      ),
    )
    .map((p) => ({
      id: p.id,
      label: `${p.supplier.name} · #${p.id.slice(0, 8)} · ${brl(
        D(p.total.toString())
          .minus(p.payments.reduce((s, x) => s.plus(x.amount.toString()), D(0)))
          .toString(),
      )} pendentes`,
    }));

  // Agrupa a página por dia, mantendo a ordem.
  const groups: { label: string; items: typeof payments }[] = [];
  for (const p of payments) {
    const label = day.format(p.occurredAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(p);
    else groups.push({ label, items: [p] });
  }

  return (
    <>
      <div className="ux-actions finance-actions">
        <ActionDialog title="Receber" trigger="Receber">
          <PaymentForm
            sales={saleOptions}
            purchases={purchaseOptions}
            initialKind="SALE"
          />
        </ActionDialog>
        <ActionDialog title="Pagar compra" trigger="Pagar compra">
          <PaymentForm
            sales={saleOptions}
            purchases={purchaseOptions}
            initialKind="PURCHASE"
          />
        </ActionDialog>
        <ActionDialog title="Registrar despesa" trigger="Registrar despesa">
          <PaymentForm
            sales={saleOptions}
            purchases={purchaseOptions}
            initialKind="EXPENSE"
          />
        </ActionDialog>
      </div>
      <StatTiles
        items={[
          {
            label: `Entradas · ${monthName(month)}`,
            value: brl(inflow),
            tone: 'ok',
            href: hrefWith(BASE, params, { tipo: 'entradas' }),
            active: direction === 'entradas',
          },
          {
            label: 'Saídas',
            value: brl(outflow),
            tone: 'warn',
            href: hrefWith(BASE, params, { tipo: 'saidas' }),
            active: direction === 'saidas',
          },
          {
            label: 'Saldo do mês',
            value: brl(balance),
            tone: balance.lt(0) ? 'danger' : 'ok',
          },
          {
            label: 'Pendências',
            value: `${saleOptions.length} a receber`,
            hint: `${purchaseOptions.length} ${purchaseOptions.length === 1 ? 'compra' : 'compras'} a pagar`,
          },
        ]}
      />
      <FilterBar
        base={BASE}
        params={params}
        search="Buscar descrição"
        extraNames={['mes']}
        extra={
          <input
            type="month"
            name="mes"
            aria-label="Mês"
            defaultValue={month}
          />
        }
        groups={[
          { name: 'tipo', label: 'Tipo', options: directions },
          { name: 'categoria', label: 'Categoria', options: categories },
          { name: 'meio', label: 'Meio', options: methods },
        ]}
      />
      {groups.length ? (
        groups.map((group) => (
          <section key={group.label} className="day-group">
            <h2>{group.label}</h2>
            <div className="card-grid">
              {group.items.map((p) => {
                const incoming = p.direction === 'IN';
                const kind = p.saleId
                  ? incoming
                    ? 'Venda'
                    : 'Devolução de venda'
                  : p.purchaseId
                    ? 'Compra'
                    : p.expenseId
                      ? 'Despesa'
                      : 'Lançamento';
                const who =
                  p.sale?.customer?.name || p.purchase?.supplier.name || '';
                return (
                  <ItemCard
                    key={p.id}
                    title={p.description}
                    subtitle={[time.format(p.occurredAt), who]
                      .filter(Boolean)
                      .join(' · ')}
                    value={`${incoming ? '+' : '−'} ${brl(p.amount.toString())}`}
                    tone={incoming ? 'in' : 'out'}
                    tag={`${kind} · ${methodLabel[p.method] || p.method}`}
                    href={
                      p.saleId
                        ? `/pedidos/${p.saleId}`
                        : p.purchaseId
                          ? `/compras?q=${encodeURIComponent(who)}`
                          : undefined
                    }
                  />
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <Empty>
          Nenhuma movimentação em {monthName(month)} com esses filtros. Compras
          e vendas a prazo só entram aqui quando são pagas.
        </Empty>
      )}
      <Pager
        base={BASE}
        params={params}
        page={page}
        pageCount={pageCount}
        total={total}
        noun={['lançamento', 'lançamentos']}
      />
    </>
  );
}
