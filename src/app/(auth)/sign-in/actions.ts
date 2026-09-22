"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
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
    return {
      fieldErrors: {
        email: flat.fieldErrors.email?.[0],
        password: flat.fieldErrors.password?.[0],
      },
    };
  }

  const { email, password, next } = parsed.data;

  // Only same-origin paths — a `next` of "https://elsewhere" must not redirect.
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/doctor";

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "That email and password do not match an account." };
    }
    // signIn throws a redirect on success — let it through.
    throw error;
  }

  return {};
}
