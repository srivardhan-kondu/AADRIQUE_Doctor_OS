import "server-only";
import { cookies } from "next/headers";
import {
  PORTAL_SESSION_MS,
  type PortalSession,
  decodePortalSession,
  encodePortalSession,
} from "@/lib/portal/tokens";
import { portalOrganization, resolvePortal } from "@/server/services/portal";

/**
 * The patient portal's session cookie. Separate from the staff session in
 * every way: its own name, scoped to one organization's portal path, signed,
 * HTTP-only, and checked against the records on every request.
 */

const COOKIE = "aadrique_portal";

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export async function writePortalSession(
  slug: string,
  session: Omit<PortalSession, "exp">,
): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encodePortalSession({ ...session, exp: Date.now() + PORTAL_SESSION_MS }, secret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/portal/${slug}`,
    maxAge: PORTAL_SESSION_MS / 1000,
  });
}

export async function clearPortalSession(slug: string): Promise<void> {
  (await cookies()).set(COOKIE, "", { path: `/portal/${slug}`, maxAge: 0 });
}

/**
 * The organization, and — when signed in — who the visitor is. `portal` is
 * null for a visitor who has not signed in, or whose session no longer
 * matches the records.
 */
export async function loadPortal(slug: string) {
  const organization = await portalOrganization(slug);
  if (!organization) return null;

  const session = decodePortalSession((await cookies()).get(COOKIE)?.value, secret());
  const portal = session ? await resolvePortal(session, organization.id) : null;
  return { organization, session, portal };
}

/** For actions: the signed-in patient, or an error the page can show. */
export async function requirePortalPatient(slug: string) {
  const loaded = await loadPortal(slug);
  if (!loaded?.portal?.patient) {
    throw new Error("Your session has ended. Sign in again.");
  }
  return {
    organizationId: loaded.organization.id,
    patientId: loaded.portal.patient.id,
  };
}
