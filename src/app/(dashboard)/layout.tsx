import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SessionProvider } from "@/lib/session";
import { getActor } from "@/server/context";
import { getShellData } from "@/server/services/shell";

/**
 * Every workspace route renders inside the shell, and only for a signed-in
 * user. The middleware redirects first; this is the server-side backstop that
 * actually holds the boundary.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const { counters, notifications, online } = await getShellData(actor);

  return (
    <SessionProvider
      user={{
        id: actor.userId,
        name: actor.name,
        email: actor.email,
        role: actor.role,
        doctorId: actor.doctorId,
        department: actor.department,
        facility: actor.facilityName,
        organization: actor.organizationName,
        online,
      }}
    >
      <AppShell counters={counters} notifications={notifications}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
