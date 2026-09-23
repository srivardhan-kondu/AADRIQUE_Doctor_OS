import Link from "next/link";
import {
  AlarmClock,
  CalendarDays,
  CalendarOff,
  Coffee,
  Phone,
  Repeat2,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StatusChip,
  labelForAppointmentStatus,
  toneForAppointmentStatus,
} from "@/components/ui/status";
import type { AppointmentRow, DayColumn, ScheduleView } from "@/server/services/appointments";
import { AppointmentMenu, CheckInButton } from "./appointment-actions";
import { BookAppointmentDialog } from "./book-dialog";

/**
 * Spec §11 — the doctor's schedule.
 *
 * The day view is a list because a day is read in order. The week view is
 * seven columns because a week is read by comparison — which days are full
 * and which are empty.
 */

const TYPE_LABEL: Record<string, string> = {
  NEW_CONSULTATION: "New",
  FOLLOW_UP: "Follow-up",
  WALK_IN: "Walk-in",
  PROCEDURE: "Procedure",
  TELECONSULTATION: "Teleconsult",
};

export function ScheduleBoard({ schedule }: { schedule: ScheduleView }) {
  return schedule.view === "week" ? (
    <WeekGrid schedule={schedule} />
  ) : (
    <DayList day={schedule.days[0]} schedule={schedule} />
  );
}

/* ------------------------------- day view ------------------------------- */

function DayList({
  day,
  schedule,
}: {
  day: DayColumn;
  schedule: ScheduleView;
}) {
  if (day.windows.length === 0 && day.appointments.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={CalendarOff}
          title={`No clinic on ${dayName(day.date)}`}
          description="This day is outside the recurring availability on your profile. Nothing is booked, and nothing can be."
        />
      </Card>
    );
  }

  // Appointments belong to the clinic session they fall inside, so the day
  // reads as "morning clinic, break, evening clinic" rather than one long run.
  const sessions = day.windows.map((window) => ({
    ...window,
    appointments: day.appointments.filter((a) => {
      const minute = a.start.getHours() * 60 + a.start.getMinutes();
      return minute >= window.startMinute && minute < window.endMinute;
    }),
  }));

  const outside = day.appointments.filter(
    (a) =>
      !day.windows.some((w) => {
        const minute = a.start.getHours() * 60 + a.start.getMinutes();
        return minute >= w.startMinute && minute < w.endMinute;
      }),
  );

  return (
    <div className="space-y-5">
      {sessions.map((session, index) => (
        <Card key={`${session.startMinute}-${index}`}>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>
                {session.label ?? sessionName(session.startMinute)}
              </CardTitle>
              <p className="mt-0.5 text-[12px] text-muted-foreground tabular">
                {formatMinute(session.startMinute)} –{" "}
                {formatMinute(session.endMinute)}
              </p>
            </div>
            <SessionLoad
              booked={session.appointments.length}
              capacity={Math.floor(
                (session.endMinute - session.startMinute) /
                  schedule.doctor.consultationMinutes,
              )}
            />
          </CardHeader>

          {session.appointments.length === 0 ? (
            <div className="flex items-center gap-3 px-5 pb-5">
              <Coffee className="size-4 shrink-0 text-muted-foreground" />
              <p className="text-[13px] text-muted-foreground">
                Nothing booked in this session yet.
              </p>
              <BookAppointmentDialog
                defaultDate={isoOf(day.date)}
                trigger={
                  <button
                    type="button"
                    className="ml-auto text-[13px] font-semibold text-accent hover:underline"
                  >
                    Book someone in
                  </button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {session.appointments.map((appointment) => (
                <AppointmentRowView
                  key={appointment.id}
                  appointment={appointment}
                />
              ))}
            </ul>
          )}
        </Card>
      ))}

      {outside.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Outside clinic hours</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Booked when availability was different, or added by hand.
            </p>
          </CardHeader>
          <ul className="divide-y divide-border border-t border-border">
            {outside.map((appointment) => (
              <AppointmentRowView
                key={appointment.id}
                appointment={appointment}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SessionLoad({
  booked,
  capacity,
}: {
  booked: number;
  capacity: number;
}) {
  const ratio = capacity > 0 ? Math.min(1, booked / capacity) : 0;

  return (
    <div className="shrink-0 text-right">
      <p className="text-[12px] font-semibold tabular">
        {booked}
        <span className="text-muted-foreground">/{capacity}</span>
      </p>
      <div
        className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${booked} of ${capacity} slots booked`}
      >
        <div
          className={cn(
            "h-full rounded-full",
            ratio > 0.85 ? "bg-warning" : "bg-accent",
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function AppointmentRowView({
  appointment,
}: {
  appointment: AppointmentRow;
}) {
  const scheduledFor = `${formatTime(appointment.start)} on ${dayName(appointment.start)}`;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors",
        appointment.isNext && "bg-accent-soft/40",
        appointment.status === "CANCELLED" && "opacity-60",
      )}
    >
      <div className="w-16 shrink-0">
        <p className="font-mono text-[13px] font-bold tabular">
          {formatTime(appointment.start)}
        </p>
        <p className="text-[11px] text-muted-foreground tabular">
          {appointment.durationMinutes} min
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <Link
            href={`/doctor/patients/${appointment.patientId}`}
            className="truncate text-[14px] font-semibold hover:text-accent hover:underline"
          >
            {appointment.patientName}
          </Link>
          {appointment.isNext && (
            <Badge variant="accent">
              <AlarmClock />
              Next
            </Badge>
          )}
          {appointment.type === "FOLLOW_UP" && (
            <Badge variant="muted">
              <Repeat2 />
              Follow-up
            </Badge>
          )}
        </p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span data-numeric>{appointment.patientMrn}</span>
          {appointment.age !== null && (
            <>
              <span aria-hidden>·</span>
              <span data-numeric>{appointment.age}y</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3" />
            <span data-numeric>{appointment.patientPhone}</span>
          </span>
          {appointment.token && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono font-semibold text-foreground">
                {appointment.token}
              </span>
            </>
          )}
        </p>

        {appointment.reason && (
          <p className="mt-1 truncate text-[13px]">{appointment.reason}</p>
        )}
      </div>

      <StatusChip
        tone={toneForAppointmentStatus(appointment.status)}
        label={labelForAppointmentStatus(appointment.status)}
        live={appointment.status === "IN_CONSULTATION"}
        className="shrink-0"
      />

      <div className="flex shrink-0 items-center gap-1.5">
        {appointment.visitId && (
          <Link
            href={`/doctor/consultations/${appointment.visitId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
          >
            <Stethoscope className="size-3.5" />
            Consultation
          </Link>
        )}

        {appointment.status === "SCHEDULED" && isToday(appointment.start) && (
          <CheckInButton
            appointmentId={appointment.id}
            patientName={appointment.patientName}
          />
        )}

        <AppointmentMenu
          appointmentId={appointment.id}
          patientName={appointment.patientName}
          scheduledFor={scheduledFor}
          canReschedule={appointment.status === "SCHEDULED"}
          canCancel={
            appointment.status === "SCHEDULED" ||
            appointment.status === "CHECKED_IN" ||
            appointment.status === "WAITING"
          }
          canMarkNoShow={
            appointment.status === "SCHEDULED" && appointment.start < new Date()
          }
        />
      </div>
    </li>
  );
}

/* ------------------------------- week view ------------------------------ */

function WeekGrid({ schedule }: { schedule: ScheduleView }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      {schedule.days.map((day) => (
        <WeekColumn key={day.date.toISOString()} day={day} />
      ))}
    </div>
  );
}

function WeekColumn({ day }: { day: DayColumn }) {
  const closed = day.windows.length === 0;

  return (
    <Card
      className={cn(
        "flex flex-col gap-0 p-0",
        day.isToday && "border-accent/50 ring-1 ring-accent/20",
        closed && "bg-muted/40",
      )}
    >
      <div className="border-b border-border px-3 py-2.5">
        <p className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-[12px] font-semibold uppercase tracking-wide",
              day.isToday ? "text-accent" : "text-muted-foreground",
            )}
          >
            {day.date.toLocaleDateString("en-IN", { weekday: "short" })}
          </span>
          <span className="font-display text-lg font-bold tabular">
            {day.date.getDate()}
          </span>
        </p>

        {closed ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">Closed</p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular">
            {day.booked}/{day.capacity} booked
          </p>
        )}
      </div>

      {closed ? (
        <div className="flex flex-1 items-center justify-center px-3 py-6">
          <CalendarOff className="size-4 text-muted-foreground/50" />
        </div>
      ) : day.appointments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-6">
          <p className="text-[11px] text-muted-foreground">Nothing booked</p>
        </div>
      ) : (
        <ul className="flex-1 space-y-1 p-2">
          {day.appointments.map((appointment) => (
            <li key={appointment.id}>
              <Link
                href={`/doctor/patients/${appointment.patientId}`}
                className={cn(
                  "block rounded-md border-l-2 bg-muted/60 px-2 py-1.5 transition-colors hover:bg-muted",
                  borderForStatus(appointment.status),
                  appointment.status === "CANCELLED" && "opacity-55",
                )}
              >
                <p className="font-mono text-[11px] font-bold tabular">
                  {formatTime(appointment.start)}
                </p>
                <p className="truncate text-[12px] font-semibold">
                  {appointment.patientName}
                </p>
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[appointment.type] ?? appointment.type}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The status vocabulary from `ui/status`, as a left border. */
function borderForStatus(status: AppointmentRow["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "border-l-state-completed";
    case "IN_CONSULTATION":
      return "border-l-state-with-doctor";
    case "WAITING":
    case "CHECKED_IN":
      return "border-l-state-waiting";
    case "NO_SHOW":
      return "border-l-destructive";
    case "CANCELLED":
    case "RESCHEDULED":
      return "border-l-muted-foreground/40";
    default:
      return "border-l-state-registered";
  }
}

/* -------------------------------- helpers ------------------------------- */

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMinute(minute: number): string {
  const d = new Date();
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return formatTime(d);
}

function sessionName(startMinute: number): string {
  if (startMinute < 12 * 60) return "Morning clinic";
  if (startMinute < 16 * 60) return "Afternoon clinic";
  return "Evening clinic";
}

function dayName(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isoOf(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export { CalendarDays };
