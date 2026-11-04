import { z } from 'zod';
import { id, amount } from '@/modules/shared/contracts';
export const commandLabels: Record<string, string> = {
  ORDER: 'Pedido',
  DELIVERY: 'Entrega ou retirada',
  PAYMENT: 'Recebimento',
  CUSTOMER: 'Cadastro de cliente',
};
export const resolutionInput = z.object({
  idempotencyKey: id,
  commandId: id,
  expectedRevision: z.number().int().min(0),
  action: z.enum([
    'RETRY',
    'ORDER_PRICES',
    'DELIVERY_VERSION',
    'PAYMENT_TARGET',
    'CUSTOMER_CURRENT',
  ]),
  reason: z.string().trim().min(5).max(300),
  expectedTotal: amount.optional(),
  expectedVersion: z.number().int().positive().optional(),
  targetSaleId: id.optional(),
  installments: z
    .array(z.object({ amount, dueDate: z.iso.date().optional() }))
    .max(60)
    .optional(),
});
export type ConflictReview = {
  id: string;
  type: string;
  status: string;
  message: string | null;
  revision: number;
  capturedAt: string;
  originalAmount?: string;
  currentTotal?: string;
  paid?: string;
  items?: {
    name: string;
    quantity: number;
    available: number;
    price: string;
  }[];
  installments?: { amount: string; dueDate?: string }[];
  sale?: {
    id: string;
    version: number;
    status: string;
    fulfillmentStatus: string;
    balance: string;
  };
  customerName?: string;
  targets?: { id: string; label: string; balance: string }[];
  blockedBy: { id: string; type: string; status: string }[];
};
