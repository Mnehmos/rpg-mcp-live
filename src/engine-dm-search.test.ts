import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialCampaign, normalizeCampaignState } from "./engine-domain.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { LanternEngineStore } from "./engine-store.js";
import type { LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { openAiSdkFetch } from "./test-openai-stream.js";
import { compileRuntimeContent } from "./content/runtime-compiler.js";

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

function searchState(accountId: string, actorId: string, withCloakFact = false): LanternCampaignState {
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
  if (withCloakFact) {
    const createdAt = new Date(0).toISOString();
    state.worldFacts = [{
      id: "staging-search-cloak",
      kind: "object",
      title: "Arena-worker cloak",
      description: "A coarse red-striped arena-worker cloak is stored in the staging area.",
      visibility: "public",
      obscurity: "clear",
      requiredSense: "normal",
      passiveDc: null,
      sceneId: "staging-area",
      revision: 1,
      active: true,
      createdAt,
      updatedAt: createdAt,
    }];
  }
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

function authoredCloakProposal() {
  return {
    kind: "item" as const,
    key: "arena-worker-cloak",
    name: "Arena-worker cloak",
    description: "A coarse red-striped cloak sized for an arena worker.",
    material: "cloth",
    tags: ["cloak", "disguise", "mundane"],
    category: "tool" as const,
    weight: 1,
    affordances: ["inspect", "take", "drop", "use"] as const,
  };
}

function authoredCloakId(state: LanternCampaignState): string {
  const compiled = compileRuntimeContent(authoredCloakProposal(), {
    campaignId: state.id,
    authorId: state.actorId,
    source: "dm",
    sourceRefs: ["world_fact:staging-search-cloak"],
    createdAt: new Date(0).toISOString(),
  }, true, "arena-worker-cloak");
  if (!compiled.ok || !compiled.instance) throw new Error("The cloak fixture did not compile.");
  return compiled.instance.id;
}

describe("DM broad-search provenance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("discards an orphaned search roll instead of turning prose into an uncommitted reward", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolResponse(
        call("search-check", "roll_check", {
          ability: "wis",
          skill: "perception",
          goal: playerText,
        }),
      ))
      .mockResolvedValueOnce(narration("You find a red-striped cloak, but no way out."))
      .mockResolvedValueOnce(narration("You find a red-striped cloak, but no way out."))
      .mockRejectedValueOnce(new Error("public narrator rejected the uncommitted reward"));
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

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ tool: "declare", readOnly: false });
    expect(result.event?.effects).toBeUndefined();
    expect(result.state.lastRoll).toBeNull();
    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).not.toMatch(/cloak|bundle|hatch/i);
    expect(result.state.worldContext?.objects).toEqual([]);
    expect(JSON.stringify(result.state.character.inventory)).not.toContain("arena-worker-cloak");
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.messages[0]?.content).toContain("Pre-existing enemies, traps, treasure, exits, locks, ownership, locations");
    store.close();
  });

  it("accepts a typed present object, preserves its provenance, and replays it consistently", async () => {
    const state = searchState("account-search-present", "actor-search-present", true);
    const proposal = authoredCloakProposal();
    const cloakId = authoredCloakId(state);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolResponse(
        call("search-check", "roll_check", {
          ability: "wis",
          skill: "perception",
          goal: playerText,
        }),
      ))
      .mockResolvedValueOnce(toolResponse(
        call("author-cloak", "content_compile", {
          proposal,
          instanceKey: "arena-worker-cloak",
          materialization: {
            evidence: { kind: "world_fact", ref: "staging-search-cloak" },
          },
        }),
      ))
      .mockResolvedValueOnce(narration("The search turns up the authored arena-worker cloak, and a low wooden hatch lies beside it."))
      .mockResolvedValueOnce(narration("You find the authored arena-worker cloak."))
      .mockResolvedValueOnce(narration("You find the authored arena-worker cloak."));
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

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

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check", "content_compile"]);
    const found = result.state.worldContext?.objects.find((object) => object.id === cloakId);
    const definitionId = result.state.runtimeContent.instances.find((instance) => instance.id === cloakId)?.definitionId;
    expect(definitionId).toBeDefined();
    expect(found).toMatchObject({
      id: cloakId,
      definition: { sourceRef: `runtime-content:${definitionId}`, name: proposal.name },
      ownerRef: { kind: "world", id: "staging-area" },
      state: "intact",
      materialization: {
        runtimeInstanceId: cloakId,
        evidence: {
          kind: "world_fact",
          ref: "staging-search-cloak",
        },
      },
    });
    expect(found?.materialization?.evidence.textHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.state.character.inventory.some((item) => item.id === cloakId)).toBe(false);

    const refreshed = store.getCampaign(context);
    expect(refreshed.worldContext?.objects.find((object) => object.id === cloakId)).toMatchObject({
      definition: { sourceRef: `runtime-content:${definitionId}` },
      materialization: { evidence: { ref: "staging-search-cloak" } },
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
    expect(fetchMock).toHaveBeenCalledTimes(5);
    store.close();
  });

  it("uses a no-roll declaration fallback for search instead of claiming encounter loot", async () => {
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

    expect(result).toMatchObject({ tool: "declare", readOnly: false });
    expect(result.event?.tool).toBe("declare");
    expect(result.state.lastRoll).toBeNull();
    expect(result.state.combat.lootClaimed).toBe(false);
    expect(result.state.worldContext?.objects).toEqual([]);
    store.close();
  });
});
