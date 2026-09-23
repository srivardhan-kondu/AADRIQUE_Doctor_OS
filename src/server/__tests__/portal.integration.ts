import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { codeMatches } from "@/lib/portal/tokens";
import {
  portalBook,
  portalCancel,
  portalFeedback,
  portalHome,
  portalSlots,
  requestSignInCode,
  resolvePortal,
  verifySignInCode,
} from "@/server/services/portal";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §3 + §31 — the patient portal against the real database. */

const configured = Boolean(process.env.DATABASE_URL);
const secret = () => process.env.AUTH_SECRET!;

describe("Patient portal", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  let sibling = "";

  before(async () => {
    process.env.PORTAL_DEMO_CODES = "true";
    clinic = await createTenant("portal");
    other = await createTenant("portal-other");
    await prisma.patient.update({ where: { id: clinic.patientId }, data: { phone: "+919811100001" } });
    sibling = (
      await prisma.patient.create({
        data: {
          organizationId: clinic.organizationId,
          facilityId: clinic.facilityId,
          mrn: `SIB-${clinic.organizationId.slice(-6)}`,
          firstName: "Ravi",
          phone: "+919811100001",
        },
      })
    ).id;
    // Clinic hours every day, 09:00–17:00, so slots exist whatever day it is.
    await prisma.doctorAvailability.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        doctorId: clinic!.doctorId,
        dayOfWeek,
        startMinute: 540,
        endMinute: 1020,
      })),
    });
  });

  after(async () => {
    delete process.env.PORTAL_DEMO_CODES;
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("answers an unknown number the same way, and creates nothing", async () => {
    const t = clinic!;
    const result = await requestSignInCode(t.organizationId, "Clinic", "9800000000", "1.1.1.1");
    assert.deepEqual(result, {});
    assert.equal(await prisma.portalOtp.count({ where: { organizationId: t.organizationId } }), 0);
  });

  it("sends a code, stores only its hash, and locks after five wrong tries", async () => {
    const t = clinic!;
    const { demoCode } = await requestSignInCode(t.organizationId, "Clinic", "98111 00001", "1.1.1.2");
    assert.match(demoCode!, /^\d{6}$/);

    const stored = await prisma.portalOtp.findFirstOrThrow({ where: { organizationId: t.organizationId } });
    assert.notEqual(stored.codeHash, demoCode);
    assert.ok(codeMatches(demoCode!, "+919811100001", stored.codeHash, secret()));

    const wrong = demoCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(verifySignInCode(t.organizationId, "9811100001", wrong));
    }
    const locked = await rejection(verifySignInCode(t.organizationId, "9811100001", demoCode!));
    assert.match(locked.message, /expired/, "even the right code is refused once locked");
  });

  it("signs a family's shared number in, then asks whose record", async () => {
    const t = clinic!;
    const { demoCode } = await requestSignInCode(t.organizationId, "Clinic", "+91 98111 00001", "1.1.1.3");
    const verified = await verifySignInCode(t.organizationId, "9811100001", demoCode!);
    assert.deepEqual(new Set(verified.patientIds), new Set([t.patientId, sibling]));
    assert.equal(await prisma.portalOtp.count({ where: { organizationId: t.organizationId } }), 0, "the code is spent");

    const choosing = await resolvePortal({ o: t.organizationId, p: verified.phone, pid: null, exp: 0 }, t.organizationId);
    assert.equal(choosing?.patients.length, 2);
    assert.equal(choosing?.patient, null);

    // A session names the organization it was issued for; another's portal
    // does not honour it, and a patient not on this number cannot be chosen.
    assert.equal(await resolvePortal({ o: t.organizationId, p: verified.phone, pid: t.patientId, exp: 0 }, other!.organizationId), null);
    assert.equal(await resolvePortal({ o: t.organizationId, p: verified.phone, pid: other!.patientId, exp: 0 }, t.organizationId), null);
  });

  let booked = "";

  it("books only a time the doctor offers, for the signed-in patient", async () => {
    const t = clinic!;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const slots = await portalSlots(t.organizationId, t.doctorId, tomorrow);
    assert.ok(slots.length > 0);

    const outOfHours = new Date(tomorrow);
    outOfHours.setHours(3, 0, 0, 0);
    const refused = await rejection(portalBook(t.organizationId, t.patientId, { doctorId: t.doctorId, start: outOfHours, reason: null }));
    assert.match(refused.message, /no longer free/);

    const foreignDoctor = await rejection(portalBook(t.organizationId, t.patientId, { doctorId: other!.doctorId, start: slots[0], reason: null }));
    assert.equal(foreignDoctor.code, "NOT_FOUND");

    await portalBook(t.organizationId, t.patientId, { doctorId: t.doctorId, start: slots[0], reason: "Cough" });
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { patientId: t.patientId, source: "ONLINE" },
      select: { id: true, status: true },
    });
    booked = appointment.id;
    assert.equal(appointment.status, "SCHEDULED");

    const taken = await rejection(portalBook(t.organizationId, sibling, { doctorId: t.doctorId, start: slots[0], reason: null }));
    assert.match(taken.message, /no longer free|just taken/);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: booked } });
    assert.equal(audit.userId, null, "a patient acted, not staff");
    assert.match(audit.summary, /booked online/);

    const home = await portalHome(t.organizationId, t.patientId);
    assert.equal(home.upcoming[0].id, booked);
    assert.equal(home.upcoming[0].canCancel, true);
  });

  it("lets a patient cancel only their own appointment", async () => {
    const t = clinic!;
    const notTheirs = await rejection(portalCancel(t.organizationId, sibling, booked));
    assert.equal(notTheirs.code, "NOT_FOUND");
    await portalCancel(t.organizationId, t.patientId, booked);
    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: booked }, select: { status: true } });
    assert.equal(cancelled.status, "CANCELLED");
  });

  it("takes a rating once, from the patient whose visit it was", async () => {
    const t = clinic!;
    const visit = await prisma.visit.create({
      data: {
        organizationId: t.organizationId,
        facilityId: t.facilityId,
        patientId: t.patientId,
        doctorId: t.doctorId,
        visitNumber: `V-PORTAL-${t.organizationId.slice(-6)}`,
        status: "COMPLETED",
      },
    });
    const feedback = await prisma.feedback.create({
      data: { organizationId: t.organizationId, patientId: t.patientId, doctorId: t.doctorId, visitId: visit.id },
    });

    await assert.rejects(portalFeedback(t.organizationId, sibling, feedback.id, 5, null));
    await assert.rejects(portalFeedback(t.organizationId, t.patientId, feedback.id, 6, null));
    await portalFeedback(t.organizationId, t.patientId, feedback.id, 4, "Kind and quick");
    await assert.rejects(portalFeedback(t.organizationId, t.patientId, feedback.id, 1, null), "only once");

    const stored = await prisma.feedback.findUniqueOrThrow({ where: { id: feedback.id } });
    assert.equal(stored.rating, 4);
    assert.equal(stored.comment, "Kind and quick");
  });
});
