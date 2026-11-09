import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireActor } from '@/modules/auth/server';
import { PageTitle } from '@/components/ui';
import { normalizeParams } from '@/components/list-tools';
import { ProductsView } from '@/modules/products/view';
import { InventoryView } from '@/modules/inventory/view';
import { PurchasesView } from '@/modules/purchases/view';
import { SalesView } from '@/modules/sales/view';
import { CustomersView } from '@/modules/customers/view';
import { FinanceView } from '@/modules/finance/view';
import { FiscalView } from '@/modules/fiscal/view';
import { SettingsView } from '@/modules/settings/view';
import { ReportsView } from '@/modules/reports/view';
const titles: Record<string, string> = {
  produtos: 'Produtos',
  estoque: 'Estoque',
  compras: 'Compras',
  vendas: 'Vendas',
  clientes: 'Clientes',
  financeiro: 'Financeiro',
  'notas-fiscais': 'Notas fiscais',
  relatorios: 'Relatórios',
  configuracoes: 'Configurações',
};

const views = {
  produtos: ProductsView,
  estoque: InventoryView,
  compras: PurchasesView,
  vendas: SalesView,
  clientes: CustomersView,
  financeiro: FinanceView,
  'notas-fiscais': FiscalView,
  configuracoes: SettingsView,
  relatorios: ReportsView,
};
export default async function Section({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(views, section)) notFound();
  const View = views[section as keyof typeof views],
    actor = await requireActor(),
    query = normalizeParams(await searchParams),
    title = titles[section];
  const numeric = Number(query.page),
    page = Number.isFinite(numeric)
      ? Math.floor(Math.max(1, Math.min(10000, numeric)))
      : 1;
  return (
    <>
      <PageTitle title={title} />
      <View actor={actor} query={{ page, q: query.q, params: query }} />
      {![
        'produtos',
        'configuracoes',
        'relatorios',
        'estoque',
        'compras',
        'financeiro',
      ].includes(section) && (
        <nav className="pagination" aria-label="Páginas">
          <Link
            aria-disabled={page <= 1}
            aria-label="Página anterior"
            href={`/${section}?page=${Math.max(1, page - 1)}`}
          >
            ‹
          </Link>
          <span>Página {page}</span>
          <Link
            aria-label="Próxima página"
            href={`/${section}?page=${page + 1}`}
          >
            ›
          </Link>
        </nav>
      )}
    </>
  );
}
