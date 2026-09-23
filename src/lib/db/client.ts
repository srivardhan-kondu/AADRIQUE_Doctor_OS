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
    adapter: new PrismaPg({
      connectionString,
      // A new connection to a hosted database costs a TLS handshake and an
      // auth round trip — seconds, not milliseconds, from a distant region.
      // pg's default drops idle connections after 10s, so every request after
      // a short pause paid that cost again. Keep them for five minutes.
      idleTimeoutMillis: 5 * 60_000,
      keepAlive: true,
      // With no limit, a connection attempt that stalls in the network waits
      // for the operating system to give up (75s on macOS), and the request
      // with it. Fail in a bounded time instead.
      connectionTimeoutMillis: 15_000,
    }),
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
