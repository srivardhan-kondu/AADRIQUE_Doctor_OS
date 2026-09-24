import { expect, test } from "@playwright/test";
import { expectToast, signIn } from "./helpers";

/**
 * The client demo, rehearsed (see docs/DEMO.md). Lakshmi Iyer is seeded
 * first in Dr. Rao's line; this walks her through the clinic the way the
 * demo does, so a change that breaks the story fails here first.
 */
test("the demo story: nurse, doctor, allergy warning, reports, patient portal", async ({ browser }) => {
  // Nurse — Lakshmi is waiting and not yet measured.
  const nurse = await browser.newPage();
  await signIn(nurse, "nurse");
  await nurse.getByRole("button", { name: "Record vitals for Lakshmi Iyer" }).click();
  const vitals = nurse.getByRole("dialog");
  await vitals.getByLabel(/BP systolic/).fill("146");
  await vitals.getByLabel(/BP diastolic/).fill("92");
  await vitals.getByLabel(/Pulse/).fill("84");
  await vitals.getByLabel(/Weight/).fill("73.8");
  await vitals.getByRole("button", { name: "Save vitals" }).click();
  await expectToast(nurse, /High BP/);
  await nurse.close();

  // Doctor — one click brings her in, with her history and today's vitals.
  const doctor = await browser.newPage();
  await signIn(doctor, "doctor");
  await doctor.getByRole("button", { name: /Call next/ }).click();
  await expect(doctor).toHaveURL(/\/doctor\/consultations\//);
  await expect(doctor.getByText("Lakshmi Iyer").first()).toBeVisible();
  await expect(doctor.getByText(/Penicillins/).first()).toBeVisible();
  await expect(doctor.getByText("146/92")).toBeVisible();

  // Prescribing a penicillin is flagged before anything is signed.
  await doctor.getByRole("tab", { name: /Medications/ }).click();
  await doctor.getByRole("button", { name: "Add medicine" }).click();
  await doctor.getByLabel("Medicine 1", { exact: true }).fill("Amoxicillin 500 mg");
  await expect(doctor.getByRole("alert").filter({ hasText: /Recorded allergy/ })).toBeVisible({ timeout: 15_000 });

  // Her record: the new HbA1c is waiting for review, and the PDF opens.
  await doctor.goto("/doctor/patients");
  await doctor.getByPlaceholder(/Search/).first().fill("Lakshmi");
  await doctor.getByRole("link", { name: /Lakshmi Iyer/ }).first().click();
  await expect(doctor.getByText("Awaiting review").first()).toBeVisible();
  const report = doctor.getByRole("link", { name: "HbA1c" }).first();
  const pdf = await doctor.request.get((await report.getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await doctor.close();

  // Patient — she signs in to the portal with her mobile number.
  const patient = await browser.newPage();
  await patient.goto("/portal/aadrique-medical-center");
  await patient.getByLabel("Your mobile number").fill("98765 00101");
  await patient.getByRole("button", { name: "Send code" }).click();
  const code = await patient.getByTestId("demo-code").innerText();
  await patient.getByLabel("Six-digit code").fill(code);
  await patient.getByRole("button", { name: "Sign in" }).click();
  await expect(patient.getByText(/Lakshmi/).first()).toBeVisible();
  await patient.close();
});
