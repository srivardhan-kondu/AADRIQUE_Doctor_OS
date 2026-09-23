import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AIActionType } from "@/generated/prisma/enums";
import {
  resolveProvider,
  isModelConfigured,
  type AIRequest,
  type AIResult,
  type AISection,
  type AISource,
} from "@/lib/ai";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "../audit";
import { ServiceError, invalidState, notFound } from "../errors";
import {
  gatherPatientContext,
  searchKnowledgeBase,
  searchPatientRecord,
} from "./retrieval";

export * from "./retrieval";

/**
 * Spec §32 — the AI application service.
 *
 * This is the orchestrator layer: it retrieves, calls the provider, records
 * the result as an `AIAction` awaiting review, and writes the audit entry.
 *
 * Two rules shape every function here, both from spec §10:
 *
 *   1. Nothing generated is written into a clinical record. An AI result is
 *      stored as its own reviewable artefact, and only an explicit doctor
 *      action moves it anywhere near the note.
 *   2. Every generated surface is recorded with the sources it was built
 *      from, so the doctor can check any sentence against the record.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface AIOutcome {
  actionId: string;
  sections: AISection[];
  sources: AISource[];
  provider: string;
  model: string | null;
  grounded: boolean;
  note?: string;
  latencyMs: number;
}

/** Whether this deployment is talking to a real model (shown in the UI). */
export function modelConfigured(): boolean {
  return isModelConfigured();
}

/**
 * Runs one AI task and records it.
 *
 * The `AIAction` row is written whatever happens — success, refusal or
 * failure. An AI output that vanished because the call errored is an output
 * nobody can audit (spec §30).
 */
async function run(
  actor: RequestActor,
  options: {
    type: AIActionType;
    request: AIRequest;
    patientId?: string | null;
    consultationId?: string | null;
    summary: string;
  },
): Promise<AIOutcome> {
  assertPermission(actor, Permission.AI_USE);

  const provider = resolveProvider();

  let result: AIResult;
  try {
    result = await provider.complete(options.request);
  } catch (error) {
    // The provider's own fallback should have caught this; if it did not, the
    // failure is still recorded rather than swallowed.
    const message = error instanceof Error ? error.message : "Unknown failure";

    await prisma.aIAction.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        patientId: options.patientId ?? null,
        consultationId: options.consultationId ?? null,
        type: options.type,
        status: "FAILED",
        input: toJson(options.request.input),
        sources: toJson(options.request.sources) ?? [],
        provider: provider.name,
        model: provider.model,
        error: message,
      },
    });

    throw new ServiceError(
      "INVALID_STATE",
      "The assistant could not complete that.",
      "Try again in a moment. Nothing was written to the record.",
    );
  }

  const action = await prisma.$transaction(async (tx) => {
    const created = await tx.aIAction.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        patientId: options.patientId ?? null,
        consultationId: options.consultationId ?? null,
        type: options.type,
        // Spec §10 — generated output is never "done". It waits for a doctor.
        status: "AWAITING_REVIEW",
        input: toJson(options.request.input),
        output: toJson({ sections: result.sections }) ?? {},
        sources: toJson(result.sources) ?? [],
        provider: result.provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: result.latencyMs,
      },
      select: { id: true },
    });

    // Spec §30 — "AI output generated" is a logged event.
    await writeAudit(tx, actor, {
      action: "AI_OUTPUT_GENERATED",
      entityType: "AIAction",
      entityId: created.id,
      summary: options.summary,
      metadata: {
        type: options.type,
        provider: result.provider,
        model: result.model,
        grounded: result.grounded,
        sourceCount: result.sources.length,
      },
    });

    return created;
  }, TX_OPTIONS);

  return {
    actionId: action.id,
    sections: result.sections,
    sources: result.sources,
    provider: result.provider,
    model: result.model,
    grounded: result.grounded,
    note: result.note,
    latencyMs: result.latencyMs,
  };
}

/**
 * Spec §8 — the pre-consultation brief.
 *
 * Generated when the doctor opens the patient, from what is already on the
 * record. Never a diagnosis; at most a pointer to a record worth reading
 * first.
 */
export async function generatePreConsultationBrief(
  actor: RequestActor,
  visitId: string,
): Promise<AIOutcome & { patientName: string }> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      id: true,
      patientId: true,
      chiefComplaint: true,
      consultation: { select: { id: true } },
      appointment: { select: { type: true, reason: true } },
      patient: { select: { mrn: true } },
    },
  });

  if (!visit) throw notFound("Visit");

  const context = await gatherPatientContext(actor, visit.patientId, { visitId });

  const outcome = await run(actor, {
    type: "PRE_CONSULTATION_BRIEF",
    patientId: visit.patientId,
    consultationId: visit.consultation?.id ?? null,
    summary: `Pre-consultation brief generated · Patient ${visit.patient.mrn}`,
    request: {
      task: "PRE_CONSULTATION_BRIEF",
      instruction:
        "Brief the doctor on this patient before the consultation starts. Lead with anything outstanding.",
      sources: context.sources,
      input: {
        reason: visit.chiefComplaint ?? visit.appointment?.reason ?? "",
        visitType: visit.appointment?.type ?? "",
        patientName: context.patient.name,
        age: context.patient.age,
        gender: context.patient.gender,
      },
      maxCharacters: 1200,
    },
  });

  return { ...outcome, patientName: context.patient.name };
}

/**
 * Spec §8 — the brief for a visit, generated once.
 *
 * The spec wants the brief ready when the doctor opens the patient. Doing that
 * on every page load would mean a fresh generation — and a fresh audit entry —
 * each time they glance at the screen, so the first open generates it and
 * every open after that reads the same one back.
 */
export async function getOrCreatePreConsultationBrief(
  actor: RequestActor,
  visitId: string,
): Promise<(AIOutcome & { patientName: string }) | null> {
  if (!actor.doctorId) return null;

  try {
    assertPermission(actor, Permission.AI_USE);
  } catch {
    // Without AI_USE there is no brief. That is a quiet absence, not an error
    // on a screen the actor is otherwise allowed to see.
    return null;
  }

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      patientId: true,
      consultation: { select: { id: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  if (!visit) return null;

  const existing = await prisma.aIAction.findFirst({
    where: {
      ...tenantScope(actor),
      type: "PRE_CONSULTATION_BRIEF",
      patientId: visit.patientId,
      ...(visit.consultation
        ? { consultationId: visit.consultation.id }
        : { consultationId: null }),
      status: { in: ["AWAITING_REVIEW", "ACCEPTED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      output: true,
      sources: true,
      provider: true,
      model: true,
      latencyMs: true,
    },
  });

  const patientName = `${visit.patient.firstName} ${visit.patient.lastName ?? ""}`.trim();

  if (existing) {
    const output = existing.output as { sections?: AISection[] } | null;
    return {
      actionId: existing.id,
      sections: output?.sections ?? [],
      sources: (Array.isArray(existing.sources)
        ? existing.sources
        : []) as unknown as AISource[],
      provider: existing.provider ?? "grounded",
      model: existing.model,
      grounded: existing.provider === "grounded",
      latencyMs: existing.latencyMs ?? 0,
      patientName,
    };
  }

  try {
    return await generatePreConsultationBrief(actor, visitId);
  } catch (error) {
    // The consultation workspace must open whatever the assistant does.
    console.error(
      "Pre-consultation brief unavailable",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Spec §9 — a concise history of one patient, on demand. */
export async function generatePatientSummary(
  actor: RequestActor,
  patientId: string,
): Promise<AIOutcome & { patientName: string }> {
  const context = await gatherPatientContext(actor, patientId);

  const outcome = await run(actor, {
    type: "PATIENT_SUMMARY",
    patientId,
    summary: `Patient summary generated · Patient ${context.patient.mrn}`,
    request: {
      task: "PATIENT_SUMMARY",
      instruction:
        "Summarise this patient's history: recent visits, medications, open follow-ups and recent reports.",
      sources: context.sources,
      input: { patientName: context.patient.name },
      maxCharacters: 1400,
    },
  });

  return { ...outcome, patientName: context.patient.name };
}

/**
 * Spec §9 — the documentation copilot.
 *
 * Takes what the doctor dictated or typed and lays it out under clinical
 * headings. It never adds content: the draft is their words, rearranged, and
 * it lands in a review panel rather than in the note.
 */
export async function draftConsultationNote(
  actor: RequestActor,
  visitId: string,
  dictation: string,
): Promise<AIOutcome> {
  const text = dictation.trim();

  if (text.length < 10) {
    throw new ServiceError(
      "VALIDATION",
      "There is not enough here to structure.",
      "Dictate or paste the consultation first.",
    );
  }

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      patientId: true,
      consultation: { select: { id: true, status: true } },
      patient: { select: { mrn: true } },
    },
  });

  if (!visit) throw notFound("Visit");

  if (visit.consultation?.status === "SIGNED") {
    throw invalidState(
      "This consultation is signed and cannot be changed.",
      "Open a new visit if something needs adding.",
    );
  }

  const context = await gatherPatientContext(actor, visit.patientId, { visitId });

  return run(actor, {
    type: "CONSULTATION_NOTE_DRAFT",
    patientId: visit.patientId,
    consultationId: visit.consultation?.id ?? null,
    summary: `Note draft generated · Patient ${visit.patient.mrn}`,
    request: {
      task: "CONSULTATION_NOTE_DRAFT",
      instruction:
        "Lay the doctor's dictation out under clinical headings. Do not add, remove or interpret any clinical content.",
      sources: context.sources,
      input: { dictation: text },
    },
  });
}

/** Spec §9 — natural-language retrieval over one patient's record. */
export async function searchHistory(
  actor: RequestActor,
  patientId: string,
  question: string,
): Promise<AIOutcome> {
  assertPermission(actor, Permission.AI_USE);

  const query = question.trim();
  if (query.length < 3) {
    throw new ServiceError(
      "VALIDATION",
      "Ask something a little more specific.",
      "For example: “last migraine visit” or “was she ever on metformin”.",
    );
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...tenantScope(actor) },
    select: { mrn: true },
  });
  if (!patient) throw notFound("Patient");

  const matches = await searchPatientRecord(actor, patientId, query);

  return run(actor, {
    type: "HISTORY_SEARCH",
    patientId,
    summary: `History search · Patient ${patient.mrn}`,
    request: {
      task: "HISTORY_SEARCH",
      instruction: query,
      sources: matches,
    },
  });
}

/** Spec §42 — the hospital knowledge assistant. */
export async function askKnowledgeAssistant(
  actor: RequestActor,
  question: string,
): Promise<AIOutcome> {
  assertPermission(actor, Permission.AI_USE);

  const query = question.trim();
  if (query.length < 3) {
    throw new ServiceError(
      "VALIDATION",
      "Ask something a little more specific.",
      "For example: “what is the discharge workflow”.",
    );
  }

  const passages = await searchKnowledgeBase(actor, query);

  return run(actor, {
    type: "KNOWLEDGE_ANSWER",
    summary: "Knowledge assistant answered a question",
    request: {
      task: "KNOWLEDGE_ANSWER",
      instruction: query,
      sources: passages,
    },
  });
}

/**
 * Spec §9 — a patient-friendly follow-up message.
 *
 * Administrative communication, which spec §10 explicitly allows AI to draft.
 * It is still a draft: sending goes through the communication service, on an
 * explicit action.
 */
export async function draftFollowUpMessage(
  actor: RequestActor,
  followUpId: string,
): Promise<AIOutcome & { patientId: string; patientName: string }> {
  const followUp = await prisma.followUp.findFirst({
    where: { id: followUpId, ...tenantScope(actor) },
    select: {
      id: true,
      dueDate: true,
      reason: true,
      patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
      appointment: { select: { scheduledStart: true } },
    },
  });

  if (!followUp) throw notFound("Follow-up");

  const when = followUp.appointment?.scheduledStart ?? null;

  const outcome = await run(actor, {
    type: "FOLLOW_UP_MESSAGE",
    patientId: followUp.patient.id,
    summary: `Follow-up message drafted · Patient ${followUp.patient.mrn}`,
    request: {
      task: "FOLLOW_UP_MESSAGE",
      instruction:
        "Draft a short, warm follow-up reminder for the patient. No clinical detail, no instructions about medication.",
      sources: [
        {
          ref: "S1",
          kind: "FOLLOW_UP",
          label: "Follow-up",
          detail: `Follow-up due ${followUp.dueDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}${followUp.reason ? ` — ${followUp.reason}` : ""}`,
          at: followUp.dueDate.toISOString(),
          href: "/doctor/follow-ups",
        },
      ],
      input: {
        patientName: followUp.patient.firstName,
        reason: followUp.reason ?? "",
        when: when
          ? when.toLocaleString("en-IN", {
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "",
      },
      maxCharacters: 480,
    },
  });

  return {
    ...outcome,
    patientId: followUp.patient.id,
    patientName: `${followUp.patient.firstName} ${followUp.patient.lastName ?? ""}`.trim(),
  };
}

/**
 * Spec §10 — "highlight missing information".
 *
 * Checked in code, not generated: whether a note has an assessment is a fact,
 * and a fact does not need a model.
 */
export async function findDocumentationGaps(
  actor: RequestActor,
  visitId: string,
): Promise<AIOutcome> {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      patientId: true,
      patient: { select: { mrn: true } },
      consultation: {
        select: {
          id: true,
          chiefComplaint: true,
          symptoms: true,
          examination: true,
          assessment: true,
          plan: true,
        },
      },
      vitals: { select: { id: true }, take: 1 },
    },
  });

  if (!visit) throw notFound("Visit");

  const consultation = visit.consultation;
  const gaps: string[] = [];

  if (!consultation) {
    gaps.push("No consultation note has been started for this visit.");
  } else {
    if (!consultation.chiefComplaint?.trim())
      gaps.push("Chief complaint is empty.");
    if (!consultation.symptoms?.trim()) gaps.push("Symptoms are not recorded.");
    if (!consultation.examination?.trim())
      gaps.push("Examination findings are not recorded.");
    if (!consultation.assessment?.trim())
      gaps.push("Assessment is empty — a signed note should carry one.");
    if (!consultation.plan?.trim()) gaps.push("Plan is empty.");
  }

  if (visit.vitals.length === 0) {
    gaps.push("No vitals were recorded for this visit.");
  }

  return run(actor, {
    type: "MISSING_DOCUMENTATION",
    patientId: visit.patientId,
    consultationId: consultation?.id ?? null,
    summary: `Documentation check · Patient ${visit.patient.mrn}`,
    request: {
      task: "MISSING_DOCUMENTATION",
      instruction: "List what is missing before this note can be signed.",
      sources: [],
      input: { gaps },
    },
  });
}

/**
 * Spec §10 + §30 — the doctor's decision on a generated output.
 *
 * Accepting does not write anything into the clinical record by itself. It
 * records that the doctor read and approved the output; the feature that owns
 * the record does the writing, on its own explicit action.
 */
export async function reviewAIAction(
  actor: RequestActor,
  actionId: string,
  decision: "ACCEPTED" | "REJECTED",
  reason?: string,
): Promise<void> {
  assertPermission(actor, Permission.AI_USE);

  const action = await prisma.aIAction.findFirst({
    where: { id: actionId, ...tenantScope(actor) },
    select: { id: true, status: true, type: true, patient: { select: { mrn: true } } },
  });

  if (!action) throw notFound("AI output");

  if (action.status !== "AWAITING_REVIEW") {
    throw invalidState(
      action.status === "ACCEPTED"
        ? "This output has already been accepted."
        : action.status === "REJECTED"
          ? "This output has already been dismissed."
          : "This output is not waiting for review.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.aIAction.update({
      where: { id: action.id },
      data: {
        status: decision,
        reviewedAt: new Date(),
        rejectionReason: decision === "REJECTED" ? (reason?.trim() || null) : null,
      },
    });

    await writeAudit(tx, actor, {
      action: decision === "ACCEPTED" ? "AI_OUTPUT_ACCEPTED" : "AI_OUTPUT_REJECTED",
      entityType: "AIAction",
      entityId: action.id,
      summary: `${decision === "ACCEPTED" ? "Accepted" : "Dismissed"} AI output · ${
        action.patient?.mrn ? `Patient ${action.patient.mrn}` : action.type
      }`,
      metadata: { type: action.type, decision },
    });
  }, TX_OPTIONS);
}

export interface AIActivityRow {
  id: string;
  type: AIActionType;
  status: string;
  summaryLine: string;
  patientMrn: string | null;
  userName: string;
  provider: string | null;
  model: string | null;
  grounded: boolean;
  sourceCount: number;
  latencyMs: number | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

/** Spec §30 — every AI output, and what the doctor decided about it. */
export async function listAIActivity(
  actor: RequestActor,
  limit = 50,
): Promise<{
  rows: AIActivityRow[];
  counts: { total: number; awaitingReview: number; accepted: number; rejected: number };
  modelConfigured: boolean;
}> {
  assertPermission(actor, Permission.AI_MANAGE);

  const [actions, grouped] = await Promise.all([
    prisma.aIAction.findMany({
      where: tenantScope(actor),
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        output: true,
        sources: true,
        provider: true,
        model: true,
        latencyMs: true,
        createdAt: true,
        reviewedAt: true,
        patient: { select: { mrn: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.aIAction.groupBy({
      by: ["status"],
      where: tenantScope(actor),
      _count: { _all: true },
    }),
  ]);

  const count = (status: string) =>
    grouped.find((g) => g.status === status)?._count._all ?? 0;

  return {
    rows: actions.map((action) => {
      const sources = Array.isArray(action.sources) ? action.sources : [];
      const output = action.output as { sections?: AISection[] } | null;
      const first = output?.sections?.[0];

      return {
        id: action.id,
        type: action.type,
        status: action.status,
        summaryLine: first ? `${first.heading}: ${first.lines[0] ?? ""}` : "—",
        patientMrn: action.patient?.mrn ?? null,
        userName: action.user?.name ?? "System",
        provider: action.provider,
        model: action.model,
        grounded: action.provider === "grounded",
        sourceCount: sources.length,
        latencyMs: action.latencyMs,
        createdAt: action.createdAt,
        reviewedAt: action.reviewedAt,
      };
    }),
    counts: {
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
      awaitingReview: count("AWAITING_REVIEW"),
      accepted: count("ACCEPTED"),
      rejected: count("REJECTED"),
    },
    modelConfigured: isModelConfigured(),
  };
}

/** Narrows an arbitrary value to something Prisma will accept as JSON. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
