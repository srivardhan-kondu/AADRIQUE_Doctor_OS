import { NextResponse } from "next/server";
import { z } from "zod";
import { PermissionError } from "@/lib/permissions";
import { getActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";
import { readDocument } from "@/server/services/documents";

/**
 * Spec §6 + §31 — opens an uploaded document.
 *
 * Authorized like a page: the actor comes from the session, the file must be
 * in their organization, and each opening is audited. The content type is
 * the one sniffed at upload, never the uploader's claim, and the response
 * is kept out of every cache.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = z.string().min(1).max(64).safeParse((await params).attachmentId);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const file = await readDocument(actor, id.data);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
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
