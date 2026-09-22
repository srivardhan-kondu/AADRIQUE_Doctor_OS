"use client";

import * as React from "react";
import { Menu, Search, Sparkles } from "lucide-react";
import { cn, greeting } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  NotificationCenter,
  type ShellNotification,
} from "@/components/shell/notification-center";
import { UserMenu } from "@/components/shell/user-menu";
import { useSession } from "@/lib/session";
import { useMounted } from "@/hooks/use-mounted";

/**
 * Spec §5.1 — the command-center header.
 *
 * Greeting, identity, live date and the two things a doctor reaches for most:
 * search and the AI Copilot.
 */
export function Topbar({
  onOpenPalette,
  onOpenMobileNav,
  onToggleCopilot,
  copilotOpen,
  notifications,
}: {
  onOpenPalette: () => void;
  onOpenMobileNav: () => void;
  onToggleCopilot: () => void;
  copilotOpen: boolean;
  notifications: ShellNotification[];
}) {
  const { user } = useSession();
  const mounted = useMounted();

  // Rendered after mount: the greeting and date depend on the viewer's clock
  // and timezone, which the server cannot know without guessing.
  const now = mounted ? new Date() : null;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Menu className="size-[18px]" />
      </Button>

      <div className="min-w-0 flex-1">
        {now ? (
          <>
            <h1 className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight">
              {greeting(now)}, {user.name.replace(/^Dr\.\s*/, "Dr. ")}
            </h1>
            <p className="mt-0.5 hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
              {user.department && (
                <>
                  <span className="truncate">{user.department}</span>
                  <span aria-hidden className="text-border">
                    •
                  </span>
                </>
              )}
              <span data-numeric>
                {now.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <span aria-hidden className="text-border">
                •
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    user.online ? "bg-success" : "bg-muted-foreground",
                  )}
                />
                {user.online ? "Online" : "Away"}
              </span>
            </p>
          </>
        ) : (
          <>
            <Skeleton className="h-[18px] w-52" />
            <Skeleton className="mt-1.5 hidden h-3 w-72 sm:block" />
          </>
        )}
      </div>

      {/* Spec §41-I — universal search, reachable from every screen. */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="group hidden h-9 w-64 items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-left text-[13px] text-muted-foreground shadow-soft transition-colors hover:border-navy-200 hover:text-foreground md:flex xl:w-72"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Search patients or actions</span>
        <Kbd>⌘K</Kbd>
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenPalette}
        aria-label="Search"
      >
        <Search className="size-[18px]" />
      </Button>

      <Separator orientation="vertical" className="hidden h-6 sm:block" />

      <NotificationCenter notifications={notifications} />

      {/* Spec §6 — the Copilot panel is optional and contextual, so the shell
          owns the toggle rather than any single screen. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={copilotOpen ? "ai" : "outline"}
            size="sm"
            onClick={onToggleCopilot}
            aria-pressed={copilotOpen}
            className={cn("gap-1.5", !copilotOpen && "text-ai")}
          >
            <Sparkles className={cn(!copilotOpen && "text-ai")} />
            <span className="hidden sm:inline">AI Copilot</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {copilotOpen ? "Hide" : "Open"} AI Copilot
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="hidden h-6 sm:block" />

      <UserMenu />
    </header>
  );
}
