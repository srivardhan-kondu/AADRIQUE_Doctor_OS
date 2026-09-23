import "server-only";

/**
 * Spec §29 + §31 — the secret store.
 *
 * An `Integration` row never holds a credential, only a reference to one.
 * This resolves the reference at the moment of use and nowhere else.
 *
 *   env://WHATSAPP_ACCESS_TOKEN   → the server's environment variable
 *
 * The environment is where every host (Vercel, Render, a VM, Kubernetes
 * secrets) already puts secrets, so no extra service is needed. A reference
 * in any other form resolves to nothing: it fails closed, so a demo row
 * pointing at `secret://demo/...` can never be mistaken for a working
 * credential.
 */
export function resolveSecret(ref: string | null | undefined): string | null {
  if (!ref) return null;

  const match = /^env:\/\/([A-Z][A-Z0-9_]{1,63})$/.exec(ref.trim());
  if (!match) return null;

  const value = process.env[match[1]]?.trim();
  return value ? value : null;
}
