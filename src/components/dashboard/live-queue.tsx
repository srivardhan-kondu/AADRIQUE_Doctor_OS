"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Inbox, Repeat2 } from "lucide-react";
import { cn, formatWait } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { QueueRow } from "@/server/services/dashboard";

/**
 * Spec §5.1 — the Live Queue.
 *
 * Rows animate on reorder so a token moving up the queue is visible rather
 * than a silent swap (spec §33: motion only where it aids comprehension).
 */
export function LiveQueue({
  rows,
  threshold,
}: {
  rows: QueueRow[];
  threshold: number;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle>Live Queue</CardTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {rows.length === 0
              ? "Nobody is waiting"
              : `${rows.length} in the queue right now`}
          </p>
        </div>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/doctor/queue">
              Manage
              <ChevronRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No patients waiting"
          description="Your queue is clear. Enjoy the breathing room."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/doctor/appointments">View today&apos;s appointments</Link>
            </Button>
          }
        />
      ) : (
        <div className="px-2 pb-2">
          {/* Column headers, echoing the spec's queue table. */}
          <div className="grid grid-cols-[60px_1fr_112px_68px] items-center gap-3 px-3 pb-2 pt-1 text-[12px] font-medium text-muted-foreground">
            <span>Token</span>
            <span>Patient</span>
            <span>Status</span>
            <span className="text-right">Wait</span>
          </div>

          <ul>
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <motion.li
                  key={row.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  <QueueRowItem row={row} threshold={threshold} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </Card>
  );
}

function QueueRowItem({ row, threshold }: { row: QueueRow; threshold: number }) {
  const active = row.status === "IN_CONSULTATION";
  const overdue = !active && row.waitMinutes > threshold;

  return (
    <Link
      href={`/doctor/patients/${row.patientId}`}
      className={cn(
        "grid grid-cols-[60px_1fr_112px_68px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        active ? "bg-accent-soft/60" : "hover:bg-muted",
      )}
    >
      <span
        data-numeric
        className={cn(
          "font-mono text-[13px] font-semibold",
          active ? "text-brand-700" : "text-foreground",
        )}
      >
        {row.token}
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">
            {row.patientName}
          </span>
          {row.priority !== "NORMAL" && (
            <Badge variant="destructive" className="shrink-0">
              {row.priority === "EMERGENCY" ? "Emergency" : "Priority"}
            </Badge>
          )}
          {row.isFollowUp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Repeat2 className="size-3.5 shrink-0 text-state-followup" />
              </TooltipTrigger>
              <TooltipContent>Follow-up visit</TooltipContent>
            </Tooltip>
          )}
          {row.allergyCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>
                {row.allergyCount} recorded{" "}
                {row.allergyCount === 1 ? "allergy" : "allergies"}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span data-numeric className="whitespace-nowrap">{row.patientMrn}</span>
          {row.age !== null && (
            <>
              <span aria-hidden>·</span>
              <span data-numeric>{row.age}y</span>
            </>
          )}
          {row.reason && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{row.reason}</span>
            </>
          )}
        </span>
      </span>

      <span>
        {active ? (
          <StatusChip tone="with-doctor" label="With doctor" live />
        ) : row.status === "VITALS" ? (
          <StatusChip tone="vitals" label="Vitals" />
        ) : (
          <StatusChip tone="waiting" label="Waiting" />
        )}
      </span>

      <span
        data-numeric
        className={cn(
          "text-right text-[13px] tabular-nums",
          active
            ? "text-muted-foreground"
            : overdue
              ? "font-semibold text-destructive"
              : "text-muted-foreground",
        )}
      >
        {active ? "—" : formatWait(row.waitMinutes)}
      </span>
    </Link>
  );
}
