"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { requireActor } from "@/server/context";
import { changeOwnPassword } from "@/server/services/accounts";
import { ServiceError } from "@/server/services/errors";

export interface PasswordState {
  error?: string;
}

const schema = z.object({
  current: z.string().min(1, "Enter your current password.").max(200),
  next: z.string().min(1, "Choose a new password.").max(200),
  confirm: z.string().max(200),
});

/**
 * Changes the signed-in person's password, then signs them in again.
 *
 * The change stamps `passwordChangedAt`, which ends every session issued
 * before it — this one included. Signing in with the new password issues the
 * session they continue on, so the device they changed it on stays signed in
 * while every other one is signed out.
 */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const actor = await requireActor();

  const parsed = schema.safeParse({
    current: formData.get("current") ?? "",
    next: formData.get("next") ?? "",
    confirm: formData.get("confirm") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  if (parsed.data.next !== parsed.data.confirm) {
    return { error: "The new password and its confirmation do not match." };
  }

  try {
    await changeOwnPassword(actor, parsed.data.current, parsed.data.next);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: [error.message, error.action].filter(Boolean).join(" ") };
    }
    throw error;
  }

  try {
    await signIn("credentials", {
      email: actor.email,
      password: parsed.data.next,
      redirectTo: homeFor(actor.role),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // The password is changed; only the automatic sign-in failed.
      return { error: "Your password was changed. Sign in again with the new one." };
    }
    throw error; // the success redirect
  }
  return {};
}
