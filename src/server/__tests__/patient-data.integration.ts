import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { erasePatient, exportPatientData } from "@/server/services/patient-data";
import { searchPatients } from "@/server/services/patients";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** DPDP Act 2023 — a patient's copy of their data, and erasure of their identity. */

const configured = Boolean(process.env.DATABASE_URL);

describe("Patient data rights", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  let visitId = "";

  before(async () => {
    clinic = await createTenant("dpdp");
    other = await createTenant("dpdp-other");
    const t = clinic;
    await prisma.patient.update({
      where: { id: t.patientId },
      data: { email: "asha@example.test", dateOfBirth: new Date("1990-06-01"), addressLine: "12 MG Road" },
    });
    await prisma.patientIdentifier.create({ data: { patientId: t.patientId, type: "AADHAAR", value: "1234 5678 9012" } });
    const visit = await prisma.visit.create({
      data: {
        organizationId: t.organizationId, facilityId: t.facilityId, patientId: t.patientId, doctorId: t.doctorId,
        visitNumber: `V-DPDP-${t.organizationId.slice(-6)}`, status: "COMPLETED",
      },
    });
    visitId = visit.id;
    await prisma.consultation.create({
      data: {
        organizationId: t.organizationId, visitId, patientId: t.patientId, doctorId: t.doctorId,
        assessment: "Migraine", status: "SIGNED",
      },
    });
    await prisma.message.create({
      data: {
        organizationId: t.organizationId, patientId: t.patientId, channel: "SMS", direction: "OUTBOUND",
        toAddress: "+919876543210", body: "Hello Asha, your token is T004",
      },
    });
    await prisma.appointment.create({
      data: {
        organizationId: t.organizationId, facilityId: t.facilityId, patientId: t.patientId, doctorId: t.doctorId,
        scheduledStart: new Date(Date.now() + 86_400_000), scheduledEnd: new Date(Date.now() + 86_400_000 + 900_000),
      },
    });
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("exports everything held, for an admin of the same clinic only, and audits it", async () => {
    const t = clinic!;
    const data = await exportPatientData(t.admin, t.patientId);
    assert.equal(data.patient.email, "asha@example.test");
    assert.equal(data.patient.identifiers[0].type, "AADHAAR");
    assert.equal(data.patient.visits[0].consultation?.assessment, "Migraine");
    assert.equal(data.patient.messages.length, 1);
    assert.equal(data.patient.appointments.length, 1);
    assert.ok(!("organizationId" in data.patient));

    await assert.rejects(exportPatientData(t.doctor, t.patientId), { name: "PermissionError" });
    assert.equal((await rejection(exportPatientData(other!.admin, t.patientId))).code, "NOT_FOUND");
    assert.equal(await prisma.auditLog.count({ where: { entityId: t.patientId, action: "DATA_EXPORTED" } }), 1);
  });

  it("erases identity only with the ID typed back, and keeps the clinical record", async () => {
    const t = clinic!;
    const wrong = await rejection(erasePatient(t.admin, t.patientId, "P-WRONG"));
    assert.equal(wrong.code, "VALIDATION");
    await assert.rejects(erasePatient(t.doctor, t.patientId, `IT-x`), { name: "PermissionError" });

    const mrn = (await prisma.patient.findUniqueOrThrow({ where: { id: t.patientId } })).mrn;
    await erasePatient(t.admin, t.patientId, mrn.toLowerCase());

    const p = await prisma.patient.findUniqueOrThrow({ where: { id: t.patientId }, include: { identifiers: true } });
    assert.equal(p.firstName, "Erased patient");
    assert.equal(p.phone, "");
    assert.equal(p.email, null);
    assert.equal(p.addressLine, null);
    assert.equal(p.dateOfBirth, null);
    assert.ok(p.approximateAge && p.approximateAge >= 35, "age kept, birth date gone");
    assert.equal(p.smsOptIn, false);
    assert.equal(p.identifiers.length, 0);
    assert.ok(p.erasedAt);

    const message = await prisma.message.findFirstOrThrow({ where: { patientId: t.patientId } });
    assert.equal(message.body, "[erased]");
    assert.equal(message.toAddress, "[erased]");

    const appointment = await prisma.appointment.findFirstOrThrow({ where: { patientId: t.patientId } });
    assert.equal(appointment.status, "CANCELLED");

    const consultation = await prisma.consultation.findUniqueOrThrow({ where: { visitId } });
    assert.equal(consultation.assessment, "Migraine", "the clinical record is retained");

    assert.equal((await searchPatients(t.admin, "Asha")).length, 0);
    assert.equal((await rejection(erasePatient(t.admin, t.patientId, mrn))).code, "INVALID_STATE");
  });
});
