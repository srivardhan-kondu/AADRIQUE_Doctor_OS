import type { Role } from "@/generated/prisma/enums";
import type { Workspace } from "@/types";

/*
 * Which workspaces a role works in, and where it lands. Kept apart from the
 * nav (and its icons) so the sign-in path and the unit tests can load it.
 */

/**
 * Spec §3 — where each role starts its day. The front desk lands on the desk,
 * not on a doctor's command center it has no use for.
 */
export function homeFor(role: Role): string {
  switch (role) {
    case "HOSPITAL_ADMIN":
    case "SUPER_ADMIN":
      return "/admin";
    case "RECEPTIONIST":
    case "STAFF":
      return "/reception";
    case "NURSE":
      return "/nurse";
    default:
      return "/doctor";
  }
}

/**
 * The workspaces a role works in — what the palette offers to switch to, and
 * which return links sign-in will honour. Not an authorization boundary: every
 * screen still checks permissions on the server.
 */
export function workspacesFor(role: Role): Workspace[] {
  switch (role) {
    case "SUPER_ADMIN":
      return ["doctor", "nurse", "reception", "admin"];
    case "HOSPITAL_ADMIN":
      return ["admin", "reception"];
    case "RECEPTIONIST":
    case "STAFF":
      return ["reception"];
    case "NURSE":
      return ["nurse"];
    default:
      return ["doctor"];
  }
}

const WORKSPACE_PREFIXES = ["/doctor", "/nurse", "/reception", "/admin"];

/**
 * Where a sign-in lands. A return link survives only when it is a same-origin
 * path in one of the role's own workspaces: the link may have been left by
 * the last person on this computer, and a doctor must not start their day on
 * the front desk because a receptionist's session ran out there.
 */
export function landingFor(role: Role, next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return homeFor(role);
  const inWorkspace = WORKSPACE_PREFIXES.some(
    (prefix) => next === prefix || next.startsWith(`${prefix}/`) || next.startsWith(`${prefix}?`),
  );
  if (inWorkspace && !workspacesFor(role).includes(workspaceFromPath(next))) {
    return homeFor(role);
  }
  return next;
}

/** Resolves which workspace a pathname belongs to. */
export function workspaceFromPath(pathname: string): Workspace {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/reception")) return "reception";
  if (pathname.startsWith("/nurse")) return "nurse";
  return "doctor";
}
