import type { MessageChannel } from "@/generated/prisma/enums";
import type {
  DeliveryReceipt,
  MessagingProvider,
  OutboundMessage,
} from "./index";

/**
 * Spec §14 + §29 — the real gateways.
 *
 * Each talks to its vendor's HTTP API directly with `fetch` — no SDK — and
 * turns the vendor's answer into a `DeliveryReceipt`. Nothing here decides
 * whether to send; by the time a message arrives, consent, the address and
 * every placeholder have been checked by the communication service.
 *
 * Failures are reported, never thrown: a timeout or a refusal becomes a
 * FAILED receipt with a reason a person can act on, and the message row keeps
 * it for a retry. A credential never appears in a reason.
 */

type Fetch = typeof fetch;

const TIMEOUT_MS = 10_000;

/** Indian mobile numbers as the vendors want them: country code, digits only. */
export function e164India(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

async function post(
  fetchImpl: Fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> } | { error: string }> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, json };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return { error: timedOut ? "timed out" : "could not be reached" };
  }
}

function failed(providerName: string, reason: string): DeliveryReceipt {
  return { providerName, providerRef: null, status: "FAILED", failureReason: reason };
}

/* ------------------------------------------------------------------------ */

/**
 * WhatsApp through Meta's Cloud API.
 *
 * With an approved template id the message is sent as that template, its
 * variables as body parameters in order — required outside the 24-hour
 * window after the patient last wrote. Without one it is sent as text, which
 * Meta accepts only inside that window.
 */
export class WhatsAppCloudProvider implements MessagingProvider {
  readonly name = "meta-cloud-api";
  readonly channel: MessageChannel = "WHATSAPP";

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly apiVersion = "v21.0",
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    const to = e164India(message.to);
    const payload = message.providerTemplateId
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: message.providerTemplateId,
            language: { code: message.language ?? "en" },
            components: message.templateParameters?.length
              ? [
                  {
                    type: "body",
                    parameters: message.templateParameters.map((p) => ({
                      type: "text",
                      text: p.value,
                    })),
                  },
                ]
              : [],
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: message.body },
        };

    const result = await post(
      this.fetchImpl,
      `https://graph.facebook.com/${this.apiVersion}/${encodeURIComponent(this.phoneNumberId)}/messages`,
      { Authorization: `Bearer ${this.accessToken}` },
      payload,
    );

    if ("error" in result) return failed(this.name, `WhatsApp ${result.error}.`);

    const id = (result.json.messages as Array<{ id?: string }> | undefined)?.[0]?.id;
    if (result.status < 300 && id) {
      return { providerName: this.name, providerRef: id, status: "SENT" };
    }

    const error = result.json.error as { message?: string; code?: number } | undefined;
    return failed(
      this.name,
      error?.code === 131047
        ? "More than 24 hours since the patient last wrote — send an approved template."
        : `WhatsApp refused the message${error?.message ? `: ${error.message}` : ` (${result.status}).`}`,
    );
  }
}

/**
 * SMS through MSG91's Flow API.
 *
 * Indian regulation (TRAI DLT) allows only pre-registered templates, so an
 * SMS needs the template's DLT flow id; free text cannot be sent. Variables
 * travel by name, matching the placeholders registered with the flow.
 */
export class Msg91Provider implements MessagingProvider {
  readonly name = "msg91";
  readonly channel: MessageChannel = "SMS";

  constructor(
    private readonly authKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    if (!message.providerTemplateId) {
      return failed(
        this.name,
        "SMS needs a DLT-approved template. Add its MSG91 flow id to the template.",
      );
    }

    const recipient: Record<string, string> = { mobiles: e164India(message.to) };
    for (const p of message.templateParameters ?? []) recipient[p.name] = p.value;

    const result = await post(
      this.fetchImpl,
      "https://control.msg91.com/api/v5/flow/",
      { authkey: this.authKey },
      { template_id: message.providerTemplateId, short_url: "0", recipients: [recipient] },
    );

    if ("error" in result) return failed(this.name, `MSG91 ${result.error}.`);

    if (result.status < 300 && result.json.type === "success") {
      const ref = typeof result.json.message === "string" ? result.json.message : null;
      return { providerName: this.name, providerRef: ref, status: "SENT" };
    }

    const reason = typeof result.json.message === "string" ? result.json.message : `status ${result.status}`;
    return failed(this.name, `MSG91 refused the SMS: ${reason}.`);
  }
}

/** Email through Resend. */
export class ResendProvider implements MessagingProvider {
  readonly name = "resend";
  readonly channel: MessageChannel = "EMAIL";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    const result = await post(
      this.fetchImpl,
      "https://api.resend.com/emails",
      { Authorization: `Bearer ${this.apiKey}` },
      {
        from: this.from,
        to: [message.to],
        subject: message.subject ?? "A message from your clinic",
        text: message.body,
      },
    );

    if ("error" in result) return failed(this.name, `Email service ${result.error}.`);

    if (result.status < 300 && typeof result.json.id === "string") {
      return { providerName: this.name, providerRef: result.json.id, status: "SENT" };
    }

    const reason = typeof result.json.message === "string" ? result.json.message : `status ${result.status}`;
    return failed(this.name, `The email service refused the message: ${reason}.`);
  }
}
