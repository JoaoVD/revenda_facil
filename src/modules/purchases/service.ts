import { purchaseInput, type Actor } from '@/modules/shared/contracts';
import { atomic, hash, sameRequest } from '@/modules/shared/transaction';
import { D, money } from '@/lib/money';
import { BusinessError } from '@/lib/errors';
export async function receivePurchase(actor: Actor, raw: unknown) {
  const input = purchaseInput.parse(raw);
  if (new Set(input.items.map((x) => x.productId)).size !== input.items.length)
    throw new BusinessError('Agrupe as quantidades de cada produto.');
  return atomic(async (tx) => {
    const existing = await tx.purchase.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: actor.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      sameRequest(existing.requestHash, input);
      return existing;
    }
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
    });
    if (input.recipientDocument && input.recipientDocument !== org.cnpj)
      throw new BusinessError(
        'O destinatário da nota não corresponde ao CNPJ da empresa. Revise a documentação antes de registrar a entrada.',
      );
    const supplier = await tx.supplier.upsert({
      where: {
        organizationId_name: {
          organizationId: actor.organizationId,
          name: input.supplier,
        },
      },
      update: {},
      create: { organizationId: actor.organizationId, name: input.supplier },
    });
    const total = input.items.reduce(
      (s, i) => s.plus(money(D(i.unitCost).mul(i.quantity))),
      D(0),
    );
    const purchase = await tx.purchase.create({
      data: {
        organizationId: actor.organizationId,
        supplierId: supplier.id,
        date: new Date(`${input.date}T12:00:00-03:00`),
        total: money(total),
        recipientDocument: input.recipientDocument || null,
        accessKey: input.accessKey || null,
        documentationStatus: input.recipientDocument
          ? 'MATCHED'
          : 'NOT_PROVIDED',
        idempotencyKey: input.idempotencyKey,
        requestHash: hash(input),
      },
    });
    for (const item of [...input.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const product = await tx.product.findFirst({
        where: {
          id: item.productId,
          organizationId: actor.organizationId,
          active: true,
        },
      });
      if (!product)
        throw new BusinessError('Produto não disponível nesta empresa.');
      const average = D(product.averageCost.toString())
        .mul(product.stock)
        .plus(D(item.unitCost).mul(item.quantity))
        .div(product.stock + item.quantity)
        .toFixed(4);
      await tx.product.update({
        where: { id: product.id },
        data: { stock: { increment: item.quantity }, averageCost: average },
      });
      await tx.purchaseItem.create({
        data: {
          organizationId: actor.organizationId,
          purchaseId: purchase.id,
          ...item,
          total: money(D(item.unitCost).mul(item.quantity)),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          organizationId: actor.organizationId,
          productId: product.id,
          type: 'PURCHASE',
          quantity: item.quantity,
          unitCost: item.unitCost,
          referenceId: purchase.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          type: 'PURCHASE',
          description: `Entrada: ${product.name}`,
          referenceId: purchase.id,
          quantity: item.quantity,
        },
      });
    }
    return purchase;
  });
}
