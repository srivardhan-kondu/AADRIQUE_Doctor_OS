import { Permission, Role } from "@/generated/prisma/enums";

/**
 * Spec §21 — the default role → permission matrix.
 *
 * This is the baseline every organization starts from. Rows in the
 * `RolePermission` table override it per organization, in either direction:
 * a row can grant a permission this matrix withholds, or revoke one it allows.
 *
 * Read this as a security boundary, not a UI hint. The client may hide what a
 * user cannot do, but the decision that matters is made on the server — see
 * `assertPermission` in ./index.ts.
 */

/** Everything. Only ever held by the platform owner. */
const ALL_PERMISSIONS = Object.values(Permission);

/** Reading a patient's clinical record. */
const CLINICAL_READ = [
  Permission.PATIENT_READ,
  Permission.CONSULTATION_READ,
  Permission.PRESCRIPTION_READ,
  Permission.VITALS_READ,
  Permission.LAB_READ,
] as const;

const FRONT_DESK = [
  Permission.PATIENT_READ,
  Permission.PATIENT_CREATE,
  Permission.PATIENT_UPDATE,
  Permission.APPOINTMENT_READ,
  Permission.APPOINTMENT_CREATE,
  Permission.APPOINTMENT_UPDATE,
  Permission.APPOINTMENT_CANCEL,
  Permission.QUEUE_READ,
  Permission.QUEUE_MANAGE,
  Permission.COMMUNICATION_READ,
  Permission.COMMUNICATION_SEND,
  Permission.FOLLOWUP_READ,
] as const;

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [Role.SUPER_ADMIN]: ALL_PERMISSIONS,

  /**
   * Runs the hospital, but does not practise in it. Deliberately excludes
   * CONSULTATION_SIGN and PRESCRIPTION_CREATE: signing a clinical record is an
   * act of clinical responsibility, not an administrative one (spec §10).
   */
  [Role.HOSPITAL_ADMIN]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_CREATE,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_DELETE,
    Permission.CONSULTATION_READ,
    Permission.APPOINTMENT_READ,
    Permission.APPOINTMENT_CREATE,
    Permission.APPOINTMENT_UPDATE,
    Permission.APPOINTMENT_CANCEL,
    Permission.QUEUE_READ,
    Permission.QUEUE_MANAGE,
    Permission.PRESCRIPTION_READ,
    Permission.VITALS_READ,
    Permission.LAB_READ,
    Permission.COMMUNICATION_READ,
    Permission.COMMUNICATION_SEND,
    Permission.COMMUNICATION_TEMPLATE_MANAGE,
    Permission.FOLLOWUP_READ,
    Permission.FOLLOWUP_MANAGE,
    Permission.ANALYTICS_READ,
    Permission.AUDIT_READ,
    Permission.AI_USE,
    Permission.AI_MANAGE,
    Permission.ADMIN_MANAGE,
    Permission.INTEGRATION_MANAGE,
  ],

  [Role.DOCTOR]: [
    ...CLINICAL_READ,
    Permission.PATIENT_CREATE,
    Permission.PATIENT_UPDATE,
    Permission.CONSULTATION_CREATE,
    Permission.CONSULTATION_UPDATE,
    Permission.CONSULTATION_SIGN,
    Permission.APPOINTMENT_READ,
    Permission.APPOINTMENT_CREATE,
    Permission.APPOINTMENT_UPDATE,
    Permission.APPOINTMENT_CANCEL,
    Permission.QUEUE_READ,
    Permission.QUEUE_MANAGE,
    Permission.PRESCRIPTION_CREATE,
    Permission.VITALS_RECORD,
    Permission.LAB_UPLOAD,
    Permission.COMMUNICATION_READ,
    Permission.COMMUNICATION_SEND,
    Permission.FOLLOWUP_READ,
    Permission.FOLLOWUP_MANAGE,
    Permission.ANALYTICS_READ,
    Permission.AI_USE,
  ],

  /**
   * Prepares patients and records vitals. Can read the clinical record to do
   * that job, but never writes to the consultation or signs anything.
   */
  [Role.NURSE]: [
    ...CLINICAL_READ,
    Permission.APPOINTMENT_READ,
    Permission.QUEUE_READ,
    Permission.QUEUE_MANAGE,
    Permission.VITALS_RECORD,
    Permission.LAB_UPLOAD,
    Permission.FOLLOWUP_READ,
  ],

  [Role.RECEPTIONIST]: [...FRONT_DESK],

  /** General operational staff — visibility without the ability to change. */
  [Role.STAFF]: [
    Permission.PATIENT_READ,
    Permission.APPOINTMENT_READ,
    Permission.QUEUE_READ,
    Permission.COMMUNICATION_READ,
    Permission.FOLLOWUP_READ,
  ],

  /**
   * A patient has no permissions inside the staff application. Patient-facing
   * surfaces authorize against the patient's own records by a separate path,
   * never by holding a staff permission.
   */
  [Role.PATIENT]: [],
};
