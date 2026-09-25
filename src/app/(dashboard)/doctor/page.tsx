import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { CallNextButton } from "@/components/queue/queue-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { LiveQueue } from "@/components/dashboard/live-queue";
import { PatientFlow } from "@/components/dashboard/patient-flow";
import { TodaySchedule } from "@/components/dashboard/today-schedule";
import { requireActor, requireDoctorId } from "@/server/context";
import { getDashboard } from "@/server/services/dashboard";
import { getFeatures } from "@/server/services/features";
import { getQueueSignal } from "@/server/services/live";

export const metadata: Metadata = { title: "Command Center" };

/** Queue state changes constantly — never serve this from a cache. */
export const dynamic = "force-dynamic";

export default function DoctorHomePage() {
  return (
    <PageBody>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </PageBody>
  );
}

async function Dashboard() {
  const actor = await requireActor();
  const doctorId = await requireDoctorId(actor);
  const [data, signal, features] = await Promise.all([
    getDashboard(actor, doctorId),
    getQueueSignal(actor, doctorId),
    getFeatures(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Command Center"
        description={`${data.doctor.department ?? "OPD"}${
          data.doctor.room ? ` · ${data.doctor.room}` : ""
        }${data.doctor.counter ? ` · ${data.doctor.counter}` : ""}`}
        actions={
          <>
            <LiveRefresh signal={signal} doctorId={doctorId} />
            <Badge variant={data.doctor.online ? "success" : "muted"}>
              {data.doctor.online ? "On duty" : "Away"}
            </Badge>
            {/* Spec §35 rule 1 — the next patient is one click from home. */}
            <CallNextButton waitingCount={data.metrics.waiting} />
          </>
        }
      />

      <div className="space-y-5">
        {/* Spec §5.1 + §18 — the day's numbers and the brief, as one panel. */}
        <DailyBrief
          brief={data.brief}
          metrics={data.metrics}
          pulse={data.pulse}
          nextPatient={data.nextPatient}
          dayStarted={data.dayStarted}
          doctorName={data.doctor.name}
        />

        {/* Only for a clinic that sends patients through vitals first. */}
        {features.opd.vitalsStep && <PatientFlow flow={data.flow} />}

        {/* Queue leads, schedule sits beside it (spec §5.1). */}
        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <LiveQueue rows={data.queue} threshold={data.pulse.threshold} />
          <TodaySchedule rows={data.schedule} />
        </div>
      </div>
    </>
  );
}

/** Spec §37 — skeletons shaped like the real layout, never a generic spinner. */
function DashboardSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-[172px] rounded-xl" />
        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </div>
    </>
  );
}
