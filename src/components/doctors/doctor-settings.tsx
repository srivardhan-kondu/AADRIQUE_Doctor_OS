"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveSettingsAction,
  setOnlineAction,
} from "@/app/(dashboard)/doctor/profile/actions";

const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60];

/**
 * How the queue and the booking screens treat the doctor's time (spec §11).
 * The department is an administrator's decision, so it only appears for one.
 */
export function PracticeSettings({
  doctorId,
  consultationMinutes,
  acceptsWalkIns,
  departments,
  departmentId,
  canEdit,
}: {
  doctorId: string;
  consultationMinutes: number;
  acceptsWalkIns: boolean;
  /** Set only for an administrator. */
  departments?: { id: string; name: string }[];
  departmentId?: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [minutes, setMinutes] = React.useState(String(consultationMinutes));
  const [walkIns, setWalkIns] = React.useState(acceptsWalkIns);
  const [department, setDepartment] = React.useState(departmentId ?? "");

  const dirty =
    Number(minutes) !== consultationMinutes ||
    walkIns !== acceptsWalkIns ||
    (departments !== undefined && department !== (departmentId ?? ""));

  function save() {
    startTransition(async () => {
      const result = await saveSettingsAction(doctorId, {
        consultationMinutes: Number(minutes),
        acceptsWalkIns: walkIns,
        ...(departments ? { departmentId: department || null } : {}),
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.refresh();
      } else {
        toast.error(result.message ?? "Not saved.", { description: result.action });
      }
    });
  }

  const slotOptions = SLOT_LENGTHS.includes(consultationMinutes)
    ? SLOT_LENGTHS
    : [...SLOT_LENGTHS, consultationMinutes].sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Practice</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Slot length sets how the day is divided into appointments.
          </p>
        </div>
      </CardHeader>

      <div className="space-y-4 px-5 pb-5">
        {departments && (
          <div>
            <label
              htmlFor={`dept-${doctorId}`}
              className="text-[12px] font-semibold text-muted-foreground"
            >
              Department
            </label>
            <Select value={department} onValueChange={setDepartment} disabled={!canEdit}>
              <SelectTrigger id={`dept-${doctorId}`} className="mt-1.5">
                <SelectValue placeholder="No department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <label
            htmlFor={`slot-${doctorId}`}
            className="text-[12px] font-semibold text-muted-foreground"
          >
            Consultation slot
          </label>
          <Select value={minutes} onValueChange={setMinutes} disabled={!canEdit}>
            <SelectTrigger id={`slot-${doctorId}`} className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {slotOptions.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--accent)]"
            checked={walkIns}
            disabled={!canEdit}
            onChange={(e) => setWalkIns(e.target.checked)}
          />
          <span>
            <span className="block text-[13px] font-medium">Accept walk-ins</span>
            <span className="block text-[12px] text-muted-foreground">
              The front desk can add patients without an appointment to the
              queue.
            </span>
          </span>
        </label>

        {canEdit && (
          <div className="flex justify-end">
            <Button variant="accent" onClick={save} disabled={!dirty || pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              Save
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Spec §12 — doctor status, set by the doctor. */
export function OnDutySwitch({
  doctorId,
  online,
}: {
  doctorId: string;
  online: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setOnlineAction(doctorId, !online);
          if (result.ok) {
            toast.success(result.message ?? "Updated.");
            router.refresh();
          } else {
            toast.error(result.message ?? "Not updated.");
          }
        })
      }
      className={cn(
        "inline-flex h-9 items-center gap-2.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors",
        online
          ? "border-success/40 bg-success-soft text-success"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors",
            online ? "bg-success" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3 rounded-full bg-white transition-all",
              online ? "left-3.5" : "left-0.5",
            )}
          />
        </span>
      )}
      {online ? "On duty" : "Away"}
    </button>
  );
}
