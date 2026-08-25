import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameStore } from "./store.js";
import { ReferenceEngineStore } from "./reference-engine-store.js";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError } from "./reference-engine-adapter.js";
import {
  normalizeToolArguments,
  ReferenceDmProviderUnavailableError,
  ReferenceDungeonMaster,
  REFERENCE_DM_SYSTEM_PROMPT,
} from "./reference-engine-dm.js";
import type { ReferenceEngineClient, ReferenceToolCallResult } from "./reference-engine-client.js";
import type { ReferenceEngineToolCatalog } from "./reference-engine-tools.js";
import { LlmUsageStore } from "./llm-usage.js";
import { config } from "./config.js";

function ok(payload: unknown, text = ""): ReferenceToolCallResult {
  return { text, isError: false, data: payload, raw: payload, payload };
}

function fakeClient(handlers: Record<string, (args: Record<string, unknown>) => unknown>): ReferenceEngineClient {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const key = `${name}.${args.action}`;
      const handler = handlers[key] ?? handlers[name];
      if (!handler) throw new Error(`no fixture for ${key}`);
      return ok(handler(args));
    }),
    deleteCampaignData: vi.fn(async () => ({ deleted: true })),
  } as unknown as ReferenceEngineClient;
}

function fakeCatalog(names: string[] = ["combat_action"]): ReferenceEngineToolCatalog {
  const tools = names.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: `${name} fixture capability.`,
      parameters: {
        type: "object" as const,
        properties: { action: { type: "string", enum: ["get", "set"] } },
        required: [],
      },
    },
  }));
  return {
    getTools: vi.fn(async () => tools),
    getTool: vi.fn(async (name: string) => tools.find((tool) => tool.function.name === name)),
  } as unknown as ReferenceEngineToolCatalog;
}

function openRouterMessage(content: string | null, toolCalls?: unknown[]) {
  return Response.json({ choices: [{ message: { content, tool_calls: toolCalls } }] });
}

function setUpRoutedCampaign(store: ReferenceEngineStore) {
  store.setBackend("account-1", "campaign-1", "reference");
  store.setReferenceIds("account-1", "campaign-1", {
    worldId: "world-1",
    partyId: "party-1",
    characterId: "char-1",
  });
}

/**
 * resolveTurn now fetches the fully-hydrated character sheet up front (to
 * give the model accurate saves/skills context instead of the reference
 * engine's bare record), on top of the existing fetch after the turn
 * completes -- every test with a routed characterId needs these fixtures
 * for both calls, not just the post-turn one.
 */
function characterFixture(characterClass = "fighter") {
  return {
    id: "char-1",
    name: "Hero",
    race: "human",
    characterClass,
    stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
    hp: 10,
    maxHp: 10,
    ac: 10,
    level: 1,
    xp: 0,
  };
}

const CHARACTER_FIXTURES = {
  "character_manage.get": () => characterFixture(),
  "narrative_manage.search": () => ({ notes: [] }),
  "inventory_manage.get_detailed": () => ({ inventory: [] }),
};

describe("ReferenceDungeonMaster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("instructs agent-backed NPC setup to use OpenRouter DeepSeek V4 Flash", () => {
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("provider openrouter");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("model deepseek/deepseek-v4-flash");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("maxTokens 8192");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("place every newly authored companion");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Before npc_manage.interact or agent_manage.invoke");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("dispatch the normal RPG MCP tool or tools");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Do not stop at the proposal");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("legitimate domain failure such as a miss or failed check");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("retry only rejected, malformed, or otherwise unexecuted calls");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("inventory_manage action transfer");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("give only adds an item and does not remove it from the player");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("exact questId and objective IDs returned by quest_manage.create");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Never derive an objective ID");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("call activate_tools with the smallest set");
  });

  it("starts with a compact palette and lets the DM activate only the capabilities it chooses", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-palette-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const usage = new LlmUsageStore(gameStore.getRawDb(), {
      ...config.llmUsage,
      freeDailyCostMicros: 1_000_000,
      freeMonthlyCostMicros: 1_000_000,
    });
    const dm = new ReferenceDungeonMaster(
      client,
      store,
      fakeCatalog(["combat_action", "spatial_manage", "npc_manage"]),
      adapter,
      {
        apiKey: "key",
        baseUrl: "https://openrouter.example/api/v1",
        model: "test-model",
        timeoutMs: 5000,
        usage,
      },
    );
    const requestBodies: Array<{ messages: Array<{ role: string; content: string | null }>; tools: Array<{ function: { name: string } }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requestBodies.push(JSON.parse(init.body));
      if (requestBodies.length === 1) {
        return Response.json({
          choices: [{ message: { content: null, tool_calls: [{
            id: "activate-1",
            type: "function",
            function: {
              name: "activate_tools",
              arguments: JSON.stringify({ names: ["spatial_manage", "npc_manage"] }),
            },
          }] } }],
          usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cost: 0.000001 },
        });
      }
      return Response.json({
        choices: [{ message: { content: "Mist gathers around the road ahead." } }],
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cost: 0.000001 },
      });
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I follow the road into the mist.");

    expect(requestBodies[0]?.tools.map((tool) => tool.function.name)).toEqual([
      "activate_tools",
      "combat_action",
      "spatial_manage",
      "npc_manage",
      "read_docket",
      "write_docket",
    ]);
    expect(requestBodies[1]?.tools.map((tool) => tool.function.name)).toEqual([
      "activate_tools",
      "combat_action",
      "spatial_manage",
      "npc_manage",
      "read_docket",
      "write_docket",
    ]);
    expect(requestBodies[0]?.messages.some((message) =>
      message.role === "system"
      && message.content?.includes("RPG MCP CAPABILITY DIRECTORY")
      && message.content.includes("combat_action")
      && message.content.includes("spatial_manage")
      && message.content.includes("npc_manage")
    )).toBe(true);
    expect(result.toolDisclosure).toBeNull();
    expect(result.turnUsage).toMatchObject({ calls: 2, totalTokens: 220, costMicros: 2 });
    gameStore.close();
  });

  it("makes the stable authoring palette available without an activation-only round", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-core-palette-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "inventory_manage.use": () => ({ success: true, actionType: "use", lightSource: { active: true } }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(
      client,
      store,
      fakeCatalog(["inventory_manage", "spatial_manage", "scene_manage", "quest_manage"]),
      adapter,
      {
        apiKey: "key",
        baseUrl: "https://openrouter.example/api/v1",
        model: "test-model",
        timeoutMs: 5000,
      },
    );
    let requestCount = 0;
    let firstTools: string[] = [];
    let firstToolChoice: string | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requestCount += 1;
      const body = JSON.parse(init.body) as { tools: Array<{ function: { name: string } }>; tool_choice?: string };
      firstTools = body.tools.map((tool) => tool.function.name);
      if (requestCount === 1) firstToolChoice = body.tool_choice;
      if (requestCount === 1) {
        return openRouterMessage(null, [{
          id: "use-torch",
          type: "function",
          function: {
            name: "inventory_manage",
            arguments: JSON.stringify({ action: "use", itemId: "torch-1" }),
          },
        }]);
      }
      return openRouterMessage("The torch flares and pushes back the dark.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I light the torch.");

    expect(firstTools).toEqual([
      "activate_tools",
      "inventory_manage",
      "spatial_manage",
      "scene_manage",
      "quest_manage",
      "read_docket",
      "write_docket",
    ]);
    expect(firstToolChoice).toBe("required");
    expect(requestCount).toBe(2);
    expect(result.toolDisclosure?.calls[0]).toMatchObject({ name: "inventory_manage", accepted: true });
    gameStore.close();
  });

  it("recovers internally when a provider ignores required tool routing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-required-routing-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "inventory_manage.use": () => ({ success: true, actionType: "use", lightSource: { active: true } }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(
      client,
      store,
      fakeCatalog(["inventory_manage"]),
      adapter,
      {
        apiKey: "key",
        baseUrl: "https://openrouter.example/api/v1",
        model: "test-model",
        timeoutMs: 5000,
      },
    );
    let requestCount = 0;
    const toolChoices: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requestCount += 1;
      const body = JSON.parse(init.body) as { tool_choice?: string };
      toolChoices.push(body.tool_choice ?? "missing");
      if (requestCount === 1) return openRouterMessage("The torch flares before the DM consults the engine.");
      if (requestCount === 2) {
        return openRouterMessage(null, [{
          id: "use-torch-after-recovery",
          type: "function",
          function: {
            name: "inventory_manage",
            arguments: JSON.stringify({ action: "use", itemId: "torch-1" }),
          },
        }]);
      }
      return openRouterMessage("The torch catches, and the dark gives way around you.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I light the torch.");

    expect(toolChoices).toEqual(["required", "required", "auto"]);
    expect(result.toolDisclosure?.calls[0]).toMatchObject({ name: "inventory_manage", accepted: true });
    expect(result.narration.text).toContain("torch catches");
    gameStore.close();
  });

  it("keeps improvisation opt-in even when an older turn used it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-improvisation-palette-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.appendLogMessages("account-1", "campaign-1", [{
      id: "prior-improvisation",
      kind: "tool",
      text: "The DM consulted the game world.",
      createdAt: "2026-01-01T00:00:00.000Z",
      toolDisclosure: {
        spoilerWarning: "Spoilers",
        calls: [{ name: "improvisation_manage", arguments: { action: "apply_effect" }, result: { success: true }, accepted: true }],
      },
    }]);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(["combat_action", "improvisation_manage"]), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });
    let requestTools: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requestTools = (JSON.parse(init.body) as { tools: Array<{ function: { name: string } }> }).tools.map((tool) => tool.function.name);
      return openRouterMessage("The road bends into darkness.");
    }));

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I follow the road.");

    expect(requestTools).not.toContain("improvisation_manage");
    expect(requestTools).toContain("activate_tools");
    gameStore.close();
  });

  it("omits blank optional tool fields without hiding required nested validation", () => {
    const tool = {
      type: "function" as const,
      function: {
        name: "npc_manage",
        description: "",
        parameters: {
          type: "object" as const,
          properties: {
            action: { type: "string" },
            networkId: { type: "string" },
            seedRelationship: {
              type: "object",
              properties: {
                withCharacterId: { type: "string" },
                notes: { type: "string" },
              },
              required: ["withCharacterId"],
            },
          },
          required: ["action"],
        },
      },
    } as import("./reference-engine-tools.js").OpenRouterToolDefinition;

    expect(normalizeToolArguments({
      action: "create",
      networkId: "",
      seedRelationship: { withCharacterId: "", notes: "" },
    }, tool)).toEqual({
      action: "create",
      seedRelationship: { withCharacterId: "" },
    });
  });

  it("throws for a campaign that isn't routed to the reference backend", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    await expect(dm.resolveTurn("account-1", "actor-1", "unrouted-campaign", "look around")).rejects.toThrow(
      ReferenceEngineNotRoutedError
    );
  });

  it("runs a tool-call round, forces tenant-scoping fields, then commits narration and bumps the version", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    let capturedArgs: Record<string, unknown> | null = null;
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.attack": (args) => {
        capturedArgs = args;
        return { success: true, damage: 6 };
      },
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "combat_action",
              // model hallucinates a wrong worldId/partyId and omits characterId
              arguments: JSON.stringify({ action: "attack", targetId: "goblin-1", worldId: "wrong-world" }),
            },
          },
        ]);
      }
      return openRouterMessage("You strike the goblin for 6 damage.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I attack the goblin.");

    expect(capturedArgs).toMatchObject({
      action: "attack",
      targetId: "goblin-1",
      worldId: "world-1", // forced, not the model's "wrong-world"
      partyId: "party-1",
      characterId: "char-1", // filled in since the model omitted it
      // No sessionId: tenant identity now travels in the signed x-rpg-tenant
      // header, not in arguments the model can see or influence.
    });
    expect(result.narration.text).toBe("You strike the goblin for 6 damage.");
    expect(result.narrationSource).toBe("llm");
    expect(result.toolDisclosure).toMatchObject({
      spoilerWarning: expect.stringContaining("Spoiler warning"),
      calls: [{
        name: "combat_action",
        accepted: true,
        arguments: {
          action: "attack",
          targetId: "goblin-1",
          actorId: "char-1",
          characterId: "char-1",
          worldId: "world-1",
          partyId: "party-1",
        },
        requestedArguments: { action: "attack", targetId: "goblin-1", worldId: "wrong-world" },
      }],
    });
    expect(result.toolDisclosure?.calls[0]?.result).toEqual({ success: true, damage: 6 });
    expect(result.campaignVersion).toBe(1);
    expect(result.session.log.some((m) => m.text === "I attack the goblin." && m.kind === "player")).toBe(true);
    expect(result.session.log.some((m) => m.kind === "tool" && m.toolDisclosure?.calls[0]?.name === "combat_action")).toBe(true);
    expect(result.session.log.some((m) => m.text === "You strike the goblin for 6 damage." && m.kind === "narration")).toBe(
      true
    );
  });

  it("records provider usage and sends the configured reasoning completion cap", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-usage-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const usage = new LlmUsageStore(gameStore.getRawDb(), {
      freeDailyCostMicros: 100_000,
      freeMonthlyCostMicros: 200_000,
      playerDailyCostMicros: 100_000,
      playerMonthlyTargetCostMicros: 150_000,
      playerMonthlyCostMicros: 200_000,
      globalDailyCostMicros: 1_000_000,
      globalMonthlyCostMicros: 2_000_000,
      turnAdmissionReserveCostMicros: 10_000,
      maxTurnCostMicros: 100_000,
      npcReserveCostMicros: 50_000,
      reservationTtlMs: 60_000,
      inputCostUsdPerMillion: 0.2,
      outputCostUsdPerMillion: 1.2,
    });
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "openai/gpt-5.4",
      reasoningEffort: "medium",
      maxTokens: 123,
      timeoutMs: 5000,
      usage,
    });
    let requestBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requestBody = JSON.parse(init.body) as Record<string, unknown>;
      return Response.json({
        id: "provider-request-1",
        choices: [{ message: { content: "The first bell tolls." } }],
        usage: {
          prompt_tokens: 100,
          prompt_tokens_details: { cached_tokens: 80 },
          completion_tokens: 20,
          total_tokens: 120,
          completion_tokens_details: { reasoning_tokens: 5 },
          cost: 0.000123,
        },
      });
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Look toward the bell tower.");

    expect(requestBody).toMatchObject({
      model: "openai/gpt-5.4",
      max_completion_tokens: 123,
      reasoning_effort: "medium",
    });
    expect(result.turnUsage).toMatchObject({
      calls: 1,
      promptTokens: 100,
      cachedPromptTokens: 80,
      completionTokens: 20,
      reasoningTokens: 5,
      totalTokens: 120,
      costMicros: 123,
      costUsd: 0.000123,
    });
    expect(usage.getSummary("account-1").daily.costMicros).toBe(123);
    gameStore.close();
  });

  it("replays a resolved client command without calling OpenRouter again", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-command-replay-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    const fetchMock = vi.fn(async () => openRouterMessage("The gate opens."));
    vi.stubGlobal("fetch", fetchMock);

    const first = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I look at the gate.", {
      clientCommandId: "command-1",
      expectedCampaignVersion: 0,
    });
    const replay = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I look at the gate.", {
      clientCommandId: "command-1",
      expectedCampaignVersion: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replay).toMatchObject({
      campaignId: "campaign-1",
      campaignVersion: first.campaignVersion,
      replayed: true,
      narration: first.narration,
    });
  });

  it("records provider failures with a durable non-commit status", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-command-failure-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("OpenRouter unavailable");
    }));

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "Look around.", {
      clientCommandId: "command-1",
      expectedCampaignVersion: 0,
    })).rejects.toBeInstanceOf(ReferenceDmProviderUnavailableError);

    expect(store.getReferenceCommand("account-1", "campaign-1", "command-1")).toMatchObject({
      status: "failed",
      failure: {
        commitStatus: "not_committed",
        phase: "tool_loop",
        acceptedToolCalls: 0,
      },
    });
  });

  it("rejects the next command at dollar admission before loading tools or campaign state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-admission-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const usage = new LlmUsageStore(gameStore.getRawDb(), {
      ...config.llmUsage,
      freeDailyCostMicros: 10,
      freeMonthlyCostMicros: 10,
      globalDailyCostMicros: 1_000,
      globalMonthlyCostMicros: 1_000,
    });
    const prior = usage.reserve({
      userId: "account-1",
      campaignId: "campaign-0",
      clientCommandId: "prior-command",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 1,
      estimatedCompletionTokens: 1,
      estimatedCostMicros: 10,
    });
    usage.settle(prior.id, {
      provider: "openrouter",
      model: "test-model",
      promptTokens: 1,
      completionTokens: 1,
      costMicros: 10,
      costSource: "provider",
    });
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const campaignSpy = vi.spyOn(adapter, "getCampaign");
    const catalog = fakeCatalog();
    const dm = new ReferenceDungeonMaster(client, store, catalog, adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
      usage,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "I open the sealed door.", {
      clientCommandId: "blocked-command",
      expectedCampaignVersion: 0,
    })).rejects.toBeInstanceOf(ReferenceDmProviderUnavailableError);

    expect(catalog.getTools).not.toHaveBeenCalled();
    expect(campaignSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getReferenceCommand("account-1", "campaign-1", "blocked-command")).toMatchObject({
      status: "failed",
      failure: { commitStatus: "not_committed", phase: "admission", acceptedToolCalls: 0 },
    });
    gameStore.close();
  });

  it("does not mark a read-only docket lookup as an uncertain commit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-read-only-failure-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [{
          id: "read-state",
          type: "function",
          function: { name: "read_docket", arguments: JSON.stringify({ name: "state" }) },
        }]);
      }
      throw new Error("OpenRouter unavailable after read-only context lookup");
    }));

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "Recall the current state.", {
      clientCommandId: "command-read-only",
      expectedCampaignVersion: 0,
    })).rejects.toBeInstanceOf(ReferenceDmProviderUnavailableError);

    expect(store.getReferenceCommand("account-1", "campaign-1", "command-read-only")).toMatchObject({
      status: "failed",
      failure: {
        commitStatus: "not_committed",
        acceptedToolCalls: 0,
      },
    });
  });

  it("records context failures instead of leaving a command stuck processing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-command-context-failure-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    vi.spyOn(adapter, "getCampaign").mockRejectedValue(new Error("sheet unavailable"));
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "Look around.", {
      clientCommandId: "command-1",
      expectedCampaignVersion: 0,
    })).rejects.toBeInstanceOf(ReferenceDmProviderUnavailableError);

    expect(store.getReferenceCommand("account-1", "campaign-1", "command-1")).toMatchObject({
      status: "failed",
      failure: { commitStatus: "not_committed", phase: "context" },
    });
  });

  it("marks a resolved failed check as completed while preserving its domain outcome", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-failed-check-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.attack": () => ({ success: false, roll: 11, modifier: 0, total: 11, dc: 15, skill: "investigation" }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return call === 1
        ? openRouterMessage(null, [{
            id: "failed-check",
            type: "function",
            function: { name: "combat_action", arguments: JSON.stringify({ action: "attack", targetId: "goblin-1" }) },
          }])
        : openRouterMessage("The seal holds; your investigation turns up no opening.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Investigate the seal.");

    expect(result.toolDisclosure?.calls[0]).toMatchObject({
      accepted: true,
      result: { success: false, roll: 11, total: 11, dc: 15 },
    });
  });

  it("marks an explicit NPC-agent invocation with its separate provenance receipt", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-agent-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "agent_manage.invoke": () => ({
        actionType: "invoke",
        callId: "agent-call-1",
        provider: "openrouter",
        model: "test-npc-model",
        status: "ok",
        promptTokens: 42,
        completionTokens: 8,
        durationMs: 321,
        response: "The archivist watches the western door.",
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return call === 1
        ? openRouterMessage(null, [{
            id: "agent-tool-call",
            type: "function",
            function: {
              name: "agent_manage",
              arguments: JSON.stringify({ action: "invoke", agentId: "agent-1", situation: "Watch the door." }),
            },
          }])
        : openRouterMessage("The archivist watches the western door.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Ask the archivist to watch the door.");

    expect(result.toolDisclosure?.calls[0]).toMatchObject({
      name: "agent_manage",
      provenance: "npc_agent",
      accepted: true,
      result: {
        callId: "agent-call-1",
        provider: "openrouter",
        model: "test-npc-model",
        status: "ok",
        promptTokens: 42,
        completionTokens: 8,
        durationMs: 321,
      },
    });
  });

  it("settles nested NPC provider provenance under the owning player account", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-npc-usage-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const usage = new LlmUsageStore(gameStore.getRawDb(), config.llmUsage);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "agent_manage.invoke": () => ({
        actionType: "invoke",
        callId: "agent-call-usage-1",
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        status: "ok",
        promptTokens: 42,
        completionTokens: 8,
        totalTokens: 50,
        costUsd: 0.0009,
        costSource: "provider",
        response: "The archivist points toward the bell tower.",
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "deepseek/deepseek-v4-flash",
      maxTokens: 1000,
      timeoutMs: 5000,
      usage,
    });
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      return call === 1
        ? openRouterMessage(null, [{
          id: "npc-usage-tool",
          type: "function",
          function: {
            name: "agent_manage",
            arguments: JSON.stringify({ action: "invoke", agentId: "agent-1", situation: "Watch the bell tower." }),
          },
        }])
        : openRouterMessage("The archivist points toward the bell tower.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Ask the archivist what she sees.");

    expect(result.toolDisclosure?.calls[0]?.result).toMatchObject({ costUsd: 0.0009, totalTokens: 50 });
    expect(result.turnUsage?.calls).toBeGreaterThanOrEqual(2);
    expect(result.turnUsage?.costMicros).toBeGreaterThanOrEqual(900);
    expect(usage.getSummary("account-1").monthly.costMicros).toBe(result.turnUsage?.costMicros);
    gameStore.close();
  });

  it("continues an NPC proposal through the normal engine tool loop", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-agent-follow-through-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "agent_manage.invoke": () => ({
        actionType: "invoke",
        callId: "agent-call-2",
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        status: "ok",
        response: "Strike the creature protecting the archive.",
      }),
      "combat_action.attack": () => ({ success: true, damage: 7, actorId: "companion-1", targetId: "enemy-1" }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [{
          id: "agent-tool-call-2",
          type: "function",
          function: {
            name: "agent_manage",
            arguments: JSON.stringify({ action: "invoke", agentId: "agent-1", situation: "Protect the archive." }),
          },
        }]);
      }
      if (call === 2) {
        return openRouterMessage(null, [{
          id: "companion-action-1",
          type: "function",
          function: {
            name: "combat_action",
            arguments: JSON.stringify({ action: "attack", actorId: "companion-1", targetId: "enemy-1" }),
          },
        }]);
      }
      return openRouterMessage("The companion strikes the creature protecting the archive.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Have the companion protect the archive.");

    expect(result.toolDisclosure?.calls.map((entry) => entry.name)).toEqual([
      "agent_manage",
      "combat_action",
    ]);
    expect(result.toolDisclosure?.calls[0]?.provenance).toBe("npc_agent");
    expect(result.toolDisclosure?.calls[1]).toMatchObject({
      accepted: true,
      result: { success: true, damage: 7 },
    });
    expect(result.narration.text).toContain("strikes the creature");
  });

  it("gives the model the hydrated saving-throw proficiencies", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "character_manage.get": () => characterFixture("barbarian"),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let firstMessages: Array<{ role: string; content: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        firstMessages = (JSON.parse(init.body) as { messages: Array<{ role: string; content: string | null }> }).messages;
        return openRouterMessage("The sheet is ready.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "What are my saving throws?");

    const sheetMessage = firstMessages.find(
      (message) => message.role === "system" && message.content?.startsWith("CURRENT CHARACTER SHEET")
    );
    expect(sheetMessage?.content).toContain("STR +5 (proficient)");
    expect(sheetMessage?.content).toContain("CON +4 (proficient)");
    const stateMessage = firstMessages.find(
      (message) => message.role === "system" && message.content?.startsWith("CURRENT AUTHORITATIVE ENGINE PROJECTION")
    );
    expect(stateMessage?.content).toContain("An item not listed is not possessed");
  });

  it("includes prior player and narration messages in the next model request", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.appendLogMessages("account-1", "campaign-1", [
      { id: "prior-player", kind: "player", text: "I enter the archive.", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "prior-narration", kind: "narration", text: "Dust swirls beneath the shelves.", createdAt: "2026-01-01T00:00:01.000Z" },
    ]);

    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let firstMessages: Array<{ role: string; content: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        firstMessages = (JSON.parse(init.body) as { messages: Array<{ role: string; content: string | null }> }).messages;
        return openRouterMessage("You search the archive.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I search the archive.");

    expect(firstMessages).toEqual(
      expect.arrayContaining([
        { role: "user", content: "I enter the archive." },
        { role: "assistant", content: expect.stringContaining("[PRIOR DM NARRATION — continuity only") },
        { role: "user", content: "I search the archive." },
      ])
    );
    expect(firstMessages.find((message) => message.role === "assistant" && message.content?.startsWith("[PRIOR DM NARRATION"))?.content)
      .toContain("accepted RPG MCP results above are the source of truth");
  });

  it("replays prior accepted and rejected tool calls in API-valid message order", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-tool-history-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.appendLogMessages("account-1", "campaign-1", [
      { id: "prior-player", kind: "player", text: "I enter the drowned chapel.", createdAt: "2026-01-01T00:00:00.000Z" },
      {
        id: "prior-tools",
        kind: "tool",
        text: "The DM consulted the game world.",
        createdAt: "2026-01-01T00:00:01.000Z",
        toolDisclosure: {
          spoilerWarning: "Spoilers",
          calls: [
            {
              name: "spatial_manage",
              arguments: { action: "generate", name: "Drowned Chapel" },
              result: { success: true, roomId: "room-1" },
              accepted: true,
            },
            {
              name: "scene_manage",
              arguments: { action: "set", roomId: "missing-room" },
              result: { error: "room not found" },
              accepted: false,
            },
          ],
        },
      },
      { id: "prior-narration", kind: "narration", text: "Black water laps over the chapel floor.", createdAt: "2026-01-01T00:00:02.000Z" },
    ]);

    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    type CapturedMessage = {
      role: string;
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      tool_call_id?: string;
    };
    let firstMessages: CapturedMessage[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      firstMessages = (JSON.parse(init.body) as { messages: CapturedMessage[] }).messages;
      return openRouterMessage("The chapel waits in silence.");
    }));

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I listen at the altar.");

    const priorPlayerIndex = firstMessages.findIndex((message) => message.content === "I enter the drowned chapel.");
    const replayedAssistant = firstMessages[priorPlayerIndex + 1];
    const replayedAcceptedResult = firstMessages[priorPlayerIndex + 2];
    const replayedRejectedResult = firstMessages[priorPlayerIndex + 3];
    expect(replayedAssistant).toMatchObject({
      role: "assistant",
      content: null,
      tool_calls: [
        { function: { name: "spatial_manage", arguments: JSON.stringify({ action: "generate", name: "Drowned Chapel" }) } },
        { function: { name: "scene_manage", arguments: JSON.stringify({ action: "set", roomId: "missing-room" }) } },
      ],
    });
    expect(replayedAcceptedResult).toEqual({
      role: "tool",
      tool_call_id: replayedAssistant?.tool_calls?.[0]?.id,
      content: JSON.stringify({ success: true, roomId: "room-1" }),
    });
    expect(replayedRejectedResult).toEqual({
      role: "tool",
      tool_call_id: replayedAssistant?.tool_calls?.[1]?.id,
      content: JSON.stringify({ error: "room not found" }),
    });
    expect(firstMessages[priorPlayerIndex + 4]).toEqual({
      role: "assistant",
      content: expect.stringContaining("[PRIOR DM NARRATION — continuity only"),
    });
    expect(firstMessages[priorPlayerIndex + 4]?.content).toContain("Black water laps over the chapel floor.");
    const currentPlayerIndex = firstMessages.findIndex((message) => message.content === "I listen at the altar.");
    expect(currentPlayerIndex).toBeGreaterThan(priorPlayerIndex + 4);
    expect(firstMessages.slice(priorPlayerIndex + 5, currentPlayerIndex)).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "system", content: expect.stringContaining("CURRENT CHARACTER SHEET") })]),
    );
    expect(firstMessages[currentPlayerIndex]).toEqual({
      role: "user",
      content: "I listen at the altar.",
    });
  });

  it("accepts a character id learned from an accepted prior-turn tool result", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-prior-character-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.appendLogMessages("account-1", "campaign-1", [{
      id: "prior-combat-tools",
      kind: "tool",
      text: "The DM consulted the game world.",
      createdAt: "2026-01-01T00:00:00.000Z",
      toolDisclosure: {
        spoilerWarning: "Spoilers",
        calls: [{
          name: "combat_manage",
          arguments: { action: "spawn_quick_enemy", creature: "zombie" },
          result: {
            success: true,
            encounterId: "encounter-1",
            enemies: [{ id: "enemy-1", name: "Drowned Raider" }],
          },
          accepted: true,
        }],
      },
    }]);

    const attackHandler = vi.fn(() => ({ success: true, damage: 5 }));
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.attack": attackHandler,
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [{
          id: "current-attack",
          type: "function",
          function: {
            name: "combat_action",
            arguments: JSON.stringify({ action: "attack", characterId: "enemy-1", encounterId: "encounter-1" }),
          },
        }]);
      }
      return openRouterMessage("Your blade bites into the drowned raider.");
    }));

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I attack the drowned raider.");

    expect(attackHandler).toHaveBeenCalledWith(expect.objectContaining({ characterId: "enemy-1" }));
  });

  it("bounds replayed tool results and marks truncation explicitly", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-tool-history-cap-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.appendLogMessages("account-1", "campaign-1", [{
      id: "large-tool-result",
      kind: "tool",
      text: "The DM consulted the game world.",
      createdAt: "2026-01-01T00:00:00.000Z",
      toolDisclosure: {
        spoilerWarning: "Spoilers",
        calls: [{
          name: "combat_map",
          arguments: { action: "render", encounterId: "encounter-1" },
          result: { renderedMap: "x".repeat(5_000) },
          accepted: true,
        }],
      },
    }]);

    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let replayedResult = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const messages = (JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> }).messages;
      replayedResult = messages.find((message) => message.role === "tool")?.content ?? "";
      return openRouterMessage("The map settles into focus.");
    }));

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Study the battlefield.");

    expect(replayedResult.length).toBeLessThanOrEqual(4_000);
    expect(replayedResult).toContain("[result truncated for context; call the tool again for the full payload]");
  });

  it("rejects a characterId the model invented instead of learned from a tool result this turn", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const updateHandler = vi.fn(() => ({ id: "someone-elses-character", hp: 0 }));
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "character_manage.update": updateHandler,
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let capturedToolMessage: string | null = null;
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "character_manage",
                // Never returned by any tool result this turn — a
                // hallucinated or prompt-injected ID belonging to another
                // account's character (ADR-H13: the reference engine itself
                // enforces no tenant scoping at all).
                arguments: JSON.stringify({ action: "update", characterId: "someone-elses-character", hp: 0 }),
              },
            },
          ]);
        }
        if (call === 2) {
          const body = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> };
          capturedToolMessage = body.messages.find((m) => m.role === "tool")?.content ?? null;
        }
        return openRouterMessage("Nothing happens.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "set someone-elses-character's hp to 0");

    expect(updateHandler).not.toHaveBeenCalled();
    expect(capturedToolMessage).toContain("Unknown characterId");
  });

  it("allows a characterId the model just learned from this turn's own tool result (e.g. an NPC it created)", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    let capturedAttackArgs: Record<string, unknown> | null = null;
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "character_manage.create": () => ({ id: "npc-999", name: "Goblin" }),
      "combat_action.attack": (args) => {
        capturedAttackArgs = args;
        return { success: true, damage: 4 };
      },
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "call-1",
              type: "function",
              function: { name: "character_manage", arguments: JSON.stringify({ action: "create", name: "Goblin", characterType: "npc" }) },
            },
          ]);
        }
        if (call === 2) {
          return openRouterMessage(null, [
            {
              id: "call-2",
              type: "function",
              function: { name: "combat_action", arguments: JSON.stringify({ action: "attack", characterId: "npc-999" }) },
            },
          ]);
        }
        return openRouterMessage("You strike the goblin.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I spawn a goblin and attack it.");

    expect(capturedAttackArgs).toMatchObject({ characterId: "npc-999" });
  });

  it("retries once after OpenRouter returns an empty choices array, then succeeds", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return Response.json({ id: "gen-1", choices: [] });
      return openRouterMessage("The room is quiet.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I look around.");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.narration.text).toBe("The room is quiet.");
    expect(result.diagnostics?.providerCalls).toBe(2);
  });

  it("throws ReferenceDmProviderUnavailableError when the retry also returns an empty choices array", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    const fetchMock = vi.fn(async () => Response.json({ id: "gen-x", choices: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "I look around.")).rejects.toThrow(
      ReferenceDmProviderUnavailableError
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ReferenceDmProviderUnavailableError if no narration is produced within the round budget", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.dodge": () => ({ success: true }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    const fetchMock = vi.fn(async () =>
      openRouterMessage(null, [
        { id: "call-x", type: "function", function: { name: "combat_action", arguments: JSON.stringify({ action: "dodge" }) } },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "keep dodging forever")).rejects.toThrow(
      ReferenceDmProviderUnavailableError
    );
  });

  it("wraps an OpenRouter transport failure in ReferenceDmProviderUnavailableError", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "hello")).rejects.toThrow(
      ReferenceDmProviderUnavailableError
    );
  });

  it("write_docket persists via the store without ever reaching the remote reference engine", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "write_docket",
                arguments: JSON.stringify({ name: "player", content: "---\nbackstory: |\n  Once an acolyte.\n---" }),
              },
            },
          ]);
        }
        return openRouterMessage("You reflect on your past as an acolyte.");
      })
    );

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Tell me about my past.");

    expect(store.getDocket("account-1", "campaign-1", "player")).toBe("---\nbackstory: |\n  Once an acolyte.\n---");
    expect(result.session.character.details.backstory).toBe("Once an acolyte.");
    const remoteCalls = (client.callTool as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as string);
    expect(remoteCalls).not.toContain("write_docket");
    expect(remoteCalls).not.toContain("read_docket");
  });

  it("marks an invalid docket call rejected in its disclosure", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-invalid-docket-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [{
          id: "invalid-docket",
          type: "function",
          function: {
            name: "write_docket",
            arguments: JSON.stringify({ name: "rumors", content: "A false lead." }),
          },
        }]);
      }
      return openRouterMessage("The false lead is discarded.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Record the rumor.");

    expect(result.toolDisclosure?.calls[0]).toMatchObject({
      name: "write_docket",
      accepted: false,
      arguments: { name: "rumors", content: "A false lead." },
      result: expect.stringContaining("Unknown docket name"),
    });
  });

  it("does not publish a damaging narration immediately after a rejected combat call", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-rejected-combat-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.attack": () => ({ error: "Encounter is not active; no damage was applied." }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(["combat_action"]), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const requestBodies: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      call += 1;
      requestBodies.push(JSON.parse(init.body));
      if (call === 1) {
        return openRouterMessage(null, [{
          id: "rejected-attack",
          type: "function",
          function: {
            name: "combat_action",
            arguments: JSON.stringify({ action: "attack", targetId: "enemy-1" }),
          },
        }]);
      }
      if (call === 2) return openRouterMessage("Your sword strikes home, tearing away 8 hit points.");
      return openRouterMessage("The blade skitters off the ward; the enemy remains untouched.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I strike the enemy.");

    expect(call).toBe(3);
    expect(result.narration.text).toBe("The blade skitters off the ward; the enemy remains untouched.");
    expect(result.narration.text).not.toContain("8 hit points");
    expect(result.toolDisclosure?.calls[0]).toMatchObject({ name: "combat_action", accepted: false });
    expect(requestBodies[2]?.messages.at(-1)).toMatchObject({
      role: "system",
      content: expect.stringContaining("state-changing RPG MCP call was rejected"),
    });
    gameStore.close();
  });

  it("repeats rejection recovery when the repair call is rejected too", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-double-rejection-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.attack": () => ({ error: "Encounter is not active; no damage was applied." }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(["combat_action"]), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const requestBodies: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      call += 1;
      requestBodies.push(JSON.parse(init.body));
      if (call === 1 || call === 2) {
        return openRouterMessage(null, [{
          id: `rejected-attack-${call}`,
          type: "function",
          function: {
            name: "combat_action",
            arguments: JSON.stringify({ action: "attack", targetId: "enemy-1" }),
          },
        }]);
      }
      if (call === 3) return openRouterMessage("Your sword strikes home, tearing away 8 hit points.");
      return openRouterMessage("The second strike skitters off the ward; the enemy remains untouched.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I strike the enemy.");

    expect(call).toBe(4);
    expect(result.narration.text).toBe("The second strike skitters off the ward; the enemy remains untouched.");
    expect(result.narration.text).not.toContain("8 hit points");
    expect(result.toolDisclosure?.calls).toHaveLength(2);
    expect(result.toolDisclosure?.calls.every((tool) => tool.accepted === false)).toBe(true);
    expect(requestBodies[3]?.messages.at(-1)).toMatchObject({
      role: "system",
      content: expect.stringContaining("state-changing RPG MCP call was rejected"),
    });
    gameStore.close();
  });

  it("read_docket can read back the secrets docket for the model's own context", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.setDocket("account-1", "campaign-1", "secrets", "The innkeeper is a spy.");

    const client = fakeClient({
      ...CHARACTER_FIXTURES,
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let capturedSecret: string | null = null;
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            { id: "call-1", type: "function", function: { name: "read_docket", arguments: JSON.stringify({ name: "secrets" }) } },
          ]);
        }
        if (call === 2) {
          const body = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> };
          capturedSecret = body.messages.find((m) => m.role === "tool")?.content ?? null;
        }
        return openRouterMessage("You keep your suspicions to yourself.");
      })
    );

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "What do I suspect about the innkeeper?");

    expect(capturedSecret).toBe("The innkeeper is a spy.");
    expect(result.toolDisclosure?.calls[0]?.result).toBe("[DM-only content withheld]");
    expect(result.diagnostics).toMatchObject({
      acceptedToolCalls: 1,
      acceptedStateChangingToolCalls: 0,
      rejectedToolCalls: 0,
    });
    expect(JSON.stringify(result.session.log)).not.toContain("The innkeeper is a spy.");
  });

  it("redacts secrets-docket write content from the player disclosure", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-secret-disclosure-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({ ...CHARACTER_FIXTURES });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "write_docket",
              arguments: JSON.stringify({ name: "secrets", content: "The vault opens at midnight." }),
            },
          },
        ]);
      }
      return openRouterMessage("You keep the revelation to yourself.");
    }));

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Record the hidden omen.");

    expect(result.toolDisclosure?.calls[0]?.arguments).toEqual({
      name: "secrets",
      content: "[DM-only content withheld]",
    });
    expect(JSON.stringify(result.session.log)).not.toContain("The vault opens at midnight.");
  });
});

describe("reference DM scene authoring contract", () => {
  it("makes creative scene authoring and MCP commitment explicit", () => {
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Invent places, people, pressures, clues");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("There are no rooms, locations, NPCs, enemies, items, quests, clues");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Do not wait for the engine to reject an absent fact");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Treat every player intent as an invitation to author");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("scene_manage action set");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("player drives what happens next");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("History is not proof");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("current authoritative projection");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("Material-action routing is mandatory");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("A prose-only completion is not final");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("spatial_manage for persistent rooms and character placement");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("do not narrate that absence");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("write the canonical room id");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("make it playable through the engine");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("returned encounterId and participant ids");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("player intent -> relevant engine action -> returned engine result -> scene_manage set -> narration");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("never turn a skipped call into an 'unresolved' continuity fact");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("plain, diegetic D&D narration");
    expect(REFERENCE_DM_SYSTEM_PROMPT).toContain("do not paste headings, roll ledgers, HP/AC tables");
  });

  it("fills only the player's combat actor id while leaving other tool ids model-driven", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-combat-actor-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    let capturedCombatArgs: Record<string, unknown> | null = null;
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.attack": (args) => {
        capturedCombatArgs = args;
        return {
        success: true,
        hit: false,
        actorId: args.actorId,
        targetId: args.targetId,
        };
      },
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [{
          id: "attack-1",
          type: "function",
          function: {
            name: "combat_action",
            arguments: JSON.stringify({ action: "attack", encounterId: "encounter-1", targetId: "enemy-1" }),
          },
        }]);
      }
      return openRouterMessage("The bolt glances off the drowned figure.");
    }));

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I fire at the drowned figure.");

    expect(capturedCombatArgs).toEqual(expect.objectContaining({
      actorId: "char-1",
      targetId: "enemy-1",
      encounterId: "encounter-1",
    }));
  });

  it("records the DM's tool-authored opening scene in state memory", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-opening-commit-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "spatial_manage.generate": () => ({
        success: true,
        roomId: "room-1",
        name: "The Salt Archive",
        description: "A flooded archive beneath the quay.",
      }),
      "spatial_manage.move": (args) => ({
        success: true,
        newRoomId: args.roomId,
        newRoomName: "The Salt Archive",
      }),
      "scene_manage.set": () => ({
        success: true,
        sceneId: "scene-1",
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        call += 1;
        requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "generate-room",
              type: "function",
              function: {
                name: "spatial_manage",
                arguments: JSON.stringify({
                  action: "generate",
                  name: "The Salt Archive",
                  baseDescription: "A flooded archive beneath the quay.",
                  biomeContext: "coastal",
                }),
              },
            },
          ]);
        }
        if (call === 2) {
          return openRouterMessage(null, [
            {
              id: "move-player",
              type: "function",
              function: {
                name: "spatial_manage",
                arguments: JSON.stringify({ action: "move", roomId: "room-1" }),
              },
            },
          ]);
        }
        if (call === 3) {
          return openRouterMessage(null, [
            {
              id: "commit-scene",
              type: "function",
              function: {
                name: "scene_manage",
                arguments: JSON.stringify({
                  action: "set",
                  title: "The Salt Archive",
                  placeLabel: "The Salt Archive",
                  narration: "Mara arrives at the Salt Archive, where dark water laps at the broken shelves.",
                  participants: ["char-1"],
                }),
              },
            },
          ]);
        }
        return openRouterMessage("Mara arrives at the Salt Archive, where dark water laps at the broken shelves.");
      })
    );

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I observe the current moment.");

    expect(result.narration.text).toContain("Salt Archive");
    expect(store.getDocket("account-1", "campaign-1", "state")).toContain("Room id: room-1");
    expect(store.getDocket("account-1", "campaign-1", "state")).toContain("Player placed here this turn: yes");
    expect(store.getDocket("account-1", "campaign-1", "state")).toContain("Shared scene committed this turn: yes");
    expect(requestBodies.at(-1)?.tool_choice).toBe("none");
    expect(result.diagnostics).toMatchObject({
      providerCalls: 4,
      toolRounds: 3,
      toolCallNames: ["spatial_manage", "spatial_manage", "scene_manage"],
      acceptedToolCalls: 3,
      rejectedToolCalls: 0,
    });
    const remoteCalls = (client.callTool as ReturnType<typeof vi.fn>).mock.calls
      .filter((call) => ["spatial_manage", "scene_manage"].includes(call[0] as string))
      .map((call) => `${call[0]}.${(call[1] as Record<string, unknown>).action}`);
    expect(remoteCalls).toEqual(["spatial_manage.generate", "spatial_manage.move", "scene_manage.set"]);
  });

  it("lets the maximum creative tool-first turn reach narration", async () => {
    // A DM can spend all 16 tool rounds authoring a scene before it has enough
    // confirmed material to narrate; the loop reserves one final completion
    // for the fluid tool-first response.
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-long-authoring-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    const client = fakeClient({
      ...CHARACTER_FIXTURES,
      "combat_action.dodge": () => ({ success: true }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call <= 16) {
        return openRouterMessage(null, [
          {
            id: `creative-tool-${call}`,
            type: "function",
            function: { name: "combat_action", arguments: JSON.stringify({ action: "dodge" }) },
          },
        ]);
      }
      return openRouterMessage("The chamber settles into a shape you can finally explore.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await dm.resolveTurn(
      "account-1",
      "actor-1",
      "campaign-1",
      "I improvise a careful route through the newly forming chamber."
    );

    expect(fetchMock).toHaveBeenCalledTimes(17);
    expect(result.narration.text).toContain("chamber");
  });
});
