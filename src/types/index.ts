/**
 * Shared domain types for the app shell.
 *
 * These are the shell-level contracts only. The full clinical model lands with
 * Prisma in Part 2 (spec §25); anything defined here that the schema also
 * describes will be re-exported from the generated types at that point.
 */

/** Spec §21 — RBAC roles. */
export type Role =
  | "SUPER_ADMIN"
  | "HOSPITAL_ADMIN"
  | "DOCTOR"
  | "NURSE"
  | "RECEPTIONIST"
  | "STAFF"
  | "PATIENT";

/** The three workspaces the shell can render (spec §4). */
export type Workspace = "doctor" | "reception" | "admin";

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
export type PatientFlowStage =
  | "REGISTERED"
  | "WAITING"
  | "VITALS"
  | "WITH_DOCTOR"
  | "COMPLETED"
  | "FOLLOW_UP";

/** Spec §11 — appointment lifecycle. */
export type AppointmentStatus =
  | "SCHEDULED"
  | "CHECKED_IN"
  | "WAITING"
  | "IN_CONSULTATION"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";

/** Spec §20 — notification priority levels. */
export type NotificationLevel = "NORMAL" | "IMPORTANT" | "ALERT" | "AI";

export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
  department?: string;
  facility: string;
  organization: string;
  avatarUrl?: string;
  online: boolean;
}
