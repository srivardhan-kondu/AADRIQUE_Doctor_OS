import type { ShellNotification } from "@/components/shell/notification-center";
import type { NavCounters } from "@/components/shell/sidebar";

/**
 * Shell-level placeholder data.
 *
 * Scoped deliberately to the chrome — nav counters and the notification tray —
 * so the shell can be reviewed at full fidelity before the data layer exists.
 * Part 2 replaces this module with tenant-scoped queries; nothing else imports
 * it.
 */

export const SHELL_COUNTERS: NavCounters = {
  queue: 7,
  followups: 8,
  messages: 3,
  notifications: 4,
};

export const SHELL_NOTIFICATIONS: ShellNotification[] = [
  {
    id: "ntf_queue_threshold",
    level: "ALERT",
    title: "Queue exceeding configured capacity",
    body: "General Medicine has 7 patients waiting against a threshold of 5.",
    at: "10:48",
    read: false,
  },
  {
    id: "ntf_wait_threshold",
    level: "IMPORTANT",
    title: "Patient waiting beyond threshold",
    body: "Token A020 · Meena Rao has been waiting 17 minutes.",
    at: "10:41",
    read: false,
  },
  {
    id: "ntf_ai_brief",
    level: "AI",
    title: "Pre-consultation brief ready",
    body: "Prepared for Priya Sharma · Review before you open the visit.",
    at: "10:36",
    read: false,
  },
  {
    id: "ntf_appointment",
    level: "NORMAL",
    title: "New appointment booked",
    body: "Ravi Kumar · Tomorrow, 11:15 AM · Follow-up.",
    at: "10:12",
    read: true,
  },
];
