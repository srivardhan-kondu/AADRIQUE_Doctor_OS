"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  Permission,
  PermissionError,
  TenantError,
  assertPermission,
} from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { updateDepartmentThresholds } from "@/server/services/admin";
import { ServiceError } from "@/server/services/errors";
import {
  checkIntegration,
  setIntegrationConnected,
  syncIntegration,
} from "@/server/services/integrations";
import { processDueRuns, setWorkflowEnabled } from "@/server/services/workflows";

/** Administration actions (spec §21, §28, §29). */

export interface ActionResult {
  ok: boolean;
  message?: string;
  action?: string;
}

const idSchema = z.string().min(1).max(64);

function toResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "You do not have permission to change this.",
      action: "Only a hospital administrator can.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That record was not found." };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: "That request was not valid." };
  }
  console.error("Admin action failed", error);
  return {
    ok: false,
    message: "That could not be changed.",
    action: "Try again in a moment.",
  };
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/integrations");
  revalidatePath("/admin/communications");
  revalidatePath("/admin/operations");
  revalidatePath("/admin/departments");
}

export async function toggleWorkflowAction(
  workflowId: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await setWorkflowEnabled(
      actor,
      idSchema.parse(workflowId),
      z.boolean().parse(enabled),
    );
    refresh();

    return {
      ok: true,
      message: `${result.name} is ${enabled ? "on" : "off"}.`,
      action: enabled
        ? "It will run the next time its trigger fires."
        : "Runs already waiting will still finish.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function checkIntegrationAction(
  integrationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await checkIntegration(actor, idSchema.parse(integrationId));
    refresh();
    return { ok: true, message: `${result.name}: ${result.status.replace(/_/g, " ").toLowerCase()}.`, action: result.detail };
  } catch (error) {
    return toResult(error);
  }
}

export async function syncIntegrationAction(
  integrationId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await syncIntegration(actor, idSchema.parse(integrationId));
    refresh();
    return {
      ok: true,
      message: `${result.name} synced.`,
      action: result.detail,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function setIntegrationConnectedAction(
  integrationId: string,
  connected: boolean,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await setIntegrationConnected(
      actor,
      idSchema.parse(integrationId),
      z.boolean().parse(connected),
    );
    refresh();
    return { ok: true, message: `${result.name}: ${result.detail}` };
  } catch (error) {
    return toResult(error);
  }
}

const thresholdSchema = z.object({
  waitThresholdMinutes: z.number().int().min(5).max(180),
  queueCapacity: z.number().int().min(1).max(100),
});

export async function updateThresholdsAction(
  departmentId: string,
  input: z.input<typeof thresholdSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const parsed = thresholdSchema.parse(input);
    const result = await updateDepartmentThresholds(
      actor,
      idSchema.parse(departmentId),
      parsed,
    );
    refresh();

    return {
      ok: true,
      message: `${result.name} updated.`,
      action: `Queue warnings now fire above ${parsed.waitThresholdMinutes} minutes.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

/** Spec §28 — resume waiting runs by hand, for when a demo cannot wait. */
export async function runDueWorkflowsAction(): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    // The same permission the automation screen itself needs.
    assertPermission(actor, Permission.COMMUNICATION_TEMPLATE_MANAGE);

    const result = await processDueRuns();
    refresh();

    return {
      ok: true,
      message:
        result.resumed === 0 && result.abandoned === 0
          ? "Nothing is due yet."
          : `${result.resumed} resumed, ${result.abandoned} abandoned.`,
    };
  } catch (error) {
    return toResult(error);
  }
}
