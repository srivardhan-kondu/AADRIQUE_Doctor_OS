import "server-only";
import { hashPassword } from "@/lib/auth/password";
import { passwordProblem } from "@/lib/auth/password-policy";
import { createResetToken, resetTokenUserId, verifyResetToken } from "@/lib/auth/reset-token";
import { prisma } from "@/lib/db";
import { platformEmail } from "@/lib/messaging/platform";
import { rateLimit, resetRateLimit, signInKeys } from "@/lib/security/rate-limit";
import { ServiceError } from "./errors";

/**
 * Spec §31 — "I forgot my password".
 *
 * The answer never says whether an account exists. Where the deployment can
 * send email, the person gets a link valid for 30 minutes; where it cannot,
 * their clinic's administrators get a notification asking them to reset it
 * from Admin → Staff. Either way the request is audited.
 */

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;
const ADDRESS_LIMIT = { limit: 5, windowMs: 15 * 60_000 };
const ACCOUNT_LIMIT = { limit: 3, windowMs: 60 * 60_000 };

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export async function requestPasswordReset(
  rawEmail: string,
  address: string | null,
): Promise<{ via: "email" | "admin" | "none" }> {
  const email = rawEmail.trim().toLowerCase();
  const byAddress = await rateLimit(`reset:ip:${address ?? "unknown"}`, ADDRESS_LIMIT);
  if (!byAddress.allowed) {
    throw new ServiceError("VALIDATION", "Too many requests. Try again in a few minutes.");
  }
  // Past the per-account limit the answer is the same as for an unknown
  // email, so the limit cannot be used to probe for accounts either.
  const byAccount = await rateLimit(`reset:acct:${email}`, ACCOUNT_LIMIT);
  if (!byAccount.allowed) return { via: "none" };

  const user = await prisma.user.findFirst({
    where: { email, active: true, memberships: { some: { active: true } } },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      sessionVersion: true,
      memberships: { where: { active: true }, select: { organizationId: true }, take: 1 },
    },
  });
  if (!user) return { via: "none" };
  const organizationId = user.memberships[0].organizationId;

  const mailer = platformEmail();
  let via: "email" | "admin" = "admin";

  if (mailer) {
    const token = createResetToken({ userId: user.id, ...user }, secret());
    const link = `${process.env.APP_URL ?? ""}/reset-password?token=${encodeURIComponent(token)}`;
    const receipt = await mailer.send({
      channel: "EMAIL",
      to: user.email,
      subject: "Reset your AADRIQUE Doctor OS password",
      body: [
        `Hello ${user.name},`,
        "",
        "Someone asked to reset the password for this account. If it was you, open this link within 30 minutes:",
        "",
        link,
        "",
        "If it was not you, ignore this email — your password stays as it is.",
      ].join("\n"),
    });
    if (receipt.status !== "FAILED") via = "email";
    else console.error("Password-reset email failed", receipt.failureReason);
  }

  await prisma.$transaction(async (tx) => {
    if (via === "admin") {
      const admins = await tx.membership.findMany({
        where: { organizationId, active: true, role: { in: ["HOSPITAL_ADMIN", "SUPER_ADMIN"] }, user: { active: true } },
        select: { userId: true },
      });
      await tx.notification.createMany({
        data: admins
          .filter((a) => a.userId !== user.id)
          .map((a) => ({
            organizationId,
            userId: a.userId,
            level: "IMPORTANT" as const,
            title: "Password reset requested",
            body: `${user.name} (${user.email}) cannot sign in. Reset their password from Staff and hand them the one-time password.`,
            linkHref: "/admin/staff",
          })),
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        userId: user.id,
        action: "RECORD_UPDATED",
        entityType: "User",
        entityId: user.id,
        summary: via === "email" ? "Asked for a password-reset link" : "Asked an administrator to reset their password",
        ipAddress: address,
      },
    });
  }, TX_OPTIONS);

  return { via };
}

/** Whether a link can still be used, for the reset page to say so up front. */
export async function checkResetToken(token: string): Promise<"valid" | "expired" | "invalid"> {
  const userId = resetTokenUserId(token);
  if (!userId) return "invalid";
  const user = await prisma.user.findFirst({
    where: { id: userId, active: true },
    select: { id: true, passwordHash: true, sessionVersion: true },
  });
  if (!user) return "invalid";
  return verifyResetToken(token, { userId: user.id, ...user }, secret());
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  const userId = resetTokenUserId(token);
  const user = userId
    ? await prisma.user.findFirst({
        where: { id: userId, active: true },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          sessionVersion: true,
          memberships: { where: { active: true }, select: { organizationId: true }, take: 1 },
        },
      })
    : null;

  const state = user ? verifyResetToken(token, { userId: user.id, ...user }, secret()) : "invalid";
  if (!user || state !== "valid") {
    throw new ServiceError(
      "INVALID_STATE",
      state === "expired" ? "This link has expired." : "This link is not valid any more.",
      "Ask for a new one from the sign-in page.",
    );
  }

  const problem = passwordProblem(password, user.email);
  if (problem) throw new ServiceError("VALIDATION", problem);

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    if (user.memberships[0]) {
      await tx.auditLog.create({
        data: {
          organizationId: user.memberships[0].organizationId,
          userId: user.id,
          action: "RECORD_UPDATED",
          entityType: "User",
          entityId: user.id,
          summary: "Reset their password from an emailed link",
        },
      });
    }
  }, TX_OPTIONS);

  // A locked-out person who just proved their inbox can sign in straight away.
  await resetRateLimit(signInKeys("", user.email).account);
}
