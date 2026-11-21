import { listProducts } from './service';
import type { Actor } from '@/modules/shared/contracts';
import type { ProductOption } from './contracts';
/**
 * Produtos ativos para os formulários. `forSale`: só os que têm preço de
 * revenda (cadastrados pela nota sem preço ficam fora até a edição).
 */
export async function productOptions(
  actor: Actor,
  { forSale = false }: { forSale?: boolean } = {},
): Promise<ProductOption[]> {
  const products = await listProducts(actor);
  return products
    .filter((p) => p.active && (!forSale || p.salePrice.gt(0)))
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      brand: p.brand?.name || '',
      stock: p.stock - p.reserved,
      salePrice: p.salePrice.toString(),
      referenceCost: p.referenceCost.toString(),
      imageUrl: p.imageUrl,
    }));
}
