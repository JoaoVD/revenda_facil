import { db } from '@/lib/db';
import { atomic } from '@/modules/shared/transaction';
import { productInput, type Actor } from '@/modules/shared/contracts';
import { BusinessError } from '@/lib/errors';
export async function createProduct(actor: Actor, raw: unknown) {
  const input = productInput.parse(raw);
  return atomic(async (tx) => {
    if (
      await tx.product.findUnique({
        where: {
          organizationId_sku: {
            organizationId: actor.organizationId,
            sku: input.sku,
          },
        },
      })
    )
      throw new BusinessError('Já existe um produto com este código.');
    const brand = input.brand
      ? await tx.brand.upsert({
          where: {
            organizationId_name: {
              organizationId: actor.organizationId,
              name: input.brand,
            },
          },
          update: {},
          create: { organizationId: actor.organizationId, name: input.brand },
        })
      : null;
    const category = input.category
      ? await tx.category.upsert({
          where: {
            organizationId_name: {
              organizationId: actor.organizationId,
              name: input.category,
            },
          },
          update: {},
          create: {
            organizationId: actor.organizationId,
            name: input.category,
          },
        })
      : null;
    const { brand: _brand, category: _category, ...fields } = input;
    void _brand;
    void _category;
    const product = await tx.product.create({
      data: {
        ...fields,
        organizationId: actor.organizationId,
        brandId: brand?.id,
        categoryId: category?.id,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'PRODUCT',
        description: `Produto cadastrado: ${product.name}`,
        referenceId: product.id,
      },
    });
    return product;
  });
}
export const listProducts = (actor: Actor) =>
  db.product.findMany({
    where: { organizationId: actor.organizationId },
    include: { brand: true, category: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
