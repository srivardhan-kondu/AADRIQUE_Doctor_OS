import { type Page, expect } from "@playwright/test";

export const PASSWORD = "aadrique123";

export const ACCOUNTS = {
  doctor: "ananya.rao@aadrique.demo",
  desk: "frontdesk@aadrique.demo",
  admin: "admin@aadrique.demo",
} as const;

/** Signs in through the real form, as a person would, and waits to land. */
export async function signIn(page: Page, who: keyof typeof ACCOUNTS) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(ACCOUNTS[who]);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/** A toast with this text appeared. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: text }).first(),
  ).toBeVisible();
}
