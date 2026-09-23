import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { WorkflowEditor } from "@/components/automation/workflow-editor";
import { placeholdersIn } from "@/lib/messaging";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getWorkflowForEdit } from "@/server/services/automation-editor";
import { listTemplates } from "@/server/services/communication";
import { ServiceError } from "@/server/services/errors";

export const metadata: Metadata = { title: "Workflow" };

export const dynamic = "force-dynamic";

/** Spec §28 — build or edit an automation. */
export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE)) {
    return <NoAccess title="Workflow" what="to build automations" backHref="/admin" backLabel="Back to the admin overview" />;
  }

  let workflow: Awaited<ReturnType<typeof getWorkflowForEdit>> = {
    id: null,
    name: "",
    description: null,
    trigger: "APPOINTMENT_SCHEDULED",
    steps: [],
    enabled: false,
    problem: null,
  };
  if (workflowId !== "new") {
    try {
      workflow = await getWorkflowForEdit(actor, workflowId);
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  }

  const templates = (await listTemplates(actor)).map((t) => ({
    key: t.key,
    name: t.name,
    channel: t.channel,
    placeholders: placeholdersIn(`${t.subject ?? ""} ${t.body}`),
  }));

  return (
    <PageBody>
      <PageHeader
        title={workflow.id ? workflow.name : "New workflow"}
        description="When something happens, then these steps, in order. A condition that is not met stops the run."
        actions={
          <Button asChild variant="ghost">
            <Link href="/admin/communications"><ArrowLeft />Communications</Link>
          </Button>
        }
      />
      {workflow.problem && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          The stored steps could not be read: {workflow.problem} Rebuild them below.
        </p>
      )}
      <WorkflowEditor workflow={workflow} templates={templates} />
    </PageBody>
  );
}
