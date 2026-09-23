import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  callerAddress,
  clearAllRateLimits,
  rateLimit,
  resetRateLimit,
} from "@/lib/security/rate-limit";

/** Spec §31 — rate limiting. */

describe("rateLimit", () => {
  beforeEach(() => clearAllRateLimits());

  it("allows up to the limit and then refuses", () => {
    const options = { limit: 3, windowMs: 60_000 };

    for (let i = 0; i < 3; i += 1) {
      assert.equal(rateLimit("k", options).allowed, true, `attempt ${i + 1}`);
    }

    const blocked = rateLimit("k", options);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0, "a refusal says when to come back");
  });

  it("counts each key separately", () => {
    const options = { limit: 1, windowMs: 60_000 };
    assert.equal(rateLimit("a", options).allowed, true);
    assert.equal(rateLimit("b", options).allowed, true);
    assert.equal(rateLimit("a", options).allowed, false);
  });

  it("reports how many attempts remain", () => {
    const options = { limit: 3, windowMs: 60_000 };
    assert.equal(rateLimit("k", options).remaining, 2);
    assert.equal(rateLimit("k", options).remaining, 1);
    assert.equal(rateLimit("k", options).remaining, 0);
  });

  it("starts a new window once the old one expires", async () => {
    const options = { limit: 1, windowMs: 20 };
    assert.equal(rateLimit("k", options).allowed, true);
    assert.equal(rateLimit("k", options).allowed, false);

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(rateLimit("k", options).allowed, true);
  });

  it("clears a key on success", () => {
    const options = { limit: 2, windowMs: 60_000 };
    rateLimit("k", options);
    rateLimit("k", options);
    assert.equal(rateLimit("k", options).allowed, false);

    resetRateLimit("k");
    assert.equal(rateLimit("k", options).allowed, true);
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
