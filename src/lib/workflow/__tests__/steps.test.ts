import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeStep,
  durationMs,
  evaluateCondition,
  parseSteps,
  readPath,
  type ConditionStep,
} from "@/lib/workflow/steps";

/**
 * Spec §28 — the step vocabulary is unit tested.
 *
 * The property that matters most is that an unrecognised step is *rejected*
 * rather than skipped. A workflow that silently drops the step it did not
 * understand would send the confirmation and never the reminder, and nobody
 * would know.
 */

describe("parseSteps", () => {
  it("accepts the shapes the product ships", () => {
    const parsed = parseSteps([
      { type: "ACTION", action: "SEND_MESSAGE", templateKey: "x", channel: "SMS" },
      { type: "WAIT", duration: { hours: 2 } },
      { type: "WAIT", until: "1_DAY_BEFORE_DUE" },
      { type: "CONDITION", field: "patient.smsOptIn", operator: "EQUALS", value: true },
    ]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok && parsed.steps.length, 4);
  });

  it("rejects an unknown action rather than skipping it", () => {
    const parsed = parseSteps([{ type: "ACTION", action: "LAUNCH_ROCKET" }]);
    assert.equal(parsed.ok, false);
    assert.match(parsed.ok ? "" : parsed.error, /Step 1 \(ACTION\)/);
  });

  it("rejects an unknown step type", () => {
    const parsed = parseSteps([{ type: "TELEPORT" }]);
    assert.equal(parsed.ok, false);
  });

  it("rejects a wait that is both a duration and an anchor", () => {
    const parsed = parseSteps([
      { type: "WAIT", duration: { hours: 1 }, until: "1_DAY_BEFORE_DUE" },
    ]);
    assert.equal(parsed.ok, false);
  });

  it("rejects a wait with no duration at all", () => {
    assert.equal(parseSteps([{ type: "WAIT", duration: {} }]).ok, false);
    assert.equal(parseSteps([{ type: "WAIT" }]).ok, false);
  });

  it("rejects steps that are not a list", () => {
    assert.equal(parseSteps({ type: "WAIT" }).ok, false);
    assert.equal(parseSteps(null).ok, false);
  });

  it("names the offending step so it can be fixed", () => {
    const parsed = parseSteps([
      { type: "WAIT", duration: { hours: 1 } },
      { type: "CONDITION", field: "x", operator: "NOPE" },
    ]);
    assert.equal(parsed.ok, false);
    assert.match(parsed.ok ? "" : parsed.error, /Step 2/);
  });
});

describe("durationMs", () => {
  it("adds the parts", () => {
    assert.equal(durationMs({ hours: 2 }), 7_200_000);
    assert.equal(durationMs({ days: 1, hours: 1, minutes: 30 }), 91_800_000);
  });
});

describe("readPath", () => {
  const context = { patient: { firstName: "Asha", optIn: false, phone: "" } };

  it("reads a nested value", () => {
    assert.equal(readPath(context, "patient.firstName"), "Asha");
    assert.equal(readPath(context, "patient.optIn"), false);
  });

  it("returns undefined for a path that is not there", () => {
    assert.equal(readPath(context, "patient.missing"), undefined);
    assert.equal(readPath(context, "nothing.at.all"), undefined);
  });
});

describe("evaluateCondition", () => {
  const context = {
    patient: { optIn: true, phone: "+919812345678", email: "" },
    appointment: { status: "SCHEDULED", minutes: 15 },
  };

  const condition = (over: Partial<ConditionStep>): ConditionStep => ({
    type: "CONDITION",
    field: "appointment.status",
    operator: "EQUALS",
    ...over,
  });

  it("compares equality exactly, including booleans", () => {
    assert.equal(
      evaluateCondition(condition({ value: "SCHEDULED" }), context),
      true,
    );
    assert.equal(
      evaluateCondition(condition({ value: "CANCELLED" }), context),
      false,
    );
    assert.equal(
      evaluateCondition(
        condition({ field: "patient.optIn", value: true }),
        context,
      ),
      true,
    );
  });

  it("treats an empty string as absent", () => {
    assert.equal(
      evaluateCondition(
        condition({ field: "patient.email", operator: "IS_PRESENT" }),
        context,
      ),
      false,
    );
    assert.equal(
      evaluateCondition(
        condition({ field: "patient.phone", operator: "IS_PRESENT" }),
        context,
      ),
      true,
    );
  });

  it("is false — never true — when the field does not exist", () => {
    for (const operator of ["EQUALS", "GREATER_THAN", "LESS_THAN"] as const) {
      assert.equal(
        evaluateCondition(
          condition({ field: "nope.nope", operator, value: 1 }),
          context,
        ),
        false,
        `${operator} on a missing field must not pass`,
      );
    }
  });

  it("compares numbers only when both sides are numbers", () => {
    assert.equal(
      evaluateCondition(
        condition({ field: "appointment.minutes", operator: "GREATER_THAN", value: 10 }),
        context,
      ),
      true,
    );
    assert.equal(
      evaluateCondition(
        condition({ field: "appointment.status", operator: "GREATER_THAN", value: 10 }),
        context,
      ),
      false,
    );
  });
});

describe("describeStep", () => {
  it("writes a sentence a person can check", () => {
    assert.equal(
      describeStep({ type: "WAIT", duration: { hours: 2 } }),
      "Wait 2 hours",
    );
    assert.equal(
      describeStep({ type: "WAIT", until: "1_DAY_BEFORE_DUE" }),
      "Wait until the day before it is due",
    );
    assert.match(
      describeStep({
        type: "CONDITION",
        field: "patient.smsOptIn",
        operator: "EQUALS",
        value: true,
      }),
      /sms opt in is true/,
    );
    assert.match(
      describeStep({
        type: "ACTION",
        action: "SEND_MESSAGE",
        templateKey: "appointment_reminder",
        channel: "WHATSAPP",
      }),
      /appointment reminder on WhatsApp/,
    );
  });
});
