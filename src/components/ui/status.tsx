import * as React from "react";
import { cn } from "@/lib/utils";
import type { AppointmentStatus, PatientFlowStage } from "@/types";

/**
 * Spec §35 rule 6: show status visually. One vocabulary of colour is shared by
 * the queue, the timeline, the schedule and the flow visualisation so a state
 * always reads the same everywhere in the product.
 */

type StatusTone =
  | "registered"
  | "waiting"
  | "vitals"
  | "with-doctor"
  | "completed"
  | "followup"
  | "cancelled"
  | "no-show";

const TONE_CLASS: Record<StatusTone, { dot: string; chip: string }> = {
  registered: {
    dot: "text-state-registered",
    chip: "bg-muted text-muted-foreground",
  },
  waiting: {
    dot: "text-state-waiting",
    chip: "bg-warning-soft text-warning",
  },
  vitals: {
    dot: "text-state-vitals",
    chip: "bg-info-soft text-info",
  },
  "with-doctor": {
    dot: "text-state-with-doctor",
    chip: "bg-accent-soft text-brand-700",
  },
  completed: {
    dot: "text-state-completed",
    chip: "bg-success-soft text-success",
  },
  followup: {
    dot: "text-state-followup",
    chip: "bg-ai-soft text-state-followup",
  },
  cancelled: {
    dot: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground line-through decoration-1",
  },
  "no-show": {
    dot: "text-destructive",
    chip: "bg-destructive-soft text-destructive",
  },
};

const FLOW_TONE: Record<PatientFlowStage, StatusTone> = {
  REGISTERED: "registered",
  WAITING: "waiting",
  VITALS: "vitals",
  WITH_DOCTOR: "with-doctor",
  COMPLETED: "completed",
  FOLLOW_UP: "followup",
};

const APPOINTMENT_TONE: Record<AppointmentStatus, StatusTone> = {
  SCHEDULED: "registered",
  CHECKED_IN: "registered",
  WAITING: "waiting",
  IN_CONSULTATION: "with-doctor",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no-show",
  RESCHEDULED: "vitals",
};

const APPOINTMENT_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked in",
  WAITING: "Waiting",
  IN_CONSULTATION: "With doctor",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
  RESCHEDULED: "Rescheduled",
};

const FLOW_LABEL: Record<PatientFlowStage, string> = {
  REGISTERED: "Registered",
  WAITING: "Waiting",
  VITALS: "Vitals",
  WITH_DOCTOR: "With doctor",
  COMPLETED: "Completed",
  FOLLOW_UP: "Follow-up",
};

export function toneForFlowStage(stage: PatientFlowStage): StatusTone {
  return FLOW_TONE[stage];
}

export function labelForFlowStage(stage: PatientFlowStage): string {
  return FLOW_LABEL[stage];
}

export function toneForAppointmentStatus(status: AppointmentStatus): StatusTone {
  return APPOINTMENT_TONE[status];
}

export function labelForAppointmentStatus(status: AppointmentStatus): string {
  return APPOINTMENT_LABEL[status];
}

/** A small coloured dot. `live` adds the halo used for active/urgent states. */
function StatusDot({
  tone,
  live,
  className,
  ...props
}: React.ComponentProps<"span"> & { tone: StatusTone; live?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-2 shrink-0 items-center justify-center",
        TONE_CLASS[tone].dot,
        className,
      )}
      {...props}
    >
      {live && <span className="pulse-ring absolute inset-0 rounded-full" />}
      <span className="relative size-2 rounded-full bg-current" />
    </span>
  );
}

/** Dot + label chip. Used by queue rows, schedule entries and timelines. */
function StatusChip({
  tone,
  label,
  live,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  tone: StatusTone;
  label: string;
  live?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold",
        TONE_CLASS[tone].chip,
        className,
      )}
      {...props}
    >
      <StatusDot tone={tone} live={live} />
      {label}
    </span>
  );
}

export { StatusDot, StatusChip, type StatusTone };
