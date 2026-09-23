import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type {
  AppointmentStatus,
  AppointmentType,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { sendTemplatedMessage } from "./communication";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §11 — appointment management.
 *
 * The lifecycle is Scheduled → Checked In → Waiting → In Consultation →
 * Completed, with Cancelled, No Show and Rescheduled as exits. Every move is a
 * transaction that carries the appointment, whatever it is linked to (a queue
 * entry, a visit, a follow-up) and the audit entry together.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Statuses that still occupy a slot in the doctor's day. */
const ACTIVE_STATUSES: readonly AppointmentStatus[] = [
  "SCHEDULED",
  "CHECKED_IN",
  "WAITING",
  "IN_CONSULTATION",
];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday-first week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const weekday = (d.getDay() + 6) % 7;
  return addDays(d, -weekday);
}

function atMinute(day: Date, minute: number): Date {
  const d = startOfDay(day);
  d.setMinutes(minute);
  return d;
}

export interface AppointmentRow {
  id: string;
  start: Date;
  end: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string | null;
  notes: string | null;
  source: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  patientPhone: string;
  age: number | null;
  gender: string;
  /** Present once the patient has been given a token. */
  token: string | null;
  visitId: string | null;
  /** True for the next appointment still to happen today. */
  isNext: boolean;
}

export interface DayColumn {
  date: Date;
  isToday: boolean;
  /** Availability windows for this weekday, as minutes from midnight. */
  windows: { startMinute: number; endMinute: number; label: string | null }[];
  appointments: AppointmentRow[];
  booked: number;
  capacity: number;
}

export interface ScheduleView {
  doctor: {
    id: string;
    name: string;
    department: string | null;
    consultationMinutes: number;
    acceptsWalkIns: boolean;
  };
  view: "day" | "week";
  anchor: Date;
  days: DayColumn[];
  /** Counts across the whole range shown. */
  summary: {
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    noShow: number;
    checkedIn: number;
    /** Spec §16 — no-show rate over the range. */
    noShowRate: number;
  };
}

function ageOf(dateOfBirth: Date | null, approximateAge: number | null) {
  if (approximateAge !== null) return approximateAge;
  if (!dateOfBirth) return null;
  return Math.floor(
    (Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
}

const appointmentSelect = {
  id: true,
  scheduledStart: true,
  scheduledEnd: true,
  durationMinutes: true,
  status: true,
  type: true,
  reason: true,
  notes: true,
  source: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mrn: true,
      phone: true,
      dateOfBirth: true,
      approximateAge: true,
      gender: true,
    },
  },
  queueEntry: { select: { token: true } },
  visit: { select: { id: true } },
} satisfies Prisma.AppointmentSelect;

type AppointmentRecord = Prisma.AppointmentGetPayload<{
  select: typeof appointmentSelect;
}>;

function toRow(a: AppointmentRecord, nextId: string | null): AppointmentRow {
  return {
    id: a.id,
    start: a.scheduledStart,
    end: a.scheduledEnd,
    durationMinutes: a.durationMinutes,
    status: a.status,
    type: a.type,
    reason: a.reason,
    notes: a.notes,
    source: a.source,
    patientId: a.patient.id,
    patientName: `${a.patient.firstName} ${a.patient.lastName ?? ""}`.trim(),
    patientMrn: a.patient.mrn,
    patientPhone: a.patient.phone,
    age: ageOf(a.patient.dateOfBirth, a.patient.approximateAge),
    gender: a.patient.gender,
    token: a.queueEntry?.token ?? null,
    visitId: a.visit?.id ?? null,
    isNext: a.id === nextId,
  };
}

/**
 * Spec §11 — the doctor's schedule, as a day or a week.
 *
 * Availability windows come back alongside the appointments so the view can
 * show the shape of the day — when the doctor is actually in clinic — rather
 * than an undifferentiated 24-hour grid.
 */
export async function getSchedule(
  actor: RequestActor,
  doctorId: string,
  options: { date?: Date; view?: "day" | "week" } = {},
): Promise<ScheduleView> {
  assertPermission(actor, Permission.APPOINTMENT_READ);

  const view = options.view ?? "day";
  const anchor = startOfDay(options.date ?? new Date());
  const rangeStart = view === "week" ? startOfWeek(anchor) : anchor;
  const dayCount = view === "week" ? 7 : 1;
  const rangeEnd = addDays(rangeStart, dayCount);

  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    select: {
      id: true,
      consultationMinutes: true,
      acceptsWalkIns: true,
      user: { select: { name: true } },
      department: { select: { name: true } },
      availability: {
        select: {
          dayOfWeek: true,
          startMinute: true,
          endMinute: true,
          isBlock: true,
          label: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
    },
  });

  if (!doctor) throw notFound("Doctor");

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      ...tenantScope(actor),
      scheduledStart: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { scheduledStart: "asc" },
    select: appointmentSelect,
  });

  const now = Date.now();
  const nextId =
    appointments.find(
      (a) => a.scheduledStart.getTime() > now && a.status === "SCHEDULED",
    )?.id ?? null;

  const today = startOfDay(new Date()).getTime();

  const days: DayColumn[] = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(rangeStart, i);
    const weekday = date.getDay();

    const windows = doctor.availability
      .filter((slot) => {
        if (slot.dayOfWeek !== weekday || slot.isBlock) return false;
        if (slot.effectiveFrom && slot.effectiveFrom > date) return false;
        if (slot.effectiveTo && slot.effectiveTo < date) return false;
        return true;
      })
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((slot) => ({
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        label: slot.label,
      }));

    const dayAppointments = appointments.filter(
      (a) =>
        a.scheduledStart >= date && a.scheduledStart < addDays(date, 1),
    );

    const minutesAvailable = windows.reduce(
      (sum, w) => sum + (w.endMinute - w.startMinute),
      0,
    );

    return {
      date,
      isToday: date.getTime() === today,
      windows,
      appointments: dayAppointments.map((a) => toRow(a, nextId)),
      booked: dayAppointments.filter((a) =>
        ACTIVE_STATUSES.includes(a.status),
      ).length,
      capacity: Math.floor(minutesAvailable / doctor.consultationMinutes),
    };
  });

  const count = (status: AppointmentStatus) =>
    appointments.filter((a) => a.status === status).length;

  const noShow = count("NO_SHOW");
  const completed = count("COMPLETED");
  const settled = noShow + completed;

  return {
    doctor: {
      id: doctor.id,
      name: doctor.user.name,
      department: doctor.department?.name ?? null,
      consultationMinutes: doctor.consultationMinutes,
      acceptsWalkIns: doctor.acceptsWalkIns,
    },
    view,
    anchor,
    days,
    summary: {
      total: appointments.length,
      scheduled: count("SCHEDULED"),
      completed,
      cancelled: count("CANCELLED"),
      noShow,
      checkedIn: count("CHECKED_IN") + count("WAITING") + count("IN_CONSULTATION"),
      noShowRate: settled ? Math.round((noShow / settled) * 100) : 0,
    },
  };
}

export interface SlotOption {
  start: Date;
  end: Date;
  available: boolean;
  /** Why the slot cannot be used, when it cannot. */
  reason: string | null;
}

/**
 * Spec §11 — bookable slots for one day, derived from recurring availability.
 *
 * Availability is the source of truth for when a doctor is in clinic; a slot
 * exists only inside a window, is removed by a block, and is taken by any
 * appointment that has not been cancelled.
 */
export async function getAvailableSlots(
  actor: RequestActor,
  doctorId: string,
  date: Date,
): Promise<SlotOption[]> {
  assertPermission(actor, Permission.APPOINTMENT_READ);

  const day = startOfDay(date);
  const weekday = day.getDay();

  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    select: {
      consultationMinutes: true,
      availability: {
        where: { dayOfWeek: weekday },
        select: {
          startMinute: true,
          endMinute: true,
          isBlock: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
    },
  });

  if (!doctor) throw notFound("Doctor");

  const applicable = doctor.availability.filter((slot) => {
    if (slot.effectiveFrom && slot.effectiveFrom > day) return false;
    if (slot.effectiveTo && slot.effectiveTo < day) return false;
    return true;
  });

  const windows = applicable.filter((s) => !s.isBlock);
  const blocks = applicable.filter((s) => s.isBlock);

  const taken = await prisma.appointment.findMany({
    where: {
      doctorId,
      ...tenantScope(actor),
      scheduledStart: { gte: day, lt: addDays(day, 1) },
      status: { in: [...ACTIVE_STATUSES, "COMPLETED"] },
    },
    select: { scheduledStart: true, scheduledEnd: true },
  });

  const step = doctor.consultationMinutes;
  const now = Date.now();
  const slots: SlotOption[] = [];

  for (const window of windows.sort((a, b) => a.startMinute - b.startMinute)) {
    for (
      let minute = window.startMinute;
      minute + step <= window.endMinute;
      minute += step
    ) {
      const start = atMinute(day, minute);
      const end = atMinute(day, minute + step);

      const blocked = blocks.some(
        (b) => minute < b.endMinute && minute + step > b.startMinute,
      );
      const clash = taken.some(
        (a) => start < a.scheduledEnd && end > a.scheduledStart,
      );

      slots.push({
        start,
        end,
        available: !blocked && !clash && start.getTime() > now,
        reason: blocked
          ? "Blocked"
          : clash
            ? "Booked"
            : start.getTime() <= now
              ? "Past"
              : null,
      });
    }
  }

  return slots;
}

export interface BookInput {
  patientId: string;
  doctorId: string;
  start: Date;
  durationMinutes?: number;
  type?: AppointmentType;
  reason?: string | null;
  notes?: string | null;
  /** Send the confirmation message. Default true (spec §14). */
  notify?: boolean;
}

export interface BookResult {
  appointmentId: string;
  start: Date;
  patientName: string;
  notified: boolean;
}

/**
 * Spec §11 — book an appointment.
 *
 * The overlap check and the insert are in one transaction. Two receptionists
 * booking the same slot at the same moment is the case this exists for: the
 * second one reads the first one's row and is refused.
 */
export async function bookAppointment(
  actor: RequestActor,
  input: BookInput,
): Promise<BookResult> {
  assertPermission(actor, Permission.APPOINTMENT_CREATE);

  const [patient, doctor] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: input.patientId, ...tenantScope(actor), active: true },
      select: { id: true, firstName: true, lastName: true, mrn: true },
    }),
    prisma.doctorProfile.findFirst({
      where: {
        id: input.doctorId,
        facility: { organizationId: actor.organizationId },
      },
      select: {
        id: true,
        facilityId: true,
        departmentId: true,
        consultationMinutes: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  if (!patient) throw notFound("Patient");
  if (!doctor) throw notFound("Doctor");

  const duration = input.durationMinutes ?? doctor.consultationMinutes;

  if (duration < 5 || duration > 240) {
    throw new ServiceError(
      "VALIDATION",
      "An appointment must be between 5 and 240 minutes.",
    );
  }

  const start = new Date(input.start);
  const end = new Date(start.getTime() + duration * 60_000);

  if (start.getTime() < Date.now() - 60_000) {
    throw invalidState(
      "That time has already passed.",
      "Pick a later slot, or register the patient as a walk-in.",
    );
  }

  const appointmentId = await prisma.$transaction(async (tx) => {
    const clash = await tx.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        organizationId: actor.organizationId,
        status: { in: [...ACTIVE_STATUSES] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: {
        scheduledStart: true,
        patient: { select: { firstName: true } },
      },
    });

    if (clash) {
      throw new ServiceError(
        "CONFLICT",
        `${doctor.user.name} already has ${clash.patient.firstName} at ${formatTime(clash.scheduledStart)}.`,
        "Choose another slot.",
      );
    }

    const created = await tx.appointment.create({
      data: {
        organizationId: actor.organizationId,
        facilityId: doctor.facilityId,
        departmentId: doctor.departmentId,
        patientId: patient.id,
        doctorId: doctor.id,
        scheduledStart: start,
        scheduledEnd: end,
        durationMinutes: duration,
        type: input.type ?? "NEW_CONSULTATION",
        status: "SCHEDULED",
        source: actor.role === "DOCTOR" ? "DOCTOR" : "FRONT_DESK",
        reason: input.reason?.trim() || null,
        notes: input.notes?.trim() || null,
      },
      select: { id: true },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_CREATED",
      entityType: "Appointment",
      entityId: created.id,
      summary: `Booked appointment · Patient ${patient.mrn}`,
      metadata: {
        patientMrn: patient.mrn,
        doctorId: doctor.id,
        scheduledStart: start.toISOString(),
      },
    });

    return created.id;
  }, TX_OPTIONS);

  // Spec §14 — the confirmation goes out after the booking is committed, so a
  // gateway problem can never roll back a real appointment.
  let notified = false;
  if (input.notify !== false) {
    const result = await sendTemplatedMessage(actor, {
      patientId: patient.id,
      templateKey: "appointment_confirmation",
      channel: "WHATSAPP",
      appointmentId,
      variables: {
        patientName: patient.firstName,
        doctorName: doctor.user.name,
        appointmentDate: formatDate(start),
        appointmentTime: formatTime(start),
      },
    });
    notified = result?.status !== "FAILED" && result !== null;
  }

  return {
    appointmentId,
    start,
    patientName: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
    notified,
  };
}

/** Loads an appointment and proves it belongs to the actor's organization. */
async function loadAppointment(actor: RequestActor, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...tenantScope(actor) },
    select: {
      id: true,
      organizationId: true,
      facilityId: true,
      departmentId: true,
      doctorId: true,
      patientId: true,
      scheduledStart: true,
      scheduledEnd: true,
      durationMinutes: true,
      type: true,
      status: true,
      reason: true,
      notes: true,
      patient: { select: { firstName: true, lastName: true, mrn: true } },
      doctor: {
        select: {
          tokenPrefix: true,
          consultationMinutes: true,
          user: { select: { name: true } },
        },
      },
      facility: { select: { phone: true, name: true } },
      queueEntry: { select: { id: true } },
    },
  });

  if (!appointment) throw notFound("Appointment");
  return appointment;
}

/**
 * Spec §11 — move an appointment.
 *
 * The original is kept and marked RESCHEDULED, pointing at its replacement, so
 * the patient's history shows that the visit moved rather than that it
 * vanished.
 */
export async function rescheduleAppointment(
  actor: RequestActor,
  appointmentId: string,
  newStart: Date,
  reason?: string,
): Promise<BookResult> {
  assertPermission(actor, Permission.APPOINTMENT_UPDATE);

  const existing = await loadAppointment(actor, appointmentId);

  if (!ACTIVE_STATUSES.includes(existing.status)) {
    throw invalidState(
      `A ${existing.status.toLowerCase().replace("_", " ")} appointment cannot be moved.`,
      "Book a new appointment instead.",
    );
  }

  if (existing.status !== "SCHEDULED") {
    throw invalidState(
      "This patient has already arrived.",
      "Use the queue to manage them from here.",
    );
  }

  const start = new Date(newStart);
  const end = new Date(start.getTime() + existing.durationMinutes * 60_000);

  if (start.getTime() < Date.now() - 60_000) {
    throw invalidState("That time has already passed.", "Pick a later slot.");
  }

  const newId = await prisma.$transaction(async (tx) => {
    const clash = await tx.appointment.findFirst({
      where: {
        doctorId: existing.doctorId,
        organizationId: actor.organizationId,
        id: { not: existing.id },
        status: { in: [...ACTIVE_STATUSES] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: { scheduledStart: true },
    });

    if (clash) {
      throw new ServiceError(
        "CONFLICT",
        `That slot is taken at ${formatTime(clash.scheduledStart)}.`,
        "Choose another time.",
      );
    }

    const replacement = await tx.appointment.create({
      data: {
        organizationId: existing.organizationId,
        facilityId: existing.facilityId,
        departmentId: existing.departmentId,
        patientId: existing.patientId,
        doctorId: existing.doctorId,
        scheduledStart: start,
        scheduledEnd: end,
        durationMinutes: existing.durationMinutes,
        type: existing.type,
        status: "SCHEDULED",
        source: actor.role === "DOCTOR" ? "DOCTOR" : "FRONT_DESK",
        reason: existing.reason,
        notes: reason?.trim() || existing.notes,
      },
      select: { id: true },
    });

    await tx.appointment.update({
      where: { id: existing.id },
      data: {
        status: "RESCHEDULED",
        rescheduledToId: replacement.id,
      },
    });

    // A follow-up that pointed at the old appointment follows the patient.
    await tx.followUp.updateMany({
      where: { appointmentId: existing.id },
      data: { appointmentId: replacement.id, dueDate: start },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Appointment",
      entityId: existing.id,
      summary: `Rescheduled appointment · Patient ${existing.patient.mrn}`,
      metadata: {
        patientMrn: existing.patient.mrn,
        from: existing.scheduledStart.toISOString(),
        to: start.toISOString(),
        replacementId: replacement.id,
      },
    });

    return replacement.id;
  }, TX_OPTIONS);

  const notified = await sendTemplatedMessage(actor, {
    patientId: existing.patientId,
    templateKey: "appointment_confirmation",
    channel: "WHATSAPP",
    appointmentId: newId,
    variables: {
      patientName: existing.patient.firstName,
      doctorName: existing.doctor.user.name,
      appointmentDate: formatDate(start),
      appointmentTime: formatTime(start),
    },
  });

  return {
    appointmentId: newId,
    start,
    patientName: `${existing.patient.firstName} ${existing.patient.lastName ?? ""}`.trim(),
    notified: notified?.status !== "FAILED" && notified !== null,
  };
}

/** Spec §11 — cancel, with the reason kept on the record. */
export async function cancelAppointment(
  actor: RequestActor,
  appointmentId: string,
  reason?: string,
): Promise<{ patientName: string; notified: boolean }> {
  assertPermission(actor, Permission.APPOINTMENT_CANCEL);

  const existing = await loadAppointment(actor, appointmentId);

  if (existing.status === "CANCELLED") {
    throw invalidState("This appointment is already cancelled.");
  }
  if (existing.status === "COMPLETED") {
    throw invalidState("A completed appointment cannot be cancelled.");
  }
  if (existing.status === "IN_CONSULTATION") {
    throw invalidState(
      "This patient is with the doctor.",
      "Complete the consultation instead.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() || null,
      },
    });

    // The token goes with the appointment — an empty slot in the queue helps
    // nobody.
    if (existing.queueEntry) {
      await tx.queueEntry.update({
        where: { id: existing.queueEntry.id },
        data: { status: "LEFT" },
      });
    }

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Appointment",
      entityId: existing.id,
      summary: `Cancelled appointment · Patient ${existing.patient.mrn}`,
      metadata: {
        patientMrn: existing.patient.mrn,
        scheduledStart: existing.scheduledStart.toISOString(),
      },
    });
  }, TX_OPTIONS);

  const notified = await sendTemplatedMessage(actor, {
    patientId: existing.patientId,
    templateKey: "appointment_cancelled",
    channel: "SMS",
    appointmentId: existing.id,
    variables: {
      doctorName: existing.doctor.user.name,
      appointmentDate: formatDate(existing.scheduledStart),
      facilityPhone: existing.facility.phone ?? existing.facility.name,
    },
  });

  return {
    patientName: `${existing.patient.firstName} ${existing.patient.lastName ?? ""}`.trim(),
    notified: notified?.status !== "FAILED" && notified !== null,
  };
}

export interface CheckInResult {
  token: string;
  patientName: string;
  position: number;
  notified: boolean;
}

/**
 * Spec §11 + §12 — the patient has arrived.
 *
 * Check-in is where the appointment module hands over to the queue: the
 * appointment becomes a token. Both happen in one transaction, because an
 * appointment marked checked-in with no token is a patient nobody will call.
 */
export async function checkInAppointment(
  actor: RequestActor,
  appointmentId: string,
): Promise<CheckInResult> {
  assertPermission(actor, Permission.QUEUE_MANAGE);

  const appointment = await loadAppointment(actor, appointmentId);

  if (appointment.status !== "SCHEDULED") {
    throw invalidState(
      appointment.status === "CANCELLED"
        ? "This appointment was cancelled."
        : "This patient has already been checked in.",
      appointment.status === "CANCELLED"
        ? "Book a new appointment for them."
        : "Find their token on the queue board.",
    );
  }

  const day = startOfDay(appointment.scheduledStart);
  const today = startOfDay(new Date());

  if (day.getTime() !== today.getTime()) {
    throw invalidState(
      "This appointment is not for today.",
      "Reschedule it to today before checking the patient in.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const queue = await tx.queue.upsert({
      where: { doctorId_date: { doctorId: appointment.doctorId, date: day } },
      create: {
        organizationId: actor.organizationId,
        facilityId: appointment.facilityId,
        departmentId: appointment.departmentId,
        doctorId: appointment.doctorId,
        date: day,
        tokenPrefix: appointment.doctor.tokenPrefix,
      },
      update: {},
      select: { id: true, tokenPrefix: true },
    });

    // Next token and next position, read inside the transaction. The unique
    // index on (queueId, token) is the real guard; this is the fast path.
    const last = await tx.queueEntry.findFirst({
      where: { queueId: queue.id },
      orderBy: { tokenSeq: "desc" },
      select: { tokenSeq: true, position: true },
    });

    const tokenSeq = (last?.tokenSeq ?? 0) + 1;
    const token = `${queue.tokenPrefix}${String(tokenSeq).padStart(3, "0")}`;
    const now = new Date();

    await tx.queueEntry.create({
      data: {
        queueId: queue.id,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        token,
        tokenSeq,
        status: "WAITING",
        priority: "NORMAL",
        position: (last?.position ?? 0) + 1,
        joinedAt: now,
      },
    });

    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "CHECKED_IN", checkedInAt: now },
    });

    const ahead = await tx.queueEntry.count({
      where: { queueId: queue.id, status: { in: ["WAITING", "VITALS"] } },
    });

    // What a patient-facing display would be showing right now (spec §12).
    const current = await tx.queueEntry.findFirst({
      where: { queueId: queue.id, status: { in: ["CALLED", "IN_CONSULTATION"] } },
      select: { token: true },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Appointment",
      entityId: appointment.id,
      summary: `Checked in · token ${token} · Patient ${appointment.patient.mrn}`,
      metadata: { token, patientMrn: appointment.patient.mrn },
    });

    return { token, position: ahead, currentToken: current?.token ?? null };
  }, TX_OPTIONS);

  // Spec §12 — the token message carries the wait, which is the only part the
  // patient actually wants.
  const notified = await sendTemplatedMessage(actor, {
    patientId: appointment.patientId,
    templateKey: "token_generated",
    channel: "SMS",
    appointmentId: appointment.id,
    variables: {
      token: result.token,
      currentToken: result.currentToken ?? "—",
      waitMinutes: String(
        Math.max(0, result.position - 1) * appointment.doctor.consultationMinutes,
      ),
    },
  });

  return {
    token: result.token,
    position: result.position,
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName ?? ""}`.trim(),
    notified: notified?.status !== "FAILED" && notified !== null,
  };
}

/** Spec §11 — no-show tracking. */
export async function markNoShow(
  actor: RequestActor,
  appointmentId: string,
): Promise<{ patientName: string }> {
  assertPermission(actor, Permission.APPOINTMENT_UPDATE);

  const appointment = await loadAppointment(actor, appointmentId);

  if (appointment.status === "NO_SHOW") {
    throw invalidState("This appointment is already marked as a no show.");
  }
  if (appointment.status === "COMPLETED") {
    throw invalidState("This patient was seen.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "NO_SHOW" },
    });

    if (appointment.queueEntry) {
      await tx.queueEntry.update({
        where: { id: appointment.queueEntry.id },
        data: { status: "SKIPPED" },
      });
    }

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Appointment",
      entityId: appointment.id,
      summary: `Marked no show · Patient ${appointment.patient.mrn}`,
      metadata: { patientMrn: appointment.patient.mrn },
    });
  }, TX_OPTIONS);

  return {
    patientName: `${appointment.patient.firstName} ${appointment.patient.lastName ?? ""}`.trim(),
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
