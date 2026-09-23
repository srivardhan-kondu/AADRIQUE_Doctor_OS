import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Spec §3 + §31 — the patient portal's sign-in codes and session tokens.
 *
 * Pure functions over a secret, so they are tested without a server. A patient
 * is not a staff user and never holds a staff session; the portal has its own
 * short-lived, signed token that names one organization, one verified mobile
 * number and, once chosen, one patient record.
 */

export interface PortalSession {
  /** Organization id. */
  o: string;
  /** The verified, canonical mobile number. */
  p: string;
  /** The patient record chosen, when the number belongs to more than one. */
  pid: string | null;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

export const PORTAL_SESSION_MS = 12 * 60 * 60_000;
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(`portal:${value}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function encodePortalSession(session: PortalSession, secret: string): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The session inside a valid, unexpired token; null for anything else. */
export function decodePortalSession(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): PortalSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), sign(body, secret))) return null;

  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString()) as PortalSession;
    if (
      typeof session.o !== "string" ||
      typeof session.p !== "string" ||
      (session.pid !== null && typeof session.pid !== "string") ||
      typeof session.exp !== "number" ||
      session.exp <= now
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** A six-digit code, uniformly random. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * The code as stored: keyed to the number and the server secret, so a leaked
 * row cannot be checked offline and a code for one number is useless for
 * another.
 */
export function hashCode(code: string, phone: string, secret: string): string {
  return createHmac("sha256", secret).update(`otp:${phone}:${code}`).digest("base64url");
}

export function codeMatches(code: string, phone: string, stored: string, secret: string): boolean {
  return /^\d{6}$/.test(code) && safeEqual(hashCode(code, phone, secret), stored);
}
