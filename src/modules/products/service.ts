import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { atomic } from '@/modules/shared/transaction';
import { productInput, type Actor } from '@/modules/shared/contracts';
import { BusinessError } from '@/lib/errors';
export async function createProduct(actor: Actor, raw: unknown) {
  return atomic((tx) => createProductInTransaction(tx, actor, raw));
}
export async function createProductInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  raw: unknown,
) {
  const input = productInput.parse(raw);
  if (
    input.barcode &&
    (await tx.product.findFirst({
      where: { organizationId: actor.organizationId, barcode: input.barcode },
      select: { id: true },
    }))
  )
    throw new BusinessError(
      'Já existe um produto com este código de barras. Vincule o item ao cadastro existente.',
    );
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
}
export const listProducts = (actor: Actor, query = '') =>
  db.product.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { sku: { contains: query, mode: 'insensitive' } },
              { brand: { name: { contains: query, mode: 'insensitive' } } },
              { barcode: query },
            ],
          }
        : {}),
    },
    include: { brand: true, category: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
