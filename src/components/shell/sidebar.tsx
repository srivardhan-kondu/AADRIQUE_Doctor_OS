"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddOn } from "@/lib/add-ons";
import { NAV, isNavItemActive, type NavItem } from "@/lib/nav";
import type { Workspace } from "@/types";
import { Logo, Wordmark } from "@/components/shell/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OperationalPulse } from "@/components/shell/operational-pulse";

/** Live counters rendered beside nav items, from the shell data in the layout. */
export type NavCounters = Partial<Record<NonNullable<NavItem["counter"]>, number>>;

interface SidebarProps {
  workspace: Workspace;
  collapsed: boolean;
  onToggle: () => void;
  counters?: NavCounters;
  lockedAddOns?: AddOn[];
}

export function Sidebar({
  workspace,
  collapsed,
  onToggle,
  counters = {},
  lockedAddOns = [],
}: SidebarProps) {
  const pathname = usePathname();
  const sections = NAV[workspace];

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[68px]" : "w-[236px]",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border",
          collapsed ? "justify-center px-3" : "px-4",
        )}
      >
        <Link href={`/${workspace}`} className="flex items-center gap-2.5 rounded-lg">
          <Logo className="size-8 shrink-0" />
          {!collapsed && <Wordmark className="text-sidebar-accent-foreground" />}
        </Link>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main"
        className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4"
      >
        {sections.map((section, i) => (
          <div key={section.label ?? `section-${i}`} className={cn(i > 0 && "mt-6")}>
            {section.label && !collapsed && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                {section.label}
              </p>
            )}
            {section.label && collapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isNavItemActive(item.href, pathname)}
                  collapsed={collapsed}
                  count={item.counter ? counters[item.counter] : undefined}
                  locked={item.addOn ? lockedAddOns.includes(item.addOn) : false}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Spec §41-J — Operational Pulse lives permanently in the chrome. */}
      <div className="shrink-0 border-t border-sidebar-border p-2.5">
        <OperationalPulse collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-2 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  count,
  locked,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count?: number;
  locked: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors",
        collapsed ? "justify-center px-0" : "px-2.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {active && (
        // CSS, not an animation library: the shell is on every route, and a
        // sliding rail is not worth shipping a motion engine to each of them
        // (spec §52). Motion stays where it aids comprehension (spec §33).
        <span className="absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent animate-in fade-in zoom-in-50 duration-200" />
      )}
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-colors",
          active ? "text-accent" : "text-sidebar-muted group-hover:text-sidebar-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        // Re-keyed on the count so a change plays the entry animation again.
        <span
          key={count}
          data-numeric
          className="ml-auto rounded-md bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-bold text-sidebar-accent-foreground animate-in fade-in slide-in-from-top-1 duration-200"
        >
          {count}
        </span>
      )}
      {!collapsed && locked && (
        <Lock
          aria-label="Add-on"
          className={cn(
            "size-3.5 shrink-0 text-sidebar-muted",
            !(count !== undefined && count > 0) && "ml-auto",
          )}
        />
      )}
      {collapsed && count !== undefined && count > 0 && (
        <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-accent" />
      )}
    </Link>
  );

  if (!collapsed) return <li>{link}</li>;

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">
          {item.label}
          {count !== undefined && count > 0 && ` · ${count}`}
          {locked && " · add-on"}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}
