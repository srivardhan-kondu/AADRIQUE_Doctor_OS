import type { Metadata } from "next";
import { Suspense } from "react";
import { Blocks, Info, KeyRound } from "lucide-react";
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

/** Spec §29 — the four states. */
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
        what="to manage messaging channels"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const { rows } = await listIntegrations(actor);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="How WhatsApp, SMS and email messages reach your patients."
      />

      {rows.some((row) => row.status !== "CONNECTED") && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            On a channel that is not connected, automatic messages are recorded
            in the patient&rsquo;s history but not actually sent. AADRIQUE
            connects a channel to your WhatsApp, SMS or email account.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <EmptyState
            icon={Blocks}
            title="No channels set up yet"
            description="WhatsApp, SMS and email appear here once AADRIQUE sets up your clinic."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((integration) => (
            <Card key={integration.id} className="p-0">
              <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border">
                <div className="min-w-0">
                  <CardTitle className="truncate">{integration.name}</CardTitle>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {integration.categoryLabel}
                  </p>
                </div>

                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold",
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
                        className="flex items-baseline justify-between gap-3 text-[13px]"
                      >
                        <dt className="text-muted-foreground">{setting.key}</dt>
                        <dd className="truncate font-mono">{setting.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {integration.hasCredential ? (
                    <Badge variant="muted">
                      <KeyRound />
                      Account linked
                    </Badge>
                  ) : (
                    <Badge variant="outline">Account not linked</Badge>
                  )}
                  {!integration.configured && integration.settings.length > 0 && (
                    <Badge variant="warning">Settings incomplete</Badge>
                  )}
                </div>

                {integration.lastError && (
                  <p className="rounded-lg bg-destructive-soft px-3 py-2 text-[13px] leading-relaxed text-destructive">
                    {integration.lastError}
                  </p>
                )}

                <p className="text-[12px] text-muted-foreground">
                  {integration.lastHealthCheckAt
                    ? `Checked ${integration.lastHealthCheckAt.toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}`
                    : "Never checked"}
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
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </>
  );
}
