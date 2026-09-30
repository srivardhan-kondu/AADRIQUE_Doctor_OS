import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import {
  bookAppointment,
  checkInAppointment,
} from "@/server/services/appointments";
import { registerPatient } from "@/server/services/patients";
import { addWalkIn } from "@/server/services/queue";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/**
 * A patient is seen once per doctor per day: a second booking or a walk-in
 * beside a booking puts the same person in the queue twice.
 *
 *   npm run test:integration
 */

const configured = Boolean(process.env.DATABASE_URL);

describe("One visit per doctor per day", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let patientId = "";
  let appointmentId = "";

  before(async () => {
    clinic = await createTenant("same-day");
    const patient = await registerPatient(clinic.reception, {
      firstName: "Sandeep",
      lastName: "Kumar",
      phone: "9844444444",
      gender: "MALE",
      approximateAge: 63,
      whatsappOptIn: false,
      smsOptIn: false,
      emailOptIn: false,
    });
    patientId = patient.id;
  });

  after(async () => {
    await removeTenant(clinic);
    await prisma.$disconnect();
  });

  it("refuses a second booking with the same doctor that day", async () => {
    const t = clinic!;
    const start = new Date(Date.now() + 5 * 60_000);
    const booked = await bookAppointment(t.reception, {
      patientId,
      doctorId: t.doctorId,
      start,
      notify: false,
    });
    appointmentId = booked.appointmentId;

    const again = await rejection(
      bookAppointment(t.reception, {
        patientId,
        doctorId: t.doctorId,
        start: new Date(start.getTime() + 30 * 60_000),
        notify: false,
      }),
    );
    assert.equal(again.code, "CONFLICT");
    assert.match(again.message, /already booked/);
  });

  it("sends a booked patient to check-in, not a second walk-in token", async () => {
    const t = clinic!;
    const walkIn = await rejection(
      addWalkIn(t.reception, { patientId, doctorId: t.doctorId }),
    );
    assert.equal(walkIn.code, "CONFLICT");
    assert.match(walkIn.action ?? "", /Check them in/);

    const checkedIn = await checkInAppointment(t.reception, appointmentId);
    assert.equal(checkedIn.token, "T001");

    const tokens = await prisma.queueEntry.count({ where: { patientId } });
    assert.equal(tokens, 1);
  });
});
