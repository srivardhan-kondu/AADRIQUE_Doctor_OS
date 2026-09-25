import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { allergyMatches } from "@/server/rules/prescriptions";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §6 + §44 — the prescription, written by the doctor in the
 * consultation.
 *
 * A draft while the consultation is a draft; issued, and from then on
 * unchangeable, in the same transaction that signs the consultation (see
 * `issueDraftPrescription`). Every medicine is typed or chosen by the doctor —
 * AI never writes one (spec §10). A medicine that matches a recorded allergy
 * is flagged, never silently accepted and never silently blocked: the
 * prescribing decision stays the doctor's.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface PrescriptionItemInput {
  medicationId: string | null;
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  durationDays: number | null;
  instructions: string | null;
}

export interface PrescriptionView {
  id: string | null;
  prescriptionNo: string | null;
  status: "DRAFT" | "ISSUED" | "CANCELLED" | null;
  issuedAt: Date | null;
  advice: string | null;
  items: (PrescriptionItemInput & { id: string })[];
  /** Medicines on this prescription that match a recorded allergy. */
  allergyWarnings: string[];
  editable: boolean;
}

/** The visit, with what writing a prescription for it needs to know. */
async function loadVisit(actor: RequestActor, visitId: string) {
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      id: true,
      visitNumber: true,
      patientId: true,
      doctorId: true,
      consultation: { select: { id: true, status: true } },
      patient: {
        select: { allergies: { where: { active: true }, select: { substance: true } } },
      },
    },
  });
  if (!visit) throw notFound("Visit");
  return visit;
}

export async function getPrescription(
  actor: RequestActor,
  visitId: string,
): Promise<PrescriptionView> {
  assertPermission(actor, Permission.PRESCRIPTION_READ);
  const visit = await loadVisit(actor, visitId);

  const rx = await prisma.prescription.findFirst({
    where: { visitId: visit.id, status: { in: ["DRAFT", "ISSUED"] } },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  const substances = visit.patient.allergies.map((a) => a.substance);
  const items = (rx?.items ?? []).map((i) => ({
    id: i.id,
    medicationId: i.medicationId,
    medicationName: i.medicationName,
    dosage: i.dosage,
    frequency: i.frequency,
    route: i.route,
    durationDays: i.durationDays,
    instructions: i.instructions,
  }));

  return {
    id: rx?.id ?? null,
    prescriptionNo: rx?.prescriptionNo ?? null,
    status: rx?.status ?? null,
    issuedAt: rx?.issuedAt ?? null,
    advice: rx?.advice ?? null,
    items,
    allergyWarnings: [
      ...new Set(items.flatMap((i) => allergyMatches(i.medicationName, substances))),
    ],
    editable:
      actor.doctorId === visit.doctorId &&
      visit.consultation?.status !== "SIGNED" &&
      rx?.status !== "ISSUED",
  };
}

/** Replaces the draft's items. Only the treating doctor, only before signing. */
export async function savePrescription(
  actor: RequestActor,
  visitId: string,
  input: { items: PrescriptionItemInput[]; advice: string | null },
): Promise<{ allergyWarnings: string[] }> {
  assertPermission(actor, Permission.PRESCRIPTION_CREATE);
  const visit = await loadVisit(actor, visitId);

  if (actor.doctorId !== visit.doctorId) {
    throw invalidState("Only the treating doctor can write this prescription.");
  }
  if (visit.consultation?.status === "SIGNED") {
    throw invalidState(
      "This consultation is signed; its prescription is issued and cannot change.",
      "Record any change in a new visit.",
    );
  }
  if (input.items.length > 20) {
    throw new ServiceError("VALIDATION", "A prescription can have at most 20 medicines.");
  }

  const items = input.items.map((item, index) => {
    const name = item.medicationName.trim();
    if (!name) throw new ServiceError("VALIDATION", `Medicine ${index + 1} has no name.`);
    if (item.durationDays !== null && (item.durationDays < 1 || item.durationDays > 365)) {
      throw new ServiceError("VALIDATION", `${name}: a course lasts between 1 and 365 days.`);
    }
    return {
      medicationId: item.medicationId,
      medicationName: name,
      dosage: item.dosage?.trim() || null,
      frequency: item.frequency?.trim() || null,
      route: item.route?.trim() || null,
      durationDays: item.durationDays,
      instructions: item.instructions?.trim() || null,
      sortOrder: index,
    };
  });

  // A catalogue id from the browser is only a hint; it must exist.
  const ids = items.map((i) => i.medicationId).filter((id): id is string => Boolean(id));
  const known = new Set(
    (await prisma.medication.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((m) => m.id),
  );
  for (const item of items) {
    if (item.medicationId && !known.has(item.medicationId)) item.medicationId = null;
  }

  const existing = await prisma.prescription.findFirst({
    where: { visitId: visit.id, status: { in: ["DRAFT", "ISSUED"] } },
    select: { id: true, status: true },
  });
  if (existing?.status === "ISSUED") throw invalidState("This prescription has been issued.");

  await prisma.$transaction(async (tx) => {
    let prescriptionId = existing?.id;
    if (prescriptionId) {
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId } });
      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { advice: input.advice?.trim() || null },
      });
    } else {
      const created = await tx.prescription.create({
        data: {
          visitId: visit.id,
          consultationId: visit.consultation?.id ?? null,
          patientId: visit.patientId,
          doctorId: visit.doctorId,
          prescriptionNo: `RX-${visit.visitNumber}`,
          status: "DRAFT",
          advice: input.advice?.trim() || null,
        },
        select: { id: true },
      });
      prescriptionId = created.id;
    }
    if (items.length > 0) {
      await tx.prescriptionItem.createMany({
        data: items.map((i) => ({ ...i, prescriptionId: prescriptionId! })),
      });
    }
  }, TX_OPTIONS);

  const substances = visit.patient.allergies.map((a) => a.substance);
  return {
    allergyWarnings: [...new Set(items.flatMap((i) => allergyMatches(i.medicationName, substances)))],
  };
}

/**
 * Issues the visit's draft prescription. Called inside the signing
 * transaction, so a signed consultation never has a prescription still in
 * draft, and an issued one can never be edited again.
 */
export async function issueDraftPrescription(
  tx: Prisma.TransactionClient,
  actor: RequestActor,
  visitId: string,
): Promise<string | null> {
  const draft = await tx.prescription.findFirst({
    where: { visitId, status: "DRAFT" },
    select: { id: true, prescriptionNo: true, _count: { select: { items: true } } },
  });
  if (!draft) return null;

  // An empty draft is not a prescription; it is cancelled rather than issued.
  if (draft._count.items === 0) {
    await tx.prescription.update({ where: { id: draft.id }, data: { status: "CANCELLED" } });
    return null;
  }

  await tx.prescription.update({
    where: { id: draft.id },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
  await writeAudit(tx, actor, {
    action: "PRESCRIPTION_CREATED",
    entityType: "Prescription",
    entityId: draft.id,
    summary: `Issued prescription ${draft.prescriptionNo}`,
    metadata: { medicines: draft._count.items },
  });
  return draft.id;
}

/** The medicine catalogue, for the prescription's search box. */
export async function searchMedications(term: string) {
  const query = term.trim();
  if (query.length < 2) return [];
  return prisma.medication.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { genericName: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 12,
    select: { id: true, name: true, genericName: true, form: true, strength: true },
  });
}

/** Everything a printed prescription carries (spec §6). */
export async function getPrintablePrescription(actor: RequestActor, visitId: string) {
  assertPermission(actor, Permission.PRESCRIPTION_READ);
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      visitNumber: true,
      startedAt: true,
      facility: { select: { name: true, addressLine: true, city: true, phone: true } },
      doctor: {
        select: {
          qualifications: true,
          registrationNo: true,
          specialization: true,
          user: { select: { name: true } },
        },
      },
      patient: {
        select: {
          firstName: true,
          lastName: true,
          mrn: true,
          gender: true,
          dateOfBirth: true,
          approximateAge: true,
          allergies: { where: { active: true }, select: { substance: true } },
        },
      },
      consultation: { select: { assessment: true, status: true } },
      prescriptions: {
        where: { status: { in: ["DRAFT", "ISSUED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!visit) throw notFound("Visit");
  return visit;
}

/**
 * The visit report: what the doctor wrote in the note, the vitals taken and
 * the prescription, for printing. Only the doctor's own text — anything the
 * assistant generated is stored apart and is not part of it (spec §10).
 */
export async function getPrintableVisitReport(actor: RequestActor, visitId: string) {
  assertPermission(actor, Permission.CONSULTATION_READ);
  assertPermission(actor, Permission.PRESCRIPTION_READ);
  const visit = await prisma.visit.findFirst({
    where: { id: visitId, ...tenantScope(actor) },
    select: {
      visitNumber: true,
      startedAt: true,
      facility: { select: { name: true, addressLine: true, city: true, phone: true } },
      doctor: {
        select: {
          qualifications: true,
          registrationNo: true,
          user: { select: { name: true } },
        },
      },
      patient: {
        select: {
          firstName: true,
          lastName: true,
          mrn: true,
          gender: true,
          dateOfBirth: true,
          approximateAge: true,
          allergies: { where: { active: true }, select: { substance: true } },
        },
      },
      consultation: {
        select: {
          chiefComplaint: true,
          symptoms: true,
          history: true,
          examination: true,
          assessment: true,
          plan: true,
          status: true,
          signedAt: true,
          signedByName: true,
        },
      },
      vitals: { orderBy: { recordedAt: "desc" }, take: 1 },
      prescriptions: {
        where: { status: { in: ["DRAFT", "ISSUED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!visit) throw notFound("Visit");
  return visit;
}
