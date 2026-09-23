/**
 * Spec §31 — the fixed-window arithmetic and the in-memory store.
 *
 * No I/O here, so it is unit tested directly. The store the app uses in
 * production is in ./rate-limit.ts and keeps this same contract.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** Where the counters live. Both implementations share one contract. */
export interface RateLimitStore {
  /** Counts an attempt and says whether it is allowed. */
  hit(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
  /** Reports on a key without counting an attempt. */
  peek(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
  /** Clears a key after a success. */
  reset(key: string): Promise<void>;
}

export function result(
  count: number,
  resetAt: number,
  options: RateLimitOptions,
  now: number,
): RateLimitResult {
  const allowed = count <= options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - count),
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/** A peek: would one more attempt be allowed, and how many remain. */
export function peeked(
  count: number,
  resetAt: number,
  options: RateLimitOptions,
  now: number,
): RateLimitResult {
  const allowed = count < options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - count),
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/**
 * Counters in this process. Right for tests and a single instance; behind
 * several instances each would enforce the limit separately.
 */
export function createMemoryStore(): RateLimitStore & { clear(): void } {
  const windows = new Map<string, { count: number; resetAt: number }>();

  /** Drops expired windows so a long-lived process does not grow unbounded. */
  function sweep(now: number): void {
    if (windows.size < 5_000) return;
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  return {
    async hit(key, options) {
      const now = Date.now();
      sweep(now);
      const existing = windows.get(key);
      if (!existing || existing.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + options.windowMs });
        return result(1, now + options.windowMs, options, now);
      }
      existing.count += 1;
      return result(existing.count, existing.resetAt, options, now);
    },
    async peek(key, options) {
      const now = Date.now();
      const existing = windows.get(key);
      if (!existing || existing.resetAt <= now) {
        return { allowed: true, remaining: options.limit, retryAfter: 0 };
      }
      return peeked(existing.count, existing.resetAt, options, now);
    },
    async reset(key) {
      windows.delete(key);
    },
    clear() {
      windows.clear();
    },
  };
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
