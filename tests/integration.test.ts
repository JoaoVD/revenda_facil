import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import { createProduct, listProducts } from '@/modules/products/service';
import { receivePurchase } from '@/modules/purchases/service';
import {
  finalizeSale,
  cancelSale,
  completeOrder,
} from '@/modules/sales/service';
import { recordPayment } from '@/modules/finance/service';
import { syncCommand } from '@/modules/sync/service';
import {
  savePushSubscription,
  pushSubscriptionActive,
  removePushSubscription,
  testPushSubscription,
} from '@/modules/reminders/subscriptions';
import {
  saveReminder,
  dueNotice,
  scheduleReminders,
  reviewNotice,
  dispatchPushJobs,
} from '@/modules/reminders/service';
import { dashboard } from '@/modules/dashboard/queries';
import { currentMonth } from '@/lib/money';
import type { Actor } from '@/modules/shared/contracts';
const enabled = Boolean(process.env.TEST_DATABASE_URL);
// Execute somente contra banco dedicado de teste; nunca aponta implicitamente para produção.
if (enabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
let a: Actor, b: Actor, customerId: string;
async function product(actor = a) {
  return createProduct(actor, {
    name: 'Perfume de teste',
    sku: crypto.randomUUID(),
    referenceCost: '40',
    salePrice: '100',
  });
}
async function purchase(
  productId: string,
  quantity = 10,
  unitCost = '40',
  actor = a,
  key = crypto.randomUUID(),
) {
  return receivePurchase(actor, {
    idempotencyKey: key,
    supplier: 'Fornecedor de teste',
    date: new Date().toISOString().slice(0, 10),
    items: [{ productId, quantity, unitCost }],
  });
}
async function sale(
  productId: string,
  quantity = 2,
  paid = '0',
  key = crypto.randomUUID(),
  actor = a,
) {
  return finalizeSale(actor, {
    idempotencyKey: key,
    customerId,
    discount: '0',
    paid,
    method: 'PIX',
    items: [{ productId, quantity }],
  });
}
describe.skipIf(!enabled)('Operações integradas em PostgreSQL', () => {
  beforeAll(async () => {
    for (const which of ['a', 'b']) {
      const org = await db.organization.create({
        data: {
          name: `TEST ${crypto.randomUUID()}`,
          ownerName: 'Teste',
          cnpj: crypto.randomUUID(),
          city: 'Monte Alto',
        },
      });
      const actor = { userId: crypto.randomUUID(), organizationId: org.id };
      await db.membership.create({ data: actor });
      if (which === 'a') a = actor;
      else b = actor;
    }
    const customer = await db.customer.create({
      data: { organizationId: a.organizationId, name: 'Cliente de teste' },
    });
    customerId = customer.id;
  });
  afterAll(async () => {
    // Remove exclusivamente organizações criadas por esta execução, em ordem de dependência.
    if (a && b) {
      const orgs = {
        organizationId: { in: [a.organizationId, b.organizationId] },
      };
      await db.$transaction([
        db.auditLog.deleteMany({ where: orgs }),
        db.syncCommand.deleteMany({ where: orgs }),
        db.pushJob.deleteMany({ where: { subscription: orgs } }),
        db.pushSubscription.deleteMany({ where: orgs }),
        db.reminderNotice.deleteMany({ where: orgs }),
        db.reminderPreference.deleteMany({ where: orgs }),
        db.payment.deleteMany({ where: orgs }),
        db.expense.deleteMany({ where: orgs }),
        db.fiscalDocument.deleteMany({ where: orgs }),
        db.inventoryMovement.deleteMany({ where: orgs }),
        db.stockLot.deleteMany({ where: orgs }),
        db.installment.deleteMany({ where: orgs }),
        db.saleItem.deleteMany({ where: orgs }),
        db.purchaseItem.deleteMany({ where: orgs }),
        db.sale.deleteMany({ where: orgs }),
        db.purchase.deleteMany({ where: orgs }),
        db.product.deleteMany({ where: orgs }),
        db.brand.deleteMany({ where: orgs }),
        db.category.deleteMany({ where: orgs }),
        db.supplier.deleteMany({ where: orgs }),
        db.customer.deleteMany({ where: orgs }),
        db.fiscalSettings.deleteMany({ where: orgs }),
        db.membership.deleteMany({ where: orgs }),
        db.organization.deleteMany({
          where: { id: { in: [a.organizationId, b.organizationId] } },
        }),
      ]);
    }
    await db.$disconnect();
  });
  it('compra dez, vende duas, deixa oito e conserva custo e situação fiscal', async () => {
    const p = await product();
    await purchase(p.id);
    const s = await sale(p.id);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(8);
    expect(s.costTotal.toString()).toBe('80');
    expect(s.total.toString()).toBe('200');
    expect(
      (await db.fiscalDocument.findUniqueOrThrow({ where: { saleId: s.id } }))
        .status,
    ).toBe('PENDING');
    expect(await db.payment.count({ where: { saleId: s.id } })).toBe(0);
  });
  it('não registra compra não paga como saída nem venda a prazo como recebimento', async () => {
    const before = await dashboard(a, currentMonth());
    const p = await product();
    const buy = await purchase(p.id);
    await sale(p.id);
    const after = await dashboard(a, currentMonth());
    expect(after.incoming).toBe(before.incoming);
    expect(after.outgoing).toBe(before.outgoing);
    expect(await db.payment.count({ where: { purchaseId: buy.id } })).toBe(0);
    expect(Number(after.profit) - Number(before.profit)).toBe(120);
  });
  it('mantém custo histórico após novas compras e calcula média ponderada', async () => {
    const p = await product();
    await purchase(p.id, 10, '40');
    const s = await sale(p.id);
    await purchase(p.id, 8, '60');
    expect(
      (
        await db.product.findUniqueOrThrow({ where: { id: p.id } })
      ).averageCost.toString(),
    ).toBe('50');
    expect(
      (
        await db.sale.findUniqueOrThrow({ where: { id: s.id } })
      ).costTotal.toString(),
    ).toBe('80');
  });
  it('reenvio concorrente da mesma venda só registra uma baixa', async () => {
    const p = await product();
    await purchase(p.id);
    const key = crypto.randomUUID();
    const results = await Promise.all([
      sale(p.id, 2, '0', key),
      sale(p.id, 2, '0', key),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(8);
  });
  it('vendas simultâneas não deixam estoque negativo', async () => {
    const p = await product();
    await purchase(p.id, 3);
    const results = await Promise.allSettled([sale(p.id, 2), sale(p.id, 2)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(1);
  });
  it('mesma chave com outros dados é recusada', async () => {
    const p = await product();
    await purchase(p.id);
    const key = crypto.randomUUID();
    await sale(p.id, 1, '0', key);
    await expect(sale(p.id, 2, '0', key)).rejects.toThrow('outros dados');
  });
  it('compra reenviada é idempotente', async () => {
    const p = await product(),
      key = crypto.randomUUID();
    await Promise.all([
      purchase(p.id, 10, '40', a, key),
      purchase(p.id, 10, '40', a, key),
    ]);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(10);
  });
  it('recebimento parcial é idempotente e não excede saldo', async () => {
    const p = await product();
    await purchase(p.id);
    const s = await sale(p.id);
    const input = {
      idempotencyKey: crypto.randomUUID(),
      kind: 'SALE',
      referenceId: s.id,
      amount: '50',
      method: 'PIX',
      description: 'Recebimento parcial',
    };
    await Promise.all([recordPayment(a, input), recordPayment(a, input)]);
    expect(await db.payment.count({ where: { saleId: s.id } })).toBe(1);
    await expect(
      recordPayment(a, {
        ...input,
        idempotencyKey: crypto.randomUUID(),
        amount: '151',
      }),
    ).rejects.toThrow('ultrapassa');
  });
  it('cancelamento preserva movimentos e repõe estoque uma única vez', async () => {
    const p = await product();
    await purchase(p.id);
    const s = await sale(p.id);
    await Promise.all([
      cancelSale(a, { saleId: s.id, reason: 'Desistência da compra' }),
      cancelSale(a, { saleId: s.id, reason: 'Desistência da compra' }),
    ]);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(10);
    expect(
      await db.inventoryMovement.count({ where: { referenceId: s.id } }),
    ).toBe(2);
  });
  it('cancelamento de venda recebida bloqueia sem publicar compensação parcial', async () => {
    const p = await product();
    await purchase(p.id);
    const s = await sale(p.id, 2, '200');
    await expect(
      cancelSale(a, { saleId: s.id, reason: 'Desistência da compra' }),
    ).rejects.toThrow('já recebida');
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(8);
    expect(
      await db.inventoryMovement.count({ where: { referenceId: s.id } }),
    ).toBe(1);
  });
  it('isola leitura e mutações entre organizações', async () => {
    const p = await product();
    await purchase(p.id);
    expect((await listProducts(b)).some((x) => x.id === p.id)).toBe(false);
    await expect(purchase(p.id, 1, '10', b)).rejects.toThrow('nesta empresa');
    await expect(
      finalizeSale(b, {
        idempotencyKey: crypto.randomUUID(),
        discount: '0',
        paid: '0',
        method: 'CREDIT',
        items: [{ productId: p.id, quantity: 1 }],
      }),
    ).rejects.toThrow('Estoque insuficiente');
    const s = await sale(p.id);
    await expect(
      cancelSale(b, { saleId: s.id, reason: 'Desistência da compra' }),
    ).rejects.toThrow('não encontrada');
    await expect(
      recordPayment(b, {
        idempotencyKey: crypto.randomUUID(),
        kind: 'SALE',
        referenceId: s.id,
        amount: '1',
        method: 'PIX',
        description: 'Tentativa',
      }),
    ).rejects.toThrow('não encontrado');
  });
  it('documentação divergente bloqueia a entrada', async () => {
    const p = await product();
    await expect(
      receivePurchase(a, {
        idempotencyKey: crypto.randomUUID(),
        supplier: 'Fornecedor',
        date: '2026-11-01',
        recipientDocument: '12345678901',
        items: [{ productId: p.id, quantity: 1, unitCost: '10' }],
      }),
    ).rejects.toThrow('não corresponde');
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(0);
  });
  it('pedido reserva sem baixa ou lucro e recebimento antecipado independe da entrega', async () => {
    const p = await product();
    await purchase(p.id);
    const before = await dashboard(a, currentMonth());
    const s = await finalizeSale(a, {
      idempotencyKey: crypto.randomUUID(),
      customerId,
      paid: '50',
      method: 'PIX',
      fulfillmentMode: 'DELIVERY',
      address: 'Rua das Flores, 120',
      installments: [{ amount: '70', dueDate: '2026-12-10' }, { amount: '80' }],
      items: [{ productId: p.id, quantity: 2 }],
    });
    const reserved = await db.product.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(reserved.stock).toBe(10);
    expect(reserved.reserved).toBe(2);
    const after = await dashboard(a, currentMonth());
    expect(after.profit).toBe(before.profit);
    expect(Number(after.incoming) - Number(before.incoming)).toBe(50);
    const input = { saleId: s.id, expectedVersion: 1 };
    await Promise.all([completeOrder(a, input), completeOrder(a, input)]);
    const delivered = await db.product.findUniqueOrThrow({
      where: { id: p.id },
    });
    expect(delivered.stock).toBe(8);
    expect(delivered.reserved).toBe(0);
    expect(
      await db.inventoryMovement.count({
        where: { referenceId: s.id, type: 'SALE' },
      }),
    ).toBe(1);
    expect(await db.payment.count({ where: { saleId: s.id } })).toBe(1);
    await recordPayment(a, {
      idempotencyKey: crypto.randomUUID(),
      kind: 'SALE',
      referenceId: s.id,
      amount: '90',
      method: 'CASH',
      description: 'Recebimento distribuído',
    });
    const parts = await db.installment.findMany({
      where: { saleId: s.id },
      orderBy: { position: 'asc' },
    });
    expect(parts[0].received.toString()).toBe('70');
    expect(parts[1].received.toString()).toBe('20');
    expect(parts[1].dueDate).toBeNull();
  });
  it('cancelamento antes da retirada libera reserva sem entrada física', async () => {
    const p = await product();
    await purchase(p.id, 2);
    const s = await finalizeSale(a, {
      idempotencyKey: crypto.randomUUID(),
      customerId,
      method: 'PIX',
      fulfillmentMode: 'PICKUP',
      items: [{ productId: p.id, quantity: 2 }],
    });
    await expect(sale(p.id, 1)).rejects.toThrow('Estoque insuficiente');
    await cancelSale(a, {
      saleId: s.id,
      reason: 'Cliente desistiu da retirada',
    });
    const stock = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(stock.stock).toBe(2);
    expect(stock.reserved).toBe(0);
    expect(
      await db.inventoryMovement.count({ where: { referenceId: s.id } }),
    ).toBe(0);
    await expect(
      completeOrder(a, { saleId: s.id, expectedVersion: 1 }),
    ).rejects.toThrow();
  });
  it('parcelas não podem divergir do saldo e entrega exige organização e versão', async () => {
    const p = await product();
    await purchase(p.id);
    const input = {
      idempotencyKey: crypto.randomUUID(),
      customerId,
      method: 'PIX',
      fulfillmentMode: 'PICKUP',
      items: [{ productId: p.id, quantity: 1 }],
    };
    await expect(
      finalizeSale(a, { ...input, installments: [{ amount: '90' }] }),
    ).rejects.toThrow('parcelas');
    const s = await finalizeSale(a, input);
    await expect(
      completeOrder(b, { saleId: s.id, expectedVersion: 1 }),
    ).rejects.toThrow('encontrado');
    await expect(
      completeOrder(a, { saleId: s.id, expectedVersion: 9 }),
    ).rejects.toThrow('versão');
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock,
    ).toBe(10);
  });
  it('sincronização preserva conflito, fatos dependentes e resposta idempotente', async () => {
    const p = await product();
    await purchase(p.id, 1);
    const orderId = crypto.randomUUID();
    const command = {
      id: crypto.randomUUID(),
      contractVersion: 1,
      organizationId: a.organizationId,
      userId: a.userId,
      type: 'ORDER',
      capturedAt: new Date().toISOString(),
      dependencies: [],
      payload: {
        orderId,
        idempotencyKey: crypto.randomUUID(),
        customerId,
        fulfillmentMode: 'PICKUP',
        method: 'PIX',
        items: [{ productId: p.id, quantity: 2 }],
      },
    };
    const conflict = await syncCommand(a, command);
    expect(conflict.status).toBe('ATTENTION');
    const receipt = await syncCommand(a, {
      ...command,
      id: crypto.randomUUID(),
      type: 'PAYMENT',
      dependencies: [command.id],
      payload: {
        idempotencyKey: crypto.randomUUID(),
        kind: 'SALE',
        referenceId: orderId,
        amount: '50',
        method: 'PIX',
        description: 'Dinheiro recebido offline',
      },
    });
    expect(receipt.status).toBe('WAITING');
    expect(receipt.payload).toBeTruthy();
    expect(
      await db.syncCommand.count({
        where: {
          organizationId: a.organizationId,
          status: { in: ['ATTENTION', 'WAITING'] },
        },
      }),
    ).toBe(2);
    const okCommand = {
      ...command,
      id: crypto.randomUUID(),
      payload: {
        ...command.payload,
        orderId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        items: [{ productId: p.id, quantity: 1 }],
      },
    };
    const first = await syncCommand(a, okCommand);
    expect(first.status).toBe('APPLIED');
    expect((await syncCommand(a, okCommand)).result).toEqual(first.result);
    await expect(
      syncCommand(a, {
        ...okCommand,
        payload: { ...okCommand.payload, paid: '5' },
      }),
    ).rejects.toThrow('outros dados');
    await expect(syncCommand(b, okCommand)).rejects.toThrow('conta');
  });
  it('recupera recebimento aplicado após dez falhas de confirmação sem duplicar dinheiro', async () => {
    const p = await product();
    await purchase(p.id);
    const s = await sale(p.id, 1);
    const command = {
      id: crypto.randomUUID(),
      contractVersion: 1,
      organizationId: a.organizationId,
      userId: a.userId,
      type: 'PAYMENT',
      capturedAt: new Date().toISOString(),
      dependencies: [],
      payload: {
        idempotencyKey: crypto.randomUUID(),
        kind: 'SALE',
        referenceId: s.id,
        amount: '60',
        method: 'PIX',
        description: 'Recebimento offline TEST',
      },
    };
    const update = vi.spyOn(db.syncCommand, 'update');
    try {
      for (let i = 0; i < 10; i++) {
        update.mockRejectedValueOnce(
          new Error('TEST: confirmação indisponível'),
        );
        await expect(syncCommand(a, command)).rejects.toThrow(
          'confirmação indisponível',
        );
      }
      const recovered = await syncCommand(a, command);
      expect(recovered.status).toBe('APPLIED');
      expect(recovered.attempts).toBe(11);
      expect(await db.payment.count({ where: { saleId: s.id } })).toBe(1);
      expect(
        await db.auditLog.count({
          where: {
            referenceId: (recovered.result as { id: string }).id,
            type: 'RECEIPT',
          },
        }),
      ).toBe(1);
      expect((await syncCommand(a, command)).result).toEqual(recovered.result);
      // Simula o estado deixado pela versão que parava definitivamente após 8 falhas.
      await db.syncCommand.update({
        where: { id: command.id },
        data: {
          status: 'ATTENTION',
          message:
            'Limite de tentativas. Informação preservada para conferência.',
        },
      });
      expect((await syncCommand(a, command)).status).toBe('APPLIED');
      expect(await db.payment.count({ where: { saleId: s.id } })).toBe(1);
    } finally {
      update.mockRestore();
    }
  });
  it('recebimentos concorrentes não excedem saldo e não alteram reserva', async () => {
    const p = await product();
    await purchase(p.id, 2);
    const s = await finalizeSale(a, {
      idempotencyKey: crypto.randomUUID(),
      customerId,
      method: 'PIX',
      fulfillmentMode: 'PICKUP',
      items: [{ productId: p.id, quantity: 1 }],
    });
    const input = {
      kind: 'SALE',
      referenceId: s.id,
      amount: '60',
      method: 'PIX',
      description: 'Recebimento concorrente',
    };
    const results = await Promise.allSettled([
      recordPayment(a, { ...input, idempotencyKey: crypto.randomUUID() }),
      recordPayment(a, { ...input, idempotencyKey: crypto.randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).reserved,
    ).toBe(1);
  });
  it('inscrição push é idempotente, isolada e limita testes concorrentes por aparelho', async () => {
    const keys = {
      p256dh: Buffer.alloc(65, 4).toString('base64url'),
      auth: Buffer.alloc(16, 1).toString('base64url'),
    };
    const subscription = {
      endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`,
      keys,
    };
    const config = {
      publicKey: 'TEST_VAPID',
      privateKey: 'TEST_PRIVATE',
      subject: 'mailto:test@example.com',
    };
    const [one, two] = await Promise.all([
      savePushSubscription(a, subscription, config.publicKey),
      savePushSubscription(a, subscription, config.publicKey),
    ]);
    expect(one.id).toBe(two.id);
    expect(
      await pushSubscriptionActive(a, subscription.endpoint, config.publicKey),
    ).toBe(true);
    expect(
      await pushSubscriptionActive(b, subscription.endpoint, config.publicKey),
    ).toBe(false);
    await expect(
      savePushSubscription(b, subscription, config.publicKey),
    ).rejects.toThrow('conta atual');
    await removePushSubscription(b, subscription.endpoint);
    const send = vi
      .fn<
        (
          subscription: unknown,
          payload: string,
        ) => Promise<{ statusCode: number }>
      >()
      .mockResolvedValue({ statusCode: 201 });
    await expect(
      testPushSubscription(b, subscription.endpoint, send, config),
    ).rejects.toThrow('Ative');
    const attempts = await Promise.allSettled([
      testPushSubscription(a, subscription.endpoint, send, config),
      testPushSubscription(a, subscription.endpoint, send, config),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toBe('{"type":"TEST_NOTIFICATION"}');
    await db.pushSubscription.update({
      where: { id: one.id },
      data: { lastTestAt: new Date(Date.now() - 61000) },
    });
    await expect(
      testPushSubscription(
        a,
        subscription.endpoint,
        async () => ({ statusCode: 410 }),
        config,
      ),
    ).rejects.toThrow('expirada');
    expect(
      await pushSubscriptionActive(a, subscription.endpoint, config.publicKey),
    ).toBe(false);
  });
  it('push pendente não é enviado após quitação do saldo', async () => {
    const p = await product(b);
    await purchase(p.id, 1, '40', b);
    const c = await db.customer.create({
      data: { name: 'TEST push quitação', organizationId: b.organizationId },
    });
    const s = await finalizeSale(b, {
      idempotencyKey: crypto.randomUUID(),
      customerId: c.id,
      method: 'PIX',
      items: [{ productId: p.id, quantity: 1 }],
    });
    await saveReminder(b, {
      enabled: true,
      dayMode: 'FIRST',
      day: 1,
      time: '09:00',
      scope: 'ALL',
    });
    const sub = await savePushSubscription(
      b,
      {
        endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`,
        keys: {
          p256dh: Buffer.alloc(65, 4).toString('base64url'),
          auth: Buffer.alloc(16).toString('base64url'),
        },
      },
      'TEST_KEY',
    );
    const now = new Date('2027-01-01T12:00:00Z');
    await scheduleReminders(now);
    await recordPayment(b, {
      idempotencyKey: crypto.randomUUID(),
      kind: 'SALE',
      referenceId: s.id,
      amount: '100',
      method: 'PIX',
      description: 'TEST quitação antes do push',
    });
    const send = vi
      .fn<
        (
          subscription: unknown,
          payload: string,
        ) => Promise<{ statusCode: number }>
      >()
      .mockResolvedValue({ statusCode: 201 });
    await dispatchPushJobs(send, now);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await db.pushJob.findFirstOrThrow({ where: { subscriptionId: sub.id } }))
        .status,
    ).toBe('SUPPRESSED');
    await removePushSubscription(b, sub.endpoint);
  });
  it('lembrete mensal não duplica, invalida inscrição e desaparece após quitar', async () => {
    const p = await product(b);
    await purchase(p.id, 1, '40', b);
    const customer = await db.customer.create({
      data: { organizationId: b.organizationId, name: 'Cliente lembrete' },
    });
    const s = await finalizeSale(b, {
      idempotencyKey: crypto.randomUUID(),
      customerId: customer.id,
      method: 'PIX',
      fulfillmentMode: 'PICKUP',
      items: [{ productId: p.id, quantity: 1 }],
    });
    await saveReminder(b, {
      enabled: true,
      dayMode: 'FIRST',
      day: 1,
      time: '09:00',
      scope: 'ALL',
    });
    const now = new Date('2027-02-28T12:00:00Z');
    const notices = await Promise.all([
      dueNotice(b.organizationId, now),
      dueNotice(b.organizationId, now),
    ]);
    expect(notices[0]?.id).toBe(notices[1]?.id);
    expect(
      await db.reminderNotice.count({
        where: { organizationId: b.organizationId, period: '2027-02' },
      }),
    ).toBe(1);
    await db.pushSubscription.create({
      data: {
        organizationId: b.organizationId,
        userId: b.userId,
        endpoint: `https://example.invalid/${crypto.randomUUID()}`,
        keys: {},
      },
    });
    await Promise.all([scheduleReminders(now), scheduleReminders(now)]);
    expect(
      await db.pushJob.count({
        where: { subscription: { organizationId: b.organizationId } },
      }),
    ).toBe(1);
    await dispatchPushJobs(async () => ({ statusCode: 410 }), now);
    expect(
      await db.pushSubscription.count({
        where: { organizationId: b.organizationId },
      }),
    ).toBe(0);
    await reviewNotice(b, { noticeId: notices[0]!.id, action: 'REVIEW' });
    expect(await dueNotice(b.organizationId, now)).toBeNull();
    expect(
      await dueNotice(b.organizationId, new Date('2027-03-01T12:00:00Z')),
    ).not.toBeNull();
    await recordPayment(b, {
      idempotencyKey: crypto.randomUUID(),
      kind: 'SALE',
      referenceId: s.id,
      amount: '100',
      method: 'CASH',
      description: 'Quitação',
    });
    expect(
      await dueNotice(b.organizationId, new Date('2027-03-01T12:00:00Z')),
    ).toBeNull();
  });
});
