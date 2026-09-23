import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Spec §12 + §31 — links a patient can open without an account.
 *
 * A token status link carries the queue entry id and an HMAC of it under the
 * server secret. Without the secret a link cannot be forged for another
 * entry, and changing a character invalidates it. The page it opens shows
 * token numbers only — never a name — so a leaked link reveals little.
 *
 * No secret configured means no link can be made or accepted: the check fails
 * closed rather than accepting unsigned ids.
 */

function secret(): string | null {
  const value = process.env.AUTH_SECRET?.trim();
  return value ? value : null;
}

function mac(id: string, key: string): string {
  return createHmac("sha256", key)
    .update(`token-status:${id}`)
    .digest("base64url")
    .slice(0, 22);
}

/** `<id>.<mac>`, or null when no secret is configured. */
export function signId(id: string): string | null {
  const key = secret();
  return key ? `${id}.${mac(id, key)}` : null;
}

/** The id inside a valid signed value, or null. */
export function verifySignedId(value: string): string | null {
  const key = secret();
  if (!key) return null;

  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;

  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(mac(id, key));

  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}

/** The patient's token page for a queue entry, or null with no secret. */
export function tokenStatusPath(queueEntryId: string): string | null {
  const signed = signId(queueEntryId);
  return signed ? `/q/${encodeURIComponent(signed)}` : null;
}

/**
 * The same, as a link a message can carry. Needs `APP_URL` — the address
 * patients reach the app on — since a relative path is useless in an SMS.
 */
export function tokenStatusUrl(queueEntryId: string): string | null {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const path = tokenStatusPath(queueEntryId);
  return base && path ? `${base}${path}` : null;
}
