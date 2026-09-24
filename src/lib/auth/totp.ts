import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Spec §31 — time-based one-time passwords (RFC 6238), the six-digit codes
 * of Google Authenticator, Microsoft Authenticator, 1Password and the rest.
 * SHA-1, 30-second steps, six digits: the defaults every app supports.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Not a base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new 160-bit secret, base32 — what the authenticator app stores. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function totpAt(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, "0");
}

/**
 * The time step a code matches, allowing one step of clock drift either
 * way, or null. The caller refuses a step it has already accepted, so a
 * code seen over someone's shoulder cannot be replayed.
 */
export function matchTotp(secret: string, code: string, nowMs = Date.now()): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const current = timeStep(nowMs);
  for (const step of [current, current - 1, current + 1]) {
    const expected = totpAt(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return step;
  }
  return null;
}

/** The link an authenticator app reads from a QR code, or typed in. */
export function otpauthUri(secret: string, account: string, issuer = "AADRIQUE Doctor OS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}
