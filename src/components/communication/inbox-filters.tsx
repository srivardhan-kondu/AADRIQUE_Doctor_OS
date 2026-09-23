"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Spec §14 — the filter row above the inbox.
 *
 * Filters live in the URL so a view is shareable and the back button works.
 * The search field owns its own value and debounces, the way patient search
 * does, so typing is never blocked by a round trip.
 */

const CHANNELS = [
  { value: "", label: "All channels" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
] as const;

export function InboxFilters({
  channel,
  failedOnly,
  query,
  failedCount,
}: {
  channel: string;
  failedOnly: boolean;
  query: string;
  failedCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(query);

  const push = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, next] of Object.entries(changes)) {
        if (next) params.set(key, next);
        else params.delete(key);
      }
      // Changing the filter should not keep a thread open that the filter
      // just hid.
      params.delete("patient");
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (value === (searchParams.get("q") ?? "")) return;

    const timer = setTimeout(() => {
      push({ q: value || null });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, searchParams, push]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search patients"
          aria-label="Search conversations"
          className="pl-9 pr-8"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
        {CHANNELS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={channel === option.value}
            onClick={() => push({ channel: option.value || null })}
            className={cn(
              "rounded px-2.5 py-1 text-[12px] font-semibold transition-colors",
              channel === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-pressed={failedOnly}
        onClick={() => push({ failed: failedOnly ? null : "1" })}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
          failedOnly
            ? "border-destructive bg-destructive-soft text-destructive"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        Needs attention
        <span className="tabular">{failedCount}</span>
      </button>
    </div>
  );
}
