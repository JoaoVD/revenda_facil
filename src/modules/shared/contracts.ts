import { z } from 'zod';
export const amount = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    'Use um valor positivo com até duas casas decimais.',
  );
export const id = z.string().uuid();
export const key = z.string().uuid();
export const optionalText = z.string().trim().max(500).optional().default('');
export const productInput = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(1).max(50),
  brand: z.string().trim().max(80).default(''),
  category: z.string().trim().max(80).default(''),
  barcode: z.string().trim().max(30).default(''),
  description: optionalText,
  referenceCost: amount,
  salePrice: amount,
  minimumStock: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const purchaseInput = z.object({
  idempotencyKey: key,
  supplier: z.string().trim().min(2).max(120),
  date: z.iso.date(),
  recipientDocument: z
    .string()
    .regex(/^(\d{11}|\d{14})?$/)
    .default(''),
  accessKey: z
    .string()
    .regex(/^(\d{44})?$/)
    .default(''),
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.coerce.number().int().min(1).max(1000000),
        unitCost: amount,
      }),
    )
    .min(1)
    .max(100),
});
export const saleInput = z.object({
  orderId: id.optional(),
  expectedTotal: amount.optional(),
  idempotencyKey: key,
  customerId: id.optional(),
  newCustomer: z
    .object({
      id,
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(20).default(''),
    })
    .optional(),
  discount: amount.default('0'),
  paid: amount.default('0'),
  method: z.enum(['PIX', 'CASH', 'CARD', 'CREDIT']),
  fulfillmentMode: z
    .enum(['IMMEDIATE', 'DELIVERY', 'PICKUP'])
    .default('IMMEDIATE'),
  expectedDate: z.iso.date().optional(),
  address: optionalText,
  deliveryNotes: optionalText,
  agreementNotes: optionalText,
  installments: z
    .array(z.object({ amount, dueDate: z.iso.date().optional() }))
    .max(60)
    .default([]),
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.coerce.number().int().min(1).max(1000000),
      }),
    )
    .min(1)
    .max(100),
});
export const paymentInput = z.object({
  idempotencyKey: key,
  kind: z.enum(['SALE', 'PURCHASE', 'EXPENSE']),
  referenceId: id.optional(),
  amount: amount,
  method: z.enum(['PIX', 'CASH', 'CARD']),
  description: z.string().trim().min(2).max(200),
});
export const customerInput = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).default(''),
  document: z
    .string()
    .regex(/^(\d{11}|\d{14})?$/)
    .default(''),
  email: z.union([z.email(), z.literal('')]).default(''),
  notes: optionalText,
});
export type Actor = { userId: string; organizationId: string };
