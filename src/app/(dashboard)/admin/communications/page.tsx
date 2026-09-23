import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AlertCircle,
  ArrowDown,
  Clock3,
  GitBranch,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import {
  RunDueWorkflowsButton,
  WorkflowToggle,
} from "@/components/admin/admin-controls";
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
        what="to manage automations and templates"
        backHref="/admin"
        backLabel="Back to the admin overview"
      />
    );
  }

  const [workflows, templates, runs] = await Promise.all([
    listWorkflows(actor),
    listTemplates(actor),
    listRecentRuns(actor, 12),
  ]);

  const waiting = runs.filter((r) => r.status === "WAITING").length;

  return (
    <>
      <PageHeader
        title="Communications"
        description="Automations as data, not as branches in the code. Change when a patient hears from you without a deploy."
        actions={<RunDueWorkflowsButton />}
      />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <Card className="p-0">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <WorkflowIcon className="size-4 text-muted-foreground" />
                Automations
              </CardTitle>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                A trigger, then a list of steps. Turning one off stops new runs;
                runs already waiting still finish.
              </p>
            </CardHeader>

            {workflows.length === 0 ? (
              <EmptyState
                icon={WorkflowIcon}
                title="No automations yet"
                description="Appointment confirmations, reminders and feedback requests live here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {workflows.map((workflow) => (
                  <li key={workflow.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold">
                            {workflow.name}
                          </span>
                          {workflow.enabled ? (
                            <Badge variant="success">On</Badge>
                          ) : (
                            <Badge variant="muted">Off</Badge>
                          )}
                          {workflow.runs.waiting > 0 && (
                            <Badge variant="info">
                              <Clock3 />
                              {workflow.runs.waiting} waiting
                            </Badge>
                          )}
                          {workflow.runs.failed > 0 && (
                            <Badge variant="destructive">
                              {workflow.runs.failed} failed
                            </Badge>
                          )}
                        </p>
                        {workflow.description && (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {workflow.description}
                          </p>
                        )}
                      </div>

                      <WorkflowToggle
                        workflowId={workflow.id}
                        enabled={workflow.enabled}
                        disabledReason={workflow.problem}
                      />
                    </div>

                    {workflow.problem ? (
                      <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {workflow.problem}
                      </p>
                    ) : (
                      <ol className="mt-3 space-y-1.5">
                        <li className="flex items-center gap-2">
                          <StepIcon type="TRIGGER" />
                          <span className="text-[12px] font-semibold">
                            {TRIGGER_LABEL[workflow.trigger]}
                          </span>
                        </li>

                        {workflow.steps.map((step, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <StepIcon type={step.type} />
                            <span className="text-[12px] text-muted-foreground">
                              {step.description}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-0">
            <CardHeader className="border-b border-border">
              <CardTitle>Recent runs</CardTitle>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {waiting > 0
                  ? `${waiting} paused mid-way, waiting for their moment.`
                  : "Nothing is currently waiting."}
              </p>
            </CardHeader>

            {runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                No automation has run yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5"
                  >
                    <RunStatus status={run.status} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {run.workflowName}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular">
                      step {run.stepIndex}
                      {run.resumeAt && (
                        <>
                          <span aria-hidden> · </span>
                          resumes{" "}
                          {run.resumeAt.toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </>
                      )}
                    </span>
                    {run.error && (
                      <p className="w-full text-[11px] text-destructive">
                        {run.error}
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
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              What an automation actually sends. A template still carrying a
              placeholder is never delivered.
            </p>
          </CardHeader>

          <ul className="divide-y divide-border">
            {templates.map((template) => (
              <li key={template.id} className="px-5 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">
                    {template.name}
                  </span>
                  <ChannelBadge channel={template.channel} />
                  {template.category === "ENGAGEMENT" && (
                    <Badge variant="muted">Engagement</Badge>
                  )}
                </p>

                {template.subject && (
                  <p className="mt-1 text-[12px] font-semibold">
                    {template.subject}
                  </p>
                )}

                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {template.body}
                </p>

                {template.variables.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {template.variables.map((variable) => (
                      <span
                        key={variable}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {variable}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function StepIcon({ type }: { type: "TRIGGER" | "WAIT" | "CONDITION" | "ACTION" }) {
  const { Icon, tone } = {
    TRIGGER: { Icon: Zap, tone: "bg-accent-soft text-brand-700" },
    WAIT: { Icon: Clock3, tone: "bg-muted text-muted-foreground" },
    CONDITION: { Icon: GitBranch, tone: "bg-info-soft text-info" },
    ACTION: { Icon: ArrowDown, tone: "bg-success-soft text-success" },
  }[type];

  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded",
        tone,
      )}
      aria-hidden
    >
      <Icon className="size-3" />
    </span>
  );
}

function RunStatus({ status }: { status: string }) {
  const variant =
    status === "COMPLETED"
      ? "success"
      : status === "FAILED"
        ? "destructive"
        : status === "WAITING"
          ? "info"
          : "muted";

  return (
    <Badge variant={variant as "success" | "destructive" | "info" | "muted"}>
      {status.toLowerCase()}
    </Badge>
  );
}

function CommunicationsSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between pb-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <Skeleton className="h-[28rem] rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-[36rem] rounded-xl" />
      </div>
    </>
  );
}
