import "server-only";
import type { FollowUpStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { bookAppointment, startOfDay } from "./appointments";
import { writeAudit } from "./audit";
import { sendTemplatedMessage } from "./communication";
import { ServiceError, invalidState, notFound } from "./errors";
import { hasAddOn } from "./features";
import { fireTrigger } from "./workflows";

/**
 * Spec §42 — the smart follow-up queue.
 *
 * A follow-up is a promise the doctor made to a patient. The screen's job is
 * to make the broken ones visible: overdue first, then today, then what is
 * coming. Everything else is secondary.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Follow-ups that still need something to happen. */
const OPEN_STATUSES: readonly FollowUpStatus[] = ["PENDING", "SCHEDULED"];

export interface FollowUpRow {
  id: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  phone: string;
  age: number | null;
  dueDate: Date;
  /** Negative when overdue, 0 today, positive when upcoming. */
  daysUntilDue: number;
  reason: string | null;
  notes: string | null;
  status: FollowUpStatus;
  reminderSentAt: Date | null;
  /** The visit this follow-up was promised at. */
  visitId: string | null;
  lastVisitAt: Date | null;
  /** Set once the return visit is actually on the calendar. */
  appointmentId: string | null;
  appointmentAt: Date | null;
}

export interface ReactivationRow {
  patientId: string;
  patientName: string;
  patientMrn: string;
  phone: string;
  lastVisitAt: Date | null;
  missedOn: Date;
  reason: string | null;
  followUpId: string;
}

export interface FollowUpBoard {
  /**
   * The follow-up add-on is not enabled: only what is due today or overdue is
   * loaded. Upcoming visits, reactivation and completion figures are not read.
   */
  limited: boolean;
  overdue: FollowUpRow[];
  dueToday: FollowUpRow[];
  upcoming: FollowUpRow[];
  /** Spec §42 — completed consultation, missed follow-up, nobody chased it. */
  reactivation: ReactivationRow[];
  counts: {
    open: number;
    overdue: number;
    dueToday: number;
    upcoming: number;
    completedThisMonth: number;
    /** Spec §16 — follow-up completion rate over the last 90 days. */
    completionRate: number;
  };
}

function ageOf(dateOfBirth: Date | null, approximateAge: number | null) {
  if (approximateAge !== null) return approximateAge;
  if (!dateOfBirth) return null;
  return Math.floor(
    (Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
}

function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  );
}

/**
 * Spec §42 — the whole follow-up picture for one doctor.
 *
 * `horizonDays` bounds "upcoming"; without it the list grows until it is not
 * a work queue any more.
 */
export async function getFollowUpBoard(
  actor: RequestActor,
  doctorId: string,
  horizonDays = 30,
): Promise<FollowUpBoard> {
  assertPermission(actor, Permission.FOLLOWUP_READ);

  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + horizonDays);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const limited = !(await hasAddOn(actor, "followUps"));

  const [open, missed, completedThisMonth, settledWindow] = await Promise.all([
    prisma.followUp.findMany({
      where: {
        doctorId,
        ...tenantScope(actor),
        status: { in: [...OPEN_STATUSES] },
        dueDate: { lt: limited ? tomorrow : horizon },
      },
      orderBy: { dueDate: "asc" },
      take: 200,
      select: followUpSelect,
    }),
    // Reactivation: due more than a week ago, never chased, never rebooked.
    limited ? [] : prisma.followUp.findMany({
      where: {
        doctorId,
        ...tenantScope(actor),
        status: "MISSED",
        appointmentId: null,
        dueDate: { gte: ninetyDaysAgo },
      },
      orderBy: { dueDate: "desc" },
      take: 25,
      select: followUpSelect,
    }),
    limited ? 0 : prisma.followUp.count({
      where: {
        doctorId,
        ...tenantScope(actor),
        status: "COMPLETED",
        completedAt: { gte: monthStart },
      },
    }),
    limited ? [] : prisma.followUp.groupBy({
      by: ["status"],
      where: {
        doctorId,
        ...tenantScope(actor),
        dueDate: { gte: ninetyDaysAgo, lt: tomorrow },
      },
      _count: { _all: true },
    }),
  ]);

  const now = new Date();
  const rows = open.map((f) => toRow(f, now));

  const overdue = rows.filter((r) => r.daysUntilDue < 0);
  const dueToday = rows.filter((r) => r.daysUntilDue === 0);
  const upcoming = rows.filter((r) => r.daysUntilDue > 0);

  const settledCount = (status: FollowUpStatus) =>
    settledWindow.find((s) => s.status === status)?._count._all ?? 0;

  const kept = settledCount("COMPLETED");
  const resolved = kept + settledCount("MISSED");

  return {
    limited,
    overdue,
    dueToday,
    upcoming,
    reactivation: missed.map((f) => ({
      patientId: f.patient.id,
      patientName: `${f.patient.firstName} ${f.patient.lastName ?? ""}`.trim(),
      patientMrn: f.patient.mrn,
      phone: f.patient.phone,
      lastVisitAt: f.patient.lastVisitAt,
      missedOn: f.dueDate,
      reason: f.reason,
      followUpId: f.id,
    })),
    counts: {
      open: rows.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      upcoming: upcoming.length,
      completedThisMonth,
      completionRate: resolved ? Math.round((kept / resolved) * 100) : 0,
    },
  };
}

const followUpSelect = {
  id: true,
  dueDate: true,
  reason: true,
  notes: true,
  status: true,
  reminderSentAt: true,
  visitId: true,
  appointmentId: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mrn: true,
      phone: true,
      dateOfBirth: true,
      approximateAge: true,
      lastVisitAt: true,
    },
  },
  appointment: { select: { scheduledStart: true, status: true } },
} as const;

type FollowUpRecord = {
  id: string;
  dueDate: Date;
  reason: string | null;
  notes: string | null;
  status: FollowUpStatus;
  reminderSentAt: Date | null;
  visitId: string | null;
  appointmentId: string | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string | null;
    mrn: string;
    phone: string;
    dateOfBirth: Date | null;
    approximateAge: number | null;
    lastVisitAt: Date | null;
  };
  appointment: { scheduledStart: Date; status: string } | null;
};

function toRow(f: FollowUpRecord, now: Date): FollowUpRow {
  return {
    id: f.id,
    patientId: f.patient.id,
    patientName: `${f.patient.firstName} ${f.patient.lastName ?? ""}`.trim(),
    patientMrn: f.patient.mrn,
    phone: f.patient.phone,
    age: ageOf(f.patient.dateOfBirth, f.patient.approximateAge),
    dueDate: f.dueDate,
    daysUntilDue: daysBetween(now, f.dueDate),
    reason: f.reason,
    notes: f.notes,
    status: f.status,
    reminderSentAt: f.reminderSentAt,
    visitId: f.visitId,
    lastVisitAt: f.patient.lastVisitAt,
    appointmentId: f.appointmentId,
    appointmentAt: f.appointment?.scheduledStart ?? null,
  };
}

/** Loads a follow-up inside the tenant boundary. */
async function loadFollowUp(actor: RequestActor, followUpId: string) {
  const followUp = await prisma.followUp.findFirst({
    where: { id: followUpId, ...tenantScope(actor) },
    select: {
      ...followUpSelect,
      doctorId: true,
      doctor: { select: { user: { select: { name: true } } } },
    },
  });

  if (!followUp) throw notFound("Follow-up");
  return followUp;
}

export interface CreateFollowUpInput {
  patientId: string;
  doctorId: string;
  dueDate: Date;
  reason?: string | null;
  notes?: string | null;
  visitId?: string | null;
}

/** Spec §42 — a follow-up is promised during a consultation. */
export async function createFollowUp(
  actor: RequestActor,
  input: CreateFollowUpInput,
): Promise<{ id: string; patientName: string; dueDate: Date }> {
  assertPermission(actor, Permission.FOLLOWUP_MANAGE);

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, ...tenantScope(actor), active: true },
    select: { id: true, firstName: true, lastName: true, mrn: true },
  });
  if (!patient) throw notFound("Patient");

  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      id: input.doctorId,
      facility: { organizationId: actor.organizationId },
    },
    select: { id: true },
  });
  if (!doctor) throw notFound("Doctor");

  const dueDate = startOfDay(input.dueDate);

  if (dueDate.getTime() < startOfDay(new Date()).getTime()) {
    throw new ServiceError(
      "VALIDATION",
      "A follow-up cannot be due in the past.",
      "Pick today or a later date.",
    );
  }

  const followUp = await prisma.$transaction(async (tx) => {
    const created = await tx.followUp.create({
      data: {
        organizationId: actor.organizationId,
        patientId: patient.id,
        doctorId: doctor.id,
        visitId: input.visitId ?? null,
        dueDate,
        reason: input.reason?.trim() || null,
        notes: input.notes?.trim() || null,
        status: "PENDING",
      },
      select: { id: true },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_CREATED",
      entityType: "FollowUp",
      entityId: created.id,
      summary: `Created follow-up · Patient ${patient.mrn}`,
      metadata: { patientMrn: patient.mrn, dueDate: dueDate.toISOString() },
    });

    return created;
  }, TX_OPTIONS);

  // Spec §28 — a reminder workflow waits on this and fires the day before.
  await fireTrigger(actor, "FOLLOW_UP_DUE", { type: "FollowUp", id: followUp.id });

  return {
    id: followUp.id,
    patientName: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
    dueDate,
  };
}

/** The patient came back — close the loop. */
export async function completeFollowUp(
  actor: RequestActor,
  followUpId: string,
): Promise<{ patientName: string }> {
  assertPermission(actor, Permission.FOLLOWUP_MANAGE);

  const followUp = await loadFollowUp(actor, followUpId);

  if (followUp.status === "COMPLETED") {
    throw invalidState("This follow-up is already closed.");
  }
  if (followUp.status === "CANCELLED") {
    throw invalidState(
      "This follow-up was cancelled.",
      "Create a new one if the patient still needs to return.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.followUp.update({
      where: { id: followUp.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "FollowUp",
      entityId: followUp.id,
      summary: `Completed follow-up · Patient ${followUp.patient.mrn}`,
      metadata: { patientMrn: followUp.patient.mrn },
    });
  }, TX_OPTIONS);

  return {
    patientName: `${followUp.patient.firstName} ${followUp.patient.lastName ?? ""}`.trim(),
  };
}

/** The patient no longer needs to return. */
export async function cancelFollowUp(
  actor: RequestActor,
  followUpId: string,
  reason?: string,
): Promise<{ patientName: string }> {
  assertPermission(actor, Permission.FOLLOWUP_MANAGE);

  const followUp = await loadFollowUp(actor, followUpId);

  if (followUp.status === "COMPLETED") {
    throw invalidState("This follow-up already happened.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.followUp.update({
      where: { id: followUp.id },
      data: {
        status: "CANCELLED",
        notes: reason?.trim() || followUp.notes,
      },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "FollowUp",
      entityId: followUp.id,
      summary: `Cancelled follow-up · Patient ${followUp.patient.mrn}`,
      metadata: { patientMrn: followUp.patient.mrn },
    });
  }, TX_OPTIONS);

  return {
    patientName: `${followUp.patient.firstName} ${followUp.patient.lastName ?? ""}`.trim(),
  };
}

/**
 * Spec §14 — one-tap follow-up reminder.
 *
 * The send goes through the communication service, so consent, address and
 * delivery tracking all behave exactly as they do for a hand-written message.
 */
export async function sendFollowUpReminder(
  actor: RequestActor,
  followUpId: string,
): Promise<{ patientName: string; status: string; failureReason: string | null }> {
  assertPermission(actor, Permission.FOLLOWUP_MANAGE);

  const followUp = await loadFollowUp(actor, followUpId);

  if (!OPEN_STATUSES.includes(followUp.status)) {
    throw invalidState(
      "This follow-up is closed, so a reminder would confuse the patient.",
    );
  }

  const when = followUp.appointment?.scheduledStart ?? followUp.dueDate;

  const result = await sendTemplatedMessage(actor, {
    patientId: followUp.patient.id,
    templateKey: "follow_up_reminder",
    channel: "WHATSAPP",
    appointmentId: followUp.appointmentId,
    variables: {
      patientName: followUp.patient.firstName,
      followUpDate: when.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      followUpTime: followUp.appointment
        ? when.toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        : "your usual clinic hours",
    },
  });

  if (!result) {
    throw invalidState(
      "The reminder could not be sent.",
      "Check that the patient accepts WhatsApp and has a valid mobile number.",
    );
  }

  if (result.status !== "FAILED") {
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: { reminderSentAt: new Date() },
    });
  }

  return {
    patientName: `${followUp.patient.firstName} ${followUp.patient.lastName ?? ""}`.trim(),
    status: result.status,
    failureReason: result.failureReason,
  };
}

/**
 * Turns a follow-up into a real appointment.
 *
 * The booking is delegated to the appointment service — conflict checking,
 * the confirmation message and the audit entry are all already correct there,
 * and a second implementation of them would drift.
 */
export async function scheduleFollowUp(
  actor: RequestActor,
  followUpId: string,
  start: Date,
): Promise<{ appointmentId: string; patientName: string; start: Date }> {
  assertPermission(actor, Permission.FOLLOWUP_MANAGE);

  const followUp = await loadFollowUp(actor, followUpId);

  if (followUp.appointmentId) {
    throw invalidState(
      "This follow-up is already on the calendar.",
      "Reschedule the appointment instead.",
    );
  }
  if (!OPEN_STATUSES.includes(followUp.status)) {
    throw invalidState("This follow-up is closed.");
  }

  const booking = await bookAppointment(actor, {
    patientId: followUp.patient.id,
    doctorId: followUp.doctorId,
    start,
    type: "FOLLOW_UP",
    reason: followUp.reason,
  });

  await prisma.$transaction(async (tx) => {
    await tx.followUp.update({
      where: { id: followUp.id },
      data: { status: "SCHEDULED", appointmentId: booking.appointmentId },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "FollowUp",
      entityId: followUp.id,
      summary: `Scheduled follow-up · Patient ${followUp.patient.mrn}`,
      metadata: {
        patientMrn: followUp.patient.mrn,
        appointmentId: booking.appointmentId,
      },
    });
  }, TX_OPTIONS);

  return {
    appointmentId: booking.appointmentId,
    patientName: booking.patientName,
    start: booking.start,
  };
}

/** Overdue + due today, for the sidebar badge. */
export async function countDueFollowUps(
  actor: RequestActor,
  doctorId: string,
): Promise<number> {
  const tomorrow = startOfDay(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);

  return prisma.followUp.count({
    where: {
      doctorId,
      ...tenantScope(actor),
      status: { in: [...OPEN_STATUSES] },
      dueDate: { lt: tomorrow },
    },
  });
}
