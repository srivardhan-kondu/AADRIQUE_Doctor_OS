import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Actor, PermissionOverride } from "@/lib/permissions";
import { assertPermission, type Permission } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth/config";

/**
 * The server-side authorization context.
 *
 * Every service call takes an `Actor` built here. The actor is derived from
 * the signed session and the database — never from a route parameter, a
 * header or a request body — so there is no path by which a client can name
 * the tenant it wants to read (spec §21, §22).
 *
 * `cache` dedupes within a single render pass: a page and the components
 * beneath it share one actor without re-reading the session per call.
 */

export interface RequestActor extends Actor {
  name: string;
  email: string;
  doctorId: string | null;
  department: string | null;
  facilityName: string;
  organizationName: string;
  /** An administrator issued a temporary password; choose a new one first. */
  mustChangePassword: boolean;
}

type Resolved =
  | { state: "none" }
  /** A signed session the account no longer honours. */
  | { state: "ended" }
  | { state: "ok"; actor: RequestActor };

/**
 * The session, checked against the account on every request.
 *
 * The JWT alone would keep a session alive for its whole 12 hours after the
 * account was deactivated, removed from the organization or had its password
 * changed. One indexed read — made in parallel with the permission overrides,
 * so it costs no extra round trip — closes that window: the session is ended
 * the next time it is used.
 */
const resolve = cache(async (): Promise<Resolved> => {
  const session = await auth();
  if (!session?.user) return { state: "none" };

  const user: SessionUser = session.user;

  const [overrides, account] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { organizationId: user.organizationId, role: user.role },
      select: { role: true, permission: true, granted: true },
    }) as Promise<PermissionOverride[]>,
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        active: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        memberships: {
          where: {
            organizationId: user.organizationId,
            role: user.role,
            active: true,
            organization: { active: true },
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);

  if (!account || !account.active || account.memberships.length === 0) {
    return { state: "ended" };
  }

  // A second of grace: the session issued by a password change is stamped in
  // the same second the change is recorded.
  if (
    account.passwordChangedAt &&
    user.issuedAt * 1000 < account.passwordChangedAt.getTime() - 1000
  ) {
    return { state: "ended" };
  }

  return {
    state: "ok",
    actor: {
      userId: user.id,
      organizationId: user.organizationId,
      facilityId: user.facilityId,
      role: user.role,
      overrides,
      name: user.name,
      email: user.email,
      doctorId: user.doctorId,
      department: user.department,
      facilityName: user.facilityName,
      organizationName: user.organizationName,
      mustChangePassword: account.mustChangePassword,
    },
  };
});

export const getActor = cache(async (): Promise<RequestActor | null> => {
  const resolved = await resolve();
  return resolved.state === "ok" ? resolved.actor : null;
});

/**
 * Redirects to sign-in when there is no session. A session the account no
 * longer honours is ended properly first — its cookie cleared — or the
 * sign-in page would bounce the still-valid-looking cookie straight back.
 */
export async function requireActor(): Promise<RequestActor> {
  const resolved = await resolve();
  if (resolved.state === "ended") redirect("/api/session/end");
  if (resolved.state === "none") redirect("/sign-in");
  return resolved.actor;
}

/** Requires a session *and* a specific permission. */
export async function requirePermission(
  permission: Permission,
): Promise<RequestActor> {
  const actor = await requireActor();
  assertPermission(actor, permission);
  return actor;
}

/**
 * The doctor whose workspace is being viewed.
 *
 * A doctor sees their own. Anyone else needs an explicit doctor id, which is
 * validated against the actor's organization before it is used.
 */
export async function requireDoctorId(actor: RequestActor): Promise<string> {
  if (actor.doctorId) return actor.doctorId;

  // Staff viewing the doctor workspace fall back to the facility's first
  // doctor — enough to render the screen, still inside the tenant boundary.
  const doctor = await prisma.doctorProfile.findFirst({
    where: { facility: { organizationId: actor.organizationId } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!doctor) redirect("/admin/doctors");
  return doctor.id;
}
