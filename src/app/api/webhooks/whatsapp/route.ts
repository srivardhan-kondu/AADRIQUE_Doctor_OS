import { NextResponse, type NextRequest } from "next/server";
import { verifyMetaSignature } from "@/lib/security/webhook-signatures";
import {
  applyDeliveryStatus,
  recordInboundWhatsApp,
} from "@/server/services/delivery";

/**
 * Spec §14 — WhatsApp delivery receipts and patient replies, from Meta.
 *
 * GET is Meta's one-time subscription check (WHATSAPP_VERIFY_TOKEN). POST
 * carries events, believed only with a valid X-Hub-Signature-256 under
 * WHATSAPP_APP_SECRET. With either unset the endpoint refuses — it never
 * runs open (spec §31).
 */

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expected) return new NextResponse("Not configured", { status: 503 });

  const params = request.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

const STATUS = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
} as const;

interface MetaChange {
  value?: {
    metadata?: { phone_number_id?: string };
    statuses?: Array<{
      id?: string;
      status?: string;
      timestamp?: string;
      errors?: Array<{ title?: string; message?: string }>;
    }>;
    messages?: Array<{
      id?: string;
      from?: string;
      timestamp?: string;
      type?: string;
      text?: { body?: string };
    }>;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: { entry?: Array<{ changes?: MetaChange[] }> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  let applied = 0;
  for (const change of (payload.entry ?? []).flatMap((e) => e.changes ?? [])) {
    const value = change.value;
    if (!value) continue;

    for (const status of value.statuses ?? []) {
      const next = STATUS[status.status as keyof typeof STATUS];
      if (!status.id || !next) continue;
      const at = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
      const reason = status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? null;
      if (await applyDeliveryStatus({ providerName: "meta-cloud-api", providerRef: status.id, status: next, at, reason })) {
        applied += 1;
      }
    }

    const phoneNumberId = value.metadata?.phone_number_id;
    for (const message of value.messages ?? []) {
      if (!phoneNumberId || !message.id || !message.from) continue;
      const body =
        message.type === "text" && message.text?.body
          ? message.text.body
          : `[${message.type ?? "message"} received on WhatsApp]`;
      const at = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
      const outcome = await recordInboundWhatsApp({
        phoneNumberId,
        from: message.from,
        body,
        providerRef: message.id,
        at,
      });
      if (outcome === "stored") applied += 1;
    }
  }

  // Always 200 once verified: Meta retries anything else, and an event for a
  // message we do not know will not become known by retrying.
  return NextResponse.json({ applied });
}
