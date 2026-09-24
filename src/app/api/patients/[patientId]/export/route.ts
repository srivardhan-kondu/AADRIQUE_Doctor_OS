import { NextResponse } from "next/server";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { getActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { exportPatientData } from "@/server/services/patient-data";

/**
 * DPDP Act 2023 — a patient's copy of their data, downloaded by the clinic's
 * admin to hand over. Admin only, same organization only, and audited.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<Response> {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const id = z.string().min(1).max(64).safeParse((await params).patientId);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const data = await exportPatientData(actor, id.data);
    const mrn = String(data.patient.mrn).replace(/[^\w-]/g, "");
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="patient-${mrn}-data.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PermissionError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (error instanceof ServiceError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw error;
  }
}
