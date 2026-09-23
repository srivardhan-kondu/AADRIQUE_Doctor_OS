import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * Spec §28 + §54 — templates are editable, and an administrator builds an
 * automation without a deploy: a template, a workflow that sends it, and
 * the switch that turns it on.
 */
test("an administrator writes a template and builds a workflow that sends it", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  const key = `welcome_${stamp}`;
  const templateName = `Welcome ${stamp}`;
  const workflowName = `Welcome new patients ${stamp}`;

  await signIn(page, "admin");
  await page.goto("/admin/communications");

  // Write a template.
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Name", { exact: true }).fill(templateName);
  await page.getByLabel("Key").fill(key);
  await page.getByRole("combobox", { name: "Channel" }).click();
  await page.getByRole("option", { name: "SMS" }).click();

  // A placeholder nothing can fill is caught before saving.
  await page.getByLabel("Message", { exact: true }).fill("Welcome, {{patientNmae}}!");
  await expect(page.getByRole("alert").filter({ hasText: "{{patientNmae}}" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();

  await page.getByLabel("Message", { exact: true }).fill("Welcome to the clinic, ");
  await page.getByRole("button", { name: "{{patientName}}" }).click();
  await expect(page.getByText("Welcome to the clinic, Asha")).toBeVisible();
  await page.getByRole("button", { name: "Save template" }).click();
  await expectToast(page, "Template saved.");
  await expect(page).toHaveURL(/\/admin\/communications$/);
  await expect(page.getByText(templateName)).toBeVisible();

  // Build a workflow that sends it when a patient is registered.
  await page.getByRole("link", { name: "New workflow" }).click();
  await page.getByLabel("Name", { exact: true }).fill(workflowName);
  await page.getByRole("combobox", { name: "When" }).click();
  await page.getByRole("option", { name: "A patient is registered" }).click();
  await page.getByRole("button", { name: "Action", exact: true }).click();
  await page.getByRole("combobox", { name: "Template" }).click();
  await page.getByRole("option", { name: new RegExp(`^${templateName} · SMS`) }).click();
  await expect(page.getByText(`1. Send the welcome ${stamp} on SMS`)).toBeVisible();
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expectToast(page, "Workflow saved.");

  // It starts off; the administrator turns it on.
  const toggle = page.getByRole("switch", { name: `Turn ${workflowName} on` });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(page.getByRole("switch", { name: `Turn ${workflowName} off` })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
