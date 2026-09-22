import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";

/**
 * Doctor Command Center data (spec §5.1).
 *
 * Everything the home screen needs, resolved in one pass and scoped to the
 * actor's organization. The shape returned here is what the UI renders — no
 * component reaches back into Prisma.
 */

/** Midnight today and tomorrow, in server-local time. */
function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export interface QueueRow {
  id: string;
  token: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  age: number | null;
  gender: string;
  status: "WAITING" | "VITALS" | "CALLED" | "IN_CONSULTATION";
  priority: "NORMAL" | "PRIORITY" | "EMERGENCY";
  waitMinutes: number;
  reason: string | null;
  isFollowUp: boolean;
  allergyCount: number;
}

export interface ScheduleRow {
  id: string;
  time: Date;
  patientName: string;
  patientMrn: string;
  status: string;
  type: string;
  reason: string | null;
  /** The next appointment still to happen. Decided here, not in the view. */
  isNext: boolean;
}

export interface DashboardData {
  doctor: {
    id: string;
    name: string;
    department: string | null;
    room: string | null;
    counter: string | null;
    online: boolean;
  };
  metrics: {
    total: number;
    waiting: number;
    inConsultation: number;
    completed: number;
    followUpsDue: number;
    newPatients: number;
  };
  flow: Record<
    "REGISTERED" | "WAITING" | "VITALS" | "WITH_DOCTOR" | "COMPLETED" | "FOLLOW_UP",
    number
  >;
  queue: QueueRow[];
  schedule: ScheduleRow[];
  /** Spec §41-J — derived from measurable rules, never clinical judgement. */
  pulse: {
    state: "NORMAL" | "BUSY" | "ATTENTION";
    reason: string;
    longestWaitMinutes: number;
    averageWaitMinutes: number;
    threshold: number;
  };
  nextPatient: { queueEntryId: string; patientName: string; token: string } | null;
  brief: {
    appointments: number;
    followUps: number;
    newPatients: number;
    firstAppointment: Date | null;
  };
}

function ageFrom(dateOfBirth: Date | null, approximateAge: number | null) {
  if (approximateAge !== null) return approximateAge;
  if (!dateOfBirth) return null;
  const diff = Date.now() - dateOfBirth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function minutesSince(from: Date): number {
  return Math.max(0, Math.round((Date.now() - from.getTime()) / 60_000));
}

export async function getDashboard(
  actor: RequestActor,
  doctorId: string,
): Promise<DashboardData> {
  assertPermission(actor, Permission.QUEUE_READ);

  const { start, end } = todayBounds();

  const doctor = await prisma.doctorProfile.findFirst({
    // Scoped to the actor's organization — an id from elsewhere finds nothing.
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    include: {
      user: { select: { name: true } },
      department: { select: { name: true, waitThresholdMinutes: true, queueCapacity: true } },
      queues: {
        where: { date: { gte: start, lt: end } },
        include: {
          entries: {
            include: {
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  mrn: true,
                  dateOfBirth: true,
                  approximateAge: true,
                  gender: true,
                  _count: { select: { allergies: true } },
                },
              },
              appointment: { select: { reason: true, type: true } },
            },
            orderBy: [{ priority: "desc" }, { position: "asc" }],
          },
        },
      },
    },
  });

  if (!doctor) {
    throw new Error("Doctor not found in this organization");
  }

  const queue = doctor.queues[0];
  const entries = queue?.entries ?? [];

  const active = entries.filter((e) =>
    ["WAITING", "VITALS", "CALLED", "IN_CONSULTATION"].includes(e.status),
  );

  const queueRows: QueueRow[] = active.map((entry) => ({
    id: entry.id,
    token: entry.token,
    patientId: entry.patient.id,
    patientName: `${entry.patient.firstName} ${entry.patient.lastName ?? ""}`.trim(),
    patientMrn: entry.patient.mrn,
    age: ageFrom(entry.patient.dateOfBirth, entry.patient.approximateAge),
    gender: entry.patient.gender,
    status: entry.status as QueueRow["status"],
    priority: entry.priority as QueueRow["priority"],
    // Recomputed from the clock rather than trusting the stored value, so a
    // wait time never looks frozen on a page that has been open a while.
    waitMinutes:
      entry.status === "IN_CONSULTATION" ? 0 : minutesSince(entry.joinedAt),
    reason: entry.appointment?.reason ?? null,
    isFollowUp: entry.appointment?.type === "FOLLOW_UP",
    allergyCount: entry.patient._count.allergies,
  }));

  const waiting = queueRows.filter((r) => r.status === "WAITING" || r.status === "VITALS");
  const inConsultation = queueRows.filter((r) => r.status === "IN_CONSULTATION");
  const completed = entries.filter((e) => e.status === "COMPLETED").length;

  const [appointments, followUpsDue, newPatients, firstAppointment] =
    await Promise.all([
      prisma.appointment.findMany({
        where: {
          doctorId,
          organizationId: actor.organizationId,
          scheduledStart: { gte: start, lt: end },
        },
        select: {
          id: true,
          scheduledStart: true,
          status: true,
          type: true,
          reason: true,
          patient: { select: { firstName: true, lastName: true, mrn: true } },
        },
        orderBy: { scheduledStart: "asc" },
      }),
      prisma.followUp.count({
        where: {
          doctorId,
          organizationId: actor.organizationId,
          status: { in: ["PENDING", "SCHEDULED"] },
          dueDate: { lt: end },
        },
      }),
      prisma.visit.count({
        where: {
          doctorId,
          organizationId: actor.organizationId,
          startedAt: { gte: start, lt: end },
          patient: { createdAt: { gte: start } },
        },
      }),
      prisma.appointment.findFirst({
        where: {
          doctorId,
          organizationId: actor.organizationId,
          scheduledStart: { gte: start, lt: end },
        },
        orderBy: { scheduledStart: "asc" },
        select: { scheduledStart: true },
      }),
    ]);

  const now = Date.now();
  const nextAppointmentId = appointments.find(
    (a) => a.scheduledStart.getTime() > now && a.status === "SCHEDULED",
  )?.id;

  const schedule: ScheduleRow[] = appointments.map((a) => ({
    id: a.id,
    time: a.scheduledStart,
    patientName: `${a.patient.firstName} ${a.patient.lastName ?? ""}`.trim(),
    patientMrn: a.patient.mrn,
    status: a.status,
    type: a.type,
    reason: a.reason,
    isNext: a.id === nextAppointmentId,
  }));

  // Operational pulse — measurable rules only (spec §17).
  const threshold = doctor.department?.waitThresholdMinutes ?? 20;
  const capacity = doctor.department?.queueCapacity ?? 5;
  const waits = waiting.map((r) => r.waitMinutes);
  const longestWait = waits.length ? Math.max(...waits) : 0;
  const averageWait = waits.length
    ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
    : 0;

  let pulseState: DashboardData["pulse"]["state"] = "NORMAL";
  let pulseReason = "Wait times are within the configured threshold.";

  if (longestWait > threshold || waiting.length > capacity) {
    pulseState = "ATTENTION";
    pulseReason =
      longestWait > threshold
        ? `Longest wait is ${longestWait} min against a ${threshold} min threshold.`
        : `${waiting.length} patients waiting against a capacity of ${capacity}.`;
  } else if (longestWait > threshold * 0.7 || waiting.length >= capacity) {
    pulseState = "BUSY";
    pulseReason = "Queue is building but still inside operating limits.";
  }

  const next = waiting[0] ?? null;

  return {
    doctor: {
      id: doctor.id,
      name: doctor.user.name,
      department: doctor.department?.name ?? null,
      room: queue?.roomLabel ?? null,
      counter: queue?.counterLabel ?? null,
      online: doctor.online,
    },
    metrics: {
      total: entries.length,
      waiting: waiting.length,
      inConsultation: inConsultation.length,
      completed,
      followUpsDue,
      newPatients,
    },
    flow: {
      REGISTERED: entries.filter((e) => e.status === "WAITING" && !e.vitalsAt).length,
      WAITING: waiting.filter((r) => r.status === "WAITING").length,
      VITALS: waiting.filter((r) => r.status === "VITALS").length,
      WITH_DOCTOR: inConsultation.length,
      COMPLETED: completed,
      FOLLOW_UP: followUpsDue,
    },
    queue: queueRows,
    schedule,
    pulse: {
      state: pulseState,
      reason: pulseReason,
      longestWaitMinutes: longestWait,
      averageWaitMinutes: averageWait,
      threshold,
    },
    nextPatient: next
      ? { queueEntryId: next.id, patientName: next.patientName, token: next.token }
      : null,
    brief: {
      appointments: appointments.length,
      followUps: followUpsDue,
      newPatients,
      firstAppointment: firstAppointment?.scheduledStart ?? null,
    },
  };
}
