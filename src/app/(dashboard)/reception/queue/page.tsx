import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { NoAccess } from "@/components/shell/no-access";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { FacilityQueue } from "@/components/reception/facility-queue";
import { WalkInDialog } from "@/components/reception/walk-in-dialog";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { listBookableDoctors } from "@/server/services/front-desk";
import { getQueueSignal } from "@/server/services/live";
import { getQueueBoards } from "@/server/services/queue";

export const metadata: Metadata = { title: "Today's Queue" };

export const dynamic = "force-dynamic";

export default function ReceptionQueuePage() {
  return (
    <PageBody className="max-w-[1600px]">
      <Suspense fallback={<QueueSkeleton />}>
        <QueueScreen />
      </Suspense>
    </PageBody>
  );
}

async function QueueScreen() {
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.QUEUE_READ)) {
    return <NoAccess title="Today's Queue" what="to see the queue" />;
  }

  const [boards, doctors, signal] = await Promise.all([
    getQueueBoards(actor),
    listBookableDoctors(actor),
    getQueueSignal(actor, null),
  ]);

  const waiting = boards.reduce((sum, b) => sum + b.waiting.length, 0);
  const overdue = boards.reduce(
    (sum, b) => sum + b.waiting.filter((e) => e.waitMinutes > b.threshold).length,
    0,
  );

  return (
    <>
      <PageHeader
        title="Today's Queue"
        description={
          waiting === 0
            ? "Nobody is waiting right now."
            : `${waiting} waiting${overdue > 0 ? ` · ${overdue} past the wait limit` : ""}`
        }
        actions={
          <>
            <LiveRefresh signal={signal} />
            <Button asChild variant="outline">
              <Link href="/display" target="_blank" rel="noopener">
                <MonitorPlay />
                Waiting-room display
              </Link>
            </Button>
            <WalkInDialog doctors={doctors} />
          </>
        }
      />

      <FacilityQueue boards={boards} doctors={doctors} />
    </>
  );
}

function QueueSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between pb-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[360px] rounded-xl" />
        ))}
      </div>
    </>
  );
}
