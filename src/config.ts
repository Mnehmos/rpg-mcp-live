import "dotenv/config";

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function readString(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
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
const referenceEngineUrl = readString("REFERENCE_ENGINE_URL");
const referenceEngineToken = readString("REFERENCE_ENGINE_TOKEN");
const referenceEngineTimeoutMs = Number.parseInt(readString("REFERENCE_ENGINE_TIMEOUT_MS", "30000"), 10);

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
  openRouterConfigured: Boolean(openRouterApiKey),
  referenceEngineUrl: referenceEngineUrl.replace(/\/$/, ""),
  referenceEngineToken,
  referenceEngineTimeoutMs,
  referenceEngineConfigured: Boolean(referenceEngineUrl && referenceEngineToken),
  subscriptionLabel: readString("SUBSCRIPTION_LABEL", "Player Pass"),
  subscriptionPriceLabel: readString("SUBSCRIPTION_PRICE_LABEL", "$5 / month"),
  devAuthBypass: !nodeEnv || nodeEnv !== "production" ? readBoolean("DEV_AUTH_BYPASS", false) : false,
  devUserId: readString("DEV_USER_ID", "local-player"),
});

export type AppConfig = typeof config;
