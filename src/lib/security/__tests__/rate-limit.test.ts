import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { callerAddress, createMemoryStore } from "@/lib/security/rate-limit-window";

/**
 * Spec §31 — rate limiting. The window logic, against the in-memory store;
 * the Postgres store keeps the same contract and is tested against a real
 * database in src/server/__tests__/rate-limit.integration.ts.
 */

describe("rate limit window", () => {
  let store = createMemoryStore();
  beforeEach(() => {
    store = createMemoryStore();
  });

  it("allows up to the limit and then refuses", async () => {
    const options = { limit: 3, windowMs: 60_000 };

    for (let i = 0; i < 3; i += 1) {
      assert.equal((await store.hit("k", options)).allowed, true, `attempt ${i + 1}`);
    }

    const blocked = await store.hit("k", options);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0, "a refusal says when to come back");
  });

  it("counts each key separately", async () => {
    const options = { limit: 1, windowMs: 60_000 };
    assert.equal((await store.hit("a", options)).allowed, true);
    assert.equal((await store.hit("b", options)).allowed, true);
    assert.equal((await store.hit("a", options)).allowed, false);
  });

  it("reports how many attempts remain", async () => {
    const options = { limit: 3, windowMs: 60_000 };
    assert.equal((await store.hit("k", options)).remaining, 2);
    assert.equal((await store.hit("k", options)).remaining, 1);
    assert.equal((await store.hit("k", options)).remaining, 0);
  });

  it("peeks without spending an attempt", async () => {
    const options = { limit: 2, windowMs: 60_000 };
    assert.deepEqual(await store.peek("k", options), {
      allowed: true,
      remaining: 2,
      retryAfter: 0,
    });
    await store.hit("k", options);
    await store.hit("k", options);
    const peek = await store.peek("k", options);
    assert.equal(peek.allowed, false);
    assert.equal((await store.peek("k", options)).remaining, 0, "peeking is free");
  });

  it("starts a new window once the old one expires", async () => {
    const options = { limit: 1, windowMs: 20 };
    assert.equal((await store.hit("k", options)).allowed, true);
    assert.equal((await store.hit("k", options)).allowed, false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal((await store.hit("k", options)).allowed, true);
  });

  it("clears a key on success", async () => {
    const options = { limit: 2, windowMs: 60_000 };
    await store.hit("k", options);
    await store.hit("k", options);
    assert.equal((await store.hit("k", options)).allowed, false);

    await store.reset("k");
    assert.equal((await store.hit("k", options)).allowed, true);
  });
});

describe("callerAddress", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    assert.equal(callerAddress(headers), "203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    assert.equal(
      callerAddress(new Headers({ "x-real-ip": "203.0.113.9" })),
      "203.0.113.9",
    );
  });

  it("returns null rather than guessing", () => {
    assert.equal(callerAddress(new Headers()), null);
  });
});
