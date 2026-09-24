import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAlertThrottle, errorReport, scrub } from "@/lib/observability/error-report";

/** Spec §50 — error reports name the route, never the patient. */

describe("errorReport", () => {
  it("keeps the route and drops the query string", () => {
    const report = errorReport(new TypeError("boom"), { path: "/doctor/patients/abc?q=Asha", method: "GET" }, {
      routePath: "/doctor/patients/[patientId]",
      routeType: "render",
    });
    assert.equal(report.path, "/doctor/patients/abc");
    assert.equal(report.route, "/doctor/patients/[patientId]");
    assert.equal(report.name, "TypeError");
  });

  it("masks emails, phone numbers and long ids in the message", () => {
    assert.equal(
      scrub("No patient asha@example.com at +91 98765 43210 (cmf3k2l9x0000abcd1234efgh)"),
      "No patient [email] at [number] ([id])",
    );
  });

  it("carries React's digest when the original error is hidden", () => {
    const hidden = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "12345" });
    assert.equal(errorReport(hidden, { path: "/", method: "GET" }, undefined).digest, "12345");
    assert.equal(errorReport("plain", { path: "/", method: "GET" }, undefined).name, "string");
  });
});

describe("alert throttle", () => {
  it("alerts once per distinct error per window", () => {
    const shouldAlert = createAlertThrottle(1000);
    const report = errorReport(new Error("db down"), { path: "/", method: "GET" }, undefined);
    assert.equal(shouldAlert(report, 0), true);
    assert.equal(shouldAlert(report, 500), false);
    assert.equal(shouldAlert(report, 1500), true);
  });
});
