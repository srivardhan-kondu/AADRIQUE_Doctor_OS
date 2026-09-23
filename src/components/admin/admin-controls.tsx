"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  LoaderCircle,
  Play,
  PlugZap,
  Power,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  checkIntegrationAction,
  runDueWorkflowsAction,
  setIntegrationConnectedAction,
  syncIntegrationAction,
  toggleWorkflowAction,
  type ActionResult,
} from "@/app/(dashboard)/admin/actions";

/** Shared runner for every administration control. */
function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    (fn: () => Promise<ActionResult>) => {
      startTransition(async () => {
        const result = await fn();
        if (result.ok) {
          toast.success(result.message ?? "Done.", { description: result.action });
          router.refresh();
        } else {
          toast.error(result.message ?? "That did not work.", {
            description: result.action,
          });
        }
      });
    },
    [router],
  );

  return { pending, run };
}

/** Spec §28 — turning an automation on or off is the whole point of the engine. */
export function WorkflowToggle({
  workflowId,
  enabled,
  disabledReason,
}: {
  workflowId: string;
  enabled: boolean;
  disabledReason?: string | null;
}) {
  const { pending, run } = useAdminAction();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Turn this automation off" : "Turn this automation on"}
      disabled={pending || Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      onClick={() => run(() => toggleWorkflowAction(workflowId, !enabled))}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        enabled ? "bg-success" : "bg-muted-foreground/30",
        (pending || disabledReason) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-[1.125rem]" : "translate-x-[0.1875rem]",
        )}
      />
    </button>
  );
}

export function RunDueWorkflowsButton() {
  const { pending, run } = useAdminAction();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(runDueWorkflowsAction)}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <Play />}
      Run what is due
    </Button>
  );
}

export function IntegrationControls({
  integrationId,
  connected,
}: {
  integrationId: string;
  connected: boolean;
}) {
  const { pending, run } = useAdminAction();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => checkIntegrationAction(integrationId))}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Activity />}
        Check
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => syncIntegrationAction(integrationId))}
      >
        <RefreshCw />
        Sync
      </Button>

      <Button
        variant={connected ? "ghost" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() =>
          run(() => setIntegrationConnectedAction(integrationId, !connected))
        }
      >
        {connected ? <Power /> : <PlugZap />}
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}
