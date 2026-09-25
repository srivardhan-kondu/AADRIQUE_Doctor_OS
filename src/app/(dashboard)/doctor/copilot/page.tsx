import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { NoAccess } from "@/components/shell/no-access";
import { AddOnLocked } from "@/components/shell/add-on-locked";
import { CopilotWorkspace } from "@/components/ai/copilot-workspace";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { modelConfigured } from "@/server/services/ai";
import { hasAddOn } from "@/server/services/features";

export const metadata: Metadata = { title: "AI Copilot" };

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.AI_USE)) {
    return <NoAccess title="AI Copilot" what="to use the AI copilot" />;
  }

  const unlocked = await hasAddOn(actor, "aiCopilot");

  return (
    <PageBody>
      <PageHeader
        title="AI Copilot"
        description="Summarize, draft, retrieve and organize — from your records, with the sources attached. It never diagnoses and never writes to a record."
      />
      {unlocked ? (
        <CopilotWorkspace modelConfigured={modelConfigured()} />
      ) : (
        <AddOnLocked addOn="aiCopilot" />
      )}
    </PageBody>
  );
}
