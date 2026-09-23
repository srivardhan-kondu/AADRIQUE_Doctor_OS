import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { invalidState, notFound } from "./errors";
import {
  ACTIVE_STATUSES,
  SETTLED_STATUSES,
  WAITING_STATUSES,
  assertCanComplete,
  assertCanMoveToVitals,
  assertCanSkip,
  averageWait,
  visitNumber,
  waitMinutes,
} from "@/server/rules/queue";
import { fireTrigger } from "./workflows";

/**
 * Spec §12 — token and queue management.
 *
 * Each action is a transaction: the queue entry, the visit, the appointment
 * and the audit entry move together or not at all (spec §50).
 */

/**
 * Prisma's default interactive-transaction timeout is 5s, which assumes a
 * database on the same network. A hosted one (Neon, Supabase) is tens or
 * hundreds of milliseconds away per round trip, and these transactions make
 * several — so the default aborts `callNext` in normal use. The work inside is
 * small; it is the latency that is not.
 */
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Resolves today's queue for a doctor, creating it on first use. */
export async function ensureTodayQueue(
  actor: RequestActor,
  doctorId: string,
): Promise<string> {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    select: {
      id: true,
      tokenPrefix: true,
      facilityId: true,
      departmentId: true,
    },
  });
  if (!doctor) throw notFound("Doctor");

  const existing = await prisma.queue.findUnique({
    where: { doctorId_date: { doctorId, date } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.queue.create({
    data: {
      organizationId: actor.organizationId,
      facilityId: doctor.facilityId,
      departmentId: doctor.departmentId,
      doctorId,
      date,
      tokenPrefix: doctor.tokenPrefix,
    },
    select: { id: true },
  });
  return created.id;
}

/** Loads a queue entry and proves it belongs to the actor's organization. */
async function loadEntry(actor: RequestActor, queueEntryId: string) {
  const entry = await prisma.queueEntry.findFirst({
    where: {
      id: queueEntryId,
      queue: { organizationId: actor.organizationId },
    },
    include: {
      queue: {
        select: {
          id: true,
          doctorId: true,
          status: true,
          facilityId: true,
          departmentId: true,
          organizationId: true,
        },
      },
      patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
      visit: { select: { id: true } },
    },
  });

  // A missing entry and one in another tenant are indistinguishable here.
  if (!entry) throw notFound("Queue entry");
  return entry;
}

export interface CallNextResult {
  queueEntryId: string;
  visitId: string;
  patientId: string;
  patientName: string;
  token: string;
}

/**
 * Spec §41-B / §41-K — call the next patient and open their visit in one step.
 *
 * If someone is already with the doctor, that consultation is completed first,
 * so "Call Next" is always safe to press and the doctor is never left with two
 * open visits.
 */
export async function callNext(
  actor: RequestActor,
  doctorId: string,
): Promise<CallNextResult | null> {
  assertPermission(actor, Permission.QUEUE_MANAGE);

  const queueId = await ensureTodayQueue(actor, doctorId);

  // The visit closed out on the way, if there was one, so its completion
  // trigger can fire after the transaction commits.
  let closedVisitId: string | null = null;

  const result = await prisma.$transaction(async (tx) => {
    const queue = await tx.queue.findUniqueOrThrow({
      where: { id: queueId },
      select: {
        id: true,
        status: true,
        facilityId: true,
        departmentId: true,
        organizationId: true,
      },
    });

    if (queue.status !== "OPEN") {
      throw invalidState(
        "This queue is paused.",
        "Resume the queue before calling the next patient.",
      );
    }

    // Close out whoever is currently with the doctor.
    const active = await tx.queueEntry.findFirst({
      where: { queueId, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true, visit: { select: { id: true } } },
    });

    if (active) {
      const now = new Date();
      await tx.queueEntry.update({
        where: { id: active.id },
        data: { status: "COMPLETED", completedAt: now },
      });
      if (active.visit) {
        await tx.visit.update({
          where: { id: active.visit.id },
          data: { stage: "COMPLETED", status: "COMPLETED", completedAt: now },
        });
        closedVisitId = active.visit.id;
      }
    }

    const next = await tx.queueEntry.findFirst({
      where: { queueId, status: { in: [...WAITING_STATUSES] } },
      orderBy: [{ priority: "desc" }, { position: "asc" }],
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        appointment: { select: { id: true, reason: true } },
      },
    });

    if (!next) return null;

    const now = new Date();

    await tx.queueEntry.update({
      where: { id: next.id },
      data: { status: "IN_CONSULTATION", calledAt: now, startedAt: now },
    });

    if (next.appointmentId) {
      await tx.appointment.update({
        where: { id: next.appointmentId },
        data: { status: "IN_CONSULTATION", startedAt: now },
      });
    }

    // One visit per queue entry — reuse it if the patient was called before.
    const existingVisit = await tx.visit.findUnique({
      where: { queueEntryId: next.id },
      select: { id: true },
    });

    let visitId: string;

    if (existingVisit) {
      visitId = existingVisit.id;
      await tx.visit.update({
        where: { id: visitId },
        data: { stage: "WITH_DOCTOR", status: "OPEN" },
      });
    } else {
      const visit = await tx.visit.create({
        data: {
          organizationId: queue.organizationId,
          facilityId: queue.facilityId,
          departmentId: queue.departmentId,
          patientId: next.patientId,
          doctorId,
          appointmentId: next.appointmentId,
          queueEntryId: next.id,
          visitNumber: visitNumber(now, next.token),
          stage: "WITH_DOCTOR",
          status: "OPEN",
          startedAt: now,
          chiefComplaint: next.appointment?.reason ?? null,
        },
        select: { id: true },
      });
      visitId = visit.id;
    }

    // The consultation starts as a draft the doctor returns to (spec §26).
    await tx.consultation.upsert({
      where: { visitId },
      create: {
        organizationId: queue.organizationId,
        visitId,
        patientId: next.patientId,
        doctorId,
        chiefComplaint: next.appointment?.reason ?? null,
        status: "DRAFT",
      },
      update: {},
    });

    await tx.patient.update({
      where: { id: next.patientId },
      data: { lastVisitAt: now },
    });

    const patientName = `${next.patient.firstName} ${next.patient.lastName ?? ""}`.trim();

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "QueueEntry",
      entityId: next.id,
      summary: `Called token ${next.token} · Patient ${next.patient.mrn}`,
      metadata: { token: next.token, patientMrn: next.patient.mrn },
    });

    return {
      queueEntryId: next.id,
      visitId,
      patientId: next.patientId,
      patientName,
      token: next.token,
    };
  }, TX_OPTIONS);

  // Closing out a visit by calling the next patient completes it just as the
  // Complete button does, so the same automations hear about it.
  if (closedVisitId) {
    await fireTrigger(actor, "APPOINTMENT_COMPLETED", {
      type: "Visit",
      id: closedVisitId,
    });
  }

  return result;
}

/** Marks the current consultation complete without calling anyone new. */
export async function completeConsultation(
  actor: RequestActor,
  queueEntryId: string,
): Promise<void> {
  assertPermission(actor, Permission.QUEUE_MANAGE);

  const entry = await loadEntry(actor, queueEntryId);

  assertCanComplete(entry.status);

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    await tx.queueEntry.update({
      where: { id: entry.id },
      data: { status: "COMPLETED", completedAt: now },
    });

    if (entry.visit) {
      await tx.visit.update({
        where: { id: entry.visit.id },
        data: { stage: "COMPLETED", status: "COMPLETED", completedAt: now },
      });
    }

    if (entry.appointmentId) {
      await tx.appointment.update({
        where: { id: entry.appointmentId },
        data: { status: "COMPLETED", completedAt: now },
      });
    }

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "QueueEntry",
      entityId: entry.id,
      summary: `Completed token ${entry.token} · Patient ${entry.patient.mrn}`,
      metadata: { token: entry.token, patientMrn: entry.patient.mrn },
    });
  }, TX_OPTIONS);

  // Spec §28 — the visit is over; feedback and follow-up automations listen
  // for this. Fired after the transaction commits, so an automation can never
  // roll back a completed consultation.
  if (entry.visit) {
    await fireTrigger(actor, "APPOINTMENT_COMPLETED", {
      type: "Visit",
      id: entry.visit.id,
    });
  }
}

/** Moves a patient to the vitals stage (spec §5.1 flow). */
export async function recordArrivalAtVitals(
  actor: RequestActor,
  queueEntryId: string,
): Promise<void> {
  assertPermission(actor, Permission.QUEUE_MANAGE);
  const entry = await loadEntry(actor, queueEntryId);

  assertCanMoveToVitals(entry.status);

  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.update({
      where: { id: entry.id },
      data: { status: "VITALS", vitalsAt: new Date() },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "QueueEntry",
      entityId: entry.id,
      summary: `Token ${entry.token} moved to vitals`,
    });
  }, TX_OPTIONS);
}

/** Spec §12 — pause and resume, so a doctor can step away honestly. */
export async function setQueueStatus(
  actor: RequestActor,
  doctorId: string,
  status: "OPEN" | "PAUSED",
  reason?: string,
): Promise<void> {
  assertPermission(actor, Permission.QUEUE_MANAGE);
  const queueId = await ensureTodayQueue(actor, doctorId);

  await prisma.$transaction(async (tx) => {
    await tx.queue.update({
      where: { id: queueId },
      data: {
        status,
        pausedAt: status === "PAUSED" ? new Date() : null,
        pauseReason: status === "PAUSED" ? (reason ?? null) : null,
      },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Queue",
      entityId: queueId,
      summary: status === "PAUSED" ? "Queue paused" : "Queue resumed",
    });
  }, TX_OPTIONS);
}

/** Skips a patient who did not respond when called. */
export async function skipEntry(
  actor: RequestActor,
  queueEntryId: string,
): Promise<void> {
  assertPermission(actor, Permission.QUEUE_MANAGE);
  const entry = await loadEntry(actor, queueEntryId);
  assertCanSkip(entry.status);

  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.update({
      where: { id: entry.id },
      data: { status: "SKIPPED" },
    });

    if (entry.appointmentId) {
      await tx.appointment.update({
        where: { id: entry.appointmentId },
        data: { status: "NO_SHOW" },
      });
    }

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "QueueEntry",
      entityId: entry.id,
      summary: `Token ${entry.token} skipped · Patient ${entry.patient.mrn}`,
    });
  }, TX_OPTIONS);
}

export interface QueueBoardEntry {
  id: string;
  token: string;
  tokenSeq: number;
  patientId: string;
  patientName: string;
  patientMrn: string;
  age: number | null;
  phone: string;
  status:
    | "WAITING"
    | "VITALS"
    | "CALLED"
    | "IN_CONSULTATION"
    | "COMPLETED"
    | "SKIPPED"
    | "LEFT";
  priority: "NORMAL" | "PRIORITY" | "EMERGENCY";
  waitMinutes: number;
  reason: string | null;
  isFollowUp: boolean;
  allergyCount: number;
  visitId: string | null;
}

export interface QueueBoard {
  queueId: string;
  doctorId: string;
  doctorName: string;
  department: string | null;
  room: string | null;
  counter: string | null;
  paused: boolean;
  pauseReason: string | null;
  threshold: number;
  active: QueueBoardEntry | null;
  waiting: QueueBoardEntry[];
  done: QueueBoardEntry[];
  /** Spec §12 — what a patient-facing display would show. */
  currentToken: string | null;
  averageWaitMinutes: number;
}

/** The full queue for one doctor today, grouped the way the screen shows it. */
export async function getQueueBoard(
  actor: RequestActor,
  doctorId: string,
): Promise<QueueBoard> {
  assertPermission(actor, Permission.QUEUE_READ);

  const date = new Date();
  date.setHours(0, 0, 0, 0);

  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    include: {
      user: { select: { name: true } },
      department: { select: { name: true, waitThresholdMinutes: true } },
      queues: {
        where: { date },
        include: {
          entries: {
            include: {
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  mrn: true,
                  phone: true,
                  dateOfBirth: true,
                  approximateAge: true,
                  _count: { select: { allergies: true } },
                },
              },
              appointment: { select: { reason: true, type: true } },
              visit: { select: { id: true } },
            },
            orderBy: [{ priority: "desc" }, { position: "asc" }],
          },
        },
      },
    },
  });

  if (!doctor) throw notFound("Doctor");

  const queue = doctor.queues[0] ?? null;
  const entries = queue?.entries ?? [];

  const now = new Date();

  const toEntry = (e: (typeof entries)[number]): QueueBoardEntry => {
    const age =
      e.patient.approximateAge ??
      (e.patient.dateOfBirth
        ? Math.floor(
            (Date.now() - e.patient.dateOfBirth.getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null);

    return {
      id: e.id,
      token: e.token,
      tokenSeq: e.tokenSeq,
      patientId: e.patient.id,
      patientName: `${e.patient.firstName} ${e.patient.lastName ?? ""}`.trim(),
      patientMrn: e.patient.mrn,
      age,
      phone: e.patient.phone,
      status: e.status as QueueBoardEntry["status"],
      priority: e.priority as QueueBoardEntry["priority"],
      waitMinutes: waitMinutes(e.status, e.joinedAt, now),
      reason: e.appointment?.reason ?? null,
      isFollowUp: e.appointment?.type === "FOLLOW_UP",
      allergyCount: e.patient._count.allergies,
      visitId: e.visit?.id ?? null,
    };
  };

  const active = entries.find((e) => ACTIVE_STATUSES.includes(e.status)) ?? null;
  const waiting = entries.filter((e) => WAITING_STATUSES.includes(e.status));
  const done = entries.filter((e) => SETTLED_STATUSES.includes(e.status));

  return {
    queueId: queue?.id ?? "",
    doctorId: doctor.id,
    doctorName: doctor.user.name,
    department: doctor.department?.name ?? null,
    room: queue?.roomLabel ?? null,
    counter: queue?.counterLabel ?? null,
    paused: queue?.status === "PAUSED",
    pauseReason: queue?.pauseReason ?? null,
    threshold: doctor.department?.waitThresholdMinutes ?? 20,
    active: active ? toEntry(active) : null,
    waiting: waiting.map(toEntry),
    done: done.map(toEntry).sort((a, b) => b.tokenSeq - a.tokenSeq),
    currentToken: active?.token ?? null,
    averageWaitMinutes: averageWait(
      waiting.map((e) => waitMinutes(e.status, e.joinedAt, now)),
    ),
  };
}
