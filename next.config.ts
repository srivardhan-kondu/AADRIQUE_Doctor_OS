import type { NextConfig } from "next";

/**
 * Spec §31 — security headers.
 *
 * Applied at the edge to every response, so a route cannot forget them.
 *
 * The full Content-Security-Policy is set per request by the proxy, with a
 * fresh script nonce (src/lib/security/csp.ts). The `frame-ancestors` rule
 * here also covers what the proxy does not see — API routes and static files.
 * Browsers enforce both headers, so they only ever narrow each other.
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

  experimental: {
    // Spec §6 — lab reports are uploaded through a server action (which
    // keeps Next's same-origin check). Files are capped at 4 MB in
    // src/lib/storage/file-type.ts; this leaves room for the rest of the form.
    serverActions: { bodySizeLimit: "5mb" },
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
