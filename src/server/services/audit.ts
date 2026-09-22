import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";
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
