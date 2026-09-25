import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { Metric } from "@/server/services/analytics";

/**
 * Spec §16 — a compact metric card with a small trend indicator.
 *
 * Two rules it will not bend:
 *
 *   1. A metric with no data says so. "0%" and "nothing happened yet" are
 *      different facts, and a card that shows 0 for both is lying.
 *   2. Direction is not the same as good. A falling wait time is an
 *      improvement; a falling completion rate is not. `betterWhen` decides
 *      the colour, and the arrow only ever reports direction.
 */
export function MetricTile({
  label,
  metric,
  unit = "",
  betterWhen = "higher",
  hint,
}: {
  label: string;
  metric: Metric;
  /** "%", " min", "" — appended to the number as written. */
  unit?: string;
  betterWhen?: "higher" | "lower" | "neutral";
  /**
   * What to say when there is no value at all. It explains the absence, so it
   * belongs only to the empty case — a metric that has a number but nothing
   * to compare it against is a different sentence.
   */
  hint?: string;
}) {
  const empty = metric.value === null;

  const direction =
    metric.delta === null || Math.abs(metric.delta) < 0.05
      ? "flat"
      : metric.delta > 0
        ? "up"
        : "down";

  const good =
    betterWhen === "neutral" || direction === "flat"
      ? null
      : (direction === "up") === (betterWhen === "higher");

  const Icon =
    direction === "up"
      ? ArrowUpRight
      : direction === "down"
        ? ArrowDownRight
        : ArrowRight;

  return (
    <Card className="px-4 py-3.5">
      <p className="text-[12px] font-medium text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 font-display text-2xl font-medium tabular">
        {empty ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {metric.value}
            <span className="text-[15px] font-semibold text-muted-foreground">
              {unit}
            </span>
          </>
        )}
      </p>

      <div className="mt-1 min-h-4">
        {empty ? (
          <p className="text-[11px] text-muted-foreground">
            {hint ?? "Nothing recorded in this period"}
          </p>
        ) : metric.delta === null ? (
          <p className="text-[11px] text-muted-foreground">
            No earlier period to compare
          </p>
        ) : (
          <p
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold",
              good === null
                ? "text-muted-foreground"
                : good
                  ? "text-success"
                  : "text-warning",
            )}
          >
            <Icon className="size-3" aria-hidden />
            <span className="tabular">
              {metric.delta > 0 ? "+" : ""}
              {metric.delta}
              {unit}
            </span>
            <span className="font-normal text-muted-foreground">
              vs previous
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}
