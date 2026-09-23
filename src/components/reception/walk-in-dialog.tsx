"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Ticket, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useDialogState } from "@/hooks/use-dialog-state";
import { cn } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PatientPicker,
  SelectedPatient,
} from "@/components/appointments/book-dialog";
import { RegisterPatientDialog } from "@/components/reception/register-dialog";
import type { PatientChoice } from "@/app/(dashboard)/doctor/appointments/actions";
import { walkInAction } from "@/app/(dashboard)/reception/actions";
import type { DoctorChoice } from "@/server/services/front-desk";

/**
 * Spec §12 + §13 — walk-in token generation.
 *
 * Who, which doctor, how urgent. The token is issued the moment it is
 * confirmed, and the token message goes out through whatever automation is
 * listening (spec §28).
 */

const PRIORITIES = [
  { value: "NORMAL", label: "Normal", hint: "Joins the end of the line" },
  { value: "PRIORITY", label: "Priority", hint: "Elderly, pregnant, disabled" },
  { value: "EMERGENCY", label: "Emergency", hint: "Seen next" },
] as const;

type Priority = (typeof PRIORITIES)[number]["value"];

export function WalkInDialog({
  doctors,
  trigger,
  defaultDoctorId,
  defaultPatient,
  openParam,
}: {
  doctors: DoctorChoice[];
  trigger?: React.ReactNode;
  defaultDoctorId?: string;
  defaultPatient?: PatientChoice;
  /** Opens when the URL carries `?open=<openParam>` (see useDialogState). */
  openParam?: string;
}) {
  const [open, setOpen] = useDialogState(openParam);

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Ticket />
          Walk-in token
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          {open && (
            <WalkInForm
              doctors={doctors}
              defaultDoctorId={defaultDoctorId}
              defaultPatient={defaultPatient}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function WalkInForm({
  doctors,
  defaultDoctorId,
  defaultPatient,
  onDone,
}: {
  doctors: DoctorChoice[];
  defaultDoctorId?: string;
  defaultPatient?: PatientChoice;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const available = doctors.filter((d) => d.acceptsWalkIns);

  const [patient, setPatient] = React.useState<PatientChoice | null>(
    defaultPatient ?? null,
  );
  const [doctorId, setDoctorId] = React.useState<string | null>(
    (defaultDoctorId && available.some((d) => d.id === defaultDoctorId)
      ? defaultDoctorId
      : available.find((d) => d.online)?.id) ??
      available[0]?.id ??
      null,
  );
  const [priority, setPriority] = React.useState<Priority>("NORMAL");
  const [reason, setReason] = React.useState("");

  function submit() {
    if (!patient || !doctorId) return;

    startTransition(async () => {
      const result = await walkInAction({
        patientId: patient.id,
        doctorId,
        priority,
        reason: reason || undefined,
      });

      if (result.ok) {
        toast.success(result.message ?? "Token issued.", {
          description: result.action,
        });
        router.refresh();
        onDone();
      } else {
        toast.error(result.message ?? "The token could not be issued.", {
          description: result.action,
        });
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Walk-in token</DialogTitle>
        <DialogDescription>
          For a patient without an appointment. They join today&apos;s queue
          straight away.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 px-6">
        {patient ? (
          <SelectedPatient patient={patient} onClear={() => setPatient(null)} />
        ) : (
          <PatientPicker
            id="walkin-patient"
            onSelect={setPatient}
            noMatch={
              <RegisterPatientDialog
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <UserPlus />
                    Register a new patient
                  </Button>
                }
                onRegistered={(p) => setPatient(p)}
              />
            }
          />
        )}

        <div>
          <label
            htmlFor="walkin-doctor"
            className="text-[12px] font-semibold text-muted-foreground"
          >
            Doctor
          </label>
          {available.length === 0 ? (
            <p className="mt-1.5 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
              No doctor is taking walk-ins today. Book the patient an
              appointment instead.
            </p>
          ) : (
            <Select value={doctorId ?? undefined} onValueChange={setDoctorId}>
              <SelectTrigger id="walkin-doctor" className="mt-1.5">
                <SelectValue placeholder="Choose a doctor" />
              </SelectTrigger>
              <SelectContent>
                {available.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.department ? ` · ${d.department}` : ""}
                    {d.online ? "" : " · away"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <fieldset>
          <legend className="text-[12px] font-semibold text-muted-foreground">
            Priority
          </legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {PRIORITIES.map((p) => (
              <label
                key={p.value}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-2 transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                  priority === p.value
                    ? p.value === "NORMAL"
                      ? "border-accent bg-accent-soft/50"
                      : "border-destructive bg-destructive-soft"
                    : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="walkin-priority"
                  value={p.value}
                  checked={priority === p.value}
                  onChange={() => setPriority(p.value)}
                  className="sr-only"
                />
                <span className="block text-[13px] font-semibold">
                  {p.label}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {p.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="walkin-reason"
            className="text-[12px] font-semibold text-muted-foreground"
          >
            Reason <span className="font-normal">(optional)</span>
          </label>
          <Input
            id="walkin-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Fever since yesterday"
            className="mt-1.5"
            maxLength={280}
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button
          variant="accent"
          disabled={pending || !patient || !doctorId}
          onClick={submit}
        >
          {pending && <LoaderCircle className="animate-spin" />}
          Issue token
        </Button>
      </DialogFooter>
    </>
  );
}
