import { PrismaClient } from '@prisma/client';
import { expect, test } from 'vitest';
// Opt-in explícito: motor PostgreSQL convencional, nunca PGlite. Duas conexões
// independentes exercitam o mesmo predicado SQL da reserva em Serializable.
test.skipIf(
  !process.env.TEST_POSTGRES_CONCURRENCY || !process.env.TEST_DATABASE_URL,
)(
  'PostgreSQL real: conexões independentes não reservam além do físico',
  async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const one = new PrismaClient({ datasources: { db: { url } } }),
      two = new PrismaClient({ datasources: { db: { url } } });
    const organizationId = crypto.randomUUID(),
      productId = crypto.randomUUID();
    try {
      await one.organization.create({
        data: {
          id: organizationId,
          name: 'TEST concorrência',
          ownerName: 'TEST',
          cnpj: crypto.randomUUID(),
          city: 'TEST',
        },
      });
      await one.product.create({
        data: {
          id: productId,
          organizationId,
          name: 'TEST estoque',
          sku: 'TEST',
          referenceCost: '40',
          salePrice: '100',
          stock: 3,
        },
      });
      let arrivals = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const sessions = new Set<number>();
      const reserve = (client: PrismaClient) =>
        client.$transaction(
          async (tx) => {
            const [{ pid }] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            sessions.add(pid);
            await tx.product.findUniqueOrThrow({ where: { id: productId } });
            if (++arrivals === 2) release();
            await barrier;
            return tx.$executeRaw`UPDATE "Product" SET "reserved" = "reserved" + 2 WHERE "id" = ${productId} AND "organizationId" = ${organizationId} AND "stock" - "reserved" >= 2`;
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        );
      const results = await Promise.allSettled([reserve(one), reserve(two)]);
      expect(sessions.size).toBe(2);
      expect(
        results.filter((r) => r.status === 'fulfilled' && r.value === 1),
      ).toHaveLength(1);
      const product = await one.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(product.stock).toBe(3);
      expect(product.reserved).toBe(2);
    } finally {
      await one.product.deleteMany({ where: { organizationId } });
      await one.organization.deleteMany({ where: { id: organizationId } });
      await one.$disconnect();
      await two.$disconnect();
    }
  },
);
