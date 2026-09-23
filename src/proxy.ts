import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { contentSecurityPolicy, createNonce } from "@/lib/security/csp";

/**
 * Route protection (Next 16's `proxy` convention, formerly `middleware`).
 *
 * This is a redirect for unauthenticated users, not the authorization
 * boundary. The boundary is server-side, in `src/server/context.ts` and the
 * services — this only decides whether to show the sign-in page
 * (spec §21: "do not rely only on frontend hiding").
 *
 * Uses the edge-safe half of the Auth.js config; the credentials provider
 * needs Node APIs and is not loaded here.
 */
const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = [
  "/doctor",
  "/reception",
  "/admin",
  "/design",
  "/display",
  "/account",
];

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !req.auth) {
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  // Someone already signed in has no reason to see the sign-in page.
  if (pathname === "/sign-in" && req.auth) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // Spec §31 — a fresh nonce per request. Next.js reads it from the request's
  // CSP header and stamps it on its own scripts; the layout passes it on to
  // the one inline script it adds (the theme).
  const nonce = createNonce();
  const https =
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    https,
  });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

export const config = {
  matcher: [
    // Everything except static assets and the auth API itself.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
