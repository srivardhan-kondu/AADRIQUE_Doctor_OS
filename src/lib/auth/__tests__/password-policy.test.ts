import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordProblem } from "@/lib/auth/password-policy";

/** Spec §31 — the password rules are unit tested. */

describe("password policy", () => {
  const email = "ananya.rao@aadrique.demo";

  it("accepts a long passphrase", () => {
    assert.equal(passwordProblem("monsoon evenings in hyderabad", email), null);
    assert.equal(passwordProblem("Tq9#vLm2xR", email), null);
  });

  it("refuses short, common, self-referential and repetitive passwords", () => {
    assert.match(passwordProblem("short1", email)!, /at least 10/);
    assert.match(passwordProblem("Password123", email)!, /first an attacker/);
    assert.match(passwordProblem("aadrique123", email)!, /first an attacker/);
    assert.match(passwordProblem("ananya.rao-2026!", email)!, /email/);
    assert.match(passwordProblem("aaaaaaaaaaaa", email)!, /different characters/);
    assert.match(passwordProblem("x".repeat(201), email)!, /at most/);
  });
});
