import { listProducts } from './service';
import type { Actor } from '@/modules/shared/contracts';
import type { ProductOption } from './contracts';
export async function productOptions(actor: Actor): Promise<ProductOption[]> {
  const products = await listProducts(actor);
  return products
    .filter((p) => p.active)
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
