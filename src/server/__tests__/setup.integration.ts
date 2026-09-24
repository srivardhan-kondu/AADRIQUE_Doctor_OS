import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { createOrganization } from "@/server/setup/create-organization";

/** Spec §18 — setting up a real clinic from nothing. */

const configured = Boolean(process.env.DATABASE_URL);
const slug = `itest-${randomUUID().slice(0, 8)}-setup`;
const adminEmail = `${slug}@example.test`;

describe("Clinic setup", { skip: !configured && "DATABASE_URL is not set" }, () => {
  after(async () => {
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.organization.deleteMany({ where: { slug } });
    await prisma.$disconnect();
  });

  it("creates the clinic, its admin with a one-time password, and the starter kit", async () => {
    const result = await createOrganization({
      name: "Setup Test Clinic",
      slug,
      facilityName: "Setup Test, Kondapur",
      facilityCode: "stk",
      phone: "98765 43210",
      adminName: "Test Admin",
      adminEmail: adminEmail.toUpperCase(),
    });

    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug },
      include: {
        facilities: { include: { departments: true } },
        templates: true,
        workflows: true,
        integrations: true,
        memberships: { include: { user: true } },
      },
    });
    assert.equal(org.facilities[0].code, "STK");
    assert.equal(org.facilities[0].phone, "+919876543210");
    assert.equal(org.facilities[0].departments[0].name, "General Medicine");
    assert.equal(org.workflows.length, 6);
    assert.ok(org.workflows.every((w) => w.enabled));
    assert.ok(org.integrations.every((i) => i.status === "NOT_CONFIGURED"), "messages stay simulated");

    const [admin] = org.memberships;
    assert.equal(admin.role, "HOSPITAL_ADMIN");
    assert.equal(admin.user.email, adminEmail, "email stored lower-case");
    assert.equal(admin.user.mustChangePassword, true);
    assert.ok(await verifyPassword(result.temporaryPassword, admin.user.passwordHash!));
  });

  it("refuses a slug or an admin email already in use", async () => {
    const base = {
      name: "Again",
      facilityName: "Again",
      facilityCode: "AG",
      adminName: "Someone",
    };
    await assert.rejects(createOrganization({ ...base, slug, adminEmail: `other-${adminEmail}` }), /already exists/);
    await assert.rejects(createOrganization({ ...base, slug: `${slug}-2`, adminEmail }), /already has an account/);
    assert.equal(await prisma.organization.count({ where: { slug: `${slug}-2` } }), 0);
  });
});
