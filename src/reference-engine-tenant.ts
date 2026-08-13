import { createHmac } from "node:crypto";

/**
 * Mints the signed tenant context sent to the reference engine as
 * `x-rpg-tenant`.
 *
 * Wire format — must stay byte-identical to the engine's verifier
 * (`src/server/transport/tenant-token.ts` in mnehmos.rpg.mcp):
 *
 *     base64url(payloadJson) + "." + base64url(hmacSha256(secret, base64url(payloadJson)))
 *
 * The HMAC covers the *encoded* payload segment rather than the decoded JSON,
 * so the two runtimes never have to agree on key ordering or whitespace when
 * re-serializing.
 *
 * Why this exists at all: the reference engine has no tenant isolation of its
 * own (see the tenant-isolation audit). Its shared RPG_MCP_TRANSPORT_TOKEN
 * proves a caller is *this web service*, but says nothing about which customer
 * a request is for. This token carries that identity, derived from the
 * authenticated web session — never from tool arguments, which are
 * model-controlled and therefore untrusted.
 */

export interface TenantIdentity {
  accountId: string;
  campaignId: string;
  worldId?: string;
  partyId?: string;
}

/**
 * Short by design. The token is minted per outbound call, so a brief window
 * costs nothing and bounds the value of one captured header.
 */
const DEFAULT_TTL_SECONDS = 120;

export function signTenantToken(
  tenant: TenantIdentity,
  secret: string,
  options: { ttlSeconds?: number; nowSeconds?: number } = {}
): string {
  if (!secret) throw new Error("Cannot sign a tenant context without REFERENCE_ENGINE_TENANT_SECRET.");
  if (!tenant.accountId) throw new Error("Cannot sign a tenant context without an accountId.");
  if (!tenant.campaignId) throw new Error("Cannot sign a tenant context without a campaignId.");

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload = {
    accountId: tenant.accountId,
    campaignId: tenant.campaignId,
    ...(tenant.worldId ? { worldId: tenant.worldId } : {}),
    ...(tenant.partyId ? { partyId: tenant.partyId } : {}),
    iat: now,
    exp: now + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
