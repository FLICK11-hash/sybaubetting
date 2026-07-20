import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. Next.js hot-reloads modules in dev, which would
 * otherwise create a new PrismaClient (and a new connection pool) on every
 * edit; caching it on `globalThis` avoids exhausting Postgres connections.
 */
export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
