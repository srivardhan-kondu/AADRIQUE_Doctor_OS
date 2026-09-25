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
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-[72px] shrink-0 items-center gap-2.5",
          collapsed ? "justify-center px-3" : "px-5",
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
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
      >
        {sections.map((section, i) => (
          <div key={section.label ?? `section-${i}`} className={cn(i > 0 && "mt-5")}>
            {section.label && !collapsed && (
              <p className="mb-1.5 px-3 text-[12px] font-medium text-sidebar-muted">
                {section.label}
              </p>
            )}
            {section.label && collapsed && (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
            )}
            <ul className="space-y-1">
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
      <div className="shrink-0 p-3">
        <OperationalPulse collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-2 flex h-8 w-full items-center gap-2.5 rounded-full px-3 text-[13px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
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
        "group relative flex h-10 items-center gap-3 rounded-full text-[14px] font-medium transition-[background-color,color,box-shadow]",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-colors [stroke-width:1.75]",
          active ? "text-accent" : "text-sidebar-muted group-hover:text-sidebar-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        // Re-keyed on the count so a change plays the entry animation again.
        <span
          key={count}
          data-numeric
          className={cn(
            "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold animate-in fade-in slide-in-from-top-1 duration-200",
            active ? "bg-highlight text-highlight-foreground" : "bg-foreground/[0.06] text-sidebar-foreground",
          )}
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
