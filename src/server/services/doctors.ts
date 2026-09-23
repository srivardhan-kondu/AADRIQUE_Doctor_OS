import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, hasPermission } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { type WeeklyRule, validateWeek } from "@/server/rules/availability";
import { writeAudit } from "./audit";
import { ServiceError, notFound } from "./errors";

/**
 * Spec §11 + §21 — a doctor's profile, working week and preferences.
 *
 * A doctor manages their own; an administrator manages anyone's in their
 * organization. Nobody else changes when a doctor is bookable.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface DoctorProfileView {
  id: string;
  name: string;
  email: string;
  department: { id: string; name: string } | null;
  specialization: string | null;
  qualifications: string | null;
  registrationNo: string | null;
  experienceYears: number | null;
  consultationMinutes: number;
  tokenPrefix: string;
  acceptsWalkIns: boolean;
  online: boolean;
  /** The standing week: rules with no effective dates. */
  week: WeeklyRule[];
  canEdit: boolean;
}

function canManage(actor: RequestActor, doctorId: string): boolean {
  return (
    actor.doctorId === doctorId || hasPermission(actor, Permission.ADMIN_MANAGE)
  );
}

function assertCanManage(actor: RequestActor, doctorId: string): void {
  if (!canManage(actor, doctorId)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Only the doctor or an administrator can change these settings.",
    );
  }
}

async function loadDoctor(actor: RequestActor, doctorId: string) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    select: {
      id: true,
      facilityId: true,
      specialization: true,
      qualifications: true,
      registrationNo: true,
      experienceYears: true,
      consultationMinutes: true,
      tokenPrefix: true,
      acceptsWalkIns: true,
      online: true,
      user: { select: { name: true, email: true } },
      department: { select: { id: true, name: true } },
      availability: {
        where: { effectiveFrom: null, effectiveTo: null },
        select: {
          dayOfWeek: true,
          startMinute: true,
          endMinute: true,
          isBlock: true,
          label: true,
        },
      },
    },
  });
  if (!doctor) throw notFound("Doctor");
  return doctor;
}

export async function getDoctorProfile(
  actor: RequestActor,
  doctorId: string,
): Promise<DoctorProfileView> {
  assertPermission(actor, Permission.APPOINTMENT_READ);
  const doctor = await loadDoctor(actor, doctorId);

  return {
    id: doctor.id,
    name: doctor.user.name,
    email: doctor.user.email,
    department: doctor.department,
    specialization: doctor.specialization,
    qualifications: doctor.qualifications,
    registrationNo: doctor.registrationNo,
    experienceYears: doctor.experienceYears,
    consultationMinutes: doctor.consultationMinutes,
    tokenPrefix: doctor.tokenPrefix,
    acceptsWalkIns: doctor.acceptsWalkIns,
    online: doctor.online,
    // Sorted for display, not validated: a stored week is shown as it is,
    // so an old malformed row can be seen and fixed rather than breaking the
    // page. Validation guards what is saved.
    week: [...doctor.availability].sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        Number(a.isBlock) - Number(b.isBlock) ||
        a.startMinute - b.startMinute,
    ),
    canEdit: canManage(actor, doctor.id),
  };
}

/**
 * Replaces the doctor's standing week in one transaction. Appointments already
 * booked are not moved: the week decides what can be booked from now on.
 */
export async function setWeeklyAvailability(
  actor: RequestActor,
  doctorId: string,
  rules: WeeklyRule[],
): Promise<void> {
  assertCanManage(actor, doctorId);
  const week = validateWeek(rules);
  const doctor = await loadDoctor(actor, doctorId);

  await prisma.$transaction(async (tx) => {
    await tx.doctorAvailability.deleteMany({
      where: { doctorId: doctor.id, effectiveFrom: null, effectiveTo: null },
    });
    if (week.length > 0) {
      await tx.doctorAvailability.createMany({
        data: week.map((rule) => ({ ...rule, doctorId: doctor.id })),
      });
    }
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "DoctorProfile",
      entityId: doctor.id,
      summary: `Clinic hours updated · ${doctor.user.name}`,
      metadata: {
        sessions: week.filter((r) => !r.isBlock).length,
        breaks: week.filter((r) => r.isBlock).length,
      },
    });
  }, TX_OPTIONS);
}

export interface DoctorSettingsInput {
  consultationMinutes: number;
  acceptsWalkIns: boolean;
  /** An administrator's change only; a doctor does not reassign themselves. */
  departmentId?: string | null;
}

export async function updateDoctorSettings(
  actor: RequestActor,
  doctorId: string,
  input: DoctorSettingsInput,
): Promise<void> {
  assertCanManage(actor, doctorId);
  const doctor = await loadDoctor(actor, doctorId);

  if (input.consultationMinutes < 5 || input.consultationMinutes > 120) {
    throw new ServiceError(
      "VALIDATION",
      "A consultation slot must be between 5 and 120 minutes.",
    );
  }

  let departmentId: string | null | undefined;
  if (input.departmentId !== undefined) {
    assertPermission(actor, Permission.ADMIN_MANAGE);
    departmentId = input.departmentId
      ? await departmentInOrganization(actor, input.departmentId)
      : null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.doctorProfile.update({
      where: { id: doctor.id },
      data: {
        consultationMinutes: input.consultationMinutes,
        acceptsWalkIns: input.acceptsWalkIns,
        ...(departmentId !== undefined ? { departmentId } : {}),
      },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "DoctorProfile",
      entityId: doctor.id,
      summary: `Practice settings updated · ${doctor.user.name}`,
      metadata: {
        consultationMinutes: input.consultationMinutes,
        acceptsWalkIns: input.acceptsWalkIns,
        ...(departmentId !== undefined ? { departmentId } : {}),
      },
    });
  }, TX_OPTIONS);
}

/** Spec §12 — doctor status: on duty or away. */
export async function setDoctorOnline(
  actor: RequestActor,
  doctorId: string,
  online: boolean,
): Promise<void> {
  assertCanManage(actor, doctorId);
  const doctor = await loadDoctor(actor, doctorId);

  await prisma.doctorProfile.update({
    where: { id: doctor.id },
    data: { online },
  });
}

async function departmentInOrganization(
  actor: RequestActor,
  departmentId: string,
): Promise<string> {
  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      facility: { organizationId: actor.organizationId },
    },
    select: { id: true },
  });
  if (!department) throw notFound("Department");
  return department.id;
}

export interface CreateDoctorInput {
  name: string;
  email: string;
  departmentId: string;
  specialization?: string | null;
  qualifications?: string | null;
  registrationNo?: string | null;
  consultationMinutes: number;
  tokenPrefix: string;
}

export interface CreateDoctorResult {
  doctorId: string;
  name: string;
  email: string;
  /**
   * Shown once to the administrator to hand over in person. Only its hash is
   * stored, and it is never sent anywhere by the system.
   */
  temporaryPassword: string;
}

/** A readable one-time password: no 0/O or 1/l to misread over the phone. */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Spec §53 (admin journey) — create a doctor and assign their department.
 * Their clinic hours are set next, with `setWeeklyAvailability`.
 */
export async function createDoctor(
  actor: RequestActor,
  input: CreateDoctorInput,
): Promise<CreateDoctorResult> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const tokenPrefix = input.tokenPrefix.trim().toUpperCase();

  if (!/^[A-Z]{1,3}$/.test(tokenPrefix)) {
    throw new ServiceError(
      "VALIDATION",
      "A token prefix is one to three letters, like A or CAR.",
    );
  }

  const department = await prisma.department.findFirst({
    where: {
      id: input.departmentId,
      facility: { organizationId: actor.organizationId },
    },
    select: { id: true, facilityId: true, name: true },
  });
  if (!department) throw notFound("Department");

  // Tokens are shown on a shared waiting-room screen: two doctors issuing
  // "A012" would send patients to the wrong room.
  const prefixTaken = await prisma.doctorProfile.findFirst({
    where: {
      facility: { organizationId: actor.organizationId },
      tokenPrefix,
    },
    select: { user: { select: { name: true } } },
  });
  if (prefixTaken) {
    throw new ServiceError(
      "CONFLICT",
      `${prefixTaken.user.name} already issues tokens starting with ${tokenPrefix}.`,
      "Choose a different prefix.",
    );
  }

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  try {
    const doctorId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          memberships: {
            create: {
              organizationId: actor.organizationId,
              facilityId: department.facilityId,
              role: "DOCTOR",
            },
          },
        },
        select: { id: true },
      });

      const doctor = await tx.doctorProfile.create({
        data: {
          userId: user.id,
          facilityId: department.facilityId,
          departmentId: department.id,
          specialization: input.specialization?.trim() || null,
          qualifications: input.qualifications?.trim() || null,
          registrationNo: input.registrationNo?.trim() || null,
          consultationMinutes: input.consultationMinutes,
          tokenPrefix,
          online: false,
        },
        select: { id: true },
      });

      await writeAudit(tx, actor, {
        action: "RECORD_CREATED",
        entityType: "DoctorProfile",
        entityId: doctor.id,
        summary: `Added doctor ${name} · ${department.name}`,
        metadata: { email, departmentId: department.id, tokenPrefix },
      });

      return doctor.id;
    }, TX_OPTIONS);

    return { doctorId, name, email, temporaryPassword: password };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ServiceError(
        "CONFLICT",
        `An account already uses ${email}.`,
        "Use a different email address, or ask them to sign in with that account.",
      );
    }
    throw error;
  }
}
