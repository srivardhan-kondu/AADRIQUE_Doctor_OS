import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { CallNextButton } from "@/components/queue/queue-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DailyBrief } from "@/components/dashboard/daily-brief";
import { LiveQueue } from "@/components/dashboard/live-queue";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PatientFlow } from "@/components/dashboard/patient-flow";
import { TodaySchedule } from "@/components/dashboard/today-schedule";
import { requireActor, requireDoctorId } from "@/server/context";
import { getDashboard } from "@/server/services/dashboard";

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
  const data = await getDashboard(actor, doctorId);

  return (
    <>
      <PageHeader
        title="Command Center"
        description={`${data.doctor.department ?? "OPD"}${
          data.doctor.room ? ` · ${data.doctor.room}` : ""
        }${data.doctor.counter ? ` · ${data.doctor.counter}` : ""}`}
        actions={
          <>
            <Badge variant={data.doctor.online ? "success" : "muted"}>
              {data.doctor.online ? "On duty" : "Away"}
            </Badge>
            {/* Spec §35 rule 1 — the next patient is one click from home. */}
            <CallNextButton waitingCount={data.metrics.waiting} />
          </>
        }
      />

      <div className="space-y-5">
        <DailyBrief
          brief={data.brief}
          pulse={data.pulse}
          nextPatient={data.nextPatient}
          doctorName={data.doctor.name}
        />

        {/* Spec §5.1 — top metrics. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Patients today"
            value={data.metrics.total}
            icon="patients"
          />
          <MetricCard
            label="Waiting"
            value={data.metrics.waiting}
            icon="waiting"
            tone="waiting"
            emphasis={data.pulse.state === "ATTENTION"}
            hint={
              data.metrics.waiting > 0
                ? `Longest ${data.pulse.longestWaitMinutes} min`
                : undefined
            }
          />
          <MetricCard
            label="In consultation"
            value={data.metrics.inConsultation}
            icon="consulting"
            tone="active"
          />
          <MetricCard
            label="Completed"
            value={data.metrics.completed}
            icon="completed"
            tone="done"
          />
          <MetricCard
            label="Follow-ups due"
            value={data.metrics.followUpsDue}
            icon="followup"
            tone="followup"
          />
        </div>

        <PatientFlow flow={data.flow} />

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
        <Skeleton className="h-[132px] rounded-xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[150px] rounded-xl" />
        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-[420px] rounded-xl" />
          <Skeleton className="h-[420px] rounded-xl" />
        </div>
      </div>
    </>
  );
}
