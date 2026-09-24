import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, facilityScope, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { startOfDay } from "@/server/rules/appointments";
import { visitNumber, waitMinutes } from "@/server/rules/queue";
import { type VitalsReading, bmi, vitalsFlags, vitalsProblem } from "@/server/rules/vitals";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §5.1 — vitals, taken by the nurse while the patient waits, or by the
 * doctor in the consultation.
 *
 * Taking vitals before the doctor calls opens the visit early, so the
 * readings belong to it; `callNext` then picks the same visit up rather
 * than starting a second one.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export type VitalsInput = VitalsReading & { notes: string | null };

export type VitalsTarget = { queueEntryId: string } | { visitId: string };

/** Queue states in which a patient is still here to be measured. */
const MEASURABLE = ["WAITING", "VITALS", "CALLED", "IN_CONSULTATION"] as const;

export async function recordVitals(
  actor: RequestActor,
  target: VitalsTarget,
  input: VitalsInput,
): Promise<{ visitId: string; flags: string[] }> {
  assertPermission(actor, Permission.VITALS_RECORD);

  const problem = vitalsProblem(input);
  if (problem) throw new ServiceError("VALIDATION", problem);
  const notes = input.notes?.trim().slice(0, 500) || null;

  const visitId = await prisma.$transaction(async (tx) => {
    let visit: { id: string; patientId: string; status: string };

    if ("visitId" in target) {
      const found = await tx.visit.findFirst({
        where: { id: target.visitId, ...tenantScope(actor) },
        select: { id: true, patientId: true, status: true },
      });
      if (!found) throw notFound("Visit");
      visit = found;
    } else {
      const entry = await tx.queueEntry.findFirst({
        where: { id: target.queueEntryId, queue: tenantScope(actor) },
        include: {
          queue: { select: { organizationId: true, facilityId: true, departmentId: true, doctorId: true } },
          appointment: { select: { reason: true } },
          visit: { select: { id: true, patientId: true, status: true } },
        },
      });
      if (!entry) throw notFound("Queue entry");
      if (!(MEASURABLE as readonly string[]).includes(entry.status)) {
        throw invalidState("This patient has already left the queue.");
      }

      visit =
        entry.visit ??
        (await tx.visit.create({
          data: {
            organizationId: entry.queue.organizationId,
            facilityId: entry.queue.facilityId,
            departmentId: entry.queue.departmentId,
            patientId: entry.patientId,
            doctorId: entry.queue.doctorId,
            appointmentId: entry.appointmentId,
            queueEntryId: entry.id,
            visitNumber: visitNumber(new Date(), entry.token),
            stage: "VITALS",
            status: "OPEN",
            chiefComplaint: entry.appointment?.reason ?? null,
          },
          select: { id: true, patientId: true, status: true },
        }));

      if (entry.status === "WAITING") {
        await tx.queueEntry.update({
          where: { id: entry.id },
          data: { status: "VITALS", vitalsAt: new Date() },
        });
      }
    }

    if (visit.status !== "OPEN") {
      throw invalidState("This visit is closed; vitals cannot be added to it.");
    }

    const vital = await tx.vital.create({
      data: {
        visitId: visit.id,
        patientId: visit.patientId,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        temperatureC: input.temperatureC,
        pulseBpm: input.pulseBpm,
        respiratoryRate: input.respiratoryRate,
        systolicBp: input.systolicBp,
        diastolicBp: input.diastolicBp,
        spo2: input.spo2,
        bloodGlucose: input.bloodGlucose,
        notes,
        recordedById: actor.userId,
      },
      select: { id: true },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_CREATED",
      entityType: "Vital",
      entityId: vital.id,
      summary: "Recorded vitals",
      metadata: { visitId: visit.id },
    });
    return visit.id;
  }, TX_OPTIONS);

  return { visitId, flags: vitalsFlags(input) };
}

export interface StationPatient {
  queueEntryId: string;
  token: string;
  status: (typeof MEASURABLE)[number];
  priority: "NORMAL" | "PRIORITY" | "EMERGENCY";
  waitMinutes: number;
  patientId: string;
  patientName: string;
  mrn: string;
  age: number | null;
  gender: string;
  doctorName: string;
  reason: string | null;
  allergies: string[];
  vitals: {
    recordedAt: Date;
    recordedBy: string | null;
    summary: string;
    flags: string[];
  } | null;
}

/**
 * The nurse's station: everyone in today's queues who is still here, those
 * without vitals first, then by how long they have waited.
 */
export async function getVitalsStation(actor: RequestActor): Promise<StationPatient[]> {
  assertPermission(actor, Permission.VITALS_READ);
  const now = new Date();

  const entries = await prisma.queueEntry.findMany({
    where: {
      status: { in: [...MEASURABLE] },
      queue: { ...facilityScope(actor), date: startOfDay(now) },
    },
    orderBy: [{ priority: "desc" }, { joinedAt: "asc" }],
    take: 200,
    include: {
      queue: { select: { doctor: { select: { user: { select: { name: true } } } } } },
      appointment: { select: { reason: true } },
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mrn: true,
          gender: true,
          dateOfBirth: true,
          approximateAge: true,
          allergies: { where: { active: true }, select: { substance: true } },
        },
      },
      visit: {
        select: {
          vitals: {
            orderBy: { recordedAt: "desc" },
            take: 1,
            include: { recordedBy: { select: { name: true } } },
          },
        },
      },
    },
  });

  const rows = entries.map((e): StationPatient => {
    const v = e.visit?.vitals[0] ?? null;
    const reading = v
      ? {
          heightCm: v.heightCm === null ? null : Number(v.heightCm),
          weightKg: v.weightKg === null ? null : Number(v.weightKg),
          temperatureC: v.temperatureC === null ? null : Number(v.temperatureC),
          pulseBpm: v.pulseBpm,
          respiratoryRate: v.respiratoryRate,
          systolicBp: v.systolicBp,
          diastolicBp: v.diastolicBp,
          spo2: v.spo2,
          bloodGlucose: v.bloodGlucose === null ? null : Number(v.bloodGlucose),
        }
      : null;
    const p = e.patient;
    return {
      queueEntryId: e.id,
      token: e.token,
      status: e.status as StationPatient["status"],
      priority: e.priority,
      waitMinutes: waitMinutes(e.status, e.joinedAt, now),
      patientId: p.id,
      patientName: `${p.firstName} ${p.lastName ?? ""}`.trim(),
      mrn: p.mrn,
      age:
        p.approximateAge ??
        (p.dateOfBirth ? Math.floor((now.getTime() - p.dateOfBirth.getTime()) / (365.25 * 86_400_000)) : null),
      gender: p.gender,
      doctorName: e.queue.doctor.user.name,
      reason: e.appointment?.reason ?? null,
      allergies: p.allergies.map((a) => a.substance),
      vitals:
        v && reading
          ? {
              recordedAt: v.recordedAt,
              recordedBy: v.recordedBy?.name ?? null,
              summary: summarise(reading),
              flags: vitalsFlags(reading),
            }
          : null,
    };
  });

  // Those still to be measured first; the order within each group is kept.
  return [...rows.filter((r) => !r.vitals), ...rows.filter((r) => r.vitals)];
}

function summarise(r: VitalsReading): string {
  const parts = [
    r.systolicBp !== null && r.diastolicBp !== null ? `BP ${r.systolicBp}/${r.diastolicBp}` : null,
    r.pulseBpm !== null ? `Pulse ${r.pulseBpm}` : null,
    r.temperatureC !== null ? `${r.temperatureC}°C` : null,
    r.spo2 !== null ? `SpO₂ ${r.spo2}%` : null,
    r.weightKg !== null ? `${r.weightKg} kg` : null,
  ];
  const index = bmi(r.heightCm, r.weightKg);
  if (index !== null) parts.push(`BMI ${index}`);
  return parts.filter(Boolean).join(" · ");
}
