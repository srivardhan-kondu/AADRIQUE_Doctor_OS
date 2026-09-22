import { AppShell } from "@/components/shell/app-shell";
import { SHELL_COUNTERS, SHELL_NOTIFICATIONS } from "@/lib/shell-demo";

/**
 * Every workspace route renders inside the shell. The counters and
 * notifications below are shell-level placeholders; Part 2 replaces them with
 * tenant-scoped server data.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell counters={SHELL_COUNTERS} notifications={SHELL_NOTIFICATIONS}>
      {children}
    </AppShell>
  );
}
