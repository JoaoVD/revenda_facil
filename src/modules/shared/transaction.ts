import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { BusinessError } from '@/lib/errors';
export const hash = (input: unknown) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');
export function sameRequest(stored: string, input: unknown) {
  if (stored !== hash(input))
    throw new BusinessError(
      'Esta operação já foi enviada com outros dados. Atualize a página.',
    );
}
export async function atomic<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code) &&
        attempt < 4
      )
        continue;
      throw error;
    }
  }
  throw new BusinessError('Operação concorrente. Tente novamente.');
}
