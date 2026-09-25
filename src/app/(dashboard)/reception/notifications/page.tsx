import type { Metadata } from "next";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import {
  MarkAllReadButton,
  NotificationLink,
} from "@/components/notifications/notification-actions";
import { requireActor } from "@/server/context";
import { listNotifications } from "@/server/services/notifications";
import type { NotificationLevel } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Notifications" };

export const dynamic = "force-dynamic";

/**
 * Spec §20 — every notification, by priority level, with the ones that need
 * action first. Reading one is remembered.
 */

const LEVEL: Record<NotificationLevel, { label: string; rail: string; text: string }> = {
  ALERT: { label: "Operational alert", rail: "bg-destructive", text: "text-destructive" },
  IMPORTANT: { label: "Important", rail: "bg-warning", text: "text-warning" },
  AI: { label: "AI", rail: "bg-ai", text: "text-ai" },
  NORMAL: { label: "Update", rail: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const unreadOnly = show === "unread";
  const actor = await requireActor();
  const { rows, unread } = await listNotifications(actor, {
    unreadOnly,
    limit: 100,
  });

  return (
    <PageBody className="max-w-[900px]">
      <PageHeader
        title="Notifications"
        description={
          unread === 0 ? "You're all caught up." : `${unread} unread`
        }
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      <div className="mb-3 flex gap-1 text-[13px]">
        <FilterLink href="/reception/notifications" active={!unreadOnly}>
          All
        </FilterLink>
        <FilterLink
          href="/reception/notifications?show=unread"
          active={unreadOnly}
        >
          Unread
        </FilterLink>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={unreadOnly ? "Nothing unread" : "Nothing needs you right now"}
            description="Queue alerts, booking updates and AI briefs appear here as they happen."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((n) => {
              const level = LEVEL[n.level];
              return (
                <li key={n.id}>
                  <NotificationLink
                    id={n.id}
                    href={n.href}
                    read={n.read}
                    className={cn(
                      "flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted",
                      !n.read && "bg-muted/40",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("w-0.5 shrink-0 self-stretch rounded-full", level.rail)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[12px] font-medium",
                            level.text,
                          )}
                        >
                          {level.label}
                        </span>
                        <span
                          data-numeric
                          className="ml-auto text-[11px] text-muted-foreground"
                        >
                          {n.createdAt.toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      </span>
                      <span className="mt-1 block text-[14px] font-medium">
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {n.body}
                      </span>
                    </span>
                    {!n.read && (
                      <span className="sr-only">Unread</span>
                    )}
                    {!n.read && (
                      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                    )}
                  </NotificationLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageBody>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-soft"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
