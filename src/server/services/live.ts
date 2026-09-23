import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { startOfDay } from "@/server/rules/appointments";

/**
 * Spec §23 + §54 — "queue updates without manual refresh".
 *
 * A screen showing today's queue polls for a signal: a short string that
 * changes whenever anything it shows could have changed — a token issued, a
 * patient called, a queue paused, an appointment checked in or cancelled. The
 * screen re-renders only when the signal moves, so an idle waiting room costs
 * three indexed aggregates every few seconds, not a full page render.
 *
 * Polling rather than a held-open connection is deliberate: it works on any
 * host, including serverless ones where a socket per open screen is costly,
 * and a few seconds of latency is well inside what a queue needs.
 */
export async function getQueueSignal(
  actor: RequestActor,
  doctorId: string | null,
): Promise<string> {
  assertPermission(actor, Permission.QUEUE_READ);

  const start = startOfDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const queueScope = {
    organizationId: actor.organizationId,
    date: { gte: start, lt: end },
    ...(doctorId ? { doctorId } : {}),
  };

  const [entries, queues, appointments] = await Promise.all([
    prisma.queueEntry.aggregate({
      where: { queue: queueScope },
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.queue.aggregate({
      where: queueScope,
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.appointment.aggregate({
      where: {
        organizationId: actor.organizationId,
        scheduledStart: { gte: start, lt: end },
        ...(doctorId ? { doctorId } : {}),
      },
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
  ]);

  // Counts catch a deletion the max timestamp would not.
  return [
    entries._count._all,
    entries._max.updatedAt?.getTime() ?? 0,
    queues._count._all,
    queues._max.updatedAt?.getTime() ?? 0,
    appointments._count._all,
    appointments._max.updatedAt?.getTime() ?? 0,
  ].join(".");
}
