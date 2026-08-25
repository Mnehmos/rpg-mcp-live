import "dotenv/config";

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
const openRouterApiKey = readString("OPENROUTER_API_KEY");
const contentGamesystem = readString("CONTENT_GAMESYSTEM", "5e-2014");

export const engineConfig = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number.parseInt(readString("ENGINE_PORT", readString("PORT", "3100")), 10),
  databasePath: readString("ENGINE_DATABASE_PATH", "data/lantern-engine.db"),
  internalToken: readString("ENGINE_INTERNAL_TOKEN"),
  openRouterApiKey,
  openRouterBaseUrl: readString("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").replace(/\/$/, ""),
  openRouterModel: readString("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash"),
  openRouterFallbackBaseUrl: readString("OPENROUTER_FALLBACK_BASE_URL", readString("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")).replace(/\/$/, ""),
  openRouterFallbackModel: readString("OPENROUTER_FALLBACK_MODEL"),
  openRouterFirstTokenTimeoutMs: Number.parseInt(readString("OPENROUTER_FIRST_TOKEN_TIMEOUT_MS", "8000"), 10),
  openRouterReasoningEffort: readString("OPENROUTER_REASONING_EFFORT", "medium"),
  openRouterMaxTokens: Number.parseInt(readString("OPENROUTER_MAX_TOKENS", "2500"), 10),
  openRouterSiteUrl: readString("OPENROUTER_SITE_URL"),
  openRouterAppName: readString("OPENROUTER_APP_NAME", "Lantern Table Engine"),
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
});

if (engineConfig.isProduction && !engineConfig.internalToken) {
  throw new Error("ENGINE_INTERNAL_TOKEN is required in production.");
}
