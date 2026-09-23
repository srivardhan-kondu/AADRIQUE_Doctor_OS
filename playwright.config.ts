import { defineConfig, devices } from "@playwright/test";

/**
 * Spec §53 — end-to-end tests of the major user journeys, in a real browser
 * against a production build.
 *
 *   npm run test:e2e
 *
 * The suite resets the demo organisation before it runs (see
 * e2e/global-setup.ts) and refuses to do so against a database that is not
 * on this machine.
 */

const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The journeys share one demo organisation and change it; run them in order.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    // Never reuse the developer's own server: the suite reseeds its data.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      AUTH_TRUST_HOST: "true",
      // Lets the webhook test sign a request; never a real secret.
      WHATSAPP_APP_SECRET: "e2e-app-secret",
    },
  },
});
