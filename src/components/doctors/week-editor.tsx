"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Coffee, Copy, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveWeekAction } from "@/app/(dashboard)/doctor/profile/actions";
import {
  DAY_NAMES,
  type WeeklyRule,
  formatClock,
  parseClock,
  toClock,
} from "@/server/rules/availability";

/**
 * Spec §11 — the doctor's recurring week, edited as sessions and breaks per
 * day. Nothing is saved until the whole week is valid; the server checks it
 * again with the same rules before replacing the old one.
 */

/** Monday first, the way a clinic week is read. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Row {
  key: string;
  dayOfWeek: number;
  start: string;
  end: string;
  isBlock: boolean;
  label: string;
}

let nextKey = 0;
const key = () => `r${(nextKey += 1)}`;

function toRows(week: WeeklyRule[]): Row[] {
  return week.map((r) => ({
    key: key(),
    dayOfWeek: r.dayOfWeek,
    start: toClock(r.startMinute),
    end: toClock(r.endMinute),
    isBlock: r.isBlock,
    label: r.label ?? "",
  }));
}

export function WeekEditor({
  doctorId,
  week,
  canEdit,
  title = "Clinic hours",
}: {
  doctorId: string;
  week: WeeklyRule[];
  canEdit: boolean;
  title?: string;
}) {
  const [editing, setEditing] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {week.some((r) => !r.isBlock)
              ? "Appointments can be booked inside these sessions."
              : "No sessions yet — nothing can be booked until hours are set."}
          </p>
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil />
            Edit hours
          </Button>
        )}
      </CardHeader>

      {editing ? (
        <Editor
          doctorId={doctorId}
          week={week}
          onClose={() => setEditing(false)}
        />
      ) : (
        <Summary week={week} />
      )}
    </Card>
  );
}

function Summary({ week }: { week: WeeklyRule[] }) {
  return (
    <dl className="divide-y divide-border px-5 pb-3">
      {ORDER.map((day) => {
        const sessions = week.filter((r) => r.dayOfWeek === day && !r.isBlock);
        const breaks = week.filter((r) => r.dayOfWeek === day && r.isBlock);
        return (
          <div key={day} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="w-24 shrink-0 text-[13px] text-muted-foreground">
              {DAY_NAMES[day]}
            </dt>
            <dd className="min-w-0 text-right text-[13px]">
              {sessions.length === 0 ? (
                <span className="text-muted-foreground">Closed</span>
              ) : (
                <span className="tabular">
                  {sessions
                    .map((s) => `${formatClock(s.startMinute)}–${formatClock(s.endMinute)}`)
                    .join(", ")}
                </span>
              )}
              {breaks.length > 0 && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {breaks
                    .map(
                      (b) =>
                        `${b.label ?? "Break"} ${formatClock(b.startMinute)}–${formatClock(b.endMinute)}`,
                    )
                    .join(" · ")}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Editor({
  doctorId,
  week,
  onClose,
}: {
  doctorId: string;
  week: WeeklyRule[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>(() => toRows(week));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const update = (k: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const remove = (k: string) => setRows((prev) => prev.filter((r) => r.key !== k));

  function addSession(day: number) {
    const last = rows
      .filter((r) => r.dayOfWeek === day && !r.isBlock)
      .map((r) => parseClock(r.end) ?? 0)
      .sort((a, b) => b - a)[0];
    const start = last !== undefined ? Math.min(last + 60, 20 * 60) : 9 * 60;
    setRows((prev) => [
      ...prev,
      {
        key: key(),
        dayOfWeek: day,
        start: toClock(start),
        end: toClock(Math.min(start + 4 * 60, 23 * 60)),
        isBlock: false,
        label: "",
      },
    ]);
  }

  function addBreak(day: number) {
    const session = rows.find((r) => r.dayOfWeek === day && !r.isBlock);
    const start = session ? (parseClock(session.start) ?? 9 * 60) + 120 : 11 * 60;
    setRows((prev) => [
      ...prev,
      {
        key: key(),
        dayOfWeek: day,
        start: toClock(start),
        end: toClock(start + 30),
        isBlock: true,
        label: "Break",
      },
    ]);
  }

  /** Monday's pattern onto Tuesday–Friday, the most common edit by far. */
  function copyToWeekdays(from: number) {
    const source = rows.filter((r) => r.dayOfWeek === from);
    setRows((prev) => [
      ...prev.filter((r) => ![1, 2, 3, 4, 5].includes(r.dayOfWeek) || r.dayOfWeek === from),
      ...[1, 2, 3, 4, 5]
        .filter((d) => d !== from)
        .flatMap((d) => source.map((r) => ({ ...r, key: key(), dayOfWeek: d }))),
    ]);
  }

  function save() {
    setError(null);

    const rules: WeeklyRule[] = [];
    for (const row of rows) {
      const startMinute = parseClock(row.start);
      const endMinute = parseClock(row.end);
      if (startMinute === null || endMinute === null) {
        setError(`${DAY_NAMES[row.dayOfWeek]} has a time that is not filled in.`);
        return;
      }
      rules.push({
        dayOfWeek: row.dayOfWeek,
        startMinute,
        endMinute,
        isBlock: row.isBlock,
        label: row.label.trim() || null,
      });
    }

    startTransition(async () => {
      const result = await saveWeekAction(doctorId, rules);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.refresh();
        onClose();
      } else {
        setError([result.message, result.action].filter(Boolean).join(" "));
      }
    });
  }

  return (
    <div className="px-5 pb-5">
      <ul className="divide-y divide-border">
        {ORDER.map((day) => {
          const dayRows = rows
            .filter((r) => r.dayOfWeek === day)
            .sort((a, b) => Number(a.isBlock) - Number(b.isBlock));
          const hasSession = dayRows.some((r) => !r.isBlock);

          return (
            <li key={day} className="flex flex-wrap items-start gap-3 py-3">
              <span className="w-24 shrink-0 pt-1.5 text-[13px] font-medium">
                {DAY_NAMES[day]}
              </span>

              <div className="min-w-0 flex-1 space-y-2">
                {dayRows.length === 0 && (
                  <p className="pt-1.5 text-[13px] text-muted-foreground">Closed</p>
                )}
                {dayRows.map((row) => (
                  <div key={row.key} className="flex flex-wrap items-center gap-2">
                    {row.isBlock && (
                      <Coffee className="size-3.5 text-muted-foreground" aria-hidden />
                    )}
                    <Input
                      type="time"
                      step={300}
                      value={row.start}
                      onChange={(e) => update(row.key, { start: e.target.value })}
                      aria-label={`${DAY_NAMES[day]} ${row.isBlock ? "break" : "session"} start`}
                      className="h-8 w-28"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      step={300}
                      value={row.end}
                      onChange={(e) => update(row.key, { end: e.target.value })}
                      aria-label={`${DAY_NAMES[day]} ${row.isBlock ? "break" : "session"} end`}
                      className="h-8 w-28"
                    />
                    {row.isBlock && (
                      <Input
                        value={row.label}
                        onChange={(e) => update(row.key, { label: e.target.value })}
                        placeholder="Break"
                        aria-label={`${DAY_NAMES[day]} break name`}
                        maxLength={60}
                        className="h-8 w-36"
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(row.key)}
                      aria-label={`Remove this ${row.isBlock ? "break" : "session"}`}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={() => addSession(day)}>
                  <Plus />
                  Session
                </Button>
                {hasSession && (
                  <Button variant="ghost" size="sm" onClick={() => addBreak(day)}>
                    <Coffee />
                    Break
                  </Button>
                )}
                {day === 1 && hasSession && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToWeekdays(1)}
                    title="Replace Tuesday to Friday with Monday's hours"
                  >
                    <Copy />
                    To weekdays
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
        >
          {error}
        </p>
      )}

      <div className={cn("mt-4 flex justify-end gap-2")}>
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="accent" onClick={save} disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          Save hours
        </Button>
      </div>
    </div>
  );
}
