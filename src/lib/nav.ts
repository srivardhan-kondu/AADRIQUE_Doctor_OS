import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  Building2,
  CalendarDays,
  ClipboardList,
  Gauge,
  HeartPulse,
  IdCard,
  LayoutDashboard,
  MessageSquare,
  Repeat2,
  Settings,
  Sparkles,
  Stethoscope,
  Users,
  UsersRound,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import type { AddOn } from "@/lib/add-ons";
import type { Workspace } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Single-key shortcut, pressed after `g` (e.g. `g` then `q` → queue). */
  shortcut?: string;
  /** Marks nav entries whose count is driven by live data. */
  counter?: "queue" | "messages" | "followups" | "notifications";
  /** Belongs to an add-on; marked with a lock when the clinic has not enabled it. */
  addOn?: AddOn;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/** Spec §4 — main navigation per workspace. */
export const NAV: Record<Workspace, NavSection[]> = {
  doctor: [
    {
      items: [
        { label: "Home", href: "/doctor", icon: LayoutDashboard, shortcut: "h" },
        { label: "My Queue", href: "/doctor/queue", icon: Users, shortcut: "q", counter: "queue" },
        { label: "Appointments", href: "/doctor/appointments", icon: CalendarDays, shortcut: "a" },
        { label: "Patients", href: "/doctor/patients", icon: UsersRound, shortcut: "p" },
        { label: "Consultations", href: "/doctor/consultations", icon: Stethoscope, shortcut: "c" },
      ],
    },
    {
      label: "Continuity",
      items: [
        { label: "Follow-ups", href: "/doctor/follow-ups", icon: Repeat2, shortcut: "f", counter: "followups", addOn: "followUps" },
        { label: "Messages", href: "/doctor/messages", icon: MessageSquare, shortcut: "m", counter: "messages", addOn: "messaging" },
      ],
    },
    {
      label: "Insight",
      items: [
        { label: "Analytics", href: "/doctor/analytics", icon: BarChart3, addOn: "analytics" },
        { label: "AI Copilot", href: "/doctor/copilot", icon: Sparkles, addOn: "aiCopilot" },
      ],
    },
  ],

  nurse: [
    {
      items: [
        { label: "Vitals Station", href: "/nurse", icon: HeartPulse, shortcut: "h", counter: "queue" },
      ],
    },
  ],

  reception: [
    {
      items: [
        { label: "Front Desk", href: "/reception", icon: LayoutDashboard, shortcut: "h" },
        { label: "Today's Queue", href: "/reception/queue", icon: Users, shortcut: "q", counter: "queue" },
        { label: "Appointments", href: "/reception/appointments", icon: CalendarDays, shortcut: "a" },
        { label: "Patients", href: "/reception/patients", icon: UsersRound, shortcut: "p" },
        { label: "Notifications", href: "/reception/notifications", icon: Bell, counter: "notifications" },
      ],
    },
  ],

  admin: [
    {
      items: [
        { label: "Overview", href: "/admin", icon: LayoutDashboard, shortcut: "h" },
      ],
    },
    {
      label: "Organisation",
      items: [
        { label: "Doctors", href: "/admin/doctors", icon: Stethoscope },
        { label: "Departments", href: "/admin/departments", icon: Building2 },
        { label: "Patients", href: "/admin/patients", icon: UsersRound, shortcut: "p" },
        { label: "Staff", href: "/admin/staff", icon: IdCard },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Operations", href: "/admin/operations", icon: Activity },
        { label: "Reports", href: "/admin/reports", icon: BarChart3 },
        { label: "Audit Log", href: "/admin/audit", icon: ClipboardList },
      ],
    },
    {
      label: "Platform",
      items: [
        { label: "Communications", href: "/admin/communications", icon: MessageSquare },
        { label: "AI Assistants", href: "/admin/ai", icon: Sparkles },
        { label: "Integrations", href: "/admin/integrations", icon: Blocks },
        { label: "Settings", href: "/admin/settings", icon: Settings },
      ],
    },
  ],
};

export const WORKSPACE_META: Record<
  Workspace,
  { label: string; href: string; icon: LucideIcon; description: string }
> = {
  doctor: {
    label: "Doctor",
    href: "/doctor",
    icon: Stethoscope,
    description: "Clinical command center",
  },
  nurse: {
    label: "Nursing",
    href: "/nurse",
    icon: HeartPulse,
    description: "Vitals for today's patients",
  },
  reception: {
    label: "Front Desk",
    href: "/reception",
    icon: Gauge,
    description: "Registration, queue and booking",
  },
  admin: {
    label: "Admin",
    href: "/admin",
    icon: Building2,
    description: "Organisation and platform control",
  },
};

/**
 * Spec §3 — where each role starts its day. The front desk lands on the desk,
 * not on a doctor's command center it has no use for.
 */
export function homeFor(role: Role): string {
  switch (role) {
    case "HOSPITAL_ADMIN":
    case "SUPER_ADMIN":
      return "/admin";
    case "RECEPTIONIST":
    case "STAFF":
      return "/reception";
    case "NURSE":
      return "/nurse";
    default:
      return "/doctor";
  }
}

/** Flattened nav, used by the command palette's navigation results. */
export function flatNav(workspace: Workspace): NavItem[] {
  return NAV[workspace].flatMap((section) => section.items);
}

/** Resolves which workspace a pathname belongs to. */
export function workspaceFromPath(pathname: string): Workspace {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/reception")) return "reception";
  if (pathname.startsWith("/nurse")) return "nurse";
  return "doctor";
}

/**
 * Active-state test. An item is active on exact match, or when the pathname is
 * a deeper segment of it — but a workspace root never matches its children.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  const isWorkspaceRoot = href.split("/").filter(Boolean).length === 1;
  if (isWorkspaceRoot) return false;
  return pathname.startsWith(`${href}/`);
}
