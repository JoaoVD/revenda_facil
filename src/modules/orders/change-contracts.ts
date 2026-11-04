import { z } from 'zod';
import { id, amount, saleInput } from '@/modules/shared/contracts';
export const editOrderInput = saleInput
  .omit({ orderId: true, paid: true, method: true })
  .extend({
    saleId: id,
    expectedVersion: z.number().int().positive(),
    expectedTotal: amount,
    fulfillmentMode: z.enum(['DELIVERY', 'PICKUP']),
    customerId: id,
    reason: z.string().trim().min(5).max(300),
    installments: z
      .array(z.object({ amount, dueDate: z.iso.date().optional() }))
      .max(60),
  });
export const refundCancelInput = z.object({
  idempotencyKey: id,
  saleId: id,
  expectedVersion: z.number().int().positive(),
  amount,
  method: z.enum(['PIX', 'CASH', 'CARD']),
  reason: z.string().trim().min(5).max(300),
  confirmed: z.literal(true),
  itemsReturned: z.boolean().default(false),
});
