"use client";

import * as React from "react";
import {
  CalendarPlus,
  Check,
  LoaderCircle,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useDialogState } from "@/hooks/use-dialog-state";
import {
  bookAppointmentAction,
  searchPatientsAction,
  type PatientChoice,
} from "@/app/(dashboard)/doctor/appointments/actions";
import type { DoctorChoice } from "@/server/services/front-desk";
import { isoDate, tomorrow, useAppointmentAction } from "./appointment-actions";
import { SlotPicker } from "./slot-picker";
import { useDaySlots } from "./use-day-slots";

/**
 * Spec §11 + §35 rule 4 — booking in one dialog, not a fifteen-field form.
 *
 * Three decisions: who, when, and why. Everything else has a sensible default
 * the doctor can ignore.
 */

const TYPES = [
  { value: "NEW_CONSULTATION", label: "New consultation" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "PROCEDURE", label: "Procedure" },
  { value: "TELECONSULTATION", label: "Teleconsultation" },
] as const;

export function BookAppointmentDialog({
  trigger,
  defaultDate,
  defaultPatient,
  doctors,
  defaultDoctorId,
  openParam,
}: {
  trigger?: React.ReactNode;
  defaultDate?: string;
  defaultPatient?: PatientChoice;
  /** Opens when the URL carries `?open=<openParam>` (see useDialogState). */
  openParam?: string;
  /**
   * The front desk books for any doctor and chooses here. Left out, the
   * booking is for the signed-in doctor.
   */
  doctors?: DoctorChoice[];
  defaultDoctorId?: string;
}) {
  const [open, setOpen] = useDialogState(openParam);

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button variant="accent" onClick={() => setOpen(true)}>
          <CalendarPlus />
          Book appointment
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          {/* Remounted per open so a half-finished booking never lingers. */}
          {open && (
            <BookForm
              defaultDate={defaultDate}
              defaultPatient={defaultPatient}
              doctors={doctors}
              defaultDoctorId={defaultDoctorId}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BookForm({
  defaultDate,
  defaultPatient,
  doctors,
  defaultDoctorId,
  onDone,
}: {
  defaultDate?: string;
  defaultPatient?: PatientChoice;
  doctors?: DoctorChoice[];
  defaultDoctorId?: string;
  onDone: () => void;
}) {
  const { pending, run } = useAppointmentAction();

  const [patient, setPatient] = React.useState<PatientChoice | null>(
    defaultPatient ?? null,
  );
  const [date, setDate] = React.useState(defaultDate ?? isoDate(tomorrow()));
  const [type, setType] = React.useState<string>("NEW_CONSULTATION");
  const [reason, setReason] = React.useState("");
  const [doctorId, setDoctorId] = React.useState<string | null>(
    doctors ? (defaultDoctorId ?? doctors[0]?.id ?? null) : null,
  );
  // With a doctor list the slots wait for a choice; without one they are the
  // signed-in doctor's.
  const needsDoctor = Boolean(doctors);
  const {
    slots,
    selected: slot,
    select,
    loading: loadingSlots,
  } = useDaySlots(date, !needsDoctor || doctorId !== null, doctorId);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Book an appointment</DialogTitle>
        <DialogDescription>
          The patient hears about it as soon as it is booked, on the channels
          they agreed to.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 px-6">
        {patient ? (
          <SelectedPatient patient={patient} onClear={() => setPatient(null)} />
        ) : (
          <PatientPicker onSelect={setPatient} />
        )}

        {doctors && (
          <div>
            <label
              htmlFor="book-doctor"
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Doctor
            </label>
            <Select
              value={doctorId ?? undefined}
              onValueChange={setDoctorId}
            >
              <SelectTrigger id="book-doctor" className="mt-1.5">
                <SelectValue placeholder="Choose a doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.department ? ` · ${d.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="book-date"
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Date
            </label>
            <Input
              id="book-date"
              type="date"
              value={date}
              min={isoDate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 w-44"
            />
          </div>

          <div className="min-w-44 flex-1">
            <label
              htmlFor="book-type"
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Type
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="book-type" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SlotPicker
          slots={slots}
          loading={loadingSlots}
          selected={slot}
          onSelect={select}
        />

        <div>
          <label
            htmlFor="book-reason"
            className="text-[12px] font-semibold text-muted-foreground"
          >
            Reason <span className="font-normal">(optional)</span>
          </label>
          <Input
            id="book-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Persistent cough, 3 weeks"
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
          disabled={pending || !patient || !slot || (needsDoctor && !doctorId)}
          onClick={() =>
            patient &&
            slot &&
            run(
              () =>
                bookAppointmentAction({
                  patientId: patient.id,
                  doctorId: doctorId ?? undefined,
                  start: slot,
                  type: type as (typeof TYPES)[number]["value"],
                  reason: reason || undefined,
                }),
              onDone,
            )
          }
        >
          {pending && <LoaderCircle className="animate-spin" />}
          Book
        </Button>
      </DialogFooter>
    </>
  );
}

export function SelectedPatient({
  patient,
  onClear,
}: {
  patient: PatientChoice;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <UserRound className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{patient.name}</p>
        <p className="text-[12px] text-muted-foreground">
          <span data-numeric>{patient.mrn}</span>
          {patient.age !== null && (
            <>
              <span aria-hidden> · </span>
              <span data-numeric>{patient.age}y</span>
            </>
          )}
          <span aria-hidden> · </span>
          <span data-numeric>{patient.phone}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Choose a different patient"
        onClick={onClear}
      >
        <X />
      </Button>
    </div>
  );
}

/** Spec §13 — the same one-box search as everywhere else in the product. */
export function PatientPicker({
  onSelect,
  id = "book-patient",
  noMatch,
}: {
  onSelect: (patient: PatientChoice) => void;
  id?: string;
  /** What to offer when nobody matches — the front desk registers them. */
  noMatch?: React.ReactNode;
}) {
  const [term, setTerm] = React.useState("");
  const [results, setResults] = React.useState<PatientChoice[]>([]);
  const [searching, startSearching] = React.useTransition();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      startSearching(async () => {
        setResults(await searchPatientsAction(term));
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [term]);

  return (
    <div>
      <label
        htmlFor={id}
        className="text-[12px] font-semibold text-muted-foreground"
      >
        Patient
      </label>

      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Name, mobile number or patient ID"
          className="pl-9"
        />
      </div>

      <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border">
        {searching && results.length === 0 ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-md" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            <p>
              {term
                ? `Nobody matches “${term}”.${noMatch ? "" : " Register them at the front desk first."}`
                : "Start typing to find a patient."}
            </p>
            {term && noMatch && <div className="mt-3">{noMatch}</div>}
          </div>
        ) : (
          <ul>
            {results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                    "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {row.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span data-numeric>{row.mrn}</span>
                      <span aria-hidden> · </span>
                      <span data-numeric>{row.phone}</span>
                    </p>
                  </div>
                  {row.age !== null && (
                    <Badge variant="muted" data-numeric>
                      {row.age}y
                    </Badge>
                  )}
                  <Check className="size-4 shrink-0 text-transparent" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
