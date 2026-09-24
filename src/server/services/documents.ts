import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import { fileStore } from "@/lib/storage";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, safeFileName, sniffFileType } from "@/lib/storage/file-type";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §6 + §7 — lab reports and documents a patient brings or a lab sends.
 *
 * A file is checked by its bytes, stored through `fileStore()`, and recorded
 * as an `Attachment` on the patient. A lab report also gets a `LabReport`
 * row, so it shows on the timeline and waits for a doctor to review it.
 * Nothing here reads the file's contents into the record or into AI.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export const DOCUMENT_KINDS = {
  LAB_REPORT: "Lab report",
  IMAGING: "Imaging",
  PRESCRIPTION: "Outside prescription",
  DOCUMENT: "Other document",
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export interface UploadInput {
  patientId: string;
  visitId: string | null;
  kind: DocumentKind;
  /** The test name for a lab report; a label for anything else. */
  title: string;
  fileName: string;
  bytes: Uint8Array;
  abnormal?: boolean;
  summary?: string | null;
}

export async function uploadDocument(
  actor: RequestActor,
  input: UploadInput,
): Promise<{ attachmentId: string }> {
  assertPermission(actor, Permission.LAB_UPLOAD);

  if (input.bytes.byteLength === 0) throw new ServiceError("VALIDATION", "The file is empty.");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ServiceError("VALIDATION", "The file is larger than 4 MB.", "Scan at a lower resolution, or save as PDF.");
  }
  const contentType = sniffFileType(input.bytes);
  if (!contentType) {
    throw new ServiceError(
      "VALIDATION",
      "Only PDF, PNG, JPEG and WebP files can be uploaded.",
      `Accepted: ${Object.values(ACCEPTED_TYPES).join(", ")}.`,
    );
  }
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new ServiceError("VALIDATION", "Give the document a name, such as the test.");

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, ...tenantScope(actor) },
    select: { id: true, mrn: true },
  });
  if (!patient) throw notFound("Patient");

  if (input.visitId) {
    const visit = await prisma.visit.findFirst({
      where: { id: input.visitId, patientId: patient.id, ...tenantScope(actor) },
      select: { id: true },
    });
    if (!visit) throw notFound("Visit");
  }

  const storageKey = `${actor.organizationId}/${randomUUID()}`;
  const store = fileStore();
  await store.put(storageKey, input.bytes);

  try {
    return await prisma.$transaction(async (tx) => {
      const labReport =
        input.kind === "LAB_REPORT"
          ? await tx.labReport.create({
              data: {
                patientId: patient.id,
                visitId: input.visitId,
                testName: title,
                status: "RESULT_AVAILABLE",
                resultAt: new Date(),
                abnormal: input.abnormal ?? false,
                summary: input.summary?.trim().slice(0, 1000) || null,
              },
              select: { id: true },
            })
          : null;

      const attachment = await tx.attachment.create({
        data: {
          organizationId: actor.organizationId,
          patientId: patient.id,
          visitId: input.visitId,
          labReportId: labReport?.id ?? null,
          // A lab report is named by its test; anything else by the title given.
          fileName:
            input.kind === "LAB_REPORT"
              ? safeFileName(input.fileName, contentType)
              : safeFileName(withExtension(title, contentType), contentType),
          storageKey,
          contentType,
          sizeBytes: input.bytes.byteLength,
          kind: input.kind,
          uploadedById: actor.userId,
        },
        select: { id: true },
      });

      await writeAudit(tx, actor, {
        action: "RECORD_CREATED",
        entityType: "Attachment",
        entityId: attachment.id,
        summary: `Uploaded ${DOCUMENT_KINDS[input.kind].toLowerCase()} "${title}" · Patient ${patient.mrn}`,
        metadata: { kind: input.kind, sizeBytes: input.bytes.byteLength, contentType },
      });
      return { attachmentId: attachment.id };
    }, TX_OPTIONS);
  } catch (error) {
    // No record points at the bytes; do not leave them behind.
    await store.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function withExtension(name: string, contentType: string): string {
  const ext = EXTENSIONS[contentType] ?? "";
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

export interface PatientDocument {
  id: string;
  kind: DocumentKind;
  name: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: string | null;
  lab: {
    id: string;
    status: string;
    abnormal: boolean;
    summary: string | null;
    reviewedAt: Date | null;
  } | null;
}

export async function listDocuments(actor: RequestActor, patientId: string): Promise<PatientDocument[]> {
  assertPermission(actor, Permission.LAB_READ);
  const rows = await prisma.attachment.findMany({
    where: { patientId, ...tenantScope(actor) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
      labReport: {
        select: { id: true, testName: true, status: true, abnormal: true, summary: true, reviewedAt: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: (r.kind in DOCUMENT_KINDS ? r.kind : "DOCUMENT") as DocumentKind,
    name: r.labReport?.testName ?? r.fileName,
    fileName: r.fileName,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    uploadedAt: r.createdAt,
    uploadedBy: r.uploadedBy?.name ?? null,
    lab: r.labReport
      ? {
          id: r.labReport.id,
          status: r.labReport.status,
          abnormal: r.labReport.abnormal,
          summary: r.labReport.summary,
          reviewedAt: r.labReport.reviewedAt,
        }
      : null,
  }));
}

/** The file itself, for the download route. Every opening is audited. */
export async function readDocument(actor: RequestActor, attachmentId: string) {
  assertPermission(actor, Permission.LAB_READ);
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, ...tenantScope(actor) },
    select: { id: true, fileName: true, contentType: true, storageKey: true, patient: { select: { mrn: true } } },
  });
  if (!attachment) throw notFound("Document");

  const bytes = await fileStore().get(attachment.storageKey);
  if (!bytes) throw notFound("Document");

  await writeAudit(prisma, actor, {
    action: "RECORD_VIEWED",
    entityType: "Attachment",
    entityId: attachment.id,
    summary: `Opened "${attachment.fileName}"${attachment.patient ? ` · Patient ${attachment.patient.mrn}` : ""}`,
  });
  return { bytes, fileName: attachment.fileName, contentType: attachment.contentType };
}

/** Spec §6 — a doctor has read the result. */
export async function markLabReviewed(actor: RequestActor, labReportId: string): Promise<void> {
  assertPermission(actor, Permission.CONSULTATION_UPDATE);
  const report = await prisma.labReport.findFirst({
    where: { id: labReportId, patient: tenantScope(actor) },
    select: { id: true, status: true, testName: true },
  });
  if (!report) throw notFound("Lab report");
  if (report.status === "REVIEWED") return;
  if (report.status !== "RESULT_AVAILABLE") throw invalidState("There is no result to review yet.");

  await prisma.$transaction(async (tx) => {
    await tx.labReport.update({
      where: { id: report.id },
      data: { status: "REVIEWED", reviewedAt: new Date() },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "LabReport",
      entityId: report.id,
      summary: `Reviewed lab report "${report.testName}"`,
    });
  }, TX_OPTIONS);
}
