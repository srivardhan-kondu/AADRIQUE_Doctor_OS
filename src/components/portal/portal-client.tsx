"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  choosePatientAction,
  cancelAction,
  feedbackAction,
  portalSignOutAction,
  requestCodeAction,
  verifyCodeAction,
} from "@/app/portal/[org]/actions";

/** Spec §3 + §34 — the patient portal's interactive parts, mobile-first. */

export function PortalSignIn({ slug }: { slug: string }) {
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [stage, setStage] = React.useState<"phone" | "code">("phone");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [demoCode, setDemoCode] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestCodeAction(slug, phone);
      if (!result.ok) return setError(result.message ?? "Could not send a code.");
      setMessage(result.message ?? null);
      setDemoCode(result.demoCode ?? null);
      setStage("code");
    });
  }

  function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyCodeAction(slug, phone, code);
      if (!result.ok) return setError(result.message ?? "That did not work.");
      router.refresh();
    });
  }

  return stage === "phone" ? (
    <form onSubmit={send} className="space-y-4">
      <div>
        <label htmlFor="portal-phone" className="text-[14px] font-medium">
          Your mobile number
        </label>
        <Input
          id="portal-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1.5 h-12 text-[16px]"
          maxLength={20}
          required
        />
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          The one you gave the clinic. We&apos;ll send a six-digit code.
        </p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !phone.trim()}>
        {pending && <LoaderCircle className="animate-spin" />}
        Send code
      </Button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-4">
      {message && <p className="text-[14px] text-muted-foreground">{message}</p>}
      {demoCode && (
        <p className="rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-[13px] text-info">
          Demo: no SMS gateway is connected, so your code is{" "}
          <strong data-testid="demo-code" className="font-mono tracking-widest">
            {demoCode}
          </strong>
          .
        </p>
      )}
      <div>
        <label htmlFor="portal-code" className="text-[14px] font-medium">
          Six-digit code
        </label>
        <Input
          id="portal-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="mt-1.5 h-12 text-center font-mono text-[20px] tracking-[0.4em]"
          autoFocus
          required
        />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={pending || code.length !== 6}>
        {pending && <LoaderCircle className="animate-spin" />}
        Sign in
      </Button>
      <button
        type="button"
        className="w-full text-center text-[13px] text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => {
          setStage("phone");
          setCode("");
          setError(null);
        }}
      >
        Use a different number
      </button>
    </form>
  );
}

export function PatientChooser({
  slug,
  patients,
}: {
  slug: string;
  patients: { id: string; name: string; mrn: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <ul className="space-y-2">
      {patients.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await choosePatientAction(slug, p.id);
                if (result.ok) router.refresh();
                else toast.error(result.message ?? "Sign in again.");
              })
            }
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted"
          >
            <span className="text-[16px] font-semibold">{p.name}</span>
            <span className="font-mono text-[12px] text-muted-foreground">{p.mrn}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CancelAppointment({ slug, appointmentId, when }: { slug: string; appointmentId: string; when: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Cancel
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        aria-label={`Confirm cancelling ${when}`}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelAction(slug, appointmentId);
            if (result.ok) {
              toast.success(result.message ?? "Cancelled.");
              router.refresh();
            } else {
              toast.error(result.message ?? "Could not cancel.");
            }
          })
        }
      >
        {pending && <LoaderCircle className="animate-spin" />}
        Yes, cancel
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
}

export function RateVisit({
  slug,
  feedbackId,
  doctorName,
}: {
  slug: string;
  feedbackId: string;
  doctorName: string;
}) {
  const router = useRouter();
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={`Rate your visit with ${doctorName}`} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            onClick={() => setRating(n)}
            className="p-1"
          >
            <Star
              className={cn(
                "size-8 transition-colors",
                n <= rating ? "fill-accent text-accent" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything you'd like to tell us? (optional)"
            aria-label="Comment"
            maxLength={1000}
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await feedbackAction(slug, feedbackId, rating, comment);
                if (result.ok) {
                  toast.success(result.message ?? "Thank you.");
                  router.refresh();
                } else {
                  toast.error(result.message ?? "Could not send.");
                }
              })
            }
          >
            {pending && <LoaderCircle className="animate-spin" />}
            Send
          </Button>
        </>
      )}
    </div>
  );
}

export function PortalSignOut({ slug }: { slug: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-[13px] text-muted-foreground underline-offset-4 hover:underline"
      onClick={async () => {
        await portalSignOutAction(slug);
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[14px] text-destructive">
      {children}
    </p>
  );
}
