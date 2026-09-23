import {
  Blocks,
  FilePlus2,
  FileSignature,
  KeyRound,
  LogIn,
  LogOut,
  PenLine,
  Pill,
  ScanEye,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditEntry } from "@/server/services/audit";
import { AUDIT_ACTION_LABEL } from "@/server/services/audit";

/**
 * Spec §30 — the audit trail.
 *
 * Grouped by day and read as a timeline, because the question asked of an
 * audit log is almost always "what happened around then". Each row is the
 * four facts the spec names: when, who, what, and to which record.
 *
 * Nothing clinical appears here. The summary is written by `writeAudit`,
 * which is forbidden from carrying note text (spec §50).
 */

const ACTION_ICON: Record<string, LucideIcon> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  RECORD_CREATED: FilePlus2,
  RECORD_UPDATED: PenLine,
  RECORD_VIEWED: ScanEye,
  RECORD_DELETED: Trash2,
  PRESCRIPTION_CREATED: Pill,
  CONSULTATION_SIGNED: FileSignature,
  AI_OUTPUT_GENERATED: Sparkles,
  AI_OUTPUT_ACCEPTED: Sparkles,
  AI_OUTPUT_REJECTED: Sparkles,
  MESSAGE_SENT: Send,
  INTEGRATION_CHANGED: Blocks,
  PERMISSION_CHANGED: KeyRound,
};

/** The few actions that deserve to stand out in a wall of rows. */
const ACTION_TONE: Record<string, string> = {
  CONSULTATION_SIGNED: "bg-success-soft text-success",
  PRESCRIPTION_CREATED: "bg-accent-soft text-brand-700",
  PERMISSION_CHANGED: "bg-warning-soft text-warning",
  RECORD_DELETED: "bg-destructive-soft text-destructive",
  AI_OUTPUT_GENERATED: "bg-ai-soft text-ai",
  AI_OUTPUT_ACCEPTED: "bg-ai-soft text-ai",
  AI_OUTPUT_REJECTED: "bg-ai-soft text-ai",
};

export function AuditLogView({
  entries,
  hasMore,
  filtered,
}: {
  entries: AuditEntry[];
  hasMore: boolean;
  filtered: boolean;
}) {
  if (entries.length === 0) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={ShieldCheck}
          title={filtered ? "Nothing matches those filters" : "Nothing logged yet"}
          description={
            filtered
              ? "Widen the date range or clear a filter to see more of the trail."
              : "Sign-ins, record changes, signed consultations and sent messages will appear here as they happen."
          }
        />
      </Card>
    );
  }

  const days = groupByDay(entries);

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <Card key={day.label} className="p-0">
          <p className="border-b border-border px-5 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {day.label}
            <span className="ml-2 font-normal normal-case tabular">
              {day.entries.length}{" "}
              {day.entries.length === 1 ? "event" : "events"}
            </span>
          </p>

          <ul className="divide-y divide-border">
            {day.entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </Card>
      ))}

      {hasMore && (
        <p className="pb-2 text-center text-[12px] text-muted-foreground">
          Showing the most recent {entries.length}. Narrow the range or filter
          by person to see further back.
        </p>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const Icon = ACTION_ICON[entry.action] ?? PenLine;
  const tone = ACTION_TONE[entry.action] ?? "bg-muted text-muted-foreground";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <span className="w-14 shrink-0 text-[12px] font-semibold tabular text-muted-foreground">
        {entry.createdAt.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </span>

      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{entry.summary}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span>{AUDIT_ACTION_LABEL[entry.action]}</span>
          <span aria-hidden>·</span>
          <span>{entry.entityType}</span>
          {entry.entityId && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate font-mono" data-numeric>
                {entry.entityId}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {entry.actorRole && (
          <Badge variant="muted">{roleLabel(entry.actorRole)}</Badge>
        )}
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">
            {initials(entry.actorName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-[12px] font-semibold">{entry.actorName}</span>
      </div>
    </li>
  );
}

function groupByDay(entries: AuditEntry[]) {
  const groups: { label: string; entries: AuditEntry[] }[] = [];

  for (const entry of entries) {
    const label = dayLabel(entry.createdAt);
    const last = groups[groups.length - 1];

    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
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

function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
