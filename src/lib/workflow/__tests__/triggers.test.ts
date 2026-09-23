import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowStep } from "@/lib/workflow/steps";
import { KNOWN_VARIABLES, type TemplateRef, workflowProblem } from "@/lib/workflow/triggers";

/** Spec §28 — the builder refuses workflows that could only fail at run time. */

const templates: TemplateRef[] = [
  { key: "feedback_request", channel: "WHATSAPP", placeholders: ["doctorName"] },
  { key: "token_generated", channel: "SMS", placeholders: ["token", "currentToken", "waitMinutes"] },
  { key: "appointment_reminder", channel: "WHATSAPP", placeholders: ["doctorName", "appointmentTime"] },
];

const send = (templateKey: string, channel: "WHATSAPP" | "SMS" | "EMAIL"): WorkflowStep => ({
  type: "ACTION",
  action: "SEND_MESSAGE",
  templateKey,
  channel,
});

describe("workflow validation", () => {
  it("accepts the spec's feedback example", () => {
    assert.equal(
      workflowProblem(
        "APPOINTMENT_COMPLETED",
        [
          { type: "WAIT", duration: { hours: 2 } },
          { type: "CONDITION", field: "patient.phone", operator: "IS_PRESENT" },
          send("feedback_request", "WHATSAPP"),
          { type: "ACTION", action: "CREATE_FEEDBACK_RECORD" },
        ],
        templates,
      ),
      null,
    );
  });

  it("needs an action", () => {
    assert.match(
      workflowProblem("TOKEN_GENERATED", [{ type: "WAIT", duration: { minutes: 5 } }], templates)!,
      /at least one action/,
    );
  });

  it("refuses a wait anchored to a date the subject does not have", () => {
    assert.match(
      workflowProblem(
        "TOKEN_GENERATED",
        [{ type: "WAIT", until: "24_HOURS_BEFORE_APPOINTMENT" }, send("token_generated", "SMS")],
        templates,
      )!,
      /does not have/,
    );
  });

  it("refuses a condition on a field the trigger never provides", () => {
    assert.match(
      workflowProblem(
        "PATIENT_REGISTERED",
        [
          { type: "CONDITION", field: "appointment.status", operator: "EQUALS", value: "SCHEDULED" },
          { type: "ACTION", action: "NOTIFY_STAFF", title: "New patient" },
        ],
        templates,
      )!,
      /does not provide/,
    );
  });

  it("refuses a comparison with a value the field never takes", () => {
    assert.match(
      workflowProblem(
        "APPOINTMENT_SCHEDULED",
        [
          { type: "CONDITION", field: "appointment.status", operator: "EQUALS", value: "BOOKED" },
          send("appointment_reminder", "WHATSAPP"),
        ],
        templates,
      )!,
      /never has/,
    );
  });

  it("refuses visit actions where there is no visit", () => {
    assert.match(
      workflowProblem("APPOINTMENT_SCHEDULED", [{ type: "ACTION", action: "CREATE_FEEDBACK_RECORD" }], templates)!,
      /needs a visit/,
    );
  });

  it("refuses a template that does not exist on that channel", () => {
    assert.match(
      workflowProblem("TOKEN_GENERATED", [send("token_generated", "WHATSAPP")], templates)!,
      /no active template/,
    );
  });

  it("refuses a template whose placeholders the trigger cannot fill", () => {
    assert.match(
      workflowProblem("PATIENT_REGISTERED", [send("appointment_reminder", "WHATSAPP")], templates)!,
      /\{\{doctorName\}\}, \{\{appointmentTime\}\}.*held back/,
    );
  });

  it("knows every placeholder the shipped templates use", () => {
    for (const name of ["token", "doctorName", "appointmentDate", "followUpTime", "roomLabel", "statusLink", "campDate"]) {
      assert.ok(KNOWN_VARIABLES.includes(name), name);
    }
  });
});
