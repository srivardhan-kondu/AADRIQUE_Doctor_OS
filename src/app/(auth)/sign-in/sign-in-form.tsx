"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { signInAction, type SignInState } from "./actions";

/**
 * The accounts the seed creates, offered so a reviewer can get in quickly —
 * only when the deployment says it is a demo (DEMO_MODE=true). A real
 * deployment never shows, or prefills, a shared password.
 */
const DEMO_ACCOUNTS = [
  { label: "Doctor", email: "ananya.rao@aadrique.demo" },
  { label: "Front desk", email: "frontdesk@aadrique.demo" },
  { label: "Nurse", email: "nurse@aadrique.demo" },
  { label: "Admin", email: "admin@aadrique.demo" },
];

const DEMO_PASSWORD = "aadrique123";

export function SignInForm({ next, demo = false }: { next?: string; demo?: boolean }) {
  const [state, formAction] = useActionState<SignInState, FormData>(
    signInAction,
    {},
  );
  const [email, setEmail] = useState(demo ? DEMO_ACCOUNTS[0].email : "");
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : "");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <form action={formAction} className="mt-7 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          />
          {state.fieldErrors?.email && (
            <p id="email-error" className="mt-1.5 text-[12px] text-destructive">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              aria-invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={
                state.fieldErrors?.password ? "password-error" : undefined
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-0 flex h-9 w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {state.fieldErrors?.password && (
            <p id="password-error" className="mt-1.5 text-[12px] text-destructive">
              {state.fieldErrors.password}
            </p>
          )}
        </div>

        {state.error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg bg-destructive-soft px-3 py-2.5"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-[13px] leading-snug text-destructive">
              {state.error}
            </p>
          </div>
        )}

        <SubmitButton />
      </form>

      {demo && (
        <div className="mt-8 rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Demo accounts
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  email === account.email
                    ? "border-accent bg-accent-soft text-brand-700"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {account.label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          Password for all demo accounts:{" "}
          <span className="font-mono text-foreground">{DEMO_PASSWORD}</span>
        </p>
      </div>
      )}
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" />}
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
