import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { clerkMiddleware, createClerkClient, getAuth } from "@clerk/express";
import { z } from "zod";
import { createCheckoutUrl, createPortalUrl, createStripeClient, handleStripeEvent } from "./billing.js";
import { config } from "./config.js";
import { deploymentIdentity } from "./deployment-identity.js";
import { EngineHttpError, LanternEngineClient } from "./engine-client.js";
import { engineCampaignCreateSchema, engineCampaignDeleteSchema, engineCharacterDetailsSchema, engineOpeningRequestSchema, engineProductionRoomEnterRequestSchema } from "./engine-contracts.js";
import { productionRoomNarrationReleaseRequestSchema } from "./engine-production-room.js";
import { orchestrationDecisionRequestSchema } from "./engine-orchestration.js";
import { gameActionSchema } from "./game.js";
import { GameStore } from "./store.js";
import { ReferenceEngineClient } from "./reference-engine-client.js";
import { ReferenceEngineStore } from "./reference-engine-store.js";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError, ReferenceEngineUnsupportedError } from "./reference-engine-adapter.js";
import { ReferenceEngineToolCatalog } from "./reference-engine-tools.js";
import { ReferenceDmProviderUnavailableError, ReferenceDungeonMaster } from "./reference-engine-dm.js";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const publicDirectory = path.join(projectRoot, "public");
const deployment = deploymentIdentity("web");
const store = new GameStore(config.databasePath);
const stripe = createStripeClient();
const engineClient = new LanternEngineClient({
  baseUrl: config.engineUrl,
  sharedSecret: config.engineSharedSecret,
  timeoutMs: config.engineTimeoutMs,
});
// ADR-H13 override (accepted 2026-08-11): A/B routing to the mnehmos-rpg-mcp
// reference engine. referenceEngineStore always exists (routing defaults to
// "lantern" with no network calls); referenceEngineAdapter is only present
// when the backend is actually configured on this deployment.
const referenceEngineStore = new ReferenceEngineStore(store.getRawDb());
const referenceEngineClient = config.referenceEngineConfigured
  ? new ReferenceEngineClient({
      baseUrl: config.referenceEngineUrl,
      authToken: config.referenceEngineToken,
      timeoutMs: config.referenceEngineTimeoutMs,
    })
  : null;
const referenceEngineAdapter = referenceEngineClient
  ? new ReferenceEngineAdapter(referenceEngineClient, referenceEngineStore)
  : null;
const referenceDungeonMaster = referenceEngineClient && referenceEngineAdapter && config.openRouterConfigured
  ? new ReferenceDungeonMaster(
      referenceEngineClient,
      referenceEngineStore,
      new ReferenceEngineToolCatalog(referenceEngineClient),
      referenceEngineAdapter,
      {
        apiKey: config.openRouterApiKey,
        baseUrl: config.openRouterBaseUrl,
        model: config.openRouterModel,
        timeoutMs: 60_000,
      }
    )
  : null;
const app = express();
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
const engineBackendRequestSchema = z.object({ backend: z.enum(["lantern", "reference"]) }).strict();

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
  const allowedClerkOrigin = clerkOrigin ? " " + clerkOrigin : "";
  const allowedClerkImageOrigins = clerkOrigin ? " https://img.clerk.com https://images.clerk.dev" : "";
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "script-src 'self'" + allowedClerkOrigin,
      "style-src 'self' 'unsafe-inline'" + allowedClerkOrigin,
      "img-src 'self' data:" + allowedClerkOrigin + allowedClerkImageOrigins,
      "connect-src 'self'" + allowedClerkOrigin,
      "frame-src 'self'" + allowedClerkOrigin + " https://*.stripe.com",
      "worker-src 'self' blob:",
    ].join("; ")
  );
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
  request: Request,
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

  if (resolveEngineBackend(userId, campaignId) === "reference") {
    if (!parsed.data.playerText) {
      response.status(400).json({
        code: "structured_actions_not_available",
        error: "The reference-engine backend only supports free-text turns right now.",
      });
      return;
    }
    if (!referenceDungeonMaster) {
      response.status(503).json({
        code: "reference_engine_unavailable",
        error: "The reference-engine DM is not configured on this deployment (needs OpenRouter + the reference engine URL/token).",
      });
      return;
    }
    try {
      const result = await referenceDungeonMaster.resolveTurn(userId, userId, campaignId, parsed.data.playerText);
      response.json({ ...result, subscription: store.getSubscription(userId) });
    } catch (error) {
      if (error instanceof ReferenceEngineNotRoutedError) {
        sendReferenceEngineError(response, error);
        return;
      }
      if (error instanceof ReferenceDmProviderUnavailableError) {
        console.error(error.message);
        response.status(502).json({
          code: "reference_dm_unavailable",
          error: "The reference-engine DM could not resolve this turn. Try again shortly.",
        });
        return;
      }
      sendReferenceEngineError(response, error);
    }
    return;
  }
  try {
    const abortController = new AbortController();
    request.once("aborted", () => abortController.abort());
    const result = await engineClient.executeCommand(userId, userId, campaignId, parsed.data, abortController.signal);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    if (error instanceof EngineHttpError) {
      response.status(error.status).json(error.data);
      return;
    }
    console.error(error instanceof Error ? error.message : "Unable to reach the Lantern engine.");
    response.status(502).json({ code: "engine_unavailable", error: "The Lantern engine is unavailable. Try again shortly." });
  }
}

function resolveEngineBackend(userId: string, campaignId: string): "lantern" | "reference" {
  return referenceEngineStore.resolveBackend(userId, campaignId);
}

function requireReferenceAdapter(response: Response): ReferenceEngineAdapter | null {
  if (!referenceEngineAdapter) {
    response.status(503).json({
      code: "reference_engine_unavailable",
      error: "The reference-engine backend is not configured on this deployment.",
    });
    return null;
  }
  return referenceEngineAdapter;
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
    engine = await engineClient.health();
  } catch (error) {
    engine = {
      status: "unreachable",
      error: error instanceof Error ? error.message : "Unable to reach the engine.",
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
      lanternEngine: engine.status === "ok",
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
      enabled: config.engineConfigured,
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

/**
 * Merges lantern-engine campaigns with reference-engine-routed campaigns for
 * this account. Degrades gracefully if the reference engine is unreachable —
 * a reference-engine outage should not take down the lantern campaign list.
 */
async function listAllCampaigns(userId: string) {
  const lanternCampaigns = (await engineClient.listCampaigns(userId, userId)).map((campaign) => ({
    ...campaign,
    engineBackend: "lantern" as const,
  }));
  if (!referenceEngineAdapter) return lanternCampaigns;
  try {
    const referenceCampaigns = (await referenceEngineAdapter.listCampaigns(userId, userId)).map((campaign) => ({
      ...campaign,
      engineBackend: "reference" as const,
    }));
    return [...lanternCampaigns, ...referenceCampaigns];
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to reach the reference engine.");
    return lanternCampaigns;
  }
}

async function getAnyCampaign(userId: string, campaignId: string) {
  if (resolveEngineBackend(userId, campaignId) === "reference") {
    if (!referenceEngineAdapter) throw new ReferenceEngineNotRoutedError(campaignId);
    const result = await referenceEngineAdapter.getCampaign(userId, userId, campaignId);
    return {
      campaign: result.campaign,
      state: null as unknown,
      engineBackend: "reference" as const,
      dockets: result.dockets,
    };
  }
  const result = await engineClient.getCampaign(userId, userId, campaignId);
  return { ...result, engineBackend: "lantern" as const, dockets: undefined as Record<string, string> | undefined };
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
    });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.get("/api/campaigns", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const campaigns = await listAllCampaigns(userId);
    response.json({ campaigns, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.get("/api/character-options", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const campaignId = typeof request.query.campaignId === "string" ? request.query.campaignId.trim() : undefined;
    response.json({ options: await engineClient.getCharacterOptions(userId, userId, campaignId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.get("/api/content-catalog", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    response.json({ catalog: await engineClient.getContentCatalog(userId, userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.post("/api/campaigns", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = campaignProfileRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_campaign", error: "A campaign needs a name, premise, setting, and tone." });
    return;
  }
  try {
    const result = await engineClient.createCampaign(userId, userId, parsed.data);
    response.status(201).json({
      session: result.campaign,
      state: result.state,
      campaign: result.campaign,
      campaigns: await engineClient.listCampaigns(userId, userId),
      subscription: store.getSubscription(userId),
    });
  } catch (error) {
    sendWebEngineError(response, error);
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
    });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendWebEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/engine-backend", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = engineBackendRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "invalid_engine_backend", error: "Provide backend: 'lantern' or 'reference'." });
    return;
  }
  if (parsed.data.backend === "lantern") {
    referenceEngineStore.setBackend(userId, request.params.campaignId, "lantern");
    response.json({ backend: "lantern" });
    return;
  }
  const adapter = requireReferenceAdapter(response);
  if (!adapter) return;
  try {
    await adapter.ensureReferenceSession(userId, request.params.campaignId);
    response.json({ backend: "reference" });
  } catch (error) {
    sendReferenceEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId/commands/:clientCommandId", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const result = await engineClient.getCommandStatus(
      userId,
      userId,
      request.params.campaignId,
      request.params.clientCommandId
    );
    response.status(result.status === "processing" ? 202 : 200).json({
      ...result,
      subscription: store.getSubscription(userId),
    });
  } catch (error) {
    sendWebEngineError(response, error);
  }
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
    if (resolveEngineBackend(userId, request.params.campaignId) === "reference") {
      const adapter = requireReferenceAdapter(response);
      if (!adapter) return;
      const deleted = await adapter.deleteCampaign(userId, request.params.campaignId);
      response.json({ ...deleted, campaigns: await listAllCampaigns(userId), subscription: store.getSubscription(userId) });
      return;
    }
    const deleted = await engineClient.deleteCampaign(userId, userId, request.params.campaignId, parsed.data);
    response.json({
      ...deleted,
      campaigns: await listAllCampaigns(userId),
      subscription: store.getSubscription(userId),
    });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendWebEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId/events", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const events = await engineClient.getCampaignEvents(userId, userId, request.params.campaignId);
    response.json({ events });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

// Bounded, resumable event-stream consumer for the browser and future UI
// projections. The acknowledgement cursor is client-owned and read-only.
app.get("/api/campaigns/:campaignId/events/stream", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const after = typeof request.query.after === "string" ? request.query.after : undefined;
    const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : undefined;
    const page = await engineClient.getCampaignEventStream(userId, userId, request.params.campaignId, { after, limit });
    response.json(page);
  } catch (error) {
    sendWebEngineError(response, error);
  }
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
    if (resolveEngineBackend(userId, request.params.campaignId) === "reference") {
      const adapter = requireReferenceAdapter(response);
      if (!adapter) return;
      // The reference engine takes free-form species/class strings, not Open5e
      // content-pack keys; best-effort derive them from the key suffix (e.g.
      // "open5e:species:human" -> "human"). It does not validate against SRD
      // content packs the way lantern-engine does.
      const result = await adapter.executeToolCall(userId, userId, request.params.campaignId, {
        clientCommandId: parsed.data.clientCommandId,
        expectedCampaignVersion: parsed.data.expectedCampaignVersion,
        toolName: "character_create",
        arguments: {
          name: parsed.data.name,
          species: parsed.data.speciesKey.split(":").pop(),
          className: parsed.data.classKey.split(":").pop(),
          abilityScores: parsed.data.abilityScores,
        },
      });
      response.json({ ...result, subscription: store.getSubscription(userId) });
      return;
    }
    const result = await engineClient.executeToolCall(userId, userId, request.params.campaignId, {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      toolName: "character_create",
      arguments: {
        name: parsed.data.name,
        speciesKey: parsed.data.speciesKey,
        classKey: parsed.data.classKey,
        backgroundKey: parsed.data.backgroundKey,
        alignmentKey: parsed.data.alignmentKey,
        abilityScoreMethod: parsed.data.abilityScoreMethod,
        abilityScoreDraftId: parsed.data.abilityScoreDraftId,
        abilityScores: parsed.data.abilityScores,
        abilityBonusChoices: parsed.data.abilityBonusChoices,
        skillKeys: parsed.data.skillKeys,
        languageKeys: parsed.data.languageKeys,
        toolProficiencies: parsed.data.toolProficiencies,
      },
    });
    if (result.commandResult) {
      response.json({ ...result.commandResult, subscription: store.getSubscription(userId) });
      return;
    }
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendWebEngineError(response, error);
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
    const result = await engineClient.executeToolCall(userId, userId, request.params.campaignId, {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      toolName: "character_roll_stats",
      arguments: { method: "rolled" },
    });
    if (result.commandResult) {
      response.json({ ...result.commandResult, subscription: store.getSubscription(userId) });
      return;
    }
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
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
  try {
    const abortController = new AbortController();
    request.once("aborted", () => abortController.abort());
    const result = await engineClient.startOpening(userId, userId, request.params.campaignId, parsed.data, abortController.signal);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/production-room/enter", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = engineProductionRoomEnterRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_production_room_enter",
      error: "Entering the production room requires the current campaign version and a command id.",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const result = await engineClient.enterProductionRoom(userId, userId, request.params.campaignId, parsed.data);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId/production-room", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const result = await engineClient.getProductionRoom(userId, userId, request.params.campaignId);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/production-room/narration", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = productionRoomNarrationReleaseRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_production_room_narration",
      error: "Narration release requires a valid completed sequence IR and current campaign version.",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const result = await engineClient.releaseProductionRoomNarration(userId, userId, request.params.campaignId, parsed.data);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.get("/api/campaigns/:campaignId/orchestration", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const result = await engineClient.getOrchestration(userId, userId, request.params.campaignId);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.post("/api/campaigns/:campaignId/orchestration/decisions", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  const parsed = orchestrationDecisionRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      code: "invalid_orchestration_decision",
      error: "An orchestration decision needs a current campaign version, scene revision, and typed facilitation action.",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const result = await engineClient.decideOrchestration(userId, userId, request.params.campaignId, parsed.data);
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    sendWebEngineError(response, error);
  }
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
    if (resolveEngineBackend(userId, request.params.campaignId) === "reference") {
      const adapter = requireReferenceAdapter(response);
      if (!adapter) return;
      const result = await adapter.updateCharacterDetails(userId, userId, request.params.campaignId, {
        name: parsed.data.name,
        background: parsed.data.background,
        alignment: parsed.data.alignment,
        description: parsed.data.description,
        details: parsed.data.details,
      });
      response.json({
        campaign: result.campaign,
        dockets: result.dockets,
        engineBackend: "reference",
        subscription: store.getSubscription(userId),
      });
      return;
    }
    const result = await engineClient.executeToolCall(userId, userId, request.params.campaignId, {
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      toolName: "character_update",
      arguments: {
        name: parsed.data.name,
        background: parsed.data.background,
        alignment: parsed.data.alignment,
        description: parsed.data.description,
        details: parsed.data.details,
      },
    });
    if (result.commandResult) {
      response.json({ ...result.commandResult, subscription: store.getSubscription(userId) });
      return;
    }
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError || error instanceof ReferenceEngineUnsupportedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendWebEngineError(response, error);
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
    if (resolveEngineBackend(userId, request.params.campaignId) === "reference") {
      const adapter = requireReferenceAdapter(response);
      if (!adapter) return;
      const result = await adapter.executeToolCall(userId, userId, request.params.campaignId, toolCallRequest);
      response.json({ ...result, subscription: store.getSubscription(userId) });
      return;
    }
    const result = await engineClient.executeToolCall(userId, userId, request.params.campaignId, toolCallRequest);
    if (result.commandResult) {
      response.json({ ...result.commandResult, subscription: store.getSubscription(userId) });
      return;
    }
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendWebEngineError(response, error);
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
    if (resolveEngineBackend(userId, request.params.campaignId) === "reference") {
      const adapter = requireReferenceAdapter(response);
      if (!adapter) return;
      const result = await adapter.executeToolCall(userId, userId, request.params.campaignId, toolCallRequest);
      response.json({ ...result, subscription: store.getSubscription(userId) });
      return;
    }
    const result = await engineClient.executeToolCall(userId, userId, request.params.campaignId, toolCallRequest);
    if (result.commandResult) {
      response.json({ ...result.commandResult, subscription: store.getSubscription(userId) });
      return;
    }
    response.json({ ...result, subscription: store.getSubscription(userId) });
  } catch (error) {
    if (error instanceof ReferenceEngineNotRoutedError) {
      sendReferenceEngineError(response, error);
      return;
    }
    sendWebEngineError(response, error);
  }
});

app.post("/api/session/action", async (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  try {
    const result = await engineClient.getCurrentCampaign(userId, userId);
    if (!result) {
      response.status(409).json({ code: "setup_required", error: "Create a campaign before taking an action." });
      return;
    }
    await sendCampaignCommand(request, userId, result.campaign.id, request.body, response);
  } catch (error) {
    sendWebEngineError(response, error);
  }
});

app.get("/api/billing/status", (request, response) => {
  const userId = requireUser(request, response);
  if (!userId) return;
  response.json({ subscription: store.getSubscription(userId) });
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
  console.log("Lantern web listening at " + config.appUrl);
  if (config.devAuthBypass && !config.clerkConfigured) {
    console.warn("DEV_AUTH_BYPASS is enabled; configure Clerk and disable it before deployment.");
  }
});

function sendWebEngineError(response: Response, error: unknown): void {
  if (error instanceof EngineHttpError) {
    response.status(error.status).json(error.data);
    return;
  }
  console.error(error instanceof Error ? error.message : "Unable to reach the Lantern engine.");
  response.status(502).json({ code: "engine_unavailable", error: "The Lantern engine is unavailable. Try again shortly." });
}
