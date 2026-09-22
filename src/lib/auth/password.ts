import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * Uses scrypt from Node's standard library — memory-hard, and it avoids
 * pulling a native module into the build. Parameters are stored in the hash
 * string so they can be raised later without invalidating existing passwords:
 * `verify` reads whatever the stored hash was made with, and `needsRehash`
 * reports when a stored hash is below current policy.
 */

/** OWASP's minimum scrypt parameters: N=2^17, r=8, p=1. */
const N = 1 << 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error("Password must not be empty");

  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);

  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, , , , saltB64, hashB64] = parts;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(password, salt, expected.length);

  // Constant-time — a length check alone would leak through timing.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** True when a stored hash was made with parameters below current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;

  const [, n, r, p] = parts;
  return Number(n) < N || Number(r) < R || Number(p) < P;
}
