import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { verifySignedId } from "@/lib/security/signed-link";
import { getTokenStatus, getWaitingRoomDisplay } from "@/server/services/display";
import { getFrontDeskDay } from "@/server/services/front-desk";
import { getQueueSignal } from "@/server/services/live";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";
import {
  getPatient360,
  registerPatient,
  searchPatients,
} from "@/server/services/patients";
import { addWalkIn, callNext, getQueueBoards } from "@/server/services/queue";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/**
 * Spec §13 + §53 — the front desk against the real database: registration,
 * walk-in tokens, priority, the live signal, and what the desk may not read.
 *
 *   npm run test:integration
 */

const configured = Boolean(process.env.DATABASE_URL);

const person = {
  gender: "FEMALE" as const,
  approximateAge: 34,
  whatsappOptIn: true,
  smsOptIn: true,
  emailOptIn: false,
};

describe("Front desk", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;

  before(async () => {
    clinic = await createTenant("desk");
    other = await createTenant("desk-other");
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  let meera = "";
  let ravi = "";

  it("registers patients with sequential IDs and refuses a duplicate", async () => {
    const t = clinic!;

    const first = await registerPatient(t.reception, {
      ...person,
      firstName: "Meera",
      lastName: "Iyer",
      phone: "9811111111",
    });
    const second = await registerPatient(t.reception, {
      ...person,
      gender: "MALE",
      firstName: "Ravi",
      phone: "9822222222",
    });
    meera = first.id;
    ravi = second.id;

    assert.equal(first.mrn, "P-000001");
    assert.equal(second.mrn, "P-000002");
    assert.equal(first.name, "Meera Iyer");

    // Same mobile, same first name, different case: the same person.
    const duplicate = await rejection(
      registerPatient(t.reception, {
        ...person,
        firstName: "meera",
        phone: "9811111111",
      }),
    );
    assert.equal(duplicate.code, "CONFLICT");
    assert.match(duplicate.message, /already registered as P-000001/);

    const ageless = await rejection(
      registerPatient(t.reception, {
        ...person,
        approximateAge: null,
        firstName: "Anon",
        phone: "9833333333",
      }),
    );
    assert.equal(ageless.code, "VALIDATION");

    const audited = await prisma.auditLog.count({
      where: { organizationId: t.organizationId, entityType: "Patient" },
    });
    assert.equal(audited, 2);
  });

  it("issues walk-in tokens, and an emergency is called first", async () => {
    const t = clinic!;
    const before = await getQueueSignal(t.reception, null);

    const normal = await addWalkIn(t.reception, {
      patientId: meera,
      doctorId: t.doctorId,
      reason: "Fever",
    });
    const urgent = await addWalkIn(t.reception, {
      patientId: ravi,
      doctorId: t.doctorId,
      priority: "EMERGENCY",
    });

    assert.equal(normal.token, "T001");
    assert.equal(urgent.token, "T002");
    assert.equal(urgent.waiting, 2);

    // The live signal moved, so every open queue screen will refresh.
    assert.notEqual(await getQueueSignal(t.reception, null), before);

    // A walk-in is an appointment too, already checked in.
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { patientId: meera },
      select: { type: true, status: true, source: true },
    });
    assert.deepEqual(appointment, {
      type: "WALK_IN",
      status: "CHECKED_IN",
      source: "WALK_IN",
    });

    const [board] = await getQueueBoards(t.reception);
    assert.deepEqual(
      board.waiting.map((e) => e.token),
      ["T002", "T001"],
      "the emergency should be at the front of the line",
    );

    const called = await callNext(t.doctor, t.doctorId);
    assert.equal(called?.token, "T002");
  });

  it("tells the waiting room and the patient where the line is, without names", async () => {
    const t = clinic!;

    const display = await getWaitingRoomDisplay(t.reception);
    const [panel] = display.panels;
    assert.equal(panel.nowServing, "T002");
    assert.deepEqual(panel.next, ["T001"]);
    assert.ok(
      !JSON.stringify(display).includes("Meera") &&
        !JSON.stringify(display).includes("Ravi"),
      "no patient name may reach a public screen",
    );

    // The desk's board carries a signed link to the patient's own page.
    const [board] = await getQueueBoards(t.reception);
    const path = board.waiting[0].statusPath!;
    const entryId = verifySignedId(decodeURIComponent(path.slice("/q/".length)));
    assert.equal(entryId, board.waiting[0].id);

    const status = await getTokenStatus(entryId!);
    assert.deepEqual(
      {
        token: status?.token,
        state: status?.state,
        nowServing: status?.nowServing,
        ahead: status?.ahead,
      },
      { token: "T001", state: "waiting", nowServing: "T002", ahead: 0 },
    );
    assert.ok(!JSON.stringify(status).includes("Meera"));
  });

  it("will not queue the same patient twice for one doctor", async () => {
    const t = clinic!;
    const again = await rejection(
      addWalkIn(t.reception, { patientId: meera, doctorId: t.doctorId }),
    );
    assert.equal(again.code, "CONFLICT");
    assert.match(again.message, /already in the queue as T001/);
  });

  it("counts the day for the desk", async () => {
    const day = await getFrontDeskDay(clinic!.reception);
    assert.equal(day.counts.registered, 3, "two today plus the fixture's patient");
    assert.equal(day.counts.expected, 2);
    assert.equal(day.counts.arrived, 2);
    assert.ok(day.arrivals.every((a) => a.token));
  });

  it("keeps the clinical record from the front desk", async () => {
    const t = clinic!;
    await prisma.patientAllergy.create({
      data: { patientId: meera, substance: "Penicillin", severity: "HIGH" },
    });

    const asDesk = await getPatient360(t.reception, meera);
    const asDoctor = await getPatient360(t.doctor, meera);

    assert.deepEqual(asDesk.allergies, []);
    assert.equal(asDoctor.allergies[0]?.substance, "Penicillin");

    const [row] = await searchPatients(t.reception, "Meera");
    assert.equal(row.allergyCount, 0);
    const [doctorRow] = await searchPatients(t.doctor, "Meera");
    assert.equal(doctorRow.allergyCount, 1);
  });

  it("lets each person read and dismiss only their own notifications", async () => {
    const t = clinic!;
    const [mine, theirs] = await Promise.all([
      prisma.notification.create({
        data: {
          organizationId: t.organizationId,
          userId: t.reception.userId,
          title: "Queue over capacity",
          body: "Dr. Test Rao has 9 waiting.",
          level: "ALERT",
        },
      }),
      prisma.notification.create({
        data: {
          organizationId: t.organizationId,
          userId: t.doctor.userId,
          title: "Brief ready",
          body: "Pre-consultation brief for T001.",
          level: "AI",
        },
      }),
    ]);

    // Someone else's id changes nothing.
    await markNotificationRead(t.reception, theirs.id);
    const doctorView = await listNotifications(t.doctor);
    assert.equal(doctorView.unread, 1);

    const deskView = await listNotifications(t.reception);
    assert.deepEqual(deskView.rows.map((r) => r.id), [mine.id]);

    await markAllNotificationsRead(t.reception);
    assert.equal((await listNotifications(t.reception)).unread, 0);
    assert.equal((await listNotifications(t.doctor)).unread, 1);
  });

  it("does not let another organization queue or read these patients", async () => {
    const outsider = other!;

    const walkIn = await rejection(
      addWalkIn(outsider.reception, {
        patientId: ravi,
        doctorId: outsider.doctorId,
      }),
    );
    assert.equal(walkIn.code, "NOT_FOUND");

    const read = await rejection(getPatient360(outsider.reception, meera));
    assert.equal(read.code, "NOT_FOUND");

    assert.deepEqual(await searchPatients(outsider.reception, "Meera"), []);
    // Their board is their own doctor's, with none of these tokens on it.
    const boards = await getQueueBoards(outsider.reception);
    assert.ok(boards.every((b) => b.waiting.length === 0 && !b.active));
  });
});
