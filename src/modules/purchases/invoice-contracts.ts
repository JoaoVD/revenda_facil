import { z } from 'zod';
import { amount, id, key } from '@/modules/shared/contracts';

export const MAX_XML_BYTES = 250_000;
export const MAX_INVOICE_ITEMS = 100;

export function validNfeKey(value: string) {
  if (!/^\d{44}$/.test(value) || value.slice(20, 22) !== '55') return false;
  let sum = 0;
  for (let i = 42; i >= 0; i--) sum += Number(value[i]) * (2 + ((42 - i) % 8));
  const digit = 11 - (sum % 11);
  return Number(value[43]) === (digit >= 10 ? 0 : digit);
}

export const nfeKey = z
  .string()
  .trim()
  .max(80)
  .transform((value) => value.replace(/\s/g, ''))
  .refine(validNfeKey, 'A chave da NF-e deve ter 44 dígitos válidos.');

export function gtin(value: string) {
  if (
    !/^\d+$/.test(value) ||
    ![8, 12, 13, 14].includes(value.length) ||
    /^0+$/.test(value)
  )
    return '';
  const last = value.length - 1;
  let sum = 0;
  for (let i = last - 1; i >= 0; i--)
    sum += Number(value[i]) * ((last - i) % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(value[last]) ? value : '';
}

export const invoiceXml = z.string().min(1).max(MAX_XML_BYTES);
const selection = z.object({
  line: z.number().int().positive().max(MAX_INVOICE_ITEMS),
  unitsPerPackage: z.coerce.number().int().min(1).max(1_000_000),
  product: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('existing'), id }),
    z.object({
      kind: z.literal('new'),
      name: z.string().trim().min(2).max(120),
      salePrice: amount,
    }),
  ]),
});
export const invoiceConfirmation = z.object({
  idempotencyKey: key,
  xml: invoiceXml,
  expectedKey: nfeKey.optional(),
  items: z.array(selection).min(1).max(MAX_INVOICE_ITEMS),
});
export type InvoiceSelection = z.input<typeof selection>;
export type InvoiceProduct = { id: string; name: string; sku: string };
export type InvoiceLine = {
  line: number;
  name: string;
  code: string;
  barcode: string;
  unit: string;
  quantity: string;
  lineCost: string;
};
export type InvoiceDraft = {
  accessKey: string;
  supplier: string;
  date: string;
  total: string;
  allocations: boolean;
  products: InvoiceProduct[];
  items: (InvoiceLine & {
    matchedProductId: string;
    unitsPerPackage: number | null;
    needsReview: boolean;
  })[];
};
