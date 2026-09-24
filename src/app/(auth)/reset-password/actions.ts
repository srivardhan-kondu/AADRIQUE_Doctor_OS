"use server";

import { z } from "zod";
import { ServiceError } from "@/server/services/errors";
import { completePasswordReset } from "@/server/services/password-reset";

export interface ResetState {
  done?: boolean;
  error?: string;
}

export async function resetPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const parsed = z
    .object({ token: z.string().min(10).max(300), password: z.string().min(1).max(200), confirm: z.string() })
    .safeParse({ token: form.get("token"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: "Enter a new password." };
  if (parsed.data.password !== parsed.data.confirm) return { error: "The two passwords do not match." };
  try {
    await completePasswordReset(parsed.data.token, parsed.data.password);
    return { done: true };
  } catch (error) {
    if (error instanceof ServiceError) return { error: [error.message, error.action].filter(Boolean).join(" ") };
    console.error("Password reset failed", error);
    return { error: "Something went wrong. Try again in a moment." };
  }
}
