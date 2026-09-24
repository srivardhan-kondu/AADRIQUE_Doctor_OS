import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Spec §31 — encryption at rest for small secrets the app must read back,
 * such as a two-factor secret. AES-256-GCM under a key derived from
 * AUTH_SECRET and a purpose label, so a database copy alone does not
 * reveal them, and a secret sealed for one purpose cannot be opened as
 * another. Rotating AUTH_SECRET makes existing boxes unreadable — people
 * then set up two-factor again.
 */

function key(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}\u0000${secret}`).digest();
}

export function seal(plain: string, secret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, purpose), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The plain text, or null when the box was tampered with or sealed differently. */
export function open(box: string, secret: string, purpose: string): string | null {
  const [version, iv, tag, body] = box.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret, purpose), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
