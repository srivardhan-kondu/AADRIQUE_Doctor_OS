import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAddOns, readOpdSettings, writeAddOns } from "@/lib/add-ons";

/** An add-on is on only when it was deliberately turned on. */

describe("add-ons", () => {
  it("reads anything missing or malformed as locked", () => {
    for (const modules of [null, undefined, {}, [], "x", { addOns: null }, { addOns: "all" }]) {
      assert.deepEqual(readAddOns(modules), {
        followUps: false,
        messaging: false,
        analytics: false,
        aiCopilot: false,
      });
    }
  });

  it("unlocks only on an explicit true", () => {
    const state = readAddOns({ addOns: { analytics: true, messaging: "yes", aiCopilot: 1 } });
    assert.equal(state.analytics, true);
    assert.equal(state.messaging, false);
    assert.equal(state.aiCopilot, false);
  });

  it("does not treat the older module flags as a licence", () => {
    assert.equal(readAddOns({ analytics: true, communication: true, ai: true }).analytics, false);
  });

  it("writes changes without disturbing other module settings", () => {
    const modules = writeAddOns({ opd: true, addOns: { analytics: true } }, { messaging: true });
    assert.equal(modules.opd, true);
    assert.deepEqual(readAddOns(modules), {
      followUps: false,
      messaging: true,
      analytics: true,
      aiCopilot: false,
    });
  });

  it("keeps the vitals step off unless a clinic turns it on", () => {
    assert.equal(readOpdSettings({}).vitalsStep, false);
    assert.equal(readOpdSettings(null).vitalsStep, false);
    assert.equal(readOpdSettings({ vitalsStep: true }).vitalsStep, true);
  });
});
