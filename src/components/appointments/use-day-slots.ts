"use client";

import * as React from "react";
import {
  loadSlotsAction,
  type SlotChoice,
} from "@/app/(dashboard)/doctor/appointments/actions";

/**
 * Loads a day's bookable slots, and remembers which one is chosen.
 *
 * Both the slots and the selection are keyed by the day they belong to. That
 * is what makes changing the date invalidate them — rather than an effect
 * that resets state on the way past, which causes a cascading render and a
 * frame where yesterday's times are shown as if they were today's.
 */
export function useDaySlots(date: string, enabled = true) {
  const [loaded, setLoaded] = React.useState<{
    date: string;
    slots: SlotChoice[];
  } | null>(null);
  const [chosen, setChosen] = React.useState<{
    date: string;
    start: string;
  } | null>(null);
  const [pending, startLoading] = React.useTransition();

  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    startLoading(async () => {
      const slots = await loadSlotsAction(
        new Date(`${date}T00:00:00`).toISOString(),
      );
      // A slower earlier request must not land on top of a newer one.
      if (!cancelled) setLoaded({ date, slots });
    });

    return () => {
      cancelled = true;
    };
  }, [date, enabled]);

  const slots = loaded?.date === date ? loaded.slots : null;
  const selected = chosen?.date === date ? chosen.start : null;

  const select = React.useCallback(
    (start: string) => setChosen({ date, start }),
    [date],
  );

  return { slots, selected, select, loading: pending || slots === null };
}
