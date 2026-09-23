import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { BookAppointmentDialog } from "@/components/appointments/book-dialog";
import { ScheduleNav } from "@/components/appointments/schedule-nav";
import { ScheduleBoard } from "@/components/appointments/schedule-view";
import { requireActor, requireDoctorId } from "@/server/context";
import { getSchedule } from "@/server/services/appointments";

export const metadata: Metadata = { title: "Appointments" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ date?: string; view?: string }>;
}

export default function AppointmentsPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<ScheduleSkeleton />}>
        <ScheduleScreen searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

async function ScheduleScreen({ searchParams }: PageProps) {
  const params = await searchParams;
  const actor = await requireActor();
  const doctorId = await requireDoctorId(actor);

  // A date from the URL is untrusted input like any other: parsed, and
  // silently replaced with today when it is not a real date.
  const view = params.view === "week" ? "week" : "day";
  const parsed = params.date ? new Date(`${params.date}T00:00:00`) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const schedule = await getSchedule(actor, doctorId, { date, view });

  return (
    <>
      <PageHeader
        title="Appointments"
        description={describe(schedule.summary, view)}
        actions={
          <>
            <ScheduleNav date={isoOf(date)} view={view} />
            <BookAppointmentDialog defaultDate={isoOf(date)} />
          </>
        }
      />

      <p className="pb-5 font-display text-[15px] font-semibold">
        {view === "week"
          ? `Week of ${schedule.days[0].date.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
            })}`
          : date.toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
      </p>

      <ScheduleBoard schedule={schedule} />
    </>
  );
}

/** Spec §35 rule 1 — the subtitle carries the state, so the page does not. */
function describe(
  summary: {
    total: number;
    scheduled: number;
    checkedIn: number;
    completed: number;
    cancelled: number;
    noShow: number;
  },
  view: "day" | "week",
): string {
  if (summary.total === 0) {
    return view === "week"
      ? "Nothing is booked this week."
      : "Nothing is booked on this day.";
  }

  const parts = [`${summary.total} booked`];
  if (summary.checkedIn > 0) parts.push(`${summary.checkedIn} in the building`);
  if (summary.completed > 0) parts.push(`${summary.completed} seen`);
  if (summary.noShow > 0) parts.push(`${summary.noShow} no show`);
  if (summary.cancelled > 0) parts.push(`${summary.cancelled} cancelled`);

  return parts.join(" · ");
}

function isoOf(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function ScheduleSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-5 h-5 w-56" />
      <div className="space-y-5">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </>
  );
}
