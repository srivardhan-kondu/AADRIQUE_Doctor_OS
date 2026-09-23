import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";

/**
 * Spec §30 — audit logging.
 *
 * Every entry is written inside the same transaction as the change it records,
 * so a successful write can never leave an unlogged mutation behind. Pass the
 * transaction client as `tx`.
 *
 * Spec §50: the summary and metadata must not carry clinical free text. Record
 * what changed and to which record, never the contents of a note.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: RequestActor,
  entry: {
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      metadata: entry.metadata ?? {},
    },
  });
}

/* -------------------------------------------------------------------------
 * Reading the log (spec §30).
 *
 * Writes above go through a transaction client. Reads below are ordinary
 * queries, guarded by AUDIT_READ and the tenant scope — an audit trail that
 * could be read across organizations would be worse than none.
 * ---------------------------------------------------------------------- */

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  actorName: string;
  actorEmail: string | null;
  actorRole: Role | null;
  createdAt: Date;
  ipAddress: string | null;
}

export interface AuditFilters {
  action?: AuditAction;
  entityType?: string;
  userId?: string;
  /** Free text over the summary. */
  query?: string;
  days?: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** More rows exist beyond the ones returned. */
  hasMore: boolean;
  /** Counts per action over the window, for the filter row. */
  byAction: { action: AuditAction; count: number }[];
  total: number;
  actors: { id: string; name: string; count: number }[];
}

/** Spec §30 — who did what, to which record, and when. */
export async function listAuditLog(
  actor: RequestActor,
  filters: AuditFilters = {},
  limit = 100,
): Promise<AuditPage> {
  assertPermission(actor, Permission.AUDIT_READ);

  const days = filters.days ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const query = filters.query?.trim();

  const where: Prisma.AuditLogWhereInput = {
    ...tenantScope(actor),
    createdAt: { gte: since },
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(query
      ? {
          OR: [
            { summary: { contains: query, mode: "insensitive" } },
            { entityId: { contains: query } },
            { user: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total, byAction, actorGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // One more than asked for, so "there is more" needs no second count.
      take: limit + 1,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        createdAt: true,
        ipAddress: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            memberships: {
              where: { organizationId: actor.organizationId, active: true },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ["action"],
      where: { ...tenantScope(actor), createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditLog.groupBy({
      by: ["userId"],
      where: { ...tenantScope(actor), createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const userIds = actorGroups
    .map((g) => g.userId)
    .filter((id): id is string => id !== null);

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];

  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return {
    entries: rows.slice(0, limit).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      // A deleted user still has a trail; the trail must not lose its author.
      actorName: row.user?.name ?? "System",
      actorEmail: row.user?.email ?? null,
      actorRole: row.user?.memberships[0]?.role ?? null,
      createdAt: row.createdAt,
      ipAddress: row.ipAddress,
    })),
    hasMore: rows.length > limit,
    total,
    byAction: byAction
      .map((g) => ({ action: g.action, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    actors: actorGroups
      .filter((g) => g.userId !== null)
      .map((g) => ({
        id: g.userId as string,
        name: nameById.get(g.userId as string) ?? "Unknown",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Spec §30 — the trail for one record, shown beside the record itself. */
export async function getEntityHistory(
  actor: RequestActor,
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<AuditEntry[]> {
  assertPermission(actor, Permission.AUDIT_READ);

  const rows = await prisma.auditLog.findMany({
    where: { ...tenantScope(actor), entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      createdAt: true,
      ipAddress: true,
      user: {
        select: {
          name: true,
          email: true,
          memberships: {
            where: { organizationId: actor.organizationId, active: true },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    actorName: row.user?.name ?? "System",
    actorEmail: row.user?.email ?? null,
    actorRole: row.user?.memberships[0]?.role ?? null,
    createdAt: row.createdAt,
    ipAddress: row.ipAddress,
  }));
}

/** Spec §30 — readable labels for each logged action. */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  RECORD_CREATED: "Created",
  RECORD_UPDATED: "Updated",
  RECORD_VIEWED: "Viewed",
  RECORD_DELETED: "Deleted",
  PRESCRIPTION_CREATED: "Prescription created",
  CONSULTATION_SIGNED: "Consultation signed",
  AI_OUTPUT_GENERATED: "AI output generated",
  AI_OUTPUT_ACCEPTED: "AI output accepted",
  AI_OUTPUT_REJECTED: "AI output rejected",
  MESSAGE_SENT: "Message sent",
  INTEGRATION_CHANGED: "Integration changed",
  PERMISSION_CHANGED: "Permission changed",
};
