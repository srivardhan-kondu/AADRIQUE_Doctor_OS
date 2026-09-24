"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { recordVitals } from "@/server/services/vitals";

/**
 * Spec §5.1 — recording vitals, from the nurse's station or the consultation.
 * The actor comes from the session; a target in another clinic is not found.
 */

const reading = (min: number, max: number) => z.number().min(min).max(max).nullable();

const schema = z.object({
  target: z.union([
    z.object({ queueEntryId: z.string().min(1).max(64) }),
    z.object({ visitId: z.string().min(1).max(64) }),
  ]),
  heightCm: reading(0, 1000),
  weightKg: reading(0, 1000),
  temperatureC: reading(0, 1000),
  pulseBpm: reading(0, 1000).pipe(z.number().int().nullable()),
  respiratoryRate: reading(0, 1000).pipe(z.number().int().nullable()),
  systolicBp: reading(0, 1000).pipe(z.number().int().nullable()),
  diastolicBp: reading(0, 1000).pipe(z.number().int().nullable()),
  spo2: reading(0, 1000).pipe(z.number().int().nullable()),
  bloodGlucose: reading(0, 5000),
  notes: z.string().max(500).nullable(),
});

export type RecordVitalsInput = z.input<typeof schema>;

export async function recordVitalsAction(
  input: RecordVitalsInput,
): Promise<{ ok: boolean; message?: string; flags?: string[] }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Check the readings — whole numbers for pulse, BP, SpO₂ and breathing." };
  }
  try {
    const actor = await requireActor();
    const { target, ...values } = parsed.data;
    const result = await recordVitals(actor, target, values);
    revalidatePath("/nurse");
    revalidatePath(`/doctor/consultations/${result.visitId}`);
    return { ok: true, flags: result.flags };
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, message: error.message };
    if (error instanceof PermissionError) return { ok: false, message: "You do not have permission to record vitals." };
    console.error("Recording vitals failed", error);
    return { ok: false, message: "The vitals could not be saved. Try again." };
  }
}
