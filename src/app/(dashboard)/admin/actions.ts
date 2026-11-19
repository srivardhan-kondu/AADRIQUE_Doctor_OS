"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { updateDepartmentThresholds } from "@/server/services/admin";
import { ServiceError } from "@/server/services/errors";
import { setVitalsStep } from "@/server/services/features";
import {
  addKnowledgeDocument,
  removeKnowledgeDocument,
} from "@/server/services/knowledge";
import {
  checkIntegration,
  setIntegrationConnected,
} from "@/server/services/integrations";
import { setWorkflowEnabled } from "@/server/services/workflows";

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
  revalidatePath("/admin/departments");
  revalidatePath("/admin/ai");
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

/** Spec §12 — whether patients go through a vitals station before the doctor. */
export async function setVitalsStepAction(enabled: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await setVitalsStep(actor, z.boolean().parse(enabled));
    revalidatePath("/admin/settings");
    revalidatePath("/doctor");
    revalidatePath("/doctor/queue");
    return {
      ok: true,
      message: enabled ? "Vitals step turned on." : "Vitals step turned off.",
      action: enabled
        ? "Doctors can send a waiting patient to vitals, and see the patient flow."
        : "Patients go straight from waiting to the doctor.",
    };
  } catch (error) {
    return toResult(error);
  }
}

const knowledgeSchema = z.object({
  title: z.string().trim().min(2, "Give the document a title.").max(120),
  category: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
  text: z.string().trim().min(1, "Paste the document's text, or choose a file."),
});

/** Spec §9 — a clinic document the knowledge assistant can answer from. */
export async function addKnowledgeDocumentAction(input: {
  title: string;
  category?: string | null;
  text: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const parsed = knowledgeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const result = await addKnowledgeDocument(actor, parsed.data);
    refresh();
    return {
      ok: true,
      message: `${parsed.data.title} added.`,
      action: `The assistant can now answer from its ${result.passages} ${result.passages === 1 ? "passage" : "passages"}.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function removeKnowledgeDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await removeKnowledgeDocument(actor, idSchema.parse(documentId));
    refresh();
    return { ok: true, message: `${result.title} removed.` };
  } catch (error) {
    return toResult(error);
  }
}
