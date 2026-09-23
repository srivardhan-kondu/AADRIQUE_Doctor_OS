import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { PermissionError } from "@/lib/permissions";
import { getActor } from "@/server/context";
import { exportPatientDirectory } from "@/server/services/patients";

/**
 * Spec §30 — "export under audited access". The export is logged by the
 * service before a byte of it is returned.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const { header, rows } = await exportPatientDirectory(actor);
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(toCsv(header, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="patients-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}
