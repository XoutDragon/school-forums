import { PrismaClient } from '@prisma/client';

declare global {
  // Module-scoped singleton so tsx watch reloads don't open a new pool each time.
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;
