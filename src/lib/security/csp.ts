/**
 * Spec §31 — the Content-Security-Policy, built per request.
 *
 * Scripts are the strict part: only scripts carrying this request's nonce
 * run, and 'strict-dynamic' extends that trust to what they load — so an
 * injected <script> or inline handler does nothing. Next.js reads the nonce
 * from this header and stamps it on its own scripts.
 *
 * Styles allow inline: the toast library injects a <style> element at run
 * time and server-rendered bars use style attributes. Inline CSS cannot run
 * code; the policy that stops script injection is the one that matters.
 *
 * Edge-safe (the proxy runs it): Web Crypto only.
 */

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(
  nonce: string,
  options: { dev: boolean; https: boolean },
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only over HTTPS: on plain-HTTP localhost it would upgrade every asset
    // request to an https:// address that does not answer.
    ...(options.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
