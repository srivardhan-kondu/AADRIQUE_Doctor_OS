"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { workflowStepSchema } from "@/lib/workflow/steps";
import { requireActor } from "@/server/context";
import { saveTemplate, saveWorkflow } from "@/server/services/automation-editor";
import { ServiceError } from "@/server/services/errors";

/** Spec §14 + §28 — editing templates and workflows. */

export interface EditorResult {
  ok: boolean;
  id?: string;
  message?: string;
  action?: string;
}

function toResult(error: unknown): EditorResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Some details are not valid." };
  }
  if (error instanceof PermissionError) {
    return { ok: false, message: "You do not have permission to manage communications." };
  }
  console.error("Automation editor failed", error);
  return { ok: false, message: "Could not save.", action: "Try again in a moment." };
}

const channel = z.enum(["WHATSAPP", "SMS", "EMAIL"]);

const templateSchema = z.object({
  id: z.string().min(1).max(64).nullable(),
  key: z.string().trim().min(1, "Give the template a key.").max(41),
  name: z.string().trim().min(1, "Name the template.").max(80),
  channel,
  category: z.enum(["TRANSACTIONAL", "ENGAGEMENT"]),
  language: z.string().regex(/^[a-z]{2}$/, "Choose a language."),
  subject: z.string().max(200).nullable(),
  body: z.string().max(5000),
  providerTemplateId: z.string().max(120).nullable(),
  active: z.boolean(),
});

export async function saveTemplateAction(
  input: z.input<typeof templateSchema>,
): Promise<EditorResult> {
  try {
    const actor = await requireActor();
    const { id } = await saveTemplate(actor, templateSchema.parse(input));
    revalidatePath("/admin/communications");
    return { ok: true, id, message: "Template saved." };
  } catch (error) {
    return toResult(error);
  }
}

const workflowSchema = z.object({
  id: z.string().min(1).max(64).nullable(),
  name: z.string().trim().min(1, "Name the workflow.").max(80),
  description: z.string().max(280).nullable(),
  trigger: z.enum([
    "APPOINTMENT_SCHEDULED",
    "APPOINTMENT_COMPLETED",
    "APPOINTMENT_CANCELLED",
    "TOKEN_GENERATED",
    "TOKEN_APPROACHING",
    "CONSULTATION_SIGNED",
    "FOLLOW_UP_DUE",
    "PATIENT_REGISTERED",
  ]),
  steps: z.array(workflowStepSchema).max(20),
});

export async function saveWorkflowAction(input: unknown): Promise<EditorResult> {
  try {
    const actor = await requireActor();
    const { id } = await saveWorkflow(actor, workflowSchema.parse(input));
    revalidatePath("/admin/communications");
    return { ok: true, id, message: "Workflow saved." };
  } catch (error) {
    return toResult(error);
  }
}
