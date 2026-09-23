import "server-only";
import { prisma } from "@/lib/db";
import {
  type RateLimitOptions,
  type RateLimitStore,
  createMemoryStore,
  peeked,
  result,
} from "./rate-limit-window";

export { callerAddress } from "./rate-limit-window";
export type { RateLimitResult } from "./rate-limit-window";

/**
 * Spec §31 — rate limiting.
 *
 * A fixed-window limiter behind a small store interface. In production the
 * counters live in Postgres, so the limit holds across every instance of the
 * app and survives a restart; tests use an in-memory store with the same
 * contract.
 *
 * It fails closed on the identifier, not on the limiter: an unknown caller is
 * bucketed under a shared key rather than waved through.
 */

/**
 * Counters in Postgres, shared by every instance of the app.
 *
 * One statement per attempt: the upsert either starts a fresh window or
 * counts into the current one, atomically, so two instances counting the
 * same key at the same moment cannot both slip under the limit.
 */
export function createDatabaseStore(): RateLimitStore {
  let hits = 0;

  return {
    async hit(key, options) {
      const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
        INSERT INTO "RateLimit" ("key", "count", "resetAt")
        VALUES (${key}, 1, now() + make_interval(secs => ${options.windowMs / 1000}))
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1
                         ELSE "RateLimit"."count" + 1 END,
          "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt"
                           ELSE "RateLimit"."resetAt" END
        RETURNING "count", "resetAt"`;

      // Now and then, clear windows long expired so the table stays small.
      hits += 1;
      if (hits % 200 === 0) {
        await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < now() - interval '1 hour'`;
      }

      const row = rows[0];
      return result(Number(row.count), row.resetAt.getTime(), options, Date.now());
    },
    async peek(key, options) {
      const row = await prisma.rateLimit.findUnique({ where: { key } });
      const now = Date.now();
      if (!row || row.resetAt.getTime() <= now) {
        return { allowed: true, remaining: options.limit, retryAfter: 0 };
      }
      return peeked(row.count, row.resetAt.getTime(), options, now);
    },
    async reset(key) {
      await prisma.rateLimit.deleteMany({ where: { key } });
    },
  };
}

/**
 * The store in use: Postgres, so the limit holds across every instance, or
 * process memory when RATE_LIMIT_STORE=memory (tests, a single instance).
 */
const store: RateLimitStore =
  process.env.RATE_LIMIT_STORE === "memory"
    ? createMemoryStore()
    : createDatabaseStore();

export function rateLimit(key: string, options: RateLimitOptions) {
  return store.hit(key, options);
}

/**
 * Reports on a key without spending an attempt.
 *
 * Lets a friendlier layer in front (a form that wants to say "too many
 * attempts" rather than "wrong password") check the same counter the
 * authoritative layer enforces, without counting the attempt twice.
 */
export function peekRateLimit(key: string, options: RateLimitOptions) {
  return store.peek(key, options);
}

/** The two buckets that guard sign-in (spec §31). */
export const SIGN_IN_ADDRESS_LIMIT = { limit: 10, windowMs: 60_000 } as const;
export const SIGN_IN_ACCOUNT_LIMIT = { limit: 5, windowMs: 300_000 } as const;

export function signInKeys(address: string, email: string) {
  return {
    address: `signin:ip:${address}`,
    account: `signin:acct:${email.toLowerCase()}`,
  };
}

/** Clears a key after a success, so one good sign-in resets the counter. */
export function resetRateLimit(key: string): Promise<void> {
  return store.reset(key);
}

