import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
// Next pode avaliar o módulo em bundles distintos de páginas e ações também em
// produção. Um cliente por processo evita pools de conexões duplicados.
globalDb.prisma = db;
