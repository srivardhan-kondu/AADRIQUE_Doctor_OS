import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { open, seal } from "@/lib/security/secret-box";

/** Spec §31 — sealed secrets open only with the same key and purpose. */

describe("secret box", () => {
  it("opens what it sealed, and only that", () => {
    const box = seal("JBSWY3DPEHPK3PXP", "secret-a", "mfa");
    assert.notEqual(box, seal("JBSWY3DPEHPK3PXP", "secret-a", "mfa"), "a fresh IV each time");
    assert.equal(open(box, "secret-a", "mfa"), "JBSWY3DPEHPK3PXP");
    assert.equal(open(box, "secret-b", "mfa"), null);
    assert.equal(open(box, "secret-a", "other"), null);
    const [v, iv, tag, body] = box.split(".");
    const flipped = body[0] === "A" ? `B${body.slice(1)}` : `A${body.slice(1)}`;
    assert.equal(open([v, iv, tag, flipped].join("."), "secret-a", "mfa"), null);
  });
});
