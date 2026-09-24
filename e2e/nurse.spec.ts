import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/** Spec §5.1 — the nurse lands on the vitals station and measures the next patient. */
test("a nurse records vitals for the next waiting patient", async ({ page }) => {
  await signIn(page, "nurse");
  await expect(page).toHaveURL(/\/nurse$/);
  await expect(page.getByRole("heading", { name: "Vitals Station" })).toBeVisible();

  const toMeasure = page.locator("section").filter({ has: page.getByRole("heading", { name: "To measure" }) });
  const record = toMeasure.getByRole("button", { name: /Record vitals for/ }).first();
  const label = await record.getAttribute("aria-label");
  const patient = label!.replace("Record vitals for ", "");
  await record.click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/BP systolic/).fill("150");
  await dialog.getByLabel(/BP diastolic/).fill("96");
  await dialog.getByLabel(/Pulse/).fill("88");
  await dialog.getByRole("button", { name: "Save vitals" }).click();
  await expectToast(page, /High BP/);

  const measured = page.locator("section").filter({ has: page.getByRole("heading", { name: "Measured" }) });
  await expect(measured.getByText(patient, { exact: true })).toBeVisible();
  await expect(measured.getByText(/BP 150\/96/).first()).toBeVisible();
});
