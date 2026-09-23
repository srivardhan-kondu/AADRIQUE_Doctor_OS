import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { getAvailableSlots } from "@/server/services/appointments";
import {
  createDoctor,
  getDoctorProfile,
  setWeeklyAvailability,
  updateDoctorSettings,
} from "@/server/services/doctors";
import { listConsultations } from "@/server/services/consultation";
import { exportPatientDirectory } from "@/server/services/patients";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/**
 * Spec §53 — the admin journey against the real database:
 * Create Doctor → Assign Department → Configure Schedule.
 *
 *   npm run test:integration
 */

const configured = Boolean(process.env.DATABASE_URL);

const hours = (from: number, to: number) => ({
  startMinute: from * 60,
  endMinute: to * 60,
});

/** The next date falling on `weekday`, at least a day away so no slot is past. */
function next(weekday: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

describe("Admin", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  let doctorId = "";

  before(async () => {
    clinic = await createTenant("admin");
    other = await createTenant("admin-other");
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("creates a doctor in a department with a one-time password", async () => {
    const t = clinic!;
    const email = `new-${t.organizationId}@example.test`;

    const created = await createDoctor(t.admin, {
      name: "Dr. Priya Menon",
      email: email.toUpperCase(),
      departmentId: t.departmentId,
      specialization: "Dermatology",
      consultationMinutes: 20,
      tokenPrefix: "d",
    });
    doctorId = created.doctorId;

    assert.equal(created.email, email, "email is normalised");
    assert.equal(created.temporaryPassword.length, 12);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: {
        passwordHash: true,
        memberships: { select: { role: true, organizationId: true } },
      },
    });
    assert.ok(await verifyPassword(created.temporaryPassword, user.passwordHash!));
    assert.deepEqual(user.memberships, [
      { role: "DOCTOR", organizationId: t.organizationId },
    ]);

    const profile = await getDoctorProfile(t.admin, doctorId);
    assert.equal(profile.department?.id, t.departmentId);
    assert.equal(profile.tokenPrefix, "D");
    assert.equal(profile.online, false);
  });

  it("refuses a duplicate token prefix or email, and non-admins", async () => {
    const t = clinic!;
    const base = {
      name: "Dr. Second",
      departmentId: t.departmentId,
      consultationMinutes: 15,
    };

    const prefix = await rejection(
      createDoctor(t.admin, { ...base, email: `x-${t.organizationId}@example.test`, tokenPrefix: "T" }),
    );
    assert.equal(prefix.code, "CONFLICT");
    assert.match(prefix.message, /Dr\. Test Rao already issues tokens starting with T/);

    const email = await rejection(
      createDoctor(t.admin, {
        ...base,
        email: `new-${t.organizationId}@example.test`,
        tokenPrefix: "Q",
      }),
    );
    assert.equal(email.code, "CONFLICT");

    await assert.rejects(
      createDoctor(t.reception, { ...base, email: "y@example.test", tokenPrefix: "Y" }),
      { name: "PermissionError" },
    );
  });

  it("configures the schedule, and the new hours become bookable slots", async () => {
    const t = clinic!;
    const monday = next(1);

    await setWeeklyAvailability(t.admin, doctorId, [
      { dayOfWeek: 1, ...hours(9, 12), isBlock: false, label: null },
      { dayOfWeek: 1, ...hours(10, 11), isBlock: true, label: "Ward round" },
      { dayOfWeek: 3, ...hours(14, 16), isBlock: false, label: null },
    ]);

    const slots = await getAvailableSlots(t.admin, doctorId, monday);
    // 9–12 in 20-minute slots is nine; the 10–11 ward round blocks three.
    assert.equal(slots.length, 9);
    assert.equal(slots.filter((s) => s.available).length, 6);
    assert.equal(slots.filter((s) => s.reason === "Blocked").length, 3);

    const tuesday = await getAvailableSlots(t.admin, doctorId, next(2));
    assert.equal(tuesday.length, 0, "no session on Tuesday");

    const audited = await prisma.auditLog.count({
      where: {
        organizationId: t.organizationId,
        entityType: "DoctorProfile",
        entityId: doctorId,
      },
    });
    assert.equal(audited, 2, "creation and the schedule change");
  });

  it("rejects an invalid week without touching the saved one", async () => {
    const t = clinic!;
    const refused = await rejection(
      setWeeklyAvailability(t.admin, doctorId, [
        { dayOfWeek: 1, ...hours(9, 13), isBlock: false, label: null },
        { dayOfWeek: 1, ...hours(12, 15), isBlock: false, label: null },
      ]),
    );
    assert.equal(refused.code, "VALIDATION");

    const profile = await getDoctorProfile(t.admin, doctorId);
    assert.equal(profile.week.length, 3, "the previous week is intact");
  });

  it("lets a doctor change only their own hours", async () => {
    const t = clinic!;

    // The fixture's doctor edits their own week…
    await setWeeklyAvailability(t.doctor, t.doctorId, [
      { dayOfWeek: 2, ...hours(9, 13), isBlock: false, label: null },
    ]);
    await updateDoctorSettings(t.doctor, t.doctorId, {
      consultationMinutes: 10,
      acceptsWalkIns: false,
    });

    // …but not a colleague's, and not their own department.
    const colleague = await rejection(
      setWeeklyAvailability(t.doctor, doctorId, []),
    );
    assert.equal(colleague.code, "FORBIDDEN");
    await assert.rejects(
      updateDoctorSettings(t.doctor, t.doctorId, {
        consultationMinutes: 10,
        acceptsWalkIns: false,
        departmentId: null,
      }),
      { name: "PermissionError" },
    );

    const frontDesk = await rejection(
      setWeeklyAvailability(t.reception, t.doctorId, []),
    );
    assert.equal(frontDesk.code, "FORBIDDEN");
  });

  it("keeps doctors inside their organization", async () => {
    const outsider = other!;
    const read = await rejection(getDoctorProfile(outsider.admin, doctorId));
    assert.equal(read.code, "NOT_FOUND");
    const write = await rejection(
      setWeeklyAvailability(outsider.admin, doctorId, []),
    );
    assert.equal(write.code, "NOT_FOUND");
  });

  it("exports the directory without clinical content, and logs it", async () => {
    const t = clinic!;
    const { header, rows } = await exportPatientDirectory(t.admin);

    assert.equal(rows.length, 1);
    assert.ok(!header.some((h) => /allerg|diagnos|condition|note/i.test(h)));

    const logged = await prisma.auditLog.findFirst({
      where: { organizationId: t.organizationId, action: "DATA_EXPORTED" },
      select: { summary: true },
    });
    assert.match(logged?.summary ?? "", /1 records/);

    await assert.rejects(exportPatientDirectory(t.reception), {
      name: "PermissionError",
    });
  });

  it("lists a doctor's unsigned notes first", async () => {
    const t = clinic!;
    const list = await listConsultations(t.doctor, t.doctorId);
    assert.deepEqual(list.counts, { unsigned: 0, overdue: 0, signed30d: 0 });
    await assert.rejects(listConsultations(t.reception, t.doctorId), {
      name: "PermissionError",
    });
  });
});
