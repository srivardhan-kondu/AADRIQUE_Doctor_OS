"use client";

import * as React from "react";
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
} from "@/app/(dashboard)/doctor/queue/actions";

/**
 * Queue controls (spec §12).
 *
 * The button disables while its server action runs, and the returned result
 * decides what the user is told. Destructive actions confirm first
 * (spec §35 rule 5).
 */

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    (fn: () => Promise<ActionResult>) => {
      startTransition(async () => {
        const result = await fn();

        if (result.ok) {
          if (result.message) toast.success(result.message);
          if (result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
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

  return { pending, run };
}

/** Spec §41-B — the single most important button in the product. */
export function CallNextButton({
  disabled,
  waitingCount,
}: {
  disabled?: boolean;
  waitingCount: number;
}) {
  const { pending, run } = useAction();

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
      if (!disabled && waitingCount > 0) run(callNextAction);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, waitingCount, run]);

  return (
    <Button
      variant="accent"
      size="lg"
      disabled={disabled || pending || waitingCount === 0}
      onClick={() => run(callNextAction)}
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
  );
}

/**
 * Spec §18 — starts the day by calling the first patient in, straight into
 * their consultation. Having done that, the Command Center shows "View
 * schedule" in its place.
 */
export function StartMyDayButton() {
  const { pending, run } = useAction();

  return (
    <Button
      size="lg"
      variant="accent"
      disabled={pending}
      onClick={() => run(callNextAction)}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : null}
      {pending ? "Calling in…" : "Start my day"}
      {!pending && <ArrowRight />}
    </Button>
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
  const { pending, run } = useAction();

  return (
    <Button
      variant={isNext ? "accent" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() => run(() => callPatientAction(queueEntryId))}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <Stethoscope />}
      Start consultation
    </Button>
  );
}

export function CompleteButton({ queueEntryId }: { queueEntryId: string }) {
  const { pending, run } = useAction();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(() => completeAction(queueEntryId))}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
      Complete
    </Button>
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
