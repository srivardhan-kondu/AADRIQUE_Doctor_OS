import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { getActor } from "@/server/context";
import { getQueueSignal } from "@/server/services/live";

/**
 * The signal queue screens poll (see `getQueueSignal`).
 *
 * Authorized like any page: the actor comes from the session, and the signal
 * is computed inside their organization. A doctor id from another tenant
 * matches nothing and returns an empty signal, not an error that would
 * confirm it exists.
 */

export const dynamic = "force-dynamic";

const doctorSchema = z.string().min(1).max(64).nullable();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = doctorSchema.safeParse(
    request.nextUrl.searchParams.get("doctor"),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_doctor" }, { status: 400 });
  }

  try {
    const signal = await getQueueSignal(actor, parsed.data);
    return NextResponse.json(
      { signal },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}
