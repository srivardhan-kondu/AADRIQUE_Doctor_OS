import { NextResponse, type NextRequest } from "next/server";
import { verifySvixSignature } from "@/lib/security/webhook-signatures";
import { applyDeliveryStatus } from "@/server/services/delivery";

/**
 * Spec §14 — email delivery events from Resend, believed only with a valid
 * Svix signature under RESEND_WEBHOOK_SECRET. Refuses when that is unset.
 */

export const dynamic = "force-dynamic";

const EVENTS = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "READ",
  "email.bounced": "FAILED",
  "email.complained": "FAILED",
} as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const raw = await request.text();
  const verified = verifySvixSignature(
    raw,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
  if (!verified) return NextResponse.json({ error: "bad_signature" }, { status: 401 });

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const status = EVENTS[event.type as keyof typeof EVENTS];
  const ref = event.data?.email_id;
  if (!status || !ref) return NextResponse.json({ applied: 0 });

  const applied = await applyDeliveryStatus({
    providerName: "resend",
    providerRef: ref,
    status,
    at: event.created_at ? new Date(event.created_at) : new Date(),
    reason:
      event.type === "email.bounced"
        ? "The email bounced."
        : event.type === "email.complained"
          ? "The recipient marked the email as spam."
          : null,
  });
  return NextResponse.json({ applied: applied ? 1 : 0 });
}
