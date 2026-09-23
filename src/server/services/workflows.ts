import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkflowTriggerType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { tokenStatusUrl } from "@/lib/security/signed-link";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import {
  describeStep,
  durationMs,
  evaluateCondition,
  parseSteps,
  type ActionStep,
  type WaitStep,
  type WorkflowStep,
} from "@/lib/workflow/steps";
import type { RequestActor } from "@/server/context";
import { storedWorkflowProblem } from "./automation-editor";
import { writeAudit } from "./audit";
import { sendTemplatedMessage } from "./communication";
import { invalidState, notFound } from "./errors";

/**
 * Spec §28 — the workflow engine.
 *
 * An automation is a list of steps on a row, not a branch in a service. That
 * is the whole point: a clinic can change when a reminder goes out without a
 * deploy, and every automation in the product is visible in one place.
 *
 * Two decisions shape the engine:
 *
 *   1. **Conditions read live data, not the captured context.** A workflow
 *      that waits 24 hours and then checks `appointment.status EQUALS
 *      SCHEDULED` is asking whether the appointment is *still* scheduled. A
 *      snapshot taken at trigger time would answer the wrong question and
 *      remind patients who had already cancelled.
 *   2. **Firing a trigger can never break the thing that fired it.** A
 *      booking that succeeded must not fail because a reminder workflow threw,
 *      so `fireTrigger` swallows its own errors onto the run record.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** How far a WAIT may be resumed late before the step is abandoned. */
const STALE_AFTER_MS = 7 * 86_400_000;

export interface TriggerSubject {
  type: "Appointment" | "Visit" | "FollowUp" | "QueueEntry" | "Patient";
  id: string;
}

/**
 * Spec §28 — something happened; start whatever is listening.
 *
 * Deliberately fire-and-forget from the caller's point of view. The caller
 * has already committed its own transaction; this starts runs beside it.
 */
export async function fireTrigger(
  actor: RequestActor,
  trigger: WorkflowTriggerType,
  subject: TriggerSubject,
): Promise<number> {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { ...tenantScope(actor), trigger, enabled: true },
      select: { id: true, steps: true, name: true },
    });

    if (workflows.length === 0) return 0;

    let started = 0;

    for (const workflow of workflows) {
      const parsed = parseSteps(workflow.steps);

      if (!parsed.ok) {
        // A broken definition is recorded once, against the run, rather than
        // throwing into whatever business action fired the trigger.
        await prisma.workflowRun.create({
          data: {
            workflowId: workflow.id,
            status: "FAILED",
            subjectType: subject.type,
            subjectId: subject.id,
            context: { actorUserId: actor.userId },
            error: parsed.error,
            completedAt: new Date(),
          },
        });
        continue;
      }

      const run = await prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: "PENDING",
          subjectType: subject.type,
          subjectId: subject.id,
          // The actor is recorded so a run resumed hours later still acts as
          // somebody, and the audit trail names them.
          context: { actorUserId: actor.userId, trigger },
        },
        select: { id: true },
      });

      started += 1;
      await advanceRun(run.id);
    }

    return started;
  } catch (error) {
    console.error(
      `Workflow trigger ${trigger} failed`,
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}

/**
 * Runs a workflow forward until it waits, stops or finishes.
 *
 * Steps execute one at a time and `stepIndex` is written after each, so a
 * crash resumes at the next step rather than repeating the one that already
 * sent a message.
 */
export async function advanceRun(runId: string): Promise<void> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      stepIndex: true,
      subjectType: true,
      subjectId: true,
      context: true,
      startedAt: true,
      workflow: {
        select: { id: true, name: true, steps: true, organizationId: true },
      },
    },
  });

  if (!run) return;
  if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELLED") {
    return;
  }

  const parsed = parseSteps(run.workflow.steps);
  if (!parsed.ok) {
    await fail(run.id, parsed.error);
    return;
  }

  const actor = await systemActor(
    run.workflow.organizationId,
    readActorId(run.context),
  );

  if (!actor) {
    await fail(run.id, "No account available to run this workflow as.");
    return;
  }

  let index = run.stepIndex;

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: "RUNNING" },
  });

  while (index < parsed.steps.length) {
    const step = parsed.steps[index];

    try {
      if (step.type === "WAIT") {
        const resumeAt = await resolveWait(step, run.subjectType, run.subjectId, run.startedAt);

        if (resumeAt && resumeAt.getTime() > Date.now()) {
          await prisma.workflowRun.update({
            where: { id: run.id },
            data: { status: "WAITING", stepIndex: index + 1, resumeAt },
          });
          return;
        }

        // The moment has already passed — carry straight on.
        index += 1;
        continue;
      }

      if (step.type === "CONDITION") {
        const context = await resolveContext(run.subjectType, run.subjectId);

        if (!evaluateCondition(step, context)) {
          // A condition that does not hold is a normal end, not a failure.
          await prisma.workflowRun.update({
            where: { id: run.id },
            data: {
              status: "COMPLETED",
              stepIndex: index,
              completedAt: new Date(),
              resumeAt: null,
            },
          });
          return;
        }

        index += 1;
        continue;
      }

      await runAction(actor, step, run.subjectType, run.subjectId);

      index += 1;
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { stepIndex: index },
      });
    } catch (error) {
      await fail(
        run.id,
        `Step ${index + 1} (${describeStep(step)}): ${
          error instanceof Error ? error.message : "failed"
        }`,
      );
      return;
    }
  }

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: {
      status: "COMPLETED",
      stepIndex: index,
      completedAt: new Date(),
      resumeAt: null,
    },
  });
}

/**
 * Spec §28 — resumes every run whose WAIT has elapsed.
 *
 * Called by the scheduled job. Runs that have been waiting far longer than
 * intended are abandoned rather than fired late: a reminder for an
 * appointment that happened last week is worse than no reminder.
 */
export async function processDueRuns(limit = 50): Promise<{
  resumed: number;
  abandoned: number;
}> {
  const now = new Date();

  const due = await prisma.workflowRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: now } },
    orderBy: { resumeAt: "asc" },
    take: limit,
    select: { id: true, resumeAt: true },
  });

  let resumed = 0;
  let abandoned = 0;

  for (const run of due) {
    const lateBy = run.resumeAt ? now.getTime() - run.resumeAt.getTime() : 0;

    if (lateBy > STALE_AFTER_MS) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "CANCELLED",
          completedAt: now,
          resumeAt: null,
          error: "Abandoned — the moment this step was waiting for is long past.",
        },
      });
      abandoned += 1;
      continue;
    }

    await advanceRun(run.id);
    resumed += 1;
  }

  return { resumed, abandoned };
}

async function fail(runId: string, error: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: error.slice(0, 500),
      completedAt: new Date(),
      resumeAt: null,
    },
  });
}

function readActorId(context: Prisma.JsonValue): string | null {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    return null;
  }
  const value = (context as Record<string, unknown>).actorUserId;
  return typeof value === "string" ? value : null;
}

/**
 * The account a workflow acts as.
 *
 * Preferring whoever triggered it keeps the audit trail honest — the
 * confirmation that went out because a receptionist booked an appointment is
 * attributable to that booking. A run resumed after they have gone home falls
 * back to an administrator of the same organization, never across one.
 */
async function systemActor(
  organizationId: string,
  preferredUserId: string | null,
): Promise<RequestActor | null> {
  const membership = await prisma.membership.findFirst({
    where: {
      organizationId,
      active: true,
      ...(preferredUserId ? { userId: preferredUserId } : { role: "HOSPITAL_ADMIN" }),
    },
    select: {
      userId: true,
      facilityId: true,
      role: true,
      user: { select: { name: true, email: true } },
      organization: { select: { name: true } },
      facility: { select: { name: true } },
    },
  });

  const resolved =
    membership ??
    (await prisma.membership.findFirst({
      where: { organizationId, active: true, role: "HOSPITAL_ADMIN" },
      select: {
        userId: true,
        facilityId: true,
        role: true,
        user: { select: { name: true, email: true } },
        organization: { select: { name: true } },
        facility: { select: { name: true } },
      },
    }));

  if (!resolved) return null;

  return {
    userId: resolved.userId,
    organizationId,
    facilityId: resolved.facilityId,
    role: resolved.role,
    overrides: [],
    // An automation acting for someone is not a sign-in; it has no password
    // to change.
    mustChangePassword: false,
    name: resolved.user.name,
    email: resolved.user.email,
    doctorId: null,
    department: null,
    facilityName: resolved.facility?.name ?? "",
    organizationName: resolved.organization.name,
  };
}

/** When a WAIT should next be picked up. */
async function resolveWait(
  step: WaitStep,
  subjectType: string,
  subjectId: string,
  startedAt: Date,
): Promise<Date | null> {
  if (step.duration) {
    return new Date(startedAt.getTime() + durationMs(step.duration));
  }

  switch (step.until) {
    case "24_HOURS_BEFORE_APPOINTMENT": {
      const appointment = await prisma.appointment.findUnique({
        where: { id: subjectId },
        select: { scheduledStart: true },
      });
      return appointment
        ? new Date(appointment.scheduledStart.getTime() - 86_400_000)
        : null;
    }
    case "1_DAY_BEFORE_DUE": {
      const followUp = await prisma.followUp.findUnique({
        where: { id: subjectId },
        select: { dueDate: true },
      });
      return followUp ? new Date(followUp.dueDate.getTime() - 86_400_000) : null;
    }
    case "2_HOURS_AFTER_COMPLETION": {
      const visit = await prisma.visit.findUnique({
        where: { id: subjectId },
        select: { completedAt: true },
      });
      return visit?.completedAt
        ? new Date(visit.completedAt.getTime() + 7_200_000)
        : new Date(startedAt.getTime() + 7_200_000);
    }
    default:
      return null;
  }
}

/**
 * The live values a condition is evaluated against.
 *
 * Re-read on every evaluation. See the note at the top of this file: a
 * snapshot would make "is it still scheduled?" unanswerable.
 */
async function resolveContext(
  subjectType: string,
  subjectId: string,
): Promise<Record<string, unknown>> {
  const patientFields = {
    id: true,
    firstName: true,
    phone: true,
    email: true,
    whatsappOptIn: true,
    smsOptIn: true,
    emailOptIn: true,
  } as const;

  if (subjectType === "Appointment") {
    const appointment = await prisma.appointment.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        status: true,
        type: true,
        scheduledStart: true,
        patient: { select: patientFields },
        doctor: { select: { user: { select: { name: true } } } },
        facility: { select: { name: true, phone: true } },
      },
    });
    if (!appointment) return {};
    return {
      appointment,
      patient: appointment.patient,
      doctor: { name: appointment.doctor.user.name },
      facility: appointment.facility,
    };
  }

  if (subjectType === "FollowUp") {
    const followUp = await prisma.followUp.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        status: true,
        dueDate: true,
        reason: true,
        patient: { select: patientFields },
        doctor: { select: { user: { select: { name: true } } } },
      },
    });
    if (!followUp) return {};
    return {
      followUp,
      patient: followUp.patient,
      doctor: { name: followUp.doctor.user.name },
    };
  }

  if (subjectType === "Visit") {
    const visit = await prisma.visit.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        status: true,
        stage: true,
        completedAt: true,
        patient: { select: patientFields },
        doctor: { select: { user: { select: { name: true } } } },
        facility: { select: { name: true, phone: true } },
      },
    });
    if (!visit) return {};
    // The feedback request thanks the patient for visiting {{doctorName}}:
    // without the doctor here it could never be sent.
    return {
      visit,
      patient: visit.patient,
      doctor: { name: visit.doctor.user.name },
      facility: visit.facility,
    };
  }

  if (subjectType === "Patient") {
    const patient = await prisma.patient.findUnique({
      where: { id: subjectId },
      select: {
        ...patientFields,
        mrn: true,
        facility: { select: { name: true, phone: true } },
      },
    });
    if (!patient) return {};
    return { patient, facility: patient.facility };
  }

  if (subjectType === "QueueEntry") {
    const entry = await prisma.queueEntry.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        status: true,
        token: true,
        queueId: true,
        patient: { select: patientFields },
        queue: {
          select: {
            roomLabel: true,
            doctor: {
              select: {
                consultationMinutes: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!entry) return {};

    // Spec §12 — the token message is only useful with the live queue state
    // beside it: which token is in the room, and how long that implies.
    const [current, ahead] = await Promise.all([
      prisma.queueEntry.findFirst({
        where: {
          queueId: entry.queueId,
          status: { in: ["CALLED", "IN_CONSULTATION"] },
        },
        select: { token: true },
      }),
      prisma.queueEntry.count({
        where: { queueId: entry.queueId, status: { in: ["WAITING", "VITALS"] } },
      }),
    ]);

    return {
      queueEntry: {
        ...entry,
        currentToken: current?.token ?? null,
        waitMinutes:
          Math.max(0, ahead - 1) * entry.queue.doctor.consultationMinutes,
        roomLabel: entry.queue.roomLabel,
      },
      patient: entry.patient,
      doctor: { name: entry.queue.doctor.user.name },
    };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: subjectId },
    select: patientFields,
  });
  return patient ? { patient } : {};
}

/** Executes one ACTION step. */
async function runAction(
  actor: RequestActor,
  step: ActionStep,
  subjectType: string,
  subjectId: string,
): Promise<void> {
  const context = await resolveContext(subjectType, subjectId);
  // resolveContext selects these for every subject (patientFields).
  const patient = context.patient as
    | {
        id: string;
        firstName: string;
        whatsappOptIn: boolean;
        smsOptIn: boolean;
        emailOptIn: boolean;
      }
    | undefined;

  switch (step.action) {
    case "SEND_MESSAGE": {
      if (!patient) throw new Error("no patient on this subject");
      if (!step.templateKey || !step.channel) {
        throw new Error("the step names no template or channel");
      }

      // A patient who has not agreed to this channel is skipped — that is the
      // automation working, not failing (spec §14).
      const consent = {
        WHATSAPP: patient.whatsappOptIn,
        SMS: patient.smsOptIn,
        EMAIL: patient.emailOptIn,
      }[step.channel];
      if (!consent) return;

      // Goes through the communication service, so address checks, delivery
      // tracking and the audit entry all behave exactly as they do for a
      // message a person sent by hand. Anything else that stops the message
      // — a detail the template needs and this run lacks, an unusable
      // address — fails the run with the reason.
      await sendTemplatedMessage(
        actor,
        {
          patientId: patient.id,
          templateKey: step.templateKey,
          channel: step.channel,
          appointmentId: subjectType === "Appointment" ? subjectId : null,
          variables: templateVariables(context),
        },
        { rethrow: true },
      );
      return;
    }

    case "CREATE_FEEDBACK_RECORD": {
      const visitId = await resolveVisitId(subjectType, subjectId);
      if (!visitId) throw new Error("no visit to attach feedback to");

      const visit = await prisma.visit.findUnique({
        where: { id: visitId },
        select: { id: true, patientId: true, doctorId: true, organizationId: true },
      });
      if (!visit) throw new Error("visit not found");

      // Spec §15 — one feedback record per visit.
      await prisma.feedback.upsert({
        where: { visitId: visit.id },
        create: {
          organizationId: visit.organizationId,
          patientId: visit.patientId,
          doctorId: visit.doctorId,
          visitId: visit.id,
        },
        update: {},
      });
      return;
    }

    case "CREATE_FOLLOW_UP": {
      const visitId = await resolveVisitId(subjectType, subjectId);
      const visit = visitId
        ? await prisma.visit.findUnique({
            where: { id: visitId },
            select: { id: true, patientId: true, doctorId: true, organizationId: true },
          })
        : null;
      if (!visit) throw new Error("no visit to create a follow-up from");

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (step.afterDays ?? 7));
      dueDate.setHours(0, 0, 0, 0);

      await prisma.followUp.create({
        data: {
          organizationId: visit.organizationId,
          patientId: visit.patientId,
          doctorId: visit.doctorId,
          visitId: visit.id,
          dueDate,
          reason: step.title ?? "Automated follow-up",
          status: "PENDING",
        },
      });
      return;
    }

    case "NOTIFY_STAFF": {
      await prisma.notification.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.userId,
          level: "IMPORTANT",
          title: step.title ?? "Workflow alert",
          body: step.body ?? "A workflow raised this.",
        },
      });
      return;
    }
  }
}

async function resolveVisitId(
  subjectType: string,
  subjectId: string,
): Promise<string | null> {
  if (subjectType === "Visit") return subjectId;

  if (subjectType === "Appointment") {
    const visit = await prisma.visit.findUnique({
      where: { appointmentId: subjectId },
      select: { id: true },
    });
    return visit?.id ?? null;
  }

  if (subjectType === "QueueEntry") {
    const visit = await prisma.visit.findUnique({
      where: { queueEntryId: subjectId },
      select: { id: true },
    });
    return visit?.id ?? null;
  }

  return null;
}

/**
 * Every placeholder the shipped templates name.
 *
 * A message that still contains a `{{placeholder}}` is refused by the
 * communication service rather than sent, so a missing value here shows up as
 * a failed workflow step instead of a patient receiving a hole.
 */
function templateVariables(
  context: Record<string, unknown>,
): Record<string, string> {
  const patient = context.patient as { firstName?: string } | undefined;
  const doctor = context.doctor as { name?: string } | undefined;
  const facility = context.facility as
    | { name?: string; phone?: string | null }
    | undefined;
  const appointment = context.appointment as
    | { scheduledStart?: Date }
    | undefined;
  const followUp = context.followUp as { dueDate?: Date } | undefined;
  const queueEntry = context.queueEntry as
    | {
        id?: string;
        token?: string;
        currentToken?: string | null;
        waitMinutes?: number;
        roomLabel?: string | null;
      }
    | undefined;

  const when = appointment?.scheduledStart ?? followUp?.dueDate ?? null;

  const variables: Record<string, string> = {};

  if (patient?.firstName) variables.patientName = patient.firstName;
  if (doctor?.name) variables.doctorName = doctor.name;
  if (facility) variables.facilityPhone = facility.phone ?? facility.name ?? "";

  if (queueEntry?.token) {
    variables.token = queueEntry.token;
    variables.currentToken = queueEntry.currentToken ?? "—";
    variables.waitMinutes = String(queueEntry.waitMinutes ?? 0);
    if (queueEntry.roomLabel) variables.roomLabel = queueEntry.roomLabel;
    // Spec §12 — the patient's live token page. Only offered when the app
    // knows its own public address; a template that uses it is otherwise
    // held back as unfinished rather than sent with a broken link.
    const link = queueEntry.id ? tokenStatusUrl(queueEntry.id) : null;
    if (link) variables.statusLink = link;
  }

  if (when) {
    const date = when.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const time = when.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    variables.appointmentDate = date;
    variables.appointmentTime = time;
    variables.followUpDate = date;
    variables.followUpTime = time;
  }

  return variables;
}

/* ----------------------------- admin surface ----------------------------- */

export interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  trigger: WorkflowTriggerType;
  enabled: boolean;
  steps: { description: string; type: WorkflowStep["type"] }[];
  /** Set when the stored definition cannot be parsed. */
  problem: string | null;
  runs: { total: number; waiting: number; failed: number; completed: number };
  lastRunAt: Date | null;
}

export const TRIGGER_LABEL: Record<WorkflowTriggerType, string> = {
  APPOINTMENT_SCHEDULED: "An appointment is booked",
  APPOINTMENT_COMPLETED: "A consultation is completed",
  APPOINTMENT_CANCELLED: "An appointment is cancelled",
  TOKEN_GENERATED: "A token is issued",
  TOKEN_APPROACHING: "A patient is nearly next",
  CONSULTATION_SIGNED: "A consultation is signed",
  FOLLOW_UP_DUE: "A follow-up falls due",
  PATIENT_REGISTERED: "A patient registers",
};

export async function listWorkflows(
  actor: RequestActor,
): Promise<WorkflowRow[]> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);

  const workflows = await prisma.workflow.findMany({
    where: tenantScope(actor),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      trigger: true,
      enabled: true,
      steps: true,
      runs: {
        orderBy: { startedAt: "desc" },
        take: 200,
        select: { status: true, startedAt: true },
      },
    },
  });

  return workflows.map((workflow) => {
    const parsed = parseSteps(workflow.steps);

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      enabled: workflow.enabled,
      steps: parsed.ok
        ? parsed.steps.map((step) => ({
            description: describeStep(step),
            type: step.type,
          }))
        : [],
      problem: parsed.ok ? null : parsed.error,
      runs: {
        total: workflow.runs.length,
        waiting: workflow.runs.filter((r) => r.status === "WAITING").length,
        failed: workflow.runs.filter((r) => r.status === "FAILED").length,
        completed: workflow.runs.filter((r) => r.status === "COMPLETED").length,
      },
      lastRunAt: workflow.runs[0]?.startedAt ?? null,
    };
  });
}

/** Spec §28 — a clinic turns an automation on or off without a deploy. */
export async function setWorkflowEnabled(
  actor: RequestActor,
  workflowId: string,
  enabled: boolean,
): Promise<{ name: string }> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, ...tenantScope(actor) },
    select: { id: true, name: true, steps: true, enabled: true, trigger: true },
  });

  if (!workflow) throw notFound("Workflow");

  if (enabled) {
    const parsed = parseSteps(workflow.steps);
    const problem = parsed.ok
      ? await storedWorkflowProblem(actor.organizationId, workflow.trigger, parsed.steps)
      : parsed.error;
    if (problem) {
      throw invalidState(
        `This workflow cannot be enabled: ${problem}`,
        "Edit it so it can run, then turn it on.",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflow.update({
      where: { id: workflow.id },
      data: { enabled },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Workflow",
      entityId: workflow.id,
      summary: `${enabled ? "Enabled" : "Disabled"} workflow · ${workflow.name}`,
      metadata: { enabled },
    });
  }, TX_OPTIONS);

  return { name: workflow.name };
}

export interface WorkflowRunRow {
  id: string;
  workflowName: string;
  status: string;
  subjectType: string;
  stepIndex: number;
  startedAt: Date;
  completedAt: Date | null;
  resumeAt: Date | null;
  error: string | null;
}

export async function listRecentRuns(
  actor: RequestActor,
  limit = 25,
): Promise<WorkflowRunRow[]> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);

  const runs = await prisma.workflowRun.findMany({
    where: { workflow: tenantScope(actor) },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      subjectType: true,
      stepIndex: true,
      startedAt: true,
      completedAt: true,
      resumeAt: true,
      error: true,
      workflow: { select: { name: true } },
    },
  });

  return runs.map((run) => ({
    id: run.id,
    workflowName: run.workflow.name,
    status: run.status,
    subjectType: run.subjectType,
    stepIndex: run.stepIndex,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    resumeAt: run.resumeAt,
    error: run.error,
  }));
}
