"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callerAddress } from "@/lib/security/rate-limit";
import {
  clearPortalSession,
  loadPortal,
  requirePortalPatient,
  writePortalSession,
} from "@/server/portal-session";
import { ServiceError } from "@/server/services/errors";
import {
  portalBook,
  portalCancel,
  portalFeedback,
  portalOrganization,
  portalSlots,
  requestSignInCode,
  verifySignInCode,
} from "@/server/services/portal";

/**
 * Patient portal actions. The patient is re-derived from the signed session
 * cookie in every one; nothing the browser sends names who is acting.
 */

export interface PortalResult {
  ok: boolean;
  message?: string;
  demoCode?: string;
}

function toResult(error: unknown): PortalResult {
  if (error instanceof ServiceError) {
    return { ok: false, message: [error.message, error.action].filter(Boolean).join(" ") };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "Check what you entered." };
  }
  if (error instanceof Error && error.message.startsWith("Your session has ended")) {
    return { ok: false, message: error.message };
  }
  console.error("Portal action failed", error);
  return { ok: false, message: "Something went wrong. Try again in a moment." };
}

const slugSchema = z.string().min(1).max(80);
const idSchema = z.string().min(1).max(64);

export async function requestCodeAction(slug: string, phone: string): Promise<PortalResult> {
  try {
    const organization = await portalOrganization(slugSchema.parse(slug));
    if (!organization) return { ok: false, message: "This clinic was not found." };
    const address = callerAddress(await headers()) ?? "unknown";
    const { demoCode } = await requestSignInCode(
      organization.id,
      organization.name,
      z.string().max(20).parse(phone),
      address,
    );
    return {
      ok: true,
      message: "If this number is registered with us, a code is on its way.",
      demoCode,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function verifyCodeAction(
  slug: string,
  phone: string,
  code: string,
): Promise<PortalResult> {
  try {
    const organization = await portalOrganization(slugSchema.parse(slug));
    if (!organization) return { ok: false, message: "This clinic was not found." };
    const verified = await verifySignInCode(
      organization.id,
      z.string().max(20).parse(phone),
      z.string().max(10).parse(code),
    );
    await writePortalSession(organization.slug, {
      o: organization.id,
      p: verified.phone,
      // One record for the number: straight in. Several (a family sharing a
      // phone): the next screen asks whose.
      pid: verified.patientIds.length === 1 ? verified.patientIds[0] : null,
    });
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function choosePatientAction(slug: string, patientId: string): Promise<PortalResult> {
  try {
    const loaded = await loadPortal(slugSchema.parse(slug));
    const chosen = loaded?.portal?.patients.find((p) => p.id === idSchema.parse(patientId));
    if (!loaded?.session || !chosen) return { ok: false, message: "Sign in again." };
    await writePortalSession(loaded.organization.slug, {
      o: loaded.organization.id,
      p: loaded.session.p,
      pid: chosen.id,
    });
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function portalSignOutAction(slug: string): Promise<void> {
  await clearPortalSession(slugSchema.parse(slug));
}

export async function slotsAction(
  slug: string,
  doctorId: string,
  date: string,
): Promise<{ ok: boolean; slots?: string[]; message?: string }> {
  try {
    const { organizationId } = await requirePortalPatient(slugSchema.parse(slug));
    const day = new Date(`${z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date)}T00:00:00`);
    const slots = await portalSlots(organizationId, idSchema.parse(doctorId), day);
    return { ok: true, slots: slots.map((s) => s.toISOString()) };
  } catch (error) {
    return toResult(error);
  }
}

export async function bookAction(
  slug: string,
  input: { doctorId: string; start: string; reason: string },
): Promise<PortalResult> {
  try {
    const { organizationId, patientId } = await requirePortalPatient(slugSchema.parse(slug));
    const parsed = z
      .object({
        doctorId: idSchema,
        start: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose a time."),
        reason: z.string().max(280),
      })
      .parse(input);
    const booked = await portalBook(organizationId, patientId, {
      doctorId: parsed.doctorId,
      start: new Date(parsed.start),
      reason: parsed.reason || null,
    });
    revalidatePath(`/portal/${slug}`);
    return {
      ok: true,
      message: `Booked with ${booked.doctorName} on ${booked.start.toLocaleString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelAction(slug: string, appointmentId: string): Promise<PortalResult> {
  try {
    const { organizationId, patientId } = await requirePortalPatient(slugSchema.parse(slug));
    await portalCancel(organizationId, patientId, idSchema.parse(appointmentId));
    revalidatePath(`/portal/${slug}`);
    return { ok: true, message: "Your appointment is cancelled." };
  } catch (error) {
    return toResult(error);
  }
}

export async function feedbackAction(
  slug: string,
  feedbackId: string,
  rating: number,
  comment: string,
): Promise<PortalResult> {
  try {
    const { organizationId, patientId } = await requirePortalPatient(slugSchema.parse(slug));
    await portalFeedback(
      organizationId,
      patientId,
      idSchema.parse(feedbackId),
      z.number().int().parse(rating),
      z.string().max(1000).parse(comment) || null,
    );
    revalidatePath(`/portal/${slug}`);
    return { ok: true, message: "Thank you for telling us." };
  } catch (error) {
    return toResult(error);
  }
}
