import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { checkInAppointment, bookAppointment } from "@/server/services/appointments";
import { saveTemplate, saveWorkflow } from "@/server/services/automation-editor";
import { signConsultation } from "@/server/services/consultation";
import { addWalkIn, callNext } from "@/server/services/queue";
import { registerPatient } from "@/server/services/patients";
import { setWorkflowEnabled } from "@/server/services/workflows";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/**
 * Spec §28 — building automations, and the automations actually delivering:
 * the feedback request after a visit, and "you're next" when a patient
 * reaches the front of the line.
 */

const configured = Boolean(process.env.DATABASE_URL);

const blankTemplate = {
  id: null,
  category: "TRANSACTIONAL" as const,
  language: "en",
  subject: null,
  providerTemplateId: null,
  active: true,
};

describe("Automations", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;

  before(async () => {
    clinic = await createTenant("auto");
  });

  after(async () => {
    await removeTenant(clinic);
    await prisma.$disconnect();
  });

  it("refuses a template with a placeholder nothing can fill", async () => {
    const refused = await rejection(
      saveTemplate(clinic!.admin, {
        ...blankTemplate,
        key: "bad_one",
        name: "Bad",
        channel: "SMS",
        body: "Hello {{patientNmae}}",
      }),
    );
    assert.match(refused.message, /\{\{patientNmae\}\}/);
  });

  it("builds the feedback workflow, and it thanks the patient by their doctor's name", async () => {
    const t = clinic!;
    await saveTemplate(t.admin, {
      ...blankTemplate,
      key: "feedback_request",
      name: "Feedback",
      channel: "WHATSAPP",
      body: "Thank you for visiting {{doctorName}} today, {{patientName}}.",
    });

    const { id } = await saveWorkflow(t.admin, {
      id: null,
      name: "Feedback after a visit",
      description: null,
      trigger: "APPOINTMENT_COMPLETED",
      steps: [
        { type: "CONDITION", field: "patient.whatsappOptIn", operator: "EQUALS", value: true },
        { type: "ACTION", action: "SEND_MESSAGE", templateKey: "feedback_request", channel: "WHATSAPP" },
        { type: "ACTION", action: "CREATE_FEEDBACK_RECORD" },
      ],
    });
    const saved = await prisma.workflow.findUniqueOrThrow({ where: { id }, select: { enabled: true } });
    assert.equal(saved.enabled, false, "a new workflow starts switched off");
    await setWorkflowEnabled(t.admin, id, true);

    // A visit, completed by signing.
    await bookAppointment(t.reception, { patientId: t.patientId, doctorId: t.doctorId, start: new Date(), notify: false });
    const appointment = await prisma.appointment.findFirstOrThrow({ where: { patientId: t.patientId } });
    await checkInAppointment(t.reception, appointment.id);
    const called = await callNext(t.doctor, t.doctorId);
    await signConsultation(t.doctor, called!.visitId, { assessment: "Well" });

    const message = await prisma.message.findFirst({
      where: { organizationId: t.organizationId, patientId: t.patientId, channel: "WHATSAPP" },
      select: { body: true, status: true },
    });
    assert.ok(message, "the feedback request was sent");
    assert.match(message.body, /Thank you for visiting Dr\. Test Rao today, Asha\./);
    assert.equal(message.status, "SENT");

    const feedback = await prisma.feedback.count({ where: { visitId: called!.visitId } });
    assert.equal(feedback, 1);
  });

  it("will not let a template change break a running workflow", async () => {
    const t = clinic!;
    const template = await prisma.messageTemplate.findFirstOrThrow({
      where: { organizationId: t.organizationId, key: "feedback_request" },
    });
    const refused = await rejection(
      saveTemplate(t.admin, {
        ...blankTemplate,
        id: template.id,
        key: "feedback_request",
        name: "Feedback",
        channel: "WHATSAPP",
        body: "Your appointment is at {{appointmentTime}}.",
      }),
    );
    assert.match(refused.message, /would break the “Feedback after a visit” automation/);
  });

  it("tells the patient at the front of the line they are next", async () => {
    const t = clinic!;
    await saveTemplate(t.admin, {
      ...blankTemplate,
      key: "token_approaching",
      name: "You're next",
      channel: "SMS",
      providerTemplateId: null,
      body: "{{patientName}}, you are next. Please go to {{roomLabel}}.",
    });
    const { id } = await saveWorkflow(t.admin, {
      id: null,
      name: "You're next",
      description: null,
      trigger: "TOKEN_APPROACHING",
      steps: [{ type: "ACTION", action: "SEND_MESSAGE", templateKey: "token_approaching", channel: "SMS" }],
    });
    await setWorkflowEnabled(t.admin, id, true);

    const [first, second] = await Promise.all(
      ["Kiran", "Lata"].map((firstName, i) =>
        registerPatient(t.reception, {
          firstName,
          gender: "FEMALE",
          approximateAge: 40,
          phone: `977000000${i}`,
          whatsappOptIn: false,
          smsOptIn: true,
          emailOptIn: false,
        }),
      ),
    );
    await addWalkIn(t.reception, { patientId: first.id, doctorId: t.doctorId });
    await addWalkIn(t.reception, { patientId: second.id, doctorId: t.doctorId });

    // The room the patient is sent to; without one the message would be held
    // back — and the run recorded as failed, below.
    await prisma.queue.updateMany({ where: { doctorId: t.doctorId }, data: { roomLabel: "Room 7" } });

    await callNext(t.doctor, t.doctorId); // Kiran goes in; Lata is now next.

    const told = await prisma.message.findFirst({
      where: { patientId: second.id, channel: "SMS", body: { contains: "you are next" } },
      select: { body: true },
    });
    assert.ok(told, "the patient now first in line was told");
    assert.match(told.body, /Lata, you are next\. Please go to Room 7\./);

    // With no room to send them to, the message cannot be written — and the
    // run says so instead of quietly completing.
    await prisma.queue.updateMany({ where: { doctorId: t.doctorId }, data: { roomLabel: null } });
    const third = await registerPatient(t.reception, {
      firstName: "Meena",
      gender: "FEMALE",
      approximateAge: 50,
      phone: "9770000009",
      whatsappOptIn: false,
      smsOptIn: true,
      emailOptIn: false,
    });
    await addWalkIn(t.reception, { patientId: third.id, doctorId: t.doctorId });
    await callNext(t.doctor, t.doctorId); // Lata goes in; Meena is next.

    const failed = await prisma.workflowRun.findFirst({
      where: { workflowId: id, status: "FAILED" },
      select: { error: true },
    });
    assert.ok(failed, "the run records the failure");
    assert.match(failed.error ?? "", /\{\{roomLabel\}\}/);
  });

  it("refuses to enable a workflow that could not work", async () => {
    const t = clinic!;
    const broken = await prisma.workflow.create({
      data: {
        organizationId: t.organizationId,
        name: "Broken",
        trigger: "PATIENT_REGISTERED",
        steps: [{ type: "ACTION", action: "CREATE_FEEDBACK_RECORD" }],
      },
    });
    const refused = await rejection(setWorkflowEnabled(t.admin, broken.id, true));
    assert.match(refused.message, /needs a visit/);
  });
});
