"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NotificationLevel } from "@/types";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(dashboard)/notification-actions";

export interface ShellNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Where the notification leads, when it is about something specific. */
  href: string | null;
}

/**
 * Spec §20 — notification center with priority levels.
 * "Avoid excessive notification noise": alerts sort to the top, everything else
 * stays chronological, and the badge counts unread only.
 */
const LEVEL_META: Record<
  NotificationLevel,
  { label: string; rail: string; text: string }
> = {
  NORMAL: { label: "Update", rail: "bg-muted-foreground/40", text: "text-muted-foreground" },
  IMPORTANT: { label: "Important", rail: "bg-warning", text: "text-warning" },
  ALERT: { label: "Operational alert", rail: "bg-destructive", text: "text-destructive" },
  AI: { label: "AI", rail: "bg-ai", text: "text-ai" },
};

const LEVEL_WEIGHT: Record<NotificationLevel, number> = {
  ALERT: 0,
  IMPORTANT: 1,
  AI: 2,
  NORMAL: 3,
};

export function NotificationCenter({
  notifications,
}: {
  notifications: ShellNotification[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // Reads made here show at once; the server copy catches up on the next
  // render. Derived from props rather than copied, so notifications that
  // arrive with a refresh are not hidden behind stale local state.
  const [readHere, setReadHere] = React.useState<ReadonlySet<string>>(new Set());

  const items = React.useMemo(
    () =>
      notifications.map((n) => (readHere.has(n.id) ? { ...n, read: true } : n)),
    [notifications, readHere],
  );
  const unread = items.filter((n) => !n.read).length;

  const sorted = React.useMemo(
    () => [...items].sort((a, b) => LEVEL_WEIGHT[a.level] - LEVEL_WEIGHT[b.level]),
    [items],
  );

  const markAllRead = () => {
    setReadHere(new Set(items.map((n) => n.id)));
    void markAllNotificationsReadAction().then(() => router.refresh());
  };

  const openItem = (n: ShellNotification) => {
    if (!n.read) {
      setReadHere((prev) => new Set(prev).add(n.id));
      void markNotificationReadAction(n.id).then(() => router.refresh());
    }
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={
                unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
              }
            >
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center">
                  <span className="size-2 rounded-full bg-accent ring-2 ring-background" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[12px] text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <CheckCheck />
              Mark all read
            </Button>
          )}
        </div>

        {sorted.length === 0 ? (
          /* Spec §36 — useful empty states, never "No data found". */
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">Nothing needs you right now</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Queue alerts and AI briefs will appear here as they happen.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <ul className="p-1.5">
              {sorted.map((n) => {
                const meta = LEVEL_META[n.level];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "relative flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted",
                        !n.read && "bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 h-full w-0.5 shrink-0 self-stretch rounded-full",
                          meta.rail,
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[12px] font-medium",
                              meta.text,
                            )}
                          >
                            {meta.label}
                          </span>
                          <span
                            data-numeric
                            className="ml-auto text-[11px] text-muted-foreground"
                          >
                            {n.at}
                          </span>
                        </span>
                        <span className="mt-1 block text-[13px] font-medium leading-snug">
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                          {n.body}
                        </span>
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
