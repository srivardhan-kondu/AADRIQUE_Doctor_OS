import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SIGN_IN_ACCOUNT_LIMIT,
  SIGN_IN_ADDRESS_LIMIT,
  callerAddress,
  rateLimit,
  resetRateLimit,
  signInKeys,
} from "@/lib/security/rate-limit";
import { authConfig } from "./config";
import { verifyPassword } from "./password";

/**
 * The full Auth.js setup, including the credentials provider.
 *
 * Node runtime only — it touches Prisma and scrypt. The middleware imports
 * `authConfig` instead.
 */

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      /**
       * Spec §31 — rate limiting lives here, not in the sign-in form.
       *
       * Every credential attempt passes through `authorize`, including ones
       * posted straight at `/api/auth/callback/credentials`. A limit on the
       * server action alone would guard the form and leave the endpoint it
       * submits to wide open.
       */
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // An unidentifiable caller shares one bucket rather than skipping it.
        const address =
          callerAddress(request?.headers ?? new Headers()) ?? "unknown";
        const keys = signInKeys(address, email);

        const [byAddress, byAccount] = await Promise.all([
          rateLimit(keys.address, SIGN_IN_ADDRESS_LIMIT),
          rateLimit(keys.account, SIGN_IN_ACCOUNT_LIMIT),
        ]);

        if (!byAddress.allowed || !byAccount.allowed) {
          // Refused exactly like a wrong password, so the limiter cannot be
          // used to learn which accounts exist.
          await verifyPassword(password, DUMMY_HASH);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: {
            doctorProfile: { include: { department: true } },
            memberships: {
              where: { active: true },
              include: {
                organization: { select: { id: true, name: true, active: true } },
                facility: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });

        // Verify against a dummy hash when the user does not exist, so a
        // missing account and a wrong password take the same time to reject.
        if (!user?.passwordHash) {
          await verifyPassword(password, DUMMY_HASH);
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid || !user.active) return null;

        const membership = user.memberships.find((m) => m.organization.active);
        if (!membership) return null;

        // A genuine sign-in clears the counters, so a user is never held back
        // by their own earlier typos.
        await Promise.all([
          resetRateLimit(keys.address),
          resetRateLimit(keys.account),
        ]);

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await prisma.auditLog.create({
          data: {
            organizationId: membership.organizationId,
            userId: user.id,
            action: "LOGIN",
            entityType: "User",
            entityId: user.id,
            summary: `${user.name} signed in`,
          },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
          organizationId: membership.organizationId,
          facilityId: membership.facilityId,
          doctorId: user.doctorProfile?.id ?? null,
          department: user.doctorProfile?.department?.name ?? null,
          facilityName: membership.facility?.name ?? membership.organization.name,
          organizationName: membership.organization.name,
        };
      },
    }),
  ],
});

/**
 * A structurally valid scrypt hash of a value nobody can supply. Used only to
 * burn the same CPU time on a missing account as on a real one.
 */
const DUMMY_HASH =
  "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
