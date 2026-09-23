"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import {
  STAFF_ROLES,
  createStaff,
  resetStaffPassword,
  setStaffActive,
} from "@/server/services/accounts";
import { ServiceError } from "@/server/services/errors";

/** Spec §21 — the organization's staff accounts, managed by an administrator. */

export interface StaffActionResult {
  ok: boolean;
  message?: string;
  action?: string;
  /** Shown once, then gone. */
  temporaryPassword?: string;
}

function toResult(error: unknown): StaffActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Check the form." };
  }
  if (error instanceof PermissionError) {
    return { ok: false, message: "Only an administrator can manage staff." };
  }
  console.error("Staff action failed", error);
  return { ok: false, message: "That did not work.", action: "Try again in a moment." };
}

const idSchema = z.string().min(1).max(64);

export async function addStaffAction(input: {
  name: string;
  email: string;
  role: string;
}): Promise<StaffActionResult> {
  try {
    const actor = await requireActor();
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Enter their full name.").max(80),
        email: z.email("Enter a valid email address.").max(120),
        role: z.enum(STAFF_ROLES),
      })
      .parse(input);
    const result = await createStaff(actor, parsed);
    revalidatePath("/admin/staff");
    return {
      ok: true,
      message: `${result.name} can now sign in as ${result.email}.`,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function resetPasswordAction(userId: string): Promise<StaffActionResult> {
  try {
    const actor = await requireActor();
    const result = await resetStaffPassword(actor, idSchema.parse(userId));
    revalidatePath("/admin/staff");
    return {
      ok: true,
      message: `${result.name} has been signed out everywhere.`,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function setActiveAction(
  userId: string,
  active: boolean,
): Promise<StaffActionResult> {
  try {
    const actor = await requireActor();
    const result = await setStaffActive(actor, idSchema.parse(userId), z.boolean().parse(active));
    revalidatePath("/admin/staff");
    return {
      ok: true,
      message: active
        ? `${result.name} can sign in again.`
        : `${result.name} no longer has access. Their open sessions have ended.`,
    };
  } catch (error) {
    return toResult(error);
  }
}
