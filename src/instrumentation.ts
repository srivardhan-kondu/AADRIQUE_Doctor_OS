import type { Instrumentation } from "next";
import { createAlertThrottle, errorReport } from "@/lib/observability/error-report";

/**
 * Spec §31 — server errors, reported.
 *
 * Every error Next.js catches on the server (a page, a route handler, a
 * server action, the proxy) becomes one scrubbed JSON line on stderr, which
 * any log collector can index and alert on. Set ERROR_ALERT_WEBHOOK_URL to
 * also POST each distinct error — at most once per five minutes — to a
 * Slack/Teams/Discord incoming webhook or any endpoint that takes JSON.
 */

const shouldAlert = createAlertThrottle();

/** Runs once as the server starts, before any request is served. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyClinicTimeZone } = await import("@/lib/time-zone");
    applyClinicTimeZone();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const report = errorReport(error, request, context);
  console.error(JSON.stringify(report));

  const webhook = process.env.ERROR_ALERT_WEBHOOK_URL;
  if (!webhook || !shouldAlert(report)) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is what Slack, Teams and Discord display; the rest is for anything else.
      body: JSON.stringify({
        text: `AADRIQUE Doctor OS error on ${report.method} ${report.route ?? report.path}: ${report.name}: ${report.message}${report.digest ? ` (digest ${report.digest})` : ""}`,
        report,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Alerting must never become a second failure; the log line above stands.
  }
};
