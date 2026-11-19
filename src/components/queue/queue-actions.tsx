"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Pause,
  Play,
  SkipForward,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  callNextAction,
  callPatientAction,
  completeAction,
  moveToVitalsAction,
  setQueueStatusAction,
  skipAction,
  type ActionResult,
  type CloseChoice,
} from "@/app/(dashboard)/doctor/queue/actions";

/**
 * Queue controls (spec §12).
 *
 * The button disables while its server action runs, and the returned result
 * decides what the user is told. Destructive actions confirm first
 * (spec §35 rule 5).
 */

type Run = (choice?: CloseChoice) => Promise<ActionResult>;

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // A refused close-out waiting on the doctor's choice, with how to retry it.
  const [unsigned, setUnsigned] = React.useState<{
    visitId: string;
    patientName: string;
    fn: Run;
  } | null>(null);

  const run = React.useCallback(
    (fn: Run, choice?: CloseChoice) => {
      startTransition(async () => {
        const result = await fn(choice);

        if (result.ok) {
          if (result.message) toast.success(result.message);
          if (result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
        } else if (result.unsigned) {
          setUnsigned({ ...result.unsigned, fn });
        } else {
          // Spec §38 — say what happened and what to do next.
          toast.error(result.message ?? "That did not work.", {
            description: result.action,
          });
        }
      });
    },
    [router],
  );

  const dialog = (
    <UnsignedNoteDialog
      state={unsigned}
      onContinue={() => unsigned && run(unsigned.fn, { leaveUnsigned: true })}
      onClose={() => setUnsigned(null)}
    />
  );

  return { pending, run, dialog };
}

/**
 * The visit being closed has a note the doctor wrote and has not signed.
 * Signing it is one click away; leaving it is allowed, but said out loud.
 */
function UnsignedNoteDialog({
  state,
  onContinue,
  onClose,
}: {
  state: { visitId: string; patientName: string } | null;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.patientName}&apos;s note is not signed</DialogTitle>
          <DialogDescription>
            If you continue, their visit closes with the note still a draft and
            its prescription not issued. You can sign it later from
            Consultations.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onContinue();
              onClose();
            }}
          >
            Continue without signing
          </Button>
          {state && (
            <Button asChild onClick={onClose}>
              <Link href={`/doctor/consultations/${state.visitId}`}>
                Open note to sign
                <ArrowRight />
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Spec §41-B — the single most important button in the product. */
export function CallNextButton({
  disabled,
  waitingCount,
}: {
  disabled?: boolean;
  waitingCount: number;
}) {
  const { pending, run, dialog } = useAction();

  // Spec §19 — high-frequency action, so it gets a shortcut.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (!disabled && waitingCount > 0) run((choice) => callNextAction(choice));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, waitingCount, run]);

  return (
    <>
      {dialog}
      <Button
        variant="accent"
        size="lg"
        disabled={disabled || pending || waitingCount === 0}
        onClick={() => run((choice) => callNextAction(choice))}
        className="gap-2"
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Stethoscope />}
        {pending ? "Calling…" : "Call next"}
        {!pending && waitingCount > 0 && (
          <Kbd className="border-brand-700/40 bg-brand-700/30 text-accent-foreground">
            N
          </Kbd>
        )}
      </Button>
    </>
  );
}

/**
 * Spec §18 — starts the day by calling the first patient in, straight into
 * their consultation. Having done that, the Command Center shows "View
 * schedule" in its place.
 */
export function StartMyDayButton() {
  const { pending, run, dialog } = useAction();

  return (
    <>
      {dialog}
      <Button
        size="lg"
        variant="accent"
        disabled={pending}
        onClick={() => run((choice) => callNextAction(choice))}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {pending ? "Calling in…" : "Start my day"}
        {!pending && <ArrowRight />}
      </Button>
    </>
  );
}

/** Calls this particular patient in, out of turn. */
export function StartConsultationButton({
  queueEntryId,
  isNext,
}: {
  queueEntryId: string;
  isNext: boolean;
}) {
  const { pending, run, dialog } = useAction();

  return (
    <>
        {dialog}
        <Button
          variant={isNext ? "accent" : "outline"}
          size="sm"
          disabled={pending}
          onClick={() => run((choice) => callPatientAction(queueEntryId, choice))}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <Stethoscope />}
          Start consultation
        </Button>
    </>
  );
}

export function CompleteButton({ queueEntryId }: { queueEntryId: string }) {
  const { pending, run, dialog } = useAction();

  return (
    <>
        {dialog}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run((choice) => completeAction(queueEntryId, choice))}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
          Complete
        </Button>
    </>
  );
}

export function MoveToVitalsButton({ queueEntryId }: { queueEntryId: string }) {
  const { pending, run } = useAction();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => run(() => moveToVitalsAction(queueEntryId))}
    >
      Vitals
    </Button>
  );
}

/** Spec §35 rule 5 — marking a no-show is destructive, so it confirms. */
export function SkipButton({
  queueEntryId,
  patientName,
  token,
}: {
  queueEntryId: string;
  patientName: string;
  token: string;
}) {
  const { pending, run } = useAction();
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Mark ${token} as no show`}
        onClick={() => setOpen(true)}
      >
        <SkipForward />
      </Button>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark {token} as a no show?</DialogTitle>
          <DialogDescription>
            {patientName} will be removed from the queue and their appointment
            recorded as a no show. They can be registered again if they arrive.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              run(() => skipAction(queueEntryId));
              setOpen(false);
            }}
          >
            Mark as no show
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QueueStatusToggle({ paused }: { paused: boolean }) {
  const { pending, run } = useAction();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(() => setQueueStatusAction(paused ? "OPEN" : "PAUSED"))}
    >
      {pending ? (
        <LoaderCircle className="animate-spin" />
      ) : paused ? (
        <Play />
      ) : (
        <Pause />
      )}
      {paused ? "Resume queue" : "Pause queue"}
    </Button>
  );
}
