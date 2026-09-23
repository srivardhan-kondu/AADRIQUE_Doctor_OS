import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { CopilotWorkspace } from "@/components/ai/copilot-workspace";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { modelConfigured } from "@/server/services/ai";

export const metadata: Metadata = { title: "AI Copilot" };

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.AI_USE)) {
    return <NoAccess title="AI Copilot" what="to use the AI copilot" />;
  }

  return (
    <PageBody>
      <PageHeader
        title="AI Copilot"
        description="Summarize, draft, retrieve and organize — from your records, with the sources attached. It never diagnoses and never writes to a record."
      />
      <CopilotWorkspace modelConfigured={modelConfigured()} />
    </PageBody>
  );
}
