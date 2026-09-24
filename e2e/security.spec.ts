import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Spec §31 — the Content-Security-Policy is strict enough to stop injected
 * script and loose enough not to break the product. Every main screen is
 * opened with a violation listener attached.
 */

const screens = {
  doctor: ["/doctor", "/doctor/queue", "/doctor/patients", "/doctor/analytics", "/doctor/copilot"],
  desk: ["/reception", "/reception/queue", "/display"],
  admin: ["/admin", "/admin/staff", "/admin/reports", "/admin/audit"],
} as const;

for (const [who, paths] of Object.entries(screens) as [keyof typeof screens, readonly string[]][]) {
  test(`${who} screens run without a CSP violation`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to (execute|load|apply)/i.test(message.text())) {
        violations.push(message.text().slice(0, 200));
      }
    });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });

    await signIn(page, who);
    for (const path of paths) {
      const response = await page.goto(path);
      await page.waitForLoadState("networkidle");
      const csp = response?.headers()["content-security-policy"] ?? "";
      expect(csp, `${path} is served with a nonced policy`).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    }

    // A toast styles itself by injecting a <style> element; it must still work.
    await page.goto(paths[0]);
    await page.evaluate(() => document.querySelector("[data-sonner-toaster]") !== null);

    expect(violations, violations.join("\n")).toEqual([]);
  });
}

test("injected markup cannot run script", async ({ page }) => {
  await signIn(page, "doctor");
  await page.goto("/doctor");

  // What an XSS actually delivers: markup landing in the page — an inline
  // event handler, and a javascript: URL — not a script built by code the
  // page already trusts (which 'strict-dynamic' deliberately allows).
  const ran = await page.evaluate(async () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<img src="/nonexistent.png" onerror="window.__injected = true">' +
      '<a id="xss" href="javascript:window.__injected2 = true">x</a>';
    document.body.appendChild(host);
    (document.getElementById("xss") as HTMLAnchorElement).click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const w = window as unknown as { __injected?: boolean; __injected2?: boolean };
    return Boolean(w.__injected || w.__injected2);
  });
  expect(ran).toBe(false);
});

test("delivery webhooks believe only the vendor's signature", async ({ request }) => {
  const body = JSON.stringify({ entry: [] });

  const unsigned = await request.post("/api/webhooks/whatsapp", {
    data: body,
    headers: { "content-type": "application/json" },
  });
  expect(unsigned.status()).toBe(401);

  const { createHmac } = await import("node:crypto");
  const signature = `sha256=${createHmac("sha256", "e2e-app-secret").update(body).digest("hex")}`;
  const signed = await request.post("/api/webhooks/whatsapp", {
    data: body,
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
  });
  expect(signed.status()).toBe(200);

  // Resend has no secret configured in this run: it refuses rather than runs open.
  const resend = await request.post("/api/webhooks/resend", { data: "{}" });
  expect(resend.status()).toBe(503);
});

test("the scheduler runs only with its secret, by GET (Vercel Cron) or POST", async ({ request }) => {
  expect((await request.get("/api/jobs/workflows")).status()).toBe(401);
  expect(
    (await request.get("/api/jobs/workflows", { headers: { authorization: "Bearer wrong" } })).status(),
  ).toBe(401);

  const run = await request.get("/api/jobs/workflows", {
    headers: { authorization: "Bearer e2e-cron-secret" },
  });
  expect(run.status()).toBe(200);
  const body = await run.json();
  expect(body.ok).toBe(true);
  expect(body.cleared).toBeDefined();
});

test("the sign-in page offers no shared password unless it is a demo", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Demo accounts")).toHaveCount(0);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

/** Spec §31 — an uptime monitor can tell the app is up and has its database, and learns nothing else. */
test("the health check answers without signing in, and says only that", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(Object.keys(body).sort()).toEqual(["database", "latencyMs", "status"]);
});
