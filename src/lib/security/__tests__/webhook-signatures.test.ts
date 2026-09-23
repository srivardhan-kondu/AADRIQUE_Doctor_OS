import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  verifyMetaSignature,
  verifySvixSignature,
} from "@/lib/security/webhook-signatures";

/** Spec §31 — a webhook is believed only with the vendor's signature. */

describe("Meta signature", () => {
  const body = '{"entry":[]}';
  const good = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

  it("accepts the vendor's HMAC", () => {
    assert.equal(verifyMetaSignature(body, good, "app-secret"), true);
  });

  it("refuses a missing, wrong or altered signature", () => {
    assert.equal(verifyMetaSignature(body, null, "app-secret"), false);
    assert.equal(verifyMetaSignature(body, good, "another-secret"), false);
    assert.equal(verifyMetaSignature(`${body} `, good, "app-secret"), false);
    assert.equal(verifyMetaSignature(body, good.replace("sha256=", ""), "app-secret"), false);
  });
});

describe("Svix signature", () => {
  const secret = `whsec_${Buffer.from("resend-webhook-key").toString("base64")}`;
  const body = '{"type":"email.delivered"}';
  const now = 1_790_000_000_000;
  const timestamp = String(now / 1000);
  const sign = (ts: string) =>
    createHmac("sha256", Buffer.from("resend-webhook-key"))
      .update(`msg_1.${ts}.${body}`)
      .digest("base64");

  it("accepts a current, correctly signed event among several signatures", () => {
    const signature = `v1,notit v1,${sign(timestamp)}`;
    assert.equal(
      verifySvixSignature(body, { id: "msg_1", timestamp, signature }, secret, now),
      true,
    );
  });

  it("refuses a replay older than five minutes", () => {
    const old = String(now / 1000 - 600);
    assert.equal(
      verifySvixSignature(body, { id: "msg_1", timestamp: old, signature: `v1,${sign(old)}` }, secret, now),
      false,
    );
  });

  it("refuses a tampered body or missing headers", () => {
    const signature = `v1,${sign(timestamp)}`;
    assert.equal(
      verifySvixSignature(`${body}x`, { id: "msg_1", timestamp, signature }, secret, now),
      false,
    );
    assert.equal(
      verifySvixSignature(body, { id: null, timestamp, signature }, secret, now),
      false,
    );
  });
});
