/**
 * The page's Content-Security-Policy.
 *
 * Kept in its own module rather than inline in server.ts so it can be asserted
 * directly. server.ts throws on import without a configured reference engine,
 * so a test that imports it cannot run — and a missing CSP origin breaks
 * sign-in in the browser while every server-side test keeps passing. That gap
 * is how the Cloudflare Turnstile omission below reached production.
 */
export function contentSecurityPolicy(clerkFrontend: string | null): string {
  const clerk = clerkFrontend ? " " + clerkFrontend : "";
  const clerkImages = clerkFrontend ? " https://img.clerk.com https://images.clerk.dev" : "";
  // Clerk's bot protection runs Cloudflare Turnstile, served from
  // challenges.cloudflare.com rather than from the Clerk frontend origin.
  // Without it the CAPTCHA script is blocked, sign-up POSTs return 400 with no
  // usable error in the UI, and every later /api call 401s because no session
  // was ever created. Required in script-src and frame-src both: the widget
  // renders in an iframe.
  const captcha = clerkFrontend ? " https://challenges.cloudflare.com" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'" + clerk + captcha,
    "style-src 'self' 'unsafe-inline'" + clerk,
    "img-src 'self' data:" + clerk + clerkImages,
    "connect-src 'self'" + clerk,
    "frame-src 'self'" + clerk + captcha + " https://*.stripe.com",
    "worker-src 'self' blob:",
  ].join("; ");
}
