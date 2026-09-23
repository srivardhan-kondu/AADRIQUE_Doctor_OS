import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarPlus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { BookAppointmentDialog } from "@/components/appointments/book-dialog";
import { PatientSearch } from "@/components/patients/patient-search";
import { ArrivalsCard } from "@/components/reception/arrivals";
import { DeskResults } from "@/components/reception/desk-results";
import { DoctorStatusList } from "@/components/reception/doctor-status";
import { RegisterPatientDialog } from "@/components/reception/register-dialog";
import { WalkInDialog } from "@/components/reception/walk-in-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import {
  getFrontDeskDay,
  listBookableDoctors,
} from "@/server/services/front-desk";
import { getQueueSignal } from "@/server/services/live";
import { searchPatients } from "@/server/services/patients";
import { getQueueBoards } from "@/server/services/queue";

export const metadata: Metadata = { title: "Front Desk" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Spec §13 — Front Desk Mode.
 *
 * One screen for the four things the desk does all day: find a patient,
 * register a new one, give a token, book an appointment. Arrivals and doctor
 * availability sit underneath and update by themselves (spec §54).
 */
export default function FrontDeskPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<DeskSkeleton />}>
        <Desk searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

async function Desk({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 120);
  const actor = await requireActor();

  if (
    !hasPermission(actor, Permission.QUEUE_READ) ||
    !hasPermission(actor, Permission.APPOINTMENT_READ)
  ) {
    return <NoAccess title="Front Desk" what="to work the front desk" />;
  }

  const [day, boards, doctors, signal, matches] = await Promise.all([
    getFrontDeskDay(actor),
    getQueueBoards(actor),
    listBookableDoctors(actor),
    getQueueSignal(actor, null),
    query ? searchPatients(actor, query, 8) : Promise.resolve(null),
  ]);

  const waiting = boards.reduce((sum, b) => sum + b.waiting.length, 0);
  const lines = boards.filter((b) => b.waiting.length > 0).length;

  return (
    <>
      <PageHeader
        title="Front Desk"
        description={
          day.counts.expected === 0 && waiting === 0
            ? "A quiet start. Nothing is booked yet today."
            : `${day.counts.arrived} of ${day.counts.expected} arrived · ${waiting} waiting${
                lines > 0 ? ` for ${lines} ${lines === 1 ? "doctor" : "doctors"}` : ""
              }`
        }
        actions={
          <>
            <LiveRefresh signal={signal} />
            {/* One accent action: the token, which the desk issues most. */}
            <RegisterPatientDialog
              openParam="register"
              trigger={
                <Button variant="outline">
                  <UserPlus />
                  Register
                </Button>
              }
            />
            <BookAppointmentDialog
              doctors={doctors}
              openParam="book"
              trigger={
                <Button variant="outline">
                  <CalendarPlus />
                  Book
                </Button>
              }
            />
            <WalkInDialog doctors={doctors} openParam="walk-in" />
          </>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">
            Search by name, mobile number, patient ID or appointment ID.
          </p>
          <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
            Focus search <Kbd>/</Kbd>
          </span>
        </div>
        <PatientSearch initial={q} />
        {matches && (
          <DeskResults query={query} patients={matches} doctors={doctors} />
        )}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Expected today" value={day.counts.expected} />
        <Stat label="Arrived" value={day.counts.arrived} />
        <Stat label="Still to come" value={day.counts.stillToCome} />
        <Stat label="Registered today" value={day.counts.registered} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <ArrivalsCard arrivals={day.arrivals} />
        <DoctorStatusList boards={boards} doctors={doctors} />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p data-numeric className="mt-1 font-display text-2xl font-bold tabular">
        {value}
      </p>
    </Card>
  );
}

function DeskSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-5 h-11 rounded-lg" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    </>
  );
}
