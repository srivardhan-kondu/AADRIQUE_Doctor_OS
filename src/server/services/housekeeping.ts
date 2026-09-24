import "server-only";
import { prisma } from "@/lib/db";

/**
 * Clears what only ever grows: spent patient-portal sign-in codes and
 * rate-limit windows that expired over an hour ago. Runs on the scheduler's
 * beat (POST /api/jobs/workflows).
 */
export async function runHousekeeping(): Promise<{ codes: number; rateLimits: number }> {
  const [codes, windows] = await Promise.all([
    prisma.portalOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.rateLimit.deleteMany({
      where: { resetAt: { lt: new Date(Date.now() - 60 * 60_000) } },
    }),
  ]);
  return { codes: codes.count, rateLimits: windows.count };
}
