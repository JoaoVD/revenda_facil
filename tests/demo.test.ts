import { afterAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { D, currentMonth } from '@/lib/money';
import { seedDemo } from '@/modules/demo/seed';
import { dashboard } from '@/modules/dashboard/queries';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const orgIds: string[] = [];
describe.skipIf(!enabled)('Cenário de apresentação isolado', () => {
  afterAll(async () => {
    const where = { organizationId: { in: orgIds } };
    await db.$transaction([
      db.auditLog.deleteMany({ where }),
      db.payment.deleteMany({ where }),
      db.expense.deleteMany({ where }),
      db.fiscalDocument.deleteMany({ where }),
      db.inventoryMovement.deleteMany({ where }),
      db.installment.deleteMany({ where }),
      db.saleItem.deleteMany({ where }),
      db.purchaseItem.deleteMany({ where }),
      db.sale.deleteMany({ where }),
      db.purchase.deleteMany({ where }),
      db.product.deleteMany({ where }),
      db.brand.deleteMany({ where }),
      db.category.deleteMany({ where }),
      db.supplier.deleteMany({ where }),
      db.customer.deleteMany({ where }),
      db.membership.deleteMany({ where }),
      db.organization.deleteMany({ where: { id: { in: orgIds } } }),
    ]);
    await db.$disconnect();
  });
  it('cria cenário completo com estoque e financeiro conciliados, sem serviços fiscais ou push', async () => {
    const userId = crypto.randomUUID();
    const result = await seedDemo(userId);
    orgIds.push(result.organizationId);
    expect(result).toMatchObject({
      products: 24,
      customers: 16,
      purchases: 4,
      sales: 37,
      payments: 37,
      alreadySeeded: false,
    });
    const actor = { userId, organizationId: result.organizationId };
    const where = { organizationId: result.organizationId };
    const data = await dashboard(actor, currentMonth());
    expect(data).toMatchObject({
      physicalStock: 232,
      reservedStock: 28,
      stock: 204,
    });
    expect(D(data.incoming).gt(0)).toBe(true);
    expect(D(data.outgoing).gt(0)).toBe(true);
    expect(D(data.profit).gt(0)).toBe(true);
    expect(data.recentSales).toHaveLength(5);
    expect(data.entries).toHaveLength(5);
    const movements = await db.inventoryMovement.findMany({ where });
    for (const product of await db.product.findMany({ where })) {
      expect(product.stock).toBe(
        movements
          .filter((m) => m.productId === product.id)
          .reduce((sum, m) => sum + m.quantity, 0),
      );
      expect(product.stock - product.reserved).toBeGreaterThanOrEqual(0);
    }
    const purchase = await db.purchase.findFirstOrThrow({
      where: { ...where, supplier: { name: 'Fornecedor demonstrativo 4' } },
      include: { payments: true },
      orderBy: { date: 'desc' },
    });
    expect(purchase.payments).toHaveLength(0);
    expect(
      await db.installment.count({ where: { ...where, received: { gt: 0 } } }),
    ).toBe(3);
    expect(
      await db.sale.count({ where: { ...where, status: 'CANCELLED' } }),
    ).toBe(1);
    expect(
      await db.fiscalDocument.count({
        where: { ...where, status: { not: 'PENDING' } },
      }),
    ).toBe(0);
    expect(await db.fiscalSettings.count({ where })).toBe(0);
    expect(await db.pushSubscription.count({ where })).toBe(0);
    expect(await db.reminderPreference.count({ where })).toBe(0);
    const before = await db.inventoryMovement.count({ where });
    await db.customer.updateMany({
      where,
      data: { notes: 'Anotação durante a apresentação' },
    });
    expect(await seedDemo(userId)).toMatchObject({
      ...result,
      alreadySeeded: true,
    });
    expect(await db.inventoryMovement.count({ where })).toBe(before);
    expect(
      await db.customer.count({
        where: { ...where, notes: 'Anotação durante a apresentação' },
      }),
    ).toBe(16);
  });
  it('recusa conta com revenda existente e não remapeia o vínculo', async () => {
    const userId = crypto.randomUUID();
    const org = await db.organization.create({
      data: {
        name: 'Revenda existente',
        ownerName: 'Responsável',
        cnpj: crypto.randomUUID(),
        city: 'São Paulo',
        memberships: { create: { userId } },
      },
    });
    orgIds.push(org.id);
    await expect(seedDemo(userId)).rejects.toThrow('conta nova e exclusiva');
    expect(
      (await db.membership.findUniqueOrThrow({ where: { userId } }))
        .organizationId,
    ).toBe(org.id);
    expect(await db.product.count({ where: { organizationId: org.id } })).toBe(
      0,
    );
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: org.id } })).name,
    ).toBe('Revenda existente');
  });
  it('retoma interrupção sem duplicar operações e mantém duas demonstrações isoladas', async () => {
    const userId = crypto.randomUUID();
    const spy = vi
      .spyOn(db.auditLog, 'upsert')
      .mockRejectedValueOnce(new Error('Interrupção simulada'));
    try {
      await expect(seedDemo(userId)).rejects.toThrow('Interrupção simulada');
    } finally {
      spy.mockRestore();
    }
    const membership = await db.membership.findUniqueOrThrow({
      where: { userId },
    });
    orgIds.push(membership.organizationId);
    const result = await seedDemo(userId);
    expect(result).toMatchObject({
      products: 24,
      purchases: 4,
      sales: 37,
      payments: 37,
    });
    expect(result.organizationId).not.toBe(orgIds[0]);
    const firstProducts = await db.product.findMany({
      where: { organizationId: orgIds[0] },
      select: { id: true },
    });
    expect(
      await db.saleItem.count({
        where: {
          organizationId: result.organizationId,
          productId: { in: firstProducts.map((p) => p.id) },
        },
      }),
    ).toBe(0);
  });
});
