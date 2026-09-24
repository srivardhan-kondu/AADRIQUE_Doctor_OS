import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import {
  checkResetToken,
  completePasswordReset,
  requestPasswordReset,
} from "@/server/services/password-reset";
import { type Tenant, createTenant, rejection, removeTenant } from "./tenant-fixture";

/** Spec §31 — forgotten passwords, by email where possible and by an admin otherwise. */

const configured = Boolean(process.env.DATABASE_URL);

describe("Password reset", { skip: !configured && "DATABASE_URL is not set" }, () => {
  let clinic: Tenant | undefined;
  const realFetch = globalThis.fetch;

  before(async () => {
    clinic = await createTenant("reset");
    await prisma.user.update({
      where: { id: clinic.doctor.userId },
      data: { passwordHash: await hashPassword("original-passphrase") },
    });
  });

  after(async () => {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_EMAIL_FROM;
    await removeTenant(clinic);
    await prisma.$disconnect();
  });

  it("says nothing about an unknown email", async () => {
    assert.deepEqual(await requestPasswordReset("nobody@example.test", "10.9.0.1"), { via: "none" });
  });

  it("without email, asks the clinic's admins to reset it", async () => {
    const t = clinic!;
    delete process.env.RESEND_API_KEY;
    const result = await requestPasswordReset(t.doctor.email.toUpperCase(), "10.9.0.2");
    assert.equal(result.via, "admin");

    const note = await prisma.notification.findFirstOrThrow({ where: { userId: t.admin.userId } });
    assert.match(note.body, /Dr\. Test Rao/);
    assert.equal(note.linkHref, "/admin/staff");
  });

  it("with email, sends a link that works once", async () => {
    const t = clinic!;
    process.env.RESEND_API_KEY = "re_test";
    process.env.AUTH_EMAIL_FROM = "Doctor OS <no-reply@example.test>";
    let sent = "";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)).text;
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }) as typeof fetch;

    const result = await requestPasswordReset(t.doctor.email, "10.9.0.3");
    assert.equal(result.via, "email");
    const token = decodeURIComponent(/token=([^\s]+)/.exec(sent)![1]);
    assert.equal(await checkResetToken(token), "valid");

    const weak = await rejection(completePasswordReset(token, "short"));
    assert.equal(weak.code, "VALIDATION");

    await completePasswordReset(token, "a brand new passphrase");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: t.doctor.userId } });
    assert.ok(await verifyPassword("a brand new passphrase", user.passwordHash!));
    assert.equal(await checkResetToken(token), "invalid", "used once, then dead");
    assert.equal((await rejection(completePasswordReset(token, "another new passphrase"))).code, "INVALID_STATE");
  });
});
