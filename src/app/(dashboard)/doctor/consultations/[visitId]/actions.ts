"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import {
  consultationDraftSchema,
  saveDraft,
  signConsultation,
  type ConsultationDraft,
} from "@/server/services/consultation";

export interface SaveResult {
  ok: boolean;
  savedAt?: string;
  message?: string;
  action?: string;
}

const visitIdSchema = z.string().min(1).max(64);

function toResult(error: unknown): SaveResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "You do not have permission to change this consultation.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That record was not found." };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: "Some of that text is too long to save.",
      action: "Shorten the longest section and try again.",
    };
  }
  console.error("Consultation action failed", error);
  return {
    ok: false,
    message: "The consultation could not be saved.",
    action: "Your text is still on screen — try again in a moment.",
  };
}

/** Spec §35 rule 4 — called on a debounce while the doctor types. */
export async function saveDraftAction(
  visitId: string,
  draft: ConsultationDraft,
): Promise<SaveResult> {
  try {
    const actor = await requireActor();
    const { savedAt } = await saveDraft(
      actor,
      visitIdSchema.parse(visitId),
      consultationDraftSchema.parse(draft),
    );
    return { ok: true, savedAt: savedAt.toISOString() };
  } catch (error) {
    return toResult(error);
  }
}

export async function signConsultationAction(
  visitId: string,
  draft: ConsultationDraft,
): Promise<SaveResult> {
  try {
    const actor = await requireActor();
    const id = visitIdSchema.parse(visitId);
    await signConsultation(actor, id, consultationDraftSchema.parse(draft));

    revalidatePath(`/doctor/consultations/${id}`);
    revalidatePath("/doctor");
    revalidatePath("/doctor/queue");

    return { ok: true, message: "Consultation signed." };
  } catch (error) {
    return toResult(error);
  }
}
