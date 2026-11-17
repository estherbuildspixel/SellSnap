// Validate configuration as soon as the database module is loaded. Every
// server-side data path imports this module, so a missing required variable
// fails fast instead of surfacing on the first request.
import { env } from '@/lib/env';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
