import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma client singleton.
 *
 * Uses the PrismaPg adapter with the DATABASE_URL connection string.
 * In development, the instance is cached on `globalThis` so that
 * hot-reloads (tsx watch) reuse the same connection pool.
 */

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

/**
 * Gracefully disconnect from the database.
 * Call this during server shutdown.
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
