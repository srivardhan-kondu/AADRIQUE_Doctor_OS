import "server-only";
import { prisma } from "@/lib/db";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { notFound } from "./errors";

/**
 * Spec §16 — analytics.
 *
 * The rule the screen is built to is "avoid dashboard overload": one primary
 * trend, compact metric cards, small trend indicators. So this service returns
 * one series and a handful of scalars — not a warehouse.
 *
 * Every rate is computed against an explicit denominator and returns null when
 * that denominator is zero. A rate of "0%" and "nothing happened yet" are
 * different facts, and a metric card that cannot tell them apart will be
 * misread.
 */

export interface TrendPoint {
  date: Date;
  value: number;
}

export interface Metric {
  value: number | null;
  /** The same metric over the immediately preceding window. */
  previous: number | null;
  /** Percentage-point or absolute change, depending on the metric's unit. */
  delta: number | null;
  /** How many records the number was computed from. */
  sample: number;
}

function metric(
  value: number | null,
  previous: number | null,
  sample: number,
): Metric {
  return {
    value,
    previous,
    delta: value !== null && previous !== null ? round(value - previous) : null,
    sample,
  };
}

function round(n: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

function average(values: number[]): number | null {
  return values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The window shown, and the equal-length window before it for comparison. */
function windows(days: number) {
  const end = startOfDay(new Date());
  end.setDate(end.getDate() + 1);

  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);

  return { start, end, previousStart, previousEnd: start };
}

export interface DoctorAnalytics {
  range: { days: number; start: Date; end: Date };
  doctorName: string;
  /** Spec §16 — the one primary trend chart. */
  patientsPerDay: TrendPoint[];
  metrics: {
    patientsSeen: Metric;
    patientsPerDay: Metric;
    consultationMinutes: Metric;
    waitMinutes: Metric;
    completionRate: Metric;
    followUpRate: Metric;
    noShowRate: Metric;
    repeatRate: Metric;
  };
  feedback: {
    averageRating: number | null;
    responses: number;
    requested: number;
    /** Count per star, 1 → 5. */
    distribution: number[];
    recentComments: { rating: number | null; comment: string; at: Date }[];
  };
  /** Visits started per hour of the day, across the window. */
  peakHours: { hour: number; count: number }[];
  busiestHour: number | null;
}

/** Spec §16 — a doctor's own OPD performance. */
export async function getDoctorAnalytics(
  actor: RequestActor,
  doctorId: string,
  days = 30,
): Promise<DoctorAnalytics> {
  assertPermission(actor, Permission.ANALYTICS_READ);

  const { start, end, previousStart, previousEnd } = windows(days);

  const doctor = await prisma.doctorProfile.findFirst({
    where: { id: doctorId, facility: { organizationId: actor.organizationId } },
    select: { user: { select: { name: true } } },
  });
  if (!doctor) throw notFound("Doctor");

  const scope = { doctorId, ...tenantScope(actor) };

  const [
    visits,
    previousVisits,
    queueEntries,
    previousQueueEntries,
    appointments,
    previousAppointments,
    followUps,
    previousFollowUps,
    feedback,
  ] = await Promise.all([
    prisma.visit.findMany({
      where: { ...scope, startedAt: { gte: start, lt: end } },
      select: {
        patientId: true,
        startedAt: true,
        completedAt: true,
        status: true,
      },
    }),
    prisma.visit.findMany({
      where: { ...scope, startedAt: { gte: previousStart, lt: previousEnd } },
      select: {
        patientId: true,
        startedAt: true,
        completedAt: true,
        status: true,
      },
    }),
    prisma.queueEntry.findMany({
      where: {
        queue: { doctorId, organizationId: actor.organizationId },
        joinedAt: { gte: start, lt: end },
        calledAt: { not: null },
      },
      select: { joinedAt: true, calledAt: true, waitMinutes: true },
    }),
    prisma.queueEntry.findMany({
      where: {
        queue: { doctorId, organizationId: actor.organizationId },
        joinedAt: { gte: previousStart, lt: previousEnd },
        calledAt: { not: null },
      },
      select: { joinedAt: true, calledAt: true, waitMinutes: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { ...scope, scheduledStart: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { ...scope, scheduledStart: { gte: previousStart, lt: previousEnd } },
      _count: { _all: true },
    }),
    prisma.followUp.groupBy({
      by: ["status"],
      where: { ...scope, dueDate: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.followUp.groupBy({
      by: ["status"],
      where: { ...scope, dueDate: { gte: previousStart, lt: previousEnd } },
      _count: { _all: true },
    }),
    prisma.feedback.findMany({
      where: { ...scope, requestedAt: { gte: start, lt: end } },
      orderBy: { respondedAt: "desc" },
      select: { rating: true, comment: true, respondedAt: true },
    }),
  ]);

  // Spec §16 — the primary trend. Every day in the range appears, including
  // the empty ones, so a gap reads as a quiet day rather than disappearing.
  const buckets = new Map<number, number>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    buckets.set(day.getTime(), 0);
  }
  for (const visit of visits) {
    const key = startOfDay(visit.startedAt).getTime();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const patientsPerDay: TrendPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ date: new Date(time), value }));

  // Consultation length, from visits that actually finished.
  const durationOf = (v: { startedAt: Date; completedAt: Date | null }) =>
    v.completedAt
      ? (v.completedAt.getTime() - v.startedAt.getTime()) / 60_000
      : null;

  const durations = visits
    .map(durationOf)
    .filter((d): d is number => d !== null && d > 0 && d < 240);
  const previousDurations = previousVisits
    .map(durationOf)
    .filter((d): d is number => d !== null && d > 0 && d < 240);

  const waitOf = (e: {
    joinedAt: Date;
    calledAt: Date | null;
    waitMinutes: number | null;
  }) =>
    e.waitMinutes ??
    (e.calledAt ? (e.calledAt.getTime() - e.joinedAt.getTime()) / 60_000 : null);

  const waits = queueEntries
    .map(waitOf)
    .filter((w): w is number => w !== null && w >= 0 && w < 480);
  const previousWaits = previousQueueEntries
    .map(waitOf)
    .filter((w): w is number => w !== null && w >= 0 && w < 480);

  const countBy = (
    rows: { status: string; _count: { _all: number } }[],
    status: string,
  ) => rows.find((r) => r.status === status)?._count._all ?? 0;

  // No-show rate: of the appointments that resolved one way or the other.
  const noShowRateFor = (rows: { status: string; _count: { _all: number } }[]) => {
    const noShow = countBy(rows, "NO_SHOW");
    const seen = countBy(rows, "COMPLETED");
    return rate(noShow, noShow + seen);
  };

  const followUpRateFor = (
    rows: { status: string; _count: { _all: number } }[],
  ) => {
    const kept = countBy(rows, "COMPLETED");
    const resolved = kept + countBy(rows, "MISSED");
    return rate(kept, resolved);
  };

  const completionRateFor = (
    rows: { patientId: string; status: string }[],
  ) => rate(rows.filter((v) => v.status === "COMPLETED").length, rows.length);

  const repeatRateFor = (rows: { patientId: string }[]) => {
    const seen = new Map<string, number>();
    for (const row of rows) {
      seen.set(row.patientId, (seen.get(row.patientId) ?? 0) + 1);
    }
    const repeats = [...seen.values()].filter((n) => n > 1).length;
    return rate(repeats, seen.size);
  };

  const hours = new Map<number, number>();
  for (let hour = 8; hour <= 20; hour += 1) hours.set(hour, 0);
  for (const visit of visits) {
    const hour = visit.startedAt.getHours();
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }
  const peakHours = [...hours.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, count]) => ({ hour, count }));

  const busiest = peakHours.reduce<{ hour: number; count: number } | null>(
    (best, row) => (!best || row.count > best.count ? row : best),
    null,
  );

  const responded = feedback.filter((f) => f.rating !== null);
  const distribution = [1, 2, 3, 4, 5].map(
    (star) => responded.filter((f) => f.rating === star).length,
  );

  return {
    range: { days, start, end },
    doctorName: doctor.user.name,
    patientsPerDay,
    metrics: {
      patientsSeen: metric(visits.length, previousVisits.length, visits.length),
      patientsPerDay: metric(
        round(visits.length / days),
        round(previousVisits.length / days),
        visits.length,
      ),
      consultationMinutes: metric(
        average(durations),
        average(previousDurations),
        durations.length,
      ),
      waitMinutes: metric(average(waits), average(previousWaits), waits.length),
      completionRate: metric(
        completionRateFor(visits),
        completionRateFor(previousVisits),
        visits.length,
      ),
      followUpRate: metric(
        followUpRateFor(followUps),
        followUpRateFor(previousFollowUps),
        followUps.reduce((sum, f) => sum + f._count._all, 0),
      ),
      noShowRate: metric(
        noShowRateFor(appointments),
        noShowRateFor(previousAppointments),
        appointments.reduce((sum, a) => sum + a._count._all, 0),
      ),
      repeatRate: metric(
        repeatRateFor(visits),
        repeatRateFor(previousVisits),
        visits.length,
      ),
    },
    feedback: {
      averageRating: responded.length
        ? round(
            responded.reduce((sum, f) => sum + (f.rating ?? 0), 0) /
              responded.length,
          )
        : null,
      responses: responded.length,
      requested: feedback.length,
      distribution,
      recentComments: feedback
        .filter((f) => f.comment && f.respondedAt)
        .slice(0, 5)
        .map((f) => ({
          rating: f.rating,
          comment: f.comment as string,
          at: f.respondedAt as Date,
        })),
    },
    peakHours,
    busiestHour: busiest && busiest.count > 0 ? busiest.hour : null,
  };
}

export interface AdminAnalytics {
  range: { days: number; start: Date; end: Date };
  volumePerDay: TrendPoint[];
  metrics: {
    opdVolume: Metric;
    averageWait: Metric;
    cancellationRate: Metric;
    noShowRate: Metric;
    conversionRate: Metric;
    deliveryRate: Metric;
    followUpCompletion: Metric;
  };
  doctors: {
    doctorId: string;
    name: string;
    department: string | null;
    visits: number;
    /** Visits against the slots their availability offers, as a percentage. */
    utilization: number | null;
  }[];
  departments: { name: string; visits: number }[];
  peakHours: { hour: number; count: number }[];
}

/** Spec §16 — the hospital-wide view. */
export async function getAdminAnalytics(
  actor: RequestActor,
  days = 30,
): Promise<AdminAnalytics> {
  assertPermission(actor, Permission.ANALYTICS_READ);

  const { start, end, previousStart, previousEnd } = windows(days);
  const scope = tenantScope(actor);

  const [
    visits,
    previousVisits,
    queueEntries,
    previousQueueEntries,
    appointments,
    previousAppointments,
    messages,
    previousMessages,
    followUps,
    previousFollowUps,
    doctors,
  ] = await Promise.all([
    prisma.visit.findMany({
      where: { ...scope, startedAt: { gte: start, lt: end } },
      select: {
        startedAt: true,
        doctorId: true,
        department: { select: { name: true } },
      },
    }),
    prisma.visit.count({
      where: { ...scope, startedAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.queueEntry.findMany({
      where: {
        queue: scope,
        joinedAt: { gte: start, lt: end },
        calledAt: { not: null },
      },
      select: { joinedAt: true, calledAt: true, waitMinutes: true },
    }),
    prisma.queueEntry.findMany({
      where: {
        queue: scope,
        joinedAt: { gte: previousStart, lt: previousEnd },
        calledAt: { not: null },
      },
      select: { joinedAt: true, calledAt: true, waitMinutes: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { ...scope, scheduledStart: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { ...scope, scheduledStart: { gte: previousStart, lt: previousEnd } },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["status"],
      where: { ...scope, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["status"],
      where: { ...scope, createdAt: { gte: previousStart, lt: previousEnd } },
      _count: { _all: true },
    }),
    prisma.followUp.groupBy({
      by: ["status"],
      where: { ...scope, dueDate: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.followUp.groupBy({
      by: ["status"],
      where: { ...scope, dueDate: { gte: previousStart, lt: previousEnd } },
      _count: { _all: true },
    }),
    prisma.doctorProfile.findMany({
      where: { facility: { organizationId: actor.organizationId } },
      select: {
        id: true,
        consultationMinutes: true,
        user: { select: { name: true } },
        department: { select: { name: true } },
        availability: {
          where: { isBlock: false },
          select: { startMinute: true, endMinute: true },
        },
      },
    }),
  ]);

  const buckets = new Map<number, number>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    buckets.set(day.getTime(), 0);
  }
  for (const visit of visits) {
    const key = startOfDay(visit.startedAt).getTime();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const volumePerDay: TrendPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ date: new Date(time), value }));

  const waitOf = (e: {
    joinedAt: Date;
    calledAt: Date | null;
    waitMinutes: number | null;
  }) =>
    e.waitMinutes ??
    (e.calledAt ? (e.calledAt.getTime() - e.joinedAt.getTime()) / 60_000 : null);

  const waits = queueEntries
    .map(waitOf)
    .filter((w): w is number => w !== null && w >= 0 && w < 480);
  const previousWaits = previousQueueEntries
    .map(waitOf)
    .filter((w): w is number => w !== null && w >= 0 && w < 480);

  const countBy = (
    rows: { status: string; _count: { _all: number } }[],
    status: string,
  ) => rows.find((r) => r.status === status)?._count._all ?? 0;

  const totalOf = (rows: { _count: { _all: number } }[]) =>
    rows.reduce((sum, r) => sum + r._count._all, 0);

  const cancellationRateFor = (
    rows: { status: string; _count: { _all: number } }[],
  ) => rate(countBy(rows, "CANCELLED"), totalOf(rows));

  const noShowRateFor = (rows: { status: string; _count: { _all: number } }[]) => {
    const noShow = countBy(rows, "NO_SHOW");
    const seen = countBy(rows, "COMPLETED");
    return rate(noShow, noShow + seen);
  };

  // Conversion: booked appointments that became a real consultation.
  const conversionRateFor = (
    rows: { status: string; _count: { _all: number } }[],
  ) => rate(countBy(rows, "COMPLETED"), totalOf(rows));

  const deliveryRateFor = (
    rows: { status: string; _count: { _all: number } }[],
  ) => {
    const delivered = countBy(rows, "DELIVERED") + countBy(rows, "READ");
    const attempted = delivered + countBy(rows, "SENT") + countBy(rows, "FAILED");
    return rate(delivered, attempted);
  };

  const followUpCompletionFor = (
    rows: { status: string; _count: { _all: number } }[],
  ) => {
    const kept = countBy(rows, "COMPLETED");
    return rate(kept, kept + countBy(rows, "MISSED"));
  };

  const visitsByDoctor = new Map<string, number>();
  for (const visit of visits) {
    visitsByDoctor.set(
      visit.doctorId,
      (visitsByDoctor.get(visit.doctorId) ?? 0) + 1,
    );
  }

  // Utilization is visits against the slots the doctor's recurring
  // availability offers over the same window — a rough measure, and labelled
  // as one on the screen.
  const weeks = days / 7;
  const doctorRows = doctors
    .map((doctor) => {
      const weeklyMinutes = doctor.availability.reduce(
        (sum, slot) => sum + (slot.endMinute - slot.startMinute),
        0,
      );
      const slots = Math.floor(
        (weeklyMinutes * weeks) / doctor.consultationMinutes,
      );
      const seen = visitsByDoctor.get(doctor.id) ?? 0;

      return {
        doctorId: doctor.id,
        name: doctor.user.name,
        department: doctor.department?.name ?? null,
        visits: seen,
        utilization: slots > 0 ? Math.round((seen / slots) * 100) : null,
      };
    })
    .sort((a, b) => b.visits - a.visits);

  const departmentVisits = new Map<string, number>();
  for (const visit of visits) {
    const name = visit.department?.name ?? "Unassigned";
    departmentVisits.set(name, (departmentVisits.get(name) ?? 0) + 1);
  }

  const hours = new Map<number, number>();
  for (let hour = 8; hour <= 20; hour += 1) hours.set(hour, 0);
  for (const visit of visits) {
    const hour = visit.startedAt.getHours();
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }

  return {
    range: { days, start, end },
    volumePerDay,
    metrics: {
      opdVolume: metric(visits.length, previousVisits, visits.length),
      averageWait: metric(average(waits), average(previousWaits), waits.length),
      cancellationRate: metric(
        cancellationRateFor(appointments),
        cancellationRateFor(previousAppointments),
        totalOf(appointments),
      ),
      noShowRate: metric(
        noShowRateFor(appointments),
        noShowRateFor(previousAppointments),
        totalOf(appointments),
      ),
      conversionRate: metric(
        conversionRateFor(appointments),
        conversionRateFor(previousAppointments),
        totalOf(appointments),
      ),
      deliveryRate: metric(
        deliveryRateFor(messages),
        deliveryRateFor(previousMessages),
        totalOf(messages),
      ),
      followUpCompletion: metric(
        followUpCompletionFor(followUps),
        followUpCompletionFor(previousFollowUps),
        totalOf(followUps),
      ),
    },
    doctors: doctorRows,
    departments: [...departmentVisits.entries()]
      .map(([name, count]) => ({ name, visits: count }))
      .sort((a, b) => b.visits - a.visits),
    peakHours: [...hours.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, count]) => ({ hour, count })),
  };
}
