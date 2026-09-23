import "server-only";
import type { MessageStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

/**
 * Spec §14 — what the gateways report after a send: delivered, read, failed,
 * and patients' replies.
 *
 * Called only by the webhook routes, after the vendor's signature has been
 * verified. There is no actor: the signature is the authorization, and
 * every write is scoped by the vendor's own message id or by the
 * organization that owns the receiving number.
 */

type Reported = Extract<MessageStatus, "SENT" | "DELIVERED" | "READ" | "FAILED">;

const RANK: Record<MessageStatus, number> = {
  PENDING: 0,
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 2,
};

/**
 * Whether a reported status moves a message forward. Webhooks arrive out of
 * order and are retried, so a late "delivered" must not undo "read", and a
 * "failed" after the patient read it is noise.
 */
export function advances(current: MessageStatus, next: Reported): boolean {
  if (next === "FAILED") return current !== "DELIVERED" && current !== "READ" && current !== "FAILED";
  return RANK[next] > RANK[current];
}

export async function applyDeliveryStatus(update: {
  providerName: string;
  providerRef: string;
  status: Reported;
  at: Date;
  reason?: string | null;
}): Promise<boolean> {
  const message = await prisma.message.findFirst({
    where: { providerName: update.providerName, providerRef: update.providerRef },
    select: { id: true, status: true },
  });
  if (!message || !advances(message.status, update.status)) return false;

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: update.status,
      ...(update.status === "DELIVERED" ? { deliveredAt: update.at } : {}),
      ...(update.status === "READ" ? { readAt: update.at } : {}),
      ...(update.status === "FAILED"
        ? { failedAt: update.at, failureReason: update.reason ?? "The gateway reported a failure." }
        : {}),
    },
  });
  return true;
}

/**
 * A patient's WhatsApp reply. The receiving number identifies the
 * organization (its connected integration); the sender's mobile identifies
 * the patient inside that organization only. A reply from a number no
 * patient holds is not stored — there is nobody to show it to.
 */
export async function recordInboundWhatsApp(reply: {
  phoneNumberId: string;
  from: string;
  body: string;
  providerRef: string;
  at: Date;
}): Promise<"stored" | "duplicate" | "unmatched"> {
  const duplicate = await prisma.message.findFirst({
    where: { providerName: "meta-cloud-api", providerRef: reply.providerRef },
    select: { id: true },
  });
  if (duplicate) return "duplicate";

  const integration = await prisma.integration.findFirst({
    where: {
      category: "WHATSAPP",
      config: { path: ["phoneNumberId"], equals: reply.phoneNumberId },
    },
    select: { organizationId: true },
  });
  if (!integration) return "unmatched";

  const lastTen = reply.from.replace(/\D/g, "").slice(-10);
  if (lastTen.length !== 10) return "unmatched";

  // Numbers are compared by their digits: records from before phones were
  // stored in one format may hold spaces or dashes. The last four digits
  // narrow the search in SQL; the full match is made here.
  const candidates = await prisma.patient.findMany({
    where: {
      organizationId: integration.organizationId,
      active: true,
      phone: { contains: lastTen.slice(-4) },
    },
    orderBy: { lastVisitAt: { sort: "desc", nulls: "last" } },
    select: { id: true, phone: true },
    take: 50,
  });
  const patient = candidates.find((c) =>
    c.phone.replace(/\D/g, "").endsWith(lastTen),
  );
  if (!patient) return "unmatched";

  await prisma.message.create({
    data: {
      organizationId: integration.organizationId,
      patientId: patient.id,
      channel: "WHATSAPP",
      direction: "INBOUND",
      category: "TRANSACTIONAL",
      status: "DELIVERED",
      toAddress: patient.phone,
      body: reply.body.slice(0, 4000),
      providerName: "meta-cloud-api",
      providerRef: reply.providerRef,
      deliveredAt: reply.at,
      createdAt: reply.at,
    },
  });
  return "stored";
}
