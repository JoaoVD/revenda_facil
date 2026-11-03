import type { ViewProps } from '@/modules/shared/view-types';
import Link from 'next/link';
import { db } from '@/lib/db';
import { listProducts } from '@/modules/products/service';
import { brl, dateTime } from '@/lib/money';
import { Card, Table, Empty, Badge } from '@/components/ui';
export async function InventoryView({ actor, query }: ViewProps) {
  const organizationId = actor.organizationId;
  const skip = (query.page - 1) * 25;
  const products = await listProducts(actor);
  const movements = await db.inventoryMovement.findMany({
    where: { organizationId },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
    skip,
  });
  return (
    <>
      <Card>
        <div className="section-heading">
          <h2>Saldo disponível agora</h2>
          <Link className="button" href="/compras">
            Receber mercadorias
          </Link>
        </div>
        {products.length ? (
          <Table
            headers={[
              'Produto',
              'Físico',
              'Reservado',
              'Disponível',
              'Custo médio unitário',
              'Estoque mínimo',
            ]}
          >
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small>{p.sku}</small>
                </td>
                <td>{p.stock}</td>
                <td>{p.reserved}</td>
                <td>
                  <Badge>{p.stock - p.reserved} unidades</Badge>
                </td>
                <td>{brl(p.averageCost.toString())}</td>
                <td>{p.minimumStock}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Cadastre um produto para começar seu estoque.</Empty>
        )}
      </Card>
      <Card>
        <h2>Movimentações de estoque</h2>
        {movements.length ? (
          <Table headers={['Data', 'Produto', 'Movimento', 'Quantidade']}>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{dateTime(m.createdAt)}</td>
                <td>{m.product.name}</td>
                <td>
                  {m.type === 'PURCHASE'
                    ? 'Compra'
                    : m.type === 'SALE'
                      ? 'Venda'
                      : 'Devolução'}
                </td>
                <td>
                  {m.quantity > 0 ? '+' : ''}
                  {m.quantity}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Nenhuma movimentação registrada.</Empty>
        )}
      </Card>
    </>
  );
}
