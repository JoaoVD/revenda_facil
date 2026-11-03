import { z } from 'zod';
import { id } from '@/modules/shared/contracts';
export const commandInput = z.object({
  id,
  organizationId: id,
  userId: id,
  contractVersion: z.literal(1),
  type: z.enum(['CUSTOMER', 'ORDER', 'DELIVERY', 'PAYMENT']),
  capturedAt: z.iso.datetime(),
  dependencies: z.array(id).max(100),
  payload: z.record(z.string(), z.json()),
});
export type Command = z.infer<typeof commandInput>;
