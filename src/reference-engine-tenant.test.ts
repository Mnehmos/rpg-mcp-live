import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signTenantToken } from "./reference-engine-tenant.js";

const SECRET = "shared-tenant-secret";
const NOW = 1_700_000_000;

/**
 * Verifies independently of the engine's verifier, which lives in a separate
 * repository (mnehmos.rpg.mcp, src/server/transport/tenant-token.ts).
 *
 * This mirrors that implementation deliberately. If someone changes the wire
 * format on either side without changing the other, one of these two test
 * suites fails — which is the only cross-repo contract check available short
 * of an integration environment.
 */
function verify(token: string, secret: string): Record<string, unknown> | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("signTenantToken", () => {
  it("produces a token the engine's verification recomputes to the same signature", () => {
    const token = signTenantToken(
      { accountId: "user_2abc", campaignId: "camp-1", worldId: "world-1", partyId: "party-1" },
      SECRET,
      { nowSeconds: NOW }
    );

    expect(verify(token, SECRET)).toEqual({
      accountId: "user_2abc",
      campaignId: "camp-1",
      worldId: "world-1",
      partyId: "party-1",
      iat: NOW,
      exp: NOW + 120,
    });
  });

  it("signs with the two-segment base64url format the engine expects", () => {
    const token = signTenantToken({ accountId: "a", campaignId: "c" }, SECRET, { nowSeconds: NOW });

    expect(token.split(".")).toHaveLength(2);
    // base64url alphabet only — no +, /, or = padding, which would not survive
    // an HTTP header round-trip cleanly.
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("omits worldId and partyId rather than emitting undefined when unknown", () => {
    const token = signTenantToken({ accountId: "a", campaignId: "c" }, SECRET, { nowSeconds: NOW });

    const payload = verify(token, SECRET)!;
    expect(payload).not.toHaveProperty("worldId");
    expect(payload).not.toHaveProperty("partyId");
  });

  it("does not verify against a different secret", () => {
    const token = signTenantToken({ accountId: "a", campaignId: "c" }, SECRET, { nowSeconds: NOW });

    // The staging/production separation depends on this: a token minted with
    // staging's secret must be worthless against production.
    expect(verify(token, "another-secret")).toBeNull();
  });

  it("sets a short expiry by default", () => {
    const token = signTenantToken({ accountId: "a", campaignId: "c" }, SECRET, { nowSeconds: NOW });

    const payload = verify(token, SECRET)!;
    expect((payload.exp as number) - (payload.iat as number)).toBe(120);
  });

  it("refuses to sign without a secret, an accountId, or a campaignId", () => {
    expect(() => signTenantToken({ accountId: "a", campaignId: "c" }, "")).toThrow(/TENANT_SECRET/);
    expect(() => signTenantToken({ accountId: "", campaignId: "c" }, SECRET)).toThrow(/accountId/);
    expect(() => signTenantToken({ accountId: "a", campaignId: "" }, SECRET)).toThrow(/campaignId/);
  });
});
