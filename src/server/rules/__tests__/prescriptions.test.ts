import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allergyMatches } from "@/server/rules/prescriptions";

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
