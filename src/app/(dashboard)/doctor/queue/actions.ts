"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PermissionError, TenantError } from "@/lib/permissions";
import { requireActor, requireDoctorId } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import {
  callNext,
  completeConsultation,
  recordArrivalAtVitals,
  setQueueStatus,
  skipEntry,
} from "@/server/services/queue";

/**
 * Queue actions.
 *
 * Every one re-derives the actor from the session, so a crafted request cannot
 * act as someone else or reach another tenant's queue (spec §21, §22).
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** What the user can do about a failure (spec §38). */
  action?: string;
  redirectTo?: string;
}

const idSchema = z.string().min(1).max(64);

/** Turns a thrown error into something the UI can show without leaking detail. */
function toResult(error: unknown): ActionResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: error.message, action: error.action };
  }
  if (error instanceof PermissionError) {
    return {
      ok: false,
      message: "You do not have permission to manage this queue.",
      action: "Ask an administrator if you need queue access.",
    };
  }
  if (error instanceof TenantError) {
    return { ok: false, message: "That record was not found." };
  }
  console.error("Queue action failed", error);
  return {
    ok: false,
    message: "The queue could not be updated.",
    action: "Try again in a moment.",
  };
}

function refresh() {
  revalidatePath("/doctor");
  revalidatePath("/doctor/queue");
  revalidatePath("/reception/queue");
}

export async function callNextAction(): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const doctorId = await requireDoctorId(actor);
    const result = await callNext(actor, doctorId);

    refresh();

    if (!result) {
      return { ok: true, message: "Nobody is waiting. Your queue is clear." };
    }

    return {
      ok: true,
      message: `${result.token} · ${result.patientName} is with you now.`,
      redirectTo: `/doctor/consultations/${result.visitId}`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function completeAction(queueEntryId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await completeConsultation(actor, idSchema.parse(queueEntryId));
    refresh();
    return { ok: true, message: "Consultation completed." };
  } catch (error) {
    return toResult(error);
  }
}

export async function moveToVitalsAction(
  queueEntryId: string,
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await recordArrivalAtVitals(actor, idSchema.parse(queueEntryId));
    refresh();
    return { ok: true, message: "Moved to vitals." };
  } catch (error) {
    return toResult(error);
  }
}

export async function skipAction(queueEntryId: string): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await skipEntry(actor, idSchema.parse(queueEntryId));
    refresh();
    return { ok: true, message: "Patient marked as no show." };
  } catch (error) {
    return toResult(error);
  }
}

export async function setQueueStatusAction(
  status: "OPEN" | "PAUSED",
): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const doctorId = await requireDoctorId(actor);
    await setQueueStatus(actor, doctorId, status);
    refresh();
    return {
      ok: true,
      message: status === "PAUSED" ? "Queue paused." : "Queue resumed.",
    };
  } catch (error) {
    return toResult(error);
  }
}
