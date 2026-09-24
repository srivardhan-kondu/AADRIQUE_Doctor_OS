import "server-only";
import { consumeTotp, openMfaSecret, sealMfaSecret } from "@/lib/auth/two-factor";
import { generateTotpSecret, otpauthUri } from "@/lib/auth/totp";
import { prisma } from "@/lib/db";
import type { RequestActor } from "@/server/context";
import { writeAudit } from "./audit";
import { ServiceError, invalidState, notFound } from "./errors";

/**
 * Spec §31 — turning two-factor sign-in on and off for one's own account.
 *
 * Setting up stores a new secret (sealed) while two-factor is still off;
 * it only switches on once the person proves their app shows the right
 * code, so a mistyped setup can never lock anyone out. Turning it off takes
 * a current code too. A lost phone is recovered by an admin's password
 * reset, which also clears two-factor.
 */

export interface TwoFactorStatus {
  enabled: boolean;
}

export async function getTwoFactorStatus(actor: RequestActor): Promise<TwoFactorStatus> {
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { mfaEnabled: true } });
  if (!user) throw notFound("Account");
  return { enabled: user.mfaEnabled };
}

export async function beginTwoFactorSetup(actor: RequestActor): Promise<{ secret: string; uri: string }> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, email: true, mfaEnabled: true },
  });
  if (!user) throw notFound("Account");
  if (user.mfaEnabled) throw invalidState("Two-factor sign-in is already on.");

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: sealMfaSecret(secret), mfaLastStep: null },
  });
  return { secret, uri: otpauthUri(secret, user.email) };
}

export async function confirmTwoFactorSetup(actor: RequestActor, code: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, mfaEnabled: true, mfaSecret: true },
  });
  if (!user || !openMfaSecret(user.mfaSecret)) {
    throw invalidState("Start the setup again.", "Your setup expired or was replaced.");
  }
  if (user.mfaEnabled) return;
  if (!(await consumeTotp(user, code))) {
    throw new ServiceError(
      "VALIDATION",
      "That code does not match.",
      "Check the phone's time is set automatically, then type the code the app shows now.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "User",
      entityId: user.id,
      summary: "Turned on two-factor sign-in",
    });
  });
}

export async function disableTwoFactor(actor: RequestActor, code: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, mfaEnabled: true, mfaSecret: true },
  });
  if (!user) throw notFound("Account");
  if (!user.mfaEnabled) return;
  if (!(await consumeTotp(user, code))) {
    throw new ServiceError("VALIDATION", "That code does not match.", "Type the code your app shows now.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: null },
    });
    await writeAudit(tx, actor, {
      action: "RECORD_UPDATED",
      entityType: "User",
      entityId: user.id,
      summary: "Turned off two-factor sign-in",
    });
  });
}
