"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { requireActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { beginTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor } from "@/server/services/two-factor";

interface Result {
  ok: boolean;
  message?: string;
}

const code = z.string().trim().regex(/^\d{6}$/, "Type the six digits the app shows.");

function fail(error: unknown): Result {
  if (error instanceof ServiceError) return { ok: false, message: [error.message, error.action].filter(Boolean).join(" ") };
  console.error("Two-factor change failed", error);
  return { ok: false, message: "Something went wrong. Try again." };
}

export async function beginSetupAction(): Promise<Result & { secret?: string; uri?: string; qr?: string }> {
  try {
    const { secret, uri } = await beginTwoFactorSetup(await requireActor());
    // Drawn here from our own otpauth link, never from anything a user typed.
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { ok: true, secret, uri, qr };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmSetupAction(raw: string): Promise<Result> {
  const parsed = code.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await confirmTwoFactorSetup(await requireActor(), parsed.data);
    revalidatePath("/account/two-factor");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function disableAction(raw: string): Promise<Result> {
  const parsed = code.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await disableTwoFactor(await requireActor(), parsed.data);
    revalidatePath("/account/two-factor");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
