import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/** Spec §54 — acceptance criteria that only show up in a real browser. */

test("the doctor's queue updates without a refresh when the desk adds a walk-in", async ({
  browser,
}) => {
  const doctor = await browser.newPage();
  const desk = await browser.newPage();

  await signIn(doctor, "doctor");
  await doctor.goto("/doctor/queue");
  await expect(doctor.getByText("Live", { exact: true })).toBeVisible();

  // A patient registered just now, so nobody else's queue state interferes.
  const stamp = Date.now().toString().slice(-6);
  const name = `Live${stamp}`;
  await signIn(desk, "desk");
  await desk.getByRole("button", { name: "Register", exact: true }).click();
  const register = desk.getByRole("dialog");
  await register.getByLabel("First name").fill(name);
  await register.getByRole("combobox", { name: /Sex/ }).click();
  await desk.getByRole("option", { name: "Female", exact: true }).click();
  await register.getByLabel("Age in years").fill("33");
  await register.getByLabel("Mobile number").fill(`96${stamp}${stamp.slice(0, 2)}`);
  await register.getByRole("button", { name: "Register", exact: true }).click();
  await expectToast(desk, /is registered as P-\d{6}/);

  await desk.getByRole("textbox", { name: "Search patients" }).fill(name);
  await desk.getByRole("button", { name: `Walk-in token for ${name}` }).click();
  const dialog = desk.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Doctor" }).click();
  await desk.getByRole("option", { name: /Dr\. Ananya Rao/ }).click();
  await dialog.getByRole("button", { name: "Issue token" }).click();

  const issued = desk
    .locator("[data-sonner-toast]")
    .filter({ hasText: new RegExp(`${name} is A\\d{3} for`) })
    .first();
  await expect(issued).toBeVisible();
  const token = (await issued.innerText()).match(/is (A\d{3}) for/)?.[1];
  expect(token, "a walk-in token was issued").toBeTruthy();

  // No reload on the doctor's side: the live signal brings it in.
  await expect(doctor.getByText(token!, { exact: true })).toBeVisible({ timeout: 15_000 });

  await doctor.close();
  await desk.close();
});

test("the front desk cannot open a clinical note, even by its address", async ({ page }) => {
  await signIn(page, "desk");
  await page.goto("/doctor/consultations");
  await expect(page.getByText("This screen is not part of your role")).toBeVisible();
});

test("a token link that was not signed by the server is refused", async ({ page }) => {
  await page.goto("/q/qe_000001.aaaaaaaaaaaaaaaaaaaaaa");
  await expect(page.getByText("This link is not valid")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const screens = {
    doctor: ["/doctor", "/doctor/queue", "/doctor/appointments", "/doctor/patients", "/doctor/analytics"],
    desk: ["/reception", "/reception/queue", "/reception/appointments", "/reception/patients"],
    admin: ["/admin", "/admin/doctors", "/admin/patients", "/admin/reports", "/admin/communications"],
  } as const;

  for (const [who, paths] of Object.entries(screens) as [keyof typeof screens, readonly string[]][]) {
    test(`${who} screens fit the width of the screen`, async ({ page }) => {
      await signIn(page, who);
      for (const path of paths) {
        await page.goto(path);
        await expect(page.locator("main").first()).toBeVisible();
        // Measured twice: the loading skeleton the person sees first, and the
        // page once its data has arrived.
        for (const phase of ["loading", "loaded"]) {
          if (phase === "loaded") await page.waitForLoadState("networkidle");
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(
            overflow,
            `${path} (${phase}) scrolls sideways by ${overflow}px`,
          ).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

test("registration refuses the same person twice", async ({ page }) => {
  await signIn(page, "desk");
  const stamp = Date.now().toString().slice(-6);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "Register", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("First name").fill(`Twin${stamp}`);
    await dialog.getByRole("combobox", { name: /Sex/ }).click();
    await page.getByRole("option", { name: "Male", exact: true }).click();
    await dialog.getByLabel("Age in years").fill("40");
    await dialog.getByLabel("Mobile number").fill(`97${stamp}${stamp.slice(0, 2)}`);
    await dialog.getByRole("button", { name: "Register", exact: true }).click();

    if (attempt === 0) {
      await expectToast(page, /is registered as P-\d{6}/);
    } else {
      await expect(dialog.getByRole("alert")).toContainText(/already registered as P-\d{6}/);
    }
  }
});
