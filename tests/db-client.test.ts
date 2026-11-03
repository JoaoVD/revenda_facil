import { expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
test('bundles de produção compartilham o cliente no mesmo processo', async () => {
  const globalDb = globalThis as unknown as { prisma?: PrismaClient };
  const previous = globalDb.prisma;
  delete globalDb.prisma;
  vi.stubEnv('NODE_ENV', 'production');
  let first: PrismaClient | undefined, second: PrismaClient | undefined;
  try {
    vi.resetModules();
    first = (await import('@/lib/db')).db;
    vi.resetModules();
    second = (await import('@/lib/db')).db;
    expect(second === first).toBe(true);
  } finally {
    await first?.$disconnect();
    await second?.$disconnect();
    globalDb.prisma = previous;
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
