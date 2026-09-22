"use client";

import * as React from "react";
import type { CurrentUser } from "@/types";

/**
 * The signed-in user, provided to client components.
 *
 * The value is resolved on the server (see src/server/context.ts) and passed
 * down. Nothing here authorizes anything — it decides which chrome to render.
 * Every real decision is made server-side (spec §21).
 */

const SessionContext = React.createContext<CurrentUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
  );
}

export function useSession(): CurrentUser {
  const user = React.useContext(SessionContext);
  if (!user) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return user;
}
