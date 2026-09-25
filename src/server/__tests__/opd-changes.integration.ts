import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { writeAddOns } from "@/lib/add-ons";
import { getDoctorAnalytics } from "@/server/services/analytics";
import { getFollowUpBoard, createFollowUp } from "@/server/services/follow-ups";
import { addWalkIn, callNext } from "@/server/services/queue";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/**
 * Calling a particular patient in, and add-ons enforced by the services.
 *
 *   npm run test:integration
 */

const configured = Boolean(process.env.DATABASE_URL);

describe("OPD changes", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let t: Tenant | undefined;

  before(async () => {
    t = await createTenant("opd");
  });

  after(async () => {
    await removeTenant(t);
    await prisma.$disconnect();
  });

  it("calls a named waiting patient in, out of turn", async () => {
    const clinic = t!;
    const second = await prisma.patient.create({
      data: {
        organizationId: clinic.organizationId,
        facilityId: clinic.facilityId,
        mrn: `IT-OOT-${Date.now()}`,
        firstName: "Ravi",
        lastName: "Second",
        phone: "9876500000",
      },
      select: { id: true },
    });

    await addWalkIn(clinic.reception, { patientId: clinic.patientId, doctorId: clinic.doctorId });
    await addWalkIn(clinic.reception, { patientId: second.id, doctorId: clinic.doctorId });
    const later = await prisma.queueEntry.findFirstOrThrow({
      where: { patientId: second.id },
      select: { id: true },
    });

    const called = await callNext(clinic.doctor, clinic.doctorId, later.id);
    assert.equal(called?.queueEntryId, later.id);
    assert.equal(called?.patientName, "Ravi Second");
  });

  it("refuses a patient who is no longer waiting, without ending the consultation in progress", async () => {
    const clinic = t!;
    const active = await prisma.queueEntry.findFirstOrThrow({
      where: { queue: { organizationId: clinic.organizationId }, status: "IN_CONSULTATION" },
      select: { id: true },
    });

    const refused = await rejection(callNext(clinic.doctor, clinic.doctorId, active.id));
    assert.equal(refused.code, "INVALID_STATE");

    const still = await prisma.queueEntry.findUniqueOrThrow({
      where: { id: active.id },
      select: { status: true },
    });
    assert.equal(still.status, "IN_CONSULTATION");
  });

  it("keeps locked add-ons on the server", async () => {
    const clinic = t!;
    const refused = await rejection(getDoctorAnalytics(clinic.doctor, clinic.doctorId, 7));
    assert.equal(refused.code, "FORBIDDEN");

    const inTen = new Date();
    inTen.setDate(inTen.getDate() + 10);
    await createFollowUp(clinic.doctor, {
      patientId: clinic.patientId,
      doctorId: clinic.doctorId,
      dueDate: inTen,
      reason: "Review",
    });

    const limited = await getFollowUpBoard(clinic.doctor, clinic.doctorId);
    assert.equal(limited.limited, true);
    assert.equal(limited.upcoming.length, 0);
  });

  it("opens them once AADRIQUE switches them on", async () => {
    const clinic = t!;
    await prisma.organization.update({
      where: { id: clinic.organizationId },
      data: { modules: writeAddOns({}, { analytics: true, followUps: true }) as object },
    });

    await getDoctorAnalytics(clinic.doctor, clinic.doctorId, 7);
    const full = await getFollowUpBoard(clinic.doctor, clinic.doctorId);
    assert.equal(full.limited, false);
    assert.equal(full.upcoming.length, 1);
  });
});
