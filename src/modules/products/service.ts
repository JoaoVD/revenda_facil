import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { atomic } from '@/modules/shared/transaction';
import {
  productInput,
  productUpdateInput,
  type Actor,
} from '@/modules/shared/contracts';
import { brl } from '@/lib/money';
import { BusinessError } from '@/lib/errors';
/** Marca e categoria por nome, criadas na primeira vez em que aparecem. */
async function catalogRefs(
  tx: Prisma.TransactionClient,
  actor: Actor,
  brand: string,
  category: string,
) {
  const organizationId = actor.organizationId;
  const [brandRow, categoryRow] = await Promise.all([
    brand
      ? tx.brand.upsert({
          where: { organizationId_name: { organizationId, name: brand } },
          update: {},
          create: { organizationId, name: brand },
        })
      : null,
    category
      ? tx.category.upsert({
          where: { organizationId_name: { organizationId, name: category } },
          update: {},
          create: { organizationId, name: category },
        })
      : null,
  ]);
  return { brandId: brandRow?.id ?? null, categoryId: categoryRow?.id ?? null };
}

/** Código de barras e SKU são únicos na revenda; `except` ignora o próprio produto. */
async function assertUniqueCodes(
  tx: Prisma.TransactionClient,
  actor: Actor,
  codes: { sku: string; barcode: string },
  except?: string,
) {
  const organizationId = actor.organizationId;
  const notSelf = except ? { id: { not: except } } : {};
  if (
    codes.barcode &&
    (await tx.product.findFirst({
      where: { organizationId, barcode: codes.barcode, ...notSelf },
      select: { id: true },
    }))
  )
    throw new BusinessError(
      'Já existe um produto com este código de barras. Vincule o item ao cadastro existente.',
    );
  if (
    await tx.product.findFirst({
      where: { organizationId, sku: codes.sku, ...notSelf },
      select: { id: true },
    })
  )
    throw new BusinessError('Já existe um produto com este código.');
}

export async function createProduct(actor: Actor, raw: unknown) {
  return atomic((tx) => createProductInTransaction(tx, actor, raw));
}
export async function createProductInTransaction(
  tx: Prisma.TransactionClient,
  actor: Actor,
  raw: unknown,
) {
  const input = productInput.parse(raw);
  await assertUniqueCodes(tx, actor, input);
  const { brand, category, ...fields } = input;
  const product = await tx.product.create({
    data: {
      ...fields,
      organizationId: actor.organizationId,
      ...(await catalogRefs(tx, actor, brand, category)),
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
/**
 * Edita o cadastro. Estoque e custo médio não mudam aqui: vêm de compras,
 * vendas e ajustes, para o histórico continuar batendo.
 */
export async function updateProduct(actor: Actor, raw: unknown) {
  const input = productUpdateInput.parse(raw);
  return atomic(async (tx) => {
    const current = await tx.product.findUnique({
      where: {
        organizationId_id: {
          organizationId: actor.organizationId,
          id: input.id,
        },
      },
    });
    if (!current) throw new BusinessError('Produto não encontrado.');
    await assertUniqueCodes(tx, actor, input, current.id);
    const { id, brand, category, barcode, ...fields } = input;
    const product = await tx.product.update({
      where: { id },
      data: {
        ...fields,
        barcode: barcode || null,
        ...(await catalogRefs(tx, actor, brand, category)),
      },
    });
    const changes = [
      current.salePrice.toString() !== product.salePrice.toString() &&
        `preço ${brl(current.salePrice.toString())} → ${brl(product.salePrice.toString())}`,
      current.referenceCost.toString() !== product.referenceCost.toString() &&
        `custo ${brl(current.referenceCost.toString())} → ${brl(product.referenceCost.toString())}`,
      current.active !== product.active &&
        (product.active ? 'reativado' : 'inativado'),
    ].filter(Boolean);
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        type: 'PRODUCT',
        description:
          `Produto atualizado: ${product.name}` +
          (changes.length ? ` (${changes.join('; ')})` : ''),
        referenceId: product.id,
      },
    });
    return product;
  });
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
