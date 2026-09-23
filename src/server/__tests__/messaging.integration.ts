import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { sendMessage } from "@/server/services/communication";
import {
  applyDeliveryStatus,
  recordInboundWhatsApp,
} from "@/server/services/delivery";
import { type Tenant, createTenant, removeTenant } from "./tenant-fixture";

/**
 * Spec §14 + §29 — a message through a connected gateway and back: the real
 * provider is chosen when the integration's credential resolves, receipts
 * only move a message forward, and a reply is matched to a patient inside
 * the organization that owns the receiving number — never across one.
 *
 * The network is stubbed; everything else is real.
 */

const configured = Boolean(process.env.DATABASE_URL);

describe("Messaging through a gateway", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;
  const realFetch = globalThis.fetch;
  const sent: Array<{ url: string; auth: string | null }> = [];

  before(async () => {
    clinic = await createTenant("msg");
    other = await createTenant("msg-other");
    process.env.ITEST_WA_TOKEN = "wa-token-123";

    for (const [tenant, phoneNumberId] of [
      [clinic, `pn-${clinic.organizationId}`],
      [other, `pn-${other.organizationId}`],
    ] as const) {
      await prisma.integration.create({
        data: {
          organizationId: tenant.organizationId,
          category: "WHATSAPP",
          provider: "meta-cloud-api",
          name: "WhatsApp",
          status: "CONNECTED",
          config: { phoneNumberId, wabaId: "waba" },
          credentialRef: "env://ITEST_WA_TOKEN",
        },
      });
    }

    // The same mobile for a patient in each organization.
    await prisma.patient.update({
      where: { id: other.patientId },
      data: { phone: "9876543210" },
    });

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({
        url: String(url),
        auth: (init?.headers as Record<string, string>)?.Authorization ?? null,
      });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), {
        status: 200,
      });
    }) as typeof fetch;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    delete process.env.ITEST_WA_TOKEN;
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  let providerRef = "";

  it("sends through the connected gateway with the resolved credential", async () => {
    const t = clinic!;
    const result = await sendMessage(t.doctor, {
      patientId: t.patientId,
      channel: "WHATSAPP",
      body: "Please bring your previous reports.",
    });
    assert.equal(result.status, "SENT");

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: result.messageId },
      select: { providerName: true, providerRef: true },
    });
    assert.equal(message.providerName, "meta-cloud-api");
    providerRef = message.providerRef!;
    assert.match(sent[0].url, new RegExp(`/pn-${t.organizationId}/messages$`));
    assert.equal(sent[0].auth, "Bearer wa-token-123");
  });

  it("moves a message forward on receipts, never back", async () => {
    const at = new Date();
    const status = async () =>
      (await prisma.message.findFirstOrThrow({ where: { providerRef }, select: { status: true } })).status;

    assert.equal(await applyDeliveryStatus({ providerName: "meta-cloud-api", providerRef, status: "READ", at }), true);
    assert.equal(await status(), "READ");

    // A late "delivered" and a stray "failed" after it was read change nothing.
    assert.equal(await applyDeliveryStatus({ providerName: "meta-cloud-api", providerRef, status: "DELIVERED", at }), false);
    assert.equal(await applyDeliveryStatus({ providerName: "meta-cloud-api", providerRef, status: "FAILED", at }), false);
    assert.equal(await status(), "READ");

    // A receipt for another vendor's id with the same value is not this message.
    assert.equal(await applyDeliveryStatus({ providerName: "resend", providerRef, status: "DELIVERED", at }), false);
  });

  it("files a reply with the right patient in the right organization, once", async () => {
    const t = clinic!;
    await prisma.patient.update({ where: { id: t.patientId }, data: { phone: "+91 98765 43210" } });

    const reply = {
      phoneNumberId: `pn-${t.organizationId}`,
      from: "919876543210",
      body: "Yes, I will bring them.",
      providerRef: `wamid.reply.${t.organizationId}`,
      at: new Date(),
    };
    assert.equal(await recordInboundWhatsApp(reply), "stored");
    assert.equal(await recordInboundWhatsApp(reply), "duplicate", "Meta's retries are ignored");

    const stored = await prisma.message.findFirstOrThrow({
      where: { providerRef: reply.providerRef },
      select: { organizationId: true, patientId: true, direction: true, readAt: true },
    });
    assert.equal(stored.organizationId, t.organizationId);
    assert.equal(stored.patientId, t.patientId);
    assert.equal(stored.direction, "INBOUND");
    assert.equal(stored.readAt, null, "arrives unread");

    // The other organization's patient shares the number but not the inbox.
    const otherInbox = await prisma.message.count({
      where: { organizationId: other!.organizationId, direction: "INBOUND" },
    });
    assert.equal(otherInbox, 0);

    assert.equal(
      await recordInboundWhatsApp({ ...reply, phoneNumberId: "pn-unknown", providerRef: "wamid.x" }),
      "unmatched",
    );
  });

  it("uses the simulated gateway, named honestly, when the credential does not resolve", async () => {
    const t = clinic!;
    delete process.env.ITEST_WA_TOKEN;
    const before = sent.length;
    const result = await sendMessage(t.doctor, {
      patientId: t.patientId,
      channel: "WHATSAPP",
      body: "A second note.",
    });
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: result.messageId },
      select: { providerName: true },
    });
    assert.equal(message.providerName, "simulated");
    assert.equal(sent.length, before, "no network call");
  });
});
