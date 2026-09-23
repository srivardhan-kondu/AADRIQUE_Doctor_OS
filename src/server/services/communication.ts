import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type {
  MessageCategory,
  MessageChannel,
  MessageStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  CHANNEL_LABEL,
  type GatewayRoute,
  dispatch,
  hasConsent,
  placeholdersIn,
  renderTemplate,
  validateAddress,
} from "@/lib/messaging";
import { Permission, assertPermission, tenantScope } from "@/lib/permissions";
import { resolveSecret } from "@/lib/secrets";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §14 — the communication centre.
 *
 * One inbox across WhatsApp, SMS and email. The service owns the whole
 * lifecycle of a message: consent, address, rendering, the provider call and
 * the delivery record. The provider itself is behind `@/lib/messaging`.
 *
 * A send is deliberately *not* one transaction. The row is written first, the
 * gateway is called outside any transaction — a network call must never hold
 * one open — and the receipt is written back. A crash mid-send therefore
 * leaves a PENDING message that can be retried, never a silent loss.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/** Statuses that mean the gateway accepted the message. */
const ACCEPTED: readonly MessageStatus[] = ["SENT", "DELIVERED", "READ"];

export interface ThreadRow {
  patientId: string;
  patientName: string;
  patientMrn: string;
  phone: string;
  /** Channels this patient has agreed to be contacted on. */
  channels: MessageChannel[];
  lastMessageAt: Date;
  lastChannel: MessageChannel;
  lastBody: string;
  lastStatus: MessageStatus;
  lastDirection: "OUTBOUND" | "INBOUND";
  messageCount: number;
  failedCount: number;
  unreadInbound: number;
}

export interface InboxFilters {
  channel?: MessageChannel;
  status?: MessageStatus;
  /** Only threads with something that needs attention. */
  failedOnly?: boolean;
  query?: string;
}

export interface Inbox {
  threads: ThreadRow[];
  counts: {
    total: number;
    failed: number;
    pending: number;
    delivered: number;
    read: number;
  };
  /** Spec §16 — delivery rate across the window shown; null with nothing sent. */
  deliveryRate: number | null;
  byChannel: {
    channel: MessageChannel;
    label: string;
    sent: number;
    delivered: number;
    failed: number;
    rate: number | null;
  }[];
}

/**
 * Spec §14 — the unified inbox.
 *
 * Grouped by patient rather than by message: a doctor thinks "what have we
 * said to this person", not "list of 400 sends".
 */
export async function getInbox(
  actor: RequestActor,
  filters: InboxFilters = {},
  limit = 40,
): Promise<Inbox> {
  assertPermission(actor, Permission.COMMUNICATION_READ);

  const query = filters.query?.trim();

  const where: Prisma.MessageWhereInput = {
    ...tenantScope(actor),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.failedOnly
      ? { status: "FAILED" }
      : filters.status
        ? { status: filters.status }
        : {}),
    ...(query
      ? {
          patient: {
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { mrn: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
            ],
          },
        }
      : {}),
  };

  // The window every count on this screen is measured over.
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [messages, statusCounts, channelCounts] = await Promise.all([
    prisma.message.findMany({
      where: { ...where, patientId: { not: null } },
      orderBy: { createdAt: "desc" },
      // Enough recent traffic to build the thread list from, bounded so the
      // screen cannot be made to load the whole table.
      take: 600,
      select: {
        id: true,
        channel: true,
        status: true,
        direction: true,
        body: true,
        createdAt: true,
        readAt: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            phone: true,
            whatsappOptIn: true,
            smsOptIn: true,
            emailOptIn: true,
          },
        },
      },
    }),
    prisma.message.groupBy({
      by: ["status"],
      where: { ...tenantScope(actor), createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["channel", "status"],
      where: { ...tenantScope(actor), createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const byStatus = (status: MessageStatus) =>
    statusCounts.find((c) => c.status === status)?._count._all ?? 0;

  const total = statusCounts.reduce((sum, c) => sum + c._count._all, 0);
  const delivered = byStatus("DELIVERED");
  const read = byStatus("READ");
  const failed = byStatus("FAILED");
  const pending = byStatus("PENDING") + byStatus("QUEUED");

  // Collapse to one row per patient, newest first — the list is already in
  // descending order, so the first message seen for a patient is their latest.
  const threads = new Map<string, ThreadRow>();

  for (const message of messages) {
    const patient = message.patient;
    if (!patient) continue;

    const existing = threads.get(patient.id);

    if (existing) {
      existing.messageCount += 1;
      if (message.status === "FAILED") existing.failedCount += 1;
      if (message.direction === "INBOUND" && !message.readAt) {
        existing.unreadInbound += 1;
      }
      continue;
    }

    const channels: MessageChannel[] = [];
    if (patient.whatsappOptIn) channels.push("WHATSAPP");
    if (patient.smsOptIn) channels.push("SMS");
    if (patient.emailOptIn) channels.push("EMAIL");

    threads.set(patient.id, {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
      patientMrn: patient.mrn,
      phone: patient.phone,
      channels,
      lastMessageAt: message.createdAt,
      lastChannel: message.channel,
      lastBody: message.body,
      lastStatus: message.status,
      lastDirection: message.direction,
      messageCount: 1,
      failedCount: message.status === "FAILED" ? 1 : 0,
      unreadInbound:
        message.direction === "INBOUND" && !message.readAt ? 1 : 0,
    });
  }

  const channelRows = (["WHATSAPP", "SMS", "EMAIL"] as const).map((channel) => {
    const rows = channelCounts.filter((c) => c.channel === channel);
    const count = (status: MessageStatus) =>
      rows.find((r) => r.status === status)?._count._all ?? 0;

    const channelDelivered = count("DELIVERED") + count("READ");
    const channelSent = count("SENT") + channelDelivered;
    const channelFailed = count("FAILED");
    const attempted = channelSent + channelFailed;

    return {
      channel,
      label: CHANNEL_LABEL[channel],
      sent: channelSent,
      delivered: channelDelivered,
      failed: channelFailed,
      rate: attempted ? Math.round((channelDelivered / attempted) * 100) : null,
    };
  });

  const attempted = delivered + read + byStatus("SENT") + failed;

  return {
    threads: [...threads.values()].slice(0, limit),
    counts: { total, failed, pending, delivered, read },
    deliveryRate: attempted
      ? Math.round(((delivered + read) / attempted) * 100)
      : null,
    byChannel: channelRows,
  };
}

export interface ThreadMessage {
  id: string;
  channel: MessageChannel;
  direction: "OUTBOUND" | "INBOUND";
  category: MessageCategory;
  status: MessageStatus;
  subject: string | null;
  body: string;
  toAddress: string;
  templateName: string | null;
  failureReason: string | null;
  attemptCount: number;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  sentByName: string | null;
}

export interface PatientThread {
  patient: {
    id: string;
    name: string;
    mrn: string;
    phone: string;
    email: string | null;
    whatsappOptIn: boolean;
    smsOptIn: boolean;
    emailOptIn: boolean;
    preferredLanguage: string;
  };
  messages: ThreadMessage[];
}

/** Spec §14 — the communication timeline for one patient. */
export async function getPatientThread(
  actor: RequestActor,
  patientId: string,
): Promise<PatientThread> {
  assertPermission(actor, Permission.COMMUNICATION_READ);

  const [patient, newestFirst] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, ...tenantScope(actor) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mrn: true,
        phone: true,
        email: true,
        whatsappOptIn: true,
        smsOptIn: true,
        emailOptIn: true,
        preferredLanguage: true,
      },
    }),
    // Tenant-scoped on its own, so it need not wait for the patient lookup.
    // The newest 200, not the oldest: a long history must never hide the
    // message that just arrived.
    prisma.message.findMany({
      where: { patientId, ...tenantScope(actor) },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        channel: true,
        direction: true,
        category: true,
        status: true,
        subject: true,
        body: true,
        toAddress: true,
        failureReason: true,
        attemptCount: true,
        createdAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        template: { select: { name: true } },
        sentBy: { select: { name: true } },
      },
    }),
  ]);

  if (!patient) throw notFound("Patient");

  // Oldest first on screen, as a conversation reads.
  const messages = newestFirst.reverse();

  return {
    patient: {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName ?? ""}`.trim(),
      mrn: patient.mrn,
      phone: patient.phone,
      email: patient.email,
      whatsappOptIn: patient.whatsappOptIn,
      smsOptIn: patient.smsOptIn,
      emailOptIn: patient.emailOptIn,
      preferredLanguage: patient.preferredLanguage,
    },
    messages: messages.map((m) => ({
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      category: m.category,
      status: m.status,
      subject: m.subject,
      body: m.body,
      toAddress: m.toAddress,
      templateName: m.template?.name ?? null,
      failureReason: m.failureReason,
      attemptCount: m.attemptCount,
      createdAt: m.createdAt,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      sentByName: m.sentBy?.name ?? null,
    })),
  };
}

export interface TemplateRow {
  id: string;
  key: string;
  name: string;
  channel: MessageChannel;
  category: MessageCategory;
  subject: string | null;
  body: string;
  variables: string[];
  active: boolean;
}

export async function listTemplates(
  actor: RequestActor,
  channel?: MessageChannel,
  options: { includeInactive?: boolean } = {},
): Promise<TemplateRow[]> {
  assertPermission(actor, Permission.COMMUNICATION_READ);

  const templates = await prisma.messageTemplate.findMany({
    where: {
      ...tenantScope(actor),
      ...(options.includeInactive ? {} : { active: true }),
      ...(channel ? { channel } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      channel: true,
      category: true,
      subject: true,
      body: true,
      variables: true,
      active: true,
    },
  });

  return templates.map((t) => ({
    ...t,
    variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
  }));
}

export interface SendInput {
  patientId: string;
  channel: MessageChannel;
  /** Either a template to render, or a body written by hand. */
  templateId?: string | null;
  body?: string;
  subject?: string | null;
  variables?: Record<string, string>;
  appointmentId?: string | null;
  category?: MessageCategory;
}

export interface SendResult {
  messageId: string;
  status: MessageStatus;
  channelLabel: string;
  failureReason: string | null;
}

/**
 * The organization's connected gateway for a channel (spec §29), or null to
 * use the simulated one. Connected means the integration is marked so *and*
 * its credential reference resolves in the secret store — a row that only
 * looks connected never sends.
 */
export async function gatewayRoute(
  organizationId: string,
  channel: MessageChannel,
): Promise<GatewayRoute | null> {
  const integration = await prisma.integration.findFirst({
    where: { organizationId, category: channel, status: "CONNECTED" },
    select: { provider: true, config: true, credentialRef: true },
  });
  if (!integration) return null;

  const credential = resolveSecret(integration.credentialRef);
  if (!credential) return null;

  return {
    provider: integration.provider,
    config: (integration.config ?? {}) as Record<string, unknown>,
    credential,
  };
}

/**
 * Spec §14 — send one message to one patient.
 *
 * Consent is checked before anything is written. A patient who has not opted
 * into a channel is not messaged on it, and the error names the channels they
 * did agree to, so the sender has somewhere to go (spec §38).
 */
export async function sendMessage(
  actor: RequestActor,
  input: SendInput,
): Promise<SendResult> {
  assertPermission(actor, Permission.COMMUNICATION_SEND);

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, ...tenantScope(actor) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mrn: true,
      phone: true,
      email: true,
      whatsappOptIn: true,
      smsOptIn: true,
      emailOptIn: true,
    },
  });
  if (!patient) throw notFound("Patient");

  if (!hasConsent(patient, input.channel)) {
    const allowed = (["WHATSAPP", "SMS", "EMAIL"] as const)
      .filter((c) => hasConsent(patient, c))
      .map((c) => CHANNEL_LABEL[c]);

    throw new ServiceError(
      "INVALID_STATE",
      `${patient.firstName} has not opted into ${CHANNEL_LABEL[input.channel]}.`,
      allowed.length
        ? `Send on ${allowed.join(" or ")} instead.`
        : "Ask the front desk to record a contact preference first.",
    );
  }

  const template = input.templateId
    ? await prisma.messageTemplate.findFirst({
        where: { id: input.templateId, ...tenantScope(actor), active: true },
        select: {
          id: true,
          name: true,
          channel: true,
          category: true,
          subject: true,
          body: true,
          language: true,
          variables: true,
          providerTemplateId: true,
        },
      })
    : null;

  if (input.templateId && !template) throw notFound("Message template");

  if (template && template.channel !== input.channel) {
    throw invalidState(
      `The “${template.name}” template is for ${CHANNEL_LABEL[template.channel]}.`,
      `Pick a ${CHANNEL_LABEL[input.channel]} template, or write the message by hand.`,
    );
  }

  const variables = {
    patientName: patient.firstName,
    ...input.variables,
  };

  const body = renderTemplate(
    template?.body ?? input.body ?? "",
    variables,
  ).trim();

  if (!body) {
    throw new ServiceError(
      "VALIDATION",
      "The message is empty.",
      "Write something or pick a template.",
    );
  }

  const unfilled = placeholdersIn(body);
  if (unfilled.length > 0) {
    throw new ServiceError(
      "VALIDATION",
      `This message still has a blank: ${unfilled.map((v) => `{{${v}}}`).join(", ")}.`,
      "Fill it in before sending — a patient should never receive a placeholder.",
    );
  }

  const toAddress =
    input.channel === "EMAIL" ? (patient.email ?? "") : patient.phone;

  const addressProblem = validateAddress(input.channel, toAddress);
  if (addressProblem) {
    throw invalidState(
      `${addressProblem} for ${patient.firstName}.`,
      "Update the patient's contact details, then send again.",
    );
  }

  const subject =
    input.channel === "EMAIL"
      ? renderTemplate(input.subject ?? template?.subject ?? "", variables)
      : null;

  const category = input.category ?? template?.category ?? "TRANSACTIONAL";
  const queuedAt = new Date();

  // Step 1 — the record exists before the gateway is called, so an attempt is
  // never invisible.
  const message = await prisma.message.create({
    data: {
      organizationId: actor.organizationId,
      patientId: patient.id,
      appointmentId: input.appointmentId ?? null,
      templateId: template?.id ?? null,
      channel: input.channel,
      direction: "OUTBOUND",
      category,
      status: "QUEUED",
      toAddress,
      subject: subject || null,
      body,
      sentById: actor.userId,
      queuedAt,
      attemptCount: 1,
    },
    select: { id: true },
  });

  // Step 2 — outside any transaction.
  const declared = Array.isArray(template?.variables)
    ? (template.variables as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const receipt = await dispatch(
    {
      channel: input.channel,
      to: toAddress,
      subject: subject || null,
      body,
      providerTemplateId: template?.providerTemplateId ?? null,
      // In the order the template declares them — how WhatsApp and DLT SMS
      // templates number their placeholders.
      templateParameters: declared.map((name) => ({
        name,
        value: (variables as Record<string, string | undefined>)[name] ?? "",
      })),
      language: template?.language ?? undefined,
    },
    await gatewayRoute(actor.organizationId, input.channel),
  );

  // Step 3 — write back what the gateway said, with the audit entry.
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.message.update({
      where: { id: message.id },
      data: {
        status: receipt.status,
        providerName: receipt.providerName,
        providerRef: receipt.providerRef,
        sentAt: receipt.status === "FAILED" ? null : now,
        failedAt: receipt.status === "FAILED" ? now : null,
        failureReason: receipt.failureReason ?? null,
      },
    });

    if (receipt.status !== "FAILED") {
      // Spec §30 + §50 — record that a message went out and on which channel,
      // never its contents.
      await writeAudit(tx, actor, {
        action: "MESSAGE_SENT",
        entityType: "Message",
        entityId: message.id,
        summary: `Sent ${CHANNEL_LABEL[input.channel]} message · Patient ${patient.mrn}`,
        metadata: {
          channel: input.channel,
          category,
          templateKey: template?.id ?? null,
          patientMrn: patient.mrn,
        },
      });
    }
  }, TX_OPTIONS);

  return {
    messageId: message.id,
    status: receipt.status,
    channelLabel: CHANNEL_LABEL[input.channel],
    failureReason: receipt.failureReason ?? null,
  };
}

/**
 * Sends a template by its stable key.
 *
 * This is the path automation uses — appointment confirmations, follow-up
 * reminders — so a workflow names a template rather than embedding copy.
 * A missing or unconsented channel returns null instead of throwing: the
 * appointment must still be booked even if the confirmation cannot go out.
 */
export async function sendTemplatedMessage(
  actor: RequestActor,
  input: {
    patientId: string;
    templateKey: string;
    channel: MessageChannel;
    variables?: Record<string, string>;
    appointmentId?: string | null;
  },
  /**
   * An automation passes `rethrow` so a message it could not send fails the
   * run with the reason, visible in the run history, instead of vanishing.
   */
  options: { rethrow?: boolean } = {},
): Promise<SendResult | null> {
  const template = await prisma.messageTemplate.findFirst({
    where: {
      ...tenantScope(actor),
      key: input.templateKey,
      channel: input.channel,
      active: true,
    },
    select: { id: true },
  });

  if (!template) {
    if (options.rethrow) {
      throw new ServiceError(
        "NOT_FOUND",
        `There is no active ${CHANNEL_LABEL[input.channel]} template called ${input.templateKey}.`,
      );
    }
    return null;
  }

  try {
    return await sendMessage(actor, {
      patientId: input.patientId,
      channel: input.channel,
      templateId: template.id,
      variables: input.variables,
      appointmentId: input.appointmentId ?? null,
    });
  } catch (error) {
    if (options.rethrow) throw error;
    // The booking is the transaction that mattered; the notification is not.
    // It is logged rather than surfaced, and the message row records the state.
    console.error(
      `Automatic ${input.templateKey} message not sent`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Spec §38 — a failed message gets a retry, not a dead end. */
export async function retryMessage(
  actor: RequestActor,
  messageId: string,
): Promise<SendResult> {
  assertPermission(actor, Permission.COMMUNICATION_SEND);

  const message = await prisma.message.findFirst({
    where: { id: messageId, ...tenantScope(actor) },
    select: {
      id: true,
      channel: true,
      status: true,
      toAddress: true,
      subject: true,
      body: true,
      attemptCount: true,
      patient: { select: { mrn: true } },
      template: { select: { providerTemplateId: true } },
    },
  });

  if (!message) throw notFound("Message");

  if (message.status !== "FAILED") {
    throw invalidState(
      "This message did not fail, so there is nothing to retry.",
    );
  }

  if (message.attemptCount >= 3) {
    throw invalidState(
      "This message has already been tried three times.",
      "Check the patient's contact details before trying again.",
    );
  }

  // A retry has the rendered text but not the variables it was made from,
  // so a WhatsApp retry goes as text — accepted inside the 24h window.
  const receipt = await dispatch(
    {
      channel: message.channel,
      to: message.toAddress,
      subject: message.subject,
      body: message.body,
      providerTemplateId:
        message.channel === "SMS" ? (message.template?.providerTemplateId ?? null) : null,
    },
    await gatewayRoute(actor.organizationId, message.channel),
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.message.update({
      where: { id: message.id },
      data: {
        status: receipt.status,
        attemptCount: { increment: 1 },
        providerName: receipt.providerName,
        providerRef: receipt.providerRef,
        sentAt: receipt.status === "FAILED" ? null : now,
        failedAt: receipt.status === "FAILED" ? now : null,
        failureReason: receipt.failureReason ?? null,
      },
    });

    if (receipt.status !== "FAILED") {
      await writeAudit(tx, actor, {
        action: "MESSAGE_SENT",
        entityType: "Message",
        entityId: message.id,
        summary: `Retried ${CHANNEL_LABEL[message.channel]} message · Patient ${message.patient?.mrn ?? "—"}`,
        metadata: { channel: message.channel, attempt: message.attemptCount + 1 },
      });
    }
  }, TX_OPTIONS);

  return {
    messageId: message.id,
    status: receipt.status,
    channelLabel: CHANNEL_LABEL[message.channel],
    failureReason: receipt.failureReason ?? null,
  };
}

/** Unread inbound count for the sidebar badge. */
export async function countActionableMessages(
  actor: RequestActor,
): Promise<number> {
  if (!hasCommunicationRead(actor)) return 0;

  return prisma.message.count({
    where: {
      ...tenantScope(actor),
      OR: [
        { direction: "INBOUND", readAt: null },
        { status: "FAILED" },
      ],
    },
  });
}

function hasCommunicationRead(actor: RequestActor): boolean {
  try {
    assertPermission(actor, Permission.COMMUNICATION_READ);
    return true;
  } catch {
    return false;
  }
}

export { ACCEPTED as ACCEPTED_STATUSES };
