import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §53 — the doctor journey:
 *   Login → Open Dashboard → Open Patient → Start Consultation → Save → Sign
 *   → Next Patient
 * where signing and calling the next patient is one step.
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
  const assessment = page.getByRole("textbox", { name: /^Assessment/ });
  await assessment.fill("Viral upper respiratory infection, improving.");
  await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: /^Assessment/ })).toHaveValue(
    "Viral upper respiratory infection, improving.",
  );

  // AI content is marked as AI wherever it appears (spec §54).
  await expect(page.locator(".ai-surface").first()).toBeVisible();

  // Prescribe — the prescription sits under the note and autosaves (spec §6).
  // "1-0-1" is written out for the patient.
  await page.getByRole("button", { name: "Add medicine" }).click();
  await page.getByLabel("Medicine 1", { exact: true }).fill("Paracetamol 650 mg");
  await page.getByLabel("Medicine 1 frequency").fill("1-0-1");
  await page.getByLabel("Medicine 1 days").fill("3");
  await expect(page.getByLabel("Medicine 1 frequency")).toHaveValue("1-0-1 (morning and night)");
  await expect(page.getByText("Prescription saved")).toBeVisible({ timeout: 15_000 });

  // Book the review with the signature.
  await page.getByRole("radio", { name: "1 week" }).click();

  // Sign & call next — which issues the prescription, books the follow-up
  // and brings the next patient in, in one step.
  await page.getByRole("button", { name: "Sign consultation" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("1 medicine, issued on signing")).toBeVisible();
  await dialog.getByRole("button", { name: /Sign & call next/ }).click();
  await expectToast(page, /Signed\./);
  await expect(page).not.toHaveURL(firstVisit);
  await expect(page).toHaveURL(/\/doctor\/(consultations\/[\w-]+)?$/);

  // The first visit is signed and read-only, its prescription issued.
  await page.goto(firstVisit);
  await expect(page.getByRole("textbox", { name: /^Assessment/ })).toBeDisabled();
  await expect(page.getByText("Issued", { exact: true })).toBeVisible();
  await expect(page.getByText(/Follow-up booked for/)).toBeVisible();
  await page.goto(firstVisit.replace(/\/doctor\/consultations\//, "/print/prescription/"));
  await expect(page.getByText("Paracetamol 650 mg")).toBeVisible();
  await expect(page.getByText(/DRAFT/)).toHaveCount(0);
});

/**
 * Closing a visit whose note was written but not signed asks first, rather
 * than leaving a draft to be found later.
 */
test("calling the next patient over an unsigned note asks first", async ({ page }) => {
  await signIn(page, "doctor");
  await page.getByRole("button", { name: /Call next/ }).click();
  await expect(page).toHaveURL(/\/doctor\/consultations\/[\w-]+$/);
  const visit = page.url();

  await page.getByLabel("Examination", { exact: true }).fill("Chest clear.");
  await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 15_000 });

  await page.goto("/doctor/queue");
  await page.getByRole("button", { name: /Call next/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/note is not signed/)).toBeVisible();
  await dialog.getByRole("link", { name: /Open note to sign/ }).click();
  await expect(page).toHaveURL(visit);
});
