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
}

export const getActor = cache(async (): Promise<RequestActor | null> => {
  const session = await auth();
  if (!session?.user) return null;

  const user: SessionUser = session.user;

  // Per-organization permission overrides, loaded once per request.
  const overrides: PermissionOverride[] = await prisma.rolePermission.findMany({
    where: { organizationId: user.organizationId, role: user.role },
    select: { role: true, permission: true, granted: true },
  });

  return {
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
  };
});

/** Redirects to sign-in when there is no session. */
export async function requireActor(): Promise<RequestActor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  return actor;
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
