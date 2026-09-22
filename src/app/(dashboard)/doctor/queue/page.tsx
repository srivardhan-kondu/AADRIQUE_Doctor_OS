import type { Metadata } from "next";
import { Suspense } from "react";
import { PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import {
  CallNextButton,
  QueueStatusToggle,
} from "@/components/queue/queue-actions";
import { QueueBoardView } from "@/components/queue/queue-board";
import { requireActor, requireDoctorId } from "@/server/context";
import { getQueueBoard } from "@/server/services/queue";

export const metadata: Metadata = { title: "My Queue" };

export const dynamic = "force-dynamic";

export default function QueuePage() {
  return (
    <PageBody>
      <Suspense fallback={<QueueSkeleton />}>
        <QueueScreen />
      </Suspense>
    </PageBody>
  );
}

async function QueueScreen() {
  const actor = await requireActor();
  const doctorId = await requireDoctorId(actor);
  const board = await getQueueBoard(actor, doctorId);

  return (
    <>
      <PageHeader
        title="My Queue"
        description={[board.department, board.room, board.counter]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <QueueStatusToggle paused={board.paused} />
            <CallNextButton
              waitingCount={board.waiting.length}
              disabled={board.paused}
            />
          </>
        }
      />

      {board.paused && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-[13px] font-semibold text-warning">
              Queue is paused
            </p>
            <p className="mt-0.5 text-[12px] text-warning/80">
              {board.pauseReason ??
                "No new patients will be called until you resume."}
            </p>
          </div>
          <Badge variant="warning" className="ml-auto shrink-0">
            Paused
          </Badge>
        </div>
      )}

      <QueueBoardView board={board} />
    </>
  );
}

function QueueSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between pb-6">
        <div>
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-11 w-36 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Skeleton className="h-[172px] rounded-xl" />
          <Skeleton className="h-[380px] rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-[280px] rounded-xl" />
          <Skeleton className="h-[280px] rounded-xl" />
        </div>
      </div>
    </>
  );
}
