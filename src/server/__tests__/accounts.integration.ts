import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import {
  changeOwnPassword,
  createStaff,
  listStaff,
  resetStaffPassword,
  setStaffActive,
} from "@/server/services/accounts";
import {
  type Tenant,
  createTenant,
  rejection,
  removeTenant,
} from "./tenant-fixture";

/** Spec §31 — passwords and staff access against the real database. */

const configured = Boolean(process.env.DATABASE_URL);

describe("Accounts", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  let other: Tenant | undefined;

  before(async () => {
    clinic = await createTenant("accounts");
    other = await createTenant("accounts-other");
    // The fixture's users have no password; give the desk one to change.
    await prisma.user.update({
      where: { id: clinic.reception.userId },
      data: { passwordHash: await hashPassword("first desk passphrase") },
    });
  });

  after(async () => {
    await removeTenant(clinic);
    await removeTenant(other);
    await prisma.$disconnect();
  });

  it("changes a password only with the current one, and only to a good one", async () => {
    const t = clinic!;

    const wrong = await rejection(
      changeOwnPassword(t.reception, "not my password", "a much better passphrase"),
    );
    assert.match(wrong.message, /current password is not right/);

    const weak = await rejection(
      changeOwnPassword(t.reception, "first desk passphrase", "short"),
    );
    assert.match(weak.message, /at least 10/);

    const same = await rejection(
      changeOwnPassword(t.reception, "first desk passphrase", "first desk passphrase"),
    );
    assert.match(same.message, /different/);

    const before = Date.now();
    await changeOwnPassword(t.reception, "first desk passphrase", "a much better passphrase");

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: t.reception.userId },
      select: {
        passwordHash: true,
        passwordChangedAt: true,
        mustChangePassword: true,
        sessionVersion: true,
      },
    });
    assert.ok(await verifyPassword("a much better passphrase", user.passwordHash!));
    assert.ok(user.passwordChangedAt!.getTime() >= before - 1000);
    assert.equal(user.sessionVersion, 1, "every earlier session is over");
    assert.equal(user.mustChangePassword, false);
  });

  it("adds staff with a temporary password they must replace", async () => {
    const t = clinic!;
    const created = await createStaff(t.admin, {
      name: "Nisha Nurse",
      email: `nisha-${t.organizationId}@example.test`,
      role: "NURSE",
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.userId },
      select: { passwordHash: true, mustChangePassword: true },
    });
    assert.ok(await verifyPassword(created.temporaryPassword, user.passwordHash!));
    assert.equal(user.mustChangePassword, true);

    const staff = await listStaff(t.admin);
    assert.ok(staff.some((s) => s.email.startsWith("nisha-") && s.role === "NURSE"));

    await assert.rejects(
      createStaff(t.reception, { name: "X", email: "x@example.test", role: "NURSE" }),
      { name: "PermissionError" },
    );
  });

  it("resets someone else's password and signs them out everywhere", async () => {
    const t = clinic!;
    const reset = await resetStaffPassword(t.admin, t.doctor.userId);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: t.doctor.userId },
      select: { passwordHash: true, mustChangePassword: true, passwordChangedAt: true },
    });
    assert.ok(await verifyPassword(reset.temporaryPassword, user.passwordHash!));
    assert.equal(user.mustChangePassword, true);
    assert.ok(user.passwordChangedAt);

    const self = await rejection(resetStaffPassword(t.admin, t.admin.userId));
    assert.equal(self.code, "INVALID_STATE");
  });

  it("removes and restores access within the organization only", async () => {
    const t = clinic!;

    await setStaffActive(t.admin, t.reception.userId, false);
    const removed = await prisma.membership.findFirstOrThrow({
      where: { userId: t.reception.userId, organizationId: t.organizationId },
      select: { active: true },
    });
    assert.equal(removed.active, false);

    await setStaffActive(t.admin, t.reception.userId, true);

    const selfRemoval = await rejection(setStaffActive(t.admin, t.admin.userId, false));
    assert.equal(selfRemoval.code, "INVALID_STATE");

    // Another organization's administrator cannot reach these accounts.
    const outsider = await rejection(resetStaffPassword(other!.admin, t.reception.userId));
    assert.equal(outsider.code, "NOT_FOUND");
    const outsiderRemoval = await rejection(
      setStaffActive(other!.admin, t.reception.userId, false),
    );
    assert.equal(outsiderRemoval.code, "NOT_FOUND");

    const audited = await prisma.auditLog.count({
      where: { organizationId: t.organizationId, entityType: "User" },
    });
    assert.ok(audited >= 5, `expected every account change audited, saw ${audited}`);
  });
});
