"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AISection, AISource } from "@/lib/ai/types";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import {
  askKnowledgeAssistant,
  draftConsultationNote,
  draftFollowUpMessage,
  findDocumentationGaps,
  generatePatientSummary,
  generatePreConsultationBrief,
  reviewAIAction,
  searchHistory,
  type AIOutcome,
} from "@/server/services/ai";
import { ServiceError } from "@/server/services/errors";
import { assertAddOn, hasAddOn } from "@/server/services/features";
import { searchPatients } from "@/server/services/patients";

/**
 * AI actions (spec §9, §10).
 *
 * Nothing here writes to a clinical record. Each action produces a reviewable
 * output and returns it; what the doctor then does with it is a separate,
 * explicit step.
 */

export interface AIActionResult {
  ok: boolean;
  message?: string;
  action?: string;
  outcome?: {
    actionId: string;
    sections: AISection[];
    sources: AISource[];
    grounded: boolean;
    provider: string;
    model: string | null;
    note?: string;
  };
}

const idSchema = z.string().min(1).max(64);
const questionSchema = z.string().min(1).max(500);

function toResult(error: unknown): AIActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "You do not have permission to use the AI copilot.",
      action: "Ask an administrator to enable AI for your role.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That record was not found." };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: "That request was not valid." };
  }
  console.error("AI action failed", error);
  return {
    ok: false,
    message: "The assistant could not answer.",
    action: "Try again in a moment. Nothing was written to the record.",
  };
}

function ok(outcome: AIOutcome): AIActionResult {
  return {
    ok: true,
    outcome: {
      actionId: outcome.actionId,
      sections: outcome.sections,
      sources: outcome.sources,
      grounded: outcome.grounded,
      provider: outcome.provider,
      model: outcome.model,
      note: outcome.note,
    },
  };
}

export async function briefAction(visitId: string): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    return ok(await generatePreConsultationBrief(actor, idSchema.parse(visitId)));
  } catch (error) {
    return toResult(error);
  }
}

export async function summaryAction(patientId: string): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    await assertAddOn(actor, "aiCopilot");
    return ok(await generatePatientSummary(actor, idSchema.parse(patientId)));
  } catch (error) {
    return toResult(error);
  }
}

export async function draftNoteAction(
  visitId: string,
  dictation: string,
): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    return ok(
      await draftConsultationNote(
        actor,
        idSchema.parse(visitId),
        z.string().max(8000).parse(dictation),
      ),
    );
  } catch (error) {
    return toResult(error);
  }
}

export async function gapsAction(visitId: string): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    return ok(await findDocumentationGaps(actor, idSchema.parse(visitId)));
  } catch (error) {
    return toResult(error);
  }
}

export async function historySearchAction(
  patientId: string,
  question: string,
): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    await assertAddOn(actor, "aiCopilot");
    return ok(
      await searchHistory(
        actor,
        idSchema.parse(patientId),
        questionSchema.parse(question),
      ),
    );
  } catch (error) {
    return toResult(error);
  }
}

export async function knowledgeAction(
  question: string,
): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    await assertAddOn(actor, "aiCopilot");
    return ok(await askKnowledgeAssistant(actor, questionSchema.parse(question)));
  } catch (error) {
    return toResult(error);
  }
}

export async function followUpDraftAction(
  followUpId: string,
): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    return ok(await draftFollowUpMessage(actor, idSchema.parse(followUpId)));
  } catch (error) {
    return toResult(error);
  }
}

/** Spec §10 — the doctor's explicit decision on a generated output. */
export async function reviewAction(
  actionId: string,
  decision: "ACCEPTED" | "REJECTED",
  reason?: string,
): Promise<AIActionResult> {
  try {
    const actor = await requireActor();
    await reviewAIAction(
      actor,
      idSchema.parse(actionId),
      z.enum(["ACCEPTED", "REJECTED"]).parse(decision),
      z.string().max(280).optional().parse(reason),
    );

    revalidatePath("/admin/ai");

    return {
      ok: true,
      message:
        decision === "ACCEPTED"
          ? "Accepted. It is yours to use — nothing was written to the record."
          : "Dismissed.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export interface CopilotPatient {
  id: string;
  name: string;
  mrn: string;
  age: number | null;
}

/** Patient lookup for the copilot's per-patient actions. */
export async function findPatientsAction(
  term: string,
): Promise<CopilotPatient[]> {
  const actor = await requireActor();
  if (!(await hasAddOn(actor, "aiCopilot"))) return [];
  const rows = await searchPatients(actor, z.string().max(120).parse(term), 6);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mrn: row.mrn,
    age: row.age,
  }));
}
