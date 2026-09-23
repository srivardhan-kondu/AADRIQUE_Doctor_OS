import Link from "next/link";
import { CalendarCheck2, Footprints } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StatusChip,
  labelForAppointmentStatus,
  toneForAppointmentStatus,
} from "@/components/ui/status";
import {
  AppointmentMenu,
  CheckInButton,
} from "@/components/appointments/appointment-actions";
import type { ArrivalRow } from "@/server/services/front-desk";

/**
 * Spec §13 — today's arrivals and check-ins.
 *
 * Split the way the desk works: the people still expected, with the check-in
 * button in reach, and then everyone who has already been dealt with.
 */
export function ArrivalsCard({ arrivals }: { arrivals: ArrivalRow[] }) {
  const expected = arrivals.filter((a) => a.status === "SCHEDULED");
  const arrived = arrivals.filter((a) => a.status !== "SCHEDULED");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Today&apos;s arrivals</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {arrivals.length === 0
              ? "Nothing booked today"
              : `${expected.length} expected · ${arrived.length} arrived`}
          </p>
        </div>
      </CardHeader>

      {arrivals.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title="No appointments today"
          description="Walk-ins still join the queue — issue them a token from the top of the page."
        />
      ) : (
        <div className="pb-2">
          {expected.length > 0 && (
            <Section title="Expected" rows={expected} />
          )}
          {arrived.length > 0 && <Section title="Arrived" rows={arrived} />}
        </div>
      )}
    </Card>
  );
}

function Section({ title, rows }: { title: string; rows: ArrivalRow[] }) {
  return (
    <section>
      <h3 className="bg-muted/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {rows.length}
      </h3>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.appointmentId}>
            <ArrivalItem row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArrivalItem({ row }: { row: ArrivalRow }) {
  const late = row.late;
  const time = row.time.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="w-16 shrink-0">
        <p
          className={cn(
            "font-mono text-[13px] font-bold tabular",
            late && "text-destructive",
          )}
        >
          {time}
        </p>
        {late && <p className="text-[11px] text-destructive">Running late</p>}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <Link
            href={`/reception/patients/${row.patientId}`}
            className="truncate text-[14px] font-semibold hover:text-accent hover:underline"
          >
            {row.patientName}
          </Link>
          {row.type === "WALK_IN" && (
            <Badge variant="muted">
              <Footprints />
              Walk-in
            </Badge>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span data-numeric>{row.patientMrn}</span>
          <span aria-hidden>·</span>
          <span>{row.doctorName}</span>
          {row.token && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono font-semibold text-foreground">
                {row.token}
              </span>
            </>
          )}
        </p>
      </div>

      <StatusChip
        tone={toneForAppointmentStatus(row.status)}
        label={labelForAppointmentStatus(row.status)}
        live={row.status === "IN_CONSULTATION"}
        className="shrink-0"
      />

      <div className="flex shrink-0 items-center gap-1.5">
        {row.status === "SCHEDULED" && (
          <CheckInButton
            appointmentId={row.appointmentId}
            patientName={row.patientName}
          />
        )}
        <AppointmentMenu
          appointmentId={row.appointmentId}
          patientName={row.patientName}
          scheduledFor={`${time} today`}
          doctorId={row.doctorId}
          canReschedule={row.status === "SCHEDULED"}
          canCancel={
            row.status === "SCHEDULED" ||
            row.status === "CHECKED_IN" ||
            row.status === "WAITING"
          }
          canMarkNoShow={row.status === "SCHEDULED" && row.due}
        />
      </div>
    </div>
  );
}
