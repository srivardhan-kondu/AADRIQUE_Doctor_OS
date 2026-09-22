import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("Correct horse battery staple", hash), false);
  });

  it("produces a different hash each time for the same password", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same-password", a), true);
    assert.equal(await verifyPassword("same-password", b), true);
  });

  it("refuses an empty password", async () => {
    await assert.rejects(() => hashPassword(""));
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    for (const bad of ["", "not-a-hash", "scrypt$1$2$3", "bcrypt$1$2$3$x$y"]) {
      assert.equal(await verifyPassword("anything", bad), false);
    }
  });

  it("flags a hash made with weaker parameters", async () => {
    const current = await hashPassword("x");
    assert.equal(needsRehash(current), false);
    assert.equal(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA=="), true);
    assert.equal(needsRehash("garbage"), true);
  });
});
