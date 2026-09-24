import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base32Decode, base32Encode, generateTotpSecret, matchTotp, otpauthUri, timeStep, totpAt } from "@/lib/auth/totp";

/** Spec §31 — TOTP against the RFC 6238 test vectors. */

// RFC 6238 appendix B: the ASCII secret "12345678901234567890", SHA-1.
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 vectors", () => {
    assert.equal(totpAt(RFC_SECRET, timeStep(59_000), 8), "94287082");
    assert.equal(totpAt(RFC_SECRET, timeStep(1_111_111_109_000), 8), "07081804");
    assert.equal(totpAt(RFC_SECRET, timeStep(20_000_000_000_000), 8), "65353130");
  });

  it("round-trips base32", () => {
    const secret = generateTotpSecret();
    assert.equal(secret.length, 32);
    assert.equal(base32Encode(base32Decode(secret)), secret);
  });

  it("accepts the current code and one step of drift, nothing further", () => {
    const now = 1_700_000_000_000;
    const step = timeStep(now);
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now), step);
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now), step - 1);
    assert.equal(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 3), now), null);
    assert.equal(matchTotp(RFC_SECRET, "12345", now), null);
    assert.equal(matchTotp(RFC_SECRET, "abcdef", now), null);
  });

  it("builds an otpauth link apps understand", () => {
    const uri = otpauthUri("ABC", "dr@example.test");
    assert.match(uri, /^otpauth:\/\/totp\/AADRIQUE%20Doctor%20OS%3Adr%40example\.test\?secret=ABC&issuer=/);
  });
});
