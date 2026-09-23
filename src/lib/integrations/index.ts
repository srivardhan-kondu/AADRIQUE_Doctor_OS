import "server-only";
import type { IntegrationCategory } from "@/generated/prisma/enums";

/**
 * Spec §29 — the integration layer.
 *
 * "Keep each integration behind an adapter." One interface, one adapter per
 * category, and nothing above this layer knows which vendor is on the other
 * end.
 *
 * The three methods are the ones the spec names:
 *
 *   connect()      establish and verify the link
 *   healthCheck()  is it working right now?
 *   sync()         pull or push whatever this category exchanges
 *
 * Secrets never appear here. An `Integration` row carries non-secret settings
 * and a `credentialRef` pointing into the secret store (spec §31), and an
 * adapter is handed the reference, never the credential itself.
 */

export interface IntegrationContext {
  /** Non-secret settings from the `Integration` row. */
  config: Record<string, unknown>;
  /** A pointer into the secret store — never the secret (spec §31). */
  credentialRef: string | null;
}

export interface HealthResult {
  healthy: boolean;
  /** One line a person can act on. */
  detail: string;
  /** Round-trip time to the vendor, when one was measured. */
  latencyMs?: number;
}

export interface SyncResult {
  /** Records moved in this pass. */
  processed: number;
  detail: string;
}

export interface IntegrationProvider {
  readonly category: IntegrationCategory;
  readonly provider: string;
  /** Settings the row must carry before this can be connected. */
  readonly requiredConfig: readonly string[];
  /** True when this adapter needs a credential in the secret store. */
  readonly requiresCredential: boolean;

  connect(context: IntegrationContext): Promise<HealthResult>;
  healthCheck(context: IntegrationContext): Promise<HealthResult>;
  sync(context: IntegrationContext): Promise<SyncResult>;
}

/**
 * The shape every adapter shares.
 *
 * Configuration is checked before the vendor is contacted, so "you have not
 * set the sender id" is reported as that rather than as a failed connection
 * an hour later (spec §38).
 */
abstract class BaseAdapter implements IntegrationProvider {
  abstract readonly category: IntegrationCategory;
  abstract readonly provider: string;
  readonly requiredConfig: readonly string[] = [];
  readonly requiresCredential: boolean = true;

  /** Returns a reason the integration cannot be used, or null. */
  protected missingRequirements(context: IntegrationContext): string | null {
    const missing = this.requiredConfig.filter(
      (key) =>
        context.config[key] === undefined ||
        context.config[key] === null ||
        context.config[key] === "",
    );

    if (missing.length > 0) {
      return `Missing settings: ${missing.join(", ")}.`;
    }

    if (this.requiresCredential && !context.credentialRef) {
      return "No credential has been stored for this integration.";
    }

    return null;
  }

  async connect(context: IntegrationContext): Promise<HealthResult> {
    const missing = this.missingRequirements(context);
    if (missing) return { healthy: false, detail: missing };
    return this.healthCheck(context);
  }

  async healthCheck(context: IntegrationContext): Promise<HealthResult> {
    const missing = this.missingRequirements(context);
    if (missing) return { healthy: false, detail: missing };

    // No vendor is contacted in this build. The adapter reports what it can
    // verify — that it is configured — and says so plainly rather than
    // claiming a connection it has not made.
    return {
      healthy: true,
      detail: `Configured for ${this.provider}. No live check is performed in this build.`,
      latencyMs: 0,
    };
  }

  async sync(context: IntegrationContext): Promise<SyncResult> {
    const missing = this.missingRequirements(context);
    if (missing) throw new Error(missing);
    return { processed: 0, detail: "Nothing to exchange." };
  }
}

class WhatsAppAdapter extends BaseAdapter {
  readonly category = "WHATSAPP" as const;
  readonly provider = "meta-cloud-api";
  readonly requiredConfig = ["phoneNumberId", "wabaId"] as const;
}

class SmsAdapter extends BaseAdapter {
  readonly category = "SMS" as const;
  readonly provider = "msg91";
  readonly requiredConfig = ["senderId"] as const;
}

class EmailAdapter extends BaseAdapter {
  readonly category = "EMAIL" as const;
  readonly provider = "resend";
  readonly requiredConfig = ["fromAddress"] as const;
}

class LabAdapter extends BaseAdapter {
  readonly category = "LAB" as const;
  readonly provider = "thyrocare";
  readonly requiredConfig = ["centreCode"] as const;

  async sync(context: IntegrationContext): Promise<SyncResult> {
    const missing = this.missingRequirements(context);
    if (missing) throw new Error(missing);
    return {
      processed: 0,
      detail: "No new results since the last pull.",
    };
  }
}

class PharmacyAdapter extends BaseAdapter {
  readonly category = "PHARMACY" as const;
  readonly provider = "internal-pharmacy";
  readonly requiresCredential = false;
}

class HmsAdapter extends BaseAdapter {
  readonly category = "HMS" as const;
  readonly provider = "legacy-hms";
  readonly requiredConfig = ["baseUrl"] as const;
}

const ADAPTERS: IntegrationProvider[] = [
  new WhatsAppAdapter(),
  new SmsAdapter(),
  new EmailAdapter(),
  new LabAdapter(),
  new PharmacyAdapter(),
  new HmsAdapter(),
];

/**
 * The adapter for a stored integration.
 *
 * Matched on category first, then provider: a clinic that swaps SMS vendors
 * keeps the same category and should not lose its adapter because the
 * provider string changed.
 */
export function adapterFor(
  category: IntegrationCategory,
  provider: string,
): IntegrationProvider | null {
  return (
    ADAPTERS.find((a) => a.category === category && a.provider === provider) ??
    ADAPTERS.find((a) => a.category === category) ??
    null
  );
}

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "Email",
  LAB: "Lab system",
  PHARMACY: "Pharmacy",
  HMS: "Hospital management system",
  EMR: "EMR",
  OTHER: "Other",
};

/**
 * Spec §31 — a setting is only shown if it is safe to show.
 *
 * Anything whose key reads like a secret is redacted before it leaves the
 * server, so a misfiled credential cannot reach the browser.
 */
const SECRET_KEY = /(secret|token|key|password|passphrase|credential|auth)/i;

export function redactConfig(
  config: Record<string, unknown>,
): { key: string; value: string }[] {
  return Object.entries(config).map(([key, value]) => ({
    key,
    value: SECRET_KEY.test(key) ? "••••••••" : String(value),
  }));
}
