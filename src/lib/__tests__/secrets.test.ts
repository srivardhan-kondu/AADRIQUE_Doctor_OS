import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolveSecret } from "@/lib/secrets";

/** Spec §31 — a credential reference resolves, or fails closed. */

describe("resolveSecret", () => {
  afterEach(() => {
    delete process.env.TEST_GATEWAY_TOKEN;
  });

  it("reads an env:// reference", () => {
    process.env.TEST_GATEWAY_TOKEN = " tok_123 ";
    assert.equal(resolveSecret("env://TEST_GATEWAY_TOKEN"), "tok_123");
  });

  it("fails closed on anything else", () => {
    process.env.TEST_GATEWAY_TOKEN = "tok_123";
    for (const ref of [null, "", "secret://demo/sms", "env://", "env://lower_case", "TEST_GATEWAY_TOKEN", "env://TEST_GATEWAY_TOKEN/../x"]) {
      assert.equal(resolveSecret(ref), null, String(ref));
    }
  });

  it("treats an unset or empty variable as no credential", () => {
    assert.equal(resolveSecret("env://TEST_GATEWAY_TOKEN"), null);
    process.env.TEST_GATEWAY_TOKEN = "   ";
    assert.equal(resolveSecret("env://TEST_GATEWAY_TOKEN"), null);
  });
});
