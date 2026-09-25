"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import {
  listTemplates,
  retryMessage,
  sendMessage,
} from "@/server/services/communication";
import { ServiceError } from "@/server/services/errors";
import { assertAddOn } from "@/server/services/features";

/** Communication actions (spec §14). */

export interface ActionResult {
  ok: boolean;
  message?: string;
  action?: string;
}

const idSchema = z.string().min(1).max(64);
const channelSchema = z.enum(["WHATSAPP", "SMS", "EMAIL"]);

function toResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "You do not have permission to send messages.",
      action: "Ask an administrator for communication access.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That message was not found." };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: "That message was not valid." };
  }
  console.error("Communication action failed", error);
  return {
    ok: false,
    message: "The message could not be sent.",
    action: "Try again in a moment.",
  };
}

function refresh(patientId?: string) {
  revalidatePath("/doctor/messages");
  revalidatePath("/admin/communications");
  if (patientId) revalidatePath(`/doctor/patients/${patientId}`);
}

const sendSchema = z.object({
  patientId: idSchema,
  channel: channelSchema,
  templateId: idSchema.nullish(),
  body: z.string().max(2000).optional(),
  subject: z.string().max(200).nullish(),
});

export async function sendMessageAction(
  input: z.input<typeof sendSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    // Writing from the inbox is the messaging add-on; automations are not.
    await assertAddOn(actor, "messaging");
    const parsed = sendSchema.parse(input);

    const result = await sendMessage(actor, {
      patientId: parsed.patientId,
      channel: parsed.channel,
      templateId: parsed.templateId,
      body: parsed.body,
      subject: parsed.subject,
    });

    refresh(parsed.patientId);

    if (result.status === "FAILED") {
      return {
        ok: false,
        message: `${result.channelLabel} did not accept the message.`,
        action: result.failureReason ?? "Check the patient's contact details.",
      };
    }

    return { ok: true, message: `Sent on ${result.channelLabel}.` };
  } catch (error) {
    return toResult(error);
  }
}

export async function retryMessageAction(
  messageId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    // Writing from the inbox is the messaging add-on; automations are not.
    await assertAddOn(actor, "messaging");
    const result = await retryMessage(actor, idSchema.parse(messageId));

    refresh();

    if (result.status === "FAILED") {
      return {
        ok: false,
        message: "It failed again.",
        action: result.failureReason ?? "Check the patient's contact details.",
      };
    }

    return { ok: true, message: `Sent on ${result.channelLabel}.` };
  } catch (error) {
    return toResult(error);
  }
}

export interface TemplateChoice {
  id: string;
  name: string;
  channel: "WHATSAPP" | "SMS" | "EMAIL";
  category: "TRANSACTIONAL" | "ENGAGEMENT";
  subject: string | null;
  body: string;
  variables: string[];
}

/** Templates for the composer, narrowed to the chosen channel. */
export async function loadTemplatesAction(
  channel?: "WHATSAPP" | "SMS" | "EMAIL",
): Promise<TemplateChoice[]> {
  const actor = await requireActor();
  const templates = await listTemplates(
    actor,
    channel ? channelSchema.parse(channel) : undefined,
  );

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    channel: t.channel,
    category: t.category,
    subject: t.subject,
    body: t.body,
    variables: t.variables,
  }));
}
