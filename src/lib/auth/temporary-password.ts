import "server-only";
import { randomBytes } from "node:crypto";

/**
 * A one-time password an administrator hands over in person. Readable — no
 * 0/O or 1/l to misread over the phone — and only good until first use: the
 * account must choose its own at the next sign-in.
 */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  // 12 characters from 56 is ~70 bits; rejection sampling keeps it uniform.
  const out: string[] = [];
  while (out.length < 12) {
    for (const byte of randomBytes(16)) {
      if (byte < 224 && out.length < 12) out.push(alphabet[byte % alphabet.length]);
    }
  }
  return out.join("");
}
