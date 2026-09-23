import { z } from "zod";

/**
 * Spec §28 — workflow primitives.
 *
 * "Do not hard-code all communication automations." An automation is three
 * kinds of step in a list, stored as data on the `Workflow` row:
 *
 *   TRIGGER  something happened
 *   WAIT     hold for a duration, or until a moment relative to the subject
 *   CONDITION  only continue if this is still true
 *   ACTION   do one thing
 *
 * The vocabulary is deliberately small. Every step a workflow can take is in
 * this file, which means a stored workflow can be read and reasoned about
 * without reading the engine — and an unknown step is rejected at parse time
 * rather than silently skipped at run time.
 */

/** Points in time a WAIT can be measured against, relative to the subject. */
export const WAIT_ANCHORS = [
  "24_HOURS_BEFORE_APPOINTMENT",
  "1_DAY_BEFORE_DUE",
  "2_HOURS_AFTER_COMPLETION",
] as const;

export type WaitAnchor = (typeof WAIT_ANCHORS)[number];

const durationSchema = z
  .object({
    minutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
    hours: z.number().int().min(0).max(24 * 30).optional(),
    days: z.number().int().min(0).max(365).optional(),
  })
  .refine(
    (d) => (d.minutes ?? 0) + (d.hours ?? 0) + (d.days ?? 0) > 0,
    "A wait needs a duration",
  );

export const waitStepSchema = z
  .object({
    type: z.literal("WAIT"),
    duration: durationSchema.optional(),
    until: z.enum(WAIT_ANCHORS).optional(),
  })
  .refine(
    (step) => Boolean(step.duration) !== Boolean(step.until),
    "A wait is either a duration or an anchor, never both",
  );

export const CONDITION_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "IS_PRESENT",
  "IS_ABSENT",
  "GREATER_THAN",
  "LESS_THAN",
] as const;

export const conditionStepSchema = z.object({
  type: z.literal("CONDITION"),
  /** Dotted path into the run's resolved context, e.g. `patient.whatsappOptIn`. */
  field: z.string().min(1).max(120),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const WORKFLOW_ACTIONS = [
  "SEND_MESSAGE",
  "CREATE_FEEDBACK_RECORD",
  "CREATE_FOLLOW_UP",
  "NOTIFY_STAFF",
] as const;

export const actionStepSchema = z.object({
  type: z.literal("ACTION"),
  action: z.enum(WORKFLOW_ACTIONS),
  templateKey: z.string().min(1).max(64).optional(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]).optional(),
  /** NOTIFY_STAFF copy. */
  title: z.string().max(140).optional(),
  body: z.string().max(400).optional(),
  /** CREATE_FOLLOW_UP offset from the trigger. */
  afterDays: z.number().int().min(0).max(365).optional(),
});

export const workflowStepSchema = z.discriminatedUnion("type", [
  waitStepSchema,
  conditionStepSchema,
  actionStepSchema,
]);

export type WaitStep = z.infer<typeof waitStepSchema>;
export type ConditionStep = z.infer<typeof conditionStepSchema>;
export type ActionStep = z.infer<typeof actionStepSchema>;
export type WorkflowStep = WaitStep | ConditionStep | ActionStep;

/**
 * Parses the stored `steps` JSON.
 *
 * A malformed step list disables the workflow rather than half-running it:
 * an automation that sends the confirmation and silently skips the reminder
 * is worse than one that refuses to start and says why.
 */
export function parseSteps(
  raw: unknown,
): { ok: true; steps: WorkflowStep[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Steps must be a list." };
  }

  const steps: WorkflowStep[] = [];

  for (const [index, entry] of raw.entries()) {
    const parsed = workflowStepSchema.safeParse(entry);
    if (!parsed.success) {
      const type =
        typeof entry === "object" && entry !== null && "type" in entry
          ? String((entry as { type: unknown }).type)
          : "unknown";
      return {
        ok: false,
        error: `Step ${index + 1} (${type}) is not valid: ${parsed.error.issues[0]?.message ?? "unrecognised"}.`,
      };
    }
    steps.push(parsed.data as WorkflowStep);
  }

  return { ok: true, steps };
}

/** Milliseconds a duration represents. */
export function durationMs(duration: NonNullable<WaitStep["duration"]>): number {
  return (
    (duration.minutes ?? 0) * 60_000 +
    (duration.hours ?? 0) * 3_600_000 +
    (duration.days ?? 0) * 86_400_000
  );
}

/** Reads a dotted path out of the resolved context. */
export function readPath(
  context: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = context;

  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Evaluates one condition against the resolved context.
 *
 * A condition that references a field the context does not have is false, not
 * an error — the workflow simply stops. Treating a typo'd path as "true"
 * would send messages nobody asked for.
 */
export function evaluateCondition(
  step: ConditionStep,
  context: Record<string, unknown>,
): boolean {
  const actual = readPath(context, step.field);

  switch (step.operator) {
    case "IS_PRESENT":
      return actual !== null && actual !== undefined && actual !== "";
    case "IS_ABSENT":
      return actual === null || actual === undefined || actual === "";
    case "EQUALS":
      return actual === step.value;
    case "NOT_EQUALS":
      return actual !== step.value;
    case "GREATER_THAN":
      return typeof actual === "number" && typeof step.value === "number"
        ? actual > step.value
        : false;
    case "LESS_THAN":
      return typeof actual === "number" && typeof step.value === "number"
        ? actual < step.value
        : false;
  }
}

/** A short human sentence for one step, used by the admin UI. */
export function describeStep(step: WorkflowStep): string {
  if (step.type === "WAIT") {
    if (step.until) {
      return {
        "24_HOURS_BEFORE_APPOINTMENT": "Wait until 24 hours before the appointment",
        "1_DAY_BEFORE_DUE": "Wait until the day before it is due",
        "2_HOURS_AFTER_COMPLETION": "Wait two hours after the visit ends",
      }[step.until];
    }

    const d = step.duration!;
    const parts = [
      d.days && `${d.days} ${d.days === 1 ? "day" : "days"}`,
      d.hours && `${d.hours} ${d.hours === 1 ? "hour" : "hours"}`,
      d.minutes && `${d.minutes} ${d.minutes === 1 ? "minute" : "minutes"}`,
    ].filter(Boolean);

    return `Wait ${parts.join(" ")}`;
  }

  if (step.type === "CONDITION") {
    const field = step.field.split(".").pop() ?? step.field;
    const readable = field.replace(/([A-Z])/g, " $1").toLowerCase();

    switch (step.operator) {
      case "IS_PRESENT":
        return `Only if ${readable} is on record`;
      case "IS_ABSENT":
        return `Only if ${readable} is missing`;
      case "EQUALS":
        return `Only if ${readable} is ${String(step.value)}`;
      case "NOT_EQUALS":
        return `Only if ${readable} is not ${String(step.value)}`;
      case "GREATER_THAN":
        return `Only if ${readable} is above ${String(step.value)}`;
      case "LESS_THAN":
        return `Only if ${readable} is below ${String(step.value)}`;
    }
  }

  switch (step.action) {
    case "SEND_MESSAGE":
      return `Send the ${(step.templateKey ?? "message").replace(/_/g, " ")} on ${
        step.channel ? CHANNEL_WORD[step.channel] : "the default channel"
      }`;
    case "CREATE_FEEDBACK_RECORD":
      return "Open a feedback record for the visit";
    case "CREATE_FOLLOW_UP":
      return `Create a follow-up${step.afterDays ? ` due in ${step.afterDays} days` : ""}`;
    case "NOTIFY_STAFF":
      return `Notify staff — ${step.title ?? "an alert"}`;
  }
}

const CHANNEL_WORD: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "email",
};
