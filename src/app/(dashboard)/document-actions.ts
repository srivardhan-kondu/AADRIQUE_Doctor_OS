"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { DOCUMENT_KINDS, type DocumentKind, markLabReviewed, uploadDocument } from "@/server/services/documents";

/** Spec §6 — uploading a document to a patient, and reviewing a lab result. */

interface Result {
  ok: boolean;
  message?: string;
  action?: string;
}

function toResult(error: unknown, what: string): Result {
  if (error instanceof ServiceError) return { ok: false, message: error.message, action: error.action };
  if (error instanceof PermissionError) return { ok: false, message: `You do not have permission to ${what}.` };
  console.error(`Could not ${what}`, error);
  return { ok: false, message: `Could not ${what}.`, action: "Try again in a moment." };
}

const uploadSchema = z.object({
  patientId: z.string().min(1).max(64),
  visitId: z.string().min(1).max(64).nullable(),
  kind: z.enum(Object.keys(DOCUMENT_KINDS) as [DocumentKind, ...DocumentKind[]]),
  title: z.string().min(1).max(120),
  abnormal: z.boolean(),
  summary: z.string().max(1000).nullable(),
});

function refresh(patientId: string) {
  for (const base of ["/doctor/patients", "/admin/patients"]) revalidatePath(`${base}/${patientId}`);
}

export async function uploadDocumentAction(form: FormData): Promise<Result> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Choose a file to upload." };

  const parsed = uploadSchema.safeParse({
    patientId: form.get("patientId"),
    visitId: form.get("visitId") || null,
    kind: form.get("kind"),
    title: form.get("title"),
    abnormal: form.get("abnormal") === "on",
    summary: (form.get("summary") as string | null) || null,
  });
  if (!parsed.success) return { ok: false, message: "Give the document a type and a name." };

  try {
    const actor = await requireActor();
    await uploadDocument(actor, {
      ...parsed.data,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    refresh(parsed.data.patientId);
    return { ok: true, message: "Uploaded." };
  } catch (error) {
    return toResult(error, "upload this document");
  }
}

export async function markLabReviewedAction(labReportId: string, patientId: string): Promise<Result> {
  try {
    const actor = await requireActor();
    await markLabReviewed(actor, z.string().min(1).max(64).parse(labReportId));
    refresh(z.string().min(1).max(64).parse(patientId));
    return { ok: true };
  } catch (error) {
    return toResult(error, "mark this report reviewed");
  }
}
