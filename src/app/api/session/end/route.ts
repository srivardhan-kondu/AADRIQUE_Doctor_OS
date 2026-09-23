import { signOut } from "@/lib/auth";

/**
 * Ends a session the account no longer honours — deactivated, removed from
 * the organization, or signed out everywhere by a password change (see
 * `requireActor`). Clearing the cookie has to happen in a route handler; a
 * page can only redirect here.
 */
export async function GET(): Promise<never> {
  return signOut({ redirectTo: "/sign-in?ended=1" });
}
