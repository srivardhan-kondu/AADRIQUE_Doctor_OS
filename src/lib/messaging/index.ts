import type { MessageChannel } from "@/generated/prisma/enums";

/**
 * Spec §14 + §29 — the communication engine.
 *
 * One interface in front of WhatsApp, SMS and email. Feature code asks for a
 * message to go to a patient; which vendor carries it, and whether that vendor
 * is configured at all, is decided here.
 *
 * The same rule as the AI layer (AGENTS.md): no provider SDK is imported from
 * a component, a route handler or a service. They talk to `dispatch`.
 *
 * No real transport is connected yet: every channel resolves to the simulated
 * provider, which behaves like a gateway without contacting one. A real one
 * (Meta Cloud API, MSG91, Resend) implements `MessagingProvider` and replaces
 * its entry in `PROVIDERS`, with its credentials read from the secret store
 * named by the channel's `Integration` record — nothing else changes.
 */

export interface OutboundMessage {
  channel: MessageChannel;
  /** Mobile number for WhatsApp/SMS, address for email. */
  to: string;
  subject: string | null;
  body: string;
  /** Required by WhatsApp for templated sends outside the 24h window. */
  providerTemplateId?: string | null;
}

export interface DeliveryReceipt {
  providerName: string;
  /** The vendor's id for the message, used to reconcile delivery webhooks. */
  providerRef: string | null;
  /**
   * What the gateway accepted. Anything past `SENT` (delivered, read) arrives
   * later on a webhook, so a provider never returns it here.
   */
  status: "QUEUED" | "SENT" | "FAILED";
  failureReason?: string;
}

export interface MessagingProvider {
  readonly name: string;
  readonly channel: MessageChannel;
  send(message: OutboundMessage): Promise<DeliveryReceipt>;
}

/** Thrown when a message cannot even be attempted. */
export class MessagingError extends Error {
  constructor(message: string, readonly action?: string) {
    super(message);
    this.name = "MessagingError";
  }
}

/**
 * The stand-in gateway.
 *
 * It validates the address the way a real provider would and returns a
 * provider reference, so the delivery pipeline — queued → sent → delivered →
 * read — is exercised end to end without a vendor account. It never invents a
 * delivery: the message stops at SENT, exactly where a real send would.
 */
class SimulatedProvider implements MessagingProvider {
  constructor(readonly channel: MessageChannel, readonly name: string) {}

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    const invalid = validateAddress(message.channel, message.to);
    if (invalid) {
      return {
        providerName: this.name,
        providerRef: null,
        status: "FAILED",
        failureReason: invalid,
      };
    }

    return {
      providerName: this.name,
      providerRef: `sim_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      status: "SENT",
    };
  }
}

/** The vendor each channel would use in production, named honestly. */
const PROVIDERS: Record<MessageChannel, MessagingProvider> = {
  WHATSAPP: new SimulatedProvider("WHATSAPP", "meta-cloud-api"),
  SMS: new SimulatedProvider("SMS", "msg91"),
  EMAIL: new SimulatedProvider("EMAIL", "resend"),
};

export function providerFor(channel: MessageChannel): MessagingProvider {
  return PROVIDERS[channel];
}

/** Hands the message to the channel's provider. */
export async function dispatch(
  message: OutboundMessage,
): Promise<DeliveryReceipt> {
  return providerFor(message.channel).send(message);
}

/** Returns a reason the address cannot be used, or null when it is fine. */
export function validateAddress(
  channel: MessageChannel,
  to: string,
): string | null {
  const value = to.trim();
  if (!value) return "No contact detail on file";

  if (channel === "EMAIL") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? null
      : "Email address is not valid";
  }

  // Indian mobile numbers, with or without the country code (spec §39).
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 10) return "Mobile number is too short";
  if (digits.length > 13) return "Mobile number is not valid";
  return null;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Placeholders a template body still expects. */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/**
 * Fills `{{name}}` placeholders.
 *
 * A value that is missing is left as its placeholder rather than replaced with
 * an empty string, so an unfinished message is obvious in the preview instead
 * of reaching a patient with a hole in it.
 */
export function renderTemplate(
  body: string,
  variables: Record<string, string | null | undefined>,
): string {
  return body.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables[name];
    return value == null || value === "" ? match : value;
  });
}

/** Spec §14 — a patient's per-channel consent. */
export interface ChannelConsent {
  whatsappOptIn: boolean;
  smsOptIn: boolean;
  emailOptIn: boolean;
}

export function hasConsent(
  patient: ChannelConsent,
  channel: MessageChannel,
): boolean {
  if (channel === "WHATSAPP") return patient.whatsappOptIn;
  if (channel === "SMS") return patient.smsOptIn;
  return patient.emailOptIn;
}

export const CHANNEL_LABEL: Record<MessageChannel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
};
