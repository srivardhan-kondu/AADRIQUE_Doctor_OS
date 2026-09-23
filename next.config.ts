import type { NextConfig } from "next";

/**
 * Spec §31 — security headers.
 *
 * Applied at the edge to every response, so a route cannot forget them.
 *
 * There is no Content-Security-Policy here on purpose: Next injects inline
 * bootstrap scripts, so a useful CSP needs per-request nonces threaded through
 * the proxy, and a `unsafe-inline` policy would be theatre — it would look
 * like a defence while permitting exactly the injection it claims to stop.
 * That belongs with the nonce work, not with a header table.
 */
const securityHeaders = [
  // Clickjacking: this product is never meant to be framed.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Don't let a browser second-guess a declared content type.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // A patient id in a URL must not travel to another origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Nothing here needs a camera, a microphone or a location.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },

  // Spec §31 — encrypted transport. Ignored over plain HTTP, so it is safe
  // in local development and correct the moment it is served over TLS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Never advertise the framework version.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
