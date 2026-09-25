import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { FollowUpBoardView } from "@/components/follow-ups/follow-up-board";
import { requireActor, requireDoctorId } from "@/server/context";
import { getFollowUpBoard } from "@/server/services/follow-ups";

export const metadata: Metadata = { title: "Follow-ups" };

export const dynamic = "force-dynamic";

export default function FollowUpsPage() {
  return (
    <PageBody>
      <Suspense fallback={<FollowUpSkeleton />}>
        <FollowUpScreen />
      </Suspense>
    </PageBody>
  );
}

async function FollowUpScreen() {
  const actor = await requireActor();
  const doctorId = await requireDoctorId(actor);
  const board = await getFollowUpBoard(actor, doctorId);

  const { counts } = board;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description={
          counts.open === 0
            ? board.limited
              ? "Nothing is due today or overdue."
              : "Nobody is waiting on a return visit."
            : `${counts.dueToday} due today · ${counts.overdue} overdue${
                board.limited ? "" : ` · ${counts.upcoming} upcoming`
              }`
        }
      />

      {/* Spec §42 — the numbers, before the list of names: what needs doing
          today, then what has slipped, then what is coming. */}
      <div
        className={`mb-5 grid gap-3 sm:grid-cols-2 ${board.limited ? "" : "xl:grid-cols-4"}`}
      >
        <Stat label="Due today" value={counts.dueToday} tone="warn" />
        <Stat
          label="Overdue"
          value={counts.overdue}
          tone={counts.overdue > 0 ? "alert" : "calm"}
          hint={
            counts.overdue > 0 ? "Chase these first" : "Nothing has slipped"
          }
        />
        {!board.limited && (
          <>
            <Stat label="Upcoming" value={counts.upcoming} tone="calm" />
            <Stat
              label="Kept this month"
              value={counts.completedThisMonth}
              tone="good"
              hint={
                counts.completionRate > 0
                  ? `${counts.completionRate}% completion rate`
                  : undefined
              }
            />
          </>
        )}
      </div>

      <FollowUpBoardView board={board} />
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "alert" | "warn" | "calm" | "good";
  hint?: string;
}) {
  const valueClass = {
    alert: value > 0 ? "text-destructive" : "",
    warn: value > 0 ? "text-warning" : "",
    calm: "",
    good: value > 0 ? "text-success" : "",
  }[tone];

  return (
    <Card className="px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-bold tabular ${valueClass}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
      )}
    </Card>
  );
}

function FollowUpSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="space-y-5">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </>
  );
}
