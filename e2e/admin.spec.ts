import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §53 — the admin journey:
 *   Create Doctor → Assign Department → Configure Schedule
 */
test("an administrator adds a doctor and sets their clinic hours", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  // Letters only, and unlikely to clash with the seeded A, C, D, O, P.
  const prefix = String.fromCharCode(
    ...[...stamp.slice(-3)].map((d) => 81 + (Number(d) % 9)),
  );

  await signIn(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);

  // Create Doctor.
  await page.goto("/admin/doctors");
  await page.getByRole("button", { name: "Add doctor" }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel("Full name").fill(`Dr. E2E ${stamp}`);
  await add.getByLabel("Email").fill(`e2e.${stamp}@aadrique.demo`);
  await add.getByLabel("Token prefix").fill(prefix);
  await add.getByLabel("Specialization").fill("Family medicine");
  await add.getByRole("button", { name: "Add doctor" }).click();

  await expect(add.getByRole("heading", { name: "Doctor added" })).toBeVisible();
  await expect(add.getByTestId("temporary-password")).toHaveText(/^\S{12}$/);
  await add.getByRole("link", { name: "Set clinic hours" }).click();
  await expect(page.getByRole("heading", { name: `Dr. E2E ${stamp}` })).toBeVisible();

  // Assign Department — move them to another department.
  const department = page.getByRole("combobox", { name: "Department" });
  const before = await department.innerText();
  await department.click();
  await page
    .getByRole("option")
    .filter({ hasNotText: before.trim() })
    .first()
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expectToast(page, "Settings saved.");

  // Configure Schedule — a Monday session, copied across the weekdays.
  await page.getByRole("button", { name: "Edit hours" }).click();
  const monday = page.locator("li").filter({ hasText: /^Monday/ });
  await monday.getByRole("button", { name: "Session" }).click();
  await page.getByLabel("Monday session start").fill("09:00");
  await page.getByLabel("Monday session end").fill("13:00");
  await monday.getByRole("button", { name: "To weekdays" }).click();
  await page.getByRole("button", { name: "Save hours" }).click();
  await expectToast(page, "Clinic hours saved.");

  const hours = page.locator("dl").filter({ hasText: "Friday" });
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    await expect(hours.locator("div").filter({ hasText: day })).toContainText("9am–1pm");
  }
  await expect(hours.locator("div").filter({ hasText: "Saturday" })).toContainText("Closed");

  // The new doctor is bookable from the front desk's point of view.
  await page.goto("/admin/doctors");
  await expect(page.getByText(`Dr. E2E ${stamp}`)).toBeVisible();
});
