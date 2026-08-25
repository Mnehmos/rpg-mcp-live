import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { clerkMiddleware, createClerkClient, getAuth } from "@clerk/express";
import { z } from "zod";
import { createCheckoutUrl, createPortalUrl, createStripeClient, handleStripeEvent } from "./billing.js";
import { config } from "./config.js";

const REFERENCE_DM_NOT_COMMITTED_MESSAGE =
  "The DM provider did not return a result; no game state was committed. Your action is safe to retry.";
import { deploymentIdentity } from "./deployment-identity.js";
import { engineCampaignCreateSchema, engineCampaignDeleteSchema, engineCharacterDetailsSchema, engineOpeningRequestSchema } from "./engine-contracts.js";
import { rollAbilityScoreDraft } from "./engine-domain.js";
import { gameActionSchema } from "./game.js";
import { GameStore } from "./store.js";
import { open5eCharacterOptions, open5eSpellOptions } from "./open5e-rules.js";
import {
  buildOpen5eContentCatalog,
  CampaignContentPolicyError,
  validateCampaignContentPolicy,
  type DeploymentContentPolicy,
} from "./content/catalog.js";
import { loadInstalledOpen5ePackRegistry } from "./content/registry.js";
import { contentSecurityPolicy } from "./security-headers.js";
import { characterOptionPolicy } from "./character-option-policy.js";
import { ReferenceEngineClient } from "./reference-engine-client.js";
import { ReferenceEngineStore } from "./reference-engine-store.js";
import { LlmUsageLimitError, LlmUsageStore } from "./llm-usage.js";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError, ReferenceEngineUnsupportedError } from "./reference-engine-adapter.js";
import { ReferenceEngineToolCatalog } from "./reference-engine-tools.js";
import {
  ReferenceDmCommandAlreadyFailedError,
  ReferenceDmCommandIdReuseError,
  ReferenceDmCommandInProgressError,
  ReferenceDmProviderUnavailableError,
  ReferenceDmVersionConflictError,
  ReferenceDungeonMaster,
} from "./reference-engine-dm.js";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const publicDirectory = path.join(projectRoot, "public");
const deployment = deploymentIdentity("web");
const store = new GameStore(config.databasePath);
const stripe = createStripeClient();
const referenceEngineStore = new ReferenceEngineStore(store.getRawDb());
const llmUsageStore = new LlmUsageStore(store.getRawDb(), config.llmUsage);
if (!config.referenceEngineConfigured) {
  throw new Error("REFERENCE_ENGINE_URL and REFERENCE_ENGINE_TOKEN are required; the Lantern engine is not wired.");
}
if (!config.referenceEngineTenantScoped) {
  console.warn(
    "REFERENCE_ENGINE_TENANT_SECRET is not set; reference-engine calls will be sent unscoped " +
      "and the engine will refuse any tool that touches campaign state."
  );
}
const referenceEngineClient = new ReferenceEngineClient({
  baseUrl: config.referenceEngineUrl,
  authToken: config.referenceEngineToken,
  timeoutMs: config.referenceEngineTimeoutMs,
  tenantSecret: config.referenceEngineTenantSecret,
});
const referenceEngineAdapter = new ReferenceEngineAdapter(referenceEngineClient, referenceEngineStore);
const referenceDungeonMaster = config.openRouterConfigured
  ? new ReferenceDungeonMaster(
      referenceEngineClient,
      referenceEngineStore,
      new ReferenceEngineToolCatalog(referenceEngineClient),
      referenceEngineAdapter,
      {
        apiKey: config.openRouterApiKey,
        baseUrl: config.openRouterBaseUrl,
        model: config.openRouterModel,
        reasoningEffort: config.openRouterReasoningEffort,
        maxTokens: config.openRouterMaxTokens,
        timeoutMs: 60_000,
        turnTimeoutMs: config.referenceDmTimeoutMs,
        usage: llmUsageStore,
      }
    )
  : null;
const app = express();
/**
 * Built from the installed Open5e pack rather than hand-written.
 *
 * This was a hardcoded stub with `documents: []` — a leftover from the
 * reference-only runtime migration, when the catalog stopped being built by
 * the Lantern engine and nothing took over. An empty document list makes every
 * dropdown in the campaign form empty: the UI only offers a game system that
 * has at least one base-capable document, so with no documents there is no
 * system to pick and no rules base to pick either.
 */
const contentRegistry = await loadInstalledOpen5ePackRegistry();
const deploymentContentPolicy: DeploymentContentPolicy = {
  defaultGamesystem: config.contentGamesystem,
  defaultBaseDocument: config.contentDefaultBaseDocument,
  allowedGamesystems: config.contentAllowedGamesystems,
  allowedLicenses: config.contentAllowedLicenses,
  allowedDocuments: config.contentAllowedDocuments,
  baseDocuments: config.contentBaseDocuments,
};
const referenceContentCatalog = buildOpen5eContentCatalog(contentRegistry.activePack, deploymentContentPolicy);

function contentKeySuffix(value: string): string {
  return value.split(":").pop()?.trim() || value.trim();
}

function displayContentKey(value: string): string {
  return contentKeySuffix(value)
    .replace(/^srd[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function referenceSkillKey(value: string): string {
  return contentKeySuffix(value).replace(/-/g, "_").toLowerCase();
}
const commandRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    action: gameActionSchema.optional(),
    playerText: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine((value) => (value.action !== undefined) !== (value.playerText !== undefined), {
    message: "Send exactly one of action or playerText.",
  });
const campaignProfileRequestSchema = engineCampaignCreateSchema;
const characterCreateRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(80),
    speciesKey: z.string().trim().startsWith("open5e:species:").max(300),
    classKey: z.string().trim().startsWith("open5e:class:").max(300),
    backgroundKey: z.string().trim().startsWith("open5e:background:").max(300),
    alignmentKey: z.string().trim().startsWith("open5e:alignment:").max(300),
    abilityScoreMethod: z.enum(["standard_array", "rolled"]),
    abilityScoreDraftId: z.string().uuid().optional(),
    abilityScores: z.record(z.enum(["str", "dex", "con", "int", "wis", "cha"]), z.number().int().min(3).max(20)),
    abilityBonusChoices: z.array(z.enum(["str", "dex", "con", "int", "wis", "cha"])).max(6).optional(),
    skillKeys: z.array(z.string().trim().startsWith("open5e:skill:").max(300)).max(8).optional(),
    languageKeys: z.array(z.string().trim().startsWith("open5e:language:").max(300)).max(8).optional(),
    toolProficiencies: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  })
  .strict();
const characterRollStatsRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
  })
  .strict();
const characterUpdateRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(80).optional(),
    background: z.string().trim().min(1).max(120).optional(),
    alignment: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    details: engineCharacterDetailsSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.name || value.background || value.alignment || value.description || (value.details && Object.keys(value.details).length)), {
    message: "Provide at least one character field to change.",
  });
const characterSpellbookUpdateRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    cantripsKnown: z.array(z.string().trim().startsWith("open5e:spell:").max(300)).max(20).optional(),
    knownSpells: z.array(z.string().trim().startsWith("open5e:spell:").max(300)).max(100).optional(),
    preparedSpells: z.array(z.string().trim().startsWith("open5e:spell:").max(300)).max(100).optional(),
  })
  .strict()
  .refine((value) => value.cantripsKnown !== undefined || value.knownSpells !== undefined || value.preparedSpells !== undefined, {
    message: "Provide cantripsKnown, knownSpells, or preparedSpells.",
  });
const inventoryActionRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    action: z.enum(["equip", "unequip", "use", "drop"]),
    itemId: z.string().trim().min(1).max(120),
    slot: z.enum(["mainhand", "offhand", "armor", "head", "feet", "accessory"]).optional(),
    quantity: z.number().int().min(1).max(100).optional(),
  })
  .strict();
const noteCreateRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    text: z.string().trim().min(1).max(4_000),
  })
  .strict();

function clerkFrontendOrigin(): string | null {
  if (!config.clerkPublishableKey) return null;
  try {
    const encodedDomain = config.clerkPublishableKey.split("_")[2];
    const domain = Buffer.from(encodedDomain, "base64").toString("utf8").replace(/\$$/, "");
    return domain ? "https://" + domain : null;
  } catch (_error) {
    return null;
  }
}

const clerkOrigin = clerkFrontendOrigin();

if (config.clerkConfigured) {
  const clerkClient = createClerkClient({
    publishableKey: config.clerkPublishableKey,
    secretKey: config.clerkSecretKey,
  });
  app.use(clerkMiddleware({ clerkClient }));
}

app.use((_request, response, next) => {
  response.setHeader("Content-Security-Policy", contentSecurityPolicy(clerkOrigin));
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

function userIdFromRequest(request: Request): string | null {
  if (config.devAuthBypass && !config.clerkConfigured) return config.devUserId;
  if (!config.clerkConfigured) return null;
  const auth = getAuth(request);
  return auth.isAuthenticated ? auth.userId : null;
}

function requireUser(request: Request, response: Response): string | null {
  const userId = userIdFromRequest(request);
  if (!userId) {
    response.status(401).json({ error: "Sign in to play." });
    return null;
  }
  return userId;
}

function sendAppPage(_request: Request, response: Response): void {
  response.sendFile("index.html", { root: publicDirectory });
}

async function sendCampaignCommand(
  _request: Request,
  userId: string,
  campaignId: string,
  body: unknown,
  response: Response
): Promise<void> {
  const parsed = commandRequestSchema.safeParse(body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_command",
      error: "A command needs a UUID clientCommandId, expectedCampaignVersion, and exactly one of action or playerText.",
    });
    return;
  }

  if (!referenceDungeonMaster) {
    response.status(503).json({
      code: "reference_dm_unavailable",
      error: "The reference-engine DM is not configured on this deployment.",
    });
    return;
  }

  const playerText = parsed.data.playerText
    ?? `The player chose the ${parsed.data.action} action.`;
  try {
    const result = await referenceDungeonMaster.resolveTurn(userId, userId, campaignId, playerText, {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
    });
    response.json({ ...result, subscription: store.getSubscription(userId), usage: llmUsageStore.getSummary(userId) });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    if (error instanceof ReferenceDmVersionConflictError) {
      const current = await referenceEngineAdapter.getCampaign(userId, userId, campaignId);
      response.status(409).json({
        code: "stale_version",
        error: "The campaign changed before this turn started.",
        session: current.campaign,
      });
      return;
    }
    if (error instanceof ReferenceDmCommandInProgressError) {
      response.status(409).json({ code: "command_conflict", error: error.message });
      return;
    }
    if (error instanceof ReferenceDmCommandIdReuseError) {
      response.status(409).json({ code: "command_id_reuse", error: error.message });
      return;
    }
    if (error instanceof ReferenceDmCommandAlreadyFailedError) {
      response.status(502).json({
        code: "reference_dm_unavailable",
        error: error.details?.commitStatus === "not_committed"
          ? REFERENCE_DM_NOT_COMMITTED_MESSAGE
          : "That turn already has a recorded failure. The table may have changed; refresh before continuing.",
        ...(error.details ? {
          correlationId: error.details.correlationId,
          commitStatus: error.details.commitStatus,
          retryable: error.details.commitStatus === "not_committed",
          providerCalls: error.details.providerCalls ?? 0,
          toolRounds: error.details.toolRounds,
          activatedTools: error.details.activatedTools ?? [],
          toolCallNames: error.details.toolCallNames,
          acceptedToolCalls: error.details.acceptedToolCalls,
          rejectedToolCalls: error.details.rejectedToolCalls ?? 0,
        } : {}),
        usage: llmUsageStore.getCommandUsage(userId, campaignId, parsed.data.clientCommandId),
      });
      return;
    }
    const usageError = error instanceof LlmUsageLimitError
      ? error
      : error instanceof ReferenceDmProviderUnavailableError && error.cause instanceof LlmUsageLimitError
        ? error.cause
        : null;
    if (usageError) {
      response.status(429).json({
        code: usageError.code,
        error: usageError.message,
        period: usageError.period,
        limitMicros: usageError.limit,
        requestedMicros: usageError.requested,
        usage: llmUsageStore.getSummary(userId),
      });
      return;
    }
    if (error instanceof ReferenceDmProviderUnavailableError) {
      console.error(JSON.stringify({
        event: "reference_dm_turn_failed",
        correlationId: error.details.correlationId,
        commitStatus: error.details.commitStatus,
        phase: error.details.phase,
        providerCalls: error.details.providerCalls ?? 0,
        toolRounds: error.details.toolRounds,
        activatedTools: error.details.activatedTools ?? [],
        toolCallNames: error.details.toolCallNames,
        acceptedToolCalls: error.details.acceptedToolCalls,
        rejectedToolCalls: error.details.rejectedToolCalls ?? 0,
      }));
      response.status(502).json({
        code: "reference_dm_unavailable",
        error: error.details.commitStatus === "not_committed"
          ? REFERENCE_DM_NOT_COMMITTED_MESSAGE
          : "The reference-engine DM stopped after a state change; refresh the table before continuing.",
        correlationId: error.details.correlationId,
        commitStatus: error.details.commitStatus,
        retryable: error.details.commitStatus === "not_committed",
        providerCalls: error.details.providerCalls ?? 0,
        toolRounds: error.details.toolRounds,
        activatedTools: error.details.activatedTools ?? [],
        toolCallNames: error.details.toolCallNames,
        acceptedToolCalls: error.details.acceptedToolCalls,
        rejectedToolCalls: error.details.rejectedToolCalls ?? 0,
        usage: llmUsageStore.getCommandUsage(userId, campaignId, parsed.data.clientCommandId),
      });
      return;
    }
    sendReferenceEngineError(response, error);
  }
}

function sendReferenceEngineError(response: Response, error: unknown): void {
  if (error instanceof ReferenceEngineNotRoutedError) {
    response.status(404).json({ code: "campaign_not_found", error: error.message });
    return;
  }
  if (error instanceof ReferenceEngineUnsupportedError) {
    response.status(409).json({ code: "unsupported_on_reference_backend", error: error.message });
    return;
  }
  console.error(error instanceof Error ? error.message : "Unable to reach the reference engine.");
  response
    .status(502)
    .json({ code: "reference_engine_unavailable", error: "The reference engine is unavailable. Try again shortly." });
}

app.get("/api/health", async (_request, response) => {
  let engine: Record<string, unknown>;
  try {
    engine = await referenceEngineClient.health();
  } catch (error) {
    engine = {
      status: "unreachable",
      error: error instanceof Error ? error.message : "Unable to reach the reference engine.",
    };
  }
  response.json({
    status: "ok",
    service: "rpg-mcp-live-web",
    environment: config.nodeEnv,
    deployment,
    integrations: {
      clerk: config.clerkConfigured,
      stripeCheckout: config.stripeCheckoutConfigured,
      stripeWebhook: config.stripeWebhookConfigured,
      referenceEngine: engine.status === "ok",
    },
    engine,
  });
});

app.get("/api/config", (_request, response) => {
  response.json({
    clerkPublishableKey: config.clerkPublishableKey || null,
    devAuthBypass: config.devAuthBypass && !config.clerkConfigured,
    subscription: {
      enabled: config.stripeCheckoutConfigured,
      label: config.subscriptionLabel,
      priceLabel: config.subscriptionPriceLabel,
    },
    engine: {
      backend: "reference",
      enabled: config.referenceEngineConfigured,
      dmModel: config.openRouterModel,
      reasoningEffort: config.openRouterReasoningEffort,
    },
  });
});

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json", limit: "256kb" }),
  (request, response) => {
    if (!stripe || !config.stripeWebhookSecret) {
      response.status(503).json({ error: "Stripe webhooks are not configured." });
      return;
    }
    const signature = request.header("stripe-signature");
    if (!signature) {
      response.status(400).json({ error: "Missing Stripe signature." });
      return;
    }
    try {
      const event = stripe.webhooks.constructEvent(request.body as Buffer, signature, config.stripeWebhookSecret);
      handleStripeEvent(event, store);
      response.json({ received: true });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Invalid webhook" });
    }
  }
);

app.use(express.json({ limit: "64kb" }));
app.get("/favicon.ico", (_request, response) => {
  response.type("image/svg+xml").sendFile("favicon.svg", { root: publicDirectory });
});
app.use(express.static(publicDirectory, { extensions: ["html"] }));

async function listAllCampaigns(userId: string) {
  const campaigns = await referenceEngineAdapter.listCampaigns(userId, userId);
  return campaigns.map((campaign) => ({ ...campaign, engineBackend: "reference" as const }));
}

async function getAnyCampaign(userId: string, campaignId: string) {
  const result = await referenceEngineAdapter.getCampaign(userId, userId, campaignId);
  return {
    campaign: result.campaign,
    state: null as unknown,
    engineBackend: "reference" as const,
    dockets: result.dockets,
  };
}

app.get("/api/session", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const campaigns = await listAllCampaigns(userId);
    const requestedCampaignId = typeof request.query.campaignId === "string" ? request.query.campaignId.trim() : "";
    const selectedCampaign = requestedCampaignId
      ? campaigns.find((campaign) => campaign.id === requestedCampaignId) ?? null
      : campaigns[0] ?? null;
    if (requestedCampaignId && !selectedCampaign) {
      response.status(404).json({
        code: "campaign_not_found",
        error: "That campaign is no longer available in your account.",
        campaigns,
        subscription: store.getSubscription(userId),
        usage: llmUsageStore.getSummary(userId),
      });
      return;
    }
    const result = selectedCampaign ? await getAnyCampaign(userId, selectedCampaign.id) : null;
    response.json({
      session: result?.campaign ?? null,
      state: result?.state ?? null,
      engineBackend: result?.engineBackend ?? null,
      dockets: result?.dockets ?? null,
      campaigns,
      activeCampaignId: selectedCampaign?.id ?? null,
      setupRequired: !result,
      subscription: store.getSubscription(userId),
      usage: llmUsageStore.getSummary(userId),
    });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/campaigns", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const campaigns = await listAllCampaigns(userId);
    response.json({ campaigns, subscription: store.getSubscription(userId), usage: llmUsageStore.getSummary(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/character-options", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  // The client sends ?campaignId= and caches per campaign; the server used to
  // ignore it and return every option in the rules kernel, so a campaign that
  // enabled only SRD sources still offered options from documents it had not
  // enabled. getRouting is scoped by user, so an unknown or foreign campaign
  // id simply falls back to the deployment default.
  const campaignId = typeof request.query.campaignId === "string" ? request.query.campaignId.trim() : "";
  const routing = campaignId ? referenceEngineStore.getRouting(userId, campaignId) : null;
  const policy = characterOptionPolicy(
    routing?.campaignProfileJson,
    referenceContentCatalog.defaultPolicy,
    (requested) => validateCampaignContentPolicy(contentRegistry.activePack, deploymentContentPolicy, requested)
  );
  response.json({ options: open5eCharacterOptions(policy) });
});

app.get("/api/character-spell-options", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const className = typeof request.query.className === "string" ? request.query.className.trim() : "";
  const requestedLevel = Number(request.query.level ?? 1);
  if (!className || !Number.isInteger(requestedLevel) || requestedLevel < 1 || requestedLevel > 20) {
    response.status(400).json({ code: "invalid_spell_options", error: "A class name and level from 1 through 20 are required." });
    return;
  }
  response.json({ options: open5eSpellOptions(className, requestedLevel) });
});

app.get("/api/content-catalog", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.json({ catalog: referenceContentCatalog });
});

app.post("/api/campaigns", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = campaignProfileRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_campaign", error: "A campaign needs a name, premise, setting, and tone." });
    return;
  }
  // The browser picks sources and licenses from the catalog, so the request
  // carries a content policy. It is validated against the deployment policy
  // before being stored: the payload is client-controlled, and without this a
  // crafted request could enable documents or licenses this deployment is not
  // permitted to serve.
  let profile = parsed.data;
  try {
    profile = {
      ...parsed.data,
      contentPolicy: validateCampaignContentPolicy(
        contentRegistry.activePack,
        deploymentContentPolicy,
        parsed.data.contentPolicy ?? referenceContentCatalog.defaultPolicy
      ),
    };
  } catch (error) {
    if (error instanceof CampaignContentPolicyError) {
      response.status(400).json({ code: error.code, error: error.message });
      return;
    }
    throw error;
  }
  try {
    const result = await referenceEngineAdapter.createCampaign(userId, userId, profile);
    response.status(201).json({
      session: result.campaign,
      state: null,
      campaign: result.campaign,
      campaigns: await listAllCampaigns(userId),
      subscription: store.getSubscription(userId),
      usage: llmUsageStore.getSummary(userId),
    });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const result = await getAnyCampaign(userId, request.params.campaignId);
    response.json({
      campaign: result.campaign,
      state: result.state,
      engineBackend: result.engineBackend,
      dockets: result.dockets ?? null,
      subscription: store.getSubscription(userId),
      usage: llmUsageStore.getSummary(userId),
    });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/engine-backend", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  if (request.body?.backend !== "reference") {
    response.status(410).json({
      code: "backend_selection_removed",
      error: "The live product runs on the reference engine; backend switching is no longer available.",
    });
    return;
  }
  try {
    await referenceEngineAdapter.ensureReferenceSession(userId, request.params.campaignId);
    response.json({ backend: "reference" });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId/commands/:clientCommandId", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const command = referenceEngineStore.getReferenceCommand(userId, request.params.campaignId, request.params.clientCommandId);
  if (!command) {
    response.status(404).json({ code: "command_not_found", error: "No recorded turn exists for that command ID." });
    return;
  }
  if (command.status === "processing") {
    response.status(202).json({
      status: "processing",
      campaignId: command.campaignId,
      clientCommandId: command.clientCommandId,
      createdAt: command.createdAt,
      updatedAt: command.updatedAt,
    });
    return;
  }
  if (command.status === "failed") {
    response.json({
      status: "failed",
      campaignId: command.campaignId,
      clientCommandId: command.clientCommandId,
      ...(command.failure ? {
        correlationId: command.failure.correlationId,
        commitStatus: command.failure.commitStatus,
        retryable: command.failure.commitStatus === "not_committed",
        error: command.failure.commitStatus === "not_committed"
          ? REFERENCE_DM_NOT_COMMITTED_MESSAGE
          : "The server could not prove whether this turn committed; refresh the table before continuing.",
        providerCalls: command.failure.providerCalls ?? 0,
        toolRounds: command.failure.toolRounds,
        activatedTools: command.failure.activatedTools ?? [],
        toolCallNames: command.failure.toolCallNames,
        acceptedToolCalls: command.failure.acceptedToolCalls,
        rejectedToolCalls: command.failure.rejectedToolCalls ?? 0,
      } : {}),
      usage: llmUsageStore.getCommandUsage(userId, command.campaignId, command.clientCommandId),
      createdAt: command.createdAt,
      updatedAt: command.updatedAt,
    });
    return;
  }
  response.json({
    status: "resolved",
    result: command.result,
    campaignId: command.campaignId,
    clientCommandId: command.clientCommandId,
    campaignVersion: (command.result as { campaignVersion?: number } | null)?.campaignVersion ?? null,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
  });
});

app.delete("/api/campaigns/:campaignId", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = engineCampaignDeleteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_campaign_delete",
      error: "Deleting a campaign requires its current version and the exact DELETE confirmation.",
    });
    return;
  }
  try {
    const deleted = await referenceEngineAdapter.deleteCampaign(userId, request.params.campaignId);
    response.json({
      ...deleted,
      campaigns: await listAllCampaigns(userId),
      subscription: store.getSubscription(userId),
    });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId/events", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.json({ events: referenceEngineStore.getLogMessages(userId, request.params.campaignId) });
});

// Bounded, resumable event-stream consumer for the browser and future UI
// projections. The acknowledgement cursor is client-owned and read-only.
app.get("/api/campaigns/:campaignId/events/stream", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const after = typeof request.query.after === "string" ? request.query.after : undefined;
  const limit = Math.max(1, Math.min(100, Number(request.query.limit ?? 50) || 50));
  const messages = referenceEngineStore.getLogMessages(userId, request.params.campaignId);
  const start = after ? Math.max(0, messages.findIndex((message) => message.id === after) + 1) : 0;
  const events = messages.slice(start, start + limit);
  response.json({ events, next: events.length === limit ? events.at(-1)?.id ?? null : null, hasMore: start + events.length < messages.length });
});

app.post("/api/campaigns/:campaignId/commands", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  await sendCampaignCommand(request, userId, request.params.campaignId, request.body, response);
});

app.post("/api/campaigns/:campaignId/character", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = characterCreateRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_character",
      error: "A character needs a name and exact Open5e species, class, background, and alignment selections.",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const result = await referenceEngineAdapter.executeToolCall(userId, userId, request.params.campaignId, {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      toolName: "character_create",
      arguments: {
        name: parsed.data.name,
        species: displayContentKey(parsed.data.speciesKey),
        className: displayContentKey(parsed.data.classKey),
        background: displayContentKey(parsed.data.backgroundKey),
        alignment: displayContentKey(parsed.data.alignmentKey),
        abilityScores: parsed.data.abilityScores,
        skillProficiencies: (parsed.data.skillKeys ?? []).map(referenceSkillKey),
        languages: (parsed.data.languageKeys ?? []).map(displayContentKey),
        toolProficiencies: parsed.data.toolProficiencies,
      },
    });
    response.json({ ...result, subscription: store.getSubscription(userId), usage: llmUsageStore.getSummary(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/character/roll-stats", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = characterRollStatsRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_stat_roll",
      error: "Rolling ability scores requires the current campaign version and a command id.",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const draft = rollAbilityScoreDraft("rolled");
    const { campaign } = await referenceEngineAdapter.getCampaign(userId, userId, request.params.campaignId);
    response.json({
      session: campaign,
      state: { characterCreation: { abilityScoreDraft: draft } },
      subscription: store.getSubscription(userId),
    });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/opening", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = engineOpeningRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_opening",
      error: "Opening the story requires the current campaign version and a command id.",
      details: parsed.error.flatten(),
    });
    return;
  }
  if (!referenceDungeonMaster) {
    response.status(503).json({ code: "reference_dm_unavailable", error: "The reference-engine DM is not configured." });
    return;
  }
  try {
    const result = await referenceDungeonMaster.resolveTurn(
      userId,
      userId,
      request.params.campaignId,
      "Open the first situation and establish the campaign's opening scene.",
      {
        clientCommandId: parsed.data.clientCommandId,
        expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      }
    );
    response.json({ ...result, subscription: store.getSubscription(userId), usage: llmUsageStore.getSummary(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/production-room/enter", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.status(410).json({ code: "production_room_removed", error: "The Lantern production room is not part of the reference-engine runtime." });
});

app.get("/api/campaigns/:campaignId/production-room", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.status(410).json({ code: "production_room_removed", error: "The Lantern production room is not part of the reference-engine runtime." });
});

app.post("/api/campaigns/:campaignId/production-room/narration", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.status(410).json({ code: "production_room_removed", error: "The Lantern production room is not part of the reference-engine runtime." });
});

app.get("/api/campaigns/:campaignId/orchestration", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.status(410).json({ code: "orchestration_removed", error: "Lantern orchestration is not part of the reference-engine runtime." });
});

app.post("/api/campaigns/:campaignId/orchestration/decisions", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.status(410).json({ code: "orchestration_removed", error: "Lantern orchestration is not part of the reference-engine runtime." });
});

app.patch("/api/campaigns/:campaignId/character", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = characterUpdateRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_character_update", error: "Provide at least one character field to change." });
    return;
  }
  try {
    const result = await referenceEngineAdapter.updateCharacterDetails(userId, userId, request.params.campaignId, {
      name: parsed.data.name,
      background: parsed.data.background,
      alignment: parsed.data.alignment,
      description: parsed.data.description,
      details: parsed.data.details,
    });
    response.json({ campaign: result.campaign, dockets: result.dockets, engineBackend: "reference", subscription: store.getSubscription(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.patch("/api/campaigns/:campaignId/character/spells", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = characterSpellbookUpdateRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_spellbook_update", error: "Choose valid spells from the installed class catalog." });
    return;
  }
  try {
    const routing = referenceEngineStore.getRouting(userId, request.params.campaignId);
    if (!routing) {
      response.status(404).json({ code: "campaign_not_found", error: "That campaign is not available." });
      return;
    }
    if (routing.version !== parsed.data.expectedCampaignVersion) {
      const current = await referenceEngineAdapter.getCampaign(userId, userId, request.params.campaignId);
      response.status(409).json({
        code: "stale_version",
        error: "The campaign changed before the spellbook update started.",
        session: current.campaign,
      });
      return;
    }
    const result = await referenceEngineAdapter.updateCharacterSpells(userId, userId, request.params.campaignId, {
      cantripsKnown: parsed.data.cantripsKnown,
      knownSpells: parsed.data.knownSpells,
      preparedSpells: parsed.data.preparedSpells,
    });
    response.json({ campaign: result.campaign, dockets: result.dockets, engineBackend: "reference", subscription: store.getSubscription(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/inventory", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = inventoryActionRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_inventory_action", error: "The inventory action is invalid." });
    return;
  }
  if (parsed.data.action === "equip" && !parsed.data.slot) {
    response.status(400).json({ code: "slot_required", error: "Equipping an item requires a slot." });
    return;
  }
  try {
    const toolName = parsed.data.action === "equip"
      ? "equip_item"
      : parsed.data.action === "unequip"
        ? "unequip_item"
        : parsed.data.action === "use"
          ? "use_item"
          : "drop_item";
    const argumentsForTool = parsed.data.action === "equip"
      ? { itemId: parsed.data.itemId, slot: parsed.data.slot }
      : parsed.data.action === "drop"
        ? { itemId: parsed.data.itemId, quantity: parsed.data.quantity ?? 1 }
        : { itemId: parsed.data.itemId };
    const toolCallRequest = {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      toolName,
      arguments: argumentsForTool,
    } as const;
    const result = await referenceEngineAdapter.executeToolCall(userId, userId, request.params.campaignId, toolCallRequest);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/notes", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = noteCreateRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_note", error: "A note needs a UUID clientCommandId, expectedCampaignVersion, and text." });
    return;
  }
  try {
    const toolCallRequest = {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      toolName: "player_note_add",
      arguments: { text: parsed.data.text, source: "player" },
    } as const;
    const result = await referenceEngineAdapter.executeToolCall(userId, userId, request.params.campaignId, toolCallRequest);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.post("/api/session/action", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const campaigns = await listAllCampaigns(userId);
    if (!campaigns[0]) {
      response.status(409).json({ code: "setup_required", error: "Create a campaign before taking an action." });
      return;
    }
    await sendCampaignCommand(request, userId, campaigns[0].id, request.body, response);
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/billing/status", (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.json({ subscription: store.getSubscription(userId), usage: llmUsageStore.getSummary(userId) });
});

app.get("/api/usage", (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.json({ usage: llmUsageStore.getSummary(userId) });
});

app.post("/api/billing/checkout", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  if (!stripe || !config.stripeCheckoutConfigured) {
    response.status(503).json({ error: "Stripe Checkout is not configured yet." });
    return;
  }
  try {
    response.json({ url: await createCheckoutUrl(stripe, userId) });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Unable to create Checkout session." });
  }
});

app.post("/api/billing/portal", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const subscription = store.getSubscription(userId);
  if (!stripe || !subscription?.stripeCustomerId) {
    response.status(409).json({ error: "No Stripe customer is connected to this player yet." });
    return;
  }
  try {
    response.json({ url: await createPortalUrl(stripe, subscription.stripeCustomerId) });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Unable to create billing portal session." });
  }
});

app.get(["/", "/play"], sendAppPage);

app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
  console.error(error instanceof Error ? error.message : "Unexpected web server error.");
  response.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log("Reference-engine web listening at " + config.appUrl);
  if (config.devAuthBypass && !config.clerkConfigured) {
    console.warn("DEV_AUTH_BYPASS is enabled; configure Clerk and disable it before deployment.");
  }
});
