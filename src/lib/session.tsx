"use client";

import * as React from "react";
import type { CurrentUser, Role } from "@/types";

/**
 * Shell-level session context.
 *
 * NOTE: this is a deliberate placeholder for the app shell only. Part 2 of the
 * build replaces the provider's value with a real Auth.js session and moves
 * every authorization decision server-side (spec §21 — "do not rely only on
 * frontend hiding"). Nothing here grants access to data; it only decides which
 * chrome the shell renders.
 */

const DEMO_USERS: Record<Role, CurrentUser> = {
  DOCTOR: {
    id: "usr_doctor_ananya",
    name: "Dr. Ananya Rao",
    role: "DOCTOR",
    department: "General Medicine",
    facility: "AADRIQUE Medical Center",
    organization: "AADRIQUE Health",
    online: true,
  },
  NURSE: {
    id: "usr_nurse_kavitha",
    name: "Kavitha Nair",
    role: "NURSE",
    department: "General Medicine",
    facility: "AADRIQUE Medical Center",
    organization: "AADRIQUE Health",
    online: true,
  },
  RECEPTIONIST: {
    id: "usr_front_desk_arjun",
    name: "Arjun Menon",
    role: "RECEPTIONIST",
    department: "Front Desk",
    facility: "AADRIQUE Medical Center",
    organization: "AADRIQUE Health",
    online: true,
  },
  HOSPITAL_ADMIN: {
    id: "usr_admin_sneha",
    name: "Sneha Reddy",
    role: "HOSPITAL_ADMIN",
    department: "Administration",
    facility: "AADRIQUE Medical Center",
    organization: "AADRIQUE Health",
    online: true,
  },
  SUPER_ADMIN: {
    id: "usr_super_admin",
    name: "Platform Owner",
    role: "SUPER_ADMIN",
    facility: "All facilities",
    organization: "AADRIQUE Health",
    online: true,
  },
  STAFF: {
    id: "usr_staff",
    name: "Operations Staff",
    role: "STAFF",
    facility: "AADRIQUE Medical Center",
    organization: "AADRIQUE Health",
    online: true,
  },
  PATIENT: {
    id: "usr_patient",
    name: "Priya Sharma",
    role: "PATIENT",
    facility: "AADRIQUE Medical Center",
    organization: "AADRIQUE Health",
    online: false,
  },
};

interface SessionContextValue {
  user: CurrentUser;
  /** Demo affordance only — removed when real auth lands. */
  setRole: (role: Role) => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initialRole = "DOCTOR",
}: {
  children: React.ReactNode;
  initialRole?: Role;
}) {
  const [role, setRole] = React.useState<Role>(initialRole);
  const value = React.useMemo(
    () => ({ user: DEMO_USERS[role], setRole }),
    [role],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export { DEMO_USERS };
