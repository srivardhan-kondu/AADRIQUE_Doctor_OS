import "server-only";
import type { Permission as PermissionName, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  Permission,
  ROLE_PERMISSIONS,
  assertPermission,
  effectivePermissions,
  tenantScope,
} from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { notFound } from "./errors";

/**
 * Hospital administration (spec §21, §22).
 *
 * Read-heavy: the directory of who works here, what departments exist, and
 * which permissions each role actually holds after this organization's
 * overrides are applied.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface DoctorRow {
  id: string;
  name: string;
  email: string;
  department: string | null;
  specialization: string | null;
  qualifications: string | null;
  registrationNo: string | null;
  experienceYears: number | null;
  consultationMinutes: number;
  tokenPrefix: string;
  acceptsWalkIns: boolean;
  online: boolean;
  /** Recurring clinic hours, as a readable line per weekday. */
  availability: { day: string; hours: string }[];
  todayBooked: number;
  visits30d: number;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatMinute(minute: number): string {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${rest ? `:${String(rest).padStart(2, "0")}` : ""}${suffix}`;
}

export async function listDoctors(actor: RequestActor): Promise<DoctorRow[]> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const thirtyDaysAgo = new Date(start);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const doctors = await prisma.doctorProfile.findMany({
    where: { facility: { organizationId: actor.organizationId } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      specialization: true,
      qualifications: true,
      registrationNo: true,
      experienceYears: true,
      consultationMinutes: true,
      tokenPrefix: true,
      acceptsWalkIns: true,
      online: true,
      user: { select: { name: true, email: true } },
      department: { select: { name: true } },
      availability: {
        where: { isBlock: false },
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
      _count: {
        select: {
          appointments: {
            where: {
              scheduledStart: { gte: start, lt: end },
              status: { in: ["SCHEDULED", "CHECKED_IN", "WAITING", "IN_CONSULTATION"] },
            },
          },
          visits: { where: { startedAt: { gte: thirtyDaysAgo } } },
        },
      },
    },
  });

  return doctors.map((doctor) => {
    // Collapse identical weekday patterns into one line each.
    const byDay = new Map<number, string[]>();
    for (const slot of doctor.availability) {
      const line = `${formatMinute(slot.startMinute)}–${formatMinute(slot.endMinute)}`;
      byDay.set(slot.dayOfWeek, [...(byDay.get(slot.dayOfWeek) ?? []), line]);
    }

    return {
      id: doctor.id,
      name: doctor.user.name,
      email: doctor.user.email,
      department: doctor.department?.name ?? null,
      specialization: doctor.specialization,
      qualifications: doctor.qualifications,
      registrationNo: doctor.registrationNo,
      experienceYears: doctor.experienceYears,
      consultationMinutes: doctor.consultationMinutes,
      tokenPrefix: doctor.tokenPrefix,
      acceptsWalkIns: doctor.acceptsWalkIns,
      online: doctor.online,
      availability: [...byDay.entries()]
        .sort(([a], [b]) => a - b)
        .map(([day, hours]) => ({ day: WEEKDAYS[day], hours: hours.join(", ") })),
      todayBooked: doctor._count.appointments,
      visits30d: doctor._count.visits,
    };
  });
}

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  facility: string;
  waitThresholdMinutes: number;
  queueCapacity: number;
  active: boolean;
  doctorCount: number;
  visits30d: number;
}

export async function listDepartments(
  actor: RequestActor,
): Promise<DepartmentRow[]> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const departments = await prisma.department.findMany({
    where: { facility: { organizationId: actor.organizationId } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      waitThresholdMinutes: true,
      queueCapacity: true,
      active: true,
      facility: { select: { name: true } },
      _count: {
        select: {
          doctors: true,
          visits: { where: { startedAt: { gte: thirtyDaysAgo } } },
        },
      },
    },
  });

  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    facility: department.facility.name,
    waitThresholdMinutes: department.waitThresholdMinutes,
    queueCapacity: department.queueCapacity,
    active: department.active,
    doctorCount: department._count.doctors,
    visits30d: department._count.visits,
  }));
}

export interface RolePermissionRow {
  role: Role;
  /** Permissions the role actually holds, after this org's overrides. */
  held: PermissionName[];
  /** Granted here but not in the default matrix. */
  added: PermissionName[];
  /** Removed here though the default matrix allows them. */
  removed: PermissionName[];
  memberCount: number;
}

export interface OrganizationSettings {
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  facilities: {
    id: string;
    name: string;
    code: string;
    city: string | null;
    phone: string | null;
    active: boolean;
    departmentCount: number;
  }[];
  roles: RolePermissionRow[];
  /** Spec §22 — stated plainly on the screen that governs it. */
  counts: { patients: number; users: number; departments: number };
}

export async function getOrganizationSettings(
  actor: RequestActor,
): Promise<OrganizationSettings> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const [organization, overrides, memberships, patients] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: {
        name: true,
        slug: true,
        timezone: true,
        locale: true,
        facilities: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            phone: true,
            active: true,
            _count: { select: { departments: true } },
          },
        },
      },
    }),
    prisma.rolePermission.findMany({
      where: { organizationId: actor.organizationId },
      select: { role: true, permission: true, granted: true },
    }),
    prisma.membership.groupBy({
      by: ["role"],
      where: { organizationId: actor.organizationId, active: true },
      _count: { _all: true },
    }),
    prisma.patient.count({ where: { ...tenantScope(actor), active: true } }),
  ]);

  if (!organization) throw notFound("Organization");

  const roles: RolePermissionRow[] = (
    Object.keys(ROLE_PERMISSIONS) as Role[]
  ).map((role) => {
    const effective = effectivePermissions(role, overrides);
    const base = new Set(ROLE_PERMISSIONS[role]);

    return {
      role,
      held: [...effective].sort(),
      added: [...effective].filter((p) => !base.has(p)).sort(),
      removed: [...base].filter((p) => !effective.has(p)).sort(),
      memberCount:
        memberships.find((m) => m.role === role)?._count._all ?? 0,
    };
  });

  return {
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    locale: organization.locale,
    facilities: organization.facilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
      code: facility.code,
      city: facility.city,
      phone: facility.phone,
      active: facility.active,
      departmentCount: facility._count.departments,
    })),
    roles,
    counts: {
      patients,
      users: memberships.reduce((sum, m) => sum + m._count._all, 0),
      departments: organization.facilities.reduce(
        (sum, f) => sum + f._count.departments,
        0,
      ),
    },
  };
}

/**
 * Spec §21 — a department's wait threshold is what the operational pulse and
 * the queue warnings are measured against, so an administrator owns it.
 */
export async function updateDepartmentThresholds(
  actor: RequestActor,
  departmentId: string,
  input: { waitThresholdMinutes: number; queueCapacity: number },
): Promise<{ name: string }> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const department = await prisma.department.findFirst({
    where: {
      id: departmentId,
      facility: { organizationId: actor.organizationId },
    },
    select: { id: true, name: true },
  });

  if (!department) throw notFound("Department");

  await prisma.$transaction(async (tx) => {
    await tx.department.update({
      where: { id: department.id },
      data: {
        waitThresholdMinutes: input.waitThresholdMinutes,
        queueCapacity: input.queueCapacity,
      },
    });

    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "Department",
      entityId: department.id,
      summary: `Updated queue limits · ${department.name}`,
      metadata: {
        waitThresholdMinutes: input.waitThresholdMinutes,
        queueCapacity: input.queueCapacity,
      },
    });
  }, TX_OPTIONS);

  return { name: department.name };
}
