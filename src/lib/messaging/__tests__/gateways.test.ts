import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { providerFor, type OutboundMessage } from "@/lib/messaging";
import {
  Msg91Provider,
  ResendProvider,
  WhatsAppCloudProvider,
  e164India,
} from "@/lib/messaging/gateways";

/**
 * Spec §14 + §29 — the real gateways, against a fake `fetch`: what goes on
 * the wire, and how each vendor's answer becomes a receipt.
 */

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(status: number, json: unknown) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const timeoutFetch = (async () => {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  throw error;
}) as typeof fetch;

const base: OutboundMessage = {
  channel: "WHATSAPP",
  to: "98765 43210",
  subject: null,
  body: "Your token is A007.",
};

describe("numbers", () => {
  it("normalises Indian mobiles to country code and digits", () => {
    assert.equal(e164India("98765 43210"), "919876543210");
    assert.equal(e164India("+91 98765-43210"), "919876543210");
    assert.equal(e164India("098765 43210"), "919876543210");
  });
});

describe("WhatsApp Cloud API", () => {
  it("sends text inside the window, with the token as a bearer", async () => {
    const { impl, calls } = fakeFetch(200, { messages: [{ id: "wamid.1" }] });
    const receipt = await new WhatsAppCloudProvider("123", "tok", impl).send(base);

    assert.deepEqual(receipt, { providerName: "meta-cloud-api", providerRef: "wamid.1", status: "SENT" });
    assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/123/messages");
    assert.equal(calls[0].headers.Authorization, "Bearer tok");
    assert.deepEqual(calls[0].body.text, { preview_url: false, body: "Your token is A007." });
    assert.equal(calls[0].body.to, "919876543210");
  });

  it("sends an approved template with its parameters in order", async () => {
    const { impl, calls } = fakeFetch(200, { messages: [{ id: "wamid.2" }] });
    await new WhatsAppCloudProvider("123", "tok", impl).send({
      ...base,
      providerTemplateId: "token_generated",
      language: "hi",
      templateParameters: [
        { name: "token", value: "A007" },
        { name: "currentToken", value: "A004" },
      ],
    });
    const template = calls[0].body.template as Record<string, unknown>;
    assert.equal(template.name, "token_generated");
    assert.deepEqual(template.language, { code: "hi" });
    assert.deepEqual(template.components, [
      {
        type: "body",
        parameters: [
          { type: "text", text: "A007" },
          { type: "text", text: "A004" },
        ],
      },
    ]);
  });

  it("explains the 24-hour window when Meta refuses for it", async () => {
    const { impl } = fakeFetch(400, { error: { code: 131047, message: "Re-engagement message" } });
    const receipt = await new WhatsAppCloudProvider("123", "tok", impl).send(base);
    assert.equal(receipt.status, "FAILED");
    assert.match(receipt.failureReason!, /24 hours/);
  });

  it("reports a timeout as a retryable failure, never throws", async () => {
    const receipt = await new WhatsAppCloudProvider("123", "tok", timeoutFetch).send(base);
    assert.equal(receipt.status, "FAILED");
    assert.match(receipt.failureReason!, /timed out/);
  });
});

describe("MSG91", () => {
  const sms = { ...base, channel: "SMS" as const };

  it("refuses free text: Indian SMS needs a DLT template", async () => {
    const { impl, calls } = fakeFetch(200, {});
    const receipt = await new Msg91Provider("key", impl).send(sms);
    assert.equal(receipt.status, "FAILED");
    assert.match(receipt.failureReason!, /DLT/);
    assert.equal(calls.length, 0, "nothing sent");
  });

  it("sends the flow with variables by name", async () => {
    const { impl, calls } = fakeFetch(200, { type: "success", message: "req-9" });
    const receipt = await new Msg91Provider("key", impl).send({
      ...sms,
      providerTemplateId: "flow-1",
      templateParameters: [{ name: "token", value: "A007" }],
    });
    assert.deepEqual(receipt, { providerName: "msg91", providerRef: "req-9", status: "SENT" });
    assert.equal(calls[0].headers.authkey, "key");
    assert.deepEqual(calls[0].body.recipients, [{ mobiles: "919876543210", token: "A007" }]);
  });

  it("passes MSG91's own refusal on", async () => {
    const { impl } = fakeFetch(200, { type: "error", message: "Template not approved" });
    const receipt = await new Msg91Provider("key", impl).send({ ...sms, providerTemplateId: "flow-1" });
    assert.match(receipt.failureReason!, /Template not approved/);
  });
});

describe("Resend", () => {
  it("sends plain-text email from the configured address", async () => {
    const { impl, calls } = fakeFetch(200, { id: "em_1" });
    const receipt = await new ResendProvider("re_key", "care@clinic.in", impl).send({
      ...base,
      channel: "EMAIL",
      to: "asha@example.in",
      subject: "Your appointment",
    });
    assert.deepEqual(receipt, { providerName: "resend", providerRef: "em_1", status: "SENT" });
    assert.deepEqual(calls[0].body, {
      from: "care@clinic.in",
      to: ["asha@example.in"],
      subject: "Your appointment",
      text: "Your token is A007.",
    });
  });
});

describe("routing", () => {
  it("uses the simulated gateway, named as such, without a route", () => {
    assert.equal(providerFor("SMS").name, "simulated");
  });

  it("uses the real gateway when a route is complete", () => {
    assert.equal(
      providerFor("WHATSAPP", { provider: "meta-cloud-api", config: { phoneNumberId: "1" }, credential: "t" }).name,
      "meta-cloud-api",
    );
    assert.equal(
      providerFor("EMAIL", { provider: "resend", config: { fromAddress: "a@b.in" }, credential: "k" }).name,
      "resend",
    );
  });

  it("falls back to simulated when a route is missing a setting", () => {
    assert.equal(
      providerFor("WHATSAPP", { provider: "meta-cloud-api", config: {}, credential: "t" }).name,
      "simulated",
    );
  });
});
