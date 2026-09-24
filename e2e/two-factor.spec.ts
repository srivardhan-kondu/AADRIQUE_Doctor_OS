import { expect, test } from "@playwright/test";
import { base32Decode, base32Encode, timeStep, totpAt } from "../src/lib/auth/totp";
import { signIn } from "./helpers";

/** Spec §31 — with two-factor on, the password alone no longer signs anyone in. */
test("a person turns on two-factor, and sign-in then asks for the code", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `mfa.${stamp}@aadrique.demo`;
  const password = `quiet harbour ${stamp}`;

  const admin = await browser.newPage();
  await signIn(admin, "admin");
  await admin.goto("/admin/staff");
  await admin.getByRole("button", { name: "Add staff" }).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill(`Mfa ${stamp}`);
  await add.getByLabel("Email").fill(email);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const temporary = await add.getByTestId("temporary-password").innerText();
  await admin.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(temporary);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Temporary password").fill(temporary);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).not.toHaveURL(/\/account\/password/);

  // Set up: the key the app would scan, then its current code.
  await page.goto("/account/two-factor");
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  const secret = base32Encode(base32Decode(await page.getByTestId("totp-secret").innerText()));
  await page.getByLabel("Code from the app").fill(totpAt(secret, timeStep(Date.now())));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page.getByText("Two-factor sign-in is on.")).toBeVisible();

  // Signed out, the password alone is not enough.
  await context.clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const codeBox = page.getByLabel("Authenticator code");
  await expect(codeBox).toBeVisible();

  await codeBox.fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(/code is not right/);

  // The next step's code — the current one was spent turning two-factor on.
  await page.getByLabel("Authenticator code").fill(totpAt(secret, timeStep(Date.now()) + 1));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await context.close();
});
