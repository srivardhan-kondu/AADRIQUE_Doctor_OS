import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordProblem } from "@/lib/auth/password-policy";
import { temporaryPassword } from "@/lib/auth/temporary-password";
import { prisma } from "@/lib/db";
import { Permission, assertPermission } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, notFound } from "./errors";

/**
 * Spec §21 + §31 — accounts: passwords, and the organization's staff.
 *
 * Every change to a password bumps the account's session version, which ends
 * every session issued under the old one (see `requireActor`). A reset signs
 * the person out everywhere; a change signs out every other device.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/* ------------------------------ own password ----------------------------- */

export async function changeOwnPassword(
  actor: RequestActor,
  current: string,
  next: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user?.passwordHash) throw notFound("Account");

  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new ServiceError(
      "VALIDATION",
      "Your current password is not right.",
      "Type the password you signed in with.",
    );
  }

  const problem = passwordProblem(next, user.email);
  if (problem) throw new ServiceError("VALIDATION", problem);

  if (await verifyPassword(next, user.passwordHash)) {
    throw new ServiceError(
      "VALIDATION",
      "Choose a password different from the current one.",
    );
  }

  const passwordHash = await hashPassword(next);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "User",
      entityId: user.id,
      summary: "Changed their password",
    });
  }, TX_OPTIONS);
}

/* --------------------------------- staff --------------------------------- */

export interface StaffRow {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  isDoctor: boolean;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  isSelf: boolean;
}

export async function listStaff(actor: RequestActor): Promise<StaffRow[]> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const memberships = await prisma.membership.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ active: "desc" }, { role: "asc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      role: true,
      active: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          lastLoginAt: true,
          mustChangePassword: true,
          doctorProfile: { select: { id: true } },
        },
      },
    },
  });

  return memberships.map((m) => ({
    userId: m.user.id,
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    active: m.active && m.user.active,
    isDoctor: m.user.doctorProfile !== null,
    lastLoginAt: m.user.lastLoginAt,
    mustChangePassword: m.user.mustChangePassword,
    isSelf: m.user.id === actor.userId,
  }));
}

/** Staff an administrator may create here; doctors go through createDoctor. */
export const STAFF_ROLES = ["RECEPTIONIST", "NURSE", "STAFF", "HOSPITAL_ADMIN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export async function createStaff(
  actor: RequestActor,
  input: { name: string; email: string; role: StaffRole },
): Promise<{ userId: string; name: string; email: string; temporaryPassword: string }> {
  assertPermission(actor, Permission.ADMIN_MANAGE);

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  try {
    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          mustChangePassword: true,
          memberships: {
            create: {
              organizationId: actor.organizationId,
              facilityId: actor.facilityId,
              role: input.role,
            },
          },
        },
        select: { id: true },
      });
      await writeAudit(tx, actor, {
        action: "RECORD_CREATED",
        entityType: "User",
        entityId: user.id,
        summary: `Added ${name} as ${input.role.toLowerCase().replace("_", " ")}`,
        metadata: { email, role: input.role },
      });
      return user.id;
    }, TX_OPTIONS);

    return { userId, name, email, temporaryPassword: password };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ServiceError(
        "CONFLICT",
        `An account already uses ${email}.`,
        "Use a different email address.",
      );
    }
    throw error;
  }
}

/** Loads a member of the actor's organization, or refuses. */
async function loadMember(actor: RequestActor, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { organizationId: actor.organizationId, userId },
    select: {
      id: true,
      role: true,
      active: true,
      user: { select: { id: true, name: true } },
    },
  });
  if (!membership) throw notFound("Staff member");

  // Only the platform owner manages the platform owner.
  if (membership.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new ServiceError(
      "FORBIDDEN",
      "Only a platform owner can change a platform owner's account.",
    );
  }
  return membership;
}

/**
 * Issues a temporary password and signs the person out everywhere. They must
 * choose their own at the next sign-in. Your own password is changed, not
 * reset — that path asks for the current one.
 */
export async function resetStaffPassword(
  actor: RequestActor,
  userId: string,
): Promise<{ name: string; temporaryPassword: string }> {
  assertPermission(actor, Permission.ADMIN_MANAGE);
  if (userId === actor.userId) {
    throw new ServiceError(
      "INVALID_STATE",
      "Change your own password from your account menu instead.",
    );
  }
  const member = await loadMember(actor, userId);

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: member.user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
        // The recovery for a lost phone: the person sets two-factor up
        // again after choosing their password.
        mfaEnabled: false,
        mfaSecret: null,
        mfaLastStep: null,
      },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "User",
      entityId: member.user.id,
      summary: `Reset the password (and any two-factor) for ${member.user.name}`,
    });
  }, TX_OPTIONS);

  return { name: member.user.name, temporaryPassword: password };
}

/**
 * Removes or restores someone's access to this organization. Their account
 * is untouched — they may belong to another — and a removed member's open
 * sessions end the next time they are used.
 */
export async function setStaffActive(
  actor: RequestActor,
  userId: string,
  active: boolean,
): Promise<{ name: string }> {
  assertPermission(actor, Permission.ADMIN_MANAGE);
  if (userId === actor.userId && !active) {
    throw new ServiceError(
      "INVALID_STATE",
      "You cannot remove your own access.",
      "Ask another administrator.",
    );
  }
  const member = await loadMember(actor, userId);

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: member.id },
      data: { active },
    });
    await writeAudit(tx, actor, {
      action: "PERMISSION_CHANGED",
      entityType: "User",
      entityId: member.user.id,
      summary: `${active ? "Restored" : "Removed"} access for ${member.user.name}`,
    });
  }, TX_OPTIONS);

  return { name: member.user.name };
}
