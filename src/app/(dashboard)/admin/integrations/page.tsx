import type { Metadata } from "next";
import { Suspense } from "react";
import { Blocks, KeyRound, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { IntegrationControls } from "@/components/admin/admin-controls";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { STATUS_LABEL, listIntegrations } from "@/server/services/integrations";
import type { IntegrationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Integrations" };

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  return (
    <PageBody>
      <Suspense fallback={<IntegrationsSkeleton />}>
        <IntegrationsScreen />
      </Suspense>
    </PageBody>
  );
}

/** Spec §29 — the four states, and nothing in between. */
const STATUS_STYLE: Record<IntegrationStatus, string> = {
  CONNECTED: "bg-success-soft text-success",
  NEEDS_ATTENTION: "bg-warning-soft text-warning",
  DISCONNECTED: "bg-destructive-soft text-destructive",
  NOT_CONFIGURED: "bg-muted text-muted-foreground",
};

async function IntegrationsScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.INTEGRATION_MANAGE)) {
    return (
      <NoAccess
        title="Integrations"
        what="to manage integrations"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const { rows, counts } = await listIntegrations(actor);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Each system behind one adapter, with the same four states."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(STATUS_STYLE) as IntegrationStatus[]).map((status) => (
          <Card key={status} className="px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {STATUS_LABEL[status]}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular">
              {counts[status]}
            </p>
          </Card>
        ))}
      </div>

      {/* Spec §31 — say where the secrets are, since they are not here. */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Only non-secret settings are stored on an integration. Credentials
          live in the secret store and are referenced by a pointer, so nothing
          on this screen — or in the database row behind it — can leak a key.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Blocks}
            title="No integrations yet"
            description="WhatsApp, SMS, email, lab, pharmacy and HMS adapters appear here once an organization is configured."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((integration) => (
            <Card key={integration.id} className="p-0">
              <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border">
                <div className="min-w-0">
                  <CardTitle className="truncate">{integration.name}</CardTitle>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {integration.categoryLabel}
                    <span aria-hidden> · </span>
                    <span className="font-mono">{integration.provider}</span>
                  </p>
                </div>

                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
                    STATUS_STYLE[integration.status],
                  )}
                >
                  {STATUS_LABEL[integration.status]}
                </span>
              </CardHeader>

              <div className="space-y-3 px-5 py-4">
                {integration.settings.length > 0 ? (
                  <dl className="space-y-1">
                    {integration.settings.map((setting) => (
                      <div
                        key={setting.key}
                        className="flex items-baseline justify-between gap-3 text-[12px]"
                      >
                        <dt className="text-muted-foreground">{setting.key}</dt>
                        <dd className="truncate font-mono">{setting.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    No settings recorded.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {integration.hasCredential ? (
                    <Badge variant="muted">
                      <KeyRound />
                      Credential stored
                    </Badge>
                  ) : (
                    <Badge variant="outline">No credential</Badge>
                  )}
                  {!integration.configured && (
                    <Badge variant="warning">Incomplete settings</Badge>
                  )}
                </div>

                {integration.lastError && (
                  <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[12px] leading-relaxed text-destructive">
                    {integration.lastError}
                  </p>
                )}

                <p className="text-[11px] text-muted-foreground">
                  {integration.lastHealthCheckAt
                    ? `Checked ${integration.lastHealthCheckAt.toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}`
                    : "Never checked"}
                  {integration.lastSyncAt && (
                    <>
                      <span aria-hidden> · </span>
                      {`synced ${integration.lastSyncAt.toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}`}
                    </>
                  )}
                </p>

                <IntegrationControls
                  integrationId={integration.id}
                  connected={integration.status === "CONNECTED"}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function IntegrationsSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </>
  );
}
