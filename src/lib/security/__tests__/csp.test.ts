import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentSecurityPolicy, createNonce } from "@/lib/security/csp";

/** Spec §31 — the CSP's script rules are what stop injected script. */

describe("content security policy", () => {
  it("makes a fresh, unguessable nonce each time", () => {
    const a = createNonce();
    const b = createNonce();
    assert.notEqual(a, b);
    assert.ok(Buffer.from(a, "base64").length === 16, "128 bits");
  });

  it("allows only nonced scripts, and never unsafe-inline for scripts", () => {
    const csp = contentSecurityPolicy("abc", { dev: false, https: true });
    const scripts = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    assert.equal(scripts, "script-src 'self' 'nonce-abc' 'strict-dynamic'");
    assert.ok(!scripts.includes("unsafe-inline"));
    assert.ok(!scripts.includes("unsafe-eval"));
  });

  it("forbids framing, plugins and foreign form targets", () => {
    const csp = contentSecurityPolicy("abc", { dev: false, https: true });
    for (const rule of ["frame-ancestors 'none'", "object-src 'none'", "form-action 'self'", "base-uri 'self'"]) {
      assert.ok(csp.includes(rule), rule);
    }
  });

  it("relaxes only what development needs, and upgrades only over HTTPS", () => {
    const dev = contentSecurityPolicy("abc", { dev: true, https: false });
    assert.ok(dev.includes("'unsafe-eval'"));
    assert.ok(!dev.includes("upgrade-insecure-requests"));
    assert.ok(
      contentSecurityPolicy("abc", { dev: false, https: true }).includes(
        "upgrade-insecure-requests",
      ),
    );
  });
});
