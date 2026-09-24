import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { signConsultation } from "@/server/services/consultation";
import {
  getPrescription,
  getPrintablePrescription,
  savePrescription,
} from "@/server/services/prescriptions";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §6 — prescriptions are drafted, issued on signing, then frozen. */

const configured = Boolean(process.env.DATABASE_URL);

describe("Prescriptions", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;

  async function openVisit(t: Tenant, n: string) {
    const visit = await prisma.visit.create({
      data: {
        organizationId: t.organizationId,
        facilityId: t.facilityId,
        patientId: t.patientId,
        doctorId: t.doctorId,
        visitNumber: `V-RX-${n}-${t.organizationId.slice(-6)}`,
        stage: "WITH_DOCTOR",
      },
    });
    await prisma.consultation.create({
      data: { organizationId: t.organizationId, visitId: visit.id, patientId: t.patientId, doctorId: t.doctorId },
    });
    return visit.id;
  }

  const item = (medicationName: string) => ({
    medicationId: null,
    medicationName,
    dosage: "1 tablet",
    frequency: "Twice daily (BD)",
    route: null,
    durationDays: 5,
    instructions: "After food",
  });

  before(async () => {
    clinic = await createTenant("rx");
    other = await createTenant("rx-other");
    await prisma.patientAllergy.create({ data: { patientId: clinic.patientId, substance: "Amoxicillin" } });
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("drafts, warns on a recorded allergy, and issues on signing", async () => {
    const t = clinic!;
    const visitId = await openVisit(t, "a");

    const saved = await savePrescription(t.doctor, visitId, {
      items: [item("Paracetamol 650"), item("Amoxicillin 500")],
      advice: "Plenty of fluids",
    });
    assert.deepEqual(saved.allergyWarnings, ["Amoxicillin"]);

    // Saving again replaces the items rather than adding to them.
    await savePrescription(t.doctor, visitId, { items: [item("Paracetamol 650")], advice: null });
    const draft = await getPrescription(t.doctor, visitId);
    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.items.length, 1);
    assert.equal(draft.editable, true);
    assert.deepEqual(draft.allergyWarnings, []);

    await signConsultation(t.doctor, visitId, { assessment: "Viral fever" });

    const issued = await getPrescription(t.doctor, visitId);
    assert.equal(issued.status, "ISSUED");
    assert.ok(issued.issuedAt);
    assert.equal(issued.editable, false);

    const frozen = await rejection(savePrescription(t.doctor, visitId, { items: [], advice: null }));
    assert.equal(frozen.code, "INVALID_STATE");

    const audit = await prisma.auditLog.findFirst({ where: { action: "PRESCRIPTION_CREATED", entityId: issued.id! } });
    assert.ok(audit, "issuing is audited");

    // Clinical content stays with clinical roles; the front desk is refused.
    await assert.rejects(getPrintablePrescription(t.reception, visitId), { name: "PermissionError" });
    const printable = await getPrintablePrescription(t.doctor, visitId);
    assert.equal(printable.prescriptions[0].items[0].medicationName, "Paracetamol 650");
  });

  it("cancels an empty draft rather than issuing it", async () => {
    const t = clinic!;
    const visitId = await openVisit(t, "b");
    await savePrescription(t.doctor, visitId, { items: [item("Cetirizine")], advice: null });
    await savePrescription(t.doctor, visitId, { items: [], advice: null });
    await signConsultation(t.doctor, visitId, { assessment: "Allergic rhinitis" });

    const rx = await prisma.prescription.findFirstOrThrow({ where: { visitId }, select: { status: true } });
    assert.equal(rx.status, "CANCELLED");
    assert.equal((await getPrescription(t.doctor, visitId)).items.length, 0);
  });

  it("lets only the treating doctor write, and never across clinics", async () => {
    const t = clinic!;
    const visitId = await openVisit(t, "c");

    await assert.rejects(
      savePrescription(t.reception, visitId, { items: [item("Paracetamol")], advice: null }),
      { name: "PermissionError" },
    );
    const foreign = await rejection(
      savePrescription(other!.doctor, visitId, { items: [item("Paracetamol")], advice: null }),
    );
    assert.equal(foreign.code, "NOT_FOUND");

    const tooLong = await rejection(
      savePrescription(t.doctor, visitId, { items: [{ ...item("Paracetamol"), durationDays: 400 }], advice: null }),
    );
    assert.equal(tooLong.code, "VALIDATION");
  });
});
