import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Spec §31 — proving a delivery webhook came from the vendor.
 *
 * A webhook is a public URL; without a signature check anyone could mark a
 * message delivered, or inject a "reply" from a patient. Each check is
 * constant-time, and each endpoint refuses outright when its secret is not
 * configured.
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Meta (WhatsApp Cloud API): `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}

/**
 * Resend (Svix): HMAC-SHA256 of `${id}.${timestamp}.${body}` under the
 * base64 key after `whsec_`, sent as one or more `v1,<base64>` entries. The
 * timestamp must be within five minutes, so a captured request cannot be
 * replayed later.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > 5 * 60_000) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");

  return signature
    .split(" ")
    .map((entry) => entry.split(",", 2))
    .some(([version, value]) => version === "v1" && value !== undefined && safeEqual(value, expected));
}
