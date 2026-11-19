import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allergyMatches, expandFrequency, mergePrescriptionLines } from "@/server/rules/prescriptions";

/** Spec §6 — a prescribed medicine that matches a recorded allergy is flagged. */

describe("allergyMatches", () => {
  it("flags a medicine named after a recorded allergy", () => {
    assert.deepEqual(allergyMatches("Penicillin V 250mg", ["Penicillin"]), ["Penicillin"]);
    assert.deepEqual(allergyMatches("Tab Ibuprofen 400", ["ibuprofen", "Dust"]), ["ibuprofen"]);
    assert.deepEqual(allergyMatches("Aspirin", ["Aspirin (NSAIDs)"]), ["Aspirin (NSAIDs)"]);
  });

  it("does not match on short words either way", () => {
    assert.deepEqual(allergyMatches("Tab Paracetamol", ["Tablet coating"]), []);
    assert.deepEqual(allergyMatches("Syp Cetirizine", ["Egg"]), []);
  });

  it("finds nothing when nothing is recorded", () => {
    assert.deepEqual(allergyMatches("Metformin 500", []), []);
  });
});

describe("expandFrequency", () => {
  it("spells out the dose pattern doctors write, keeping the pattern", () => {
    assert.equal(expandFrequency("1-0-1"), "1-0-1 (morning and night)");
    assert.equal(expandFrequency("1 - 1 - 1"), "1-1-1 (morning, afternoon and night)");
    assert.equal(expandFrequency("0-0-1"), "0-0-1 (night)");
    assert.equal(expandFrequency("½-0-½"), "½-0-½ (morning and night)");
    assert.equal(expandFrequency("1-0-0-1"), "1-0-0-1 (morning and night)");
  });

  it("expands the Latin abbreviations", () => {
    assert.equal(expandFrequency("bd"), "Twice daily (BD)");
    assert.equal(expandFrequency("T.D.S."), "Three times daily (TDS)");
    assert.equal(expandFrequency("sos"), "When needed (SOS)");
  });

  it("leaves anything else exactly as typed", () => {
    assert.equal(expandFrequency("Twice daily (BD)"), "Twice daily (BD)");
    assert.equal(expandFrequency("every 6 hours"), "every 6 hours");
    assert.equal(expandFrequency("0-0-0"), "0-0-0");
    assert.equal(expandFrequency("1-0"), "1-0");
  });
});

describe("mergePrescriptionLines", () => {
  const line = (medicationName: string) => ({
    medicationId: null,
    medicationName,
    dosage: null,
    frequency: null,
    route: null,
    durationDays: null,
    instructions: null,
  });

  it("adds new medicines and skips ones already written", () => {
    const { lines, skipped } = mergePrescriptionLines(
      [line("Paracetamol 650")],
      [line("paracetamol 650"), line("Cetirizine 10"), line("Cetirizine 10")],
    );
    assert.deepEqual(lines.map((l) => l.medicationName), ["Cetirizine 10"]);
    assert.equal(skipped, 2);
  });

  it("stops at the prescription limit", () => {
    const { lines, skipped } = mergePrescriptionLines([line("A1"), line("B2")], [line("C3"), line("D4")], 3);
    assert.deepEqual(lines.map((l) => l.medicationName), ["C3"]);
    assert.equal(skipped, 1);
  });
});
