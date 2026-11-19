import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
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
    assert.equal(needsRehash("scrypt2$16384$8$1$c2FsdA==$aGFzaA=="), true);
    assert.equal(needsRehash("scrypt$131072$8$1$c2FsdA==$aGFzaA=="), true);
    assert.equal(needsRehash("garbage"), true);
  });

  it("really uses the parameters it records", async () => {
    const hash = await hashPassword("pw");
    const [format, n, r, p, salt, stored] = hash.split("$");
    assert.equal(format, "scrypt2");
    const expected = scryptSync("pw", Buffer.from(salt, "base64"), 64, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    assert.equal(expected.toString("base64"), stored);
    assert.equal(Number(n), 1 << 17);
  });

  it("still verifies a legacy hash, which was made with Node's defaults", async () => {
    const salt = randomBytes(16);
    const legacy = [
      "scrypt", 131072, 8, 1,
      salt.toString("base64"),
      scryptSync("old password", salt, 64).toString("base64"),
    ].join("$");
    assert.equal(await verifyPassword("old password", legacy), true);
    assert.equal(await verifyPassword("wrong", legacy), false);
  });

  it("refuses stored parameters outside safe bounds rather than deriving with them", async () => {
    for (const bad of [
      "scrypt2$1073741824$8$1$c2FsdA==$aGFzaA==",
      "scrypt2$100000$8$1$c2FsdA==$aGFzaA==",
      "scrypt2$16384$64$1$c2FsdA==$aGFzaA==",
      "scrypt2$16384$8$99$c2FsdA==$aGFzaA==",
    ]) {
      assert.equal(await verifyPassword("anything", bad), false);
    }
  });
});
