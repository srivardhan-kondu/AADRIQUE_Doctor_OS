import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dispatch,
  hasConsent,
  placeholdersIn,
  renderTemplate,
  validateAddress,
} from "@/lib/messaging";

/** Spec §53 — message templates are unit tested; spec §14 — consent. */

describe("templates", () => {
  const body = "Hi {{patientName}}, your token is {{ token }}. — {{ patientName }}";

  it("lists each placeholder once, tolerating spaces inside the braces", () => {
    assert.deepEqual(placeholdersIn(body), ["patientName", "token"]);
    assert.deepEqual(placeholdersIn("No blanks here."), []);
  });

  it("fills every occurrence", () => {
    assert.equal(
      renderTemplate(body, { patientName: "Asha", token: "A007" }),
      "Hi Asha, your token is A007. — Asha",
    );
  });

  it("leaves a missing or empty value visible instead of blanking it", () => {
    const rendered = renderTemplate(body, { patientName: "Asha", token: "" });
    assert.match(rendered, /\{\{ token \}\}/);
    assert.deepEqual(placeholdersIn(rendered), ["token"]);
    assert.deepEqual(
      placeholdersIn(renderTemplate(body, { token: null })),
      ["patientName", "token"],
    );
  });

  it("does not treat a filled value as a template", () => {
    const rendered = renderTemplate("Note: {{note}}", { note: "{{token}}" });
    assert.equal(rendered, "Note: {{token}}");
  });
});

describe("addresses", () => {
  it("accepts Indian mobiles with or without the country code", () => {
    assert.equal(validateAddress("SMS", "98765 43210"), null);
    assert.equal(validateAddress("WHATSAPP", "+91 98765-43210"), null);
  });

  it("names what is wrong with a number", () => {
    assert.equal(validateAddress("SMS", ""), "No contact detail on file");
    assert.equal(validateAddress("SMS", "12345"), "Mobile number is too short");
    assert.equal(
      validateAddress("SMS", "12345678901234"),
      "Mobile number is not valid",
    );
  });

  it("checks email addresses on the email channel only", () => {
    assert.equal(validateAddress("EMAIL", "asha@example.in"), null);
    assert.equal(validateAddress("EMAIL", "asha@"), "Email address is not valid");
  });
});

describe("consent", () => {
  const patient = { whatsappOptIn: true, smsOptIn: false, emailOptIn: false };

  it("follows the patient's choice per channel", () => {
    assert.equal(hasConsent(patient, "WHATSAPP"), true);
    assert.equal(hasConsent(patient, "SMS"), false);
    assert.equal(hasConsent(patient, "EMAIL"), false);
  });
});

describe("simulated gateway", () => {
  it("stops at SENT, never inventing a delivery", async () => {
    const receipt = await dispatch({
      channel: "WHATSAPP",
      to: "9876543210",
      subject: null,
      body: "Hello",
    });
    assert.equal(receipt.status, "SENT");
    assert.ok(receipt.providerRef);
  });

  it("fails an unusable address the way a real gateway would", async () => {
    const receipt = await dispatch({
      channel: "SMS",
      to: "123",
      subject: null,
      body: "Hello",
    });
    assert.equal(receipt.status, "FAILED");
    assert.equal(receipt.providerRef, null);
  });
});
