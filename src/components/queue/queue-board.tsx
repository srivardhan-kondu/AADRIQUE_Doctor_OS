import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Inbox,
  Printer,
  Repeat2,
  Stethoscope,
} from "lucide-react";
import { cn, formatWait, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status";
import {
  CompleteButton,
  MoveToVitalsButton,
  SkipButton,
  StartConsultationButton,
} from "@/components/queue/queue-actions";
import type { QueueBoard, QueueBoardEntry } from "@/server/services/queue";

/** Spec §12 — the queue as a workflow, not a table of rows. */
export function QueueBoardView({
  board,
  vitalsStep,
}: {
  board: QueueBoard;
  /** The clinic sends patients through a vitals station first. */
  vitalsStep: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0 space-y-5">
        <ActiveCard board={board} />
        <WaitingList board={board} vitalsStep={vitalsStep} />
      </div>
      <div className="min-w-0 space-y-5">
        <PatientDisplayCard board={board} />
        <CompletedList entries={board.done} />
      </div>
    </div>
  );
}

function ActiveCard({ board }: { board: QueueBoard }) {
  const active = board.active;

  if (!active) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={Stethoscope}
          title="No consultation in progress"
          description={
            board.waiting.length > 0
              ? `${board.waiting.length} ${board.waiting.length === 1 ? "patient is" : "patients are"} waiting. Call the next one when you're ready.`
              : "Nobody is waiting. Your queue is clear."
          }
        />
      </Card>
    );
  }

  return (
    <Card className="border-accent/40 bg-accent-soft/30">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            With you now
            <StatusChip tone="with-doctor" label="In consultation" live />
          </CardTitle>
        </div>
      </CardHeader>

      <div className="flex flex-wrap items-center gap-4 px-5 pb-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent font-mono text-lg font-bold text-accent-foreground shadow-soft">
          {active.token}
        </span>

        {/* Wide enough to show a name, so the actions wrap below it rather
            than squeezing it to an ellipsis. */}
        <div className="min-w-[14rem] flex-1">
          <p className="truncate font-display text-xl font-medium">
            {active.patientName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
            <span data-numeric className="whitespace-nowrap">{active.patientMrn}</span>
            {active.age !== null && (
              <>
                <span aria-hidden>·</span>
                <span data-numeric>{active.age}y</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span data-numeric>{active.phone}</span>
          </p>
          {active.reason && (
            <p className="mt-1.5 text-[13px]">{active.reason}</p>
          )}
          {active.allergyCount > 0 && (
            <Badge variant="destructive" className="mt-2">
              <AlertTriangle />
              {active.allergyCount} recorded{" "}
              {active.allergyCount === 1 ? "allergy" : "allergies"}
            </Badge>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          {active.visitId && (
            <Button asChild>
              <Link href={`/doctor/consultations/${active.visitId}`}>
                Open consultation
                <ArrowRight />
              </Link>
            </Button>
          )}
          {active.visitId && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/print/report/${active.visitId}`} target="_blank">
                <Printer />
                Print report
              </Link>
            </Button>
          )}
          <CompleteButton queueEntryId={active.id} />
        </div>
      </div>
    </Card>
  );
}

function WaitingList({
  board,
  vitalsStep,
}: {
  board: QueueBoard;
  vitalsStep: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Waiting</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {board.waiting.length === 0
              ? "Nobody in line"
              : `${board.waiting.length} in line · average wait ${formatWait(board.averageWaitMinutes)}`}
          </p>
        </div>
      </CardHeader>

      {board.waiting.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No patients waiting"
          description="Your queue is clear. Enjoy the breathing room."
        />
      ) : (
        <ul className="px-2 pb-2">
          {board.waiting.map((entry, index) => (
            <li key={entry.id}>
              <QueueEntryRow
                entry={entry}
                threshold={board.threshold}
                isNext={index === 0}
                canCall={!board.paused}
                vitalsStep={vitalsStep}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QueueEntryRow({
  entry,
  threshold,
  isNext,
  canCall,
  vitalsStep,
}: {
  entry: QueueBoardEntry;
  threshold: number;
  isNext: boolean;
  canCall: boolean;
  vitalsStep: boolean;
}) {
  const overdue = entry.waitMinutes > threshold;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted",
        isNext && "bg-muted/50",
      )}
    >
      <span
        data-numeric
        className="w-12 shrink-0 font-mono text-[13px] font-semibold"
      >
        {entry.token}
      </span>

      <Avatar className="hidden size-8 shrink-0 sm:flex">
        <AvatarFallback>{initials(entry.patientName)}</AvatarFallback>
      </Avatar>

      <Link
        href={`/doctor/patients/${entry.patientId}`}
        className="min-w-0 flex-1 basis-32"
      >
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">
            {entry.patientName}
          </span>
          {isNext && <Badge variant="accent">Next</Badge>}
          {entry.priority !== "NORMAL" && (
            <Badge variant="destructive">
              {entry.priority === "EMERGENCY" ? "Emergency" : "Priority"}
            </Badge>
          )}
          {entry.isFollowUp && (
            <Repeat2 className="size-3.5 shrink-0 text-state-followup" />
          )}
          {entry.allergyCount > 0 && (
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span data-numeric className="whitespace-nowrap">{entry.patientMrn}</span>
          {entry.reason && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{entry.reason}</span>
            </>
          )}
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
          "w-16 shrink-0 text-right text-[13px] tabular-nums",
          overdue ? "font-semibold text-destructive" : "text-muted-foreground",
        )}
      >
        {formatWait(entry.waitMinutes)}
      </span>

      {/* On a phone the actions take their own line under the patient. */}
      <span className="flex w-full shrink-0 items-center justify-end gap-0.5 sm:w-auto">
        {/* Spec §12 — any waiting patient can be taken straight in:
            Waiting → Consultation → Completed, with no step in between. */}
        {canCall && (
          <StartConsultationButton queueEntryId={entry.id} isNext={isNext} />
        )}
        {vitalsStep && entry.status === "WAITING" && (
          <MoveToVitalsButton queueEntryId={entry.id} />
        )}
        <SkipButton
          queueEntryId={entry.id}
          patientName={entry.patientName}
          token={entry.token}
        />
      </span>
    </div>
  );
}

/** Spec §12 — the patient-facing token display, shown here as a preview. */
function PatientDisplayCard({ board }: { board: QueueBoard }) {
  const next = board.waiting[0];
  const ahead = board.waiting.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Patient display</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            What the waiting-area screen shows
          </p>
        </div>
      </CardHeader>

      <div className="mx-5 mb-5 rounded-2xl bg-navy-900 p-5 text-center text-navy-100">
        <p className="text-[12px] font-medium text-navy-400">
          Current token
        </p>
        <p
          data-numeric
          className="mt-2 font-mono text-4xl font-bold text-accent"
        >
          {board.currentToken ?? "—"}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-navy-800 pt-4">
          <div>
            <p className="text-[12px] font-medium text-navy-400">
              Next
            </p>
            <p data-numeric className="mt-1 font-mono text-lg font-semibold">
              {next?.token ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[12px] font-medium text-navy-400">
              In queue
            </p>
            <p data-numeric className="mt-1 font-display text-lg font-medium">
              {ahead}
            </p>
          </div>
        </div>

        {board.room && (
          <p className="mt-4 text-[12px] text-navy-400">
            {board.doctorName} · {board.room}
          </p>
        )}
      </div>
    </Card>
  );
}

function CompletedList({ entries }: { entries: QueueBoardEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Seen today</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {entries.length} {entries.length === 1 ? "patient" : "patients"}
          </p>
        </div>
      </CardHeader>

      {entries.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing yet today"
          description="Completed consultations will be listed here."
        />
      ) : (
        <ul className="max-h-[360px] overflow-y-auto px-2 pb-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={
                  entry.visitId
                    ? `/doctor/consultations/${entry.visitId}`
                    : `/doctor/patients/${entry.patientId}`
                }
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
              >
                <span
                  data-numeric
                  className="w-12 shrink-0 font-mono text-[12px] text-muted-foreground"
                >
                  {entry.token}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {entry.patientName}
                </span>
                <StatusChip
                  tone={entry.status === "COMPLETED" ? "completed" : "no-show"}
                  label={entry.status === "COMPLETED" ? "Done" : "No show"}
                  className="shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
