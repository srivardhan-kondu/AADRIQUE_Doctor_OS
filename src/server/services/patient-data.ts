import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * India's Digital Personal Data Protection Act, 2023 — a patient's rights to
 * a copy of their data and to its erasure, handled by the clinic's admin.
 *
 * Erasure removes identity, not the clinical record. Indian medical records
 * must be kept for years after the last visit, so consultations,
 * prescriptions, vitals and reports stay — attached to a patient who can no
 * longer be identified or contacted. Everything that only serves contact or
 * convenience (identifiers, message bodies, AI drafts, sign-in codes) goes.
 */

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;
const ERASED = "[erased]";

async function loadPatient(actor: RequestActor, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...tenantScope(actor) },
    select: { id: true, mrn: true, phone: true, erasedAt: true, dateOfBirth: true, approximateAge: true },
  });
  if (!patient) throw notFound("Patient");
  return patient;
}

/** Everything held about one patient, as a JSON document they can keep. */
export async function exportPatientData(actor: RequestActor, patientId: string) {
  assertPermission(actor, Permission.ADMIN_MANAGE);
  const { id, mrn } = await loadPatient(actor, patientId);

  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id },
    include: {
      facility: { select: { name: true } },
      identifiers: { select: { type: true, value: true, issuer: true } },
      allergies: { omit: { patientId: true } },
      conditions: { omit: { patientId: true } },
      flags: { omit: { patientId: true } },
      appointments: {
        orderBy: { scheduledStart: "desc" },
        omit: { organizationId: true, facilityId: true, patientId: true },
        include: { doctor: { select: { user: { select: { name: true } } } } },
      },
      visits: {
        orderBy: { startedAt: "desc" },
        omit: { organizationId: true, facilityId: true, patientId: true },
        include: {
          doctor: { select: { user: { select: { name: true } } } },
          consultation: {
            select: {
              chiefComplaint: true, symptoms: true, history: true, examination: true,
              assessment: true, plan: true, status: true, signedAt: true, signedByName: true,
            },
          },
          vitals: { omit: { patientId: true, visitId: true, recordedById: true } },
          diagnoses: true,
          prescriptions: { include: { items: { omit: { prescriptionId: true, medicationId: true } } } },
        },
      },
      labReports: { omit: { patientId: true } },
      attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, kind: true, createdAt: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        select: { channel: true, direction: true, status: true, subject: true, body: true, createdAt: true },
      },
      followUps: { select: { dueDate: true, reason: true, status: true, completedAt: true } },
      feedback: { select: { rating: true, comment: true, respondedAt: true } },
    },
  });

  await writeAudit(prisma, actor, {
    action: "DATA_EXPORTED",
    entityType: "Patient",
    entityId: id,
    summary: `Exported all data held for patient ${mrn} (data-subject request)`,
  });

  const { organizationId: _org, facilityId: _facility, createdById: _by, ...rest } = patient;
  void _org;
  void _facility;
  void _by;
  return {
    exportedAt: new Date().toISOString(),
    exportedBy: actor.name,
    organization: actor.organizationName,
    note: "Uploaded files are listed by name; ask the clinic for copies of any you need.",
    patient: rest,
  };
}

/**
 * Removes the patient's identity on request. Requires the MRN typed back,
 * so a wrong click on the wrong row cannot do it. Cannot be undone.
 */
export async function erasePatient(actor: RequestActor, patientId: string, confirmMrn: string): Promise<void> {
  assertPermission(actor, Permission.PATIENT_DELETE);
  const patient = await loadPatient(actor, patientId);
  if (patient.erasedAt) throw invalidState("This patient's identity has already been erased.");
  if (confirmMrn.trim().toUpperCase() !== patient.mrn.toUpperCase()) {
    throw new ServiceError("VALIDATION", `Type the patient's ID, ${patient.mrn}, to confirm.`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Nothing further is sent or scheduled for them.
    const [appointments, visits, followUps, queueEntries] = await Promise.all([
      tx.appointment.findMany({ where: { patientId: patient.id }, select: { id: true } }),
      tx.visit.findMany({ where: { patientId: patient.id }, select: { id: true } }),
      tx.followUp.findMany({ where: { patientId: patient.id }, select: { id: true } }),
      tx.queueEntry.findMany({ where: { patientId: patient.id }, select: { id: true } }),
    ]);
    const subjects = [patient.id, ...[appointments, visits, followUps, queueEntries].flat().map((r) => r.id)];
    await tx.workflowRun.updateMany({
      where: { subjectId: { in: subjects }, status: { in: ["PENDING", "WAITING"] } },
      data: { status: "CANCELLED", error: "Patient data erased", completedAt: now },
    });
    await tx.appointment.updateMany({
      where: { patientId: patient.id, status: { in: ["SCHEDULED", "CHECKED_IN", "WAITING"] } },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    await tx.followUp.updateMany({
      where: { patientId: patient.id, status: { in: ["PENDING", "SCHEDULED"] } },
      data: { status: "CANCELLED" },
    });
    await tx.queueEntry.updateMany({
      where: { patientId: patient.id, status: { in: ["WAITING", "VITALS", "CALLED"] } },
      data: { status: "LEFT" },
    });

    // Contact and convenience data goes.
    await tx.patientIdentifier.deleteMany({ where: { patientId: patient.id } });
    await tx.message.updateMany({
      where: { patientId: patient.id },
      data: { toAddress: ERASED, subject: null, body: ERASED },
    });
    await tx.aIConversation.deleteMany({ where: { patientId: patient.id } });
    await tx.aIAction.deleteMany({ where: { patientId: patient.id, status: { not: "ACCEPTED" } } });
    await tx.feedback.updateMany({ where: { patientId: patient.id }, data: { comment: null } });
    await tx.portalOtp.deleteMany({ where: { phone: patient.phone } });

    // The person becomes unidentifiable; the record keeps its MRN so the
    // clinical history stays whole and auditable.
    await tx.patient.update({
      where: { id: patient.id },
      data: {
        firstName: "Erased patient",
        lastName: null,
        // The age stays, clinically useful and not identifying on its own.
        dateOfBirth: null,
        approximateAge:
          patient.approximateAge ??
          (patient.dateOfBirth
            ? Math.floor((now.getTime() - patient.dateOfBirth.getTime()) / (365.25 * 86_400_000))
            : null),
        phone: "",
        alternatePhone: null,
        email: null,
        addressLine: null,
        city: null,
        state: null,
        postalCode: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        photoUrl: null,
        notes: null,
        whatsappOptIn: false,
        smsOptIn: false,
        emailOptIn: false,
        active: false,
        erasedAt: now,
      },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_DELETED",
      entityType: "Patient",
      entityId: patient.id,
      summary: `Erased the identity of patient ${patient.mrn} on request (clinical record retained)`,
    });
  }, TX_OPTIONS);
}
