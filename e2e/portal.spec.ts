import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §3 + §34 — the patient side, on a phone: a patient registered at the
 * desk signs in with a code, books, sees the booking and cancels it.
 */

const PORTAL = "/portal/aadrique-medical-center";

test.use({ viewport: { width: 390, height: 844 } });

test("a patient signs in with a code, books and cancels", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const firstName = `Portal${stamp}`;
  const phone = `96${stamp}${stamp.slice(0, 2)}`;

  // Registered at the front desk.
  const desk = await browser.newPage();
  await signIn(desk, "desk");
  await desk.getByRole("button", { name: "Register", exact: true }).click();
  const register = desk.getByRole("dialog");
  await register.getByLabel("First name").fill(firstName);
  await register.getByRole("combobox", { name: /Sex/ }).click();
  await desk.getByRole("option", { name: "Female", exact: true }).click();
  await register.getByLabel("Age in years").fill("31");
  await register.getByLabel("Mobile number").fill(phone);
  await register.getByRole("button", { name: "Register", exact: true }).click();
  await expectToast(desk, /is registered as/);
  await desk.close();

  // The patient, on their own phone, with no staff session.
  const patient = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await patient.goto(PORTAL);
  await patient.getByLabel("Your mobile number").fill(phone.replace(/(\d{5})(\d{5})/, "$1 $2"));
  await patient.getByRole("button", { name: "Send code" }).click();
  const code = await patient.getByTestId("demo-code").innerText();
  await patient.getByLabel("Six-digit code").fill(code);
  await patient.getByRole("button", { name: "Sign in" }).click();
  await expect(patient.getByRole("heading", { name: `Hello, ${firstName}` })).toBeVisible();

  // Book the first free time on the next day that has one.
  await patient.getByRole("link", { name: "Book an appointment" }).click();
  const firstSlot = patient.locator("button[aria-pressed]").first();
  const day = patient.getByLabel("Day");
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const d = new Date();
    d.setDate(d.getDate() + ahead);
    const offset = d.getTimezoneOffset() * 60_000;
    await day.fill(new Date(d.getTime() - offset).toISOString().slice(0, 10));
    if (await firstSlot.isVisible({ timeout: 5_000 }).catch(() => false)) break;
  }
  await firstSlot.click();
  await patient.getByLabel(/What is it about/).fill("Routine check");
  await patient.getByRole("button", { name: "Book", exact: true }).click();
  await expectToast(patient, /Booked with/);
  await expect(patient).toHaveURL(new RegExp(`${PORTAL}$`));

  // It is listed, and can be cancelled.
  const upcoming = patient.getByRole("heading", { name: "Upcoming" }).locator("..");
  await expect(upcoming.getByRole("button", { name: "Cancel" })).toBeVisible();
  await upcoming.getByRole("button", { name: "Cancel" }).click();
  await patient.getByRole("button", { name: /^Confirm cancelling/ }).click();
  await expectToast(patient, "Your appointment is cancelled.");
  await expect(upcoming.getByText("Nothing booked.")).toBeVisible();

  // The page fits the phone.
  const overflow = await patient.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await patient.close();
});

test("the portal does not open to someone who has not signed in", async ({ page }) => {
  await page.goto(`${PORTAL}/book`);
  await expect(page).toHaveURL(new RegExp(`${PORTAL}$`));
  await expect(page.getByLabel("Your mobile number")).toBeVisible();
});
