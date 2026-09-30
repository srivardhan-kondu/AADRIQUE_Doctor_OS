import "server-only";
import { prisma } from "@/lib/db";
import { landingFor } from "@/lib/workspaces";

/**
 * Where a sign-in lands (spec §3), resolved before the sign-in itself.
 *
 * Resolved here so the sign-in response goes straight to the workspace, not
 * to "/" for a second redirect by role. The membership chosen matches
 * `authorize` — the first active one in an active organization.
 *
 * A return link (`next`) is kept only when it is in one of that role's own
 * workspaces — see `landingFor`.
 *
 * The answer is only used after the credentials are accepted, so it reveals
 * nothing about which accounts exist.
 */
export async function landingForEmail(
  email: string,
  next: string | null | undefined,
): Promise<string> {
  const membership = await prisma.membership.findFirst({
    where: {
      active: true,
      user: { email: email.trim().toLowerCase() },
      organization: { active: true },
    },
    orderBy: { createdAt: "asc" },
    select: { role: true },
  });
  return landingFor(membership?.role ?? "DOCTOR", next);
}
