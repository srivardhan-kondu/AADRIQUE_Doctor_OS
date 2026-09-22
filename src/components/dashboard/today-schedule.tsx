import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  StatusChip,
  labelForAppointmentStatus,
  toneForAppointmentStatus,
} from "@/components/ui/status";
import type { AppointmentStatus } from "@/types";
import type { ScheduleRow } from "@/server/services/dashboard";

/** Spec §5.1 — Today's Schedule, beside the live queue. */
export function TodaySchedule({ rows }: { rows: ScheduleRow[] }) {
  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <div>
          <CardTitle>Today&apos;s Schedule</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {rows.length} {rows.length === 1 ? "appointment" : "appointments"}
          </p>
        </div>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/doctor/appointments">
              All
              <ChevronRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing booked today"
          description="Walk-ins will still appear in your queue as they register."
        />
      ) : (
        <ScrollArea className="max-h-[420px] px-2 pb-2">
          <ul className="space-y-0.5">
            {rows.map((row) => (
              <li key={row.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted",
                    row.isNext && "bg-muted/60 ring-1 ring-inset ring-border",
                  )}
                >
                  <span
                    data-numeric
                    className="w-[52px] shrink-0 text-[13px] font-semibold tabular-nums"
                  >
                    {row.time.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {row.patientName}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {row.reason ?? row.type.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </span>
                  <StatusChip
                    tone={toneForAppointmentStatus(row.status as AppointmentStatus)}
                    label={labelForAppointmentStatus(row.status as AppointmentStatus)}
                    className="shrink-0"
                  />
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </Card>
  );
}
