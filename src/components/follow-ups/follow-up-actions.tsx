"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CheckCircle2,
  LoaderCircle,
  MoreHorizontal,
  Send,
  XCircle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  cancelFollowUpAction,
  completeFollowUpAction,
  scheduleFollowUpAction,
  sendReminderAction,
  type ActionResult,
} from "@/app/(dashboard)/doctor/follow-ups/actions";
import {
  isoDate,
  tomorrow,
} from "@/components/appointments/appointment-actions";
import { SlotPicker } from "@/components/appointments/slot-picker";
import { useDaySlots } from "@/components/appointments/use-day-slots";

/** Spec §42 — what a doctor does with a follow-up: chase it, book it, close it. */

function useFollowUpAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    (fn: () => Promise<ActionResult>, onDone?: () => void) => {
      startTransition(async () => {
        const result = await fn();
        if (result.ok) {
          toast.success(result.message ?? "Done.", { description: result.action });
          router.refresh();
          onDone?.();
        } else {
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

/** Spec §42 — one tap to chase a patient who is overdue. */
export function RemindButton({
  followUpId,
  patientName,
  alreadySent,
}: {
  followUpId: string;
  patientName: string;
  alreadySent: boolean;
}) {
  const { pending, run } = useFollowUpAction();

  return (
    <Button
      variant={alreadySent ? "ghost" : "outline"}
      size="sm"
      disabled={pending}
      aria-label={`Send a reminder to ${patientName}`}
      onClick={() => run(() => sendReminderAction(followUpId))}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <Send />}
      {alreadySent ? "Remind again" : "Remind"}
    </Button>
  );
}

export function FollowUpMenu({
  followUpId,
  patientName,
  canSchedule,
}: {
  followUpId: string;
  patientName: string;
  canSchedule: boolean;
}) {
  const { pending, run } = useFollowUpAction();
  const [dialog, setDialog] = React.useState<"schedule" | "cancel" | null>(null);
  const [reason, setReason] = React.useState("");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`More actions for ${patientName}`}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <MoreHorizontal />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {canSchedule && (
            <DropdownMenuItem onSelect={() => setDialog("schedule")}>
              <CalendarPlus />
              Book the return visit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => run(() => completeFollowUpAction(followUpId))}
          >
            <CheckCircle2 />
            Mark as done
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("cancel")}
          >
            <XCircle />
            No longer needed
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close {patientName}&rsquo;s follow-up?</DialogTitle>
            <DialogDescription>
              It will stop appearing here and no reminder will go out. Their
              record keeps the note that a follow-up was planned.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6">
            <label
              htmlFor={`fu-reason-${followUpId}`}
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Why (optional)
            </label>
            <Input
              id={`fu-reason-${followUpId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Resolved at the last visit"
              className="mt-1.5"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => cancelFollowUpAction(followUpId, reason),
                  () => {
                    setDialog(null);
                    setReason("");
                  },
                )
              }
            >
              Close follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleDialog
        open={dialog === "schedule"}
        onOpenChange={(open) => !open && setDialog(null)}
        followUpId={followUpId}
        patientName={patientName}
        onDone={() => setDialog(null)}
      />
    </>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  followUpId,
  patientName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  followUpId: string;
  patientName: string;
  onDone: () => void;
}) {
  const { pending, run } = useFollowUpAction();
  const [date, setDate] = React.useState(() => isoDate(tomorrow()));
  const { slots, selected: slot, select, loading } = useDaySlots(date, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book {patientName}&rsquo;s return visit</DialogTitle>
          <DialogDescription>
            This books a follow-up appointment and links it to this follow-up,
            so the two never drift apart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6">
          <div>
            <label
              htmlFor={`fu-date-${followUpId}`}
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Date
            </label>
            <Input
              id={`fu-date-${followUpId}`}
              type="date"
              value={date}
              min={isoDate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 w-44"
            />
          </div>

          <SlotPicker
            slots={slots}
            loading={loading}
            selected={slot}
            onSelect={select}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="accent"
            disabled={pending || !slot}
            onClick={() =>
              slot && run(() => scheduleFollowUpAction(followUpId, slot), onDone)
            }
          >
            {pending && <LoaderCircle className="animate-spin" />}
            Book it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
