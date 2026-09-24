import { prisma } from "@/lib/db";
import { open, seal } from "@/lib/security/secret-box";
import { matchTotp } from "./totp";

/**
 * Spec §31 — the two-factor half of sign-in.
 *
 * `authorize` asks for a code only after the password was right, and says so
 * with its own error code (./mfa-errors), so the form can show the code box. Each code works
 * once: the accepted time step is recorded, and a step at or before it is
 * refused, so a code read over a shoulder cannot be replayed.
 */

export const MFA_PURPOSE = "mfa-totp";

function authSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export function sealMfaSecret(secret: string): string {
  return seal(secret, authSecret(), MFA_PURPOSE);
}

export function openMfaSecret(box: string | null): string | null {
  return box ? open(box, authSecret(), MFA_PURPOSE) : null;
}

/**
 * Accepts a code for this account and records its step, atomically: of two
 * sign-ins racing with the same code, only one updates the row.
 */
export async function consumeTotp(
  user: { id: string; mfaSecret: string | null },
  code: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const secret = openMfaSecret(user.mfaSecret);
  if (!secret) return false;
  const step = matchTotp(secret, code, nowMs);
  if (step === null) return false;
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  return claimed.count === 1;
}
