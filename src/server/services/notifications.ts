import "server-only";
import type { NotificationLevel } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { RequestActor } from "@/server/context";

/**
 * Spec §20 — the notification center.
 *
 * A notification belongs to one person. Every query is scoped to the actor's
 * own user id inside their organization, so there is no permission to hold:
 * nobody can read or dismiss anyone else's.
 */

export interface NotificationRow {
  id: string;
  level: NotificationLevel;
  title: string;
  body: string;
  href: string | null;
  createdAt: Date;
  read: boolean;
}

function mine(actor: RequestActor) {
  return { organizationId: actor.organizationId, userId: actor.userId };
}

export async function listNotifications(
  actor: RequestActor,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<{ rows: NotificationRow[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { ...mine(actor), ...(options.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
    }),
    prisma.notification.count({ where: { ...mine(actor), readAt: null } }),
  ]);

  return {
    rows: rows.map((n) => ({
      id: n.id,
      level: n.level,
      title: n.title,
      body: n.body,
      href: n.linkHref,
      createdAt: n.createdAt,
      read: n.readAt !== null,
    })),
    unread,
  };
}

/** Marks one as read. Someone else's id matches nothing and changes nothing. */
export async function markNotificationRead(
  actor: RequestActor,
  notificationId: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { ...mine(actor), id: notificationId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(actor: RequestActor): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { ...mine(actor), readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
