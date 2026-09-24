import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import type { RequestActor } from "@/server/context";
import { getConsultationWorkspace } from "@/server/services/consultation";
import { addWalkIn, callNext } from "@/server/services/queue";
import { type VitalsInput, getVitalsStation, recordVitals } from "@/server/services/vitals";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §5.1 — vitals at the nurse's station, carried into the consultation. */

const configured = Boolean(process.env.DATABASE_URL);

const blank: VitalsInput = {
  heightCm: null,
  weightKg: null,
  temperatureC: null,
  pulseBpm: null,
  respiratoryRate: null,
  systolicBp: null,
  diastolicBp: null,
  spo2: null,
  bloodGlucose: null,
  notes: null,
};

describe("Vitals", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  let nurse: RequestActor;
  let queueEntryId = "";

  before(async () => {
    clinic = await createTenant("vitals");
    other = await createTenant("vitals-other");
    nurse = { ...clinic.reception, role: "NURSE" };
    await addWalkIn(clinic.reception, { patientId: clinic.patientId, doctorId: clinic.doctorId, reason: "Fever" });
    queueEntryId = (
      await prisma.queueEntry.findFirstOrThrow({ where: { patientId: clinic.patientId }, select: { id: true } })
    ).id;
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("lists the waiting patient at the station, still to be measured", async () => {
    const station = await getVitalsStation(nurse);
    assert.equal(station.length, 1);
    assert.equal(station[0].queueEntryId, queueEntryId);
    assert.equal(station[0].vitals, null);
    assert.equal(station[0].reason, "Fever");
  });

  it("refuses a mistyped reading and anyone who may not record", async () => {
    const typo = await rejection(recordVitals(nurse, { queueEntryId }, { ...blank, temperatureC: 386 }));
    assert.equal(typo.code, "VALIDATION");
    await assert.rejects(recordVitals(clinic!.reception, { queueEntryId }, { ...blank, pulseBpm: 80 }), {
      name: "PermissionError",
    });
    const foreign = await rejection(recordVitals({ ...other!.reception, role: "NURSE" }, { queueEntryId }, { ...blank, pulseBpm: 80 }));
    assert.equal(foreign.code, "NOT_FOUND");
    assert.equal(await prisma.vital.count({ where: { patientId: clinic!.patientId } }), 0);
  });

  it("opens the visit at vitals, and the doctor's call picks the same visit up", async () => {
    const t = clinic!;
    const { visitId, flags } = await recordVitals(nurse, { queueEntryId }, {
      ...blank,
      temperatureC: 38.4,
      systolicBp: 128,
      diastolicBp: 82,
      pulseBpm: 96,
      spo2: 97,
    });
    assert.deepEqual(flags, ["Fever"]);

    const entry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: queueEntryId }, select: { status: true } });
    assert.equal(entry.status, "VITALS");

    const station = await getVitalsStation(nurse);
    assert.match(station[0].vitals!.summary, /BP 128\/82/);
    assert.deepEqual(station[0].vitals!.flags, ["Fever"]);

    const called = await callNext(t.doctor, t.doctorId);
    assert.equal(called?.visitId, visitId, "one visit, not two");

    const ws = await getConsultationWorkspace(t.doctor, visitId);
    assert.equal(ws.vitals?.temperatureC, 38.4);
    assert.equal(ws.vitals?.recordedBy, "Test Front Desk");

    // The doctor can add a later reading from the consultation.
    await recordVitals(t.doctor, { visitId }, { ...blank, temperatureC: 37.9 });
    assert.equal(await prisma.vital.count({ where: { visitId } }), 2);
  });
});
