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
import {
  savePrescription,
  searchMedications,
} from "@/server/services/prescriptions";

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

/* ------------------------------ prescription ------------------------------ */

const itemSchema = z.object({
  medicationId: z.string().max(64).nullable(),
  medicationName: z.string().trim().min(1, "Every medicine needs a name.").max(120),
  dosage: z.string().max(60).nullable(),
  frequency: z.string().max(60).nullable(),
  route: z.string().max(40).nullable(),
  durationDays: z.number().int().min(1).max(365).nullable(),
  instructions: z.string().max(200).nullable(),
});

export interface PrescriptionResult {
  ok: boolean;
  message?: string;
  action?: string;
  allergyWarnings?: string[];
}

export async function savePrescriptionAction(
  visitId: string,
  input: { items: z.input<typeof itemSchema>[]; advice: string | null },
): Promise<PrescriptionResult> {
  try {
    const actor = await requireActor();
    const parsed = z
      .object({ items: z.array(itemSchema).max(20), advice: z.string().max(1000).nullable() })
      .parse(input);
    const { allergyWarnings } = await savePrescription(actor, visitIdSchema.parse(visitId), parsed);
    revalidatePath(`/doctor/consultations/${visitId}`);
    return { ok: true, allergyWarnings };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the prescription." };
    }
    return toResult(error);
  }
}

export async function searchMedicationsAction(term: string) {
  await requireActor();
  return searchMedications(z.string().max(80).parse(term));
}
