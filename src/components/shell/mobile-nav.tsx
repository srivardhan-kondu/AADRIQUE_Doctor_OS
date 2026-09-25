"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Lock, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddOn } from "@/lib/add-ons";
import { NAV, isNavItemActive } from "@/lib/nav";
import type { Workspace } from "@/types";
import { Logo, Wordmark } from "@/components/shell/logo";
import { OperationalPulse } from "@/components/shell/operational-pulse";
import type { NavCounters } from "@/components/shell/sidebar";

/** The sidebar as a left sheet, for tablet and mobile widths (spec §34). */
export function MobileNav({
  open,
  onOpenChange,
  workspace,
  counters = {},
  lockedAddOns = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  counters?: NavCounters;
  lockedAddOns?: AddOn[];
}) {
  const pathname = usePathname();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 lg:hidden" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-sidebar text-sidebar-foreground shadow-overlay outline-none lg:hidden",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Navigation
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Move between the screens of your workspace
          </DialogPrimitive.Description>

          <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
            <Link
              href={`/${workspace}`}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2.5"
            >
              <Logo className="size-8" />
              <Wordmark className="text-sidebar-accent-foreground" />
            </Link>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <XIcon className="size-4" />
              <span className="sr-only">Close navigation</span>
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 py-4">
            {NAV[workspace].map((section, i) => (
              <div key={section.label ?? `section-${i}`} className={cn(i > 0 && "mt-6")}>
                {section.label && (
                  <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
                    {section.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isNavItemActive(item.href, pathname);
                    const count = item.counter ? counters[item.counter] : undefined;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => onOpenChange(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "size-[18px] shrink-0",
                              active ? "text-accent" : "text-sidebar-muted",
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                          {count !== undefined && count > 0 && (
                            <span
                              data-numeric
                              className="ml-auto rounded-md bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-bold text-sidebar-accent-foreground"
                            >
                              {count}
                            </span>
                          )}
                          {item.addOn && lockedAddOns.includes(item.addOn) && (
                            <Lock
                              aria-label="Add-on"
                              className={cn(
                                "size-3.5 shrink-0 text-sidebar-muted",
                                !(count !== undefined && count > 0) && "ml-auto",
                              )}
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-sidebar-border p-2.5">
            <OperationalPulse />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
