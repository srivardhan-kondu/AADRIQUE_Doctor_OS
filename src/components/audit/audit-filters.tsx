"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Spec §30 — narrowing the trail without losing the URL. */

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

const ALL = "__all__";

export function AuditFilters({
  action,
  actorId,
  days,
  query,
  actions,
  actors,
}: {
  action: string;
  actorId: string;
  days: number;
  query: string;
  actions: { value: string; label: string; count: number }[];
  actors: { id: string; name: string; count: number }[];
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
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (value === (searchParams.get("q") ?? "")) return;
    const timer = setTimeout(() => push({ q: value || null }), 250);
    return () => clearTimeout(timer);
  }, [value, searchParams, push]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search the trail — a person, a record, a patient ID"
          aria-label="Search the audit log"
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

      <Select
        value={action || ALL}
        onValueChange={(next) => push({ action: next === ALL ? null : next })}
      >
        <SelectTrigger className="w-52" aria-label="Filter by action">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All actions</SelectItem>
          {actions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label} ({option.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={actorId || ALL}
        onValueChange={(next) => push({ actor: next === ALL ? null : next })}
      >
        <SelectTrigger className="w-48" aria-label="Filter by person">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          {actors.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} ({option.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
        {RANGES.map((range) => (
          <button
            key={range.value}
            type="button"
            aria-pressed={String(days) === range.value}
            onClick={() => push({ days: range.value })}
            className={cn(
              "rounded px-2.5 py-1 text-[12px] font-semibold transition-colors",
              String(days) === range.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}
