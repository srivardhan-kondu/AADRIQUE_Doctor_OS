import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Password hashing.
 *
 * Uses scrypt from Node's standard library — memory-hard, and it avoids
 * pulling a native module into the build. Parameters are stored in the hash
 * string and read back when verifying, so they can be raised later without
 * invalidating existing passwords; `needsRehash` reports when a stored hash
 * is below current policy, and sign-in upgrades it.
 *
 * Two formats:
 *
 *   scrypt2$N$r$p$salt$hash  current — made with exactly the N, r, p it names.
 *   scrypt$…$salt$hash       legacy — its N/r/p fields were written but never
 *                            applied, so it was really made with Node's
 *                            defaults (N=2^14, r=8, p=1). Verified with those,
 *                            and always flagged for rehash.
 */

/** OWASP's minimum scrypt parameters: N=2^17, r=8, p=1. */
const N = 1 << 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const FORMAT = "scrypt2";
const LEGACY_FORMAT = "scrypt";
/** What a legacy hash was actually made with: Node's scrypt defaults. */
const LEGACY = { N: 1 << 14, r: 8, p: 1 } as const;

/** Never derive with more than this, whatever a stored hash claims. */
const MAX_N = 1 << 20;
const MAX_R = 16;
const MAX_P = 4;

/**
 * Spec §31 — at most this many hashes run at once in this process.
 *
 * scrypt runs on libuv's small thread pool (4 threads by default), which
 * file and DNS work share. A flood of sign-in attempts must queue here
 * rather than take every thread and stall the rest of the app; and at
 * N=2^17 each hash holds 128 MB, so the cap also bounds memory.
 */
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running += 1;
  }
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    // Hand the slot straight to the next waiter; otherwise free it.
    if (next) next();
    else running -= 1;
  }
}

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  const options: ScryptOptions = {
    ...params,
    // scrypt needs about 128·N·r bytes; Node's default 32 MB cap refuses
    // anything above N=2^14.
    maxmem: 128 * params.N * params.r * params.p + 32 * 1024 * 1024,
  };
  return withSlot(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scryptCallback(password, salt, keyLength, options, (error, key) =>
          error ? reject(error) : resolve(key),
        );
      }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error("Password must not be empty");

  const salt = randomBytes(SALT_LENGTH);
  const derived = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P });

  return [FORMAT, N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

/** The parameters a stored hash was made with, or null when it is not one. */
function parse(stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 6) return null;
  const [format, n, r, p, saltB64, hashB64] = parts;

  let params: { N: number; r: number; p: number };
  if (format === LEGACY_FORMAT) {
    params = LEGACY;
  } else if (format === FORMAT) {
    params = { N: Number(n), r: Number(r), p: Number(p) };
    const { N: cost, r: block, p: parallel } = params;
    const powerOfTwo = Number.isInteger(cost) && cost > 1 && (cost & (cost - 1)) === 0;
    if (
      !powerOfTwo ||
      cost > MAX_N ||
      !Number.isInteger(block) || block < 1 || block > MAX_R ||
      !Number.isInteger(parallel) || parallel < 1 || parallel > MAX_P
    ) {
      return null;
    }
  } else {
    return null;
  }

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return null;
  return { format, params, salt, expected };
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;

  const derived = await derive(password, parsed.salt, parsed.expected.length, parsed.params);

  // Constant-time — a length check alone would leak through timing.
  return derived.length === parsed.expected.length && timingSafeEqual(derived, parsed.expected);
}

/** True when a stored hash was made with parameters below current policy. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed || parsed.format !== FORMAT) return true;
  return parsed.params.N < N || parsed.params.r < R || parsed.params.p < P;
}
