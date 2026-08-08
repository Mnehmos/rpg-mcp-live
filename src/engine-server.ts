import { randomUUID, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import {
  buildOpen5eContentCatalog,
  CampaignContentPolicyError,
  resolverPolicyForCampaign,
  validateCampaignContentPolicy,
  type DeploymentContentPolicy,
} from "./content/catalog.js";
import { Open5eContentResolver } from "./content/resolve.js";
import { loadInstalledOpen5ePackRegistry } from "./content/registry.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { engineConfig } from "./engine-config.js";
import {
  engineCommandRequestSchema,
  engineCampaignCreateSchema,
  engineCampaignDeleteSchema,
  engineOpeningRequestSchema,
  engineProductionRoomEnterRequestSchema,
  engineToolCallRequestSchema,
  type CreateCampaignContext,
  type EngineCommand,
  type EngineToolName,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, projectEventForActor, projectResolutionForActor, projectStateForActor, resolveEngineCommand, resolveProductionRoomEnter, resolveProductionRoomNarrationRelease, toSessionView } from "./engine-domain.js";
import { parseProductionRoomState, productionRoomNarrationReleaseRequestSchema, projectNarrationSequenceForActor, projectSceneForActor } from "./engine-production-room.js";
import { open5eCharacterOptions } from "./open5e-rules.js";
import { registerOpen5ePackCompatibilityAlias } from "./content/rules-kernel.js";
import {
  commandForTool,
  executeReadTool,
  lanternToolDefinitions,
  parseToolArguments,
} from "./engine-tools.js";
import {
  EngineActorMismatchError,
  EngineCampaignNotFoundError,
  EngineCommandIdReuseError,
  EngineCommandInProgressError,
  EngineVersionConflictError,
  LanternEngineStore,
} from "./engine-store.js";

const contentRegistry = await loadInstalledOpen5ePackRegistry();
const contentPack = contentRegistry.activePack;
const deploymentContentPolicy: DeploymentContentPolicy = {
  defaultGamesystem: engineConfig.contentGamesystem,
  defaultBaseDocument: engineConfig.contentDefaultBaseDocument,
  allowedGamesystems: engineConfig.contentAllowedGamesystems,
  allowedLicenses: engineConfig.contentAllowedLicenses,
  allowedDocuments: engineConfig.contentAllowedDocuments,
  baseDocuments: engineConfig.contentBaseDocuments,
};
const contentCatalog = buildOpen5eContentCatalog(contentPack, deploymentContentPolicy);
const contentResolverCache = new Map<string, Open5eContentResolver>();
function contentResolverFor(state: LanternCampaignState): Open5eContentResolver {
  const campaignPack = contentRegistry.requireByRulesVersion(state.rulesVersion);
  const policy = validateCampaignContentPolicy(campaignPack, deploymentContentPolicy, state.contentPolicy);
  const cacheKey = `${state.rulesVersion}\u0000${JSON.stringify(policy)}`;
  const cached = contentResolverCache.get(cacheKey);
  if (cached) return cached;
  const resolver = new Open5eContentResolver(campaignPack, resolverPolicyForCampaign(policy));
  contentResolverCache.set(cacheKey, resolver);
  return resolver;
}
const store = new LanternEngineStore(engineConfig.databasePath);
for (const descriptor of contentRegistry.descriptors()) store.installContentPack(descriptor);
for (const installedPack of store.getInstalledContentPacks()) {
  if (
    installedPack.packVersion === contentPack.descriptor.packVersion
    && installedPack.packHash !== contentPack.descriptor.packHash
  ) {
    registerOpen5ePackCompatibilityAlias(installedPack.packHash, contentPack.descriptor.packHash);
    console.warn(
      `Open5e compatibility alias registered for retained ${installedPack.packVersion} hash `
      + `${installedPack.packHash.slice(0, 12)} -> ${contentPack.descriptor.packHash.slice(0, 12)}.`
    );
  }
}
const modelOptions = {
  apiKey: engineConfig.openRouterApiKey,
  baseUrl: engineConfig.openRouterBaseUrl,
  model: engineConfig.openRouterModel,
  reasoningEffort: engineConfig.openRouterReasoningEffort,
  maxTokens: engineConfig.openRouterMaxTokens,
  siteUrl: engineConfig.openRouterSiteUrl,
  appName: engineConfig.openRouterAppName,
};
const dungeonMaster = new LanternDungeonMaster(store, modelOptions, contentResolverFor);
const app = express();

app.use(express.json({ limit: "128kb" }));

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "lantern-engine",
    environment: engineConfig.nodeEnv,
    database: Boolean(engineConfig.databasePath),
    openRouter: {
      enabled: Boolean(engineConfig.openRouterApiKey),
      model: engineConfig.openRouterModel,
      reasoningEffort: engineConfig.openRouterReasoningEffort,
    },
    rules: {
      provider: "Open5e",
      apiVersion: contentPack.manifest.sourceApiVersion,
      sourceDocument: contentPack.manifest.targetDocumentKey,
      version: contentPack.descriptor.rulesVersion,
      packVersion: contentPack.descriptor.packVersion,
      packHash: contentPack.descriptor.packHash,
      gamesystems: contentPack.descriptor.gamesystems,
      collections: contentPack.collectionNames(),
      installedPacks: contentRegistry.descriptors().map((descriptor) => ({
        packVersion: descriptor.packVersion,
        packHash: descriptor.packHash,
        rulesVersion: descriptor.rulesVersion,
      })),
    },
    toolCount: lanternToolDefinitions.length,
  });
});

app.use("/v1", (request, response, next) => {
  if (!authorized(request)) {
    response.status(401).json({ code: "engine_unauthorized", error: "The Lantern engine requires an authenticated internal caller." });
    return;
  }
  next();
});

app.get("/v1/tools", (_request, response) => {
  response.json({ tools: lanternToolDefinitions });
});

app.get("/v1/content-catalog", (_request, response) => {
  response.json({ catalog: contentCatalog });
});

app.get("/v1/character-options", (request, response) => {
  try {
    const context = createCampaignContext(request);
    const campaignId = typeof request.query.campaignId === "string" ? request.query.campaignId.trim() : "";
    const policy = campaignId
      ? store.getCampaign({ ...context, campaignId }).contentPolicy
      : contentCatalog.defaultPolicy;
    response.json({ options: open5eCharacterOptions({
      gamesystem: policy.gamesystem,
      allowedDocuments: policy.allowedDocumentKeys,
      allowedLicenses: policy.allowedLicenseKeys,
    }) });
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/v1/campaigns", (request, response) => {
  try {
    const context = createCampaignContext(request);
    const campaigns = store.listCampaigns(context.accountId).map(toSessionView);
    response.json({ campaigns });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/v1/campaigns", (request, response) => {
  try {
    const context = createCampaignContext(request);
    const parsed = engineCampaignCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ code: "invalid_campaign", error: "A campaign needs a name, premise, setting, and tone.", details: parsed.error.flatten() });
      return;
    }
    const {
      contentPolicy: requestedPolicy,
      experienceProfile: requestedExperienceProfile,
      ...campaignProfile
    } = parsed.data;
    const contentPolicy = validateCampaignContentPolicy(
      contentPack,
      deploymentContentPolicy,
      requestedPolicy ?? contentCatalog.defaultPolicy
    );
    const campaign = createInitialCampaign(
      context.accountId,
      context.actorId,
      undefined,
      campaignProfile,
      contentPack.descriptor.rulesVersion,
      contentPolicy,
      requestedExperienceProfile
    );
    const created = store.createCampaign(context, campaign);
    response.status(201).json({ campaign: toSessionView(created), state: created });
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/v1/campaigns/:campaignId", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const state = store.getCampaign(context);
    response.json({ campaign: toSessionView(state), state: projectStateForActor(context.actorId, state) });
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/v1/campaigns/:campaignId", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const parsed = engineCampaignDeleteSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "invalid_campaign_delete",
        error: "Deleting a campaign requires its current version and the exact DELETE confirmation.",
        details: parsed.error.flatten(),
      });
      return;
    }
    response.json(store.deleteCampaign(context, parsed.data.expectedCampaignVersion));
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/v1/campaigns/:campaignId/events", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const state = store.getCampaign(context);
    const policy = resolverPolicyForCampaign(state.contentPolicy);
    const events = store.listCampaignEvents(context)
      .map((event) => contentRegistry.resolveEvent(event, policy))
      .map((resolved) => ({
        ...resolved,
        event: projectEventForActor(context.actorId, state, resolved.event),
      }));
    response.json({ events });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/v1/campaigns/:campaignId/commands", async (request, response) => {
  const campaignId = request.params.campaignId;
  try {
    const context = createRequestContext(request, campaignId);
    const parsed = engineCommandRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "invalid_command",
        error: "A command needs a UUID clientCommandId, expectedCampaignVersion, and exactly one of action or playerText.",
        details: parsed.error.flatten(),
      });
      return;
    }

    const state = store.getCampaign(context);
    assertCampaignUsesActivePack(state);
    let result;
    if (parsed.data.playerText) {
      result = await dungeonMaster.resolveTurn(
        context,
        state,
        parsed.data.clientCommandId,
        parsed.data.expectedCampaignVersion,
        parsed.data.playerText
      );
    } else {
      const selected = commandForLegacyAction(parsed.data.action ?? "");
      if (!selected) {
        response.status(400).json({ code: "unsupported_action", error: "That quick action is not supported by the Lantern engine." });
        return;
      }
      result = store.executeCommand({
        context,
        clientCommandId: parsed.data.clientCommandId,
        expectedCampaignVersion: parsed.data.expectedCampaignVersion,
        command: selected.command,
        tool: selected.tool,
        playerText: legacyPlayerText(parsed.data.action ?? ""),
        resolve: (current) =>
          resolveEngineCommand(current, context, parsed.data.clientCommandId, selected.command, selected.tool),
      });
    }
    response.json(projectResolutionForActor(result, context.actorId));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/v1/campaigns/:campaignId/opening", async (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const parsed = engineOpeningRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "invalid_opening",
        error: "An opening needs a UUID clientCommandId and the current campaign version.",
        details: parsed.error.flatten(),
      });
      return;
    }
    const state = store.getCampaign(context);
    assertCampaignUsesActivePack(state);
    if (!state.character.created || state.phase !== "tutorial") {
      response.status(409).json({
        code: "opening_not_available",
        error: "The DM opening is available after character creation and before the sandbox begins.",
        campaignVersion: state.version,
      });
      return;
    }
    if (state.worldContext) {
      response.status(409).json({
        code: "opening_already_exists",
        error: "This campaign already has an authored opening context.",
        campaignVersion: state.version,
      });
      return;
    }
    const result = await dungeonMaster.startOpening(
      context,
      state,
      parsed.data.clientCommandId,
      parsed.data.expectedCampaignVersion
    );
    response.json(projectResolutionForActor(result, context.actorId));
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/v1/campaigns/:campaignId/production-room/enter", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const parsed = engineProductionRoomEnterRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "invalid_production_room_enter",
        error: "Entering the production room requires a UUID clientCommandId and the current campaign version.",
        details: parsed.error.flatten(),
      });
      return;
    }
    const state = store.getCampaign(context);
    assertCampaignUsesActivePack(state);
    const result = store.executeCommand({
      context,
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      command: { kind: "production_room_enter" },
      tool: "production_room",
      resolve: (current) => resolveProductionRoomEnter(current, context, parsed.data.clientCommandId),
    });
    response.json(projectResolutionForActor(result, context.actorId));
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/v1/campaigns/:campaignId/production-room", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const state = store.getCampaign(context);
    const room = state.productionRoom ? parseProductionRoomState(state.productionRoom) : null;
    response.json({
      productionRoom: room?.activeScene
        ? {
            scene: projectSceneForActor(room.activeScene, context.actorId),
            releasedSequences: room.releasedSequences.map(projectNarrationSequenceForActor),
            playback: room.playback,
          }
        : null,
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/v1/campaigns/:campaignId/production-room/narration", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const parsed = productionRoomNarrationReleaseRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: "invalid_production_room_narration",
        error: "Narration release requires a UUID clientCommandId, current campaign version, and a valid sequence IR.",
        details: parsed.error.flatten(),
      });
      return;
    }
    const result = store.executeCommand({
      context,
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      command: { kind: "declare", goal: `production_room_narration:${parsed.data.sequence.id}` },
      tool: "declare",
      resolve: (current) => resolveProductionRoomNarrationRelease(current, context, parsed.data.clientCommandId, parsed.data.sequence),
    });
    const publicResult = projectResolutionForActor(result, context.actorId);
    const room = result.state.productionRoom ? parseProductionRoomState(result.state.productionRoom) : null;
    response.json({
      ...publicResult,
      productionRoom: room?.activeScene
        ? {
            scene: projectSceneForActor(room.activeScene, context.actorId),
            releasedSequences: room.releasedSequences.map(projectNarrationSequenceForActor),
            playback: room.playback,
          }
        : null,
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/v1/campaigns/:campaignId/tool-calls", (request, response) => {
  try {
    const context = createRequestContext(request, request.params.campaignId);
    const parsed = engineToolCallRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ code: "invalid_tool_call", error: "The tool call envelope is invalid.", details: parsed.error.flatten() });
      return;
    }
    const state = store.getCampaign(context);
    const args = parseToolArguments(parsed.data.toolName, parsed.data.arguments);
    const command = commandForTool(parsed.data.toolName, args);
    if (!command) {
      response.json(executeReadTool(state, parsed.data.toolName, args, contentResolverFor(state)));
      return;
    }
    assertCampaignUsesActivePack(state);
    const result = store.executeCommand({
      context,
      clientCommandId: parsed.data.clientCommandId,
      expectedCampaignVersion: parsed.data.expectedCampaignVersion,
      command,
      tool: parsed.data.toolName,
      playerText: parsed.data.playerText,
      resolve: (current) =>
        resolveEngineCommand(current, context, parsed.data.clientCommandId, command, parsed.data.toolName, parsed.data.playerText),
    });
    const publicResult = projectResolutionForActor(result, context.actorId);
    response.json({
      tool: parsed.data.toolName,
      readOnly: false,
      accepted: publicResult.accepted,
      code: publicResult.code,
      message: publicResult.message,
      data: publicResult.data,
      campaignVersion: publicResult.state.version,
      commandResult: publicResult,
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
  sendError(response, error);
});

app.listen(engineConfig.port, "0.0.0.0", () => {
  console.log("Lantern engine listening on port " + engineConfig.port);
  console.log("Lantern engine tools available: " + lanternToolDefinitions.length);
});

function authorized(request: Request): boolean {
  if (!engineConfig.internalToken) return !engineConfig.isProduction;
  const supplied = request.header("x-lantern-engine-token") ?? "";
  const expected = Buffer.from(engineConfig.internalToken);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createRequestContext(request: Request, campaignId = request.params.campaignId as string): RequestContext {
  const accountId = request.header("x-lantern-account-id")?.trim();
  const actorId = request.header("x-lantern-actor-id")?.trim();
  if (!accountId || !actorId || !campaignId) throw new Error("Explicit account, actor, and campaign context are required.");
  return {
    requestId: request.header("x-request-id")?.trim() || randomUUID(),
    accountId,
    campaignId,
    actorId,
    capabilities: parseCapabilities(request.header("x-lantern-capabilities")),
  };
}

function createCampaignContext(request: Request): CreateCampaignContext {
  const accountId = request.header("x-lantern-account-id")?.trim();
  const actorId = request.header("x-lantern-actor-id")?.trim();
  if (!accountId || !actorId) throw new Error("Explicit account and actor context are required.");
  return {
    requestId: request.header("x-request-id")?.trim() || randomUUID(),
    accountId,
    actorId,
    capabilities: parseCapabilities(request.header("x-lantern-capabilities")),
  };
}

function parseCapabilities(value: string | undefined): string[] {
  const capabilities = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return capabilities?.length ? capabilities : ["player", "dm"];
}

function commandForLegacyAction(action: string): { command: EngineCommand; tool: EngineToolName | "listen" } | null {
  switch (action) {
    case "observe":
      return { command: { kind: "observe" }, tool: "observe" };
    case "listen":
      return { command: { kind: "listen" }, tool: "listen" };
    case "roll":
      return { command: { kind: "roll_check", ability: "wis", goal: "Make a general check." }, tool: "roll_check" };
    case "continue":
      return { command: { kind: "tutorial_advance" }, tool: "tutorial_advance" };
    default:
      return null;
  }
}

function legacyPlayerText(action: string): string {
  switch (action) {
    case "observe":
      return "I observe the current moment.";
    case "listen":
      return "I listen carefully.";
    case "roll":
      return "I make a general check.";
    case "continue":
      return "I continue the tutorial.";
    default:
      return "I take my turn.";
  }
}

class EngineCampaignRepinRequiredError extends Error {
  public constructor(public readonly campaignRulesVersion: string) {
    super("This campaign is pinned to a historical rules pack and must be explicitly re-pinned before gameplay can continue.");
    this.name = "EngineCampaignRepinRequiredError";
  }
}

function assertCampaignUsesActivePack(state: LanternCampaignState): void {
  if (state.rulesVersion !== contentPack.descriptor.rulesVersion) {
    throw new EngineCampaignRepinRequiredError(state.rulesVersion);
  }
}

function sendError(response: Response, error: unknown): void {
  if (error instanceof CampaignContentPolicyError) {
    response.status(400).json({ code: error.code, error: error.message });
    return;
  }
  if (error instanceof EngineCampaignNotFoundError) {
    response.status(404).json({ code: "campaign_not_found", error: error.message });
    return;
  }
  if (error instanceof EngineActorMismatchError) {
    response.status(403).json({ code: "actor_forbidden", error: error.message });
    return;
  }
  if (error instanceof EngineVersionConflictError) {
    response.status(409).json({
      code: "stale_version",
      error: error.message,
      session: toSessionView(error.currentState),
      state: error.currentState,
    });
    return;
  }
  if (error instanceof EngineCommandIdReuseError || error instanceof EngineCommandInProgressError) {
    response.status(409).json({ code: "command_conflict", error: error.message });
    return;
  }
  if (error instanceof EngineCampaignRepinRequiredError) {
    response.status(409).json({
      code: "campaign_repin_required",
      error: error.message,
      campaignRulesVersion: error.campaignRulesVersion,
      activeRulesVersion: contentPack.descriptor.rulesVersion,
    });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected Lantern engine error.";
  const status = message.includes("Explicit ") || message.includes("required") ? 400 : 500;
  response.status(status).json({ code: "engine_error", error: message });
}
