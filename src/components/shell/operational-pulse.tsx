"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Spec §41-J — Operational Pulse.
 *
 * A single live read on OPD health, always visible in the chrome. The state is
 * derived from measurable operational rules (wait times, queue depth, doctor
 * availability) — never from clinical judgement. Part 2 feeds it real metrics;
 * the component already models every state it will need to render.
 */

export type PulseState = "NORMAL" | "BUSY" | "ATTENTION";

const PULSE_META: Record<
  PulseState,
  { label: string; dot: string; text: string; detail: string }
> = {
  NORMAL: {
    label: "Normal",
    dot: "text-state-completed",
    text: "text-state-completed",
    detail: "Wait times are within the configured threshold.",
  },
  BUSY: {
    label: "Busy",
    dot: "text-state-waiting",
    text: "text-state-waiting",
    detail: "Queue is building but still inside operating limits.",
  },
  ATTENTION: {
    label: "Attention Needed",
    dot: "text-destructive",
    text: "text-destructive",
    detail: "Queue or wait time has crossed the configured threshold.",
  },
};

export function OperationalPulse({
  state = "NORMAL",
  collapsed = false,
}: {
  state?: PulseState;
  collapsed?: boolean;
}) {
  const meta = PULSE_META[state];

  const dot = (
    <span
      className={cn(
        "relative inline-flex size-2 shrink-0 items-center justify-center",
        meta.dot,
      )}
    >
      <span className="pulse-ring absolute inset-0 rounded-full" />
      <span className="relative size-2 rounded-full bg-current" />
    </span>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-10 items-center justify-center rounded-full bg-sidebar-accent shadow-soft">
            {dot}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="font-semibold">OPD Health · {meta.label}</span>
          <br />
          <span className="font-normal text-navy-200">{meta.detail}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded-xl bg-sidebar-accent px-3.5 py-2.5 text-left shadow-soft">
          <p className="text-[12px] font-medium text-sidebar-muted">OPD health</p>
          <p className={cn("mt-1 flex items-center gap-2 text-[13px] font-semibold", meta.text)}>
            {dot}
            {meta.label}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">{meta.detail}</TooltipContent>
    </Tooltip>
  );
}
