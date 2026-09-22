import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
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

      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

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
