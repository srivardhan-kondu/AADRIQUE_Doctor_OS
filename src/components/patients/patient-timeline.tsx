"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  FlaskConical,
  MessageSquare,
  Pill,
  Repeat2,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { TimelineEvent } from "@/server/services/patients";

/**
 * Spec §7 — the patient timeline.
 *
 * Reads like a financial statement rather than a hospital database: one
 * chronological spine, filterable by event type, with each entry expandable
 * in place.
 */

const KIND_META: Record<
  TimelineEvent["kind"],
  { label: string; icon: LucideIcon; dot: string; tint: string }
> = {
  CONSULTATION: {
    label: "Consultations",
    icon: Stethoscope,
    dot: "bg-state-with-doctor",
    tint: "bg-accent-soft text-brand-700",
  },
  PRESCRIPTION: {
    label: "Prescriptions",
    icon: Pill,
    dot: "bg-state-completed",
    tint: "bg-success-soft text-success",
  },
  LAB: {
    label: "Lab reports",
    icon: FlaskConical,
    dot: "bg-state-vitals",
    tint: "bg-info-soft text-info",
  },
  VITALS: {
    label: "Vitals",
    icon: Activity,
    dot: "bg-state-vitals",
    tint: "bg-info-soft text-info",
  },
  MESSAGE: {
    label: "Messages",
    icon: MessageSquare,
    dot: "bg-muted-foreground",
    tint: "bg-muted text-muted-foreground",
  },
  APPOINTMENT: {
    label: "Appointments",
    icon: CalendarDays,
    dot: "bg-state-registered",
    tint: "bg-muted text-muted-foreground",
  },
  FOLLOW_UP: {
    label: "Follow-ups",
    icon: Repeat2,
    dot: "bg-state-followup",
    tint: "bg-ai-soft text-state-followup",
  },
};

const FLAG_LABEL = {
  ABNORMAL: "Outside reference range",
  FAILED: "Delivery failed",
  OVERDUE: "Overdue",
} as const;

export function PatientTimeline({ events }: { events: TimelineEvent[] }) {
  const [filter, setFilter] = React.useState<TimelineEvent["kind"] | "ALL">("ALL");

  const available = React.useMemo(() => {
    const kinds = new Set(events.map((e) => e.kind));
    return (Object.keys(KIND_META) as TimelineEvent["kind"][]).filter((k) =>
      kinds.has(k),
    );
  }, [events]);

  const visible = React.useMemo(
    () => (filter === "ALL" ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );

  const groups = React.useMemo(() => groupByDay(visible), [visible]);

  return (
    <div>
      {/* Spec §7 — smart timeline filters. */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
        <FilterChip
          active={filter === "ALL"}
          onClick={() => setFilter("ALL")}
          label={`All (${events.length})`}
        />
        {available.map((kind) => (
          <FilterChip
            key={kind}
            active={filter === kind}
            onClick={() => setFilter(kind)}
            label={KIND_META[kind].label}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={KIND_META[filter === "ALL" ? "CONSULTATION" : filter].icon}
          title="Nothing recorded yet"
          description="Events will appear here as this patient is seen, prescribed for and contacted."
        />
      ) : (
        <div className="px-5 py-4">
          {groups.map((group) => (
            <section key={group.key} className="mb-6 last:mb-0">
              <h3
                data-numeric
                className="mb-2.5 text-[12px] font-medium text-muted-foreground"
              >
                {group.label}
              </h3>
              <ol className="relative space-y-1">
                {/* The spine. */}
                <span
                  aria-hidden
                  className="absolute bottom-2 left-[13px] top-2 w-px bg-border"
                />
                {group.events.map((event) => (
                  <TimelineItem key={event.id} event={event} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;

  const body = (
    <div className="flex gap-3 rounded-lg px-2 py-2 transition-colors group-hover:bg-muted">
      <span
        className={cn(
          "relative z-10 mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-full ring-4 ring-card",
          meta.tint,
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">{event.title}</span>
          {event.flag && (
            <Badge
              variant={event.flag === "ABNORMAL" ? "warning" : "destructive"}
            >
              <TriangleAlert />
              {FLAG_LABEL[event.flag]}
            </Badge>
          )}
        </span>
        {event.detail && (
          <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
            {event.detail}
          </span>
        )}
        {event.meta && (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {event.meta}
          </span>
        )}
      </span>

      <span
        data-numeric
        className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
      >
        {event.at.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })}
      </span>
    </div>
  );

  return (
    <li className="group">
      {event.href ? <Link href={event.href}>{body}</Link> : body}
    </li>
  );
}

function groupByDay(events: TimelineEvent[]) {
  const map = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const key = event.at.toISOString().slice(0, 10);
    const bucket = map.get(key);
    if (bucket) bucket.push(event);
    else map.set(key, [event]);
  }

  return [...map.entries()].map(([key, group]) => ({
    key,
    label: group[0].at.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    events: group,
  }));
}
