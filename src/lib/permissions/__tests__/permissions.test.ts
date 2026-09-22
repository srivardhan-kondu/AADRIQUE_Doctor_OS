import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Permission, Role } from "@/generated/prisma/enums";
import {
  type Actor,
  PermissionError,
  ROLE_PERMISSIONS,
  TenantError,
  assertPermission,
  assertTenant,
  effectivePermissions,
  facilityScope,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  tenantScope,
} from "@/lib/permissions";

/** Spec §53 — permissions and tenant isolation are unit tested. */

function actor(role: Role, overrides: Actor["overrides"] = []): Actor {
  return {
    userId: "usr_1",
    organizationId: "org_1",
    facilityId: null,
    role,
    overrides,
  };
}

describe("role matrix", () => {
  it("covers every role", () => {
    for (const role of Object.values(Role)) {
      assert.ok(
        Array.isArray(ROLE_PERMISSIONS[role]),
        `${role} has no entry in the matrix`,
      );
    }
  });

  it("gives SUPER_ADMIN every permission", () => {
    const effective = effectivePermissions(Role.SUPER_ADMIN);
    for (const permission of Object.values(Permission)) {
      assert.ok(effective.has(permission), `SUPER_ADMIN missing ${permission}`);
    }
  });

  it("gives PATIENT no staff permission", () => {
    assert.equal(effectivePermissions(Role.PATIENT).size, 0);
  });

  it("lets only doctors sign a consultation", () => {
    const signers = Object.values(Role).filter((role) =>
      effectivePermissions(role).has(Permission.CONSULTATION_SIGN),
    );
    assert.deepEqual(signers.sort(), [Role.DOCTOR, Role.SUPER_ADMIN].sort());
  });

  it("does not let a hospital admin create a prescription", () => {
    assert.equal(
      hasPermission(actor(Role.HOSPITAL_ADMIN), Permission.PRESCRIPTION_CREATE),
      false,
    );
  });

  it("does not let a nurse write to the consultation record", () => {
    const nurse = actor(Role.NURSE);
    assert.equal(hasPermission(nurse, Permission.CONSULTATION_READ), true);
    assert.equal(hasPermission(nurse, Permission.CONSULTATION_UPDATE), false);
    assert.equal(hasPermission(nurse, Permission.CONSULTATION_SIGN), false);
  });

  it("lets a nurse record vitals but not a receptionist", () => {
    assert.equal(hasPermission(actor(Role.NURSE), Permission.VITALS_RECORD), true);
    assert.equal(
      hasPermission(actor(Role.RECEPTIONIST), Permission.VITALS_RECORD),
      false,
    );
  });

  it("does not let a receptionist read the clinical record", () => {
    const desk = actor(Role.RECEPTIONIST);
    assert.equal(hasPermission(desk, Permission.PATIENT_READ), true);
    assert.equal(hasPermission(desk, Permission.CONSULTATION_READ), false);
    assert.equal(hasPermission(desk, Permission.LAB_READ), false);
  });

  it("gives STAFF no write permission at all", () => {
    const writes = [
      Permission.PATIENT_CREATE,
      Permission.PATIENT_UPDATE,
      Permission.PATIENT_DELETE,
      Permission.APPOINTMENT_CREATE,
      Permission.QUEUE_MANAGE,
      Permission.COMMUNICATION_SEND,
      Permission.CONSULTATION_UPDATE,
    ];
    assert.equal(hasAnyPermission(actor(Role.STAFF), writes), false);
  });

  it("restricts admin management to admin roles", () => {
    const managers = Object.values(Role).filter((role) =>
      effectivePermissions(role).has(Permission.ADMIN_MANAGE),
    );
    assert.deepEqual(
      managers.sort(),
      [Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN].sort(),
    );
  });
});

describe("per-organization overrides", () => {
  it("grants a permission the matrix withholds", () => {
    const desk = actor(Role.RECEPTIONIST, [
      {
        role: Role.RECEPTIONIST,
        permission: Permission.ANALYTICS_READ,
        granted: true,
      },
    ]);
    assert.equal(hasPermission(desk, Permission.ANALYTICS_READ), true);
  });

  it("revokes a permission the matrix allows", () => {
    const doctor = actor(Role.DOCTOR, [
      {
        role: Role.DOCTOR,
        permission: Permission.COMMUNICATION_SEND,
        granted: false,
      },
    ]);
    assert.equal(hasPermission(doctor, Permission.COMMUNICATION_SEND), false);
  });

  it("ignores an override aimed at a different role", () => {
    const doctor = actor(Role.DOCTOR, [
      {
        role: Role.RECEPTIONIST,
        permission: Permission.CONSULTATION_SIGN,
        granted: false,
      },
    ]);
    assert.equal(hasPermission(doctor, Permission.CONSULTATION_SIGN), true);
  });

  it("does not mutate the shared matrix", () => {
    const before = ROLE_PERMISSIONS[Role.STAFF].length;
    effectivePermissions(Role.STAFF, [
      { role: Role.STAFF, permission: Permission.ADMIN_MANAGE, granted: true },
    ]);
    assert.equal(ROLE_PERMISSIONS[Role.STAFF].length, before);
  });
});

describe("assertPermission", () => {
  it("passes when the role allows it", () => {
    assert.doesNotThrow(() =>
      assertPermission(actor(Role.DOCTOR), Permission.CONSULTATION_SIGN),
    );
  });

  it("throws PermissionError when it does not", () => {
    assert.throws(
      () => assertPermission(actor(Role.NURSE), Permission.CONSULTATION_SIGN),
      (error: unknown) => {
        assert.ok(error instanceof PermissionError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );
  });
});

describe("hasAllPermissions", () => {
  it("requires every permission", () => {
    const doctor = actor(Role.DOCTOR);
    assert.equal(
      hasAllPermissions(doctor, [
        Permission.CONSULTATION_CREATE,
        Permission.CONSULTATION_SIGN,
      ]),
      true,
    );
    assert.equal(
      hasAllPermissions(doctor, [
        Permission.CONSULTATION_SIGN,
        Permission.ADMIN_MANAGE,
      ]),
      false,
    );
  });
});

describe("tenant isolation (spec §22)", () => {
  it("accepts a record from the actor's organization", () => {
    assert.doesNotThrow(() =>
      assertTenant(actor(Role.DOCTOR), { organizationId: "org_1" }),
    );
  });

  it("rejects a record from another organization", () => {
    assert.throws(
      () => assertTenant(actor(Role.DOCTOR), { organizationId: "org_2" }),
      TenantError,
    );
  });

  it("rejects a missing record the same way, leaking nothing", () => {
    const missing = (() => {
      try {
        assertTenant(actor(Role.DOCTOR), null);
      } catch (error) {
        return error as Error;
      }
    })();

    const foreign = (() => {
      try {
        assertTenant(actor(Role.DOCTOR), { organizationId: "org_2" });
      } catch (error) {
        return error as Error;
      }
    })();

    assert.equal(missing?.message, foreign?.message);
  });

  it("rejects even for a SUPER_ADMIN acting outside their organization", () => {
    assert.throws(
      () => assertTenant(actor(Role.SUPER_ADMIN), { organizationId: "org_2" }),
      TenantError,
    );
  });

  it("builds a scope filter carrying the organization", () => {
    assert.deepEqual(tenantScope(actor(Role.DOCTOR)), {
      organizationId: "org_1",
    });
  });
});

describe("facilityScope", () => {
  it("narrows to the facility when the membership is scoped", () => {
    const scoped: Actor = { ...actor(Role.NURSE), facilityId: "fac_1" };
    assert.deepEqual(facilityScope(scoped), {
      organizationId: "org_1",
      facilityId: "fac_1",
    });
  });

  it("stays organization-wide when it is not", () => {
    assert.deepEqual(facilityScope(actor(Role.HOSPITAL_ADMIN)), {
      organizationId: "org_1",
    });
  });
});
