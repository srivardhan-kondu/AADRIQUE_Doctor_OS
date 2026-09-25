import type { Metadata } from "next";
import { Suspense } from "react";
import { MousePointerClick } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { InboxFilters } from "@/components/communication/inbox-filters";
import { ThreadList } from "@/components/communication/thread-list";
import { ThreadView } from "@/components/communication/thread-view";
import { NoAccess } from "@/components/shell/no-access";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getInbox, getPatientThread } from "@/server/services/communication";
import type { MessageChannel } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Messages" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    patient?: string;
    channel?: string;
    failed?: string;
    q?: string;
  }>;
}

export default function MessagesPage({ searchParams }: PageProps) {
  return (
    <PageBody>
      <Suspense fallback={<InboxSkeleton />}>
        <InboxScreen searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

const CHANNELS = ["WHATSAPP", "SMS", "EMAIL"] as const;

async function InboxScreen({ searchParams }: PageProps) {
  const params = await searchParams;
  const actor = await requireActor();

  if (!hasPermission(actor, Permission.COMMUNICATION_READ)) {
    return <NoAccess title="Messages" what="to read patient communication" />;
  }

  // Only a channel this product actually has survives the round trip.
  const channel = CHANNELS.includes(params.channel as MessageChannel)
    ? (params.channel as MessageChannel)
    : undefined;
  const failedOnly = params.failed === "1";
  const query = params.q ?? "";

  const inbox = await getInbox(actor, { channel, failedOnly, query });

  // A patient id in the URL is honoured only when that thread is on screen —
  // the tenant check in the service is the real guard, this keeps the UI
  // honest about what it is showing.
  const selectedId =
    params.patient && inbox.threads.some((t) => t.patientId === params.patient)
      ? params.patient
      : (inbox.threads[0]?.patientId ?? null);

  const thread = selectedId
    ? await getPatientThread(actor, selectedId)
    : null;

  function hrefFor(patientId: string): string {
    const next = new URLSearchParams();
    if (channel) next.set("channel", channel);
    if (failedOnly) next.set("failed", "1");
    if (query) next.set("q", query);
    next.set("patient", patientId);
    return `/doctor/messages?${next}`;
  }

  return (
    <>
      <PageHeader
        title="Messages"
        description={`One inbox across WhatsApp, SMS and email · ${
          inbox.deliveryRate === null
            ? "nothing sent in the last 30 days"
            : `${inbox.deliveryRate}% delivered over 30 days`
        }`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {inbox.byChannel.map((row) => (
          <ChannelCard key={row.channel} row={row} />
        ))}
      </div>

      <div className="mb-4">
        <InboxFilters
          channel={channel ?? ""}
          failedOnly={failedOnly}
          query={query}
          failedCount={inbox.counts.failed}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <ThreadList
          threads={inbox.threads}
          selectedPatientId={selectedId}
          hrefFor={hrefFor}
          hiddenThreads={inbox.hiddenThreads}
        />

        <div className="min-h-[32rem] lg:h-[calc(100vh-22rem)] lg:min-h-[34rem]">
          {thread ? (
            <ThreadView thread={thread} />
          ) : (
            <Card className="h-full border-dashed">
              <EmptyState
                icon={MousePointerClick}
                title="Pick a conversation"
                description="Choose a patient on the left to see everything that has been sent to them, and to write back."
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Spec §16 — delivery rate per channel.
 *
 * A single-hue meter rather than a colour-coded breakdown: the number is the
 * message, and the bar only has to show how full it is.
 */
function ChannelCard({
  row,
}: {
  row: {
    channel: string;
    label: string;
    sent: number;
    delivered: number;
    failed: number;
    rate: number | null;
  };
}) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-muted-foreground">
          {row.label}
        </p>
        <p className="font-display text-lg font-bold tabular">
          {row.rate === null ? "—" : `${row.rate}%`}
        </p>
      </div>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          row.rate === null
            ? `${row.label}: nothing sent`
            : `${row.label}: ${row.rate}% delivered`
        }
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${row.rate ?? 0}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground tabular">
        {row.delivered} delivered
        {row.failed > 0 && (
          <span className="text-destructive"> · {row.failed} failed</span>
        )}
      </p>
    </Card>
  );
}

function InboxSkeleton() {
  return (
    <>
      <div className="pb-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mb-4 h-9 w-full rounded-md" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Skeleton className="h-[34rem] rounded-xl" />
        <Skeleton className="h-[34rem] rounded-xl" />
      </div>
    </>
  );
}
