import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESET_TTL_MS, createResetToken, resetTokenUserId, verifyResetToken } from "@/lib/auth/reset-token";

/** Spec §31 — reset links are signed, expire, and work once. */

const secret = "test-secret";
const subject = { userId: "user_1", passwordHash: "scrypt$old", sessionVersion: 3 };

describe("reset tokens", () => {
  it("verifies for the account it was made for, until it expires", () => {
    const now = 1_000_000;
    const token = createResetToken(subject, secret, now);
    assert.equal(resetTokenUserId(token), "user_1");
    assert.equal(verifyResetToken(token, subject, secret, now + 60_000), "valid");
    assert.equal(verifyResetToken(token, subject, secret, now + RESET_TTL_MS + 1), "expired");
  });

  it("stops working once the password or sessions change", () => {
    const token = createResetToken(subject, secret);
    assert.equal(verifyResetToken(token, { ...subject, passwordHash: "scrypt$new" }, secret), "invalid");
    assert.equal(verifyResetToken(token, { ...subject, sessionVersion: 4 }, secret), "invalid");
  });

  it("refuses a forged, altered or foreign token", () => {
    const token = createResetToken(subject, secret);
    assert.equal(verifyResetToken(token, subject, "other-secret"), "invalid");
    assert.equal(verifyResetToken(token, { ...subject, userId: "user_2" }, secret), "invalid");
    const [id, , sig] = token.split(".");
    const later = (Date.now() + 10 * RESET_TTL_MS).toString(36);
    assert.equal(verifyResetToken(`${id}.${later}.${sig}`, subject, secret), "invalid");
    assert.equal(resetTokenUserId("a.b"), null);
    assert.equal(resetTokenUserId("a.b.c.d"), null);
  });
});
