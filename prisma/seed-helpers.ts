/**
 * Deterministic helpers for the demo seed.
 *
 * Every random choice runs through one seeded generator, so re-seeding
 * reproduces the same dataset. That matters for demos: a screenshot taken
 * today still matches the data next week.
 */

/** mulberry32 — small, fast, and good enough for demo data. */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  return {
    /** Float in [0, 1). */
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    /** Integer in [min, max], inclusive. */
    int(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1));
    },

    pick<T>(items: readonly T[]): T {
      return items[Math.floor(this.next() * items.length)];
    },

    /** `count` distinct items, or all of them if count exceeds the list. */
    sample<T>(items: readonly T[], count: number): T[] {
      const pool = [...items];
      const taken: T[] = [];
      const n = Math.min(count, pool.length);
      for (let i = 0; i < n; i += 1) {
        taken.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
      }
      return taken;
    },

    /** True with probability `p`. */
    chance(p: number): boolean {
      return this.next() < p;
    },
  };
}

export type Random = ReturnType<typeof createRandom>;

/**
 * Stable id generator.
 *
 * Ids are produced up front so whole tables can go in through `createMany`
 * rather than one round trip per row — over a network connection to a hosted
 * database that is the difference between seconds and minutes.
 */
export function createIdFactory() {
  const counters = new Map<string, number>();

  return function id(prefix: string): string {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next.toString(36).padStart(6, "0")}`;
  };
}

/** Midnight, local time, `days` from `from`. */
export function dayOffset(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A date at a given hour and minute. */
export function at(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Pads a sequence into a display number, e.g. 184 → "P-000184". */
export function sequenceNo(prefix: string, seq: number, width = 6): string {
  return `${prefix}-${String(seq).padStart(width, "0")}`;
}

/** Indian mobile number in the demo range. */
export function phoneNumber(random: Random): string {
  return `+9198${String(random.int(10_000_000, 99_999_999)).padStart(8, "0")}`;
}
