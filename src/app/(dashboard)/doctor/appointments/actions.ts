"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor, requireDoctorId } from "@/server/context";
import {
  bookAppointment,
  cancelAppointment,
  checkInAppointment,
  getAvailableSlots,
  markNoShow,
  rescheduleAppointment,
} from "@/server/services/appointments";
import { ServiceError } from "@/server/services/errors";
import { searchPatients } from "@/server/services/patients";

/**
 * Appointment actions (spec §11).
 *
 * As with the queue, the actor is re-derived from the session inside every
 * action. Nothing the client sends decides who is acting or which tenant is
 * being written to (spec §21, §22).
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  action?: string;
  redirectTo?: string;
}

const idSchema = z.string().min(1).max(64);

/** An ISO string from the client, proved to be a real date before use. */
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
      message: "You do not have permission to change appointments.",
      action: "Ask an administrator for appointment access.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That appointment was not found." };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: "That request was not valid.",
      action: "Reload the page and try again.",
    };
  }
  console.error("Appointment action failed", error);
  return {
    ok: false,
    message: "The appointment could not be updated.",
    action: "Try again in a moment.",
  };
}

function refresh() {
  revalidatePath("/doctor");
  revalidatePath("/doctor/appointments");
  revalidatePath("/doctor/queue");
  revalidatePath("/doctor/follow-ups");
  revalidatePath("/reception");
  revalidatePath("/reception/appointments");
  revalidatePath("/reception/queue");
}

const bookSchema = z.object({
  patientId: idSchema,
  /**
   * The front desk books for any doctor; a doctor books for themselves when
   * this is left out. Validated against the tenant by the service either way.
   */
  doctorId: idSchema.optional(),
  start: dateSchema,
  durationMinutes: z.number().int().min(5).max(240).optional(),
  type: z
    .enum([
      "NEW_CONSULTATION",
      "FOLLOW_UP",
      "WALK_IN",
      "PROCEDURE",
      "TELECONSULTATION",
    ])
    .optional(),
  reason: z.string().max(280).optional(),
  notify: z.boolean().optional(),
});

export async function bookAppointmentAction(
  input: z.input<typeof bookSchema>,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const parsed = bookSchema.parse(input);
    const doctorId = parsed.doctorId ?? (await requireDoctorId(actor));

    const result = await bookAppointment(actor, {
      patientId: parsed.patientId,
      doctorId,
      start: parsed.start,
      durationMinutes: parsed.durationMinutes,
      type: parsed.type,
      reason: parsed.reason,
      notify: parsed.notify,
    });

    refresh();

    return {
      ok: true,
      message: `${result.patientName} is booked for ${formatWhen(result.start)}.`,
      action: result.automations
        ? "A confirmation is on its way."
        : "No automation is listening, so nothing was sent to them.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  start: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await rescheduleAppointment(
      actor,
      idSchema.parse(appointmentId),
      dateSchema.parse(start),
    );

    refresh();

    return {
      ok: true,
      message: `${result.patientName} moved to ${formatWhen(result.start)}.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelAppointmentAction(
  appointmentId: string,
  reason?: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await cancelAppointment(
      actor,
      idSchema.parse(appointmentId),
      z.string().max(280).optional().parse(reason),
    );

    refresh();

    return {
      ok: true,
      message: `${result.patientName}'s appointment is cancelled.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function checkInAction(
  appointmentId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await checkInAppointment(
      actor,
      idSchema.parse(appointmentId),
    );

    refresh();

    return {
      ok: true,
      message: `${result.patientName} checked in as ${result.token}.`,
      action:
        result.position > 1
          ? `${result.position - 1} ahead of them in the queue.`
          : "They are next.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function markNoShowAction(
  appointmentId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const result = await markNoShow(actor, idSchema.parse(appointmentId));
    refresh();
    return { ok: true, message: `${result.patientName} marked as a no show.` };
  } catch (error) {
    return toResult(error);
  }
}

export interface SlotChoice {
  start: string;
  label: string;
  available: boolean;
  reason: string | null;
}

/** Slots for a day, fetched as the booking dialog's date changes. */
export async function loadSlotsAction(
  date: string,
  forDoctorId?: string,
): Promise<SlotChoice[]> {
  const actor = await requireActor();
  const doctorId = forDoctorId
    ? idSchema.parse(forDoctorId)
    : await requireDoctorId(actor);
  const slots = await getAvailableSlots(actor, doctorId, dateSchema.parse(date));

  return slots.map((slot) => ({
    start: slot.start.toISOString(),
    label: slot.start.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    available: slot.available,
    reason: slot.reason,
  }));
}

export interface PatientChoice {
  id: string;
  name: string;
  mrn: string;
  phone: string;
  age: number | null;
}

/** Patient lookup for the booking dialog (spec §13 — one search box). */
export async function searchPatientsAction(
  term: string,
): Promise<PatientChoice[]> {
  const actor = await requireActor();
  const rows = await searchPatients(
    actor,
    z.string().max(120).parse(term),
    8,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mrn: row.mrn,
    phone: row.phone,
    age: row.age,
  }));
}

function formatWhen(date: Date): string {
  return date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
