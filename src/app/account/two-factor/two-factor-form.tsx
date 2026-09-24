"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beginSetupAction, confirmSetupAction, disableAction } from "./actions";

export function TwoFactorForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = React.useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) return setError(result.message ?? "That did not work.");
      setCode("");
      after?.();
      router.refresh();
    });

  const codeInput = (
    <div>
      <label htmlFor="totp" className="mb-1.5 block text-[13px] font-medium">
        Code from the app
      </label>
      <Input
        id="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="text-center font-mono tracking-[0.4em]"
      />
    </div>
  );

  const alert = error && (
    <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive">
      {error}
    </p>
  );

  if (enabled) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-[14px] font-medium text-success">
          <ShieldCheck className="size-4" />
          Two-factor sign-in is on.
        </p>
        <p className="text-[13px] text-muted-foreground">
          To turn it off, type a current code. If you lose your phone, ask your administrator to reset your password —
          that also resets two-factor.
        </p>
        {codeInput}
        {alert}
        <Button variant="outline" className="w-full" disabled={pending || code.length !== 6} onClick={() => run(() => disableAction(code))}>
          {pending && <LoaderCircle className="animate-spin" />}
          Turn off two-factor
        </Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-muted-foreground">
          After your password, sign-in will ask for a six-digit code from an authenticator app on your phone — Google
          Authenticator, Microsoft Authenticator, 1Password or similar.
        </p>
        {alert}
        <Button
          className="w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await beginSetupAction();
              if (!result.ok || !result.secret) return setError(result.message ?? "Could not start setup.");
              setSetup({ secret: result.secret, uri: result.uri!, qr: result.qr! });
            })
          }
        >
          {pending && <LoaderCircle className="animate-spin" />}
          Set up two-factor
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px]">1. Scan this with your authenticator app.</p>
      <div
        className="mx-auto w-48 rounded-lg bg-white p-2"
        aria-label="QR code for your authenticator app"
        role="img"
        // Our own SVG, drawn on the server from the otpauth link.
        dangerouslySetInnerHTML={{ __html: setup.qr }}
      />
      <p className="text-[12px] text-muted-foreground">
        Can&apos;t scan? Enter this key instead:{" "}
        <code data-testid="totp-secret" className="break-all font-mono text-foreground">
          {setup.secret.match(/.{1,4}/g)?.join(" ")}
        </code>{" "}
        or <a href={setup.uri} className="underline underline-offset-4">open it in the app</a>.
      </p>
      <p className="text-[13px]">2. Type the code it shows.</p>
      {codeInput}
      {alert}
      <Button className="w-full" disabled={pending || code.length !== 6} onClick={() => run(() => confirmSetupAction(code), () => setSetup(null))}>
        {pending && <LoaderCircle className="animate-spin" />}
        Turn on two-factor
      </Button>
    </div>
  );
}
