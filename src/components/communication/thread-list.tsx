import Link from "next/link";
import { Inbox, Lock } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { ThreadRow } from "@/server/services/communication";
import { ChannelBadge, DeliveryState } from "./delivery";

/**
 * Spec §14 — the inbox, grouped by patient.
 *
 * Each row is a link that carries the current filters forward, so choosing a
 * conversation never silently resets the view around it.
 */
export function ThreadList({
  threads,
  selectedPatientId,
  hrefFor,
  hiddenThreads = 0,
}: {
  threads: ThreadRow[];
  selectedPatientId: string | null;
  hrefFor: (patientId: string) => string;
  /** Conversations behind the messaging add-on, counted but not loaded. */
  hiddenThreads?: number;
}) {
  if (threads.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={Inbox}
          title="No conversations here"
          description="Nothing matches these filters. Clear them to see the whole inbox."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-border">
        {threads.map((thread) => {
          const selected = thread.patientId === selectedPatientId;

          return (
            <li key={thread.patientId}>
              <Link
                href={hrefFor(thread.patientId)}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex gap-3 px-4 py-3 transition-colors",
                  selected
                    ? "bg-accent-soft/60"
                    : "hover:bg-muted/60",
                )}
              >
                <Avatar className="mt-0.5 size-9 shrink-0">
                  <AvatarFallback className="text-[12px]">
                    {initials(thread.patientName)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold">
                      {thread.patientName}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular">
                      {relativeDay(thread.lastMessageAt)}
                    </span>
                  </div>

                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                    {thread.lastDirection === "INBOUND" && (
                      <span className="font-semibold text-foreground">
                        Reply:{" "}
                      </span>
                    )}
                    {thread.lastBody}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <ChannelBadge channel={thread.lastChannel} />
                    <DeliveryState status={thread.lastStatus} />
                    {thread.failedCount > 0 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        {thread.failedCount} failed
                      </span>
                    )}
                    {thread.unreadInbound > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground tabular">
                        {thread.unreadInbound}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {hiddenThreads > 0 && (
          <li className="flex items-center gap-3 px-4 py-3 text-[12px] text-muted-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Lock className="size-4" />
            </span>
            <span>
              {hiddenThreads} more{" "}
              {hiddenThreads === 1 ? "conversation" : "conversations"} with the
              Messages inbox add-on
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}

/** "Today" / "Yesterday" / a date — never a raw timestamp in a list. */
function relativeDay(date: Date): string {
  const now = new Date();
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );

  if (days === 0) {
    return date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
