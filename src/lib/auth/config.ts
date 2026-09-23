import type { NextAuthConfig } from "next-auth";
// Pulls the module into the program so the augmentation below resolves.
import type {} from "next-auth/jwt";
import type { Role } from "@/generated/prisma/enums";

/**
 * Auth.js configuration that is safe to load in the edge runtime.
 *
 * The middleware runs on the edge, where Prisma and `node:crypto` scrypt are
 * unavailable — so the credentials provider (which needs both) lives in
 * ./index.ts and is merged in there. This file holds only what the middleware
 * needs: the session shape, the callbacks and the page routes.
 */

/** What the session carries. Mirrored into the JWT by the `jwt` callback. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  facilityId: string | null;
  doctorId: string | null;
  department: string | null;
  facilityName: string;
  organizationName: string;
  /** The account's session version at sign-in; see User.sessionVersion. */
  sessionVersion: number;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
  interface User extends Omit<SessionUser, "id"> {
    id?: string;
  }
}

declare module "next-auth/jwt" {
  // The JWT carries exactly the session user. Spelled out rather than
  // `extends SessionUser {}`, which lints as an empty interface.
  interface JWT extends Record<string, unknown> {
    id: string;
    role: Role;
    organizationId: string;
    facilityId: string | null;
    doctorId: string | null;
    department: string | null;
    facilityName: string;
    organizationName: string;
    sessionVersion: number;
  }
}

export const authConfig = {
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },

  session: {
    // The credentials provider requires JWT sessions. The Session table stays
    // in the schema for the OAuth providers a later part may add.
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // A clinical shift, not a fortnight.
  },

  callbacks: {
    /**
     * Copies the tenant and role onto the token at sign-in. Everything the
     * server authorizes against is put here once, so no request has to trust a
     * value that arrived from the client.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub!;
        token.name = user.name;
        token.email = user.email;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.facilityId = user.facilityId;
        token.doctorId = user.doctorId;
        token.department = user.department;
        token.facilityName = user.facilityName;
        token.organizationName = user.organizationName;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },

    session({ session, token }) {
      session.user = {
        // Auth.js widens `session.user` to include AdapterUser, which this
        // JWT-only setup never produces. Satisfied here rather than cast away.
        emailVerified: null,
        id: token.id,
        // Auth.js types these as optional on the base JWT; the `jwt` callback
        // above always sets them, so the fallback is only ever defensive.
        name: token.name ?? "",
        email: token.email ?? "",
        role: token.role,
        organizationId: token.organizationId,
        facilityId: token.facilityId,
        doctorId: token.doctorId,
        department: token.department,
        facilityName: token.facilityName,
        organizationName: token.organizationName,
        sessionVersion:
          typeof token.sessionVersion === "number" ? token.sessionVersion : 0,
      };
      return session;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
