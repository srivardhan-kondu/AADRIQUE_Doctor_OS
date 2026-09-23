"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { createDoctor } from "@/server/services/doctors";
import { ServiceError } from "@/server/services/errors";

/** Spec §53 (admin journey) — create a doctor and assign their department. */

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter the doctor's full name.").max(80),
  email: z.email("Enter a valid email address.").max(120),
  departmentId: z.string().min(1, "Choose a department.").max(64),
  specialization: z.string().trim().max(80).optional(),
  qualifications: z.string().trim().max(120).optional(),
  registrationNo: z.string().trim().max(40).optional(),
  consultationMinutes: z.number().int().min(5).max(120),
  tokenPrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,3}$/, "A token prefix is one to three letters."),
});

export interface CreateDoctorActionResult {
  ok: boolean;
  message?: string;
  action?: string;
  doctorId?: string;
  temporaryPassword?: string;
}

export async function createDoctorAction(
  input: z.input<typeof createSchema>,
): Promise<CreateDoctorActionResult> {
  try {
    const actor = await requireActor();
    const result = await createDoctor(actor, createSchema.parse(input));
    revalidatePath("/admin/doctors");
    revalidatePath("/admin");
    return {
      ok: true,
      message: `${result.name} can now sign in as ${result.email}.`,
      doctorId: result.doctorId,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    if (error instanceof ServiceError) {
      return { ok: false, message: error.message, action: error.action };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Some details are not valid." };
    }
    if (error instanceof PermissionError) {
      return { ok: false, message: "Only an administrator can add doctors." };
    }
    console.error("Create doctor failed", error);
    return { ok: false, message: "The doctor could not be added.", action: "Try again in a moment." };
  }
}
