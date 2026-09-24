/**
 * Shared domain types for the app shell.
 *
 * Anything the database also describes is re-exported from the generated
 * Prisma enums, so there is exactly one definition of a role, a queue state or
 * an appointment status across the schema, the permission matrix and the UI.
 */

/**
 * Spec §21 — RBAC roles.
 *
 * Re-exported from the generated Prisma enums so the database, the permission
 * matrix and the UI can never drift apart.
 */
export type { Role } from "@/generated/prisma/enums";
import type { Role } from "@/generated/prisma/enums";

/** The three workspaces the shell can render (spec §4). */
export type Workspace = "doctor" | "nurse" | "reception" | "admin";

export const WORKSPACE_FOR_ROLE: Record<Role, Workspace> = {
  SUPER_ADMIN: "admin",
  HOSPITAL_ADMIN: "admin",
  DOCTOR: "doctor",
  NURSE: "doctor",
  RECEPTIONIST: "reception",
  STAFF: "reception",
  PATIENT: "reception",
};

/** Spec §5.1 — the patient flow stages visualised on the dashboard. */
export type { PatientFlowStage } from "@/generated/prisma/enums";

/** Spec §11 — appointment lifecycle. */
export type { AppointmentStatus } from "@/generated/prisma/enums";

/** Spec §20 — notification priority levels. */
export type { NotificationLevel } from "@/generated/prisma/enums";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** The doctor profile id, when this user is a clinician. */
  doctorId: string | null;
  department: string | null;
  facility: string;
  organization: string;
  avatarUrl?: string;
  online: boolean;
}
