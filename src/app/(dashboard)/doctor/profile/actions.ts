"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import {
  setDoctorOnline,
  setWeeklyAvailability,
  updateDoctorSettings,
} from "@/server/services/doctors";
import { ServiceError } from "@/server/services/errors";

/**
 * A doctor's week and preferences (spec §11). Used from the doctor's own
 * profile and from the admin doctor directory; the service decides whether
 * this actor may change this doctor.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  action?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: error.issues[0]?.message ?? "Some details are not valid.",
    };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "Only the doctor or an administrator can change this.",
    };
  }
  console.error("Doctor settings action failed", error);
  return {
    ok: false,
    message: "The change could not be saved.",
    action: "Try again in a moment.",
  };
}

function refresh() {
  revalidatePath("/doctor");
  revalidatePath("/doctor/profile");
  revalidatePath("/doctor/appointments");
  revalidatePath("/admin/doctors");
  revalidatePath("/reception");
}

const idSchema = z.string().min(1).max(64);

const ruleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  isBlock: z.boolean(),
  label: z.string().max(60).nullable(),
});

export async function saveWeekAction(
  doctorId: string,
  rules: z.input<typeof ruleSchema>[],
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await setWeeklyAvailability(
      actor,
      idSchema.parse(doctorId),
      z.array(ruleSchema).max(70).parse(rules),
    );
    refresh();
    return { ok: true, message: "Clinic hours saved." };
  } catch (error) {
    return toResult(error);
  }
}

const settingsSchema = z.object({
  consultationMinutes: z.number().int().min(5).max(120),
  acceptsWalkIns: z.boolean(),
  departmentId: idSchema.nullable().optional(),
});

export async function saveSettingsAction(
  doctorId: string,
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await updateDoctorSettings(
      actor,
      idSchema.parse(doctorId),
      settingsSchema.parse(input),
    );
    refresh();
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return toResult(error);
  }
}

export async function setOnlineAction(
  doctorId: string,
  online: boolean,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await setDoctorOnline(actor, idSchema.parse(doctorId), z.boolean().parse(online));
    refresh();
    return {
      ok: true,
      message: online ? "You're on duty." : "You're marked as away.",
    };
  } catch (error) {
    return toResult(error);
  }
}
