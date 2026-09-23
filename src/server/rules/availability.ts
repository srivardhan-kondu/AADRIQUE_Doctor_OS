import { ServiceError } from "@/server/services/errors";

/**
 * Spec §11 — a doctor's recurring week, as data.
 *
 * Windows are when the doctor is in clinic; blocks remove time from inside a
 * window (a ward round, a lunch break). Slots are generated from exactly these
 * rules, so a malformed week would mean appointments bookable at impossible
 * times — which is why the whole week is validated before it replaces the old
 * one, and refused as a whole if any part is wrong.
 */

export interface WeeklyRule {
  /** 0 = Sunday … 6 = Saturday, as `Date.getDay()`. */
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isBlock: boolean;
  label: string | null;
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A consultation needs room: nothing shorter than this is a clinic window. */
export const MIN_WINDOW_MINUTES = 15;

export function formatClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  const suffix = hour < 12 || hour === 24 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${rest ? `:${String(rest).padStart(2, "0")}` : ""}${suffix}`;
}

function describe(rule: WeeklyRule): string {
  return `${DAY_NAMES[rule.dayOfWeek]} ${formatClock(rule.startMinute)}–${formatClock(rule.endMinute)}`;
}

function invalid(message: string): ServiceError {
  return new ServiceError("VALIDATION", message, "Adjust the hours and save again.");
}

/**
 * Returns the week sorted, or throws a VALIDATION error naming the first
 * problem in words a receptionist or doctor can act on.
 */
export function validateWeek(rules: WeeklyRule[]): WeeklyRule[] {
  for (const rule of rules) {
    if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
      throw invalid("A day of the week is not valid.");
    }
    if (
      !Number.isInteger(rule.startMinute) ||
      !Number.isInteger(rule.endMinute) ||
      rule.startMinute < 0 ||
      rule.endMinute > 24 * 60
    ) {
      throw invalid(`${DAY_NAMES[rule.dayOfWeek]} has a time outside the day.`);
    }
    if (rule.endMinute <= rule.startMinute) {
      throw invalid(`${describe(rule)} ends before it starts.`);
    }
    if (!rule.isBlock && rule.endMinute - rule.startMinute < MIN_WINDOW_MINUTES) {
      throw invalid(`${describe(rule)} is too short to hold a consultation.`);
    }
  }

  const sorted = [...rules].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      Number(a.isBlock) - Number(b.isBlock) ||
      a.startMinute - b.startMinute,
  );

  for (let day = 0; day < 7; day += 1) {
    const windows = sorted.filter((r) => r.dayOfWeek === day && !r.isBlock);
    const blocks = sorted.filter((r) => r.dayOfWeek === day && r.isBlock);

    for (let i = 1; i < windows.length; i += 1) {
      if (windows[i].startMinute < windows[i - 1].endMinute) {
        throw invalid(
          `${describe(windows[i - 1])} overlaps ${formatClock(windows[i].startMinute)}–${formatClock(windows[i].endMinute)}.`,
        );
      }
    }

    for (const block of blocks) {
      const inside = windows.some(
        (w) => block.startMinute >= w.startMinute && block.endMinute <= w.endMinute,
      );
      if (!inside) {
        throw invalid(
          `The break ${describe(block)} is outside clinic hours. A break has to fall inside a session.`,
        );
      }
    }
  }

  return sorted.map((r) => ({ ...r, label: r.label?.trim() || null }));
}

/** Parses "09:30" into minutes from midnight; null if it is not a time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/** Minutes from midnight as "09:30", for a time input. */
export function toClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
