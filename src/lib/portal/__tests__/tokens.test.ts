import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  codeMatches,
  decodePortalSession,
  encodePortalSession,
  generateCode,
  hashCode,
} from "@/lib/portal/tokens";

/** Spec §31 — the patient portal's codes and sessions. */

const secret = "portal-test-secret";
const session = { o: "org_1", p: "+919876543210", pid: "pat_1", exp: 2_000_000_000_000 };

describe("portal session", () => {
  it("round-trips a signed session", () => {
    const token = encodePortalSession(session, secret);
    assert.deepEqual(decodePortalSession(token, secret, 1_000), session);
  });

  it("refuses a tampered, foreign, expired or malformed token", () => {
    const token = encodePortalSession(session, secret);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...session, pid: "pat_2" })).toString("base64url");

    assert.equal(decodePortalSession(`${forged}.${sig}`, secret, 1_000), null, "another patient");
    assert.equal(decodePortalSession(token, "another-secret", 1_000), null);
    assert.equal(decodePortalSession(token, secret, session.exp + 1), null, "expired");
    assert.equal(decodePortalSession(`${body}`, secret, 1_000), null);
    assert.equal(decodePortalSession(null, secret), null);
    assert.equal(
      decodePortalSession(`${Buffer.from("{}").toString("base64url")}.x`, secret),
      null,
    );
  });
});

describe("sign-in codes", () => {
  it("are six digits", () => {
    for (let i = 0; i < 50; i += 1) assert.match(generateCode(), /^\d{6}$/);
  });

  it("match only for the same code, number and secret", () => {
    const stored = hashCode("123456", "+919876543210", secret);
    assert.equal(codeMatches("123456", "+919876543210", stored, secret), true);
    assert.equal(codeMatches("123457", "+919876543210", stored, secret), false);
    assert.equal(codeMatches("123456", "+919876543211", stored, secret), false, "another number");
    assert.equal(codeMatches("123456", "+919876543210", stored, "other"), false);
    assert.equal(codeMatches("12345", "+919876543210", stored, secret), false);
  });
});
