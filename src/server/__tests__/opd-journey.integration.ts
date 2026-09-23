import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import {
  bookAppointment,
  cancelAppointment,
  checkInAppointment,
} from "@/server/services/appointments";
import { saveDraft, signConsultation } from "@/server/services/consultation";
import { createFollowUp } from "@/server/services/follow-ups";
import { callNext, getQueueBoard, skipEntry } from "@/server/services/queue";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/**
 * Spec §53 — the integration test: Appointment → Queue → Consultation →
 * Follow-up, through the real services against the real database.
 *
 * It builds two throwaway organizations (see ./tenant-fixture), walks one
 * patient through a visit and deletes both afterwards.
 *
 *   npm run test:integration
 */

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

    // Signing completes the visit, so the feedback automation starts — the
    // doctor never has to press the queue's Complete button as well.
    const runs = await prisma.workflowRun.findMany({
      where: { subjectType: "Visit", subjectId: visitId, workflow: { name: "Feedback request" } },
      select: { status: true },
    });
    assert.deepEqual(runs.map((r) => r.status), ["WAITING"]);

    // Nobody else is waiting and the visit is already closed, so the next
    // press is a no-op — not an error, and not a second feedback request.
    assert.equal(await callNext(t.doctor, t.doctorId), null);
    assert.equal(
      await prisma.workflowRun.count({
        where: { subjectType: "Visit", subjectId: visitId, workflow: { name: "Feedback request" } },
      }),
      1,
    );
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
