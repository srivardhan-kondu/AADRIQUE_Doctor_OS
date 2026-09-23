"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor, requireDoctorId } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  scheduleFollowUp,
  sendFollowUpReminder,
} from "@/server/services/follow-ups";

/** Follow-up actions (spec §42). */

export interface ActionResult {
  ok: boolean;
  message?: string;
  action?: string;
}

const idSchema = z.string().min(1).max(64);

const dateSchema = z
  .string()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Not a valid date",
  })
  .transform((value) => new Date(value));

function toResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "You do not have permission to manage follow-ups.",
      action: "Ask an administrator for follow-up access.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That follow-up was not found." };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: "That request was not valid." };
  }
  console.error("Follow-up action failed", error);
  return {
    ok: false,
    message: "The follow-up could not be updated.",
    action: "Try again in a moment.",
  };
}

function refresh() {
  revalidatePath("/doctor");
  revalidatePath("/doctor/follow-ups");
  revalidatePath("/doctor/appointments");
  revalidatePath("/doctor/messages");
}

export async function completeFollowUpAction(
  followUpId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await completeFollowUp(actor, idSchema.parse(followUpId));
    refresh();
    return { ok: true, message: `${result.patientName}'s follow-up is closed.` };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelFollowUpAction(
  followUpId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await cancelFollowUp(
      actor,
      idSchema.parse(followUpId),
      z.string().max(280).optional().parse(reason),
    );
    refresh();
    return {
      ok: true,
      message: `${result.patientName} no longer needs to return.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function sendReminderAction(
  followUpId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await sendFollowUpReminder(actor, idSchema.parse(followUpId));
    refresh();

    if (result.status === "FAILED") {
      return {
        ok: false,
        message: `The reminder to ${result.patientName} did not go through.`,
        action: result.failureReason ?? "Check their contact details.",
      };
    }

    return {
      ok: true,
      message: `Reminder sent to ${result.patientName} on WhatsApp.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function scheduleFollowUpAction(
  followUpId: string,
  start: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await scheduleFollowUp(
      actor,
      idSchema.parse(followUpId),
      dateSchema.parse(start),
    );
    refresh();

    return {
      ok: true,
      message: `${result.patientName} is booked for ${result.start.toLocaleString(
        "en-IN",
        {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        },
      )}.`,
      action: "A WhatsApp confirmation is on its way.",
    };
  } catch (error) {
    return toResult(error);
  }
}

const createSchema = z.object({
  patientId: idSchema,
  dueDate: dateSchema,
  reason: z.string().max(280).optional(),
  notes: z.string().max(1000).optional(),
  visitId: idSchema.optional(),
});

export async function createFollowUpAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const doctorId = await requireDoctorId(actor);
    const parsed = createSchema.parse(input);

    const result = await createFollowUp(actor, {
      patientId: parsed.patientId,
      doctorId,
      dueDate: parsed.dueDate,
      reason: parsed.reason,
      notes: parsed.notes,
      visitId: parsed.visitId,
    });

    refresh();

    return {
      ok: true,
      message: `${result.patientName} should return by ${result.dueDate.toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "short" },
      )}.`,
    };
  } catch (error) {
    return toResult(error);
  }
}
