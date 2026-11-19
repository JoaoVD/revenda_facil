import type { Prisma } from '@prisma/client';
import { purchaseInput, type Actor } from '@/modules/shared/contracts';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import { D, money } from '@/lib/money';
import { BusinessError } from '@/lib/errors';

type ReceiveInput = {
  supplier: string;
  date: string;
  recipientDocument: string;
  accessKey: string;
  idempotencyKey: string;
  items: {
    productId: string;
    quantity: number;
    unitCost: string;
    total: string;
  }[];
};

export async function findPurchaseReplay(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: Pick<ReceiveInput, 'idempotencyKey' | 'accessKey'>,
  request: unknown,
) {
  const existing = await tx.purchase.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: actor.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existing) {
    sameRequest(existing.requestHash, request);
    return existing;
  }
  if (
    input.accessKey &&
    (await tx.purchase.findUnique({
      where: {
        organizationId_accessKey: {
          organizationId: actor.organizationId,
          accessKey: input.accessKey,
        },
      },
      select: { id: true },
    }))
  )
    throw new BusinessError('Essa NF-e já deu entrada no estoque.');
  return null;
}

export async function createReceivedPurchase(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: ReceiveInput,
  request: unknown,
) {
  const organizationId = actor.organizationId;
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });
  if (input.recipientDocument && input.recipientDocument !== org.cnpj)
    throw new BusinessError(
      'O destinatário da nota não corresponde ao CNPJ da empresa. Revise a documentação antes de registrar a entrada.',
    );
  const supplier = await tx.supplier.upsert({
    where: { organizationId_name: { organizationId, name: input.supplier } },
    update: {},
    create: { organizationId, name: input.supplier },
  });
  const purchase = await tx.purchase.create({
    data: {
      organizationId,
      supplierId: supplier.id,
      date: new Date(input.date + 'T12:00:00-03:00'),
      total: money(
        input.items.reduce((sum, item) => sum.plus(item.total), D(0)),
      ),
      recipientDocument: input.recipientDocument || null,
      accessKey: input.accessKey || null,
      documentationStatus: input.recipientDocument ? 'MATCHED' : 'NOT_PROVIDED',
      idempotencyKey: input.idempotencyKey,
      requestHash: hash(request),
    },
  });
  const products = new Map(
    (
      await tx.product.findMany({
        where: {
          organizationId,
          active: true,
          id: { in: input.items.map((item) => item.productId) },
        },
      })
    ).map((product) => [product.id, product]),
  );
  const items = [...input.items].sort((a, b) =>
    a.productId.localeCompare(b.productId),
  );
  const auditEntries = [];
  for (const item of items) {
    const product = products.get(item.productId);
    if (!product)
      throw new BusinessError('Produto não disponível nesta empresa.');
    const average = D(product.averageCost.toString())
      .mul(product.stock)
      .plus(item.total)
      .div(product.stock + item.quantity)
      .toFixed(4);
    await tx.product.update({
      where: { id: product.id },
      data: { stock: { increment: item.quantity }, averageCost: average },
    });
    auditEntries.push({
      organizationId,
      actorId: actor.userId,
      type: 'PURCHASE',
      description: 'Entrada: ' + product.name,
      referenceId: purchase.id,
      quantity: item.quantity,
    });
  }
  await tx.purchaseItem.createMany({
    data: items.map((item) => ({
      organizationId,
      purchaseId: purchase.id,
      ...item,
    })),
  });
  await tx.inventoryMovement.createMany({
    data: items.map(({ productId, quantity, unitCost }) => ({
      organizationId,
      productId,
      quantity,
      unitCost,
      type: 'PURCHASE',
      referenceId: purchase.id,
    })),
  });
  await tx.auditLog.createMany({ data: auditEntries });
  return purchase;
}

export async function receivePurchase(actor: Actor, raw: unknown) {
  const input = purchaseInput.parse(raw);
  if (
    new Set(input.items.map((item) => item.productId)).size !==
    input.items.length
  )
    throw new BusinessError('Agrupe as quantidades de cada produto.');
  const items = input.items.map((item) => ({
    ...item,
    total: money(D(item.unitCost).mul(item.quantity)),
  }));
  return atomic(
    async (tx) =>
      (await findPurchaseReplay(tx, actor, input, input)) ??
      createReceivedPurchase(tx, actor, { ...input, items }, input),
  );
}
