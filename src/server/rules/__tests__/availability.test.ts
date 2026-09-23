import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type WeeklyRule,
  formatClock,
  parseClock,
  toClock,
  validateWeek,
} from "@/server/rules/availability";
import { ServiceError } from "@/server/services/errors";

/** Spec §53 — the rules slots are generated from are unit tested. */

const MON = 1;

function rule(from: string, to: string, over: Partial<WeeklyRule> = {}): WeeklyRule {
  return {
    dayOfWeek: MON,
    startMinute: parseClock(from)!,
    endMinute: parseClock(to)!,
    isBlock: false,
    label: null,
    ...over,
  };
}

function refusal(rules: WeeklyRule[]): string {
  try {
    validateWeek(rules);
  } catch (error) {
    assert.ok(error instanceof ServiceError);
    assert.equal(error.code, "VALIDATION");
    return error.message;
  }
  assert.fail("expected the week to be refused");
}

describe("clock", () => {
  it("parses and prints times", () => {
    assert.equal(parseClock("09:30"), 570);
    assert.equal(parseClock("9:05"), 545);
    assert.equal(parseClock("24:00"), 1440);
    assert.equal(parseClock("24:30"), null);
    assert.equal(parseClock("12:60"), null);
    assert.equal(parseClock("noon"), null);
    assert.equal(toClock(570), "09:30");
    assert.equal(formatClock(570), "9:30am");
    assert.equal(formatClock(720), "12pm");
    assert.equal(formatClock(0), "12am");
  });
});

describe("a valid week", () => {
  it("is returned sorted by day, then sessions before breaks, then time", () => {
    const week = validateWeek([
      rule("14:00", "17:00"),
      rule("11:00", "11:30", { isBlock: true, label: " Ward round " }),
      rule("09:00", "13:00"),
      rule("10:00", "12:00", { dayOfWeek: 0 }),
    ]);
    assert.deepEqual(
      week.map((r) => [r.dayOfWeek, r.isBlock, toClock(r.startMinute)]),
      [
        [0, false, "10:00"],
        [MON, false, "09:00"],
        [MON, false, "14:00"],
        [MON, true, "11:00"],
      ],
    );
    assert.equal(week[3].label, "Ward round");
  });

  it("allows back-to-back sessions", () => {
    assert.doesNotThrow(() =>
      validateWeek([rule("09:00", "13:00"), rule("13:00", "17:00")]),
    );
  });

  it("allows an empty week — a doctor on leave", () => {
    assert.deepEqual(validateWeek([]), []);
  });
});

describe("an invalid week", () => {
  it("refuses a session that ends before it starts", () => {
    assert.match(refusal([rule("13:00", "09:00")]), /ends before it starts/);
  });

  it("refuses a session too short for a consultation", () => {
    assert.match(refusal([rule("09:00", "09:10")]), /too short/);
  });

  it("refuses overlapping sessions on the same day", () => {
    assert.match(
      refusal([rule("09:00", "13:00"), rule("12:00", "15:00")]),
      /Monday 9am–1pm overlaps 12pm–3pm/,
    );
  });

  it("does not treat the same hours on different days as an overlap", () => {
    assert.doesNotThrow(() =>
      validateWeek([rule("09:00", "13:00"), rule("09:00", "13:00", { dayOfWeek: 2 })]),
    );
  });

  it("refuses a break outside clinic hours", () => {
    assert.match(
      refusal([rule("09:00", "13:00"), rule("13:30", "14:00", { isBlock: true })]),
      /outside clinic hours/,
    );
  });

  it("refuses a day that is not a weekday", () => {
    assert.match(refusal([rule("09:00", "13:00", { dayOfWeek: 7 })]), /not valid/);
  });
});
