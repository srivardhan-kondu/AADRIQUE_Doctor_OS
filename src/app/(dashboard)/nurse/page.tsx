import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, HeartPulse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { VitalsDialog } from "@/components/vitals/vitals-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getQueueSignal } from "@/server/services/live";
import { type StationPatient, getVitalsStation } from "@/server/services/vitals";

export const metadata: Metadata = { title: "Vitals Station" };

export const dynamic = "force-dynamic";

/**
 * Spec §5.1 — the nurse's workspace. Everyone in today's queues who is still
 * here, those without vitals first, so the next patient to measure is always
 * at the top.
 */
export default function NursePage() {
  return (
    <PageBody className="max-w-[1100px]">
      <Suspense fallback={<StationSkeleton />}>
        <Station />
      </Suspense>
    </PageBody>
  );
}

async function Station() {
  const actor = await requireActor();
  if (!hasPermission(actor, Permission.VITALS_READ)) {
    return <NoAccess title="Vitals Station" what="to see patients' vitals" />;
  }
  const canRecord = hasPermission(actor, Permission.VITALS_RECORD);

  const [patients, signal] = await Promise.all([getVitalsStation(actor), getQueueSignal(actor, null)]);
  const pending = patients.filter((p) => !p.vitals);
  const done = patients.filter((p) => p.vitals);

  return (
    <>
      <PageHeader
        title="Vitals Station"
        description={
          patients.length === 0
            ? "Nobody is in today's queues yet."
            : `${pending.length} to measure · ${done.length} done`
        }
        actions={<LiveRefresh signal={signal} />}
      />

      {patients.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No patients waiting"
          description="Patients appear here as the front desk issues tokens."
        />
      ) : (
        <div className="space-y-6">
          <Section title="To measure" patients={pending} canRecord={canRecord} />
          <Section title="Measured" patients={done} canRecord={canRecord} />
        </div>
      )}
    </>
  );
}

function Section({
  title,
  patients,
  canRecord,
}: {
  title: string;
  patients: StationPatient[];
  canRecord: boolean;
}) {
  if (patients.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <Card className="divide-y divide-border">
        {patients.map((p) => (
          <div key={p.queueEntryId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="w-14 shrink-0 font-mono text-[15px] font-bold">{p.token}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                <span>{p.patientName}</span>
                {p.priority !== "NORMAL" && (
                  <Badge variant={p.priority === "EMERGENCY" ? "destructive" : "warning"}>
                    {p.priority === "EMERGENCY" ? "Emergency" : "Priority"}
                  </Badge>
                )}
              </p>
              <p className="text-[12px] text-muted-foreground">
                <span className="font-mono">{p.mrn}</span>
                {p.age !== null && ` · ${p.age}y`} · <span className="capitalize">{p.gender.toLowerCase()}</span>
                {` · ${p.doctorName}`}
                {p.reason && ` · ${p.reason}`}
              </p>
              {p.allergies.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-destructive">
                  <AlertTriangle className="size-3.5" />
                  Allergies: {p.allergies.join(", ")}
                </p>
              )}
              {p.vitals && (
                <p className="mt-1 text-[12px]">
                  {p.vitals.summary}
                  {p.vitals.flags.map((f) => (
                    <Badge key={f} variant="warning" className="ml-1.5">
                      {f}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground">
                    {" · "}
                    {p.vitals.recordedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    {p.vitals.recordedBy && ` by ${p.vitals.recordedBy}`}
                  </span>
                </p>
              )}
            </div>
            <StatusChip
              tone={p.status === "IN_CONSULTATION" || p.status === "CALLED" ? "with-doctor" : p.status === "VITALS" ? "vitals" : "waiting"}
              label={p.status === "IN_CONSULTATION" || p.status === "CALLED" ? "With doctor" : p.status === "VITALS" ? "Vitals" : `Waiting ${p.waitMinutes}m`}
              className="shrink-0"
            />
            {canRecord && (
              <VitalsDialog target={{ queueEntryId: p.queueEntryId }} patientName={p.patientName} />
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}

function StationSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <Skeleton className="h-[320px] rounded-xl" />
    </>
  );
}
