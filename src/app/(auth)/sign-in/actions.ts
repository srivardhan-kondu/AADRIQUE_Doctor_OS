"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { homeForEmail } from "@/lib/auth/home";
import {
  SIGN_IN_ACCOUNT_LIMIT,
  SIGN_IN_ADDRESS_LIMIT,
  callerAddress,
  peekRateLimit,
  signInKeys,
} from "@/lib/security/rate-limit";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  // `formData.get` returns null for a field the form did not send — a
  // sign-in opened directly, with no page to return to.
  next: z.string().nullish(),
});

export interface SignInState {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
}

/**
 * Credentials sign-in.
 *
 * Failures are reported as one message regardless of cause — an unknown email
 * and a wrong password are indistinguishable, so the form cannot be used to
 * discover which accounts exist.
 */
export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const email = flat.fieldErrors.email?.[0];
    const password = flat.fieldErrors.password?.[0];
    // A failure on a field the form does not show must still say something;
    // a sign-in that silently does nothing is the worst outcome.
    if (!email && !password) {
      return { error: "The sign-in form was not valid. Reload the page and try again." };
    }
    return { fieldErrors: { email, password } };
  }

  const { email, password, next } = parsed.data;

  /**
   * Spec §38 — the limit itself is enforced in `authorize`, which every
   * credential attempt passes through. This is a read of the same counters so
   * the form can say "too many attempts" instead of "wrong password". It
   * peeks rather than counts, so one attempt is never charged twice.
   */
  const requestHeaders = await headers();
  const address = callerAddress(requestHeaders) ?? "unknown";
  const keys = signInKeys(address, email);

  const [byAddress, byAccount] = await Promise.all([
    peekRateLimit(keys.address, SIGN_IN_ADDRESS_LIMIT),
    peekRateLimit(keys.account, SIGN_IN_ACCOUNT_LIMIT),
  ]);

  if (!byAddress.allowed || !byAccount.allowed) {
    const retryAfter = Math.max(byAddress.retryAfter, byAccount.retryAfter);
    const minutes = Math.ceil(retryAfter / 60);

    return {
      error: `Too many sign-in attempts. Try again in ${
        minutes <= 1 ? "a minute" : `${minutes} minutes`
      }.`,
    };
  }

  // Only same-origin paths — a `next` of "https://elsewhere" must not redirect.
  // With none, the person lands in their own role's workspace.
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : await homeForEmail(email);

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "That email and password do not match an account." };
    }
    // signIn throws a redirect on success — let it through. The counters are
    // cleared in `authorize`, which knows the attempt actually succeeded.
    throw error;
  }

  return {};
}
