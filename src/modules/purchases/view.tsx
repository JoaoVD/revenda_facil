import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import Link from 'next/link';
import { db } from '@/lib/db';
import { brl, dateTime, D, monthRange } from '@/lib/money';
import { Empty } from '@/components/ui';
import { PurchaseForm, PaymentForm } from '@/components/domain-forms';
import { productOptions } from '@/modules/products/options';
import {
  FilterBar,
  ItemCard,
  Pager,
  StatTiles,
  hrefWith,
  paginate,
  pick,
  type Option,
} from '@/components/list-tools';

const BASE = '/compras';
const situations: Option[] = [
  ['', 'Todas'],
  ['apagar', 'A pagar'],
  ['quitadas', 'Quitadas'],
];

export async function PurchasesView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId,
    params = query.params,
    situation = pick(params.situacao, situations),
    month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes || '') ? params.mes! : '',
    q = (params.q || '').trim();
  const [options, purchases] = await Promise.all([
    productOptions(actor),
    db.purchase.findMany({
      where: {
        organizationId,
        ...(month ? { date: monthRange(month) } : {}),
        ...(q
          ? {
              OR: [
                { supplier: { name: { contains: q, mode: 'insensitive' } } },
                {
                  items: {
                    some: {
                      product: { name: { contains: q, mode: 'insensitive' } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        supplier: true,
        payments: true,
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
      take: 1000,
    }),
  ]);
  const rows = purchases.map((p) => {
    // Mesma regra do serviço financeiro para o saldo da compra.
    const paid = p.payments.reduce(
      (sum, x) => sum.plus(x.amount.toString()),
      D(0),
    );
    return { ...p, paid, open: D(p.total.toString()).minus(paid) };
  });
  const filtered = rows.filter((p) =>
    situation === 'apagar'
      ? p.open.gt(0)
      : situation === 'quitadas'
        ? p.open.lte(0)
        : true,
  );
  const page = paginate(filtered, query.page);
  const totals = rows.reduce(
    (acc, p) => ({
      bought: acc.bought.plus(p.total.toString()),
      paid: acc.paid.plus(p.paid),
      open: acc.open.plus(p.open.gt(0) ? p.open : 0),
      openCount: acc.openCount + (p.open.gt(0) ? 1 : 0),
    }),
    { bought: D(0), paid: D(0), open: D(0), openCount: 0 },
  );
  return (
    <>
      <StatTiles
        items={[
          {
            label: month ? 'Comprado no mês' : 'Total comprado',
            value: brl(totals.bought),
            hint: `${rows.length} ${rows.length === 1 ? 'compra' : 'compras'}`,
          },
          { label: 'Já pago', value: brl(totals.paid), tone: 'ok' },
          {
            label: 'A pagar',
            value: brl(totals.open),
            hint: `${totals.openCount} em aberto`,
            tone: totals.open.gt(0) ? 'warn' : 'ok',
            href: hrefWith(BASE, params, { situacao: 'apagar' }),
            active: situation === 'apagar',
          },
        ]}
      />
      <div className="list-head">
        <FilterBar
          base={BASE}
          params={params}
          search="Buscar fornecedor ou produto"
          extraNames={['mes']}
          extra={
            <input
              type="month"
              name="mes"
              aria-label="Mês da compra"
              defaultValue={month}
            />
          }
          groups={[
            { name: 'situacao', label: 'Pagamento', options: situations },
          ]}
        />
        <ActionDialog title="Receber mercadorias" trigger="Receber mercadorias">
          {options.length ? (
            <PurchaseForm products={options} />
          ) : (
            <Empty>
              Primeiro, <Link href="/produtos">cadastre um produto</Link>.
            </Empty>
          )}
        </ActionDialog>
      </div>
      {page.items.length ? (
        <div className="card-grid">
          {page.items.map((p) => {
            const units = p.items.reduce((sum, i) => sum + i.quantity, 0),
              names = p.items.map((i) => i.product.name);
            return (
              <ItemCard
                key={p.id}
                title={p.supplier.name}
                subtitle={dateTime(p.date)}
                value={brl(p.total.toString())}
                tone={p.open.gt(0) ? 'warn' : 'ok'}
                tag={
                  p.open.gt(0)
                    ? p.paid.gt(0)
                      ? `Pago em parte · falta ${brl(p.open)}`
                      : `A pagar · ${brl(p.open)}`
                    : 'Quitada'
                }
                facts={[
                  [
                    'Itens',
                    `${p.items.length} ${p.items.length === 1 ? 'produto' : 'produtos'} · ${units} un.`,
                  ],
                  ['Pago', brl(p.paid)],
                  [
                    'Nota',
                    p.documentationStatus === 'NOT_PROVIDED'
                      ? 'Não informada'
                      : 'Destinatário conferido',
                  ],
                ]}
              >
                <p className="item-note" title={names.join(', ')}>
                  {names.slice(0, 3).join(', ')}
                  {names.length > 3 && ` e mais ${names.length - 3}`}
                </p>
                {p.open.gt(0) && (
                  <ActionDialog
                    title={`Pagar compra de ${p.supplier.name}`}
                    trigger="Registrar pagamento"
                  >
                    <PaymentForm
                      sales={[]}
                      purchases={[
                        {
                          id: p.id,
                          label: `${p.supplier.name} · ${dateTime(p.date)} · ${brl(p.open)} pendentes`,
                        },
                      ]}
                      initialKind="PURCHASE"
                      preset={{
                        referenceId: p.id,
                        balance: p.open.toFixed(2),
                        description: `Pagamento da compra de ${p.supplier.name}`,
                      }}
                    />
                  </ActionDialog>
                )}
              </ItemCard>
            );
          })}
        </div>
      ) : (
        <Empty>
          {purchases.length || q || month
            ? 'Nenhuma compra com esses filtros.'
            : 'As compras confirmadas aparecerão aqui.'}
        </Empty>
      )}
      <Pager
        base={BASE}
        params={params}
        {...page}
        noun={['compra', 'compras']}
      />
    </>
  );
}
