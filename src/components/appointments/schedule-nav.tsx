"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isoDate } from "./appointment-actions";

/**
 * Date and view control for the schedule.
 *
 * The state lives in the URL, so a particular day is a link a doctor can keep,
 * the back button works, and the server component re-renders underneath.
 */
export function ScheduleNav({
  date,
  view,
}: {
  date: string;
  view: "day" | "week";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = React.useCallback(
    (next: { date?: string; view?: string }) => {
      const params = new URLSearchParams(searchParams);
      if (next.date) params.set("date", next.date);
      if (next.view) params.set("view", next.view);
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const shift = React.useCallback(
    (direction: -1 | 1) => {
      const current = new Date(`${date}T00:00:00`);
      current.setDate(current.getDate() + direction * (view === "week" ? 7 : 1));
      push({ date: isoDate(current) });
    },
    [date, view, push],
  );

  const isToday = date === isoDate(new Date());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-md border border-border bg-card">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={view === "week" ? "Previous week" : "Previous day"}
          onClick={() => shift(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isToday}
          onClick={() => push({ date: isoDate(new Date()) })}
          className="rounded-none border-x border-border"
        >
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={view === "week" ? "Next week" : "Next day"}
          onClick={() => shift(1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <Tabs value={view} onValueChange={(value) => push({ view: value })}>
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
