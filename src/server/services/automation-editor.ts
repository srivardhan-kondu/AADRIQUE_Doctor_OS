import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type {
  MessageCategory,
  MessageChannel,
  WorkflowTriggerType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { placeholdersIn } from "@/lib/messaging";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import { type WorkflowStep, parseSteps } from "@/lib/workflow/steps";
import {
  KNOWN_VARIABLES,
  type TemplateRef,
  workflowProblem,
} from "@/lib/workflow/triggers";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §14 + §28 — editing message templates and building workflows.
 *
 * The two are checked against each other. A template may only use
 * placeholders some automation can fill, and a change to a template may not
 * quietly break an enabled workflow that sends it; a workflow may only send
 * templates that exist and can be filled for its trigger.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** The active templates, as the workflow validator sees them. */
async function templateRefs(organizationId: string): Promise<TemplateRef[]> {
  const templates = await prisma.messageTemplate.findMany({
    where: { organizationId, active: true },
    select: { key: true, channel: true, body: true, subject: true },
  });
  return templates.map((t) => ({
    key: t.key,
    channel: t.channel,
    placeholders: placeholdersIn(`${t.subject ?? ""} ${t.body}`),
  }));
}

/** Enabled workflows that a proposed set of templates would break. */
async function brokenWorkflows(
  organizationId: string,
  refs: TemplateRef[],
): Promise<{ name: string; problem: string }[]> {
  const workflows = await prisma.workflow.findMany({
    where: { organizationId, enabled: true },
    select: { name: true, trigger: true, steps: true },
  });
  const broken: { name: string; problem: string }[] = [];
  for (const workflow of workflows) {
    const parsed = parseSteps(workflow.steps);
    if (!parsed.ok) continue;
    const problem = workflowProblem(workflow.trigger, parsed.steps, refs);
    if (problem) broken.push({ name: workflow.name, problem });
  }
  return broken;
}

/* -------------------------------- templates ------------------------------- */

export interface TemplateEdit {
  id: string | null;
  key: string;
  name: string;
  channel: MessageChannel;
  category: MessageCategory;
  language: string;
  subject: string | null;
  body: string;
  providerTemplateId: string | null;
  active: boolean;
}

const LIMITS: Record<MessageChannel, number> = { WHATSAPP: 1024, SMS: 480, EMAIL: 5000 };

export async function getTemplateForEdit(
  actor: RequestActor,
  templateId: string,
): Promise<TemplateEdit> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);
  const t = await prisma.messageTemplate.findFirst({
    where: { id: templateId, ...tenantScope(actor) },
  });
  if (!t) throw notFound("Template");
  return {
    id: t.id,
    key: t.key,
    name: t.name,
    channel: t.channel,
    category: t.category,
    language: t.language,
    subject: t.subject,
    body: t.body,
    providerTemplateId: t.providerTemplateId,
    active: t.active,
  };
}

export async function saveTemplate(
  actor: RequestActor,
  input: TemplateEdit,
): Promise<{ id: string }> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);

  const key = input.key.trim();
  const body = input.body.trim();
  const subject = input.channel === "EMAIL" ? input.subject?.trim() || null : null;

  if (!/^[a-z][a-z0-9_]{2,40}$/.test(key)) {
    throw new ServiceError(
      "VALIDATION",
      "A template key is lower-case letters, numbers and underscores, like appointment_reminder.",
    );
  }
  if (!body) throw new ServiceError("VALIDATION", "The message is empty.");
  if (body.length > LIMITS[input.channel]) {
    throw new ServiceError(
      "VALIDATION",
      `A ${input.channel === "SMS" ? "text" : input.channel.toLowerCase()} message can be at most ${LIMITS[input.channel]} characters.`,
    );
  }
  if (input.channel === "EMAIL" && !subject) {
    throw new ServiceError("VALIDATION", "An email needs a subject.");
  }

  const placeholders = placeholdersIn(`${subject ?? ""} ${body}`);
  const unknown = placeholders.filter((p) => !KNOWN_VARIABLES.includes(p));
  if (unknown.length > 0) {
    throw new ServiceError(
      "VALIDATION",
      `Nothing fills ${unknown.map((p) => `{{${p}}}`).join(", ")}, so the message could never be sent.`,
      `Use one of: ${KNOWN_VARIABLES.map((v) => `{{${v}}}`).join(", ")}.`,
    );
  }

  const existing = input.id
    ? await prisma.messageTemplate.findFirst({
        where: { id: input.id, ...tenantScope(actor) },
        select: { id: true, key: true, channel: true },
      })
    : null;
  if (input.id && !existing) throw notFound("Template");

  // Would this change break an automation that is running?
  const current = await templateRefs(actor.organizationId);
  const proposed = current.filter(
    (t) => !(existing && t.key === existing.key && t.channel === existing.channel),
  );
  if (input.active) proposed.push({ key, channel: input.channel, placeholders });
  const broken = await brokenWorkflows(actor.organizationId, proposed);
  if (broken.length > 0) {
    throw invalidState(
      `This change would break the “${broken[0].name}” automation: ${broken[0].problem}`,
      "Change or turn off that workflow first.",
    );
  }

  const data = {
    key,
    name: input.name.trim() || key,
    channel: input.channel,
    category: input.category,
    language: input.language || "en",
    subject,
    body,
    // Ordered by first appearance: WhatsApp and DLT templates number their
    // parameters in that order.
    variables: placeholders,
    providerTemplateId: input.providerTemplateId?.trim() || null,
    active: input.active,
  };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.messageTemplate.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.messageTemplate.create({
            data: { ...data, organizationId: actor.organizationId },
            select: { id: true },
          });
      await writeAudit(tx, actor, {
        action: existing ? "RECORD_UPDATED" : "RECORD_CREATED",
        entityType: "MessageTemplate",
        entityId: saved.id,
        summary: `${existing ? "Edited" : "Created"} message template · ${data.name}`,
        metadata: { key, channel: input.channel },
      });
      return saved.id;
    }, TX_OPTIONS);
    return { id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        `There is already a ${input.channel} template called ${key} in that language.`,
      );
    }
    throw error;
  }
}

/* -------------------------------- workflows ------------------------------- */

export interface WorkflowEdit {
  id: string | null;
  name: string;
  description: string | null;
  trigger: WorkflowTriggerType;
  steps: WorkflowStep[];
  enabled: boolean;
}

export async function getWorkflowForEdit(
  actor: RequestActor,
  workflowId: string,
): Promise<WorkflowEdit & { problem: string | null }> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);
  const w = await prisma.workflow.findFirst({
    where: { id: workflowId, ...tenantScope(actor) },
  });
  if (!w) throw notFound("Workflow");
  const parsed = parseSteps(w.steps);
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    trigger: w.trigger,
    steps: parsed.ok ? parsed.steps : [],
    enabled: w.enabled,
    problem: parsed.ok ? null : parsed.error,
  };
}

/**
 * Saves a workflow. A new one starts switched off, so an administrator turns
 * it on deliberately; an enabled one stays enabled only if the edit is valid
 * — which it must be to save at all.
 */
export async function saveWorkflow(
  actor: RequestActor,
  input: Omit<WorkflowEdit, "steps" | "enabled"> & { steps: unknown },
): Promise<{ id: string }> {
  assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);

  const name = input.name.trim();
  if (!name) throw new ServiceError("VALIDATION", "Name the workflow.");

  const parsed = parseSteps(input.steps);
  if (!parsed.ok) throw new ServiceError("VALIDATION", parsed.error);

  const problem = workflowProblem(
    input.trigger,
    parsed.steps,
    await templateRefs(actor.organizationId),
  );
  if (problem) throw new ServiceError("VALIDATION", problem);

  const existing = input.id
    ? await prisma.workflow.findFirst({
        where: { id: input.id, ...tenantScope(actor) },
        select: { id: true },
      })
    : null;
  if (input.id && !existing) throw notFound("Workflow");

  const data = {
    name,
    description: input.description?.trim() || null,
    trigger: input.trigger,
    steps: parsed.steps as unknown as Prisma.InputJsonValue,
  };

  const id = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.workflow.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.workflow.create({
          data: { ...data, organizationId: actor.organizationId, enabled: false },
          select: { id: true },
        });
    await writeAudit(tx, actor, {
      action: existing ? "RECORD_UPDATED" : "RECORD_CREATED",
      entityType: "Workflow",
      entityId: saved.id,
      summary: `${existing ? "Edited" : "Created"} workflow · ${name}`,
      metadata: { trigger: input.trigger, steps: parsed.steps.length },
    });
    return saved.id;
  }, TX_OPTIONS);

  return { id };
}

/** For setWorkflowEnabled: whether a stored workflow could run as written. */
export async function storedWorkflowProblem(
  organizationId: string,
  trigger: WorkflowTriggerType,
  steps: WorkflowStep[],
): Promise<string | null> {
  return workflowProblem(trigger, steps, await templateRefs(organizationId));
}
