import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { createDatabaseStore } from "@/lib/security/rate-limit";

/**
 * Spec §31 — the shared rate-limit store against Postgres. The point of it is
 * that the count holds across instances, so it is tested under concurrency:
 * simultaneous attempts must not slip under the limit together.
 */

const configured = Boolean(process.env.DATABASE_URL);
const prefix = `itest-rl-${randomUUID().slice(0, 8)}`;

describe("Postgres rate limit store", { skip: !configured && "DATABASE_URL is not set" }, () => {
  const store = createDatabaseStore();

  after(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  it("allows exactly the limit when attempts arrive at once", async () => {
    const options = { limit: 5, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.hit(`${prefix}:burst`, options)),
    );
    assert.equal(results.filter((r) => r.allowed).length, 5);
    assert.ok(results.filter((r) => !r.allowed).every((r) => r.retryAfter > 0));
  });

  it("peeks without counting, and resets on success", async () => {
    const key = `${prefix}:peek`;
    const options = { limit: 2, windowMs: 60_000 };
    await store.hit(key, options);
    await store.peek(key, options);
    await store.peek(key, options);
    assert.equal((await store.hit(key, options)).allowed, true, "peeks were free");
    assert.equal((await store.hit(key, options)).allowed, false);

    await store.reset(key);
    assert.equal((await store.hit(key, options)).allowed, true);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const key = `${prefix}:expiry`;
    const options = { limit: 1, windowMs: 1_000 };
    assert.equal((await store.hit(key, options)).allowed, true);
    assert.equal((await store.hit(key, options)).allowed, false);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal((await store.hit(key, options)).allowed, true);
  });
});
