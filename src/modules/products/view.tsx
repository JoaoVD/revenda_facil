import { ActionDialog } from '@/components/action-dialog';
import type { ViewProps } from '@/modules/shared/view-types';
import { listProducts } from '@/modules/products/service';
import { brl } from '@/lib/money';
import { Card, Table, Empty } from '@/components/ui';
import { ProductForm } from '@/components/domain-forms';
export async function ProductsView({ actor, query }: ViewProps) {
  const products = await listProducts(actor);
  return (
    <div>
      <Card>
        <div className="section-heading">
          <h2>Seu catálogo</h2>
          <ActionDialog title="Novo produto" trigger="Novo produto">
            <ProductForm />
          </ActionDialog>
        </div>
        <form className="inline-form search-form">
          <input
            aria-label="Pesquisar catálogo"
            name="q"
            defaultValue={query.q}
            placeholder="Pesquisar produto, marca ou código"
          />
          <button className="small-button">Buscar</button>
        </form>
        {products.length ? (
          <Table headers={['Produto', 'Código', 'Preço', 'Estoque']}>
            {products
              .filter((p) =>
                `${p.name} ${p.sku} ${p.brand?.name || ''}`
                  .toLowerCase()
                  .includes((query.q || '').toLowerCase()),
              )
              .map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>
                      {p.brand?.name || 'Sem marca'} ·{' '}
                      {p.category?.name || 'Sem categoria'}
                    </small>
                  </td>
                  <td>{p.sku}</td>
                  <td>{brl(p.salePrice.toString())}</td>
                  <td>{p.stock}</td>
                </tr>
              ))}
          </Table>
        ) : (
          <Empty>
            Seu catálogo está vazio. Use Novo produto para cadastrar o primeiro.
          </Empty>
        )}
      </Card>
    </div>
  );
}
