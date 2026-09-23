import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { AuditFilters } from "@/components/audit/audit-filters";
import { AuditLogView } from "@/components/audit/audit-log";
import { NoAccess } from "@/components/shell/no-access";
import { requireActor } from "@/server/context";
import { AUDIT_ACTION_LABEL, listAuditLog } from "@/server/services/audit";
import { Permission, hasPermission } from "@/lib/permissions";
import { AuditAction } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Audit Log" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    days?: string;
    q?: string;
  }>;
}

export default function AuditPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<AuditSkeleton />}>
        <AuditScreen searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

const RANGES = [7, 30, 90];

async function AuditScreen({ searchParams }: PageProps) {
  const params = await searchParams;

  // Spec §21 — the permission is checked here, not by hiding the nav entry.
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.AUDIT_READ)) {
    return (
      <NoAccess
        title="Audit Log"
        what="to read the audit trail"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const action =
    params.action && params.action in AuditAction
      ? (params.action as AuditAction)
      : undefined;
  const requested = Number(params.days);
  const days = RANGES.includes(requested) ? requested : 30;
  const query = params.q ?? "";

  const log = await listAuditLog(actor, {
    action,
    userId: params.actor,
    days,
    query,
  });

  const filtered = Boolean(action || params.actor || query);

  return (
    <>
      <PageHeader
        title="Audit Log"
        description={`Who did what, to which record, and when · ${log.total} ${
          log.total === 1 ? "event" : "events"
        } in ${days} days`}
      />

      <div className="mb-5">
        <AuditFilters
          action={action ?? ""}
          actorId={params.actor ?? ""}
          days={days}
          query={query}
          actions={log.byAction.map((row) => ({
            value: row.action,
            label: AUDIT_ACTION_LABEL[row.action],
            count: row.count,
          }))}
          actors={log.actors}
        />
      </div>

      <AuditLogView
        entries={log.entries}
        hasMore={log.hasMore}
        filtered={filtered}
      />
    </>
  );
}

function AuditSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Skeleton className="mb-5 h-9 w-full rounded-md" />
      <div className="space-y-5">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </>
  );
}
