"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ForgotState, forgotPasswordAction } from "./actions";

export function ForgotForm() {
  const [state, action] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});

  if (state.sent) {
    return (
      <div role="status" className="space-y-4 text-[14px]">
        <p>
          If that email has an account, we have sent a link to reset the password. It works for 30
          minutes.
        </p>
        <p className="text-muted-foreground">
          No email? Your clinic may not have email set up — your administrator has been asked to
          reset your password and will give you a one-time password.
        </p>
        <Link href="/sign-in" className="inline-block text-[13px] underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive">
          {state.error}
        </p>
      )}
      <Submit />
      <Link href="/sign-in" className="block text-center text-[13px] text-muted-foreground underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" />}
      Send reset link
    </Button>
  );
}
