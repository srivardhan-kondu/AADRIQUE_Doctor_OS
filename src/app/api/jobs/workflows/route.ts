import { NextResponse } from "next/server";
import { runHousekeeping } from "@/server/services/housekeeping";
import { processDueRuns } from "@/server/services/workflows";

/**
 * Spec §28 — the job runner that resumes waiting workflows.
 *
 * A workflow that waits 24 hours needs something to wake it. This endpoint is
 * that something, called by whatever scheduler the deployment uses.
 *
 * Spec §31 — it is not open to the internet. `CRON_SECRET` must be set and
 * presented as a bearer token; with no secret configured the endpoint refuses
 * to run at all rather than defaulting to open. The comparison is
 * length-padded and constant-time so a wrong token leaks nothing by timing.
 */

export const dynamic = "force-dynamic";

/**
 * GET as well as POST: Vercel Cron calls with GET and the same bearer token.
 * Any other scheduler (cron + curl, GitHub Actions, a cloud scheduler) can
 * POST. Both are refused without CRON_SECRET.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return POST(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      {
        error: "not_configured",
        detail:
          "Set CRON_SECRET before calling this endpoint. It will not run unauthenticated.",
      },
      { status: 503 },
    );
  }

  const presented = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (!presented || !timingSafeEqual(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueRuns();

    // Housekeeping rides on the same schedule.
    const cleared = await runHousekeeping();

    return NextResponse.json({ ok: true, ...result, cleared });
  } catch (error) {
    console.error("Workflow job failed", error);
    return NextResponse.json({ error: "job_failed" }, { status: 500 });
  }
}

/** Constant-time compare that does not leak length through early exit. */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;

  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return mismatch === 0;
}
