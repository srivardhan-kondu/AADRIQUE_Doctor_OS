import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  followUpDueDate,
  hasWrittenNote,
  syncAssessment,
} from "@/server/rules/consultation";

describe("hasWrittenNote", () => {
  it("does not count the chief complaint copied from the appointment", () => {
    assert.equal(hasWrittenNote({ chiefComplaint: "Fever" }), false);
    assert.equal(hasWrittenNote({ symptoms: "  " }), false);
  });

  it("counts any written section or prescribed medicine", () => {
    assert.equal(hasWrittenNote({ examination: "Chest clear" }), true);
    assert.equal(hasWrittenNote({ assessment: "Viral fever" }), true);
    assert.equal(hasWrittenNote({}, 1), true);
  });
});

describe("followUpDueDate", () => {
  it("lands on local midnight, the given number of days later", () => {
    const due = followUpDueDate(new Date(2026, 10, 19, 16, 45), 14);
    assert.equal(due.getTime(), new Date(2026, 11, 3).getTime());
  });

  it("crosses month and year ends", () => {
    assert.equal(followUpDueDate(new Date(2026, 11, 30, 9), 7).getTime(), new Date(2027, 0, 6).getTime());
  });

  it("refuses an interval outside a year", () => {
    assert.throws(() => followUpDueDate(new Date(), 0), RangeError);
    assert.throws(() => followUpDueDate(new Date(), 400), RangeError);
    assert.throws(() => followUpDueDate(new Date(), 1.5), RangeError);
  });
});

describe("syncAssessment", () => {
  it("fills an empty assessment from the diagnoses", () => {
    assert.equal(syncAssessment("", [], ["Viral fever"]), "Viral fever");
    assert.equal(syncAssessment(null, [], ["Viral fever"]), "Viral fever");
  });

  it("follows the diagnoses while it is still exactly their list", () => {
    assert.equal(syncAssessment("Viral fever", ["Viral fever"], ["Viral fever", "Asthma"]), "Viral fever; Asthma");
    assert.equal(syncAssessment("Viral fever; Asthma", ["Viral fever", "Asthma"], ["Asthma"]), "Asthma");
  });

  it("never touches an assessment the doctor wrote", () => {
    assert.equal(syncAssessment("Likely viral, review CBC", ["Viral fever"], []), "Likely viral, review CBC");
  });
});
