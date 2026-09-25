import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  Eye,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getOperations, type OperationalInsight } from "@/server/services/operations";

export const metadata: Metadata = { title: "Operations" };

export const dynamic = "force-dynamic";

export default function OperationsPage() {
  return (
    <PageBody>
      <Suspense fallback={<OperationsSkeleton />}>
        <OperationsScreen />
      </Suspense>
    </PageBody>
  );
}

async function OperationsScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ANALYTICS_READ)) {
    return (
      <NoAccess
        title="Operations"
        what="to see operational intelligence"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const ops = await getOperations(actor);
  const needsAttention = ops.insights.filter((i) => i.severity === "ATTENTION");

  return (
    <>
      <PageHeader
        title="Operations"
        description={`Where today is running slowly, and why · as of ${ops.asOf.toLocaleTimeString(
          "en-IN",
          { hour: "numeric", minute: "2-digit", hour12: true },
        )}`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Registered today" value={ops.today.registered} />
        <Stat
          label="Waiting now"
          value={ops.today.waiting}
          tone={needsAttention.length > 0 ? "warn" : undefined}
        />
        <Stat label="With a doctor" value={ops.today.inConsultation} />
        <Stat label="Completed" value={ops.today.completed} tone="good" />
        <Stat
          label="Longest wait"
          value={ops.today.longestWaitMinutes}
          suffix=" min"
          tone={ops.today.longestWaitMinutes > 25 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle>What needs attention</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Measured from the flow of the day. This is operational analytics,
              never a clinical judgement.
            </p>
          </CardHeader>

          <ul className="divide-y divide-border">
            {ops.insights.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        </Card>

        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Department load</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Longest wait against each department&rsquo;s own threshold.
            </p>
          </CardHeader>

          {ops.departments.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              No queue has opened today.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {ops.departments.map((department) => {
                const ratio = Math.min(
                  1,
                  department.longestWaitMinutes / department.thresholdMinutes,
                );

                return (
                  <li key={department.name} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold">{department.name}</p>
                      <p
                        className={cn(
                          "text-[12px] font-semibold tabular",
                          department.breaching ? "text-warning" : "text-muted-foreground",
                        )}
                      >
                        {department.longestWaitMinutes}
                        <span className="font-normal text-muted-foreground">
                          /{department.thresholdMinutes} min
                        </span>
                      </p>
                    </div>

                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${department.name}: longest wait ${department.longestWaitMinutes} of ${department.thresholdMinutes} minutes`}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full",
                          department.breaching ? "bg-warning" : "bg-accent",
                        )}
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>

                    <p className="mt-1 text-[11px] text-muted-foreground tabular">
                      {department.waiting} waiting · {department.inConsultation} with
                      a doctor · {department.completed} seen
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function InsightRow({ insight }: { insight: OperationalInsight }) {
  const Icon =
    insight.severity === "ATTENTION"
      ? TriangleAlert
      : insight.severity === "WATCH"
        ? Eye
        : CircleCheck;

  const tone = {
    ATTENTION: "bg-warning-soft text-warning",
    WATCH: "bg-info-soft text-info",
    STEADY: "bg-success-soft text-success",
  }[insight.severity];

  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-3.5">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
          tone,
        )}
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{insight.title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {insight.detail}
        </p>
      </div>

      {insight.action && (
        <Link
          href={insight.action.href}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
        >
          {insight.action.label}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </li>
  );
}

function Stat({
  label,
  value,
  suffix = "",
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "good" | "warn";
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[12px] font-medium text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-medium tabular",
          tone === "warn" && value > 0 && "text-warning",
          tone === "good" && value > 0 && "text-success",
        )}
      >
        {value}
        {suffix && (
          <span className="text-[15px] font-semibold text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </Card>
  );
}

function OperationsSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}
