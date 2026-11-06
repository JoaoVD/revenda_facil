// Somente CLI: nunca importar em Server Actions ou Route Handlers públicos.
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { D } from '@/lib/money';
import { id, type Actor } from '@/modules/shared/contracts';
import { atomic } from '@/modules/shared/transaction';
import { createProduct } from '@/modules/products/service';
import { receivePurchase } from '@/modules/purchases/service';
import { finalizeSale, cancelSale } from '@/modules/sales/service';
import { recordPayment } from '@/modules/finance/service';
import { demoCatalog, demoCustomers } from './catalog';

const NAME = 'DEMONSTRAÇÃO — Revenda Fácil';
function demoId(userId: string, label: string) {
  const bytes = createHash('sha256')
    .update(`revenda-demo-v1:${userId}:${label}`)
    .digest();
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const isoDay = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** userId deve vir de getUser() do Supabase, nunca de entrada HTTP do cliente. */
export async function seedDemo(userId: string) {
  id.parse(userId);
  const organizationId = demoId(userId, 'organization');
  const marker = `DEMO-${organizationId}`; // Identificador deliberadamente NÃO fiscal.
  const actor: Actor = { userId, organizationId };
  const org = await atomic(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { userId },
      include: { organization: true },
    });
    if (membership) {
      if (
        membership.organizationId !== organizationId ||
        membership.organization.cnpj !== marker ||
        membership.organization.name !== NAME
      )
        throw new Error(
          'Esta conta já pertence a uma revenda. Use uma conta nova e exclusiva para demonstração, sem concluir o cadastro inicial.',
        );
      return membership.organization;
    }
    return tx.organization.create({
      data: {
        id: organizationId,
        name: NAME,
        ownerName: 'Ana (demonstração)',
        cnpj: marker,
        city: 'São Paulo',
        state: 'SP',
        memberships: { create: { userId, role: 'OWNER' } },
      },
    });
  });
  const scope = { organizationId };
  const readyId = demoId(userId, 'ready');
  if (
    await db.auditLog.findFirst({
      where: { ...scope, id: readyId, type: 'DEMO_READY' },
    })
  )
    return summary(actor, true);

  // Congelada na primeira execução: uma retomada mantém os mesmos hashes e datas.
  const anchor = org.createdAt;
  const key = (label: string) => demoId(userId, label);
  const date = (days: number) =>
    isoDay(new Date(anchor.getTime() + days * 86400000));
  const monthStart = new Date(
    `${isoDay(anchor).slice(0, 7)}-01T00:00:00-03:00`,
  ).getTime();
  const past = (days: number, minutes = 0) =>
    new Date(
      Math.max(
        monthStart,
        anchor.getTime() - days * 86400000 - minutes * 60000,
      ),
    );
  const stamp = async (referenceId: string, at: Date) => {
    await db.$transaction([
      db.auditLog.updateMany({
        where: { ...scope, referenceId },
        data: { createdAt: at },
      }),
      db.inventoryMovement.updateMany({
        where: { ...scope, referenceId },
        data: { createdAt: at },
      }),
    ]);
  };
  const products = [];
  for (const [
    index,
    [name, brand, category, referenceCost, salePrice],
  ] of demoCatalog.entries()) {
    const sku = `DEMO-${String(index + 1).padStart(3, '0')}`;
    const where = { organizationId_sku: { organizationId, sku } };
    let product = await db.product.findUnique({ where });
    if (!product) {
      try {
        product = await createProduct(actor, {
          name,
          sku,
          brand,
          category,
          referenceCost,
          salePrice,
          minimumStock: index >= 22 ? 15 : 3,
          description:
            'Produto fictício de demonstração. Preços ilustrativos. Sem configuração fiscal.',
        });
      } catch (error) {
        // Outro processo pode ter criado o mesmo SKU durante a execução.
        product = await db.product.findUnique({ where });
        if (!product) throw error;
      }
    }
    products.push(product);
  }
  const customers = [];
  for (const [index, name] of demoCustomers.entries()) {
    customers.push(
      await db.customer.upsert({
        where: { id: key(`customer-${index}`) },
        update: {},
        create: {
          id: key(`customer-${index}`),
          ...scope,
          name: `${name} (demo)`,
          notes: 'Pessoa fictícia para apresentação. Não enviar cobranças.',
        },
      }),
    );
  }
  // Quatro compras: duas quitadas, uma parcial e uma totalmente a pagar.
  for (let i = 0; i < 4; i++) {
    const purchase = await receivePurchase(actor, {
      idempotencyKey: key(`purchase-${i}`),
      supplier: `Fornecedor demonstrativo ${i + 1}`,
      date: isoDay(past(8 - i * 2)),
      items: products.slice(i * 6, i * 6 + 6).map((p) => ({
        productId: p.id,
        quantity: 12,
        unitCost: p.referenceCost.toFixed(2),
      })),
    });
    await stamp(purchase.id, past(8 - i * 2));
    if (i < 3) {
      const payment = await recordPayment(actor, {
        idempotencyKey: key(`purchase-payment-${i}`),
        kind: 'PURCHASE',
        referenceId: purchase.id,
        amount:
          i === 2
            ? D(purchase.total.toString()).div(2).toFixed(2)
            : purchase.total.toFixed(2),
        method: 'PIX',
        description: `Pagamento da compra demonstrativa ${i + 1}`,
      });
      await db.payment.update({
        where: { id: payment.id },
        data: { occurredAt: past(7 - i * 2) },
      });
      await stamp(payment.id, past(7 - i * 2));
    }
  }
  for (let i = 0; i < 36; i++) {
    const selected = [products[i % 24], products[(i + 5) % 24]];
    const quantity = i % 3 === 0 ? 2 : 1;
    const total = D(selected[0].salePrice.toString())
      .mul(quantity)
      .plus(selected[1].salePrice.toString())
      .minus(i % 5 === 0 ? 5 : 0);
    const paid = i % 4 < 2 ? total : i % 4 === 2 ? total.div(2) : D(0);
    const balance = total.minus(paid);
    const firstPart = balance.div(2).toDecimalPlaces(2);
    const saleKey = key(`sale-${i}`);
    const sale = await finalizeSale(actor, {
      idempotencyKey: saleKey,
      customerId: customers[i % customers.length].id,
      discount: i % 5 === 0 ? '5' : '0',
      paid: paid.toFixed(2),
      method:
        i % 4 === 3 ? 'CREDIT' : (['PIX', 'CASH', 'CARD'] as const)[i % 3],
      fulfillmentMode:
        i < 24 ? 'IMMEDIATE' : i % 2 === 0 ? 'DELIVERY' : 'PICKUP',
      expectedDate: i < 24 ? undefined : date(i % 3),
      address:
        i >= 24 && i % 2 === 0
          ? 'Endereço fictício — combinar entrega na apresentação'
          : '',
      deliveryNotes: 'Pedido demonstrativo, sem entrega real.',
      agreementNotes: balance.gt(0)
        ? 'Parcelamento na palavra; recebimentos independentes da entrega. Dados fictícios.'
        : '',
      installments: balance.gt(0)
        ? [
            { amount: firstPart.toFixed(2), dueDate: date(-3) },
            { amount: balance.minus(firstPart).toFixed(2), dueDate: date(15) },
          ]
        : [],
      items: selected.map((p, n) => ({
        productId: p.id,
        quantity: n === 0 ? quantity : 1,
      })),
    });
    const at = past(Math.max(0, 6 - Math.floor(i / 5)), 36 - i);
    await db.sale.update({
      where: { id: sale.id },
      data: { createdAt: at, completedAt: i < 24 ? at : null },
    });
    await stamp(sale.id, at);
    await db.payment.updateMany({
      where: { ...scope, idempotencyKey: saleKey },
      data: { occurredAt: at },
    });
    if ([2, 6, 10].includes(i)) {
      const payment = await recordPayment(actor, {
        idempotencyKey: key(`receipt-${i}`),
        kind: 'SALE',
        referenceId: sale.id,
        amount: firstPart.toFixed(2),
        method: 'PIX',
        description: 'Recebimento de parcela demonstrativa',
      });
      await db.payment.update({
        where: { id: payment.id },
        data: { occurredAt: past(0, i) },
      });
      await stamp(payment.id, past(0, i));
    }
  }
  // Cancelamento sem recebimento: conserva histórico e devolve a unidade ao estoque.
  const cancelled = await finalizeSale(actor, {
    idempotencyKey: key('cancelled-sale'),
    customerId: customers[0].id,
    method: 'CREDIT',
    items: [{ productId: products[0].id, quantity: 1 }],
  });
  await cancelSale(actor, {
    saleId: cancelled.id,
    reason: 'Cancelamento demonstrativo com devolução',
    itemsReturned: true,
  });
  for (const [i, [description, amount]] of [
    ['Embalagens para presentes', '48'],
    ['Combustível das entregas', '95'],
    ['Sacolas e etiquetas', '32'],
    ['Internet da operação', '60'],
  ].entries()) {
    const payment = await recordPayment(actor, {
      idempotencyKey: key(`expense-${i}`),
      kind: 'EXPENSE',
      amount,
      method: 'PIX',
      description: `${description} (demonstração)`,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: { occurredAt: past(2, i) },
    });
    await stamp(payment.id, past(2, i));
  }
  await db.auditLog.upsert({
    where: { id: readyId },
    update: {},
    create: {
      id: readyId,
      ...scope,
      actorId: userId,
      type: 'DEMO_READY',
      referenceId: organizationId,
      description:
        'Cenário fictício concluído. Nenhum documento fiscal emitido ou lembrete enviado.',
    },
  });
  return summary(actor, false);
}

async function summary(actor: Actor, alreadySeeded: boolean) {
  const where = { organizationId: actor.organizationId };
  const [products, customers, purchases, sales, payments] = await Promise.all([
    db.product.count({ where }),
    db.customer.count({ where }),
    db.purchase.count({ where }),
    db.sale.count({ where }),
    db.payment.count({ where }),
  ]);
  return {
    organizationId: actor.organizationId,
    alreadySeeded,
    products,
    customers,
    purchases,
    sales,
    payments,
  };
}
