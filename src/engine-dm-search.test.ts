import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialCampaign, normalizeCampaignState } from "./engine-domain.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { LanternEngineStore } from "./engine-store.js";
import type { EngineWorldObjectInput, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { openAiSdkFetch } from "./test-openai-stream.js";

const options = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.example/v1",
  model: "openai/gpt-5.6-luna",
  reasoningEffort: "medium",
  maxTokens: 2_500,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table Engine",
};

const playerText = "I search the staging area for supplies, disguises, weapons, or another way out.";

function response(message: Record<string, unknown>): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) } as Response;
}

function call(id: string, name: string, args: Record<string, unknown>) {
  return { id, name, args };
}

function toolResponse(...calls: Array<{ id: string; name: string; args: Record<string, unknown> }>): Response {
  return response({
    role: "assistant",
    content: null,
    tool_calls: calls.map(({ id, name, args }) => ({
      id,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    })),
  });
}

function narration(text: string): Response {
  return response({
    role: "assistant",
    content: JSON.stringify({ text, proposedFacts: [], suggestedActions: [] }),
  });
}

function searchState(accountId: string, actorId: string): LanternCampaignState {
  const state = createInitialCampaign(accountId, actorId);
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Mnehmos";
  state.character.abilities.wis = 20;
  state.worldContext = {
    id: "staging-area",
    title: "The Staging Area",
    description: "A bare service yard waits behind the arena, with no established supplies or disguise in sight.",
    features: ["bare service yard", "arena wall"],
    exits: [{ id: "service-passage", label: "A service passage leads away" }],
    npcs: [],
    merchants: [],
    objects: [],
  };
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

function createStore(state: LanternCampaignState, context: RequestContext): LanternEngineStore {
  const directory = mkdtempSync(join(tmpdir(), "lantern-dm-search-"));
  const store = new LanternEngineStore(join(directory, "engine.db"));
  store.createCampaign(context, state);
  return store;
}

function authoredCloak(): EngineWorldObjectInput {
  return {
    id: "arena-worker-cloak",
    definition: {
      key: "arena-worker-cloak",
      sourceRef: "authored-table:staging-search-v1",
      name: "Arena-worker cloak",
      description: "A coarse red-striped cloak sized for an arena worker.",
      material: "cloth",
      tags: ["cloak", "disguise", "mundane"],
      affordances: ["inspect", "take", "carry", "drop", "equip"],
      prerequisites: [],
      effectInteractions: [],
      weight: 1,
      criticalPolicy: {
        kind: "ordinary_consequence",
        canDestroy: true,
        canLose: true,
        canSell: true,
        canConsume: false,
        canHide: true,
      },
    },
    state: "intact",
    locationRef: null,
  };
}

describe("DM broad-search provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not turn a prose-only search success into an uncommitted reward", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolResponse(
        call("search-check", "roll_check", {
          ability: "wis",
          skill: "perception",
          goal: playerText,
        }),
      ))
      .mockResolvedValueOnce(narration("You find a red-striped cloak, a canvas bundle, and a low wooden hatch."))
      .mockResolvedValueOnce(narration("You find a red-striped cloak, a canvas bundle, and a low wooden hatch."));
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

    const state = searchState("account-search-absent", "actor-search-absent");
    const context = contextFor(state);
    const store = createStore(state, context);
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      randomUUID(),
      state.version,
      playerText,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check"]);
    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).not.toMatch(/cloak|bundle|hatch/i);
    expect(result.state.worldContext?.objects).toEqual([]);
    expect(JSON.stringify(result.state.character.inventory)).not.toContain("arena-worker-cloak");
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.messages[0]?.content).toContain("a successful check does not create a reward");
    store.close();
  });

  it("accepts a typed present object, preserves its provenance, and replays it consistently", async () => {
    const proposal = authoredCloak();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolResponse(
        call("search-check", "roll_check", {
          ability: "wis",
          skill: "perception",
          goal: playerText,
        }),
      ))
      .mockResolvedValueOnce(toolResponse(
        call("author-cloak", "world_context", {
          title: "The Staging Area",
          description: "A bare service yard waits behind the arena.",
          features: ["bare service yard", "arena wall"],
          exits: [{ id: "service-passage", label: "A service passage leads away" }],
          objects: { upsert: [proposal] },
        }),
      ))
      .mockResolvedValueOnce(narration("The search turns up the authored arena-worker cloak, a bounded table opportunity recorded for this scene."));
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

    const state = searchState("account-search-present", "actor-search-present");
    const context = contextFor(state);
    const store = createStore(state, context);
    const clientCommandId = randomUUID();
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      clientCommandId,
      state.version,
      playerText,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check", "world_context"]);
    const found = result.state.worldContext?.objects.find((object) => object.id === proposal.id);
    expect(found).toMatchObject({
      id: proposal.id,
      definition: { sourceRef: proposal.definition.sourceRef, name: proposal.definition.name },
      ownerRef: { kind: "world", id: "staging-area" },
      state: "intact",
    });
    expect(found?.provenance).toEqual(expect.objectContaining({
      sourceCommandId: `${clientCommandId}:1`,
      sourceVersion: 1,
    }));
    expect(result.state.character.inventory.some((item) => item.id === proposal.id)).toBe(false);

    const refreshed = store.getCampaign(context);
    expect(refreshed.worldContext?.objects.find((object) => object.id === proposal.id)).toMatchObject({
      definition: { sourceRef: proposal.definition.sourceRef },
      provenance: expect.objectContaining({ sourceCommandId: `${clientCommandId}:1` }),
    });
    const replay = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      clientCommandId,
      state.version,
      playerText,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    store.close();
  });

  it("uses a check fallback for search instead of claiming encounter loot", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("provider unavailable"));
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

    const state = searchState("account-search-provider-failure", "actor-search-provider-failure");
    const context = contextFor(state);
    const store = createStore(state, context);
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      randomUUID(),
      state.version,
      playerText,
    );

    expect(result).toMatchObject({ tool: "roll_check", readOnly: false });
    expect(result.event?.tool).toBe("roll_check");
    expect(result.state.combat.lootClaimed).toBe(false);
    expect(result.state.worldContext?.objects).toEqual([]);
    store.close();
  });
});
