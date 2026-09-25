import { PauseCircle, Ticket, UserRoundX } from "lucide-react";
import { cn, formatWait, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WalkInDialog } from "@/components/reception/walk-in-dialog";
import type { DoctorChoice } from "@/server/services/front-desk";
import type { QueueBoard } from "@/server/services/queue";

/**
 * Spec §12 + §13 — doctor availability at a glance.
 *
 * What the desk needs to route a walk-in: who is working, who is paused, how
 * long each line is and how long it is taking. Status always carries a label,
 * never colour alone (spec §16).
 */
export function DoctorStatusList({
  boards,
  doctors,
}: {
  boards: QueueBoard[];
  doctors: DoctorChoice[];
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Doctors</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {boards.filter((b) => b.online).length} of {boards.length} on duty
          </p>
        </div>
      </CardHeader>

      {boards.length === 0 ? (
        <EmptyState
          icon={UserRoundX}
          title="No doctors set up yet"
          description="An administrator adds doctors and their clinic hours."
        />
      ) : (
        <ul className="divide-y divide-border">
          {boards.map((board) => (
            <li key={board.doctorId}>
              <DoctorRow board={board} doctors={doctors} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DoctorRow({
  board,
  doctors,
}: {
  board: QueueBoard;
  doctors: DoctorChoice[];
}) {
  const waiting = board.waiting.length;
  const slow = board.averageWaitMinutes > board.threshold;

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <Avatar className="size-9 shrink-0">
        <AvatarFallback>{initials(board.doctorName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">
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
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          {board.department && <span>{board.department}</span>}
          {board.room && (
            <>
              <span aria-hidden>·</span>
              <span>{board.room}</span>
            </>
          )}
        </p>
      </div>

      <dl className="hidden shrink-0 grid-cols-3 gap-4 text-right sm:grid">
        <div>
          <dt className="text-[12px] font-mediumr text-muted-foreground">
            Now
          </dt>
          <dd data-numeric className="font-mono text-[13px] font-semibold">
            {board.currentToken ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-mediumr text-muted-foreground">
            Waiting
          </dt>
          <dd data-numeric className="text-[13px] font-semibold tabular">
            {waiting}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-mediumr text-muted-foreground">
            Avg wait
          </dt>
          <dd
            data-numeric
            className={cn(
              "text-[13px] tabular",
              slow ? "font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            {waiting === 0 ? "—" : formatWait(board.averageWaitMinutes)}
          </dd>
        </div>
      </dl>

      {board.acceptsWalkIns && (
        <WalkInDialog
          doctors={doctors}
          defaultDoctorId={board.doctorId}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Walk-in token for ${board.doctorName}`}
              title={`Walk-in token for ${board.doctorName}`}
            >
              <Ticket />
            </Button>
          }
        />
      )}
    </div>
  );
}
