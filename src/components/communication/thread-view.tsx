import Link from "next/link";
import { AlertCircle, Lock, MessagesSquare, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AddOnLocked } from "@/components/shell/add-on-locked";
import type { PatientThread, ThreadMessage } from "@/server/services/communication";
import { Composer } from "./composer";
import { ChannelBadge, CHANNEL_LABEL, DeliveryState } from "./delivery";
import { RetryButton } from "./message-actions";

/**
 * Spec §14 — the communication timeline for one patient.
 *
 * Outbound sits right, inbound left, which is the shape every messaging app
 * has taught people to read. Delivery state rides under each outbound bubble,
 * because "did it arrive" is the question this screen exists to answer.
 */
export function ThreadView({ thread }: { thread: PatientThread }) {
  const consented = (["WHATSAPP", "SMS", "EMAIL"] as const).filter((channel) =>
    channel === "WHATSAPP"
      ? thread.patient.whatsappOptIn
      : channel === "SMS"
        ? thread.patient.smsOptIn
        : thread.patient.emailOptIn,
  );

  const groups = groupByDay(thread.messages);

  return (
    <Card className="flex h-full flex-col gap-0 p-0">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border">
        <div className="min-w-0">
          <CardTitle className="truncate">
            <Link
              href={`/doctor/patients/${thread.patient.id}`}
              className="hover:text-accent hover:underline"
            >
              {thread.patient.name}
            </Link>
          </CardTitle>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
            <span data-numeric>{thread.patient.mrn}</span>
            <span aria-hidden>·</span>
            <span data-numeric>{thread.patient.phone}</span>
            {thread.patient.email && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{thread.patient.email}</span>
              </>
            )}
          </p>
        </div>

        {/* Spec §14 — consent is stated, not implied by which buttons work. */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {consented.length === 0 ? (
            <Badge variant="destructive">
              <ShieldOff />
              No channels agreed
            </Badge>
          ) : (
            consented.map((channel) => (
              <ChannelBadge key={channel} channel={channel} />
            ))
          )}
        </div>
      </CardHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {thread.messages.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Nothing has been sent yet"
            description={`Anything you send ${thread.patient.name.split(" ")[0]} will appear here, with its delivery state.`}
          />
        ) : (
          <>
          {thread.hiddenMessages > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground">
              <Lock className="size-3.5" />
              {thread.hiddenMessages} earlier{" "}
              {thread.hiddenMessages === 1 ? "message" : "messages"} in the full inbox
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-3">
                {group.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    canRetry={!thread.limited}
                  />
                ))}
              </ul>
            </div>
          ))}
          </>
        )}
      </div>

      <div className="border-t border-border p-4">
        {thread.limited ? (
          <AddOnLocked
            addOn="messaging"
            compact
            note="Appointment confirmations, reminders and token updates still go out automatically. This preview shows the latest conversation."
          />
        ) : (
          <Composer
            patientId={thread.patient.id}
            patientName={thread.patient.name}
            consented={consented}
          />
        )}
      </div>
    </Card>
  );
}

function MessageBubble({
  message,
  canRetry,
}: {
  message: ThreadMessage;
  canRetry: boolean;
}) {
  const outbound = message.direction === "OUTBOUND";
  const failed = message.status === "FAILED";

  return (
    <li className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[82%] min-w-0", outbound && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed",
            outbound
              ? failed
                ? "bg-destructive-soft text-foreground ring-1 ring-destructive/30"
                : "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {message.subject && (
            <p
              className={cn(
                "mb-1 text-[12px] font-bold",
                outbound && !failed
                  ? "text-primary-foreground"
                  : "text-foreground",
              )}
            >
              {message.subject}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        </div>

        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1",
            outbound ? "justify-end" : "justify-start",
          )}
        >
          <ChannelBadge channel={message.channel} />
          <span className="text-[11px] text-muted-foreground tabular">
            {message.createdAt.toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </span>
          {outbound && <DeliveryState status={message.status} />}
          {message.templateName && (
            <span className="text-[11px] text-muted-foreground">
              {message.templateName}
            </span>
          )}
        </div>

        {failed && (
          <div
            className={cn(
              "mt-1.5 flex flex-wrap items-center gap-2",
              outbound ? "justify-end" : "justify-start",
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {message.failureReason ??
                `${CHANNEL_LABEL[message.channel]} rejected it`}
            </span>
            {canRetry && (
              <RetryButton
                messageId={message.id}
                attemptCount={message.attemptCount}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function groupByDay(messages: ThreadMessage[]) {
  const groups: { label: string; messages: ThreadMessage[] }[] = [];

  for (const message of messages) {
    const label = dayLabel(message.createdAt);
    const last = groups[groups.length - 1];

    if (last && last.label === label) last.messages.push(message);
    else groups.push({ label, messages: [message] });
  }

  return groups;
}

function dayLabel(date: Date): string {
  const now = new Date();
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
