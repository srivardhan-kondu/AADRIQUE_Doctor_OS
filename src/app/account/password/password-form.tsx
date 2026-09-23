"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changePasswordAction,
  type PasswordState,
} from "@/app/account/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <Field id="current" label={forced ? "Temporary password" : "Current password"}>
        <Input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </Field>
      <Field
        id="next"
        label="New password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easier to remember and harder to guess.`}
      >
        <Input
          id="next"
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      <Field id="confirm" label="Confirm new password">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" />}
        Change password
      </Button>
      <p className="text-center text-[12px] text-muted-foreground">
        Every other device you are signed in on will be signed out.
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
