import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { consumeTotp } from "@/lib/auth/two-factor";
import { timeStep, totpAt } from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import { resetStaffPassword } from "@/server/services/accounts";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
} from "@/server/services/two-factor";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §31 — two-factor setup, single-use codes, and recovery. */

const configured = Boolean(process.env.DATABASE_URL);

describe("Two-factor sign-in", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let secret = "";

  before(async () => {
    clinic = await createTenant("mfa");
  });

  after(async () => {
    await removeTenant(clinic);
    await prisma.$disconnect();
  });

  it("stays off until the app proves it has the secret, which is stored sealed", async () => {
    const t = clinic!;
    ({ secret } = await beginTwoFactorSetup(t.doctor));
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: t.doctor.userId } });
    assert.equal(stored.mfaEnabled, false);
    assert.ok(stored.mfaSecret?.startsWith("v1."));
    assert.ok(!stored.mfaSecret?.includes(secret), "never stored in the clear");

    assert.equal((await rejection(confirmTwoFactorSetup(t.doctor, "000000"))).code, "VALIDATION");
    await confirmTwoFactorSetup(t.doctor, totpAt(secret, timeStep(Date.now())));
    assert.deepEqual(await getTwoFactorStatus(t.doctor), { enabled: true });
  });

  it("accepts each code once", async () => {
    const t = clinic!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: t.doctor.userId } });
    const next = Date.now() + 30_000;
    const code = totpAt(secret, timeStep(next));
    assert.equal(await consumeTotp(user, code, next), true);
    assert.equal(await consumeTotp(user, code, next), false, "replayed");
  });

  it("turns off with a current code, and an admin reset clears it for a lost phone", async () => {
    const t = clinic!;
    await assert.rejects(disableTwoFactor(t.doctor, "123456"));

    await resetStaffPassword(t.admin, t.doctor.userId);
    const reset = await prisma.user.findUniqueOrThrow({ where: { id: t.doctor.userId } });
    assert.equal(reset.mfaEnabled, false);
    assert.equal(reset.mfaSecret, null);
  });
});
