"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Spec §5.1 — a top metric, with the subtle count-up used when data changes.
 *
 * The number is rendered directly, so the server output and the first paint
 * are always the true value. The animation then tweens the text node itself
 * rather than driving React state — a count-up is a visual effect, and running
 * it through state would re-render the tree on every frame.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  emphasis,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "waiting" | "active" | "done" | "followup";
  hint?: string;
  emphasis?: boolean;
}) {
  const numberRef = useCountUp(value);

  const toneClass = {
    default: "text-muted-foreground",
    waiting: "text-state-waiting",
    active: "text-state-with-doctor",
    done: "text-state-completed",
    followup: "text-state-followup",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-soft transition-colors",
        emphasis && "border-accent/40 bg-accent-soft/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <Icon className={cn("size-4 shrink-0", toneClass)} />
      </div>
      <p
        ref={numberRef}
        data-numeric
        className="mt-2.5 font-display text-[28px] font-bold leading-none"
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Tweens the referenced element's text from its previous value to `target`.
 * Returns the ref to attach. No-op on first mount and under reduced motion.
 */
function useCountUp(target: number) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const previous = React.useRef(target);

  React.useEffect(() => {
    const node = ref.current;
    const from = previous.current;
    previous.current = target;

    if (!node || from === target) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = String(target);
      return;
    }

    const duration = 450;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      node.textContent = String(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      // Whatever happens, the element must end on the real value.
      node.textContent = String(target);
    };
  }, [target]);

  return ref;
}
