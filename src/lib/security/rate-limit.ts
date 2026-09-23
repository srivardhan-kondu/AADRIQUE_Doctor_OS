import "server-only";

/**
 * Spec §31 — rate limiting.
 *
 * An in-process fixed-window limiter. It is deliberately simple and its
 * limitation is deliberately documented: the counters live in this process,
 * so behind several instances each one enforces the limit separately. For the
 * thing that matters most — slowing credential guessing against a single
 * origin — that is a real obstacle, and the interface is the one a shared
 * store would implement, so moving to Redis is a swap here rather than a
 * change at every call site.
 *
 * It fails closed on the identifier, not on the limiter: an unknown caller is
 * bucketed under a shared key rather than waved through.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drops expired windows so a long-lived process does not grow unbounded. */
function sweep(now: number): void {
  if (windows.size < 5_000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: options.limit - existing.count,
    retryAfter: 0,
  };
}

/**
 * Reports on a key without spending an attempt.
 *
 * Lets a friendlier layer in front (a form that wants to say "too many
 * attempts" rather than "wrong password") check the same counter the
 * authoritative layer enforces, without counting the attempt twice.
 */
export function peekRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    return { allowed: true, remaining: options.limit, retryAfter: 0 };
  }

  const remaining = Math.max(0, options.limit - existing.count);

  return {
    allowed: existing.count < options.limit,
    remaining,
    retryAfter:
      existing.count < options.limit
        ? 0
        : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** The two buckets that guard sign-in (spec §31). */
export const SIGN_IN_ADDRESS_LIMIT = { limit: 10, windowMs: 60_000 } as const;
export const SIGN_IN_ACCOUNT_LIMIT = { limit: 5, windowMs: 300_000 } as const;

export function signInKeys(address: string, email: string) {
  return {
    address: `signin:ip:${address}`,
    account: `signin:acct:${email.toLowerCase()}`,
  };
}

/** Clears a key after a success, so one good sign-in resets the counter. */
export function resetRateLimit(key: string): void {
  windows.delete(key);
}

/**
 * The caller's address, from the proxy headers a deployment sets.
 *
 * Returns null when no header is trustworthy rather than guessing — the
 * caller decides what to do with an unidentifiable client, and every one of
 * them shares a bucket rather than bypassing the limit.
 */
export function callerAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/** Test seam. */
export function clearAllRateLimits(): void {
  windows.clear();
}
