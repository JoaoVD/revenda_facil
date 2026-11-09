import Link from 'next/link';
import { PageTitle, Empty } from '@/components/ui';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { brl, dateTime, D } from '@/lib/money';
import {
  orderInclude,
  pendingBalance,
  fulfillmentLabel,
  isLate,
} from '@/modules/orders/queries';
import { isoToday, brDate } from '@/modules/orders/installments';
import {
  FilterBar,
  ItemCard,
  Pager,
  StatTiles,
  hrefWith,
  normalizeParams,
  paginate,
  pick,
  type Option,
} from '@/components/list-tools';

const BASE = '/pedidos';
const statuses: Option[] = [
  ['', 'Todos'],
  ['pendentes', 'A entregar/retirar'],
  ['concluidos', 'Concluídos'],
  ['cancelados', 'Cancelados'],
];
const payments: Option[] = [
  ['', 'Todos'],
  ['aberto', 'Com saldo'],
  ['atrasado', 'Atrasados'],
  ['pago', 'Pagos'],
];
const modes: Option[] = [
  ['', 'Todos'],
  ['DELIVERY', 'Entrega'],
  ['PICKUP', 'Retirada'],
  ['IMMEDIATE', 'Na hora'],
];

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor(),
    params = normalizeParams(await searchParams);
  const status = pick(params.status, statuses),
    payment = pick(params.pagamento, payments),
    mode = pick(params.modo, modes),
    q = (params.q || '').trim(),
    today = isoToday();
  const numeric = Number(params.page),
    requested = Number.isFinite(numeric) ? Math.floor(numeric) : 1;
  const sales = await db.sale.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(status === 'pendentes'
        ? { status: 'CONFIRMED', fulfillmentStatus: 'PENDING' }
        : status === 'concluidos'
          ? { status: 'CONFIRMED', fulfillmentStatus: 'COMPLETED' }
          : status === 'cancelados'
            ? { status: 'CANCELLED' }
            : {}),
      ...(mode ? { fulfillmentMode: mode } : {}),
      ...(q
        ? {
            OR: [
              { customer: { name: { contains: q, mode: 'insensitive' } } },
              {
                items: {
                  some: { productName: { contains: q, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  const rows = sales.map((s) => ({
    ...s,
    balance: pendingBalance(s),
    late: s.status === 'CONFIRMED' && isLate(s, today),
  }));
  const filtered = rows.filter((s) =>
    payment === 'aberto'
      ? s.balance.gt(0)
      : payment === 'atrasado'
        ? s.late && s.balance.gt(0)
        : payment === 'pago'
          ? s.status === 'CONFIRMED' && s.balance.lte(0)
          : true,
  );
  const page = paginate(filtered, requested);
  const pending = rows.filter(
      (s) => s.status === 'CONFIRMED' && s.fulfillmentStatus === 'PENDING',
    ).length,
    open = rows.filter((s) => s.balance.gt(0)),
    late = open.filter((s) => s.late).length;
  return (
    <>
      <PageTitle title="Pedidos">
        <Link className="button desktop-only" href="/pedidos/novo">
          + Novo pedido
        </Link>
      </PageTitle>
      <StatTiles
        items={[
          {
            label: 'A entregar/retirar',
            value: pending,
            tone: pending ? 'warn' : 'ok',
            href: hrefWith(BASE, {}, { status: 'pendentes' }),
            active: status === 'pendentes' && !payment,
          },
          {
            label: 'Saldo a receber',
            value: brl(open.reduce((sum, s) => sum.plus(s.balance), D(0))),
            hint: `${open.length} ${open.length === 1 ? 'pedido' : 'pedidos'}`,
            href: hrefWith(BASE, {}, { pagamento: 'aberto' }),
            active: payment === 'aberto' && !status,
          },
          {
            label: 'Com parcela atrasada',
            value: late,
            tone: late ? 'danger' : 'ok',
            href: hrefWith(BASE, {}, { pagamento: 'atrasado' }),
            active: payment === 'atrasado' && !status,
          },
        ]}
      />
      <FilterBar
        base={BASE}
        params={params}
        search="Buscar cliente ou produto"
        groups={[
          { name: 'status', label: 'Atendimento', options: statuses },
          { name: 'pagamento', label: 'Pagamento', options: payments },
          { name: 'modo', label: 'Tipo', options: modes },
        ]}
      />
      {page.items.length ? (
        <div className="card-grid">
          {page.items.map((s) => {
            const cancelled = s.status === 'CANCELLED',
              units = s.items.reduce((sum, i) => sum + i.quantity, 0),
              names = s.items.map((i) => i.productName);
            return (
              <ItemCard
                key={s.id}
                href={`/pedidos/${s.id}`}
                title={s.customer?.name || 'Sem cadastro'}
                subtitle={`${dateTime(s.createdAt)} · #${s.id.slice(0, 8)}`}
                value={brl(s.total.toString())}
                tone={
                  cancelled
                    ? 'muted'
                    : s.late && s.balance.gt(0)
                      ? 'danger'
                      : s.balance.gt(0)
                        ? 'warn'
                        : 'ok'
                }
                tag={
                  cancelled
                    ? 'Cancelado'
                    : s.balance.gt(0)
                      ? `${s.late ? 'Atrasado · ' : ''}Falta ${brl(s.balance)}`
                      : 'Pago'
                }
                facts={[
                  ['Atendimento', fulfillmentLabel(s)],
                  ['Previsão', s.expectedDate ? brDate(s.expectedDate) : '—'],
                  ['Itens', `${units} un.`],
                ]}
              >
                <p className="item-note" title={names.join(', ')}>
                  {names.slice(0, 3).join(', ')}
                  {names.length > 3 && ` e mais ${names.length - 3}`}
                </p>
              </ItemCard>
            );
          })}
        </div>
      ) : (
        <Empty>
          {rows.length || q || status || mode
            ? 'Nenhum pedido com esses filtros.'
            : 'Nenhum pedido ainda. Toque em “Pedido” para registrar o primeiro.'}
        </Empty>
      )}
      <Pager
        base={BASE}
        params={params}
        {...page}
        noun={['pedido', 'pedidos']}
      />
    </>
  );
}
