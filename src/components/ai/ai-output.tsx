import Link from "next/link";
import { CircleAlert, FileSearch, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AISection, AISource } from "@/lib/ai/types";

/**
 * Spec §10 — how a generated surface looks.
 *
 * Three rules the product will not bend, all visible here:
 *
 *   1. Every AI surface is marked. The `.ai-surface` treatment and the
 *      "AI generated · Doctor review required" badge are not decoration —
 *      they are the difference between a draft and a chart entry.
 *   2. Every claim is traceable. Each section shows the record rows it was
 *      built from, and each one links back to the original (spec §8).
 *   3. The product says who wrote it. "Assembled from the record" and
 *      "written by a model" are different promises, so `grounded` is shown
 *      rather than hidden behind one generic AI label.
 */
export function AIOutputView({
  sections,
  sources,
  grounded,
  note,
  provider,
  model,
  compact,
  className,
}: {
  sections: AISection[];
  sources: AISource[];
  grounded: boolean;
  note?: string;
  provider?: string;
  model?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const byRef = new Map(sources.map((s) => [s.ref, s]));

  return (
    <div className={cn("ai-surface rounded-xl", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-ai-border px-4 py-2.5">
        <Sparkles className="size-3.5 shrink-0 text-ai" />
        <Badge variant="ai">AI generated</Badge>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ai">
          Doctor review required
        </span>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {grounded
            ? "Assembled from this patient's records"
            : `Written by ${model ?? provider ?? "a model"}, checked against the record`}
        </span>
      </div>

      {note && (
        <p className="flex items-start gap-2 border-b border-ai-border/60 px-4 py-2 text-[12px] text-muted-foreground">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {note}
        </p>
      )}

      <div className={cn("space-y-3.5 px-4", compact ? "py-3" : "py-4")}>
        {sections.map((section, index) => (
          <section key={`${section.heading}-${index}`}>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {section.heading}
            </h4>

            <ul className="mt-1 space-y-1">
              {section.lines.map((line, lineIndex) =>
                line.trim() === "" ? (
                  <li key={lineIndex} className="h-1.5" aria-hidden />
                ) : (
                  <li
                    key={lineIndex}
                    className={cn(
                      "text-[13px] leading-relaxed",
                      section.lines.length > 1 && "flex gap-2",
                    )}
                  >
                    {section.lines.length > 1 && (
                      <span aria-hidden className="select-none text-ai">
                        ·
                      </span>
                    )}
                    <span>{line}</span>
                  </li>
                ),
              )}
            </ul>

            {section.cites.length > 0 && (
              <Citations
                cites={section.cites}
                byRef={byRef}
                heading={section.heading}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/** Spec §8 — the doctor can inspect the source of anything generated. */
function Citations({
  cites,
  byRef,
  heading,
}: {
  cites: string[];
  byRef: Map<string, AISource>;
  heading: string;
}) {
  const sources = cites
    .map((ref) => byRef.get(ref))
    .filter((s): s is AISource => s !== undefined);

  if (sources.length === 0) return null;

  return (
    <ul
      aria-label={`Sources for ${heading}`}
      className="mt-1.5 flex flex-wrap gap-1.5"
    >
      {sources.map((source) => {
        const label = (
          <>
            <FileSearch className="size-3 shrink-0" />
            {source.label}
            {source.at && (
              <span className="text-muted-foreground">· {source.at}</span>
            )}
          </>
        );

        return (
          <li key={source.ref}>
            {source.href ? (
              <Link
                href={source.href}
                title={source.detail}
                className="inline-flex items-center gap-1 rounded-md border border-ai-border bg-card/70 px-1.5 py-0.5 text-[10px] font-semibold text-ai transition-colors hover:bg-card"
              >
                {label}
              </Link>
            ) : (
              <span
                title={source.detail}
                className="inline-flex items-center gap-1 rounded-md border border-ai-border bg-card/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
              >
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The loading state for a surface that is being generated. */
export function AIOutputSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="ai-surface rounded-xl">
      <div className="flex items-center gap-2 border-b border-ai-border px-4 py-2.5">
        <Sparkles className="size-3.5 shrink-0 animate-pulse text-ai" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ai">
          Reading the record…
        </span>
      </div>
      <div className="space-y-2 px-4 py-4">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="shimmer h-3 rounded bg-ai-border/40"
            style={{ width: `${92 - i * 11}%` }}
          />
        ))}
      </div>
    </div>
  );
}
