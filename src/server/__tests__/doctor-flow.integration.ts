import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import {
  addDiagnosis,
  getConsultationWorkspace,
  recentDiagnoses,
  removeDiagnosis,
  saveDraft,
  signConsultation,
} from "@/server/services/consultation";
import { UnsignedNoteError } from "@/server/services/errors";
import {
  deletePhrase,
  getFavourites,
  savePhrase,
  saveRxSet,
} from "@/server/services/favourites";
import { savePrescription, searchMedications } from "@/server/services/prescriptions";
import { addWalkIn, callNext, completeConsultation } from "@/server/services/queue";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/**
 * The doctor's loop without repeated work: an unsigned note is never closed
 * silently, signing books the follow-up, diagnoses are structured, and the
 * doctor's phrases, sets and usual doses come back to them.
 */

const configured = Boolean(process.env.DATABASE_URL);
const RUN = Date.now().toString(36);

describe("Doctor flow", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  let medicationId = "";

  async function patient(name: string) {
    const t = clinic!;
    const created = await prisma.patient.create({
      data: {
        organizationId: t.organizationId,
        facilityId: t.facilityId,
        mrn: `DF-${name}-${RUN}`,
        firstName: name,
        phone: "9876500000",
      },
      select: { id: true },
    });
    return created.id;
  }

  before(async () => {
    clinic = await createTenant("doctor-flow");
    other = await createTenant("doctor-flow-other");
    const medication = await prisma.medication.create({
      data: { name: `Flowcetamol ${RUN}`, strength: "500 mg", form: "Tablet" },
      select: { id: true },
    });
    medicationId = medication.id;
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.medication.deleteMany({ where: { id: medicationId } });
    await prisma.$disconnect();
  });

  it("asks before closing a visit whose written note is unsigned", async () => {
    const t = clinic!;
    await addWalkIn(t.reception, { patientId: t.patientId, doctorId: t.doctorId });
    await addWalkIn(t.reception, { patientId: await patient("Ravi"), doctorId: t.doctorId });
    await addWalkIn(t.reception, { patientId: await patient("Sita"), doctorId: t.doctorId });

    const first = await callNext(t.doctor, t.doctorId);
    assert.ok(first);

    // Nothing written yet — moving on is not a loss, so it is not asked.
    await saveDraft(t.doctor, first.visitId, { chiefComplaint: "Fever" });
    const second = await callNext(t.doctor, t.doctorId);
    assert.ok(second);

    await saveDraft(t.doctor, second.visitId, { examination: "Chest clear" });
    const refused = await rejection(callNext(t.doctor, t.doctorId));
    assert.ok(refused instanceof UnsignedNoteError);
    assert.equal(refused.visitId, second.visitId);
    assert.equal(refused.patientName, "Ravi");

    const entry = await prisma.visit.findUniqueOrThrow({
      where: { id: second.visitId },
      select: { status: true, queueEntryId: true },
    });
    assert.equal(entry.status, "OPEN", "the refusal changed nothing");

    const refusedComplete = await rejection(completeConsultation(t.doctor, entry.queueEntryId!));
    assert.ok(refusedComplete instanceof UnsignedNoteError);

    // The doctor's explicit choice goes through.
    const third = await callNext(t.doctor, t.doctorId, undefined, { leaveUnsigned: true });
    assert.ok(third);
    const left = await prisma.consultation.findUniqueOrThrow({
      where: { visitId: second.visitId },
      select: { status: true },
    });
    assert.equal(left.status, "DRAFT");
  });

  it("keeps structured diagnoses and offers the doctor's own back", async () => {
    const t = clinic!;
    await addWalkIn(t.reception, { patientId: await patient("Uma"), doctorId: t.doctorId });
    const visit = await callNext(t.doctor, t.doctorId, undefined, { leaveUnsigned: true });
    assert.ok(visit);

    let list = await addDiagnosis(t.doctor, visit.visitId, { name: "Viral fever" });
    list = await addDiagnosis(t.doctor, visit.visitId, { name: "viral fever" });
    assert.equal(list.length, 1, "a repeat is not added twice");
    list = await addDiagnosis(t.doctor, visit.visitId, { name: "Dehydration" });
    assert.deepEqual(list.map((d) => [d.name, d.isPrimary]), [["Viral fever", true], ["Dehydration", false]]);

    list = await removeDiagnosis(t.doctor, visit.visitId, list[0]!.id);
    assert.deepEqual(list.map((d) => [d.name, d.isPrimary]), [["Dehydration", true]], "the next becomes primary");

    // Another tenant's doctor cannot touch them.
    await assert.rejects(addDiagnosis(other!.doctor, visit.visitId, { name: "Asthma" }));

    assert.ok((await recentDiagnoses(t.doctor)).includes("Dehydration"));
    assert.deepEqual(await recentDiagnoses(other!.doctor), []);

    // Signing freezes them, and books the follow-up in the same step.
    await signConsultation(t.doctor, visit.visitId, { assessment: "Dehydration" }, { followUpInDays: 7 });
    const frozen = await rejection(addDiagnosis(t.doctor, visit.visitId, { name: "Asthma" }));
    assert.equal(frozen.code, "INVALID_STATE");

    const followUp = await prisma.followUp.findFirstOrThrow({
      where: { visitId: visit.visitId },
      select: { dueDate: true, status: true, reason: true, doctorId: true },
    });
    const now = new Date();
    assert.equal(followUp.dueDate.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).getTime());
    assert.equal(followUp.status, "PENDING");
    assert.equal(followUp.reason, "Review: Dehydration");
    assert.equal(followUp.doctorId, t.doctorId);

    const ws = await getConsultationWorkspace(t.doctor, visit.visitId);
    assert.deepEqual(ws.diagnoses.map((d) => d.name), ["Dehydration"]);
    assert.ok(ws.followUp);
  });

  it("brings back the doctor's usual dose and the patient's last prescription", async () => {
    const t = clinic!;
    const asha = t.patientId;
    await addWalkIn(t.reception, { patientId: asha, doctorId: t.doctorId });
    const first = await callNext(t.doctor, t.doctorId, undefined, { leaveUnsigned: true });
    assert.ok(first);
    await savePrescription(t.doctor, first.visitId, {
      advice: "Fluids",
      items: [
        {
          medicationId,
          medicationName: `Flowcetamol ${RUN} 500 mg Tablet`,
          dosage: "1 tablet",
          frequency: "1-0-1 (morning and night)",
          route: null,
          durationDays: 5,
          instructions: "After food",
        },
      ],
    });
    await signConsultation(t.doctor, first.visitId, { assessment: "Fever" });

    const [hit] = await searchMedications(t.doctor, `Flowcetamol ${RUN}`);
    assert.equal(hit?.uses, 1);
    assert.equal(hit?.lastUse?.frequency, "1-0-1 (morning and night)");
    assert.equal(hit?.lastUse?.durationDays, 5);

    const frequent = await searchMedications(t.doctor, "");
    assert.ok(frequent.some((m) => m.id === medicationId), "an empty search offers frequent medicines");

    // Usage is the doctor's own: another doctor sees the catalogue, not the history.
    const [theirs] = await searchMedications(other!.doctor, `Flowcetamol ${RUN}`);
    assert.equal(theirs?.uses, 0);
    assert.equal(theirs?.lastUse, null);

    // The next visit offers the issued prescription to repeat.
    await addWalkIn(t.reception, { patientId: asha, doctorId: t.doctorId });
    const second = await callNext(t.doctor, t.doctorId, undefined, { leaveUnsigned: true });
    assert.ok(second);
    const ws = await getConsultationWorkspace(t.doctor, second.visitId);
    assert.equal(ws.previousPrescriptions[0]?.visitId, first.visitId);
    assert.equal(ws.previousPrescriptions[0]?.items[0]?.durationDays, 5);
    assert.equal(ws.previousPrescriptions[0]?.advice, "Fluids");
  });

  it("keeps each doctor's phrases and sets to themselves", async () => {
    const t = clinic!;
    let mine = await savePhrase(t.doctor, { field: "examination", text: "Throat congested." });
    mine = await savePhrase(t.doctor, { field: "examination", text: "throat congested." });
    assert.equal(mine.phrases.length, 1, "a duplicate is not saved twice");

    mine = await saveRxSet(t.doctor, {
      name: "Viral fever",
      advice: "Rest",
      items: [{ medicationId: null, medicationName: "Paracetamol 650", dosage: null, frequency: "bd", route: null, durationDays: 3, instructions: null }],
    });
    mine = await saveRxSet(t.doctor, {
      name: "viral fever",
      advice: null,
      items: [{ medicationId: null, medicationName: "Paracetamol 500", dosage: null, frequency: null, route: null, durationDays: null, instructions: null }],
    });
    assert.equal(mine.rxSets.length, 1, "saving under the same name replaces the set");
    assert.equal(mine.rxSets[0]?.items[0]?.medicationName, "Paracetamol 500");

    assert.deepEqual(await getFavourites(other!.doctor), { phrases: [], rxSets: [] });
    await assert.rejects(savePhrase(t.reception, { field: "plan", text: "Review" }));

    mine = await deletePhrase(t.doctor, mine.phrases[0]!.id);
    assert.equal(mine.phrases.length, 0);
  });
});
