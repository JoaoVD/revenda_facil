import { db } from '@/lib/db';
import { D, money } from '@/lib/money';
import { BusinessError } from '@/lib/errors';
import { atomic, hash } from '@/modules/shared/transaction';
import type { Actor } from '@/modules/shared/contracts';
import { createProductInTransaction } from '@/modules/products/service';
import {
  invoiceConfirmation,
  type InvoiceDraft,
  type InvoiceLine,
} from './invoice-contracts';
import { parsePurchaseInvoice } from './invoice-xml';
import { createReceivedPurchase, findPurchaseReplay } from './service';

const productDetails = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  active: true,
} as const;
const unitCodes = new Set(['UN', 'UND', 'UNID', 'PC', 'PÇ', 'PCA', 'PEÇA']);
const aliasKey = (item: Pick<InvoiceLine, 'code' | 'unit'>) =>
  JSON.stringify([item.code, item.unit]);

export async function previewPurchaseInvoice(
  actor: Actor,
  cnpj: string,
  xml: string,
  expectedKey?: string,
): Promise<InvoiceDraft> {
  const invoice = parsePurchaseInvoice(xml, cnpj, expectedKey);
  const organizationId = actor.organizationId;
  const alreadyReceived = await db.purchase.findUnique({
    where: {
      organizationId_accessKey: {
        organizationId,
        accessKey: invoice.accessKey,
      },
    },
    select: { id: true },
  });
  if (alreadyReceived)
    throw new BusinessError('Essa NF-e já deu entrada no estoque.');
  const [aliases, barcodes, catalog] = await Promise.all([
    db.supplierProductCode.findMany({
      where: {
        organizationId,
        supplierDocument: invoice.supplierDocument,
        code: { in: invoice.items.map((item) => item.code) },
      },
      include: { product: { select: productDetails } },
    }),
    db.product.findMany({
      where: {
        organizationId,
        barcode: {
          in: invoice.items.map((item) => item.barcode).filter(Boolean),
        },
      },
      select: productDetails,
    }),
    db.product.findMany({
      where: { organizationId, active: true },
      select: productDetails,
      orderBy: { name: 'asc' },
      take: 200,
    }),
  ]);
  const options = new Map(catalog.map((product) => [product.id, product]));
  for (const product of [...barcodes, ...aliases.map((alias) => alias.product)])
    if (product.active) options.set(product.id, product);
  const aliasesByCode = new Map(
    aliases.map((alias) => [aliasKey(alias), alias]),
  );
  const items = invoice.items.map((item) => {
    const alias = aliasesByCode.get(aliasKey(item));
    const products = item.barcode
      ? barcodes.filter((product) => product.barcode === item.barcode)
      : [];
    const matchedBarcode =
      products.length === 1 && products[0].active ? products[0].id : '';
    const aliasConflict =
      alias &&
      products.length &&
      !products.some((product) => product.id === alias.productId);
    const matchedAlias = alias?.product.active && !aliasConflict ? alias : null;
    return {
      ...item,
      matchedProductId:
        matchedAlias?.productId ?? (alias ? '' : matchedBarcode),
      unitsPerPackage:
        matchedAlias?.unitsPerPackage ?? (unitCodes.has(item.unit) ? 1 : null),
      needsReview:
        !matchedAlias && (!!alias || (products.length > 0 && !matchedBarcode)),
    };
  });
  return {
    accessKey: invoice.accessKey,
    supplier: invoice.supplier,
    date: invoice.date,
    total: invoice.total,
    allocations: invoice.allocations,
    products: [...options.values()].map(({ id, name, sku }) => ({
      id,
      name,
      sku,
    })),
    items,
  };
}

export async function confirmPurchaseInvoice(
  actor: Actor,
  cnpj: string,
  raw: unknown,
) {
  const input = invoiceConfirmation.parse(raw);
  const invoice = parsePurchaseInvoice(input.xml, cnpj, input.expectedKey);
  const selections = new Map(input.items.map((item) => [item.line, item]));
  if (
    selections.size !== invoice.items.length ||
    selections.size !== input.items.length
  )
    throw new BusinessError(
      'Confira todos os itens antes de confirmar a entrada.',
    );
  const request = {
    type: 'invoice',
    xmlHash: hash(input.xml),
    items: input.items,
  };
  const organizationId = actor.organizationId;
  const { supplierDocument, accessKey, supplier, date } = invoice;
  return atomic(async (tx) => {
    const existing = await findPurchaseReplay(
      tx,
      actor,
      { idempotencyKey: input.idempotencyKey, accessKey },
      request,
    );
    if (existing) return existing;
    const grouped = new Map<
      string,
      { quantity: number; total: ReturnType<typeof D> }
    >();
    const remembered = new Map<
      string,
      { productId: string; unitsPerPackage: number }
    >();
    const created = new Map<
      string,
      { productId: string; name: string; salePrice: string }
    >();

    for (const item of invoice.items) {
      const selection = selections.get(item.line);
      if (!selection)
        throw new BusinessError('Confira o item ' + item.line + ' da nota.');
      const { unitsPerPackage, product } = selection;
      const units = D(item.quantity).mul(unitsPerPackage);
      if (!units.isInteger() || units.lt(1) || units.gt(1_000_000))
        throw new BusinessError(
          'A quantidade em estoque do item ' +
            item.line +
            ' deve ser um número inteiro de unidades.',
        );
      const code = aliasKey(item);
      let productId: string;
      if (product.kind === 'existing') {
        productId = product.id;
      } else {
        // cEAN da caixa pode divergir do código da unidade revendida.
        const barcode =
          unitsPerPackage === 1 && unitCodes.has(item.unit) ? item.barcode : '';
        const sku =
          barcode || 'NF-' + hash([supplierDocument, code]).slice(0, 24);
        const previous = created.get(sku);
        if (
          previous &&
          (previous.name !== product.name ||
            !D(previous.salePrice).eq(product.salePrice))
        )
          throw new BusinessError(
            'Confira o nome e o preço do produto repetido na nota.',
          );
        if (previous) productId = previous.productId;
        else {
          const registered = await createProductInTransaction(tx, actor, {
            name: product.name,
            sku,
            barcode,
            salePrice: product.salePrice,
            referenceCost: money(D(item.lineCost).div(units)),
          });
          productId = registered.id;
          created.set(sku, {
            productId,
            name: product.name,
            salePrice: product.salePrice,
          });
        }
      }
      const previous = remembered.get(code);
      if (
        previous &&
        (previous.productId !== productId ||
          previous.unitsPerPackage !== unitsPerPackage)
      )
        throw new BusinessError(
          'Use o mesmo cadastro e conversão para linhas com o mesmo código e unidade do fornecedor.',
        );
      remembered.set(code, { productId, unitsPerPackage });
      const group = grouped.get(productId) ?? { quantity: 0, total: D(0) };
      group.quantity += units.toNumber();
      group.total = group.total.plus(item.lineCost);
      grouped.set(productId, group);
    }

    const purchase = await createReceivedPurchase(
      tx,
      actor,
      {
        supplier,
        date,
        recipientDocument: cnpj,
        accessKey,
        idempotencyKey: input.idempotencyKey,
        items: [...grouped].map(([productId, { quantity, total }]) => ({
          productId,
          quantity,
          total: money(total),
          unitCost: total.div(quantity).toFixed(4),
        })),
      },
      request,
    );
    for (const [key, alias] of remembered) {
      const [code, unit] = JSON.parse(key) as [string, string];
      const identity = { organizationId, supplierDocument, code, unit };
      await tx.supplierProductCode.upsert({
        where: { organizationId_supplierDocument_code_unit: identity },
        create: { ...identity, ...alias },
        update: alias,
      });
    }
    return purchase;
  });
}
