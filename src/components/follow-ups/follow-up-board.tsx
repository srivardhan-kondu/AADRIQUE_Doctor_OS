import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Phone,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  FollowUpBoard,
  FollowUpRow,
  ReactivationRow,
} from "@/server/services/follow-ups";
import { FollowUpMenu, RemindButton } from "./follow-up-actions";

/**
 * Spec §42 — the smart follow-up queue.
 *
 * Overdue first and always visible, even when empty, because "nothing is
 * overdue" is the fact the doctor most wants confirmed.
 */
export function FollowUpBoardView({ board }: { board: FollowUpBoard }) {
  const nothingAtAll =
    board.counts.open === 0 && board.reactivation.length === 0;

  if (nothingAtAll) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={CalendarCheck}
          title="Every follow-up is closed"
          description="Nobody is overdue and nothing is due today. Follow-ups you promise during a consultation will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Group
        icon={AlertTriangle}
        tone="overdue"
        title="Overdue"
        description="These patients should already have come back."
        rows={board.overdue}
        emptyText="Nobody is overdue."
      />

      <Group
        icon={Clock3}
        tone="today"
        title="Due today"
        rows={board.dueToday}
        emptyText="Nothing is due today."
      />

      <Group
        icon={CalendarCheck}
        tone="upcoming"
        title="Upcoming"
        description="The next 30 days."
        rows={board.upcoming}
        emptyText="Nothing scheduled in the next 30 days."
      />

      {board.reactivation.length > 0 && (
        <ReactivationCard rows={board.reactivation} />
      )}
    </div>
  );
}

function Group({
  icon: Icon,
  tone,
  title,
  description,
  rows,
  emptyText,
}: {
  icon: LucideIcon;
  tone: "overdue" | "today" | "upcoming";
  title: string;
  description?: string;
  rows: FollowUpRow[];
  emptyText: string;
}) {
  const toneClass = {
    overdue: "text-destructive",
    today: "text-warning",
    upcoming: "text-muted-foreground",
  }[tone];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Icon className={cn("size-4", toneClass)} />
            {title}
            <span className="text-muted-foreground tabular">{rows.length}</span>
          </CardTitle>
          {description && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </CardHeader>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <FollowUpRowView key={row.id} row={row} tone={tone} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FollowUpRowView({
  row,
  tone,
}: {
  row: FollowUpRow;
  tone: "overdue" | "today" | "upcoming";
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5",
        tone === "overdue" && "bg-destructive-soft/30",
      )}
    >
      <div className="w-24 shrink-0">
        <p
          className={cn(
            "text-[13px] font-bold",
            tone === "overdue" ? "text-destructive" : "",
          )}
        >
          {dueLabel(row.daysUntilDue)}
        </p>
        <p className="text-[11px] text-muted-foreground tabular">
          {row.dueDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/doctor/patients/${row.patientId}`}
            className="truncate text-[14px] font-semibold hover:text-accent hover:underline"
          >
            {row.patientName}
          </Link>
          {row.appointmentAt && (
            <Badge variant="success">
              <CalendarCheck />
              Booked{" "}
              {row.appointmentAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </Badge>
          )}
          {row.reminderSentAt && !row.appointmentAt && (
            <Badge variant="muted">
              <Send />
              Reminded{" "}
              {row.reminderSentAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </Badge>
          )}
        </p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span data-numeric>{row.patientMrn}</span>
          {row.age !== null && (
            <>
              <span aria-hidden>·</span>
              <span data-numeric>{row.age}y</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3" />
            <span data-numeric>{row.phone}</span>
          </span>
        </p>

        {row.reason && (
          <p className="mt-1 truncate text-[13px]">{row.reason}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {row.visitId && (
          <Link
            href={`/doctor/consultations/${row.visitId}`}
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Last visit
          </Link>
        )}
        {!row.appointmentAt && (
          <RemindButton
            followUpId={row.id}
            patientName={row.patientName}
            alreadySent={row.reminderSentAt !== null}
          />
        )}
        <FollowUpMenu
          followUpId={row.id}
          patientName={row.patientName}
          canSchedule={!row.appointmentId}
        />
      </div>
    </li>
  );
}

/** Spec §42 — patients who were promised a return and never got one. */
function ReactivationCard({ rows }: { rows: ReactivationRow[] }) {
  return (
    <Card className="border-ai-border bg-ai-soft/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="size-4 text-ai" />
          Worth reaching out to
          <Badge variant="ai">{rows.length}</Badge>
        </CardTitle>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          A follow-up was promised, the date passed, and nobody rebooked them.
        </p>
      </CardHeader>

      <ul className="divide-y divide-ai-border/50 border-t border-ai-border/50">
        {rows.map((row) => (
          <li
            key={row.followUpId}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/doctor/patients/${row.patientId}`}
                className="truncate text-[14px] font-semibold hover:text-accent hover:underline"
              >
                {row.patientName}
              </Link>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                <span data-numeric>{row.patientMrn}</span>
                <span aria-hidden> · </span>
                missed{" "}
                {row.missedOn.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {row.lastVisitAt && (
                  <>
                    <span aria-hidden> · </span>
                    last seen{" "}
                    {row.lastVisitAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </>
                )}
              </p>
              {row.reason && (
                <p className="mt-1 truncate text-[13px]">{row.reason}</p>
              )}
            </div>

            <RemindButton
              followUpId={row.followUpId}
              patientName={row.patientName}
              alreadySent={false}
            />
            <FollowUpMenu
              followUpId={row.followUpId}
              patientName={row.patientName}
              canSchedule
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Spec §35 rule 1 — say "3 days late", never "-3". */
function dueLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "1 day late";
  if (days < 0) return `${Math.abs(days)} days late`;
  if (days < 7) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "In a week" : `In ${weeks} weeks`;
}

export { CheckCircle2 };
