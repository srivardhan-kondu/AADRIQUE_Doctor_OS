/**
 * The clinic's time zone, applied to the server process.
 *
 * "Today", slot times and every date the server formats are the server's
 * local time. Vercel reserves the `TZ` variable and runs functions in UTC, so
 * setting it in the dashboard is not possible — and a UTC server puts an
 * Indian clinic's 8:00 appointments at 02:30, strikes out every slot of a day
 * that has not happened yet, and calls tomorrow "today" after 18:30 UTC.
 *
 * Node re-reads the zone whenever `process.env.TZ` is assigned, so setting it
 * here — before the first request is served — fixes all of that at once.
 * `CLINIC_TIME_ZONE` overrides the default for a clinic elsewhere.
 */
export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || "Asia/Kolkata";

export function applyClinicTimeZone(): void {
  if (typeof process === "undefined" || !process.env) return;
  if (process.env.TZ !== CLINIC_TIME_ZONE) process.env.TZ = CLINIC_TIME_ZONE;
}

applyClinicTimeZone();
