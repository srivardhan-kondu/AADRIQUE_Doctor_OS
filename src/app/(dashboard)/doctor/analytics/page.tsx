import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { ColumnChart } from "@/components/analytics/column-chart";
import { FeedbackPanel } from "@/components/analytics/feedback-panel";
import { MetricTile } from "@/components/analytics/metric-tile";
import { RangeSwitch } from "@/components/analytics/range-switch";
import { TrendChart } from "@/components/analytics/trend-chart";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor, requireDoctorId } from "@/server/context";
import { getDoctorAnalytics } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

export default function AnalyticsPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsScreen searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

const RANGES = [7, 30, 90];

async function AnalyticsScreen({ searchParams }: PageProps) {
  const params = await searchParams;
  const actor = await requireActor();

  // Nurses share the doctor workspace but not its analytics, so the refusal
  // is shown as a screen rather than raised as an error (spec §21, §38).
  if (!hasPermission(actor, Permission.ANALYTICS_READ)) {
    return <NoAccess title="Analytics" what="to see OPD analytics" />;
  }

  const doctorId = await requireDoctorId(actor);

  const requested = Number(params.days);
  const days = RANGES.includes(requested) ? requested : 30;

  const analytics = await getDoctorAnalytics(actor, doctorId, days);
  const { metrics } = analytics;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Your OPD over the last ${days} days, against the ${days} before it.`}
        actions={<RangeSwitch days={days} />}
      />

      {/* Spec §16 — one primary trend, then compact cards. */}
      <Card className="mb-5">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Patients seen per day</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {metrics.patientsSeen.value ?? 0} consultations, averaging{" "}
              <span className="tabular">{metrics.patientsPerDay.value ?? 0}</span>{" "}
              a day.
            </p>
          </div>
        </CardHeader>

        <div className="px-3 pb-3">
          <TrendChart
            data={analytics.patientsPerDay.map((point) => ({
              date: point.date.toISOString(),
              value: point.value,
            }))}
            label={`Patients seen per day over the last ${days} days`}
          />
        </div>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Avg consultation"
          metric={metrics.consultationMinutes}
          unit=" min"
          betterWhen="neutral"
        />
        <MetricTile
          label="Avg wait"
          metric={metrics.waitMinutes}
          unit=" min"
          betterWhen="lower"
        />
        <MetricTile
          label="Completion rate"
          metric={metrics.completionRate}
          unit="%"
          betterWhen="higher"
        />
        <MetricTile
          label="No-show rate"
          metric={metrics.noShowRate}
          unit="%"
          betterWhen="lower"
          hint="No appointments resolved yet"
        />
        <MetricTile
          label="Follow-up rate"
          metric={metrics.followUpRate}
          unit="%"
          betterWhen="higher"
          hint="No follow-ups fell due yet"
        />
        <MetricTile
          label="Repeat patients"
          metric={metrics.repeatRate}
          unit="%"
          betterWhen="higher"
        />
        <MetricTile
          label="Patients seen"
          metric={metrics.patientsSeen}
          betterWhen="higher"
        />
        <MetricTile
          label="Per day"
          metric={metrics.patientsPerDay}
          betterWhen="higher"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>When your patients arrive</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {analytics.busiestHour === null
                ? "Not enough consultations to see a pattern yet."
                : `Busiest around ${formatHour(analytics.busiestHour)}.`}
            </p>
          </CardHeader>

          <div className="px-5 pb-5">
            <ColumnChart
              data={analytics.peakHours.map((row) => ({
                label: shortHour(row.hour),
                caption: formatHour(row.hour),
                value: row.count,
              }))}
              highlight={
                analytics.busiestHour === null
                  ? null
                  : analytics.peakHours.findIndex(
                      (row) => row.hour === analytics.busiestHour,
                    )
              }
              emptyText="No consultations in this period."
            />
          </div>
        </Card>

        <FeedbackPanel feedback={analytics.feedback} />
      </div>
    </>
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function shortHour(hour: number): string {
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return String(display);
}

function AnalyticsSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-56 rounded-md" />
      </div>
      <Skeleton className="mb-5 h-[288px] rounded-xl" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[102px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </>
  );
}
