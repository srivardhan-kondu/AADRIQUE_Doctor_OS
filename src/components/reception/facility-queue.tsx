import Link from "next/link";
import { PauseCircle, Ticket, Users } from "lucide-react";
import { cn, formatWait } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status";
import {
  MoveToVitalsButton,
  SkipButton,
} from "@/components/queue/queue-actions";
import { WalkInDialog } from "@/components/reception/walk-in-dialog";
import type { DoctorChoice } from "@/server/services/front-desk";
import type { QueueBoard } from "@/server/services/queue";

/**
 * Spec §12 — today's queue across every doctor, as the desk manages it.
 *
 * One column per doctor: who is in the room, who is next, how long the line
 * has waited. The desk moves patients to vitals and records no-shows; calling
 * the next patient stays with the doctor.
 */
export function FacilityQueue({
  boards,
  doctors,
}: {
  boards: QueueBoard[];
  doctors: DoctorChoice[];
}) {
  if (boards.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={Users}
          title="No doctors set up yet"
          description="An administrator adds doctors and their clinic hours; their queues appear here."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
      {boards.map((board) => (
        <DoctorQueue key={board.doctorId} board={board} doctors={doctors} />
      ))}
    </div>
  );
}

function DoctorQueue({
  board,
  doctors,
}: {
  board: QueueBoard;
  doctors: DoctorChoice[];
}) {
  return (
    <Card className="flex flex-col gap-0 p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-display text-[15px] font-semibold">
              {board.doctorName}
            </span>
            {board.paused ? (
              <Badge variant="warning">
                <PauseCircle />
                Paused
              </Badge>
            ) : board.online ? (
              <Badge variant="success">On duty</Badge>
            ) : (
              <Badge variant="muted">Away</Badge>
            )}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {[board.department, board.room].filter(Boolean).join(" · ") ||
              "OPD"}
          </p>
          {board.paused && board.pauseReason && (
            <p className="mt-1 text-[12px] text-warning">{board.pauseReason}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            In the room
          </p>
          <p data-numeric className="font-mono text-xl font-bold text-accent">
            {board.currentToken ?? "—"}
          </p>
        </div>
      </div>

      {board.active && (
        <p className="border-b border-border bg-accent-soft/30 px-5 py-2 text-[12px]">
          <span className="font-semibold">{board.active.patientName}</span>{" "}
          <span className="text-muted-foreground">is with the doctor</span>
        </p>
      )}

      {board.waiting.length === 0 ? (
        <p className="flex-1 px-5 py-8 text-center text-[13px] text-muted-foreground">
          Nobody waiting.
        </p>
      ) : (
        <ul className="flex-1 px-2 py-2">
          {board.waiting.map((entry, index) => {
            const overdue = entry.waitMinutes > board.threshold;
            return (
              <li
                key={entry.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2",
                  index === 0 && "bg-muted/50",
                )}
              >
                <span
                  data-numeric
                  className="w-11 shrink-0 font-mono text-[13px] font-semibold"
                >
                  {entry.token}
                </span>
                <Link
                  href={`/reception/patients/${entry.patientId}`}
                  className="min-w-0 flex-1"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium hover:text-accent">
                      {entry.patientName}
                    </span>
                    {index === 0 && <Badge variant="accent">Next</Badge>}
                    {entry.priority !== "NORMAL" && (
                      <Badge variant="destructive">
                        {entry.priority === "EMERGENCY" ? "Emergency" : "Priority"}
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {entry.reason ?? entry.patientMrn}
                  </span>
                </Link>
                <StatusChip
                  tone={entry.status === "VITALS" ? "vitals" : "waiting"}
                  label={entry.status === "VITALS" ? "Vitals" : "Waiting"}
                  className="hidden shrink-0 sm:inline-flex"
                />
                <span
                  data-numeric
                  className={cn(
                    "w-14 shrink-0 text-right text-[12px] tabular-nums",
                    overdue
                      ? "font-semibold text-destructive"
                      : "text-muted-foreground",
                  )}
                  title={overdue ? "Waiting longer than the department's limit" : undefined}
                >
                  {formatWait(entry.waitMinutes)}
                </span>
                <span className="flex shrink-0 items-center">
                  {entry.status === "WAITING" && (
                    <MoveToVitalsButton queueEntryId={entry.id} />
                  )}
                  <SkipButton
                    queueEntryId={entry.id}
                    patientName={entry.patientName}
                    token={entry.token}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-[12px] text-muted-foreground">
        <span>
          {board.waiting.length} waiting · {board.done.length} done
          {board.waiting.length > 0 &&
            ` · avg ${formatWait(board.averageWaitMinutes)}`}
        </span>
        {board.acceptsWalkIns && (
          <WalkInDialog
            doctors={doctors}
            defaultDoctorId={board.doctorId}
            trigger={
              <Button variant="ghost" size="sm">
                <Ticket />
                Walk-in
              </Button>
            }
          />
        )}
      </div>
    </Card>
  );
}
