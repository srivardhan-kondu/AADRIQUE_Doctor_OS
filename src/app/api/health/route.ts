import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Spec §31 — for an uptime monitor (UptimeRobot, Better Stack, a load
 * balancer). 200 when the app can reach its database, 503 when it cannot.
 * Says nothing else, and needs no sign-in.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "ok", latencyMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
