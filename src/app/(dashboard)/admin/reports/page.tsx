import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { ColumnChart } from "@/components/analytics/column-chart";
import { MetricTile } from "@/components/analytics/metric-tile";
import { RangeSwitch } from "@/components/analytics/range-switch";
import { TrendChart } from "@/components/analytics/trend-chart";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getAdminAnalytics } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Reports" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

export default function ReportsPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsScreen searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

const RANGES = [7, 30, 90];

async function ReportsScreen({ searchParams }: PageProps) {
  const params = await searchParams;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ANALYTICS_READ)) {
    return (
      <NoAccess
        title="Reports"
        what="to see hospital analytics"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const requested = Number(params.days);
  const days = RANGES.includes(requested) ? requested : 30;

  const analytics = await getAdminAnalytics(actor, days);
  const { metrics } = analytics;

  const busiest = analytics.peakHours.reduce(
    (best, row, index) =>
      row.count > analytics.peakHours[best].count ? index : best,
    0,
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${actor.organizationName} over the last ${days} days, against the ${days} before it.`}
        actions={<RangeSwitch days={days} />}
      />

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>OPD volume per day</CardTitle>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {metrics.opdVolume.value ?? 0} consultations across every
            department.
          </p>
        </CardHeader>

        <div className="px-3 pb-3">
          <TrendChart
            data={analytics.volumePerDay.map((point) => ({
              date: point.date.toISOString(),
              value: point.value,
            }))}
            label={`OPD volume per day over the last ${days} days`}
            valueLabel="consultations"
          />
        </div>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="OPD volume"
          metric={metrics.opdVolume}
          betterWhen="higher"
        />
        <MetricTile
          label="Avg wait"
          metric={metrics.averageWait}
          unit=" min"
          betterWhen="lower"
        />
        <MetricTile
          label="Appointment conversion"
          metric={metrics.conversionRate}
          unit="%"
          betterWhen="higher"
          hint="No appointments in this period"
        />
        <MetricTile
          label="Cancellation rate"
          metric={metrics.cancellationRate}
          unit="%"
          betterWhen="lower"
        />
        <MetricTile
          label="No-show rate"
          metric={metrics.noShowRate}
          unit="%"
          betterWhen="lower"
          hint="No appointments resolved yet"
        />
        <MetricTile
          label="Message delivery"
          metric={metrics.deliveryRate}
          unit="%"
          betterWhen="higher"
          hint="Nothing was sent in this period"
        />
        <MetricTile
          label="Follow-up completion"
          metric={metrics.followUpCompletion}
          unit="%"
          betterWhen="higher"
          hint="No follow-ups fell due yet"
        />
        <MetricTile
          label="Departments active"
          metric={{
            value: analytics.departments.length,
            previous: null,
            delta: null,
            sample: analytics.departments.length,
          }}
          betterWhen="neutral"
          hint="Seeing patients in this period"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Doctor utilisation</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Consultations against the slots each doctor&rsquo;s recurring
              availability offers. A rough measure — leave, blocks and
              overruns are not in it.
            </p>
          </CardHeader>

          <ul className="divide-y divide-border border-t border-border">
            {analytics.doctors.map((doctor) => (
              <li
                key={doctor.doctorId}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">
                    {doctor.name}
                  </p>
                  {doctor.department && (
                    <p className="text-[11px] text-muted-foreground">
                      {doctor.department}
                    </p>
                  )}
                </div>

                <span className="w-12 text-right text-[13px] font-semibold tabular">
                  {doctor.visits}
                </span>

                <div className="w-24 shrink-0">
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={
                      doctor.utilization === null
                        ? "No availability recorded"
                        : `${doctor.utilization}% utilised`
                    }
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.min(100, doctor.utilization ?? 0)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-right text-[10px] tabular text-muted-foreground">
                    {doctor.utilization === null
                      ? "no hours set"
                      : `${doctor.utilization}%`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Department volume</CardTitle>
            </CardHeader>

            {analytics.departments.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted-foreground">
                No consultations in this period.
              </p>
            ) : (
              <ul className="space-y-2 px-5 pb-5">
                {analytics.departments.map((department) => (
                  <li
                    key={department.name}
                    className="flex items-center gap-3"
                  >
                    <span className="w-36 shrink-0 truncate text-[13px]">
                      {department.name}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: `${
                            (department.visits /
                              analytics.departments[0].visits) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-[12px] font-semibold tabular">
                      {department.visits}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Peak hours</CardTitle>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                When consultations actually start, across every doctor.
              </p>
            </CardHeader>

            <div className="px-5 pb-5">
              <ColumnChart
                data={analytics.peakHours.map((row) => ({
                  label: shortHour(row.hour),
                  caption: formatHour(row.hour),
                  value: row.count,
                }))}
                highlight={busiest}
                emptyText="No consultations in this period."
              />
            </div>
          </Card>
        </div>
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

function ReportsSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between pb-6">
        <div>
          <Skeleton className="h-8 w-32" />
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
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </>
  );
}
