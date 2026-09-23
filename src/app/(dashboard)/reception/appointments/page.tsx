import type { Metadata } from "next";
import { Suspense } from "react";
import { UserRoundX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { BookAppointmentDialog } from "@/components/appointments/book-dialog";
import { ScheduleNav } from "@/components/appointments/schedule-nav";
import { ScheduleBoard } from "@/components/appointments/schedule-view";
import { DoctorSwitch } from "@/components/reception/doctor-switch";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getSchedule } from "@/server/services/appointments";
import { listBookableDoctors } from "@/server/services/front-desk";

export const metadata: Metadata = { title: "Appointments" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ date?: string; view?: string; doctor?: string }>;
}

/**
 * Spec §11 + §13 — the front desk's view of the schedule.
 *
 * The same board the doctor sees, for whichever doctor the desk picks. Links
 * open the desk's patient page rather than the clinical record.
 */
export default function ReceptionAppointmentsPage({ searchParams }: PageProps) {
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

  if (!hasPermission(actor, Permission.APPOINTMENT_READ)) {
    return <NoAccess title="Appointments" what="to see appointments" />;
  }

  const doctors = await listBookableDoctors(actor);

  if (doctors.length === 0) {
    return (
      <>
        <PageHeader title="Appointments" />
        <Card className="border-dashed">
          <EmptyState
            icon={UserRoundX}
            title="No doctors set up yet"
            description="An administrator adds doctors and their clinic hours before anything can be booked."
          />
        </Card>
      </>
    );
  }

  // Both from the URL, so both are untrusted: an unknown doctor falls back to
  // the first one, an invalid date to today.
  const doctor =
    doctors.find((d) => d.id === params.doctor) ?? doctors[0];
  const view = params.view === "week" ? "week" : "day";
  const parsed = params.date ? new Date(`${params.date}T00:00:00`) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const schedule = await getSchedule(actor, doctor.id, { date, view });
  const { summary } = schedule;

  return (
    <>
      <PageHeader
        title="Appointments"
        description={
          summary.total === 0
            ? `Nothing booked with ${doctor.name} ${view === "week" ? "this week" : "on this day"}.`
            : `${summary.total} booked with ${doctor.name} · ${summary.checkedIn} in the building · ${summary.completed} seen`
        }
        actions={
          <>
            <DoctorSwitch doctors={doctors} value={doctor.id} />
            <ScheduleNav date={isoOf(date)} view={view} />
            <BookAppointmentDialog
              doctors={doctors}
              defaultDoctorId={doctor.id}
              defaultDate={isoOf(date)}
              openParam="book"
            />
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

      <ScheduleBoard
        schedule={schedule}
        links={{
          patientBase: "/reception/patients",
          showConsultations: false,
          doctors,
        }}
      />
    </>
  );
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
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-60 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-5 h-5 w-56" />
      <Skeleton className="h-96 rounded-xl" />
    </>
  );
}
