import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/** Spec §6 — a doctor uploads a lab report to the patient's record, opens it and reviews it. */
test("a doctor uploads a lab report and marks it reviewed", async ({ page }) => {
  await signIn(page, "doctor");
  await page.goto("/doctor/patients");
  await page.locator('a[href^="/doctor/patients/"]').first().click();
  await expect(page.getByText("Reports & documents")).toBeVisible();

  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Test").fill("Lipid profile");
  await dialog.getByLabel("File").setInputFiles({
    name: "lipids.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await dialog.getByLabel(/Key findings/).fill("LDL 162 mg/dL");
  await dialog.getByLabel("Has abnormal values").check();
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expectToast(page, "Document uploaded");

  const link = page.getByRole("link", { name: "Lipid profile" }).first();
  const response = await page.request.get((await link.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");

  await page.getByRole("button", { name: "Mark reviewed" }).first().click();
  await expect(page.getByText("Reviewed", { exact: true }).first()).toBeVisible();
});
