import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QueueEntryStatus } from "@/generated/prisma/enums";
import {
  assertCanComplete,
  assertCanMoveToVitals,
  assertCanSkip,
  averageWait,
  formatToken,
  visitNumber,
  waitMinutes,
} from "@/server/rules/queue";

/** Spec §53 — queue rules are unit tested. */

const ALL: QueueEntryStatus[] = [
  "WAITING",
  "VITALS",
  "CALLED",
  "IN_CONSULTATION",
  "COMPLETED",
  "SKIPPED",
  "LEFT",
];

const allowed = (guard: (s: QueueEntryStatus) => void) =>
  ALL.filter((s) => {
    try {
      guard(s);
      return true;
    } catch {
      return false;
    }
  });

describe("tokens", () => {
  it("pads to three digits so a day's tokens sort as text", () => {
    assert.equal(formatToken("A", 7), "A007");
    assert.equal(formatToken("CAR", 42), "CAR042");
    assert.equal(formatToken("A", 1234), "A1234");
    assert.ok(formatToken("A", 9) < formatToken("A", 10));
  });

  it("builds a visit number from the day and the token", () => {
    assert.equal(
      visitNumber(new Date("2026-09-23T06:00:00Z"), "A007"),
      "V-20260923-A007",
    );
  });
});

describe("waiting time", () => {
  const joined = new Date("2026-09-23T04:00:00Z");
  const now = new Date("2026-09-23T04:25:20Z");

  it("counts minutes for someone still in line", () => {
    assert.equal(waitMinutes("WAITING", joined, now), 25);
    assert.equal(waitMinutes("VITALS", joined, now), 25);
  });

  it("stops the clock once the patient is called or gone", () => {
    for (const status of ["CALLED", "IN_CONSULTATION", "COMPLETED", "SKIPPED", "LEFT"] as const) {
      assert.equal(waitMinutes(status, joined, now), 0, status);
    }
  });

  it("never goes negative on clock skew", () => {
    assert.equal(waitMinutes("WAITING", now, joined), 0);
  });

  it("averages to zero with nobody waiting", () => {
    assert.equal(averageWait([]), 0);
    assert.equal(averageWait([10, 21]), 16);
  });
});

describe("transitions", () => {
  it("completes only a consultation that is under way", () => {
    assert.deepEqual(allowed(assertCanComplete), ["CALLED", "IN_CONSULTATION"]);
  });

  it("sends only a waiting patient to vitals", () => {
    assert.deepEqual(allowed(assertCanMoveToVitals), ["WAITING"]);
  });

  it("never skips a patient who was seen or has left", () => {
    // Skipping marks the appointment a no-show, which must not rewrite a
    // completed visit.
    assert.deepEqual(allowed(assertCanSkip), ["WAITING", "VITALS", "CALLED"]);
  });
});
