"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validateAddress } from "@/lib/messaging";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { registerPatient } from "@/server/services/patients";
import { addWalkIn } from "@/server/services/queue";

/**
 * Front desk actions (spec §13).
 *
 * The actor is re-derived from the session inside every action, and every
 * field from the form is parsed before a service sees it (spec §21, §50).
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  action?: string;
}

function toResult(error: unknown, what: string): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: error.issues[0]?.message ?? "Some details are not valid.",
      action: "Check the highlighted field and try again.",
    };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: `You do not have permission to ${what}.`,
      action: "Ask an administrator for front desk access.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That record was not found." };
  }
  console.error(`Front desk action failed: ${what}`, error);
  return {
    ok: false,
    message: `Could not ${what}.`,
    action: "Try again in a moment.",
  };
}

function refresh() {
  revalidatePath("/reception");
  revalidatePath("/reception/queue");
  revalidatePath("/reception/patients");
  revalidatePath("/doctor");
  revalidatePath("/doctor/queue");
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const phone = z
  .string()
  .trim()
  .min(1, "Enter a mobile number.")
  .max(20)
  .refine((v) => validateAddress("SMS", v) === null, {
    message: "Enter a valid mobile number.",
  });

const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter a first name.").max(80),
    lastName: optionalText(80),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]),
    dateOfBirth: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(`${v}T00:00:00`) : null))
      .refine((d) => d === null || (!Number.isNaN(d.getTime()) && d <= new Date()), {
        message: "Date of birth cannot be in the future.",
      }),
    approximateAge: z
      .number()
      .int()
      .min(0, "Age cannot be negative.")
      .max(120, "Enter an age under 120.")
      .nullable()
      .optional(),
    phone,
    email: z
      .union([z.literal(""), z.email("Enter a valid email address.")])
      .optional()
      .transform((v) => v || null),
    addressLine: optionalText(200),
    city: optionalText(80),
    emergencyContactName: optionalText(80),
    emergencyContactPhone: z
      .string()
      .trim()
      .max(20)
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || validateAddress("SMS", v) === null, {
        message: "Enter a valid emergency contact number.",
      }),
    whatsappOptIn: z.boolean(),
    smsOptIn: z.boolean(),
    emailOptIn: z.boolean(),
    preferredLanguage: z.enum(["en", "hi", "te", "ta", "kn", "ml"]).optional(),
  })
  .refine((v) => v.dateOfBirth !== null || v.approximateAge != null, {
    message: "Enter a date of birth or an approximate age.",
    path: ["approximateAge"],
  });

export type RegisterInput = z.input<typeof registerSchema>;

export interface RegisteredPatient {
  id: string;
  name: string;
  mrn: string;
  phone: string;
  age: number | null;
}

export async function registerPatientAction(
  input: RegisterInput,
): Promise<ActionResult & { patient?: RegisteredPatient }> {
  try {
    const actor = await requireActor();
    const parsed = registerSchema.parse(input);
    const result = await registerPatient(actor, parsed);

    refresh();

    const age = parsed.dateOfBirth
      ? Math.floor(
          (Date.now() - parsed.dateOfBirth.getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : (parsed.approximateAge ?? null);

    return {
      ok: true,
      message: `${result.name} is registered as ${result.mrn}.`,
      patient: {
        id: result.id,
        name: result.name,
        mrn: result.mrn,
        phone: parsed.phone,
        age,
      },
    };
  } catch (error) {
    return toResult(error, "register this patient");
  }
}

const walkInSchema = z.object({
  patientId: z.string().min(1).max(64),
  doctorId: z.string().min(1).max(64),
  priority: z.enum(["NORMAL", "PRIORITY", "EMERGENCY"]).default("NORMAL"),
  reason: optionalText(280),
});

export async function walkInAction(
  input: z.input<typeof walkInSchema>,
): Promise<ActionResult & { token?: string }> {
  try {
    const actor = await requireActor();
    const parsed = walkInSchema.parse(input);
    const result = await addWalkIn(actor, parsed);

    refresh();

    return {
      ok: true,
      token: result.token,
      message: `${result.patientName} is ${result.token} for ${result.doctorName}.`,
      action:
        result.waiting > 1
          ? `${result.waiting - 1} ahead of them.${result.automations ? " Their token is on its way by message." : ""}`
          : `They are next.${result.automations ? " Their token is on its way by message." : ""}`,
    };
  } catch (error) {
    return toResult(error, "add this walk-in");
  }
}
