import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireActor } from '@/modules/auth/server';
import { PageTitle } from '@/components/ui';
import { ProductsView } from '@/modules/products/view';
import { InventoryView } from '@/modules/inventory/view';
import { PurchasesView } from '@/modules/purchases/view';
import { SalesView } from '@/modules/sales/view';
import { CustomersView } from '@/modules/customers/view';
import { FinanceView } from '@/modules/finance/view';
import { FiscalView } from '@/modules/fiscal/view';
import { SettingsView } from '@/modules/settings/view';
import { ReportsView } from '@/modules/reports/view';
const labels: Record<string, [string, string]> = {
  produtos: ['Produtos', 'Um catálogo organizado para vender com facilidade.'],
  estoque: [
    'Estoque',
    'Cada unidade tem uma história. Acompanhe suas entradas e saídas.',
  ],
  compras: [
    'Compras',
    'Receba mercadorias e mantenha o custo do estoque atualizado.',
  ],
  vendas: [
    'Vendas',
    'Escolha os produtos e registre sua venda em poucos passos.',
  ],
  clientes: [
    'Clientes',
    'Seus clientes e os valores a receber, sempre por perto.',
  ],
  financeiro: ['Financeiro', 'O dinheiro que realmente entrou e saiu.'],
  'notas-fiscais': [
    'Notas Fiscais',
    'Acompanhe a documentação das suas vendas.',
  ],
  relatorios: ['Relatórios', 'Consulte os registros do negócio com clareza.'],
  configuracoes: ['Configurações', 'Os dados da sua revenda, do seu jeito.'],
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
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(views, section)) notFound();
  const View = views[section as keyof typeof views],
    actor = await requireActor(),
    query = await searchParams,
    [title, description] = labels[section];
  const numeric = Number(query.page),
    page = Number.isFinite(numeric)
      ? Math.floor(Math.max(1, Math.min(10000, numeric)))
      : 1;
  return (
    <>
      <PageTitle title={title} description={description} />
      <View actor={actor} query={{ page, q: query.q }} />
      {!['produtos', 'configuracoes', 'relatorios'].includes(section) && (
        <div className="pagination">
          <Link
            aria-disabled={page <= 1}
            href={`/${section}?page=${Math.max(1, page - 1)}`}
          >
            ← Anterior
          </Link>
          <span>Página {page} · 25 registros</span>
          <Link href={`/${section}?page=${page + 1}`}>Próxima →</Link>
        </div>
      )}
    </>
  );
}
