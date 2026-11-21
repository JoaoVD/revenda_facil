'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/modules/auth/server';
import { db } from '@/lib/db';
import { BusinessError, publicError } from '@/lib/errors';
import { invoiceXml, nfeKey, type InvoiceDraft } from './invoice-contracts';
import {
  confirmPurchaseInvoice,
  previewPurchaseInvoice,
} from './invoice-service';
import { lookupReceivedInvoice } from './focus-received';

type PreviewResult =
  | { ok: true; draft: InvoiceDraft; xml: string }
  | { ok: false; message: string };

async function alreadyReceived(organizationId: string, accessKey: string) {
  return Boolean(
    await db.purchase.findUnique({
      where: { organizationId_accessKey: { organizationId, accessKey } },
      select: { id: true },
    }),
  );
}

/**
 * Busca a nota pela chave (Focus, quando configurada) ou lê o XML enviado.
 * `expectedKey`: chave lida no DANFE; o XML precisa ser da mesma nota.
 */
export async function loadPurchaseInvoice(
  source: 'xml' | 'key',
  value: string,
  expectedKey?: string,
): Promise<PreviewResult> {
  const actor = await requireActor();
  try {
    const cnpj = actor.organization.cnpj;
    if (source !== 'xml' && source !== 'key')
      throw new BusinessError('Escolha como importar a nota.');
    const key =
      source === 'key'
        ? nfeKey.parse(value)
        : expectedKey === undefined
          ? undefined
          : nfeKey.parse(expectedKey);
    if (key && (await alreadyReceived(actor.organizationId, key)))
      throw new BusinessError('Essa NF-e já deu entrada no estoque.');
    const xml =
      source === 'key'
        ? await lookupReceivedInvoice(cnpj, key!)
        : invoiceXml.parse(value);
    return {
      ok: true,
      xml,
      draft: await previewPurchaseInvoice(actor, cnpj, xml, key),
    };
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
}

/** Confere, sem serviço externo, se a nota lida já deu entrada. */
export async function checkPurchaseInvoiceKey(
  value: string,
): Promise<{ ok: boolean; message?: string }> {
  const actor = await requireActor();
  try {
    const key = nfeKey.parse(value);
    if (await alreadyReceived(actor.organizationId, key))
      return { ok: false, message: 'Essa NF-e já deu entrada no estoque.' };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
}

export async function registerPurchaseInvoice(raw: unknown) {
  const actor = await requireActor();
  try {
    await confirmPurchaseInvoice(actor, actor.organization.cnpj, raw);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Compra registrada e estoque atualizado.' };
  } catch (error) {
    return { ok: false, message: publicError(error) };
  }
}

export async function searchPurchaseProducts(value: string) {
  const actor = await requireActor();
  const term = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  if (!term) return [];
  return db.product.findMany({
    where: {
      organizationId: actor.organizationId,
      active: true,
      OR: [
        { barcode: term },
        { sku: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, sku: true },
    orderBy: { name: 'asc' },
    take: 25,
  });
}
