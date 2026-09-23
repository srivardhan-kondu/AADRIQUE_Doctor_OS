import type { QueueEntryStatus } from "@/generated/prisma/enums";
import { invalidState } from "@/server/services/errors";

/**
 * Spec §12 — the queue rules, with no database attached (spec §53).
 */

/** Waiting to be seen: in the line, or at the vitals station. */
export const WAITING_STATUSES: readonly QueueEntryStatus[] = ["WAITING", "VITALS"];

/** With the doctor, or on their way in. */
export const ACTIVE_STATUSES: readonly QueueEntryStatus[] = [
  "CALLED",
  "IN_CONSULTATION",
];

/** Finished with the queue, one way or another. */
export const SETTLED_STATUSES: readonly QueueEntryStatus[] = [
  "COMPLETED",
  "SKIPPED",
  "LEFT",
];

/** `A` + 7 → `A007`. Three digits keeps a day's tokens sortable as text. */
export function formatToken(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/**
 * `V-20260923-A007`.
 *
 * Derived from the day and the token rather than a count: a token is already
 * unique within its queue for the day, so two doctors calling at once cannot
 * collide on the visit number the way two reads of the same count would.
 */
export function visitNumber(at: Date, token: string): string {
  const day = at.toISOString().slice(0, 10).replace(/-/g, "");
  return `V-${day}-${token}`;
}

/**
 * Minutes a patient has been waiting.
 *
 * Only someone still in line is waiting. Once they are with the doctor or
 * gone, the clock stops at zero rather than climbing all day on the board.
 */
export function waitMinutes(
  status: QueueEntryStatus,
  joinedAt: Date,
  now: Date,
): number {
  if (!WAITING_STATUSES.includes(status)) return 0;
  return Math.max(0, Math.round((now.getTime() - joinedAt.getTime()) / 60_000));
}

export function averageWait(waits: number[]): number {
  return waits.length
    ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
    : 0;
}

/* -------------------------------------------------------------------------
 * Transitions.
 *
 * A server action takes a queue entry id from the client, so a stale board or
 * a crafted request can name an entry in any state. The guard is here, not in
 * which buttons the board happens to show (spec §21).
 * ---------------------------------------------------------------------- */

export function assertCanComplete(status: QueueEntryStatus): void {
  if (status === "COMPLETED") {
    throw invalidState("This consultation is already complete.");
  }
  if (!ACTIVE_STATUSES.includes(status)) {
    throw invalidState(
      "This patient has not been called in yet.",
      "Call them from the queue before completing their consultation.",
    );
  }
}

export function assertCanMoveToVitals(status: QueueEntryStatus): void {
  if (status !== "WAITING") {
    throw invalidState("Only a waiting patient can be moved to vitals.");
  }
}

/**
 * Skipping marks the appointment as a no-show, so it must never reach a
 * patient who was already seen — that would rewrite a completed visit as a
 * missed one.
 */
export function assertCanSkip(status: QueueEntryStatus): void {
  if (status === "IN_CONSULTATION") {
    throw invalidState(
      "This patient is with the doctor.",
      "Complete the consultation instead.",
    );
  }
  if (SETTLED_STATUSES.includes(status)) {
    throw invalidState("This patient has already left the queue.");
  }
}
