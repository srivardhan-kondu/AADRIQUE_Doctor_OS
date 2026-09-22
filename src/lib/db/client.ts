import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The Prisma client singleton.
 *
 * Prisma 7 connects through a driver adapter rather than a bundled engine, so
 * the `pg` pool is what actually talks to Postgres. In development Next.js
 * re-evaluates modules on every hot reload, which would otherwise open a new
 * pool each time until the database refuses connections — so the instance is
 * cached on `globalThis`.
 *
 * This module is server-only. Nothing in `src/app` should import it directly:
 * queries belong in `src/server/` behind a service, per the architecture rule
 * in AGENTS.md (UI → service → repository → database).
 */

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in a PostgreSQL connection string.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
