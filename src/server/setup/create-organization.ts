import "server-only";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { temporaryPassword } from "@/lib/auth/temporary-password";
import { prisma } from "@/lib/db";
import { canonicalPhone } from "@/lib/phone";
import { STARTER_INTEGRATIONS, STARTER_TEMPLATES, STARTER_WORKFLOWS } from "./starter-kit";

/**
 * Spec §18 — setting up a real clinic.
 *
 * One organization, its first facility and department, and a hospital admin
 * with a one-time password, who then adds doctors and staff from the admin
 * workspace. The clinic starts with the standard templates and automations
 * and with its gateways listed as not configured, so messages stay
 * simulated until the admin connects one.
 *
 * Run through `npm run org:create`. Never touches another organization.
 */

export const newOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens")
    .min(3)
    .max(60),
  facilityName: z.string().trim().min(2).max(120),
  facilityCode: z.string().trim().toUpperCase().min(2).max(12),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  department: z.string().trim().min(2).max(80).default("General Medicine"),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
});

export type NewOrganization = z.input<typeof newOrganizationSchema>;

export async function createOrganization(input: NewOrganization): Promise<{
  organizationId: string;
  adminEmail: string;
  temporaryPassword: string;
  portalPath: string;
}> {
  const data = newOrganizationSchema.parse(input);

  if (await prisma.organization.findUnique({ where: { slug: data.slug }, select: { id: true } })) {
    throw new Error(`An organization with the slug "${data.slug}" already exists.`);
  }
  if (await prisma.user.findUnique({ where: { email: data.adminEmail }, select: { id: true } })) {
    throw new Error(`${data.adminEmail} already has an account. Use a different email for this clinic's admin.`);
  }

  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const phone = data.phone ? (canonicalPhone(data.phone) ?? data.phone) : null;

  const organizationId = await prisma.$transaction(
    async (tx) => {
      const organization = await tx.organization.create({
        data: { name: data.name, slug: data.slug },
        select: { id: true },
      });
      const facility = await tx.facility.create({
        data: {
          organizationId: organization.id,
          name: data.facilityName,
          code: data.facilityCode,
          city: data.city ?? null,
          phone,
        },
        select: { id: true },
      });
      await tx.department.create({
        data: {
          facilityId: facility.id,
          name: data.department,
          code: data.department.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "GEN",
        },
      });

      const admin = await tx.user.create({
        data: {
          email: data.adminEmail,
          name: data.adminName,
          passwordHash,
          mustChangePassword: true,
          memberships: {
            create: { organizationId: organization.id, role: "HOSPITAL_ADMIN" },
          },
        },
        select: { id: true },
      });

      await tx.messageTemplate.createMany({
        data: STARTER_TEMPLATES.map((t) => ({
          organizationId: organization.id,
          key: t.key,
          name: t.name,
          channel: t.channel,
          category: t.category,
          subject: t.subject ?? null,
          body: t.body,
          variables: t.variables,
        })),
      });
      await tx.workflow.createMany({
        data: STARTER_WORKFLOWS.map((w) => ({
          organizationId: organization.id,
          name: w.name,
          description: w.description,
          trigger: w.trigger,
          enabled: true,
          steps: w.steps,
        })),
      });
      await tx.integration.createMany({
        data: STARTER_INTEGRATIONS.map((i) => ({
          organizationId: organization.id,
          category: i.category,
          provider: i.provider,
          name: i.name,
          status: "NOT_CONFIGURED" as const,
        })),
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: admin.id,
          action: "RECORD_CREATED",
          entityType: "Organization",
          entityId: organization.id,
          summary: `Organization "${data.name}" set up, with ${data.adminEmail} as its admin`,
        },
      });
      return organization.id;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  return {
    organizationId,
    adminEmail: data.adminEmail,
    temporaryPassword: password,
    portalPath: `/portal/${data.slug}`,
  };
}
