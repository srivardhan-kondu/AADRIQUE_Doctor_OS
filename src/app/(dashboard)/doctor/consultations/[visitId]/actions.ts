"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { PHRASE_FIELDS } from "@/lib/clinical-phrases";
import { requireActor, requireDoctorId } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import {
  addDiagnosis,
  consultationDraftSchema,
  removeDiagnosis,
  saveDraft,
  signConsultation,
  type ConsultationDraft,
  type DiagnosisView,
} from "@/server/services/consultation";
import {
  deletePhrase,
  deleteRxSet,
  savePhrase,
  saveRxSet,
  type Favourites,
} from "@/server/services/favourites";
import { callNext } from "@/server/services/queue";
import {
  savePrescription,
  searchMedications,
} from "@/server/services/prescriptions";

export interface SaveResult {
  ok: boolean;
  savedAt?: string;
  message?: string;
  action?: string;
  /** Where to go next — the next patient's consultation after "Sign & call next". */
  redirectTo?: string;
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

const signOptionsSchema = z
  .object({
    followUpInDays: z.number().int().min(1).max(365).nullish(),
    /** Call the next patient in once the signature lands. */
    callNext: z.boolean().optional(),
  })
  .default({});

export async function signConsultationAction(
  visitId: string,
  draft: ConsultationDraft,
  options?: z.input<typeof signOptionsSchema>,
): Promise<SaveResult> {
  let signed = false;
  try {
    const actor = await requireActor();
    const id = visitIdSchema.parse(visitId);
    const { followUpInDays, callNext: andCallNext } = signOptionsSchema.parse(options);
    await signConsultation(actor, id, consultationDraftSchema.parse(draft), {
      followUpInDays: followUpInDays ?? null,
    });
    signed = true;

    revalidatePath(`/doctor/consultations/${id}`);
    revalidatePath("/doctor");
    revalidatePath("/doctor/queue");
    revalidatePath("/reception/queue");

    if (!andCallNext) return { ok: true, message: "Consultation signed." };

    // The signature is committed; anything that stops the next call (a paused
    // queue, nobody waiting) is reported, never turned into a failed sign.
    try {
      const next = await callNext(actor, await requireDoctorId(actor));
      if (!next) {
        return { ok: true, message: "Signed. Nobody else is waiting.", redirectTo: "/doctor" };
      }
      return {
        ok: true,
        message: `Signed. ${next.token} · ${next.patientName} is with you now.`,
        redirectTo: `/doctor/consultations/${next.visitId}`,
      };
    } catch (error) {
      const reason = error instanceof ServiceError ? error.message : "The next patient could not be called.";
      return { ok: true, message: `Signed. ${reason}`, redirectTo: "/doctor/queue" };
    }
  } catch (error) {
    if (signed) return { ok: true, message: "Consultation signed." };
    return toResult(error);
  }
}

/* ------------------------------- diagnoses -------------------------------- */

export interface DiagnosisResult extends SaveResult {
  diagnoses?: DiagnosisView[];
}

export async function addDiagnosisAction(
  visitId: string,
  input: { name: string; code?: string | null },
): Promise<DiagnosisResult> {
  try {
    const actor = await requireActor();
    const diagnoses = await addDiagnosis(actor, visitIdSchema.parse(visitId), input);
    return { ok: true, diagnoses };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check the diagnosis." };
    }
    return toResult(error);
  }
}

export async function removeDiagnosisAction(visitId: string, diagnosisId: string): Promise<DiagnosisResult> {
  try {
    const actor = await requireActor();
    const diagnoses = await removeDiagnosis(
      actor,
      visitIdSchema.parse(visitId),
      visitIdSchema.parse(diagnosisId),
    );
    return { ok: true, diagnoses };
  } catch (error) {
    return toResult(error);
  }
}

/* --------------------------- phrases and sets ---------------------------- */

export interface FavouritesResult extends SaveResult {
  favourites?: Favourites;
}

async function favouritesAction(fn: () => Promise<Favourites>): Promise<FavouritesResult> {
  try {
    return { ok: true, favourites: await fn() };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Check what you entered." };
    }
    return toResult(error);
  }
}

export async function savePhraseAction(input: { field: string; text: string }): Promise<FavouritesResult> {
  return favouritesAction(async () =>
    savePhrase(
      await requireActor(),
      z.object({ field: z.enum(PHRASE_FIELDS), text: z.string() }).parse(input),
    ),
  );
}

export async function deletePhraseAction(id: string): Promise<FavouritesResult> {
  return favouritesAction(async () => deletePhrase(await requireActor(), visitIdSchema.parse(id)));
}

export async function saveRxSetAction(input: {
  name: string;
  items: z.input<typeof itemSchema>[];
  advice: string | null;
}): Promise<FavouritesResult> {
  return favouritesAction(async () => saveRxSet(await requireActor(), input));
}

export async function deleteRxSetAction(id: string): Promise<FavouritesResult> {
  return favouritesAction(async () => deleteRxSet(await requireActor(), visitIdSchema.parse(id)));
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
  const actor = await requireActor();
  return searchMedications(actor, z.string().max(80).parse(term));
}
