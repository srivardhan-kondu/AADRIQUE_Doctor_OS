import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Spec §31 — a password-reset link.
 *
 * Stateless, and still single-use: the signature covers a fingerprint of the
 * account's current password hash and session version. Using the link
 * changes the password, which changes the hash, so the same link no longer
 * verifies — and neither does any other outstanding link. It also dies with
 * any other password change or sign-out-everywhere.
 */

export const RESET_TTL_MS = 30 * 60_000;

export interface ResetSubject {
  userId: string;
  passwordHash: string | null;
  sessionVersion: number;
}

function fingerprint(subject: ResetSubject): string {
  return createHash("sha256")
    .update(`${subject.passwordHash ?? "none"}:${subject.sessionVersion}`)
    .digest("base64url")
    .slice(0, 22);
}

function sign(userId: string, exp: number, print: string, secret: string): string {
  return createHmac("sha256", secret).update(`reset:${userId}:${exp}:${print}`).digest("base64url");
}

export function createResetToken(subject: ResetSubject, secret: string, now = Date.now()): string {
  const exp = now + RESET_TTL_MS;
  return `${subject.userId}.${exp.toString(36)}.${sign(subject.userId, exp, fingerprint(subject), secret)}`;
}

/** The user id a token names, before the account is looked up. */
export function resetTokenUserId(token: string): string | null {
  const [userId, exp, sig, extra] = token.split(".");
  if (!userId || !exp || !sig || extra !== undefined || userId.length > 64) return null;
  return userId;
}

export function verifyResetToken(
  token: string,
  subject: ResetSubject,
  secret: string,
  now = Date.now(),
): "valid" | "expired" | "invalid" {
  const [userId, expText, sig] = token.split(".");
  if (userId !== subject.userId || !expText || !sig) return "invalid";
  const exp = parseInt(expText, 36);
  if (!Number.isFinite(exp)) return "invalid";

  const expected = Buffer.from(sign(userId, exp, fingerprint(subject), secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  return exp < now ? "expired" : "valid";
}
