"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** The window every number on the screen is measured over. */
const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

export function RangeSwitch({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
      {RANGES.map((range) => {
        const active = String(days) === range.value;

        return (
          <button
            key={range.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.set("days", range.value);
              router.replace(`${pathname}?${params}`, { scroll: false });
            }}
            className={cn(
              "rounded px-2.5 py-1 text-[12px] font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}
