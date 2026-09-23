"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Spec §54 — the queue updates without a manual refresh.
 *
 * The page renders the queue signal it was built from and hands it here. This
 * polls for the current signal and refreshes the page — server components and
 * all — only when the two differ. After the refresh the page hands down the
 * new signal, so a change is picked up exactly once, including a change the
 * user just made themselves.
 *
 * Polling stops while the tab is hidden and resumes, with an immediate check,
 * when it is shown again: a screen nobody is looking at costs nothing. Errors
 * back off rather than hammer a struggling server.
 */

const INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

export function LiveRefresh({
  signal,
  doctorId,
  className,
}: {
  /** The signal this render was built from. */
  signal: string;
  /** Limit to one doctor's queue; omit for the whole organization. */
  doctorId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<"live" | "offline">("live");

  // The latest rendered signal, read by the poll loop without restarting it.
  const renderedRef = React.useRef(signal);
  React.useEffect(() => {
    renderedRef.current = signal;
  }, [signal]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = INTERVAL_MS;
    let stopped = false;
    const url = doctorId
      ? `/api/live/queue?doctor=${encodeURIComponent(doctorId)}`
      : "/api/live/queue";

    async function check() {
      if (stopped || document.visibilityState !== "visible") return;

      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const { signal: current } = (await response.json()) as { signal: string };

        delay = INTERVAL_MS;
        setState("live");

        if (current !== renderedRef.current) {
          // Assume the refresh will land on this signal, so a slow render is
          // not refreshed a second time by the next poll.
          renderedRef.current = current;
          React.startTransition(() => router.refresh());
        }
      } catch {
        delay = Math.min(delay * 2, MAX_BACKOFF_MS);
        setState("offline");
      }

      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(check, delay);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void check();
      }
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [doctorId, router]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      title={
        state === "live"
          ? "This screen updates by itself"
          : "Updates paused — reconnecting"
      }
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          state === "live" ? "bg-success animate-pulse" : "bg-warning",
        )}
      />
      {state === "live" ? "Live" : "Reconnecting…"}
    </span>
  );
}
