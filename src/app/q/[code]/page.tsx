import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";
import { AutoRefresh } from "@/components/display/auto-refresh";
import { verifySignedId } from "@/lib/security/signed-link";
import { getTokenStatus } from "@/server/services/display";

export const metadata: Metadata = {
  title: "Your token",
  // A personal link: never indexed, never shown in a preview.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Spec §12 — the patient-facing token view, on the patient's own phone.
 *
 *   YOUR TOKEN  A018 · CURRENT TOKEN  A015 · 3 patients ahead · ~12 min
 *
 * Opened from a signed link in the token message; no account needed. Token
 * numbers and timings only.
 */
export default async function TokenPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const entryId = verifySignedId(decodeURIComponent(code));
  const status = entryId ? await getTokenStatus(entryId) : null;

  if (!status) {
    return (
      <Shell>
        <p className="text-lg font-semibold text-white">This link is not valid</p>
        <p className="mt-2 text-navy-300">
          Please check with the front desk for your token.
        </p>
      </Shell>
    );
  }

  return (
    <Shell facility={status.facility}>
      {status.state === "waiting" && <AutoRefresh seconds={15} />}

      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-navy-400">
        Your token
      </p>
      <p data-numeric className="mt-1 font-mono text-6xl font-bold text-accent">
        {status.token}
      </p>
      <p className="mt-2 text-navy-300">
        {status.doctorName}
        {status.room ? ` · ${status.room}` : ""}
      </p>

      <div className="mt-8 w-full max-w-xs rounded-2xl border border-navy-800 bg-navy-900 p-5">
        {status.state === "waiting" ? (
          <>
            <Row label="Current token" value={status.nowServing ?? "—"} mono />
            <Row
              label="Ahead of you"
              value={
                status.ahead === 0
                  ? "You're next"
                  : `${status.ahead} ${status.ahead === 1 ? "patient" : "patients"}`
              }
            />
            <Row
              label="Estimated wait"
              value={status.ahead === 0 ? "Any moment" : `~${status.estimatedWaitMinutes} min`}
            />
            {status.paused && (
              <p className="mt-3 text-sm text-warning">
                The doctor is on a short break. Your place is kept.
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-lg font-semibold text-white">
            {status.state === "called"
              ? "Please go in now."
              : status.state === "done"
                ? "Your consultation is complete. Thank you."
                : status.state === "expired"
                  ? "This token was for an earlier day."
                  : "This token is no longer in the queue. Please ask at the front desk."}
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-navy-400">
        Times are estimates · emergencies are seen first
      </p>
    </Shell>
  );
}

function Shell({
  facility,
  children,
}: {
  facility?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-navy-950 px-6 py-10 text-center text-navy-100">
      <div className="mb-10 flex items-center gap-3">
        <Logo />
        {facility && <p className="font-display font-semibold text-white">{facility}</p>}
      </div>
      <div className="flex flex-col items-center">{children}</div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-navy-400">{label}</span>
      <span
        data-numeric
        className={mono ? "font-mono text-xl font-bold text-white" : "font-semibold text-white"}
      >
        {value}
      </span>
    </div>
  );
}
