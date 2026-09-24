import { ResendProvider } from "./gateways";

/**
 * Email the product sends as itself rather than on a clinic's behalf —
 * password-reset links. Configured once for the deployment
 * (RESEND_API_KEY and AUTH_EMAIL_FROM), not per organization; without both,
 * there is no platform email and callers fall back to asking an admin.
 */
export function platformEmail(): ResendProvider | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  return key && from ? new ResendProvider(key, from) : null;
}
