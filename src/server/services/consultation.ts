import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  Permission,
  assertPermission,
  tenantScope,
} from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { invalidState, notFound } from "./errors";

/**
 * The consultation workspace (spec §6, §26).
 *
 * A consultation is a draft until a doctor signs it. Drafts autosave; a signed
 * consultation is immutable (spec §54 — "AI cannot silently write to finalized
 * clinical records", and neither can anything else).
 */

/** Spec §6 — the structured note. Every field optional while it is a draft. */
export const consultationDraftSchema = z.object({
  chiefComplaint: z.string().max(2000).nullish(),
  symptoms: z.string().max(4000).nullish(),
  history: z.string().max(4000).nullish(),
  examination: z.string().max(4000).nullish(),
  assessment: z.string().max(4000).nullish(),
  plan: z.string().max(4000).nullish(),
  doctorNotes: z.string().max(4000).nullish(),
});

export type ConsultationDraft = z.infer<typeof consultationDraftSchema>;

export interface ConsultationVitals {
  id: string;
  recordedAt: Date;
  heightCm: number | null;
  weightKg: number | null;
  temperatureC: number | null;
  pulseBpm: number | null;
  respiratoryRate: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  spo2: number | null;
  recordedBy: string | null;
}

export interface ConsultationWorkspace {
  visitId: string;
  visitNumber: string;
  consultationId: string;
  status: "DRAFT" | "REVIEWED" | "SIGNED";
  signedAt: Date | null;
  signedByName: string | null;
  draftSavedAt: Date | null;
  startedAt: Date;
  /** True when the signed-in user is the doctor who owns this consultation. */
  isOwnConsultation: boolean;
  canSign: boolean;
  draft: ConsultationDraft;
  doctorName: string;
  patient: {
    id: string;
    mrn: string;
    name: string;
    age: number | null;
    gender: string;
    bloodGroup: string;
    phone: string;
    allergies: Array<{ id: string; substance: string; reaction: string | null; severity: string }>;
    conditions: Array<{ id: string; name: string; code: string | null }>;
    flags: Array<{ id: string; label: string }>;
    lastVisitAt: Date | null;
  };
  vitals: ConsultationVitals | null;
  token: string | null;
  /** Spec §6 — previous visits, readable without leaving the workspace. */
  history: Array<{
    visitId: string;
    at: Date;
    doctorName: string;
    chiefComplaint: string | null;
    assessment: string | null;
    plan: string | null;
    status: string;
  }>;
  prescriptions: Array<{
    id: string;
    prescriptionNo: string;
    createdAt: Date;
    items: Array<{ id: string; name: string; dosage: string | null; frequency: string | null; durationDays: number | null }>;
  }>;
  labReports: Array<{
    id: string;
    testName: string;
    panel: string | null;
    status: string;
    abnormal: boolean;
    summary: string | null;
    at: Date;
  }>;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getConsultationWorkspace(
  actor: RequestActor,
  visitId: string,
): Promise<ConsultationWorkspace> {
  assertPermission(actor, Permission.CONSULTATION_READ);

  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    include: {
      doctor: { select: { id: true, user: { select: { name: true } } } },
      queueEntry: { select: { token: true } },
      consultation: true,
      vitals: { orderBy: { recordedAt: "desc" }, take: 1, include: { recordedBy: { select: { name: true } } } },
      prescriptions: {
        orderBy: { createdAt: "desc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      labReports: { orderBy: { orderedAt: "desc" } },
      patient: {
        include: {
          allergies: { where: { active: true }, orderBy: { severity: "desc" } },
          conditions: { where: { active: true } },
          flags: { where: { active: true } },
        },
      },
    },
  });

  if (!visit) throw notFound("Visit");

  // The consultation is created when the patient is called; if this visit
  // predates that flow, create it on first open so the doctor can write.
  const consultation =
    visit.consultation ??
    (await prisma.consultation.create({
      data: {
        organizationId: visit.organizationId,
        visitId: visit.id,
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        chiefComplaint: visit.chiefComplaint,
        status: "DRAFT",
      },
    }));

  const previousVisits = await prisma.visit.findMany({
    where: {
      patientId: visit.patientId,
      ...tenantScope(actor),
      id: { not: visit.id },
      startedAt: { lt: visit.startedAt },
    },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      startedAt: true,
      chiefComplaint: true,
      doctor: { select: { user: { select: { name: true } } } },
      consultation: {
        select: { assessment: true, plan: true, status: true },
      },
    },
  });

  const vital = visit.vitals[0] ?? null;
  const patient = visit.patient;

  const age =
    patient.approximateAge ??
    (patient.dateOfBirth
      ? Math.floor(
          (Date.now() - patient.dateOfBirth.getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : null);

  const isOwn = actor.doctorId === visit.doctorId;

  return {
    visitId: visit.id,
    visitNumber: visit.visitNumber,
    consultationId: consultation.id,
    status: consultation.status,
    signedAt: consultation.signedAt,
    signedByName: consultation.signedByName,
    draftSavedAt: consultation.draftSavedAt,
    startedAt: visit.startedAt,
    isOwnConsultation: isOwn,
    // Only the owning doctor may sign, and only a consultation still in draft
    // (spec §21, §26).
    canSign:
      isOwn &&
      consultation.status !== "SIGNED" &&
      actor.role === "DOCTOR",
    draft: {
      chiefComplaint: consultation.chiefComplaint,
      symptoms: consultation.symptoms,
      history: consultation.history,
      examination: consultation.examination,
      assessment: consultation.assessment,
      plan: consultation.plan,
      doctorNotes: consultation.doctorNotes,
    },
    doctorName: visit.doctor.user.name,
    patient: {
      id: patient.id,
      mrn: patient.mrn,
      name: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
      age,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      phone: patient.phone,
      allergies: patient.allergies.map((a) => ({
        id: a.id,
        substance: a.substance,
        reaction: a.reaction,
        severity: a.severity,
      })),
      conditions: patient.conditions.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
      })),
      flags: patient.flags.map((f) => ({ id: f.id, label: f.label })),
      lastVisitAt: patient.lastVisitAt,
    },
    vitals: vital
      ? {
          id: vital.id,
          recordedAt: vital.recordedAt,
          heightCm: toNumber(vital.heightCm),
          weightKg: toNumber(vital.weightKg),
          temperatureC: toNumber(vital.temperatureC),
          pulseBpm: vital.pulseBpm,
          respiratoryRate: vital.respiratoryRate,
          systolicBp: vital.systolicBp,
          diastolicBp: vital.diastolicBp,
          spo2: vital.spo2,
          recordedBy: vital.recordedBy?.name ?? null,
        }
      : null,
    token: visit.queueEntry?.token ?? null,
    history: previousVisits.map((v) => ({
      visitId: v.id,
      at: v.startedAt,
      doctorName: v.doctor.user.name,
      chiefComplaint: v.chiefComplaint,
      assessment: v.consultation?.assessment ?? null,
      plan: v.consultation?.plan ?? null,
      status: v.consultation?.status ?? "DRAFT",
    })),
    prescriptions: visit.prescriptions.map((p) => ({
      id: p.id,
      prescriptionNo: p.prescriptionNo,
      createdAt: p.createdAt,
      items: p.items.map((i) => ({
        id: i.id,
        name: i.medicationName,
        dosage: i.dosage,
        frequency: i.frequency,
        durationDays: i.durationDays,
      })),
    })),
    labReports: visit.labReports.map((l) => ({
      id: l.id,
      testName: l.testName,
      panel: l.panel,
      status: l.status,
      abnormal: l.abnormal,
      summary: l.summary,
      at: l.resultAt ?? l.orderedAt,
    })),
  };
}

/** See the note on TX_OPTIONS in queue.ts — hosted databases are far away. */
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Loads a consultation and proves ownership before any write. */
async function loadForWrite(actor: RequestActor, visitId: string) {
  const consultation = await prisma.consultation.findFirst({
    where: { visitId, ...tenantScope(actor) },
    select: {
      id: true,
      status: true,
      doctorId: true,
      patientId: true,
      patient: { select: { mrn: true } },
    },
  });

  if (!consultation) throw notFound("Consultation");

  // Only the doctor who owns the consultation may change it.
  if (actor.doctorId !== consultation.doctorId) {
    throw invalidState(
      "This consultation belongs to another doctor.",
      "You can read it, but only the treating doctor can change it.",
    );
  }

  return consultation;
}

/** Spec §35 rule 4 — drafts persist automatically. */
export async function saveDraft(
  actor: RequestActor,
  visitId: string,
  input: ConsultationDraft,
): Promise<{ savedAt: Date }> {
  assertPermission(actor, Permission.CONSULTATION_UPDATE);

  const consultation = await loadForWrite(actor, visitId);

  if (consultation.status === "SIGNED") {
    throw invalidState(
      "This consultation is signed and can no longer be edited.",
      "Record any further findings in a new visit.",
    );
  }

  const data = consultationDraftSchema.parse(input);
  const savedAt = new Date();

  await prisma.consultation.update({
    where: { id: consultation.id },
    data: { ...data, draftSavedAt: savedAt },
  });

  // Autosaves are deliberately not audited — a keystroke-level trail would
  // bury the events that matter (spec §30). Signing is what gets recorded.
  return { savedAt };
}

/**
 * Spec §26, §54 — signing moves the consultation out of draft and closes the
 * visit. After this it is immutable.
 */
export async function signConsultation(
  actor: RequestActor,
  visitId: string,
  input: ConsultationDraft,
): Promise<void> {
  assertPermission(actor, Permission.CONSULTATION_SIGN);

  const consultation = await loadForWrite(actor, visitId);

  if (consultation.status === "SIGNED") {
    throw invalidState("This consultation is already signed.");
  }

  const data = consultationDraftSchema.parse(input);

  if (!data.assessment?.trim()) {
    throw invalidState(
      "An assessment is required before signing.",
      "Record your assessment, then sign.",
    );
  }

  const visit = await prisma.visit.findUniqueOrThrow({
    where: { id: visitId },
    select: { queueEntryId: true, appointmentId: true },
  });

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.consultation.update({
      where: { id: consultation.id },
      data: {
        ...data,
        status: "SIGNED",
        signedAt: now,
        // Snapshot the name so a later profile edit cannot change what a
        // signed record says.
        signedByName: actor.name,
        draftSavedAt: null,
      },
    });

    await tx.visit.update({
      where: { id: visitId },
      data: { stage: "COMPLETED", status: "COMPLETED", completedAt: now },
    });

    if (visit.queueEntryId) {
      await tx.queueEntry.update({
        where: { id: visit.queueEntryId },
        data: { status: "COMPLETED", completedAt: now },
      });
    }

    if (visit.appointmentId) {
      await tx.appointment.update({
        where: { id: visit.appointmentId },
        data: { status: "COMPLETED", completedAt: now },
      });
    }

    await writeAudit(tx, actor, {
      action: "CONSULTATION_SIGNED",
      entityType: "Consultation",
      entityId: consultation.id,
      summary: `Signed consultation · Patient ${consultation.patient.mrn}`,
      metadata: { patientMrn: consultation.patient.mrn, visitId },
    });
  }, TX_OPTIONS);
}
