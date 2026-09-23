import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { RequestActor } from "@/server/context";
import { ServiceError } from "@/server/services/errors";

/**
 * Throwaway tenants for the integration suites (spec §53).
 *
 * Each builds a real organization — facility, department, a doctor, a front
 * desk user, one patient, the token template and workflows — and
 * `removeTenant` deletes it again. Organizations cascade to everything beneath
 * them; users are not owned by one, so they are removed explicitly, the same
 * way the seed resets the demo.
 */

const RUN = randomUUID().slice(0, 8);

export interface Tenant {
  organizationId: string;
  facilityId: string;
  departmentId: string;
  doctorId: string;
  patientId: string;
  reception: RequestActor;
  doctor: RequestActor;
  admin: RequestActor;
  userIds: string[];
}

export async function createTenant(label: string): Promise<Tenant> {
  const slug = `itest-${RUN}-${label}`;

  const organization = await prisma.organization.create({
    data: { name: `Integration ${label}`, slug },
    select: { id: true },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: organization.id,
      name: "Test Clinic",
      code: "TC",
      phone: "080 4000 0000",
    },
    select: { id: true, name: true },
  });
  const department = await prisma.department.create({
    data: { facilityId: facility.id, name: "General Medicine", code: "GM" },
    select: { id: true },
  });

  const user = (role: Role, name: string) =>
    prisma.user.create({
      data: {
        email: `${slug}-${role.toLowerCase()}@example.test`,
        name,
        memberships: {
          create: {
            organizationId: organization.id,
            facilityId: facility.id,
            role,
          },
        },
      },
      select: { id: true, email: true, name: true },
    });

  const doctorUser = await user("DOCTOR", "Dr. Test Rao");
  const receptionUser = await user("RECEPTIONIST", "Test Front Desk");
  const adminUser = await user("HOSPITAL_ADMIN", "Test Admin");

  const doctor = await prisma.doctorProfile.create({
    data: {
      userId: doctorUser.id,
      facilityId: facility.id,
      departmentId: department.id,
      tokenPrefix: "T",
    },
    select: { id: true },
  });

  const patient = await prisma.patient.create({
    data: {
      organizationId: organization.id,
      facilityId: facility.id,
      mrn: `IT-${RUN}`,
      firstName: "Asha",
      lastName: "Test",
      phone: "9876543210",
      smsOptIn: true,
    },
    select: { id: true },
  });

  await prisma.messageTemplate.create({
    data: {
      organizationId: organization.id,
      key: "token_generated",
      name: "Token generated",
      channel: "SMS",
      body: "Your token is {{token}}. Current token is {{currentToken}}. Estimated wait {{waitMinutes}} minutes.",
      variables: ["token", "currentToken", "waitMinutes"],
    },
  });

  // Spec §28 — the token notification is an automation, not a code path.
  await prisma.workflow.create({
    data: {
      organizationId: organization.id,
      name: "Token notification",
      trigger: "TOKEN_GENERATED",
      enabled: true,
      steps: [
        { type: "CONDITION", field: "patient.smsOptIn", operator: "EQUALS", value: true },
        { type: "ACTION", action: "SEND_MESSAGE", templateKey: "token_generated", channel: "SMS" },
      ],
    },
  });

  // The feedback request waits after a completed visit; the run parks on
  // the WAIT, which is enough to prove the trigger reached it.
  await prisma.workflow.create({
    data: {
      organizationId: organization.id,
      name: "Feedback request",
      trigger: "APPOINTMENT_COMPLETED",
      enabled: true,
      steps: [
        { type: "WAIT", duration: { hours: 2 } },
        { type: "ACTION", action: "CREATE_FEEDBACK_RECORD" },
      ],
    },
  });

  const actor = (
    u: { id: string; email: string; name: string },
    role: Role,
    doctorId: string | null,
  ): RequestActor => ({
    userId: u.id,
    organizationId: organization.id,
    facilityId: facility.id,
    role,
    overrides: [],
    name: u.name,
    email: u.email,
    doctorId,
    department: "General Medicine",
    facilityName: facility.name,
    organizationName: `Integration ${label}`,
  });

  return {
    organizationId: organization.id,
    facilityId: facility.id,
    departmentId: department.id,
    doctorId: doctor.id,
    patientId: patient.id,
    reception: actor(receptionUser, "RECEPTIONIST", null),
    doctor: actor(doctorUser, "DOCTOR", doctor.id),
    admin: actor(adminUser, "HOSPITAL_ADMIN", null),
    userIds: [doctorUser.id, receptionUser.id, adminUser.id],
  };
}

export async function removeTenant(tenant: Tenant | undefined) {
  if (!tenant) return;
  // Everyone with a membership here, including users a test created.
  await prisma.user.deleteMany({
    where: {
      OR: [
        { id: { in: tenant.userIds } },
        { memberships: { some: { organizationId: tenant.organizationId } } },
      ],
    },
  });
  await prisma.organization.deleteMany({ where: { id: tenant.organizationId } });
}

export async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ServiceError, String(error));
    return error;
  }
  assert.fail("expected the service to refuse");
}

