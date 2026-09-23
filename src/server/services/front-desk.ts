import "server-only";
import type {
  AppointmentStatus,
  AppointmentType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { addDays, startOfDay } from "@/server/rules/appointments";

/**
 * Spec §13 — Front Desk Mode.
 *
 * The desk's day is arrivals: who is expected, who is here, who is still to
 * come. Doctor availability comes from the queue boards alongside this.
 */

export interface ArrivalRow {
  appointmentId: string;
  time: Date;
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string | null;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  token: string | null;
  /** Still expected, and more than the grace period past their time. */
  late: boolean;
  /** The time has passed, so a no-show can be recorded. */
  due: boolean;
}

/** How late a booked patient can be before the desk sees it flagged. */
const LATE_AFTER_MS = 15 * 60_000;

export interface FrontDeskDay {
  arrivals: ArrivalRow[];
  counts: {
    /** Booked for today, not counting cancelled or moved appointments. */
    expected: number;
    /** Here now or already seen. */
    arrived: number;
    /** Booked, not here yet, and the time has not passed by much. */
    stillToCome: number;
    /** Registered today, at any desk. */
    registered: number;
  };
}

/** Arrived means the desk has already dealt with them. */
const ARRIVED: readonly AppointmentStatus[] = [
  "CHECKED_IN",
  "WAITING",
  "IN_CONSULTATION",
  "COMPLETED",
];

export async function getFrontDeskDay(actor: RequestActor): Promise<FrontDeskDay> {
  assertPermission(actor, Permission.APPOINTMENT_READ);

  const start = startOfDay(new Date());
  const end = addDays(start, 1);

  const [appointments, registered] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...tenantScope(actor),
        scheduledStart: { gte: start, lt: end },
        status: { notIn: ["CANCELLED", "RESCHEDULED"] },
      },
      orderBy: { scheduledStart: "asc" },
      // A busy OPD books a few hundred a day; this is the day, not a history.
      take: 500,
      select: {
        id: true,
        scheduledStart: true,
        status: true,
        type: true,
        reason: true,
        doctorId: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            phone: true,
          },
        },
        doctor: { select: { user: { select: { name: true } } } },
        queueEntry: { select: { token: true } },
      },
    }),
    prisma.patient.count({
      where: { ...tenantScope(actor), createdAt: { gte: start, lt: end } },
    }),
  ]);

  const now = Date.now();
  const arrived = appointments.filter((a) => ARRIVED.includes(a.status)).length;
  const stillToCome = appointments.filter((a) => a.status === "SCHEDULED").length;

  return {
    arrivals: appointments.map((a) => ({
      appointmentId: a.id,
      time: a.scheduledStart,
      status: a.status,
      type: a.type,
      reason: a.reason,
      patientId: a.patient.id,
      patientName: `${a.patient.firstName} ${a.patient.lastName ?? ""}`.trim(),
      patientMrn: a.patient.mrn,
      patientPhone: a.patient.phone,
      doctorId: a.doctorId,
      doctorName: a.doctor.user.name,
      token: a.queueEntry?.token ?? null,
      late:
        a.status === "SCHEDULED" &&
        a.scheduledStart.getTime() < now - LATE_AFTER_MS,
      due: a.scheduledStart.getTime() < now,
    })),
    counts: {
      expected: appointments.length,
      arrived,
      stillToCome,
      registered,
    },
  };
}

export interface DoctorChoice {
  id: string;
  name: string;
  department: string | null;
  online: boolean;
  acceptsWalkIns: boolean;
}

/** The doctors a desk can book or queue for. */
export async function listBookableDoctors(
  actor: RequestActor,
): Promise<DoctorChoice[]> {
  assertPermission(actor, Permission.APPOINTMENT_READ);

  const doctors = await prisma.doctorProfile.findMany({
    where: {
      facility: { organizationId: actor.organizationId },
      user: { active: true },
    },
    orderBy: [{ online: "desc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      online: true,
      acceptsWalkIns: true,
      user: { select: { name: true } },
      department: { select: { name: true } },
    },
  });

  return doctors.map((d) => ({
    id: d.id,
    name: d.user.name,
    department: d.department?.name ?? null,
    online: d.online,
    acceptsWalkIns: d.acceptsWalkIns,
  }));
}
