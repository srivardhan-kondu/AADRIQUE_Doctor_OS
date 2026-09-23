import "server-only";
import type { QueuePriority } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { RequestActor } from "@/server/context";
import { startOfDay } from "@/server/rules/appointments";
import {
  ACTIVE_STATUSES,
  WAITING_STATUSES,
} from "@/server/rules/queue";
import { getQueueBoards } from "./queue";

/**
 * Spec §12 — patient-facing queue.
 *
 * Both surfaces here are seen by the public, so both carry token numbers and
 * timings only. A name, a reason for the visit or a patient ID never reaches
 * either one.
 */

export interface DisplayPanel {
  doctorId: string;
  doctorName: string;
  department: string | null;
  room: string | null;
  paused: boolean;
  nowServing: string | null;
  next: string[];
  waiting: number;
  /** For someone joining the line now. */
  estimatedWaitMinutes: number;
}

/** The waiting-room screen: every doctor who is working or has a line. */
export async function getWaitingRoomDisplay(
  actor: RequestActor,
): Promise<{ facility: string; panels: DisplayPanel[] }> {
  const boards = await getQueueBoards(actor);

  return {
    facility: actor.facilityName,
    panels: boards
      .filter((b) => b.online || b.active || b.waiting.length > 0)
      .map((b) => ({
        doctorId: b.doctorId,
        doctorName: b.doctorName,
        department: b.department,
        room: b.room,
        paused: b.paused,
        nowServing: b.currentToken,
        next: b.waiting.slice(0, 3).map((e) => e.token),
        waiting: b.waiting.length,
        estimatedWaitMinutes: b.waiting.length * b.consultationMinutes,
      })),
  };
}

export interface TokenStatus {
  token: string;
  state: "waiting" | "called" | "done" | "left" | "expired";
  nowServing: string | null;
  /** Patients who will be called before this one. */
  ahead: number;
  estimatedWaitMinutes: number;
  doctorName: string;
  room: string | null;
  facility: string;
  paused: boolean;
}

const PRIORITY_RANK: Record<QueuePriority, number> = {
  EMERGENCY: 0,
  PRIORITY: 1,
  NORMAL: 2,
};

/**
 * A patient's own token, opened from a signed link (see signed-link.ts). No
 * actor: the signature is the authorization, and the answer is token
 * numbers only. The order matches `callNext` — priority, then position — so
 * "ahead of you" is who will actually be called first.
 */
export async function getTokenStatus(entryId: string): Promise<TokenStatus | null> {
  const entry = await prisma.queueEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      token: true,
      status: true,
      queue: {
        select: {
          id: true,
          date: true,
          status: true,
          roomLabel: true,
          facility: { select: { name: true } },
          doctor: {
            select: {
              consultationMinutes: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!entry) return null;

  const { queue } = entry;
  const base = {
    token: entry.token,
    doctorName: queue.doctor.user.name,
    room: queue.roomLabel,
    facility: queue.facility.name,
    paused: queue.status === "PAUSED",
  };

  // `Queue.date` is a date column. Prisma stores the UTC calendar date of the
  // instant it is given, and every queue is written and looked up with local
  // midnight — so "today's queue" is the one whose stored date matches local
  // midnight read the same way, not local midnight itself.
  const today = startOfDay(new Date()).toISOString().slice(0, 10);
  if (queue.date.toISOString().slice(0, 10) !== today) {
    return { ...base, state: "expired", nowServing: null, ahead: 0, estimatedWaitMinutes: 0 };
  }

  const [line, active] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { queueId: queue.id, status: { in: [...WAITING_STATUSES] } },
      select: { id: true, priority: true, position: true },
    }),
    prisma.queueEntry.findFirst({
      where: { queueId: queue.id, status: { in: [...ACTIVE_STATUSES] } },
      select: { token: true },
    }),
  ]);

  line.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.position - b.position,
  );

  const index = line.findIndex((e) => e.id === entry.id);
  const state: TokenStatus["state"] =
    index >= 0
      ? "waiting"
      : ACTIVE_STATUSES.includes(entry.status)
        ? "called"
        : entry.status === "COMPLETED"
          ? "done"
          : "left";

  const ahead = Math.max(index, 0);

  return {
    ...base,
    state,
    nowServing: active?.token ?? null,
    ahead,
    estimatedWaitMinutes:
      state === "waiting" ? ahead * queue.doctor.consultationMinutes : 0,
  };
}
