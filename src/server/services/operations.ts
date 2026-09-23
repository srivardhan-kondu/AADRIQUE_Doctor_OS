import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";

/**
 * Spec §17 — operational intelligence.
 *
 * "This is operational analytics, not medical decision-making." Every insight
 * here is derived from measurable facts about the flow of the day — wait
 * times, queue depth, consultation length, delivery failures — and each one
 * states the number it was drawn from, so an administrator can disagree with
 * it.
 *
 * Nothing here interprets a clinical record, and nothing here is generated.
 */

export type InsightSeverity = "ATTENTION" | "WATCH" | "STEADY";

export interface OperationalInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** The measurement behind the headline. */
  detail: string;
  /** What the administrator can do about it, and where. */
  action: { label: string; href: string } | null;
}

export interface DepartmentLoad {
  name: string;
  waiting: number;
  inConsultation: number;
  completed: number;
  longestWaitMinutes: number;
  averageWaitMinutes: number;
  thresholdMinutes: number;
  /** Over the configured wait threshold. */
  breaching: boolean;
}

export interface OperationsView {
  asOf: Date;
  insights: OperationalInsight[];
  departments: DepartmentLoad[];
  today: {
    registered: number;
    waiting: number;
    inConsultation: number;
    completed: number;
    noShows: number;
    averageWaitMinutes: number | null;
    longestWaitMinutes: number;
  };
  doctorsOnline: { total: number; online: number };
  failedMessages: number;
  staleIntegrations: { name: string; detail: string }[];
}

function minutesSince(date: Date): number {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
}

function average(values: number[]): number | null {
  return values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
}

export async function getOperations(
  actor: RequestActor,
): Promise<OperationsView> {
  assertPermission(actor, Permission.ANALYTICS_READ);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [queues, doctors, noShows, failedMessages, integrations, recentVisits] =
    await Promise.all([
      prisma.queue.findMany({
        where: { ...tenantScope(actor), date: { gte: start, lt: end } },
        select: {
          id: true,
          status: true,
          department: {
            select: { name: true, waitThresholdMinutes: true, queueCapacity: true },
          },
          entries: {
            select: {
              status: true,
              joinedAt: true,
              calledAt: true,
              waitMinutes: true,
            },
          },
        },
      }),
      prisma.doctorProfile.findMany({
        where: { facility: { organizationId: actor.organizationId } },
        select: { online: true },
      }),
      prisma.appointment.count({
        where: {
          ...tenantScope(actor),
          status: "NO_SHOW",
          scheduledStart: { gte: start, lt: end },
        },
      }),
      prisma.message.count({
        where: { ...tenantScope(actor), status: "FAILED", createdAt: { gte: start } },
      }),
      prisma.integration.findMany({
        where: {
          ...tenantScope(actor),
          status: { in: ["NEEDS_ATTENTION", "DISCONNECTED"] },
        },
        select: { name: true, lastError: true, status: true },
      }),
      // Consultation length over the last two hours, against the two before
      // it — the comparison spec §17's example is built on.
      prisma.visit.findMany({
        where: {
          ...tenantScope(actor),
          startedAt: { gte: new Date(Date.now() - 4 * 3_600_000) },
          completedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true, department: { select: { name: true } } },
      }),
    ]);

  const departments = new Map<string, DepartmentLoad>();
  const allWaits: number[] = [];

  let registered = 0;
  let waiting = 0;
  let inConsultation = 0;
  let completed = 0;
  let pausedQueues = 0;

  for (const queue of queues) {
    if (queue.status === "PAUSED") pausedQueues += 1;

    const name = queue.department?.name ?? "Unassigned";
    const threshold = queue.department?.waitThresholdMinutes ?? 20;

    const load = departments.get(name) ?? {
      name,
      waiting: 0,
      inConsultation: 0,
      completed: 0,
      longestWaitMinutes: 0,
      averageWaitMinutes: 0,
      thresholdMinutes: threshold,
      breaching: false,
    };

    const departmentWaits: number[] = [];

    for (const entry of queue.entries) {
      registered += 1;

      if (entry.status === "WAITING" || entry.status === "VITALS") {
        waiting += 1;
        load.waiting += 1;
        const wait = minutesSince(entry.joinedAt);
        departmentWaits.push(wait);
        allWaits.push(wait);
        load.longestWaitMinutes = Math.max(load.longestWaitMinutes, wait);
      } else if (entry.status === "IN_CONSULTATION" || entry.status === "CALLED") {
        inConsultation += 1;
        load.inConsultation += 1;
      } else if (entry.status === "COMPLETED") {
        completed += 1;
        load.completed += 1;
      }
    }

    load.averageWaitMinutes = average(departmentWaits) ?? 0;
    load.breaching = load.longestWaitMinutes > threshold;
    departments.set(name, load);
  }

  const insights: OperationalInsight[] = [];

  // 1. Wait time against the configured threshold, per department.
  for (const load of departments.values()) {
    if (!load.breaching) continue;

    insights.push({
      id: `wait-${load.name}`,
      severity: "ATTENTION",
      title: `${load.name} is over its wait threshold`,
      detail: `Longest wait is ${load.longestWaitMinutes} min against a ${load.thresholdMinutes} min threshold, with ${load.waiting} waiting.`,
      action: { label: "Open the queue", href: "/admin/operations" },
    });
  }

  // 2. Consultation length drifting — the bottleneck spec §17 names.
  const recent = recentVisits.filter(
    (v) => v.startedAt.getTime() >= Date.now() - 2 * 3_600_000,
  );
  const earlier = recentVisits.filter(
    (v) => v.startedAt.getTime() < Date.now() - 2 * 3_600_000,
  );

  const lengthOf = (rows: typeof recentVisits) =>
    average(
      rows
        .map((v) =>
          v.completedAt
            ? (v.completedAt.getTime() - v.startedAt.getTime()) / 60_000
            : null,
        )
        .filter((n): n is number => n !== null && n > 0 && n < 240),
    );

  const recentLength = lengthOf(recent);
  const earlierLength = lengthOf(earlier);

  if (
    recentLength !== null &&
    earlierLength !== null &&
    earlierLength > 0 &&
    recentLength > earlierLength * 1.2 &&
    recent.length >= 3
  ) {
    const change = Math.round(((recentLength - earlierLength) / earlierLength) * 100);
    const busiest = mostCommonDepartment(recent);

    insights.push({
      id: "consultation-length",
      severity: "WATCH",
      title: `Consultations are running ${change}% longer`,
      detail: `${recentLength} min on average in the last two hours, against ${earlierLength} min before that${
        busiest ? `. Most of them in ${busiest}` : ""
      }.`,
      action: { label: "See doctor utilisation", href: "/admin/reports" },
    });
  }

  // 3. Paused queues — nobody is being called.
  if (pausedQueues > 0) {
    insights.push({
      id: "paused-queues",
      severity: pausedQueues > 1 ? "ATTENTION" : "WATCH",
      title: `${pausedQueues} ${pausedQueues === 1 ? "queue is" : "queues are"} paused`,
      detail:
        "No tokens are being called on them. Patients already registered keep their position.",
      action: { label: "Open the front desk", href: "/reception/queue" },
    });
  }

  // 4. Messages failing today.
  if (failedMessages > 0) {
    insights.push({
      id: "failed-messages",
      severity: failedMessages >= 5 ? "ATTENTION" : "WATCH",
      title: `${failedMessages} ${failedMessages === 1 ? "message" : "messages"} failed to reach a patient today`,
      detail:
        "Failed sends are usually a wrong number or a channel the patient never opted into.",
      action: { label: "Open the inbox", href: "/doctor/messages?failed=1" },
    });
  }

  // 5. Integrations that need a look.
  for (const integration of integrations) {
    insights.push({
      id: `integration-${integration.name}`,
      severity: integration.status === "DISCONNECTED" ? "ATTENTION" : "WATCH",
      title: `${integration.name} ${integration.status === "DISCONNECTED" ? "is disconnected" : "needs attention"}`,
      detail: integration.lastError ?? "The last health check did not pass.",
      action: { label: "Open integrations", href: "/admin/integrations" },
    });
  }

  // 6. No-shows piling up.
  if (noShows >= 3) {
    insights.push({
      id: "no-shows",
      severity: "WATCH",
      title: `${noShows} no-shows today`,
      detail:
        "Reminder timing is the usual cause. Check that the confirmation workflow is enabled.",
      action: { label: "Open automations", href: "/admin/communications" },
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "steady",
      severity: "STEADY",
      title: "Nothing needs attention",
      detail:
        waiting > 0
          ? `${waiting} waiting, every department inside its wait threshold.`
          : "No queue is building, and every integration is reporting healthy.",
      action: null,
    });
  }

  return {
    asOf: new Date(),
    insights,
    departments: [...departments.values()].sort(
      (a, b) => b.longestWaitMinutes - a.longestWaitMinutes,
    ),
    today: {
      registered,
      waiting,
      inConsultation,
      completed,
      noShows,
      averageWaitMinutes: average(allWaits),
      longestWaitMinutes: allWaits.length ? Math.max(...allWaits) : 0,
    },
    doctorsOnline: {
      total: doctors.length,
      online: doctors.filter((d) => d.online).length,
    },
    failedMessages,
    staleIntegrations: integrations.map((i) => ({
      name: i.name,
      detail: i.lastError ?? "Health check did not pass",
    })),
  };
}

function mostCommonDepartment(
  visits: { department: { name: string } | null }[],
): string | null {
  const counts = new Map<string, number>();

  for (const visit of visits) {
    const name = visit.department?.name;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (!best || count > best.count) best = { name, count };
  }

  return best?.name ?? null;
}
