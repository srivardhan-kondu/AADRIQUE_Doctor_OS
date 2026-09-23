import type { AppointmentStatus } from "@/generated/prisma/enums";
import { invalidState } from "@/server/services/errors";

/**
 * Spec §11 — the appointment rules, with no database attached.
 *
 * The service reads the rows and writes the result; everything that decides
 * *what* the result should be lives here, where it can be tested without a
 * database (spec §53 — "appointment rules" are unit tested).
 */

/** Statuses that still occupy a slot in the doctor's day. */
export const ACTIVE_STATUSES: readonly AppointmentStatus[] = [
  "SCHEDULED",
  "CHECKED_IN",
  "WAITING",
  "IN_CONSULTATION",
];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday-first week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const weekday = (d.getDay() + 6) % 7;
  return addDays(d, -weekday);
}

export function atMinute(day: Date, minute: number): Date {
  const d = startOfDay(day);
  d.setMinutes(minute);
  return d;
}

/** Half-open intervals: an appointment ending at 10:00 does not clash with one starting at 10:00. */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export interface AvailabilityRule {
  startMinute: number;
  endMinute: number;
  isBlock: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

/** Whether a recurring availability rule is in force on `day`. */
export function appliesOn(rule: AvailabilityRule, day: Date): boolean {
  if (rule.effectiveFrom && rule.effectiveFrom > day) return false;
  if (rule.effectiveTo && rule.effectiveTo < day) return false;
  return true;
}

/** How many consultations fit in a day's clinic windows. */
export function dayCapacity(
  windows: { startMinute: number; endMinute: number }[],
  consultationMinutes: number,
): number {
  const minutes = windows.reduce(
    (sum, w) => sum + (w.endMinute - w.startMinute),
    0,
  );
  return Math.floor(minutes / consultationMinutes);
}

export interface SlotOption {
  start: Date;
  end: Date;
  available: boolean;
  /** Why the slot cannot be used, when it cannot. */
  reason: "Blocked" | "Booked" | "Past" | null;
}

/**
 * Bookable slots for one day.
 *
 * A slot exists only inside a window, is removed by a block, and is taken by
 * any appointment in `taken`. The caller decides which appointments count as
 * taking a slot.
 */
export function buildSlots(input: {
  day: Date;
  rules: AvailabilityRule[];
  taken: { scheduledStart: Date; scheduledEnd: Date }[];
  consultationMinutes: number;
  now: Date;
}): SlotOption[] {
  const day = startOfDay(input.day);
  const applicable = input.rules.filter((rule) => appliesOn(rule, day));
  const windows = applicable
    .filter((r) => !r.isBlock)
    .sort((a, b) => a.startMinute - b.startMinute);
  const blocks = applicable.filter((r) => r.isBlock);

  const step = input.consultationMinutes;
  const now = input.now.getTime();
  const slots: SlotOption[] = [];

  for (const window of windows) {
    for (
      let minute = window.startMinute;
      minute + step <= window.endMinute;
      minute += step
    ) {
      const start = atMinute(day, minute);
      const end = atMinute(day, minute + step);

      const blocked = blocks.some(
        (b) => minute < b.endMinute && minute + step > b.startMinute,
      );
      const booked = input.taken.some((a) =>
        overlaps(start, end, a.scheduledStart, a.scheduledEnd),
      );
      const past = start.getTime() <= now;

      slots.push({
        start,
        end,
        available: !blocked && !booked && !past,
        reason: blocked ? "Blocked" : booked ? "Booked" : past ? "Past" : null,
      });
    }
  }

  return slots;
}

/**
 * Spec §16 — the share of settled appointments that were missed.
 *
 * Cancelled and still-upcoming appointments are not in the denominator: a
 * patient who has not had their turn yet has not failed to turn up. With
 * nothing settled the rate is unknown, not zero.
 */
export function noShowRate(noShow: number, completed: number): number | null {
  const settled = noShow + completed;
  return settled ? Math.round((noShow / settled) * 100) : null;
}

/** Length limits on a single appointment, in minutes. */
export const MIN_DURATION = 5;
export const MAX_DURATION = 240;

export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) && minutes >= MIN_DURATION && minutes <= MAX_DURATION
  );
}

/** A minute of grace, so a slot picked just as the clock turns still books. */
export function isInPast(start: Date, now: Date): boolean {
  return start.getTime() < now.getTime() - 60_000;
}

/* -------------------------------------------------------------------------
 * Lifecycle transitions.
 *
 * Scheduled → Checked In → Waiting → In Consultation → Completed, with
 * Cancelled, No Show and Rescheduled as exits. Each guard throws the error
 * the user sees, so the wording is tested alongside the rule.
 * ---------------------------------------------------------------------- */

function label(status: AppointmentStatus): string {
  return status.toLowerCase().replaceAll("_", " ");
}

export function assertCanReschedule(status: AppointmentStatus): void {
  if (!ACTIVE_STATUSES.includes(status)) {
    throw invalidState(
      `A ${label(status)} appointment cannot be moved.`,
      "Book a new appointment instead.",
    );
  }
  if (status !== "SCHEDULED") {
    throw invalidState(
      "This patient has already arrived.",
      "Use the queue to manage them from here.",
    );
  }
}

export function assertCanCancel(status: AppointmentStatus): void {
  if (status === "CANCELLED") {
    throw invalidState("This appointment is already cancelled.");
  }
  if (status === "COMPLETED") {
    throw invalidState("A completed appointment cannot be cancelled.");
  }
  if (status === "IN_CONSULTATION") {
    throw invalidState(
      "This patient is with the doctor.",
      "Complete the consultation instead.",
    );
  }
  if (status === "RESCHEDULED" || status === "NO_SHOW") {
    throw invalidState(
      `A ${label(status)} appointment cannot be cancelled.`,
    );
  }
}

export function assertCanCheckIn(
  status: AppointmentStatus,
  scheduledStart: Date,
  now: Date,
): void {
  if (status !== "SCHEDULED") {
    throw invalidState(
      status === "CANCELLED"
        ? "This appointment was cancelled."
        : "This patient has already been checked in.",
      status === "CANCELLED"
        ? "Book a new appointment for them."
        : "Find their token on the queue board.",
    );
  }

  if (startOfDay(scheduledStart).getTime() !== startOfDay(now).getTime()) {
    throw invalidState(
      "This appointment is not for today.",
      "Reschedule it to today before checking the patient in.",
    );
  }
}

export function assertCanMarkNoShow(status: AppointmentStatus): void {
  if (status === "NO_SHOW") {
    throw invalidState("This appointment is already marked as a no show.");
  }
  if (status === "COMPLETED" || status === "IN_CONSULTATION") {
    throw invalidState("This patient was seen.");
  }
  if (status === "CANCELLED" || status === "RESCHEDULED") {
    throw invalidState(
      `A ${label(status)} appointment cannot be marked as a no show.`,
    );
  }
}
