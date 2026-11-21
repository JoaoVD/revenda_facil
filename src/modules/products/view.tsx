import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import { listProducts } from '@/modules/products/service';
import { brl } from '@/lib/money';
import { Card, Table, Empty } from '@/components/ui';
import { ProductForm } from '@/components/domain-forms';
import { D } from '@/lib/money';
export async function ProductsView({ actor, query }: ViewProps) {
  const search = (query.q || '').trim().slice(0, 120);
  const products = await listProducts(actor, search);
  const scanned =
    !products.length && /^[0-9]{8,14}$/.test(search) ? search : '';
  return (
    <div>
      <Card>
        <div className="section-heading">
          <h2>Seu catálogo</h2>
          <ActionDialog title="Novo produto" trigger="Novo produto">
            <ProductForm initialBarcode={scanned} />
          </ActionDialog>
        </div>
        <form className="inline-form search-form">
          <input
            aria-label="Pesquisar catálogo"
            name="q"
            defaultValue={query.q}
            placeholder="Pesquisar ou escanear código de barras"
          />
          <button className="small-button">Buscar</button>
        </form>
        {products.length ? (
          <Table headers={['Produto', 'Código', 'Preço', 'Estoque', '']}>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small>
                    {p.brand?.name || 'Sem marca'} ·{' '}
                    {p.category?.name || 'Sem categoria'}
                  </small>
                </td>
                <td>
                  {p.sku}
                  {p.barcode && p.barcode !== p.sku && (
                    <small>{p.barcode}</small>
                  )}
                </td>
                <td>
                  {D(p.salePrice.toString()).gt(0) ? (
                    brl(p.salePrice.toString())
                  ) : (
                    <span className="badge badge--neutral">Sem preço</span>
                  )}
                  {!p.active && (
                    <small>
                      <span className="badge">Inativo</span>
                    </small>
                  )}
                </td>
                <td>{p.stock}</td>
                <td>
                  <ActionDialog
                    title={`Editar ${p.name}`}
                    trigger="Editar"
                    triggerLabel={`Editar ${p.name}`}
                    triggerClassName="small-button"
                  >
                    <ProductForm
                      product={{
                        id: p.id,
                        name: p.name,
                        sku: p.sku,
                        barcode: p.barcode ?? '',
                        brand: p.brand?.name ?? '',
                        category: p.category?.name ?? '',
                        description: p.description ?? '',
                        referenceCost: D(p.referenceCost.toString()).toFixed(2),
                        salePrice: D(p.salePrice.toString()).toFixed(2),
                        minimumStock: p.minimumStock,
                        active: p.active,
                      }}
                    />
                  </ActionDialog>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            {scanned
              ? 'Código ainda não cadastrado. Abra Novo produto para aproveitar a leitura.'
              : search
                ? 'Nenhum produto encontrado.'
                : 'Seu catálogo está vazio. Use Novo produto para cadastrar o primeiro.'}
          </Empty>
        )}
      </Card>
    </div>
  );
}
