import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./security-headers.js";

const CLERK = "https://flying-anteater-91.clerk.accounts.dev";

function directive(policy: string, name: string): string {
  const found = policy.split("; ").find((entry) => entry.startsWith(name + " "));
  if (!found) throw new Error(`Policy has no ${name} directive: ${policy}`);
  return found;
}

/**
 * Sign-in is a browser-only failure mode: a missing CSP origin breaks it for
 * every real user while every server-side test keeps passing. These assertions
 * are the only place that gap gets caught before deploy.
 */
describe("content security policy", () => {
  it("allows Clerk's Cloudflare Turnstile script", () => {
    // Clerk's bot protection loads Turnstile from challenges.cloudflare.com.
    // Blocking it makes sign-up POSTs fail with 400 and no usable error.
    expect(directive(contentSecurityPolicy(CLERK), "script-src")).toContain("https://challenges.cloudflare.com");
  });

  it("allows the Turnstile widget to render in its iframe", () => {
    expect(directive(contentSecurityPolicy(CLERK), "frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it("allows the Clerk frontend origin to serve scripts and be reached", () => {
    const policy = contentSecurityPolicy(CLERK);

    expect(directive(policy, "script-src")).toContain(CLERK);
    expect(directive(policy, "connect-src")).toContain(CLERK);
  });

  it("still allows Stripe to render its checkout frame", () => {
    expect(directive(contentSecurityPolicy(CLERK), "frame-src")).toContain("https://*.stripe.com");
  });

  it("keeps the restrictive defaults that make the allowlist meaningful", () => {
    const policy = contentSecurityPolicy(CLERK);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it("adds no third-party origins when Clerk is not configured", () => {
    const policy = contentSecurityPolicy(null);

    // A deployment without Clerk has no sign-in flow, so it has no reason to
    // trust Clerk's or Cloudflare's origins.
    expect(policy).not.toContain("clerk");
    expect(policy).not.toContain("challenges.cloudflare.com");
    expect(directive(policy, "script-src")).toBe("script-src 'self'");
  });
});
