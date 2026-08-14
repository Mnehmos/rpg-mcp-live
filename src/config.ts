import "dotenv/config";

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function readString(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function readCsv(name: string, fallback: string[]): string[] {
  const value = readString(name);
  if (!value) return fallback;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? [...new Set(entries)].sort() : fallback;
}

const nodeEnv = readString("NODE_ENV", "development");
const clerkPublishableKey = readString("CLERK_PUBLISHABLE_KEY");
const clerkSecretKey = readString("CLERK_SECRET_KEY");
const stripeSecretKey = readString("STRIPE_SECRET_KEY");
const stripeWebhookSecret = readString("STRIPE_WEBHOOK_SECRET");
const stripePriceId = readString("STRIPE_PRICE_ID");
const openRouterApiKey = readString("OPENROUTER_API_KEY");
const openRouterBaseUrl = readString("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/$/, "");
const openRouterModel = readString("OPENROUTER_MODEL", "openai/gpt-5.6-luna");
const openRouterReasoningEffort = readString("OPENROUTER_REASONING_EFFORT", "medium");
const openRouterMaxTokens = Number.parseInt(readString("OPENROUTER_MAX_TOKENS", "900"), 10);
const openRouterSiteUrl = readString("OPENROUTER_SITE_URL");
const openRouterAppName = readString("OPENROUTER_APP_NAME", "Lantern Table");
const referenceDmTimeoutMs = Number.parseInt(readString("REFERENCE_DM_TIMEOUT_MS", "120000"), 10);
const referenceEngineUrl = readString("REFERENCE_ENGINE_URL");
const referenceEngineToken = readString("REFERENCE_ENGINE_TOKEN");
const referenceEngineTimeoutMs = Number.parseInt(readString("REFERENCE_ENGINE_TIMEOUT_MS", "30000"), 10);
// Must hold the same value as the engine's RPG_MCP_TENANT_SECRET, and a
// different value per environment — a shared staging/production secret would
// let a staging compromise mint production tenant contexts.
const referenceEngineTenantSecret = readString("REFERENCE_ENGINE_TENANT_SECRET");

// Which Open5e content the deployment is willing to serve. These mirror the
// engine-config defaults exactly, so the web host and the retired engine agree
// on what "installed" means without the web host importing engine-config —
// that module throws in production when ENGINE_INTERNAL_TOKEN is unset.
//
// OGL 1.0a is deliberately absent from the license default: the per-campaign
// OGL toggle only appears when the deployment has opted in via
// CONTENT_ALLOWED_LICENSES, so hosting SRD/CC-BY material stays the default.
const contentGamesystem = readString("CONTENT_GAMESYSTEM", "5e-2014");

if (Boolean(clerkPublishableKey) !== Boolean(clerkSecretKey)) {
  console.warn("Clerk is partially configured; both Clerk keys are required for server auth.");
}

export const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number.parseInt(readString("PORT", "3000"), 10),
  appUrl: readString("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  databasePath: readString("DATABASE_PATH", "data/rpg-mcp-live.db"),
  clerkPublishableKey,
  clerkSecretKey,
  clerkConfigured: Boolean(clerkPublishableKey && clerkSecretKey),
  stripeSecretKey,
  stripeWebhookSecret,
  stripePriceId,
  stripeCheckoutConfigured: Boolean(stripeSecretKey && stripePriceId),
  stripeWebhookConfigured: Boolean(stripeSecretKey && stripeWebhookSecret),
  openRouterApiKey,
  openRouterBaseUrl,
  openRouterModel,
  openRouterReasoningEffort,
  openRouterMaxTokens,
  openRouterSiteUrl,
  openRouterAppName,
  referenceDmTimeoutMs,
  openRouterConfigured: Boolean(openRouterApiKey),
  referenceEngineUrl: referenceEngineUrl.replace(/\/$/, ""),
  referenceEngineToken,
  referenceEngineTimeoutMs,
  referenceEngineTenantSecret,
  referenceEngineConfigured: Boolean(referenceEngineUrl && referenceEngineToken),
  referenceEngineTenantScoped: Boolean(referenceEngineTenantSecret),
  contentGamesystem,
  contentAllowedGamesystems: readCsv("CONTENT_ALLOWED_GAMESYSTEMS", [contentGamesystem]),
  contentDefaultBaseDocument: readString("CONTENT_DEFAULT_BASE_DOCUMENT", "srd-2014"),
  contentBaseDocuments: readCsv("CONTENT_BASE_DOCUMENTS", ["srd-2014"]),
  contentAllowedLicenses: readCsv("CONTENT_ALLOWED_LICENSES", ["cc-by-40", "cc0"]),
  contentAllowedDocuments: readCsv("CONTENT_ALLOWED_DOCUMENTS", [
    "core",
    "elderberry-inn-icons",
    "srd-2014",
  ]),
  subscriptionLabel: readString("SUBSCRIPTION_LABEL", "Player Pass"),
  subscriptionPriceLabel: readString("SUBSCRIPTION_PRICE_LABEL", "$5 / month"),
  devAuthBypass: !nodeEnv || nodeEnv !== "production" ? readBoolean("DEV_AUTH_BYPASS", false) : false,
  devUserId: readString("DEV_USER_ID", "local-player"),
});

export type AppConfig = typeof config;
