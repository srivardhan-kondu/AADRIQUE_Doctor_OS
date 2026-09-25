import "server-only";
import { prisma } from "@/lib/db";
import { ADD_ON_KEYS, type AddOn } from "@/lib/add-ons";
import { getFeatures } from "./features";
import type { RequestActor } from "@/server/context";
import type { ShellNotification } from "@/components/shell/notification-center";
import type { NavCounters } from "@/components/shell/sidebar";

/**
 * Data for the persistent chrome: nav counters and the notification tray.
 *
 * Scoped to the actor's organization, and to their own doctor profile where
 * the count is personal (their queue, their follow-ups).
 */

function relativeTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export async function getShellData(actor: RequestActor): Promise<{
  counters: NavCounters;
  notifications: ShellNotification[];
  online: boolean;
  lockedAddOns: AddOn[];
}> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const doctorFilter = actor.doctorId ? { doctorId: actor.doctorId } : {};

  const [queueCount, followUpCount, unreadMessages, notifications, doctor, features] =
    await Promise.all([
      prisma.queueEntry.count({
        where: {
          status: { in: ["WAITING", "VITALS", "CALLED"] },
          queue: {
            organizationId: actor.organizationId,
            date: { gte: start, lt: end },
            ...doctorFilter,
          },
        },
      }),
      prisma.followUp.count({
        where: {
          organizationId: actor.organizationId,
          ...doctorFilter,
          status: { in: ["PENDING", "SCHEDULED"] },
          dueDate: { lt: end },
        },
      }),
      prisma.message.count({
        where: {
          organizationId: actor.organizationId,
          direction: "INBOUND",
          readAt: null,
        },
      }),
      prisma.notification.findMany({
        where: { organizationId: actor.organizationId, userId: actor.userId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      actor.doctorId
        ? prisma.doctorProfile.findUnique({
            where: { id: actor.doctorId },
            select: { online: true },
          })
        : null,
      getFeatures(actor),
    ]);

  const unread = notifications.filter((n) => !n.readAt).length;

  return {
    counters: {
      queue: queueCount,
      followups: followUpCount,
      messages: unreadMessages,
      notifications: unread,
    },
    notifications: notifications.map((n) => ({
      id: n.id,
      level: n.level,
      title: n.title,
      body: n.body,
      at: relativeTime(n.createdAt),
      read: n.readAt !== null,
      href: n.linkHref,
    })),
    online: doctor?.online ?? true,
    lockedAddOns: ADD_ON_KEYS.filter((key) => !features.addOns[key]),
  };
}
