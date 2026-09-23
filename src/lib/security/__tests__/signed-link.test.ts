import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { signId, verifySignedId } from "@/lib/security/signed-link";

/** Spec §31 — a patient link cannot be forged or altered. */

describe("signed links", () => {
  const saved = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-with-enough-length";
  });
  afterEach(() => {
    process.env.AUTH_SECRET = saved;
  });

  it("round-trips an id", () => {
    const signed = signId("qe_123")!;
    assert.match(signed, /^qe_123\.[\w-]{22}$/);
    assert.equal(verifySignedId(signed), "qe_123");
  });

  it("rejects an altered id or signature", () => {
    const signed = signId("qe_123")!;
    assert.equal(verifySignedId(signed.replace("qe_123", "qe_124")), null);
    assert.equal(verifySignedId(`${signed.slice(0, -1)}A`), null);
    assert.equal(verifySignedId("qe_123"), null);
    assert.equal(verifySignedId(""), null);
  });

  it("rejects a link signed under another secret", () => {
    const signed = signId("qe_123")!;
    process.env.AUTH_SECRET = "a-different-secret-entirely";
    assert.equal(verifySignedId(signed), null);
  });

  it("fails closed with no secret configured", () => {
    delete process.env.AUTH_SECRET;
    assert.equal(signId("qe_123"), null);
    assert.equal(verifySignedId("qe_123.abcdefghijklmnopqrstuv"), null);
  });
});
