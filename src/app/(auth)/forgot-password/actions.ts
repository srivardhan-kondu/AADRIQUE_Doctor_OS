"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { callerAddress } from "@/lib/security/rate-limit";
import { ServiceError } from "@/server/services/errors";
import { requestPasswordReset } from "@/server/services/password-reset";

export interface ForgotState {
  sent?: boolean;
  error?: string;
}

/**
 * Always the same answer for any well-formed email, so the page cannot be
 * used to find out who has an account.
 */
export async function forgotPasswordAction(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const email = z.string().trim().email().max(200).safeParse(form.get("email"));
  if (!email.success) return { error: "Enter the email you sign in with." };
  try {
    await requestPasswordReset(email.data, callerAddress(await headers()));
    return { sent: true };
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message };
    console.error("Password-reset request failed", error);
    return { error: "Something went wrong. Try again in a moment." };
  }
}
