import type { ViewProps } from '@/modules/shared/view-types';
import Link from 'next/link';
import { db } from '@/lib/db';
import { brl, dateTime, D } from '@/lib/money';
import { Empty } from '@/components/ui';
import {
  FilterBar,
  ItemCard,
  Pager,
  PAGE_SIZE,
  StatTiles,
  hrefWith,
  paginate,
  pick,
  type Option,
} from '@/components/list-tools';

const BASE = '/estoque';
const tabs: Option[] = [
  ['', 'Saldo dos produtos'],
  ['movimentos', 'Movimentações'],
];
const statuses: Option[] = [
  ['', 'Todos'],
  ['baixo', 'Abaixo do mínimo'],
  ['sem', 'Sem estoque'],
  ['reservado', 'Com reserva'],
  ['ok', 'Em dia'],
  ['inativos', 'Inativos'],
];
const orders: Option[] = [
  ['', 'A–Z'],
  ['menor', 'Menor saldo'],
  ['valor', 'Mais valor parado'],
];
const movementTypes: Option[] = [
  ['', 'Todas'],
  ['PURCHASE', 'Entradas (compra)'],
  ['SALE', 'Saídas (venda)'],
  ['RETURN', 'Devoluções'],
];
const movementLabel: Record<string, string> = {
  PURCHASE: 'Entrada por compra',
  SALE: 'Saída por venda',
  RETURN: 'Devolução',
  RESERVATION_RELEASE: 'Reserva liberada',
};

type Level = 'sem' | 'baixo' | 'ok';
const level = (available: number, minimum: number): Level =>
  available <= 0 ? 'sem' : minimum > 0 && available <= minimum ? 'baixo' : 'ok';

export async function InventoryView({ actor, query }: ViewProps) {
  const params = query.params;
  return params.aba === 'movimentos' ? (
    <Movements actor={actor} query={query} />
  ) : (
    <Balances actor={actor} query={query} />
  );
}

function Tabs({ params }: { params: ViewProps['query']['params'] }) {
  const current = pick(params.aba, tabs);
  return (
    <nav className="day-filters section-tabs" aria-label="Visão do estoque">
      {tabs.map(([value, label]) => (
        <Link
          key={value || 'saldo'}
          prefetch={false}
          href={value ? `${BASE}?aba=${value}` : BASE}
          aria-current={current === value ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

async function Balances({ actor, query }: ViewProps) {
  const params = query.params,
    status = pick(params.status, statuses),
    order = pick(params.ordem, orders),
    q = (params.q || '').trim().toLocaleLowerCase('pt-BR');
  const all = await db.product.findMany({
    where: { organizationId: actor.organizationId },
    include: { brand: true },
    orderBy: { name: 'asc' },
    take: 2000,
  });
  const rows = all.map((p) => {
    const available = p.stock - p.reserved;
    return {
      ...p,
      available,
      level: level(available, p.minimumStock),
      value: D(p.averageCost.toString()).mul(p.stock),
    };
  });
  const active = rows.filter((p) => p.active);
  const brands = [
    ...new Set(active.map((p) => p.brand?.name).filter(Boolean)),
  ].sort() as string[];
  const brand = brands.includes(params.marca || '') ? params.marca! : '';
  const filtered = (
    status === 'inativos' ? rows.filter((p) => !p.active) : active
  )
    .filter(
      (p) =>
        !status ||
        status === 'inativos' ||
        (status === 'reservado' ? p.reserved > 0 : p.level === status),
    )
    .filter((p) => !brand || p.brand?.name === brand)
    .filter(
      (p) =>
        !q ||
        `${p.name} ${p.sku} ${p.barcode || ''} ${p.brand?.name || ''}`
          .toLocaleLowerCase('pt-BR')
          .includes(q),
    )
    .sort((a, b) =>
      order === 'menor'
        ? a.available - b.available || a.name.localeCompare(b.name)
        : order === 'valor'
          ? b.value.comparedTo(a.value)
          : 0,
    );
  const page = paginate(filtered, query.page);
  const low = active.filter((p) => p.level === 'baixo').length,
    out = active.filter((p) => p.level === 'sem').length,
    units = active.reduce((sum, p) => sum + Math.max(0, p.available), 0),
    value = active.reduce((sum, p) => sum.plus(p.value), D(0));
  return (
    <>
      <Tabs params={params} />
      <StatTiles
        items={[
          {
            label: 'Unidades disponíveis',
            value: units,
            hint: `${active.length} produtos ativos`,
          },
          {
            label: 'Valor em estoque',
            value: brl(value),
            hint: 'pelo custo médio',
          },
          {
            label: 'Abaixo do mínimo',
            value: low,
            tone: low ? 'warn' : 'ok',
            href: hrefWith(BASE, {}, { status: 'baixo' }),
            active: status === 'baixo',
          },
          {
            label: 'Sem estoque',
            value: out,
            tone: out ? 'danger' : 'ok',
            href: hrefWith(BASE, {}, { status: 'sem' }),
            active: status === 'sem',
          },
        ]}
      />
      <div className="list-head">
        <FilterBar
          base={BASE}
          params={params}
          search="Buscar produto, marca ou código"
          groups={[
            { name: 'status', label: 'Situação', options: statuses },
            ...(brands.length > 1
              ? [
                  {
                    name: 'marca',
                    label: 'Marca',
                    options: [
                      ['', 'Todas'] as const,
                      ...brands.map((b) => [b, b] as const),
                    ],
                  },
                ]
              : []),
            { name: 'ordem', label: 'Ordenar', options: orders },
          ]}
        />
        <Link className="button" href="/compras">
          Receber mercadorias
        </Link>
      </div>
      {page.items.length ? (
        <div className="card-grid">
          {page.items.map((p) => (
            <ItemCard
              key={p.id}
              title={p.name}
              subtitle={[p.brand?.name, p.sku].filter(Boolean).join(' · ')}
              value={p.available}
              valueHint={p.available === 1 ? 'disponível' : 'disponíveis'}
              tone={
                !p.active
                  ? 'muted'
                  : p.level === 'sem'
                    ? 'danger'
                    : p.level === 'baixo'
                      ? 'warn'
                      : 'ok'
              }
              tag={
                !p.active
                  ? 'Inativo'
                  : p.level === 'sem'
                    ? 'Sem estoque'
                    : p.level === 'baixo'
                      ? `Abaixo do mínimo (${p.minimumStock})`
                      : undefined
              }
              facts={[
                ['Físico', p.stock],
                ['Reservado', p.reserved],
                ['Mínimo', p.minimumStock || '—'],
                ['Custo médio', brl(p.averageCost.toString())],
                ['Preço', brl(p.salePrice.toString())],
                ['Valor parado', brl(p.value)],
              ]}
            />
          ))}
        </div>
      ) : (
        <Empty>
          {all.length
            ? 'Nenhum produto com esses filtros.'
            : 'Cadastre um produto para começar seu estoque.'}
        </Empty>
      )}
      <Pager
        base={BASE}
        params={params}
        {...page}
        noun={['produto', 'produtos']}
      />
    </>
  );
}

async function Movements({ actor, query }: ViewProps) {
  const params = query.params,
    type = pick(params.tipo, movementTypes),
    q = (params.q || '').trim();
  const where = {
    organizationId: actor.organizationId,
    ...(type ? { type } : {}),
    ...(q
      ? { product: { name: { contains: q, mode: 'insensitive' as const } } }
      : {}),
  };
  const total = await db.inventoryMovement.count({ where }),
    pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE)),
    page = Math.min(query.page, pageCount);
  const movements = await db.inventoryMovement.findMany({
    where,
    include: { product: true },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });
  return (
    <>
      <Tabs params={params} />
      <FilterBar
        base={BASE}
        params={params}
        search="Buscar produto"
        groups={[{ name: 'tipo', label: 'Tipo', options: movementTypes }]}
      />
      {movements.length ? (
        <div className="card-grid">
          {movements.map((m) => (
            <ItemCard
              key={m.id}
              title={m.product.name}
              subtitle={dateTime(m.createdAt)}
              value={`${m.quantity > 0 ? '+' : ''}${m.quantity}`}
              valueHint="un."
              tone={m.quantity > 0 ? 'in' : 'out'}
              tag={movementLabel[m.type] || m.type}
              facts={[['Custo unitário', brl(m.unitCost.toString())]]}
            />
          ))}
        </div>
      ) : (
        <Empty>Nenhuma movimentação com esses filtros.</Empty>
      )}
      <Pager
        base={BASE}
        params={params}
        page={page}
        pageCount={pageCount}
        total={total}
        noun={['movimentação', 'movimentações']}
      />
    </>
  );
}
