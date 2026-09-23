import type { WorkflowTriggerType } from "@/generated/prisma/enums";
import type { WaitAnchor, WorkflowStep } from "./steps";

/**
 * Spec §28 — what each trigger gives an automation to work with.
 *
 * A workflow is data an administrator writes, so the builder must refuse the
 * ones that could only fail when they run: a condition on a field the
 * trigger never provides (it would always be false), a wait anchored to a
 * date the subject does not have, an action that needs a visit where there
 * is none, or a template whose placeholders cannot be filled (the message
 * would be held back every time). This catalogue is the one place that
 * knows, and the engine's `resolveContext` is what it describes.
 */

export type Subject = "Appointment" | "Visit" | "QueueEntry" | "FollowUp" | "Patient";

export interface FieldOption {
  path: string;
  label: string;
  kind: "boolean" | "text" | "choice";
  choices?: readonly string[];
}

const PATIENT_FIELDS: FieldOption[] = [
  { path: "patient.phone", label: "Patient's mobile number", kind: "text" },
  { path: "patient.email", label: "Patient's email", kind: "text" },
  { path: "patient.whatsappOptIn", label: "Patient agreed to WhatsApp", kind: "boolean" },
  { path: "patient.smsOptIn", label: "Patient agreed to SMS", kind: "boolean" },
  { path: "patient.emailOptIn", label: "Patient agreed to email", kind: "boolean" },
];

const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CHECKED_IN",
  "WAITING",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULED",
] as const;

interface SubjectInfo {
  label: string;
  fields: FieldOption[];
  anchors: readonly WaitAnchor[];
  /** Actions that need a visit only work where there is one. */
  needsVisitActions: boolean;
  /** Template placeholders this subject always fills. */
  variables: readonly string[];
  /** Placeholders filled only sometimes — a template using one may be held back. */
  sometimes?: readonly string[];
}

export const SUBJECTS: Record<Subject, SubjectInfo> = {
  Appointment: {
    label: "the appointment",
    fields: [
      ...PATIENT_FIELDS,
      { path: "appointment.status", label: "Appointment status", kind: "choice", choices: APPOINTMENT_STATUSES },
      {
        path: "appointment.type",
        label: "Appointment type",
        kind: "choice",
        choices: ["NEW_CONSULTATION", "FOLLOW_UP", "WALK_IN", "PROCEDURE", "TELECONSULTATION"],
      },
    ],
    anchors: ["24_HOURS_BEFORE_APPOINTMENT"],
    needsVisitActions: false,
    variables: ["patientName", "doctorName", "facilityPhone", "appointmentDate", "appointmentTime"],
  },
  Visit: {
    label: "the visit",
    fields: [
      ...PATIENT_FIELDS,
      { path: "visit.status", label: "Visit status", kind: "choice", choices: ["OPEN", "COMPLETED", "CANCELLED"] },
    ],
    anchors: ["2_HOURS_AFTER_COMPLETION"],
    needsVisitActions: true,
    variables: ["patientName", "doctorName", "facilityPhone"],
  },
  QueueEntry: {
    label: "the token",
    fields: [
      ...PATIENT_FIELDS,
      {
        path: "queueEntry.status",
        label: "Token status",
        kind: "choice",
        choices: ["WAITING", "VITALS", "CALLED", "IN_CONSULTATION", "COMPLETED", "SKIPPED", "LEFT"],
      },
    ],
    anchors: [],
    needsVisitActions: false,
    variables: ["patientName", "doctorName", "token", "currentToken", "waitMinutes"],
    sometimes: ["roomLabel", "statusLink"],
  },
  FollowUp: {
    label: "the follow-up",
    fields: [
      ...PATIENT_FIELDS,
      {
        path: "followUp.status",
        label: "Follow-up status",
        kind: "choice",
        choices: ["PENDING", "SCHEDULED", "COMPLETED", "MISSED", "CANCELLED"],
      },
    ],
    anchors: ["1_DAY_BEFORE_DUE"],
    needsVisitActions: false,
    variables: ["patientName", "doctorName", "followUpDate", "followUpTime"],
  },
  Patient: {
    label: "the patient",
    fields: PATIENT_FIELDS,
    anchors: [],
    needsVisitActions: false,
    variables: ["patientName", "facilityPhone"],
  },
};

export const TRIGGERS: Record<WorkflowTriggerType, { label: string; subject: Subject }> = {
  APPOINTMENT_SCHEDULED: { label: "An appointment is booked", subject: "Appointment" },
  APPOINTMENT_CANCELLED: { label: "An appointment is cancelled", subject: "Appointment" },
  APPOINTMENT_COMPLETED: { label: "A visit is completed", subject: "Visit" },
  CONSULTATION_SIGNED: { label: "A consultation is signed", subject: "Visit" },
  TOKEN_GENERATED: { label: "A token is issued", subject: "QueueEntry" },
  TOKEN_APPROACHING: { label: "A token is nearly up", subject: "QueueEntry" },
  FOLLOW_UP_DUE: { label: "A follow-up is created", subject: "FollowUp" },
  PATIENT_REGISTERED: { label: "A patient is registered", subject: "Patient" },
};

/** Every placeholder any automation can fill — the vocabulary templates may use. */
export const KNOWN_VARIABLES: readonly string[] = [
  ...new Set(
    Object.values(SUBJECTS).flatMap((s) => [...s.variables, ...(s.sometimes ?? [])]),
  ),
  // Filled by whoever sends a campaign, not by an automation.
  "campDate",
];

export interface TemplateRef {
  key: string;
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  placeholders: string[];
}

/**
 * Why this workflow could not work as written, or null when it can. Checked
 * step by step, and the first problem is named in words an administrator
 * can act on.
 */
export function workflowProblem(
  trigger: WorkflowTriggerType,
  steps: WorkflowStep[],
  templates: TemplateRef[],
): string | null {
  const subject = SUBJECTS[TRIGGERS[trigger].subject];

  if (steps.length === 0) return "Add at least one step.";
  if (!steps.some((s) => s.type === "ACTION")) {
    return "A workflow needs at least one action — otherwise it does nothing.";
  }
  if (steps.length > 20) return "Keep a workflow to twenty steps or fewer.";

  for (const [index, step] of steps.entries()) {
    const at = `Step ${index + 1}`;

    if (step.type === "WAIT" && step.until && !subject.anchors.includes(step.until)) {
      return `${at} waits for a moment ${subject.label} does not have. Use a fixed duration instead.`;
    }

    if (step.type === "CONDITION") {
      const field = subject.fields.find((f) => f.path === step.field);
      if (!field) return `${at} checks a field that ${subject.label} does not provide.`;
      const needsValue = step.operator !== "IS_PRESENT" && step.operator !== "IS_ABSENT";
      if (needsValue && step.value === undefined) return `${at} compares against nothing — set a value.`;
      if (field.kind === "boolean" && needsValue && typeof step.value !== "boolean") {
        return `${at} should compare against yes or no.`;
      }
      if (field.kind === "choice" && needsValue && !field.choices?.includes(String(step.value))) {
        return `${at} compares against a value that field never has.`;
      }
    }

    if (step.type === "ACTION") {
      if (
        (step.action === "CREATE_FEEDBACK_RECORD" || step.action === "CREATE_FOLLOW_UP") &&
        !subject.needsVisitActions
      ) {
        return `${at} needs a visit, and ${subject.label} is not one. Use it on "A visit is completed" or "A consultation is signed".`;
      }

      if (step.action === "SEND_MESSAGE") {
        if (!step.templateKey || !step.channel) return `${at} needs a template and a channel.`;
        const template = templates.find(
          (t) => t.key === step.templateKey && t.channel === step.channel,
        );
        if (!template) {
          return `${at} sends "${step.templateKey}" on ${step.channel}, and there is no active template by that name for that channel.`;
        }
        const always = new Set(subject.variables);
        const unfilled = template.placeholders.filter(
          (p) => !always.has(p) && !subject.sometimes?.includes(p),
        );
        if (unfilled.length > 0) {
          return `${at}: the "${template.key}" template uses ${unfilled.map((p) => `{{${p}}}`).join(", ")}, which ${subject.label} cannot fill — the message would be held back every time.`;
        }
      }

      if (step.action === "NOTIFY_STAFF" && !step.title?.trim()) {
        return `${at} notifies staff without saying what about — add a title.`;
      }
    }
  }

  return null;
}
