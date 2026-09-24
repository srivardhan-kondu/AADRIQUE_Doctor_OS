"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ResetState, resetPasswordAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(resetPasswordAction, {});

  if (state.done) {
    return (
      <div role="status" className="space-y-4 text-[14px]">
        <p>Your password is changed, and every other session has been signed out.</p>
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">
          New password
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        <p className="mt-1.5 text-[12px] text-muted-foreground">At least 10 characters, not easy to guess.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-[13px] font-medium">
          Type it again
        </label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" />}
      Set new password
    </Button>
  );
}
