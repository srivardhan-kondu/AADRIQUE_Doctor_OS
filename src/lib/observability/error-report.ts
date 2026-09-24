/**
 * Spec §31 + §50 — what leaves the app when something fails.
 *
 * One JSON line per server error, for whatever collects the logs (Vercel,
 * Datadog, Loki, CloudWatch). It names the route and the error, never the
 * patient: the query string is dropped, and anything shaped like an email
 * address, a phone number or a long id is masked in the message, since an
 * error message can quote the data that caused it.
 */

export interface ErrorReport {
  level: "error";
  at: string;
  name: string;
  message: string;
  digest: string | null;
  method: string;
  path: string;
  route: string | null;
  kind: string | null;
}

export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{8,}\d/g, "[number]")
    .replace(/\b[a-z0-9]{24,}\b/gi, "[id]")
    .slice(0, 500);
}

export function errorReport(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string } | undefined,
  now = new Date(),
): ErrorReport {
  const err = error instanceof Error ? error : null;
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : null;
  return {
    level: "error",
    at: now.toISOString(),
    name: err?.name ?? typeof error,
    message: scrub(err?.message ?? String(error)),
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    route: context?.routePath ?? null,
    kind: context?.routeType ?? null,
  };
}

/**
 * Whether to send an alert for this report: at most one per distinct error
 * every five minutes, so a failing page does not become a thousand alerts.
 */
export function createAlertThrottle(windowMs = 5 * 60_000) {
  const last = new Map<string, number>();
  return (report: ErrorReport, nowMs = Date.now()): boolean => {
    const key = report.digest ?? `${report.route}:${report.name}:${report.message}`;
    const previous = last.get(key);
    if (previous !== undefined && nowMs - previous < windowMs) return false;
    last.set(key, nowMs);
    if (last.size > 500) last.delete(last.keys().next().value!);
    return true;
  };
}
