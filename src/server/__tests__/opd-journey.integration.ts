import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { RequestActor } from "@/server/context";
import {
  bookAppointment,
  cancelAppointment,
  checkInAppointment,
} from "@/server/services/appointments";
import { saveDraft, signConsultation } from "@/server/services/consultation";
import { ServiceError } from "@/server/services/errors";
import { createFollowUp } from "@/server/services/follow-ups";
import { callNext, getQueueBoard, skipEntry } from "@/server/services/queue";

/**
 * Spec §53 — the integration test: Appointment → Queue → Consultation →
 * Follow-up, through the real services against the real database.
 *
 * It builds two throwaway organizations, walks one patient through a visit
 * and deletes both afterwards. Organizations cascade to everything beneath
 * them; users are not owned by one, so they are removed explicitly — the same
 * way the seed resets the demo.
 *
 *   npm run test:integration
 */

const RUN = randomUUID().slice(0, 8);

interface Tenant {
  organizationId: string;
  doctorId: string;
  patientId: string;
  reception: RequestActor;
  doctor: RequestActor;
  userIds: string[];
}

async function createTenant(label: string): Promise<Tenant> {
  const slug = `itest-${RUN}-${label}`;

  const organization = await prisma.organization.create({
    data: { name: `Integration ${label}`, slug },
    select: { id: true },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: organization.id,
      name: "Test Clinic",
      code: "TC",
      phone: "080 4000 0000",
    },
    select: { id: true, name: true },
  });
  const department = await prisma.department.create({
    data: { facilityId: facility.id, name: "General Medicine", code: "GM" },
    select: { id: true },
  });

  const user = (role: Role, name: string) =>
    prisma.user.create({
      data: {
        email: `${slug}-${role.toLowerCase()}@example.test`,
        name,
        memberships: {
          create: {
            organizationId: organization.id,
            facilityId: facility.id,
            role,
          },
        },
      },
      select: { id: true, email: true, name: true },
    });

  const doctorUser = await user("DOCTOR", "Dr. Test Rao");
  const receptionUser = await user("RECEPTIONIST", "Test Front Desk");

  const doctor = await prisma.doctorProfile.create({
    data: {
      userId: doctorUser.id,
      facilityId: facility.id,
      departmentId: department.id,
      tokenPrefix: "T",
    },
    select: { id: true },
  });

  const patient = await prisma.patient.create({
    data: {
      organizationId: organization.id,
      facilityId: facility.id,
      mrn: `IT-${RUN}`,
      firstName: "Asha",
      lastName: "Test",
      phone: "9876543210",
      smsOptIn: true,
    },
    select: { id: true },
  });

  await prisma.messageTemplate.create({
    data: {
      organizationId: organization.id,
      key: "token_generated",
      name: "Token generated",
      channel: "SMS",
      body: "Your token is {{token}}. Current token is {{currentToken}}. Estimated wait {{waitMinutes}} minutes.",
      variables: ["token", "currentToken", "waitMinutes"],
    },
  });

  // Spec §28 — the token notification is an automation, not a code path.
  await prisma.workflow.create({
    data: {
      organizationId: organization.id,
      name: "Token notification",
      trigger: "TOKEN_GENERATED",
      enabled: true,
      steps: [
        { type: "CONDITION", field: "patient.smsOptIn", operator: "EQUALS", value: true },
        { type: "ACTION", action: "SEND_MESSAGE", templateKey: "token_generated", channel: "SMS" },
      ],
    },
  });

  const actor = (
    u: { id: string; email: string; name: string },
    role: Role,
    doctorId: string | null,
  ): RequestActor => ({
    userId: u.id,
    organizationId: organization.id,
    facilityId: facility.id,
    role,
    overrides: [],
    name: u.name,
    email: u.email,
    doctorId,
    department: "General Medicine",
    facilityName: facility.name,
    organizationName: `Integration ${label}`,
  });

  return {
    organizationId: organization.id,
    doctorId: doctor.id,
    patientId: patient.id,
    reception: actor(receptionUser, "RECEPTIONIST", null),
    doctor: actor(doctorUser, "DOCTOR", doctor.id),
    userIds: [doctorUser.id, receptionUser.id],
  };
}

async function removeTenant(tenant: Tenant | undefined) {
  if (!tenant) return;
  await prisma.user.deleteMany({ where: { id: { in: tenant.userIds } } });
  await prisma.organization.deleteMany({ where: { id: tenant.organizationId } });
}

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ServiceError, String(error));
    return error;
  }
  assert.fail("expected the service to refuse");
}

const configured = Boolean(process.env.DATABASE_URL);

describe("OPD journey", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;

  before(async () => {
    clinic = await createTenant("a");
    other = await createTenant("b");
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  // Shared across the steps below, which run in order.
  let appointmentId = "";
  let queueEntryId = "";
  let visitId = "";

  it("books an appointment and refuses a second booking in the same slot", async () => {
    const t = clinic!;
    // Now is bookable (a minute of grace), and keeps the check-in below on
    // the same day whenever the suite runs.
    const start = new Date();

    const booked = await bookAppointment(t.reception, {
      patientId: t.patientId,
      doctorId: t.doctorId,
      start,
      reason: "Follow-up of blood pressure",
    });
    appointmentId = booked.appointmentId;
    assert.equal(booked.patientName, "Asha Test");

    const clash = await rejection(
      bookAppointment(t.reception, {
        patientId: t.patientId,
        doctorId: t.doctorId,
        start: new Date(start.getTime() + 5 * 60_000),
      }),
    );
    assert.equal(clash.code, "CONFLICT");
  });

  it("checks the patient in, issues a token and sends it through a workflow", async () => {
    const t = clinic!;
    const checkIn = await checkInAppointment(t.reception, appointmentId);

    assert.equal(checkIn.token, "T001");
    assert.equal(checkIn.position, 1);
    assert.equal(checkIn.automations, 1);

    const message = await prisma.message.findFirst({
      where: { organizationId: t.organizationId, patientId: t.patientId },
      select: { body: true, status: true, channel: true },
    });
    assert.ok(message, "the token workflow did not write a message");
    assert.equal(message.channel, "SMS");
    assert.equal(message.status, "SENT");
    assert.match(message.body, /Your token is T001\./);
    assert.doesNotMatch(message.body, /\{\{/);

    const board = await getQueueBoard(t.doctor, t.doctorId);
    assert.deepEqual(board.waiting.map((e) => e.token), ["T001"]);
    queueEntryId = board.waiting[0].id;
  });

  it("calls the patient in and opens a draft consultation in one step", async () => {
    const t = clinic!;
    const called = await callNext(t.doctor, t.doctorId);

    assert.ok(called);
    assert.equal(called.token, "T001");
    assert.equal(called.queueEntryId, queueEntryId);
    visitId = called.visitId;

    const visit = await prisma.visit.findUniqueOrThrow({
      where: { id: visitId },
      select: {
        stage: true,
        chiefComplaint: true,
        appointment: { select: { status: true } },
        consultation: { select: { status: true } },
      },
    });
    assert.equal(visit.stage, "WITH_DOCTOR");
    assert.equal(visit.chiefComplaint, "Follow-up of blood pressure");
    assert.equal(visit.appointment?.status, "IN_CONSULTATION");
    assert.equal(visit.consultation?.status, "DRAFT");

    // Nobody else is waiting, so the next press is a no-op, not an error.
    assert.equal(await callNext(t.doctor, t.doctorId), null);
  });

  it("saves a draft, and signs only once there is an assessment", async () => {
    const t = clinic!;
    const draft = { symptoms: "Occasional headaches", plan: "Continue current dose" };

    await saveDraft(t.doctor, visitId, draft);

    const unsigned = await rejection(signConsultation(t.doctor, visitId, draft));
    assert.match(unsigned.message, /assessment is required/);

    // Only a doctor may sign — the front desk is refused by permission.
    await assert.rejects(
      signConsultation(t.reception, visitId, { ...draft, assessment: "Stable" }),
      { name: "PermissionError" },
    );

    await signConsultation(t.doctor, visitId, {
      ...draft,
      assessment: "Hypertension, well controlled",
    });

    const visit = await prisma.visit.findUniqueOrThrow({
      where: { id: visitId },
      select: {
        status: true,
        queueEntry: { select: { status: true } },
        appointment: { select: { status: true } },
        consultation: { select: { status: true, signedByName: true } },
      },
    });
    assert.equal(visit.status, "COMPLETED");
    assert.equal(visit.queueEntry?.status, "COMPLETED");
    assert.equal(visit.appointment?.status, "COMPLETED");
    assert.equal(visit.consultation?.status, "SIGNED");
    assert.equal(visit.consultation?.signedByName, "Dr. Test Rao");
  });

  it("keeps a signed consultation immutable", async () => {
    const refused = await rejection(
      saveDraft(clinic!.doctor, visitId, { plan: "Changed afterwards" }),
    );
    assert.equal(refused.code, "INVALID_STATE");
  });

  it("will not skip a patient who has already been seen", async () => {
    const t = clinic!;
    const refused = await rejection(skipEntry(t.doctor, queueEntryId));
    assert.equal(refused.code, "INVALID_STATE");

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { status: true },
    });
    assert.equal(appointment.status, "COMPLETED");
  });

  it("books the follow-up the doctor promised", async () => {
    const t = clinic!;
    const due = new Date();
    due.setDate(due.getDate() + 14);

    const followUp = await createFollowUp(t.doctor, {
      patientId: t.patientId,
      doctorId: t.doctorId,
      dueDate: due,
      reason: "Blood pressure review",
      visitId,
    });

    const row = await prisma.followUp.findUniqueOrThrow({
      where: { id: followUp.id },
      select: { status: true, visitId: true, organizationId: true },
    });
    assert.equal(row.status, "PENDING");
    assert.equal(row.visitId, visitId);
    assert.equal(row.organizationId, t.organizationId);
  });

  it("leaves an audit trail of the actions that matter", async () => {
    const actions = await prisma.auditLog.findMany({
      where: { organizationId: clinic!.organizationId },
      select: { action: true, entityType: true },
    });
    const has = (action: string, entityType: string) =>
      actions.some((a) => a.action === action && a.entityType === entityType);

    assert.ok(has("RECORD_CREATED", "Appointment"), "booking not audited");
    assert.ok(has("RECORD_UPDATED", "QueueEntry"), "call-next not audited");
    assert.ok(has("CONSULTATION_SIGNED", "Consultation"), "signing not audited");
    assert.ok(has("RECORD_CREATED", "FollowUp"), "follow-up not audited");
  });

  it("does not let another organization see or touch any of it", async () => {
    const outsider = other!;

    // Records from clinic A, addressed by their real ids from organization B.
    const cancel = await rejection(
      cancelAppointment(outsider.reception, appointmentId),
    );
    assert.equal(cancel.code, "NOT_FOUND");

    const skip = await rejection(skipEntry(outsider.doctor, queueEntryId));
    assert.equal(skip.code, "NOT_FOUND");

    const board = await rejection(getQueueBoard(outsider.doctor, clinic!.doctorId));
    assert.equal(board.code, "NOT_FOUND");

    const followUp = await rejection(
      createFollowUp(outsider.doctor, {
        patientId: clinic!.patientId,
        doctorId: outsider.doctorId,
        dueDate: new Date(),
      }),
    );
    assert.equal(followUp.code, "NOT_FOUND");
  });
});
