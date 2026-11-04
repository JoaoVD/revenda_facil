import type { Prisma } from '@prisma/client';
import type { Actor } from '@/modules/shared/contracts';
import { BusinessError } from '@/lib/errors';
export async function ensureNoPendingFacts(
  tx: Prisma.TransactionClient,
  actor: Actor,
  saleId: string,
) {
  const pending = await tx.syncCommand.count({
    where: {
      organizationId: actor.organizationId,
      status: { in: ['PENDING', 'WAITING', 'ATTENTION'] },
      OR: [
        {
          type: 'PAYMENT',
          OR: [
            { payload: { path: ['referenceId'], equals: saleId } },
            { resolvedPayload: { path: ['referenceId'], equals: saleId } },
          ],
        },
        { type: 'DELIVERY', payload: { path: ['saleId'], equals: saleId } },
      ],
    },
  });
  if (pending)
    throw new BusinessError(
      'Há recebimentos ou entregas capturados para conferir. Resolva as pendências de sincronização deste pedido antes de alterá-lo ou cancelar.',
    );
}
