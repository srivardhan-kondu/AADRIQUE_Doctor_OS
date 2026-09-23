import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §53 — the reception journey:
 *   Search Patient → Book Appointment → Generate Token → Notification
 * starting from a patient registered at the desk, so the whole front-desk
 * path is exercised and the patient's message consent is known.
 */
test("the front desk registers, finds, books and tokens a patient", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  const firstName = `Kavya${stamp}`;
  const phone = `98${stamp}${stamp.slice(0, 2)}`;

  await signIn(page, "desk");
  await expect(page).toHaveURL(/\/reception$/);

  // Register.
  await page.getByRole("button", { name: "Register", exact: true }).click();
  const register = page.getByRole("dialog");
  await register.getByLabel("First name").fill(firstName);
  await register.getByLabel("Last name").fill("Test");
  await register.getByRole("combobox", { name: /Sex/ }).click();
  await page.getByRole("option", { name: "Female" }).click();
  await register.getByLabel("Age in years").fill("29");
  await register.getByLabel("Mobile number").fill(phone);
  await register.getByRole("button", { name: "Register", exact: true }).click();
  await expectToast(page, new RegExp(`${firstName} Test is registered as P-\\d{6}`));

  // Search Patient — results appear as you type.
  await page.getByRole("textbox", { name: "Search patients" }).fill(firstName);
  const result = page.locator("li").filter({ hasText: `${firstName} Test` });
  await expect(result).toBeVisible();

  // Book Appointment — the next day that has a free slot.
  await result.getByRole("button", { name: `Book an appointment for ${firstName} Test` }).click();
  const book = page.getByRole("dialog");
  const freeSlot = book.locator("button[aria-pressed]:not([disabled])").first();
  const date = book.getByLabel("Date");
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const day = new Date();
    day.setDate(day.getDate() + ahead);
    await date.fill(isoDate(day));
    if (await freeSlot.isVisible({ timeout: 4_000 }).catch(() => false)) break;
  }
  await freeSlot.click();
  await book.getByRole("button", { name: "Book", exact: true }).click();
  await expectToast(page, new RegExp(`${firstName} Test is booked for`));

  // Generate Token — a walk-in for today.
  await result.getByRole("button", { name: `Walk-in token for ${firstName} Test` }).click();
  const walkIn = page.getByRole("dialog");
  await walkIn.getByRole("button", { name: "Issue token" }).click();
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: new RegExp(`${firstName} Test is [A-Z]+\\d{3} for`) })
    .first();
  await expect(toast).toBeVisible();
  const token = (await toast.innerText()).match(/is ([A-Z]+\d{3}) for/)?.[1];
  expect(token).toBeTruthy();

  // The token is on today's queue, with a link the patient can follow.
  await page.goto("/reception/queue");
  const row = page.locator("li").filter({ hasText: token! });
  await expect(row).toContainText(`${firstName} Test`);
  await expect(
    row.getByRole("button", { name: `Copy the live token link for ${token}` }),
  ).toBeVisible();

  // Notification — the token message went out through the automation.
  await row.getByRole("link", { name: new RegExp(firstName) }).click();
  await expect(page.getByText(new RegExp(`Your token is ${token}`))).toBeVisible();
});

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
