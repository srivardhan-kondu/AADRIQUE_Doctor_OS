import "server-only";
import { prisma } from "@/lib/db";
import { homeFor } from "@/lib/nav";

/**
 * Where a sign-in lands (spec §3), resolved before the sign-in itself.
 *
 * Resolved here so the sign-in response goes straight to the workspace, not
 * to "/" for a second redirect by role. The membership chosen matches
 * `authorize` — the first active one in an active organization.
 *
 * The answer is only used after the credentials are accepted, so it reveals
 * nothing about which accounts exist.
 */
export async function homeForEmail(email: string): Promise<string> {
  const membership = await prisma.membership.findFirst({
    where: {
      active: true,
      user: { email: email.trim().toLowerCase() },
      organization: { active: true },
    },
    orderBy: { createdAt: "asc" },
    select: { role: true },
  });
  return membership ? homeFor(membership.role) : "/doctor";
}
