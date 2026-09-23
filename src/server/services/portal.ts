import "server-only";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { dispatch } from "@/lib/messaging";
import { canonicalPhone } from "@/lib/phone";
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  type PortalSession,
  codeMatches,
  generateCode,
  hashCode,
} from "@/lib/portal/tokens";
import { rateLimit } from "@/lib/security/rate-limit";
import { tokenStatusPath } from "@/lib/security/signed-link";
import {
  ACTIVE_STATUSES,
  addDays,
  appliesOn,
  assertCanCancel,
  buildSlots,
  isInPast,
  startOfDay,
} from "@/server/rules/appointments";
import { WAITING_STATUSES } from "@/server/rules/queue";
import { gatewayRoute } from "./communication";
import { ServiceError, invalidState, notFound } from "./errors";
import { automationActor, fireTrigger } from "./workflows";

/**
 * Spec §3 + §34 — the patient portal: sign in with a code sent to your
 * mobile, see and book appointments, follow your token, rate a visit.
 *
 * There is no staff actor here. Every function takes the organization and
 * patient from a verified portal session and scopes every query to exactly
 * them — a patient reaches their own records, and nobody else's.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) {
    throw new ServiceError("INVALID_STATE", "The portal is not configured.");
  }
  return value;
}

export async function portalOrganization(slug: string) {
  const organization = await prisma.organization.findFirst({
    where: { slug, active: true },
    select: { id: true, name: true, slug: true },
  });
  return organization;
}

/** Active patients in the organization whose mobile is this number. */
async function patientsWithPhone(organizationId: string, phone: string) {
  const lastTen = phone.replace(/\D/g, "").slice(-10);
  if (lastTen.length !== 10) return [];
  const candidates = await prisma.patient.findMany({
    where: { organizationId, active: true, phone: { contains: lastTen.slice(-4) } },
    select: { id: true, firstName: true, lastName: true, phone: true, mrn: true },
    take: 50,
  });
  return candidates.filter((p) => p.phone.replace(/\D/g, "").endsWith(lastTen));
}

/* --------------------------------- sign-in -------------------------------- */

/**
 * Sends a sign-in code. The answer is the same whether or not the number is
 * registered, so the form cannot be used to find out who is a patient here.
 *
 * `demoCode` is returned only when no real gateway carried the code and the
 * deployment has opted in with PORTAL_DEMO_CODES=true — so a demo can be
 * signed into, and a real deployment never shows a code on screen.
 */
export async function requestSignInCode(
  organizationId: string,
  organizationName: string,
  phoneInput: string,
  address: string,
): Promise<{ demoCode?: string }> {
  const phone = canonicalPhone(phoneInput);
  if (phone.replace(/\D/g, "").length < 10) {
    throw new ServiceError("VALIDATION", "Enter the mobile number you gave the clinic.");
  }

  const [byPhone, byAddress] = await Promise.all([
    rateLimit(`portal:code:phone:${organizationId}:${phone}`, { limit: 3, windowMs: 10 * 60_000 }),
    rateLimit(`portal:code:ip:${address}`, { limit: 20, windowMs: 10 * 60_000 }),
  ]);
  if (!byPhone.allowed || !byAddress.allowed) {
    const minutes = Math.ceil(Math.max(byPhone.retryAfter, byAddress.retryAfter) / 60);
    throw new ServiceError(
      "INVALID_STATE",
      `Too many codes asked for. Try again in ${minutes <= 1 ? "a minute" : `${minutes} minutes`}.`,
    );
  }

  const patients = await patientsWithPhone(organizationId, phone);
  if (patients.length === 0) return {};

  const code = generateCode();
  await prisma.$transaction([
    prisma.portalOtp.deleteMany({ where: { organizationId, phone } }),
    prisma.portalOtp.create({
      data: {
        organizationId,
        phone,
        codeHash: hashCode(code, phone, secret()),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    }),
  ]);

  // Sent straight to the gateway and never written to the message history:
  // a code in the inbox would be readable by staff.
  const body = `${code} is your ${organizationName} sign-in code. It expires in 10 minutes. Do not share it with anyone.`;
  const smsTemplate = await prisma.messageTemplate.findFirst({
    where: { organizationId, key: "portal_code", channel: "SMS", active: true },
    select: { providerTemplateId: true },
  });
  const smsRoute = await gatewayRoute(organizationId, "SMS");
  const whatsappRoute = smsRoute ? null : await gatewayRoute(organizationId, "WHATSAPP");
  const receipt = await dispatch(
    {
      channel: whatsappRoute ? "WHATSAPP" : "SMS",
      to: phone,
      subject: null,
      body,
      providerTemplateId: whatsappRoute ? null : (smsTemplate?.providerTemplateId ?? null),
      templateParameters: [{ name: "code", value: code }],
    },
    smsRoute ?? whatsappRoute,
  );

  if (receipt.status === "FAILED") {
    throw new ServiceError(
      "INVALID_STATE",
      "We could not send a code just now.",
      "Try again in a moment, or ask at the front desk.",
    );
  }

  return receipt.providerName === "simulated" && process.env.PORTAL_DEMO_CODES === "true"
    ? { demoCode: code }
    : {};
}

/** Checks a code; on success, the number is verified and the code is spent. */
export async function verifySignInCode(
  organizationId: string,
  phoneInput: string,
  code: string,
): Promise<{ phone: string; patientIds: string[] }> {
  const phone = canonicalPhone(phoneInput);
  const otp = await prisma.portalOtp.findFirst({
    where: { organizationId, phone, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!otp || otp.attempts >= MAX_CODE_ATTEMPTS) {
    throw invalidState("That code has expired.", "Ask for a new one.");
  }

  await prisma.portalOtp.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 } },
  });

  if (!codeMatches(code.trim(), phone, otp.codeHash, secret())) {
    const left = MAX_CODE_ATTEMPTS - otp.attempts - 1;
    throw new ServiceError(
      "VALIDATION",
      left > 0
        ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : "That code is not right, and it can no longer be used. Ask for a new one.",
    );
  }

  await prisma.portalOtp.deleteMany({ where: { organizationId, phone } });
  const patients = await patientsWithPhone(organizationId, phone);
  if (patients.length === 0) throw invalidState("This number is no longer registered here.");

  return { phone, patientIds: patients.map((p) => p.id) };
}

/**
 * The session, checked against the records on every request: the number must
 * still belong to the chosen patient, so a changed number or a removed
 * record ends access at once.
 */
export async function resolvePortal(session: PortalSession, organizationId: string) {
  if (session.o !== organizationId) return null;
  const patients = await patientsWithPhone(organizationId, session.p);
  if (patients.length === 0) return null;
  const patient = session.pid ? (patients.find((p) => p.id === session.pid) ?? null) : null;
  if (session.pid && !patient) return null;

  return {
    phone: session.p,
    patients: patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName ?? ""}`.trim(),
      mrn: p.mrn,
    })),
    patient: patient
      ? { id: patient.id, name: `${patient.firstName} ${patient.lastName ?? ""}`.trim(), firstName: patient.firstName }
      : null,
  };
}

/* ---------------------------------- home ---------------------------------- */

export interface PortalHome {
  token: {
    token: string;
    doctorName: string;
    statusPath: string | null;
  } | null;
  upcoming: {
    id: string;
    start: Date;
    doctorName: string;
    department: string | null;
    status: AppointmentStatus;
    canCancel: boolean;
  }[];
  followUps: { id: string; dueDate: Date; reason: string | null; doctorName: string }[];
  feedback: { id: string; visitDate: Date; doctorName: string }[];
  past: { id: string; start: Date; doctorName: string; status: AppointmentStatus }[];
}

export async function portalHome(organizationId: string, patientId: string): Promise<PortalHome> {
  const today = startOfDay(new Date());
  const now = new Date();

  const [token, upcoming, followUps, feedback, past] = await Promise.all([
    prisma.queueEntry.findFirst({
      where: {
        patientId,
        status: { in: [...WAITING_STATUSES, "CALLED", "IN_CONSULTATION"] },
        queue: { organizationId, date: today },
      },
      select: {
        id: true,
        token: true,
        queue: { select: { doctor: { select: { user: { select: { name: true } } } } } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        patientId,
        status: { in: [...ACTIVE_STATUSES] },
        scheduledStart: { gte: today },
      },
      orderBy: { scheduledStart: "asc" },
      take: 10,
      select: {
        id: true,
        scheduledStart: true,
        status: true,
        doctor: { select: { user: { select: { name: true } }, department: { select: { name: true } } } },
      },
    }),
    prisma.followUp.findMany({
      where: { organizationId, patientId, status: { in: ["PENDING", "SCHEDULED"] } },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: { id: true, dueDate: true, reason: true, doctor: { select: { user: { select: { name: true } } } } },
    }),
    prisma.feedback.findMany({
      where: { organizationId, patientId, respondedAt: null },
      orderBy: { requestedAt: "desc" },
      take: 3,
      select: {
        id: true,
        visit: { select: { startedAt: true } },
        doctor: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.appointment.findMany({
      where: { organizationId, patientId, scheduledStart: { lt: today } },
      orderBy: { scheduledStart: "desc" },
      take: 8,
      select: { id: true, scheduledStart: true, status: true, doctor: { select: { user: { select: { name: true } } } } },
    }),
  ]);

  return {
    token: token
      ? { token: token.token, doctorName: token.queue.doctor.user.name, statusPath: tokenStatusPath(token.id) }
      : null,
    upcoming: upcoming.map((a) => ({
      id: a.id,
      start: a.scheduledStart,
      doctorName: a.doctor.user.name,
      department: a.doctor.department?.name ?? null,
      status: a.status,
      canCancel: a.status === "SCHEDULED" && a.scheduledStart > now,
    })),
    followUps: followUps.map((f) => ({
      id: f.id,
      dueDate: f.dueDate,
      reason: f.reason,
      doctorName: f.doctor.user.name,
    })),
    feedback: feedback.map((f) => ({
      id: f.id,
      visitDate: f.visit.startedAt,
      doctorName: f.doctor.user.name,
    })),
    past: past.map((a) => ({
      id: a.id,
      start: a.scheduledStart,
      doctorName: a.doctor.user.name,
      status: a.status,
    })),
  };
}

/* --------------------------------- booking -------------------------------- */

export async function portalDoctors(organizationId: string) {
  const doctors = await prisma.doctorProfile.findMany({
    where: {
      facility: { organizationId },
      user: { active: true },
      availability: { some: { isBlock: false } },
    },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      specialization: true,
      user: { select: { name: true } },
      department: { select: { name: true } },
    },
  });
  return doctors.map((d) => ({
    id: d.id,
    name: d.user.name,
    department: d.department?.name ?? null,
    specialization: d.specialization,
  }));
}

/** Free slots for a patient to choose from — never a slot already taken or past. */
export async function portalSlots(organizationId: string, doctorId: string, date: Date) {
  const day = startOfDay(date);
  const [doctor, taken] = await Promise.all([
    prisma.doctorProfile.findFirst({
      where: { id: doctorId, facility: { organizationId } },
      select: {
        consultationMinutes: true,
        availability: {
          where: { dayOfWeek: day.getDay() },
          select: { startMinute: true, endMinute: true, isBlock: true, effectiveFrom: true, effectiveTo: true },
        },
      },
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        doctorId,
        scheduledStart: { gte: day, lt: addDays(day, 1) },
        status: { in: [...ACTIVE_STATUSES, "COMPLETED"] },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
  ]);
  if (!doctor) throw notFound("Doctor");

  return buildSlots({
    day,
    rules: doctor.availability.filter((r) => appliesOn(r, day)),
    taken,
    consultationMinutes: doctor.consultationMinutes,
    now: new Date(),
  })
    .filter((s) => s.available)
    .map((s) => s.start);
}

/** How far ahead a patient may book online. */
const BOOK_AHEAD_DAYS = 30;

export async function portalBook(
  organizationId: string,
  patientId: string,
  input: { doctorId: string; start: Date; reason: string | null },
): Promise<{ start: Date; doctorName: string }> {
  const start = new Date(input.start);
  if (isInPast(start, new Date())) throw invalidState("That time has already passed.");
  if (start > addDays(new Date(), BOOK_AHEAD_DAYS)) {
    throw invalidState(`Appointments can be booked up to ${BOOK_AHEAD_DAYS} days ahead.`);
  }

  const [patient, doctor] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, organizationId, active: true },
      select: { id: true, mrn: true },
    }),
    prisma.doctorProfile.findFirst({
      where: { id: input.doctorId, facility: { organizationId } },
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

  // Only a slot the doctor actually offers — a patient cannot book 3 am.
  const offered = await portalSlots(organizationId, doctor.id, start);
  if (!offered.some((s) => s.getTime() === start.getTime())) {
    throw invalidState("That time is no longer free.", "Choose another time.");
  }

  const upcoming = await prisma.appointment.count({
    where: { organizationId, patientId, status: "SCHEDULED", scheduledStart: { gte: new Date() } },
  });
  if (upcoming >= 3) {
    throw invalidState(
      "You already have three upcoming appointments.",
      "Cancel one, or call the clinic to book more.",
    );
  }

  const end = new Date(start.getTime() + doctor.consultationMinutes * 60_000);

  const appointmentId = await prisma.$transaction(async (tx) => {
    const clash = await tx.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        organizationId,
        status: { in: [...ACTIVE_STATUSES] },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: { id: true },
    });
    if (clash) throw invalidState("That time was just taken.", "Choose another time.");

    const created = await tx.appointment.create({
      data: {
        organizationId,
        facilityId: doctor.facilityId,
        departmentId: doctor.departmentId,
        patientId: patient.id,
        doctorId: doctor.id,
        scheduledStart: start,
        scheduledEnd: end,
        durationMinutes: doctor.consultationMinutes,
        type: "NEW_CONSULTATION",
        status: "SCHEDULED",
        source: "ONLINE",
        reason: input.reason?.trim() || null,
      },
      select: { id: true },
    });

    // Spec §30 — the patient acted, not a member of staff.
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "RECORD_CREATED",
        entityType: "Appointment",
        entityId: created.id,
        summary: `Patient ${patient.mrn} booked online`,
        metadata: { doctorId: doctor.id, scheduledStart: start.toISOString(), via: "portal" },
      },
    });
    return created.id;
  }, TX_OPTIONS);

  const actor = await automationActor(organizationId);
  if (actor) {
    await fireTrigger(actor, "APPOINTMENT_SCHEDULED", { type: "Appointment", id: appointmentId });
  }

  return { start, doctorName: doctor.user.name };
}

export async function portalCancel(
  organizationId: string,
  patientId: string,
  appointmentId: string,
): Promise<void> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId, patientId },
    select: { id: true, status: true, scheduledStart: true, patient: { select: { mrn: true } } },
  });
  if (!appointment) throw notFound("Appointment");

  assertCanCancel(appointment.status);
  if (appointment.status !== "SCHEDULED") {
    throw invalidState("You are already checked in.", "Please speak to the front desk.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Cancelled by the patient online" },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "RECORD_UPDATED",
        entityType: "Appointment",
        entityId: appointment.id,
        summary: `Patient ${appointment.patient.mrn} cancelled online`,
        metadata: { via: "portal" },
      },
    });
  }, TX_OPTIONS);

  const actor = await automationActor(organizationId);
  if (actor) {
    await fireTrigger(actor, "APPOINTMENT_CANCELLED", { type: "Appointment", id: appointment.id });
  }
}

/** Spec §15 — the patient's rating of a visit, once. */
export async function portalFeedback(
  organizationId: string,
  patientId: string,
  feedbackId: string,
  rating: number,
  comment: string | null,
): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ServiceError("VALIDATION", "Choose from one to five stars.");
  }
  const updated = await prisma.feedback.updateMany({
    where: { id: feedbackId, organizationId, patientId, respondedAt: null },
    data: { rating, comment: comment?.trim().slice(0, 1000) || null, respondedAt: new Date() },
  });
  if (updated.count === 0) throw notFound("Feedback request");
}
