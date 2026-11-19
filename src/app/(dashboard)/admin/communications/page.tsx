import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AlertCircle, MessageSquare, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { WorkflowToggle } from "@/components/admin/admin-controls";
import { ChannelBadge } from "@/components/communication/delivery";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listTemplates } from "@/server/services/communication";
import {
  TRIGGER_LABEL,
  listRecentRuns,
  listWorkflows,
} from "@/server/services/workflows";

export const metadata: Metadata = { title: "Communications" };

export const dynamic = "force-dynamic";

export default function CommunicationsPage() {
  return (
    <PageBody>
      <Suspense fallback={<CommunicationsSkeleton />}>
        <CommunicationsScreen />
      </Suspense>
    </PageBody>
  );
}

async function CommunicationsScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE)) {
    return (
      <NoAccess
        title="Communications"
        what="to manage patient messages"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const [workflows, templates, failures] = await Promise.all([
    listWorkflows(actor),
    listTemplates(actor, undefined, { includeInactive: true }),
    listRecentRuns(actor, 5, { failedOnly: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Communications"
        description="The messages patients receive automatically, and what they say."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/admin/communications/workflows/new"><Plus />Custom automation</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/communications/templates/new"><Plus />New template</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0 space-y-5">
          {failures.length > 0 && (
            <Card className="border-destructive/30 p-0">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="size-4" />
                  Recent messages that could not go out
                </CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {failures.map((run) => (
                  <li key={run.id} className="px-5 py-2.5">
                    <p className="text-[14px] font-semibold">{run.workflowName}</p>
                    {run.error && (
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{run.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-0">
            <CardHeader className="border-b border-border">
              <CardTitle>Automatic messages</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Switch one off to stop it. Messages already scheduled still go out.
              </p>
            </CardHeader>

            {workflows.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No automatic messages yet"
                description="Appointment confirmations, reminders and feedback requests appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {workflows.map((workflow) => (
                  <li key={workflow.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold">{workflow.name}</p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                          {workflow.description ??
                            `${TRIGGER_LABEL[workflow.trigger]}: ${workflow.steps
                              .map((step) => step.description.toLowerCase())
                              .join(", then ")}.`}
                        </p>
                      </div>

                      <span className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/communications/workflows/${workflow.id}`} aria-label={`Edit ${workflow.name}`}>
                            <Pencil />
                            Edit
                          </Link>
                        </Button>
                        <WorkflowToggle
                          workflowId={workflow.id}
                          name={workflow.name}
                          enabled={workflow.enabled}
                          disabledReason={workflow.problem}
                        />
                      </span>
                    </div>

                    {workflow.problem && (
                      <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {workflow.problem}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-0">
          <CardHeader className="border-b border-border">
            <CardTitle>Message templates</CardTitle>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              What patients receive. Details in {"{{braces}}"} are filled in when
              each message is sent.
            </p>
          </CardHeader>

          <ul className="divide-y divide-border">
            {templates.map((template) => (
              <li key={template.id} className="px-5 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">
                    {template.name}
                  </span>
                  <ChannelBadge channel={template.channel} />
                  {template.category === "ENGAGEMENT" && (
                    <Badge variant="muted">Engagement</Badge>
                  )}
                  {!template.active && <Badge variant="outline">Not in use</Badge>}
                  <Link
                    href={`/admin/communications/templates/${template.id}`}
                    className="ml-auto text-[13px] font-semibold text-accent-ink hover:underline"
                    aria-label={`Edit ${template.name}`}
                  >
                    Edit
                  </Link>
                </p>

                {template.subject && (
                  <p className="mt-1 text-[13px] font-semibold">
                    {template.subject}
                  </p>
                )}

                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {template.body}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function CommunicationsSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-full max-w-96" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-[28rem] rounded-xl" />
        <Skeleton className="h-[36rem] rounded-xl" />
      </div>
    </>
  );
}
