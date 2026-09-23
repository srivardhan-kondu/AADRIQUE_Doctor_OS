import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §53 — the doctor journey:
 *   Login → Open Dashboard → Open Patient → Start Consultation → Save → Sign
 *   → Next Patient
 * with the §54 acceptance criteria it passes through: the draft survives a
 * refresh, and a signed consultation can no longer be edited.
 */
test("a doctor sees a patient, documents, signs and moves on", async ({ page }) => {
  await signIn(page, "doctor");

  // Open Dashboard — each role lands in its own workspace.
  await expect(page).toHaveURL(/\/doctor$/);
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();

  // Open Patient, from the live queue.
  const firstPatient = page.locator('a[href^="/doctor/patients/"]').first();
  const patientHref = await firstPatient.getAttribute("href");
  await firstPatient.click();
  await expect(page).toHaveURL(new RegExp(`${patientHref}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();

  // Start Consultation — one click from the dashboard (spec §41-B).
  await page.goto("/doctor");
  await page.getByRole("button", { name: /Call next/ }).click();
  await expect(page).toHaveURL(/\/doctor\/consultations\/[\w-]+$/);
  const firstVisit = page.url();

  // Save — the draft autosaves, and survives a refresh (spec §54).
  const assessment = page.getByLabel("Assessment");
  await assessment.fill("Viral upper respiratory infection, improving.");
  await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel("Assessment")).toHaveValue(
    "Viral upper respiratory infection, improving.",
  );

  // AI content is marked as AI wherever it appears (spec §54).
  await expect(page.locator(".ai-surface").first()).toBeVisible();

  // Sign.
  await page.getByRole("button", { name: "Sign consultation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign", exact: true }).click();
  await expectToast(page, /signed/i);
  await expect(page.getByLabel("Assessment")).toBeDisabled();

  // Next Patient.
  await page.goto("/doctor/queue");
  await page.getByRole("button", { name: /Call next/ }).click();
  await expect(page).toHaveURL(/\/doctor\/consultations\/[\w-]+$/);
  expect(page.url()).not.toBe(firstVisit);
});
