"use client";

import * as React from "react";

/**
 * Spec §16 — the one primary trend chart.
 *
 * A single series, so there is no legend: the card title says what is
 * plotted, and one colour cannot be ambiguous. Marks follow the house specs —
 * a 2px line, a 10% area wash, an 8px end marker ringed in the surface colour
 * so it stays legible where it crosses the line, hairline recessive
 * gridlines, and direct labels only on the endpoint and the peak.
 *
 * It measures its container rather than scaling a viewBox, so the type stays
 * at its intended size on every screen instead of growing with the chart.
 */

export interface TrendDatum {
  /** ISO date string — dates do not survive a server/client boundary. */
  date: string;
  value: number;
}

const HEIGHT = 200;
const PADDING = { top: 16, right: 44, bottom: 24, left: 34 };

export function TrendChart({
  data,
  label,
  valueLabel = "patients",
}: {
  data: TrendDatum[];
  label: string;
  valueLabel?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = React.useMemo(
    () => data.map((d) => ({ ...d, at: new Date(d.date) })),
    [data],
  );

  const max = Math.max(1, ...points.map((p) => p.value));
  // Round the top of the scale to something a person would say out loud.
  const ceiling = niceCeiling(max);

  const innerWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = (index: number) =>
    PADDING.left +
    (points.length <= 1
      ? innerWidth / 2
      : (index / (points.length - 1)) * innerWidth);

  const y = (value: number) =>
    PADDING.top + innerHeight - (value / ceiling) * innerHeight;

  const ready = width > 0 && points.length > 0;

  const linePath = ready
    ? points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ")
    : "";

  const areaPath = ready
    ? `${linePath} L${x(points.length - 1)},${PADDING.top + innerHeight} L${x(0)},${
        PADDING.top + innerHeight
      } Z`
    : "";

  const lastIndex = points.length - 1;
  const peakIndex = points.reduce(
    (best, p, i) => (p.value > points[best].value ? i : best),
    0,
  );

  // The peak only earns its own label when it is not already the endpoint and
  // is clearly the high point — otherwise two labels collide over one dot.
  const showPeak =
    peakIndex !== lastIndex &&
    points[peakIndex].value > points[lastIndex].value &&
    Math.abs(x(peakIndex) - x(lastIndex)) > 56;

  const active = hover !== null ? points[hover] : null;

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!ready || points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - bounds.left - PADDING.left;
    const ratio = innerWidth > 0 ? offset / innerWidth : 0;
    const index = Math.round(ratio * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  const ticks = [0, ceiling / 2, ceiling];

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width || undefined}
        height={HEIGHT}
        role="img"
        aria-label={`${label}. Peak ${points[peakIndex]?.value ?? 0} ${valueLabel} on ${
          points[peakIndex] ? formatDay(points[peakIndex].at) : "—"
        }.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        className="touch-none"
      >
        {ready && (
          <>
            {/* Gridlines: hairline, solid, one step off the surface. */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={PADDING.left + innerWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--muted-foreground)"
                  className="tabular"
                >
                  {Math.round(tick)}
                </text>
              </g>
            ))}

            <path d={areaPath} fill="var(--accent)" fillOpacity={0.1} />

            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Crosshair under the marks, so it never hides the data. */}
            {active && hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PADDING.top}
                y2={PADDING.top + innerHeight}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeOpacity={0.4}
              />
            )}

            {showPeak && (
              <PointLabel
                x={x(peakIndex)}
                y={y(points[peakIndex].value)}
                value={points[peakIndex].value}
                anchor="middle"
              />
            )}

            <PointLabel
              x={x(lastIndex)}
              y={y(points[lastIndex].value)}
              value={points[lastIndex].value}
              anchor="start"
            />

            {active && hover !== null && (
              <circle
                cx={x(hover)}
                cy={y(active.value)}
                r={4}
                fill="var(--accent)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            )}

            {/* Axis labels: first and last day only — the rest is noise. */}
            <text
              x={PADDING.left}
              y={HEIGHT - 6}
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {formatDay(points[0].at)}
            </text>
            <text
              x={PADDING.left + innerWidth}
              y={HEIGHT - 6}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {formatDay(points[lastIndex].at)}
            </text>
          </>
        )}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-overlay"
          style={{
            left: Math.min(Math.max(x(hover), 60), Math.max(60, width - 60)),
            top: Math.max(0, y(active.value) - 52),
          }}
        >
          <p className="font-display text-[13px] font-bold tabular">
            {active.value}{" "}
            <span className="font-normal text-muted-foreground">
              {valueLabel}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatFullDay(active.at)}
          </p>
        </div>
      )}
    </div>
  );
}

/** An end marker with its value beside it, ringed in the surface colour. */
function PointLabel({
  x,
  y,
  value,
  anchor,
}: {
  x: number;
  y: number;
  value: number;
  anchor: "start" | "middle";
}) {
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={4}
        fill="var(--accent)"
        stroke="var(--card)"
        strokeWidth={2}
      />
      <text
        x={anchor === "start" ? x + 8 : x}
        y={anchor === "start" ? y + 4 : y - 10}
        textAnchor={anchor}
        fontSize={11}
        fontWeight={700}
        fill="var(--foreground)"
        className="tabular"
      >
        {value}
      </text>
    </>
  );
}

/** 0 / 5 / 10 reads better than 0 / 3.5 / 7. */
function niceCeiling(max: number): number {
  if (max <= 4) return 4;
  if (max <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatFullDay(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
