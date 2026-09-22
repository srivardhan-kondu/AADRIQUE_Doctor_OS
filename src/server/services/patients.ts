import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { notFound } from "./errors";

/**
 * Patient search and Patient 360 (spec §7, §13).
 *
 * Every query is built on `tenantScope(actor)`, so a patient id from outside
 * the organization simply does not resolve (spec §22).
 */

export interface PatientSearchRow {
  id: string;
  mrn: string;
  name: string;
  age: number | null;
  gender: string;
  phone: string;
  lastVisitAt: Date | null;
  allergyCount: number;
  conditionCount: number;
  flags: string[];
}

function ageOf(dateOfBirth: Date | null, approximateAge: number | null) {
  if (approximateAge !== null) return approximateAge;
  if (!dateOfBirth) return null;
  return Math.floor(
    (Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
}

/**
 * Spec §13 — search by name, mobile number, patient ID or appointment ID.
 *
 * The term is matched against each in turn rather than concatenated, so a
 * partial mobile number does not accidentally match a record number.
 */
export async function searchPatients(
  actor: RequestActor,
  term: string,
  limit = 25,
): Promise<PatientSearchRow[]> {
  assertPermission(actor, Permission.PATIENT_READ);

  const query = term.trim();

  const where: Prisma.PatientWhereInput = {
    ...tenantScope(actor),
    active: true,
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { mrn: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
            { identifiers: { some: { value: { contains: query } } } },
            { appointments: { some: { id: query } } },
          ],
        }
      : {}),
  };

  const patients = await prisma.patient.findMany({
    where,
    // With no search term this is "recently seen", which is what a doctor
    // usually wants when they open the screen.
    orderBy: query
      ? [{ lastVisitAt: "desc" }, { firstName: "asc" }]
      : { lastVisitAt: "desc" },
    take: limit,
    select: {
      id: true,
      mrn: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      approximateAge: true,
      gender: true,
      phone: true,
      lastVisitAt: true,
      flags: { where: { active: true }, select: { label: true } },
      _count: {
        select: {
          allergies: { where: { active: true } },
          conditions: { where: { active: true } },
        },
      },
    },
  });

  return patients.map((p) => ({
    id: p.id,
    mrn: p.mrn,
    name: `${p.firstName} ${p.lastName ?? ""}`.trim(),
    age: ageOf(p.dateOfBirth, p.approximateAge),
    gender: p.gender,
    phone: p.phone,
    lastVisitAt: p.lastVisitAt,
    allergyCount: p._count.allergies,
    conditionCount: p._count.conditions,
    flags: p.flags.map((f) => f.label),
  }));
}

/** One event on the Patient 360 timeline (spec §7). */
export interface TimelineEvent {
  id: string;
  at: Date;
  kind:
    | "CONSULTATION"
    | "PRESCRIPTION"
    | "LAB"
    | "VITALS"
    | "MESSAGE"
    | "APPOINTMENT"
    | "FOLLOW_UP";
  title: string;
  detail: string | null;
  meta: string | null;
  href: string | null;
  /** Set when the event needs the doctor's attention. */
  flag: "ABNORMAL" | "FAILED" | "OVERDUE" | null;
}

export interface Patient360 {
  id: string;
  mrn: string;
  name: string;
  firstName: string;
  age: number | null;
  gender: string;
  bloodGroup: string;
  phone: string;
  email: string | null;
  address: string | null;
  emergencyContact: { name: string; phone: string } | null;
  preferredLanguage: string;
  allergies: Array<{ id: string; substance: string; reaction: string | null; severity: string }>;
  conditions: Array<{ id: string; name: string; code: string | null; since: Date | null }>;
  flags: Array<{ id: string; label: string; severity: string }>;
  lastVisitAt: Date | null;
  nextFollowUpAt: Date | null;
  counts: {
    visits: number;
    prescriptions: number;
    labReports: number;
    messages: number;
  };
  timeline: TimelineEvent[];
}

/** Spec §7 — the whole patient story, assembled into one timeline. */
export async function getPatient360(
  actor: RequestActor,
  patientId: string,
): Promise<Patient360> {
  assertPermission(actor, Permission.PATIENT_READ);

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...tenantScope(actor) },
    include: {
      allergies: { where: { active: true }, orderBy: { severity: "desc" } },
      conditions: { where: { active: true }, orderBy: { since: "asc" } },
      flags: { where: { active: true } },
      _count: {
        select: {
          visits: true,
          prescriptions: true,
          labReports: true,
          messages: true,
        },
      },
    },
  });

  if (!patient) throw notFound("Patient");

  const canReadClinical =
    actor.role === "DOCTOR" ||
    actor.role === "NURSE" ||
    actor.role === "HOSPITAL_ADMIN" ||
    actor.role === "SUPER_ADMIN";

  const [visits, prescriptions, labs, messages, followUps, appointments] =
    await Promise.all([
      canReadClinical
        ? prisma.visit.findMany({
            where: { patientId, ...tenantScope(actor) },
            orderBy: { startedAt: "desc" },
            take: 40,
            select: {
              id: true,
              startedAt: true,
              chiefComplaint: true,
              stage: true,
              doctor: { select: { user: { select: { name: true } } } },
              consultation: { select: { id: true, status: true, assessment: true } },
            },
          })
        : [],
      canReadClinical
        ? prisma.prescription.findMany({
            where: { patientId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              createdAt: true,
              prescriptionNo: true,
              visitId: true,
              _count: { select: { items: true } },
            },
          })
        : [],
      canReadClinical
        ? prisma.labReport.findMany({
            where: { patientId },
            orderBy: { orderedAt: "desc" },
            take: 20,
            select: {
              id: true,
              orderedAt: true,
              resultAt: true,
              testName: true,
              panel: true,
              status: true,
              abnormal: true,
              summary: true,
            },
          })
        : [],
      prisma.message.findMany({
        where: { patientId, ...tenantScope(actor) },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          createdAt: true,
          channel: true,
          status: true,
          body: true,
        },
      }),
      prisma.followUp.findMany({
        where: { patientId, ...tenantScope(actor) },
        orderBy: { dueDate: "desc" },
        take: 15,
        select: {
          id: true,
          dueDate: true,
          reason: true,
          status: true,
        },
      }),
      prisma.appointment.findMany({
        where: { patientId, ...tenantScope(actor) },
        orderBy: { scheduledStart: "desc" },
        take: 20,
        select: {
          id: true,
          scheduledStart: true,
          status: true,
          type: true,
          reason: true,
          doctor: { select: { user: { select: { name: true } } } },
        },
      }),
    ]);

  const timeline: TimelineEvent[] = [
    ...visits.map((v) => ({
      id: `visit_${v.id}`,
      at: v.startedAt,
      kind: "CONSULTATION" as const,
      title: "Consultation",
      detail: v.chiefComplaint ?? v.consultation?.assessment ?? null,
      meta: v.doctor.user.name,
      href: `/doctor/consultations/${v.id}`,
      flag: null,
    })),
    ...prescriptions.map((p) => ({
      id: `rx_${p.id}`,
      at: p.createdAt,
      kind: "PRESCRIPTION" as const,
      title: "Prescription created",
      detail: `${p._count.items} ${p._count.items === 1 ? "medication" : "medications"}`,
      meta: p.prescriptionNo,
      href: `/doctor/consultations/${p.visitId}`,
      flag: null,
    })),
    ...labs.map((l) => ({
      id: `lab_${l.id}`,
      at: l.resultAt ?? l.orderedAt,
      kind: "LAB" as const,
      title: l.resultAt ? "Lab report available" : "Lab test ordered",
      detail: l.summary ?? l.testName,
      meta: l.panel ? `${l.testName} · ${l.panel}` : l.testName,
      href: null,
      flag: l.abnormal ? ("ABNORMAL" as const) : null,
    })),
    ...messages.map((m) => ({
      id: `msg_${m.id}`,
      at: m.createdAt,
      kind: "MESSAGE" as const,
      title: `${m.channel === "WHATSAPP" ? "WhatsApp" : m.channel === "SMS" ? "SMS" : "Email"} ${m.status.toLowerCase()}`,
      detail: m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body,
      meta: null,
      href: null,
      flag: m.status === "FAILED" ? ("FAILED" as const) : null,
    })),
    ...followUps.map((f) => ({
      id: `fu_${f.id}`,
      at: f.dueDate,
      kind: "FOLLOW_UP" as const,
      title:
        f.status === "COMPLETED"
          ? "Follow-up completed"
          : f.status === "MISSED"
            ? "Follow-up missed"
            : "Follow-up due",
      detail: f.reason,
      meta: null,
      href: null,
      flag:
        f.status === "MISSED" ||
        (f.status === "PENDING" && f.dueDate < new Date())
          ? ("OVERDUE" as const)
          : null,
    })),
    ...appointments.map((a) => ({
      id: `apt_${a.id}`,
      at: a.scheduledStart,
      kind: "APPOINTMENT" as const,
      title:
        a.status === "CANCELLED"
          ? "Appointment cancelled"
          : a.status === "NO_SHOW"
            ? "Did not attend"
            : a.scheduledStart > new Date()
              ? "Appointment scheduled"
              : "Appointment",
      detail: a.reason,
      meta: a.doctor.user.name,
      href: null,
      flag: null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const nextFollowUp = await prisma.followUp.findFirst({
    where: {
      patientId,
      ...tenantScope(actor),
      status: { in: ["PENDING", "SCHEDULED"] },
      dueDate: { gte: new Date() },
    },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true },
  });

  return {
    id: patient.id,
    mrn: patient.mrn,
    name: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
    firstName: patient.firstName,
    age: ageOf(patient.dateOfBirth, patient.approximateAge),
    gender: patient.gender,
    bloodGroup: patient.bloodGroup,
    phone: patient.phone,
    email: patient.email,
    address: [patient.addressLine, patient.city, patient.state]
      .filter(Boolean)
      .join(", ") || null,
    emergencyContact:
      patient.emergencyContactName && patient.emergencyContactPhone
        ? {
            name: patient.emergencyContactName,
            phone: patient.emergencyContactPhone,
          }
        : null,
    preferredLanguage: patient.preferredLanguage,
    allergies: patient.allergies.map((a) => ({
      id: a.id,
      substance: a.substance,
      reaction: a.reaction,
      severity: a.severity,
    })),
    conditions: patient.conditions.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      since: c.since,
    })),
    flags: patient.flags.map((f) => ({
      id: f.id,
      label: f.label,
      severity: f.severity,
    })),
    lastVisitAt: patient.lastVisitAt,
    nextFollowUpAt: nextFollowUp?.dueDate ?? null,
    counts: {
      visits: patient._count.visits,
      prescriptions: patient._count.prescriptions,
      labReports: patient._count.labReports,
      messages: patient._count.messages,
    },
    timeline,
  };
}
