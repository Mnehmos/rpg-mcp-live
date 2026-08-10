import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineNpcTickCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import {
  EngineCommandInProgressError,
  EngineVersionConflictError,
  LanternEngineStore,
} from "./engine-store.js";
import type { OpenRouterCompletionTelemetry } from "./openrouter.js";
import type { ModelUsageTelemetry } from "./usage-ledger.js";
import { openAiSdkFetch as sdkFetch } from "./test-openai-stream.js";

const baseOptions = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.example/v1",
  model: "test/npc-model",
  fallbackModel: "test/must-not-run",
  fallbackBaseUrl: "https://fallback.example/v1",
  firstTokenTimeoutMs: 25,
  reasoningEffort: "medium",
  maxTokens: 2_500,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table Engine",
};

function fixtureState(): LanternCampaignState {
  const state = createInitialCampaign("npc-provider-account", "hero");
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Hero";
  state.character.lifecycleState = "conscious";
  state.worldContext = {
    id: "town",
    title: "Town",
    description: "A reviewed town with a market road.",
    features: ["watch-post"],
    exits: [{ id: "market", label: "the market" }],
    npcs: [{
      id: "guard",
      name: "Town Guard",
      description: "A recurring watch officer.",
      disposition: "neutral",
      goals: ["keep the market safe"],
      socialDc: 12,
      relationshipScore: 0,
      memories: [],
      agency: {
        actorType: "guard",
        locationRef: "town",
        schedule: [{ id: "market-watch", locationRef: "market", startMinute: 0, endMinute: 1_439 }],
        goals: [{ id: "guard-market", title: "Keep the market safe", priority: 90, status: "active" }],
        resources: { inventory: [], copper: 0, actionPoints: 2 },
        hp: 4,
        maxHp: 5,
        lifecycleState: "conscious",
        pendingAction: null,
        completedTriggerIds: [],
        reportedCrimeIds: [],
        invocations: [],
        consecutiveFailures: 0,
        circuitState: "closed",
        invocationDay: 0,
        invocationsToday: 0,
      },
    }],
    merchants: [],
    objects: [],
  };
  state.worldFacts = [
    {
      id: "public-curfew",
      kind: "area",
      title: "Market curfew",
      description: "The market closes at dusk.",
      visibility: "public",
      obscurity: "clear",
      requiredSense: "normal",
      passiveDc: null,
      sceneId: "town",
      revision: 1,
      active: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    {
      id: "hidden-cache",
      kind: "secret",
      title: "Hidden cache",
      description: "Player-only platinum is hidden behind the watch-post.",
      visibility: "hidden",
      obscurity: "clear",
      requiredSense: "normal",
      passiveDc: null,
      sceneId: "town",
      revision: 1,
      active: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ];
  state.actorKnowledge = [];
  return normalizeCampaignState(state);
}

function contextFor(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function createStore(state: LanternCampaignState, databasePath?: string) {
  const path = databasePath ?? join(mkdtempSync(join(tmpdir(), "lantern-npc-provider-")), "engine.db");
  const store = new LanternEngineStore(path);
  const context = contextFor(state);
  store.createCampaign(context, state);
  return { store, context, databasePath: path };
}

function optionsFor(store: LanternEngineStore) {
  return {
    ...baseOptions,
    onCompletionTelemetry: (event: OpenRouterCompletionTelemetry) => {
      store.recordModelUsage({
        ...event,
        requestedModel: event.model,
        latencyMs: event.durationMs,
      } as ModelUsageTelemetry);
    },
  };
}

function providerChoice(offerId: string, rationale = "This best advances the guard's current goal.") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({ offerId, rationale }),
        },
      }],
    }),
  };
}

const command: EngineNpcTickCommand = {
  kind: "npc_tick",
  trigger: "operator_batch",
  triggerId: "provider-trigger",
  npcId: "guard",
  provider: "openrouter",
};

describe("bounded provider-backed NPC agency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects exactly one legal offer from actor-safe context and records usage and replay evidence", async () => {
    const state = fixtureState();
    const { store, context } = createStore(state);
    const fetchMock = vi.fn().mockResolvedValue(providerChoice("rest", "Recover before returning to the market watch."));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));
    const dm = new LanternDungeonMaster(store, optionsFor(store));
    const clientCommandId = randomUUID();

    const result = await dm.resolveNpcAgencyTick(context, state, clientCommandId, 0, command);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens: number;
      tool_choice: string;
      messages: Array<{ content: string }>;
    };
    const actorRequest = JSON.parse(requestBody.messages[1]!.content) as {
      npc: { id: string; actorId: string; facts: Array<{ id: string }> };
      offers: Array<{ id: string }>;
    };
    expect(requestBody).toMatchObject({ max_tokens: 1_000, tool_choice: "none" });
    expect(actorRequest.npc).toMatchObject({ id: "guard", actorId: "guard" });
    expect(actorRequest.npc.facts.map((fact) => fact.id)).toEqual(["public-curfew"]);
    expect(actorRequest.offers.map((offer) => offer.id)).toEqual(["move_to_schedule", "rest", "no_op"]);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("Player-only platinum");
    expect(result.accepted).toBe(true);
    expect(result.state.worldContext?.npcs[0]?.agency).toMatchObject({
      locationRef: "town",
      hp: 5,
      consecutiveFailures: 0,
      circuitState: "closed",
      completedTriggerIds: ["provider-trigger"],
    });
    expect(result.state.worldContext?.npcs[0]?.agency?.invocations[0]).toMatchObject({
      provider: "openrouter",
      model: "test-model",
      status: "success",
      outcome: "selected",
      fallback: false,
      selectedOfferId: "rest",
      rationale: "Recover before returning to the market watch.",
    });
    expect(store.getModelUsageSummary({ clientCommandId })).toMatchObject({
      requestCount: 1,
      successfulRequestCount: 1,
      failureCount: 0,
      byPurpose: [{ purpose: "npc_agency", requestCount: 1, costMicrousd: 0 }],
    });

    const replay = await dm.resolveNpcAgencyTick(context, result.state, clientCommandId, 0, command);
    expect(replay.replayed).toBe(true);
    const duplicateTrigger = await dm.resolveNpcAgencyTick(
      context,
      result.state,
      randomUUID(),
      result.state.version,
      command,
    );
    expect(duplicateTrigger).toMatchObject({ accepted: false, code: "npc_trigger_replayed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    store.close();
  });

  it("rejects an out-of-menu response, then commits only the deterministic fallback", async () => {
    const state = fixtureState();
    const { store, context } = createStore(state);
    const fetchMock = vi.fn().mockResolvedValue(providerChoice("cast_fireball", "Invent a stronger option."));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));
    const dm = new LanternDungeonMaster(store, optionsFor(store));
    const clientCommandId = randomUUID();

    const result = await dm.resolveNpcAgencyTick(context, state, clientCommandId, 0, command);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.accepted).toBe(true);
    expect(result.state.worldContext?.npcs[0]?.agency).toMatchObject({
      locationRef: "market",
      hp: 4,
      consecutiveFailures: 1,
      completedTriggerIds: ["provider-trigger"],
    });
    expect(result.state.worldContext?.npcs[0]?.agency?.invocations[0]).toMatchObject({
      status: "invalid_response",
      outcome: "fallback",
      fallback: true,
      selectedOfferId: "move_to_schedule",
      rationale: null,
    });
    expect(store.getModelUsageSummary({ clientCommandId })).toMatchObject({
      requestCount: 1,
      successfulRequestCount: 0,
      failureCount: 1,
    });
    store.close();
  });

  it("reserves before provider work so a concurrent duplicate cannot make a second request", async () => {
    const state = fixtureState();
    const { store, context } = createStore(state);
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const fetchMock = vi.fn().mockImplementation(async () => {
      await providerGate;
      return providerChoice("rest");
    });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));
    const dm = new LanternDungeonMaster(store, optionsFor(store));
    const clientCommandId = randomUUID();

    const first = dm.resolveNpcAgencyTick(context, state, clientCommandId, 0, command);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expect(dm.resolveNpcAgencyTick(context, state, clientCommandId, 0, command))
      .rejects.toBeInstanceOf(EngineCommandInProgressError);
    await expect(dm.resolveNpcAgencyTick(context, state, randomUUID(), 0, command))
      .rejects.toBeInstanceOf(EngineCommandInProgressError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseProvider();
    await expect(first).resolves.toMatchObject({ accepted: true });
    store.close();
  });

  it("recovers an abandoned reservation after restart with fallback and rejects stale or unknown targets before provider work", async () => {
    const state = fixtureState();
    const directory = mkdtempSync(join(tmpdir(), "lantern-npc-provider-restart-"));
    const databasePath = join(directory, "engine.db");
    const { store, context } = createStore(state, databasePath);
    const clientCommandId = randomUUID();
    const reserved = store.reserveNpcAgencyCommand({
      context,
      clientCommandId,
      expectedCampaignVersion: 0,
      command,
      tool: "npc_tick",
      npcId: "guard",
    });
    expect(reserved).toMatchObject({ shouldInvokeProvider: true, recoveredAfterRestart: false });
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const fetchMock = vi.fn().mockResolvedValue(providerChoice("rest"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));
    const dm = new LanternDungeonMaster(reopened, optionsFor(reopened));
    const current = reopened.getCampaign(context);
    const recovered = await dm.resolveNpcAgencyTick(context, current, clientCommandId, 0, command);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recovered.state.worldContext?.npcs[0]?.agency?.invocations[0]).toMatchObject({
      provider: "openrouter",
      status: "provider_error",
      fallback: true,
      selectedOfferId: "move_to_schedule",
    });
    reopened.close();

    const persistedStore = new LanternEngineStore(databasePath);
    expect(persistedStore.getCampaign(context).worldContext?.npcs[0]?.agency).toMatchObject({
      locationRef: "market",
      completedTriggerIds: ["provider-trigger"],
      invocations: [expect.objectContaining({ fallback: true })],
    });
    persistedStore.close();

    const freshState = fixtureState();
    const fresh = createStore(freshState);
    const freshDm = new LanternDungeonMaster(fresh.store, optionsFor(fresh.store));
    await expect(freshDm.resolveNpcAgencyTick(fresh.context, freshState, randomUUID(), 99, command))
      .rejects.toBeInstanceOf(EngineVersionConflictError);
    const unknown = await freshDm.resolveNpcAgencyTick(
      fresh.context,
      freshState,
      randomUUID(),
      0,
      { ...command, triggerId: "unknown-target", npcId: "not-known" },
    );
    expect(unknown).toMatchObject({ accepted: false, code: "npc_not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
    fresh.store.close();
  });

  it("rejects a second NPC model from the ordinary in-scene DM tool loop", () => {
    const state = fixtureState();
    const { store, context } = createStore(state);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const dm = new LanternDungeonMaster(store, optionsFor(store));
    const output = (dm as unknown as {
      executeToolCall: (...args: unknown[]) => {
        accepted: boolean;
        code: string | null;
        stagedEffect?: unknown;
      };
    }).executeToolCall(
      context,
      state,
      randomUUID(),
      {
        id: "in-scene-npc-provider",
        type: "function",
        function: {
          name: "npc_tick",
          arguments: JSON.stringify({
            trigger: command.trigger,
            triggerId: command.triggerId,
            npcId: command.npcId,
            provider: command.provider,
          }),
        },
      },
      [],
      0,
      new Set(["social"]),
    );

    expect(output).toMatchObject({
      accepted: false,
      code: "npc_agency_requires_trigger_boundary",
    });
    expect(output).not.toHaveProperty("stagedEffect");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.worldContext?.npcs[0]?.agency?.completedTriggerIds).toEqual([]);
    store.close();
  });

  it("does not call the provider again when another commit makes the first provider result stale", async () => {
    const state = fixtureState();
    const { store, context } = createStore(state);
    const fetchMock = vi.fn().mockImplementation(async () => {
      const interferingCommand: EngineNpcTickCommand = {
        kind: "npc_tick",
        trigger: "operator_batch",
        triggerId: "interfering-trigger",
        npcId: "guard",
        offerId: "no_op",
        provider: "deterministic",
      };
      const interferingClientCommandId = randomUUID();
      store.executeCommand({
        context,
        clientCommandId: interferingClientCommandId,
        expectedCampaignVersion: 0,
        command: interferingCommand,
        tool: "npc_tick",
        resolve: (current) => resolveEngineCommand(
          current,
          context,
          interferingClientCommandId,
          interferingCommand,
          "npc_tick",
        ),
      });
      return providerChoice("rest");
    });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));
    const dm = new LanternDungeonMaster(store, optionsFor(store));

    await expect(dm.resolveNpcAgencyTick(context, state, randomUUID(), 0, command))
      .rejects.toBeInstanceOf(EngineVersionConflictError);
    const current = store.getCampaign(context);
    const recovered = await dm.resolveNpcAgencyTick(
      context,
      current,
      randomUUID(),
      current.version,
      command,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recovered).toMatchObject({ accepted: true, code: null });
    expect(recovered.state.worldContext?.npcs[0]?.agency?.completedTriggerIds).toEqual([
      "interfering-trigger",
      "provider-trigger",
    ]);
    expect(recovered.state.worldContext?.npcs[0]?.agency?.invocations.at(-1)).toMatchObject({
      provider: "openrouter",
      status: "provider_error",
      fallback: true,
    });
    store.close();
  });
});
