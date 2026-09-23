import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  ClipboardList,
  MessageSquare,
  Sparkles,
  Stethoscope,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getAdminAnalytics } from "@/server/services/analytics";
import { getOperations } from "@/server/services/operations";
import { listIntegrations } from "@/server/services/integrations";

export const metadata: Metadata = { title: "Overview" };

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  return (
    <PageBody>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewScreen />
      </Suspense>
    </PageBody>
  );
}

async function OverviewScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.ANALYTICS_READ)) {
    return (
      <NoAccess
        title="Overview"
        what="to see the hospital overview"
        backHref="/doctor"
      />
    );
  }

  const canManageIntegrations = hasPermission(
    actor,
    Permission.INTEGRATION_MANAGE,
  );

  const [ops, analytics, integrations] = await Promise.all([
    getOperations(actor),
    getAdminAnalytics(actor, 30),
    canManageIntegrations ? listIntegrations(actor) : null,
  ]);

  const attention = ops.insights.filter((i) => i.severity === "ATTENTION");
  const unhealthy = integrations
    ? integrations.counts.NEEDS_ATTENTION + integrations.counts.DISCONNECTED
    : 0;

  return (
    <>
      <PageHeader
        title={actor.organizationName}
        description={`${ops.today.registered} registered today · ${ops.today.completed} seen · ${ops.doctorsOnline.online} of ${ops.doctorsOnline.total} doctors online`}
      />

      {/* Spec §17 — what is wrong right now, before anything else. */}
      {attention.length > 0 && (
        <Card className="mb-5 border-warning/40 bg-warning-soft/40 p-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-warning">
              <TriangleAlert className="size-4" />
              {attention.length}{" "}
              {attention.length === 1 ? "thing needs" : "things need"} attention
            </CardTitle>
          </CardHeader>

          <ul className="space-y-1.5 px-5 pb-4">
            {attention.slice(0, 4).map((insight) => (
              <li key={insight.id} className="text-[13px]">
                <span className="font-semibold">{insight.title}</span>
                <span className="text-muted-foreground"> — {insight.detail}</span>
              </li>
            ))}
          </ul>

          <div className="border-t border-warning/25 px-5 py-2.5">
            <Link
              href="/admin/operations"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-warning hover:underline"
            >
              Open operations
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting now" value={ops.today.waiting} />
        <Stat
          label="Longest wait"
          value={ops.today.longestWaitMinutes}
          suffix=" min"
        />
        <Stat label="OPD, 30 days" value={analytics.metrics.opdVolume.value ?? 0} />
        <Stat
          label="Message delivery"
          value={analytics.metrics.deliveryRate.value}
          suffix="%"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Tile
          href="/admin/operations"
          icon={TriangleAlert}
          title="Operations"
          detail={
            attention.length > 0
              ? `${attention.length} needing attention`
              : "Everything inside its thresholds"
          }
          tone={attention.length > 0 ? "warn" : undefined}
        />
        <Tile
          href="/admin/reports"
          icon={ClipboardList}
          title="Reports"
          detail={`${analytics.doctors.length} doctors · ${analytics.departments.length} departments`}
        />
        <Tile
          href="/admin/communications"
          icon={MessageSquare}
          title="Automations"
          detail="Triggers, waits and the messages they send"
        />
        <Tile
          href="/admin/integrations"
          icon={Blocks}
          title="Integrations"
          detail={
            integrations
              ? unhealthy > 0
                ? `${unhealthy} needing attention`
                : `${integrations.counts.CONNECTED} connected`
              : "Not available to your role"
          }
          tone={unhealthy > 0 ? "warn" : undefined}
        />
        <Tile
          href="/admin/doctors"
          icon={Stethoscope}
          title="Doctors"
          detail={`${ops.doctorsOnline.total} practising here`}
        />
        <Tile
          href="/admin/audit"
          icon={Users}
          title="Audit log"
          detail="Who did what, to which record, and when"
        />
        <Tile
          href="/admin/ai"
          icon={Sparkles}
          title="AI"
          detail="Every generated output and what the doctor decided"
        />
      </div>
    </>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  detail,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  tone?: "warn";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border border-border bg-card p-4 shadow-soft transition-colors hover:border-accent/40 hover:bg-accent-soft/30",
        tone === "warn" && "border-warning/40 bg-warning-soft/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon
          className={cn(
            "size-4",
            tone === "warn" ? "text-warning" : "text-muted-foreground",
          )}
        />
        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-2.5 text-[14px] font-semibold">{title}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
        {detail}
      </p>
    </Link>
  );
}

function Stat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  /** Null when the rate has no denominator yet — shown as a dash, not 0. */
  value: number | null;
  suffix?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular">
        {value ?? "—"}
        {value !== null && suffix && (
          <span className="text-[15px] font-semibold text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-96" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </>
  );
}
