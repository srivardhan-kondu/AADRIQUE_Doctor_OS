import "server-only";
import type {
  IntegrationCategory,
  IntegrationStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  CATEGORY_LABEL,
  adapterFor,
  redactConfig,
  type IntegrationContext,
} from "@/lib/integrations";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { invalidState, notFound } from "./errors";

/**
 * Spec §29 — integrations, as the admin sees them.
 *
 * The service owns the status vocabulary the spec names — Connected, Needs
 * Attention, Disconnected, Not Configured — and it is *derived* from what the
 * adapter reports rather than typed in by hand. A row that says "Connected"
 * while its last health check failed would be worse than no status at all.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface IntegrationRow {
  id: string;
  category: IntegrationCategory;
  categoryLabel: string;
  provider: string;
  name: string;
  status: IntegrationStatus;
  /** Non-secret settings, with anything secret-shaped already redacted. */
  settings: { key: string; value: string }[];
  hasCredential: boolean;
  configured: boolean;
  lastHealthCheckAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
}

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  CONNECTED: "Connected",
  NEEDS_ATTENTION: "Needs attention",
  DISCONNECTED: "Disconnected",
  NOT_CONFIGURED: "Not configured",
};

export async function listIntegrations(
  actor: RequestActor,
): Promise<{
  rows: IntegrationRow[];
  counts: Record<IntegrationStatus, number>;
}> {
  assertPermission(actor, Permission.INTEGRATION_MANAGE);

  const integrations = await prisma.integration.findMany({
    where: tenantScope(actor),
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const counts: Record<IntegrationStatus, number> = {
    CONNECTED: 0,
    NEEDS_ATTENTION: 0,
    DISCONNECTED: 0,
    NOT_CONFIGURED: 0,
  };

  const rows = integrations.map((integration) => {
    counts[integration.status] += 1;

    const config = asConfig(integration.config);
    const adapter = adapterFor(integration.category, integration.provider);

    return {
      id: integration.id,
      category: integration.category,
      categoryLabel: CATEGORY_LABEL[integration.category],
      provider: integration.provider,
      name: integration.name,
      status: integration.status,
      settings: redactConfig(config),
      hasCredential: Boolean(integration.credentialRef),
      configured: adapter
        ? adapter.requiredConfig.every((key) => config[key] !== undefined) &&
          (!adapter.requiresCredential || Boolean(integration.credentialRef))
        : false,
      lastHealthCheckAt: integration.lastHealthCheckAt,
      lastSyncAt: integration.lastSyncAt,
      lastError: integration.lastError,
    };
  });

  return { rows, counts };
}

async function load(actor: RequestActor, integrationId: string) {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, ...tenantScope(actor) },
  });
  if (!integration) throw notFound("Integration");
  return integration;
}

function asConfig(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function contextFor(integration: {
  config: unknown;
  credentialRef: string | null;
}): IntegrationContext {
  return {
    config: asConfig(integration.config),
    credentialRef: integration.credentialRef,
  };
}

export interface CheckResult {
  name: string;
  status: IntegrationStatus;
  detail: string;
}

/**
 * Spec §29 — run the adapter's health check and record what it said.
 *
 * The stored status is derived here and nowhere else: healthy becomes
 * Connected, unhealthy becomes Needs Attention, and an integration that was
 * never configured stays Not Configured rather than being marked broken.
 */
export async function checkIntegration(
  actor: RequestActor,
  integrationId: string,
): Promise<CheckResult> {
  assertPermission(actor, Permission.INTEGRATION_MANAGE);

  const integration = await load(actor, integrationId);
  const adapter = adapterFor(integration.category, integration.provider);

  if (!adapter) {
    throw invalidState(
      `No adapter is installed for ${CATEGORY_LABEL[integration.category]}.`,
      "This category cannot be connected in this build.",
    );
  }

  const result = await adapter.healthCheck(contextFor(integration));

  const status: IntegrationStatus = result.healthy
    ? "CONNECTED"
    : integration.credentialRef || adapter.requiredConfig.length === 0
      ? "NEEDS_ATTENTION"
      : "NOT_CONFIGURED";

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: {
        status,
        lastHealthCheckAt: new Date(),
        lastError: result.healthy ? null : result.detail,
      },
    });

    await writeAudit(tx, actor, {
      action: "INTEGRATION_CHANGED",
      entityType: "Integration",
      entityId: integration.id,
      summary: `Checked ${integration.name} · ${STATUS_LABEL[status]}`,
      metadata: { category: integration.category, status },
    });
  }, TX_OPTIONS);

  return { name: integration.name, status, detail: result.detail };
}

/** Spec §29 — pull or push whatever this category exchanges. */
export async function syncIntegration(
  actor: RequestActor,
  integrationId: string,
): Promise<{ name: string; processed: number; detail: string }> {
  assertPermission(actor, Permission.INTEGRATION_MANAGE);

  const integration = await load(actor, integrationId);
  const adapter = adapterFor(integration.category, integration.provider);

  if (!adapter) {
    throw invalidState(
      `No adapter is installed for ${CATEGORY_LABEL[integration.category]}.`,
    );
  }

  if (integration.status === "NOT_CONFIGURED") {
    throw invalidState(
      `${integration.name} has not been configured.`,
      "Add its settings and credential before syncing.",
    );
  }

  try {
    const result = await adapter.sync(contextFor(integration));

    await prisma.$transaction(async (tx) => {
      await tx.integration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date(), lastError: null },
      });

      await writeAudit(tx, actor, {
        action: "INTEGRATION_CHANGED",
        entityType: "Integration",
        entityId: integration.id,
        summary: `Synced ${integration.name} · ${result.processed} records`,
        metadata: { category: integration.category, processed: result.processed },
      });
    }, TX_OPTIONS);

    return { name: integration.name, ...result };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Sync failed";

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: "NEEDS_ATTENTION", lastError: detail },
    });

    throw invalidState(`${integration.name} could not sync.`, detail);
  }
}

/** Spec §29 — take an integration out of service without deleting it. */
export async function setIntegrationConnected(
  actor: RequestActor,
  integrationId: string,
  connected: boolean,
): Promise<CheckResult> {
  assertPermission(actor, Permission.INTEGRATION_MANAGE);

  if (connected) return checkIntegration(actor, integrationId);

  const integration = await load(actor, integrationId);

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: {
        status: "DISCONNECTED",
        lastError: "Disconnected by an administrator.",
      },
    });

    await writeAudit(tx, actor, {
      action: "INTEGRATION_CHANGED",
      entityType: "Integration",
      entityId: integration.id,
      summary: `Disconnected ${integration.name}`,
      metadata: { category: integration.category },
    });
  }, TX_OPTIONS);

  return {
    name: integration.name,
    status: "DISCONNECTED",
    detail: "Disconnected by an administrator.",
  };
}
