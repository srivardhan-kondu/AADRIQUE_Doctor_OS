import { expect, test, type Page } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §31 — account lifecycle in a browser: a temporary password must be
 * replaced before anything else, and a reset ends the person's open session.
 */

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("new staff choose their own password, and a reset signs them out", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `desk.${stamp}@aadrique.demo`;

  // An administrator adds a member of the front desk.
  const admin = await browser.newPage();
  await signIn(admin, "admin");
  await admin.goto("/admin/staff");
  await admin.getByRole("button", { name: "Add staff" }).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill(`Desk ${stamp}`);
  await add.getByLabel("Email").fill(email);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const temporary = await add.getByTestId("temporary-password").innerText();
  await add.getByRole("button", { name: "Done" }).click();

  // They sign in with it, and cannot go anywhere before replacing it.
  const staff = await browser.newPage();
  await signInAs(staff, email, temporary);
  await expect(staff).toHaveURL(/\/account\/password$/);
  await staff.goto("/reception");
  await expect(staff).toHaveURL(/\/account\/password$/);

  // A weak choice is refused in words they can act on.
  await staff.getByLabel("Temporary password").fill(temporary);
  await staff.getByLabel("New password", { exact: true }).fill("password123");
  await staff.getByLabel("Confirm new password").fill("password123");
  await staff.getByRole("button", { name: "Change password" }).click();
  await expect(staff.locator("form").getByRole("alert")).toContainText(/first an attacker would try/);

  const chosen = `monsoon desk ${stamp}`;
  await staff.getByLabel("Temporary password").fill(temporary);
  await staff.getByLabel("New password", { exact: true }).fill(chosen);
  await staff.getByLabel("Confirm new password").fill(chosen);
  await staff.getByRole("button", { name: "Change password" }).click();
  await expect(staff).toHaveURL(/\/reception$/);

  // The administrator resets them: their open session ends on its next use.
  await admin.reload();
  await admin.getByRole("button", { name: `Manage Desk ${stamp}` }).click();
  await admin.getByRole("menuitem", { name: "Reset password" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Reset password" }).click();
  await expect(admin.getByTestId("temporary-password")).toBeVisible();

  await staff.goto("/reception/queue");
  await expect(staff).toHaveURL(/\/sign-in\?ended=1/);
  await expect(staff.getByRole("status")).toContainText(/password or your access changed/);

  // And the old password no longer works.
  await signInAs(staff, email, chosen);
  await expect(staff.locator("form").getByRole("alert")).toBeVisible();
  await expect(staff).toHaveURL(/\/sign-in/);

  await admin.close();
  await staff.close();
});

test("removing access ends the session at once", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `nurse.${stamp}@aadrique.demo`;

  const admin = await browser.newPage();
  await signIn(admin, "admin");
  await admin.goto("/admin/staff");
  await admin.getByRole("button", { name: "Add staff" }).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill(`Nurse ${stamp}`);
  await add.getByLabel("Email").fill(email);
  await add.getByRole("combobox", { name: "Role" }).click();
  await admin.getByRole("option", { name: "Nurse" }).click();
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const temporary = await add.getByTestId("temporary-password").innerText();
  await add.getByRole("button", { name: "Done" }).click();

  const nurse = await browser.newPage();
  await signInAs(nurse, email, temporary);
  await expect(nurse).toHaveURL(/\/account\/password$/);

  await admin.reload();
  await admin.getByRole("button", { name: `Manage Nurse ${stamp}` }).click();
  await admin.getByRole("menuitem", { name: "Remove access" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Remove access" }).click();
  await expectToast(admin, /no longer has access/);

  await nurse.reload();
  await expect(nurse).toHaveURL(/\/sign-in\?ended=1/);

  await admin.close();
  await nurse.close();
});
