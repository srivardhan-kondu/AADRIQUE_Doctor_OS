"use client";

import { CalendarOff, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { SlotChoice } from "@/app/(dashboard)/doctor/appointments/actions";

/**
 * Spec §11 — bookable times, shown as a grid rather than a dropdown.
 *
 * A taken slot stays visible and disabled instead of disappearing. Seeing
 * that 11:00 is booked is information; a gap in a list is a puzzle.
 */
export function SlotPicker({
  slots,
  loading,
  selected,
  onSelect,
}: {
  slots: SlotChoice[] | null;
  loading: boolean;
  selected: string | null;
  onSelect: (start: string) => void;
}) {
  if (loading || slots === null) {
    return (
      <div>
        <p className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Finding open slots
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-9 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const open = slots.filter((s) => s.available).length;

  if (slots.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5">
        <CalendarOff className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">
          No clinic hours on this day. Pick another date.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12px] font-semibold text-muted-foreground">
        {open === 0
          ? "Every slot on this day is taken"
          : `${open} open ${open === 1 ? "slot" : "slots"}`}
      </p>

      <div className="mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-5">
        {slots.map((slot) => {
          const isSelected = slot.start === selected;

          return (
            <button
              key={slot.start}
              type="button"
              disabled={!slot.available}
              aria-pressed={isSelected}
              title={slot.reason ?? undefined}
              onClick={() => onSelect(slot.start)}
              className={cn(
                "rounded-md border px-2 py-2 text-[12px] font-semibold tabular transition-colors",
                slot.available
                  ? "border-border bg-card hover:border-accent/50 hover:bg-accent-soft"
                  : "cursor-not-allowed border-transparent bg-muted text-muted-foreground/60 line-through decoration-1",
                isSelected &&
                  "border-accent bg-accent text-accent-foreground hover:bg-accent",
              )}
            >
              {slot.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
