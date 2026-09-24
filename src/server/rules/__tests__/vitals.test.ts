import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type VitalsReading, bmi, vitalsFlags, vitalsProblem } from "@/server/rules/vitals";

/** Spec §5.1 — vitals are checked for typing mistakes, and abnormal ones flagged. */

const empty: VitalsReading = {
  heightCm: null,
  weightKg: null,
  temperatureC: null,
  pulseBpm: null,
  respiratoryRate: null,
  systolicBp: null,
  diastolicBp: null,
  spo2: null,
  bloodGlucose: null,
};

describe("vitalsProblem", () => {
  it("accepts a normal set", () => {
    assert.equal(vitalsProblem({ ...empty, systolicBp: 120, diastolicBp: 80, pulseBpm: 72, spo2: 98 }), null);
  });

  it("wants at least one reading", () => {
    assert.match(vitalsProblem(empty)!, /at least one/);
  });

  it("catches a mistyped reading, but not an abnormal one", () => {
    assert.match(vitalsProblem({ ...empty, temperatureC: 370 })!, /Temperature of 370/);
    assert.equal(vitalsProblem({ ...empty, temperatureC: 40.2 }), null);
  });

  it("wants both blood-pressure numbers, the right way round", () => {
    assert.match(vitalsProblem({ ...empty, systolicBp: 120 })!, /both numbers/);
    assert.match(vitalsProblem({ ...empty, systolicBp: 80, diastolicBp: 120 })!, /higher than diastolic/);
  });
});

describe("vitalsFlags", () => {
  it("names what is outside the usual range", () => {
    assert.deepEqual(vitalsFlags({ temperatureC: 38.6, spo2: 91, systolicBp: 150, diastolicBp: 95 }), [
      "Fever",
      "Low SpO₂",
      "High BP",
    ]);
    assert.deepEqual(vitalsFlags({ systolicBp: 118, diastolicBp: 76, pulseBpm: 70 }), []);
  });
});

describe("bmi", () => {
  it("needs both measurements", () => {
    assert.equal(bmi(170, 65), 22.5);
    assert.equal(bmi(null, 65), null);
  });
});
