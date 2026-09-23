import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import {
  type AvailabilityRule,
  appliesOn,
  assertCanCancel,
  assertCanCheckIn,
  assertCanMarkNoShow,
  assertCanReschedule,
  buildSlots,
  dayCapacity,
  isInPast,
  isValidDuration,
  noShowRate,
  overlaps,
  startOfWeek,
} from "@/server/rules/appointments";
import { ServiceError } from "@/server/services/errors";

/** Spec §53 — appointment rules are unit tested. */

const DAY = new Date(2026, 8, 23); // Wednesday 23 Sep 2026, local time
const at = (h: number, m = 0) => new Date(2026, 8, 23, h, m);
const EARLY = new Date(2026, 8, 22, 12); // the day before, so nothing is past

function window(from: number, to: number, over: Partial<AvailabilityRule> = {}) {
  return {
    startMinute: from * 60,
    endMinute: to * 60,
    isBlock: false,
    effectiveFrom: null,
    effectiveTo: null,
    ...over,
  };
}

function refusal(fn: () => void): ServiceError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ServiceError);
    return error;
  }
  assert.fail("expected the transition to be refused");
}

describe("calendar helpers", () => {
  it("starts the week on Monday", () => {
    assert.equal(startOfWeek(DAY).getDay(), 1);
    assert.equal(startOfWeek(DAY).getDate(), 21);
  });

  it("keeps a Sunday in the week that started the Monday before", () => {
    assert.equal(startOfWeek(new Date(2026, 8, 27)).getDate(), 21);
  });

  it("treats back-to-back appointments as not overlapping", () => {
    assert.equal(overlaps(at(9), at(10), at(10), at(11)), false);
    assert.equal(overlaps(at(9), at(10, 1), at(10), at(11)), true);
  });
});

describe("availability", () => {
  it("honours effective dates at both ends", () => {
    const rule = window(9, 12, {
      effectiveFrom: new Date(2026, 8, 1),
      effectiveTo: new Date(2026, 8, 30),
    });
    assert.equal(appliesOn(rule, DAY), true);
    assert.equal(appliesOn(rule, new Date(2026, 7, 31)), false);
    assert.equal(appliesOn(rule, new Date(2026, 9, 1)), false);
  });

  it("counts whole consultations only", () => {
    assert.equal(dayCapacity([window(9, 12), window(14, 15)], 15), 16);
    assert.equal(dayCapacity([{ startMinute: 540, endMinute: 580 }], 15), 2);
    assert.equal(dayCapacity([], 15), 0);
  });
});

describe("slots", () => {
  it("fills each window in consultation-length steps", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [window(9, 10)],
      taken: [],
      consultationMinutes: 15,
      now: EARLY,
    });
    assert.deepEqual(
      slots.map((s) => s.start.getMinutes()),
      [0, 15, 30, 45],
    );
    assert.ok(slots.every((s) => s.available && s.reason === null));
  });

  it("never offers a slot that runs past the end of the window", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [{ ...window(9, 10), endMinute: 9 * 60 + 40 }],
      taken: [],
      consultationMinutes: 15,
      now: EARLY,
    });
    assert.equal(slots.length, 2);
    assert.ok(slots.at(-1)!.end <= at(9, 40));
  });

  it("orders windows by time whatever order they are stored in", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [window(14, 15), window(9, 10)],
      taken: [],
      consultationMinutes: 30,
      now: EARLY,
    });
    assert.deepEqual(
      slots.map((s) => s.start.getHours()),
      [9, 9, 14, 14],
    );
  });

  it("marks a slot inside a block as blocked", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [window(9, 11), { ...window(10, 11), isBlock: true }],
      taken: [],
      consultationMinutes: 30,
      now: EARLY,
    });
    assert.deepEqual(
      slots.map((s) => s.reason),
      [null, null, "Blocked", "Blocked"],
    );
  });

  it("marks a slot touched by an appointment as booked", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [window(9, 10)],
      // A 20-minute appointment spills into the second 15-minute slot.
      taken: [{ scheduledStart: at(9), scheduledEnd: at(9, 20) }],
      consultationMinutes: 15,
      now: EARLY,
    });
    assert.deepEqual(
      slots.map((s) => s.available),
      [false, false, true, true],
    );
    assert.equal(slots[0].reason, "Booked");
  });

  it("marks a slot that has started as past", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [window(9, 10)],
      taken: [],
      consultationMinutes: 30,
      now: at(9, 10),
    });
    assert.deepEqual(
      slots.map((s) => s.reason),
      ["Past", null],
    );
  });

  it("ignores a rule that is not in force that day", () => {
    const slots = buildSlots({
      day: DAY,
      rules: [window(9, 10, { effectiveTo: new Date(2026, 8, 1) })],
      taken: [],
      consultationMinutes: 15,
      now: EARLY,
    });
    assert.equal(slots.length, 0);
  });
});

describe("booking limits", () => {
  it("accepts 5 to 240 minutes, in whole minutes", () => {
    assert.equal(isValidDuration(5), true);
    assert.equal(isValidDuration(240), true);
    assert.equal(isValidDuration(4), false);
    assert.equal(isValidDuration(241), false);
    assert.equal(isValidDuration(12.5), false);
  });

  it("gives a minute of grace before a start counts as past", () => {
    const now = at(10);
    assert.equal(isInPast(at(9, 59), now), false);
    assert.equal(isInPast(new Date(now.getTime() - 61_000), now), true);
  });
});

describe("no-show rate", () => {
  it("is unknown, not zero, when nothing has settled", () => {
    assert.equal(noShowRate(0, 0), null);
  });

  it("is the share of settled appointments that were missed", () => {
    assert.equal(noShowRate(1, 3), 25);
    assert.equal(noShowRate(0, 4), 0);
    assert.equal(noShowRate(1, 2), 33);
  });
});

describe("lifecycle", () => {
  const ALL: AppointmentStatus[] = [
    "SCHEDULED",
    "CHECKED_IN",
    "WAITING",
    "IN_CONSULTATION",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
    "RESCHEDULED",
  ];

  const allowed = (guard: (s: AppointmentStatus) => void) =>
    ALL.filter((s) => {
      try {
        guard(s);
        return true;
      } catch {
        return false;
      }
    });

  it("reschedules only an appointment the patient has not arrived for", () => {
    assert.deepEqual(allowed(assertCanReschedule), ["SCHEDULED"]);
    assert.match(
      refusal(() => assertCanReschedule("CHECKED_IN")).message,
      /already arrived/,
    );
    assert.match(
      refusal(() => assertCanReschedule("NO_SHOW")).message,
      /no show appointment cannot be moved/,
    );
  });

  it("cancels only an appointment that has not played out", () => {
    assert.deepEqual(allowed(assertCanCancel), [
      "SCHEDULED",
      "CHECKED_IN",
      "WAITING",
    ]);
    assert.equal(
      refusal(() => assertCanCancel("IN_CONSULTATION")).action,
      "Complete the consultation instead.",
    );
  });

  it("marks a no-show only for someone who has not been seen", () => {
    assert.deepEqual(allowed(assertCanMarkNoShow), [
      "SCHEDULED",
      "CHECKED_IN",
      "WAITING",
    ]);
  });

  it("checks in a scheduled appointment on its own day only", () => {
    const now = at(8);
    assert.doesNotThrow(() => assertCanCheckIn("SCHEDULED", at(17), now));
    assert.match(
      refusal(() => assertCanCheckIn("SCHEDULED", new Date(2026, 8, 24, 9), now))
        .message,
      /not for today/,
    );
    assert.match(
      refusal(() => assertCanCheckIn("CANCELLED", at(9), now)).message,
      /was cancelled/,
    );
    assert.match(
      refusal(() => assertCanCheckIn("CHECKED_IN", at(9), now)).message,
      /already been checked in/,
    );
  });

  it("refuses with an INVALID_STATE error the action layer can show", () => {
    assert.equal(refusal(() => assertCanCancel("COMPLETED")).code, "INVALID_STATE");
  });
});
