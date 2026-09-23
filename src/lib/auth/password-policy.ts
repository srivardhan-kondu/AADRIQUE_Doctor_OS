/**
 * Spec §31 — what a password must be.
 *
 * Length over composition rules (NIST SP 800-63B): a long passphrase is
 * stronger and easier to remember than "P@ssw0rd1". What is refused is what
 * an attacker tries first — short strings, the account's own email, and the
 * passwords every breach list starts with.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "iloveyou",
  "letmein123",
  "welcome123",
  "admin12345",
  "aadrique123",
  "doctor1234",
  "hospital123",
]);

/** Why this password cannot be used, or null when it can. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — a short phrase works well.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) {
    return "That password is one of the first an attacker would try.";
  }

  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && lower.includes(local)) {
    return "Don't include your email address in your password.";
  }

  if (new Set(password).size < 4) {
    return "Use more than a few different characters.";
  }

  return null;
}
