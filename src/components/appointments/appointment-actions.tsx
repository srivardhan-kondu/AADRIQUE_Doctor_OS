"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  MoreHorizontal,
  UserX,
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
  cancelAppointmentAction,
  checkInAction,
  markNoShowAction,
  rescheduleAppointmentAction,
  type ActionResult,
} from "@/app/(dashboard)/doctor/appointments/actions";
import { SlotPicker } from "./slot-picker";
import { useDaySlots } from "./use-day-slots";

/**
 * Spec §11 — the appointment lifecycle, as the buttons a person presses.
 *
 * Check-in is the frequent one, so it is a button. Everything that removes a
 * patient from the day is behind a menu and confirms first (spec §35 rule 5).
 */

export function useAppointmentAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = React.useCallback(
    (fn: () => Promise<ActionResult>, onDone?: () => void) => {
      startTransition(async () => {
        const result = await fn();

        if (result.ok) {
          toast.success(result.message ?? "Done.", {
            description: result.action,
          });
          if (result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
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

export function CheckInButton({
  appointmentId,
  patientName,
}: {
  appointmentId: string;
  patientName: string;
}) {
  const { pending, run } = useAppointmentAction();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-label={`Check in ${patientName}`}
      onClick={() => run(() => checkInAction(appointmentId))}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
      Check in
    </Button>
  );
}

export function AppointmentMenu({
  appointmentId,
  patientName,
  scheduledFor,
  canReschedule,
  canCancel,
  canMarkNoShow,
  doctorId,
}: {
  appointmentId: string;
  patientName: string;
  scheduledFor: string;
  /** Whose free slots to offer when moving it. Omitted: the signed-in doctor. */
  doctorId?: string;
  canReschedule: boolean;
  canCancel: boolean;
  canMarkNoShow: boolean;
}) {
  const { pending, run } = useAppointmentAction();
  const [dialog, setDialog] = React.useState<"cancel" | "reschedule" | null>(
    null,
  );
  const [reason, setReason] = React.useState("");

  if (!canReschedule && !canCancel && !canMarkNoShow) return null;

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

        <DropdownMenuContent align="end" className="w-52">
          {canReschedule && (
            <DropdownMenuItem onSelect={() => setDialog("reschedule")}>
              <CalendarClock />
              Reschedule
            </DropdownMenuItem>
          )}
          {canMarkNoShow && (
            <DropdownMenuItem
              onSelect={() => run(() => markNoShowAction(appointmentId))}
            >
              <UserX />
              Mark as no show
            </DropdownMenuItem>
          )}
          {canCancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog("cancel")}
              >
                <XCircle />
                Cancel appointment
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {patientName}&rsquo;s appointment?</DialogTitle>
            <DialogDescription>
              {scheduledFor}. They will be told it is cancelled and how to
              rebook.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6">
            <label
              htmlFor={`cancel-reason-${appointmentId}`}
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Reason (optional)
            </label>
            <Input
              id={`cancel-reason-${appointmentId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Doctor unavailable"
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
                  () => cancelAppointmentAction(appointmentId, reason),
                  () => {
                    setDialog(null);
                    setReason("");
                  },
                )
              }
            >
              Cancel appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RescheduleDialog
        open={dialog === "reschedule"}
        onOpenChange={(open) => !open && setDialog(null)}
        appointmentId={appointmentId}
        patientName={patientName}
        scheduledFor={scheduledFor}
        doctorId={doctorId}
        onDone={() => setDialog(null)}
      />
    </>
  );
}

function RescheduleDialog({
  open,
  onOpenChange,
  appointmentId,
  patientName,
  scheduledFor,
  doctorId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  patientName: string;
  scheduledFor: string;
  doctorId?: string;
  onDone: () => void;
}) {
  const { pending, run } = useAppointmentAction();
  const [date, setDate] = React.useState(() => isoDate(tomorrow()));
  const { slots, selected, select, loading } = useDaySlots(date, open, doctorId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {patientName}</DialogTitle>
          <DialogDescription>
            Currently {scheduledFor}. The original stays on their record,
            marked as rescheduled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6">
          <div>
            <label
              htmlFor={`reschedule-date-${appointmentId}`}
              className="text-[12px] font-semibold text-muted-foreground"
            >
              New date
            </label>
            <Input
              id={`reschedule-date-${appointmentId}`}
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
            selected={selected}
            onSelect={select}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending || !selected}
            onClick={() =>
              selected &&
              run(
                () => rescheduleAppointmentAction(appointmentId, selected),
                onDone,
              )
            }
          >
            {pending && <LoaderCircle className="animate-spin" />}
            Move appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}
