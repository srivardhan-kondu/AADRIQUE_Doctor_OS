import { Permission, Role } from "@/generated/prisma/enums";
import { ROLE_PERMISSIONS } from "./matrix";

export { ROLE_PERMISSIONS };
export { Permission, Role };

/**
 * Spec §21 + §22 — authorization.
 *
 * Two independent checks guard every protected operation, and both must pass:
 *
 *   1. Tenant  — does this actor belong to the organization that owns the
 *                record? (`assertTenant`)
 *   2. Permission — is this actor's role allowed to do this? (`assertPermission`)
 *
 * Neither is ever inferred from a value the client supplied. The actor is
 * built on the server from the session.
 */

/** A per-organization override read from the `RolePermission` table. */
export interface PermissionOverride {
  role: Role;
  permission: Permission;
  granted: boolean;
}

/**
 * The authenticated actor, resolved server-side from the session. `facilityId`
 * is set when the membership is scoped to one facility; null means the actor
 * can act across every facility in the organization.
 */
export interface Actor {
  userId: string;
  organizationId: string;
  facilityId: string | null;
  role: Role;
  /** Overrides for this organization, already loaded. */
  overrides?: readonly PermissionOverride[];
}

/** Thrown when the actor's role does not allow the operation. */
export class PermissionError extends Error {
  readonly code = "FORBIDDEN";
  constructor(readonly permission: Permission, readonly role: Role) {
    super(`Role ${role} does not have permission ${permission}`);
    this.name = "PermissionError";
  }
}

/** Thrown when a record belongs to a different organization (spec §22). */
export class TenantError extends Error {
  readonly code = "CROSS_TENANT";
  constructor() {
    // Deliberately says nothing about the record. Confirming that an id exists
    // in another tenant is itself a leak.
    super("Record not found");
    this.name = "TenantError";
  }
}

/**
 * Effective permissions for a role: the default matrix, then per-organization
 * overrides applied on top. An override with `granted: false` removes a
 * permission the matrix allows.
 */
export function effectivePermissions(
  role: Role,
  overrides: readonly PermissionOverride[] = [],
): ReadonlySet<Permission> {
  const result = new Set<Permission>(ROLE_PERMISSIONS[role]);

  for (const override of overrides) {
    if (override.role !== role) continue;
    if (override.granted) result.add(override.permission);
    else result.delete(override.permission);
  }

  return result;
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return effectivePermissions(actor.role, actor.overrides).has(permission);
}

export function hasAllPermissions(
  actor: Actor,
  permissions: readonly Permission[],
): boolean {
  const effective = effectivePermissions(actor.role, actor.overrides);
  return permissions.every((p) => effective.has(p));
}

export function hasAnyPermission(
  actor: Actor,
  permissions: readonly Permission[],
): boolean {
  const effective = effectivePermissions(actor.role, actor.overrides);
  return permissions.some((p) => effective.has(p));
}

/** Throws unless the actor holds `permission`. */
export function assertPermission(
  actor: Actor,
  permission: Permission,
): void {
  if (!hasPermission(actor, permission)) {
    throw new PermissionError(permission, actor.role);
  }
}

/**
 * Throws unless `record` belongs to the actor's organization.
 *
 * Accepts null/undefined so a "not found" and a "belongs to another tenant"
 * are indistinguishable to the caller — both raise the same error with the
 * same message.
 */
export function assertTenant(
  actor: Actor,
  record: { organizationId: string } | null | undefined,
): asserts record is { organizationId: string } {
  if (!record || record.organizationId !== actor.organizationId) {
    throw new TenantError();
  }
}

/**
 * The organization filter to spread into every `where` clause.
 *
 * Using this rather than writing `organizationId` by hand keeps the tenant
 * boundary greppable: a query in src/server/ without `tenantScope` is a bug.
 */
export function tenantScope(actor: Actor): { organizationId: string } {
  return { organizationId: actor.organizationId };
}

/**
 * Narrows a query to the actor's facility when their membership is scoped to
 * one. An organization-wide membership returns only the tenant filter.
 */
export function facilityScope(
  actor: Actor,
): { organizationId: string; facilityId?: string } {
  return actor.facilityId
    ? { organizationId: actor.organizationId, facilityId: actor.facilityId }
    : { organizationId: actor.organizationId };
}
