"use client";

import * as React from "react";
import {
  loadSlotsAction,
  type SlotChoice,
} from "@/app/(dashboard)/doctor/appointments/actions";

/**
 * Loads a day's bookable slots, and remembers which one is chosen.
 *
 * Both the slots and the selection are keyed by the day — and the doctor —
 * they belong to. That is what makes changing either invalidate them — rather than an effect
 * that resets state on the way past, which causes a cascading render and a
 * frame where yesterday's times are shown as if they were today's.
 */
export function useDaySlots(
  date: string,
  enabled = true,
  doctorId?: string | null,
) {
  const [loaded, setLoaded] = React.useState<{
    key: string;
    slots: SlotChoice[];
  } | null>(null);
  const [chosen, setChosen] = React.useState<{
    key: string;
    start: string;
  } | null>(null);
  const [pending, startLoading] = React.useTransition();

  // Slots belong to a day *and* a doctor; changing either invalidates them.
  const key = `${doctorId ?? "self"}:${date}`;

  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    startLoading(async () => {
      const slots = await loadSlotsAction(
        new Date(`${date}T00:00:00`).toISOString(),
        doctorId ?? undefined,
      );
      // A slower earlier request must not land on top of a newer one.
      if (!cancelled) setLoaded({ key, slots });
    });

    return () => {
      cancelled = true;
    };
  }, [date, doctorId, enabled, key]);

  const slots = loaded?.key === key ? loaded.slots : null;
  const selected = chosen?.key === key ? chosen.start : null;

  const select = React.useCallback(
    (start: string) => setChosen({ key, start }),
    [key],
  );

  return { slots, selected, select, loading: pending || slots === null };
}
