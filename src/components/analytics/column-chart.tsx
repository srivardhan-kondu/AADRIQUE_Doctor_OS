import { cn } from "@/lib/utils";

/**
 * Spec §16 — a small single-hue column chart, for peak hours.
 *
 * One measure, so one hue; a column's height carries the value and nothing
 * else needs a colour. Columns are capped well under their band so the
 * leftover width reads as air, each gets a 4px rounded cap and a square foot
 * on the baseline, and neighbours are separated by the surface, not a stroke.
 */
export function ColumnChart({
  data,
  highlight,
  emptyText = "Nothing recorded yet",
}: {
  data: { label: string; value: number; caption?: string }[];
  /** The one column worth calling out — the peak. */
  highlight?: number | null;
  emptyText?: string;
}) {
  const max = Math.max(...data.map((d) => d.value));

  if (max === 0) {
    return (
      <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="flex items-end gap-[2px]" style={{ height: 132 }}>
      {data.map((column, index) => {
        const ratio = column.value / max;
        const isPeak = highlight === index;

        return (
          <div
            key={column.label}
            className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            title={`${column.caption ?? column.label}: ${column.value}`}
          >
            <span
              className={cn(
                "text-[10px] font-bold tabular transition-opacity",
                isPeak
                  ? "text-foreground"
                  : "text-muted-foreground opacity-0 group-hover:opacity-100",
              )}
            >
              {column.value > 0 ? column.value : ""}
            </span>

            <div
              className={cn(
                "w-full max-w-6 rounded-t-[4px] transition-colors",
                isPeak
                  ? "bg-accent"
                  : "bg-accent/35 group-hover:bg-accent/60",
              )}
              style={{ height: `${Math.max(ratio * 92, column.value > 0 ? 3 : 0)}%` }}
            />

            <span
              className={cn(
                "w-full truncate text-center text-[10px] tabular",
                isPeak
                  ? "font-bold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {column.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
