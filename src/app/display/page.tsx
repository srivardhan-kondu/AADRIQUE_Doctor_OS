import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PauseCircle } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { Clock } from "@/components/display/clock";
import { Permission, hasPermission } from "@/lib/permissions";
import { requireActor } from "@/server/context";
import { getWaitingRoomDisplay } from "@/server/services/display";
import { getQueueSignal } from "@/server/services/live";

export const metadata: Metadata = { title: "Waiting room" };

export const dynamic = "force-dynamic";

/**
 * Spec §12 — the patient-facing queue, for a screen in the waiting area.
 *
 * Opened on the screen by a signed-in member of staff, then left running: it
 * updates by itself (spec §54). Token numbers and timings only — a waiting
 * room is a public place, so no name or reason for a visit is ever shown.
 */
export default async function WaitingRoomPage() {
  const actor = await requireActor();
  if (actor.mustChangePassword) redirect("/account/password");

  if (!hasPermission(actor, Permission.QUEUE_READ)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-navy-950 p-8 text-center text-navy-100">
        <p className="text-lg">This account cannot open the waiting-room display.</p>
      </main>
    );
  }

  const [{ facility, panels }, signal] = await Promise.all([
    getWaitingRoomDisplay(actor),
    getQueueSignal(actor, null),
  ]);

  return (
    <main className="flex min-h-dvh flex-col bg-navy-950 text-navy-100">
      <header className="flex items-center justify-between gap-6 border-b border-navy-800 px-8 py-5">
        <div className="flex items-center gap-4">
          <Logo />
          <p className="font-display text-xl font-semibold text-white">{facility}</p>
        </div>
        <div className="flex items-center gap-6">
          <LiveRefresh signal={signal} className="text-navy-400" />
          <Clock className="font-display text-3xl font-bold tabular-nums text-white" />
        </div>
      </header>

      {panels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="font-display text-3xl font-semibold text-white">
            Welcome
          </p>
          <p className="text-lg text-navy-300">
            Please check in at the front desk. Your token will appear here.
          </p>
        </div>
      ) : (
        <div className="grid flex-1 content-start gap-6 p-8 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
          {panels.map((panel) => (
            <section
              key={panel.doctorId}
              aria-label={`${panel.doctorName}${panel.room ? `, ${panel.room}` : ""}`}
              className="flex flex-col rounded-2xl border border-navy-800 bg-navy-900 p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-xl font-semibold text-white">
                    {panel.doctorName}
                  </p>
                  <p className="mt-0.5 text-sm text-navy-300">
                    {[panel.department, panel.room].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {panel.paused && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-sm font-semibold text-warning">
                    <PauseCircle className="size-4" />
                    On a short break
                  </span>
                )}
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-navy-400">
                Now serving
              </p>
              <p
                data-numeric
                className="mt-1 font-mono text-7xl font-bold leading-none text-accent"
              >
                {panel.nowServing ?? "—"}
              </p>

              <div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-navy-800 pt-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-400">
                    Next
                  </p>
                  <p data-numeric className="mt-1 font-mono text-2xl font-semibold text-white">
                    {panel.next.length > 0 ? panel.next.join("  ") : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-400">
                    Waiting
                  </p>
                  <p data-numeric className="mt-1 font-display text-2xl font-bold text-white">
                    {panel.waiting}
                    {panel.waiting > 0 && (
                      <span className="ml-2 text-base font-medium text-navy-300">
                        ~{panel.estimatedWaitMinutes} min
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="border-t border-navy-800 px-8 py-3 text-center text-sm text-navy-400">
        Waiting times are estimates. Emergencies are seen first.
      </footer>
    </main>
  );
}
