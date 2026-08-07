import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialCampaign } from "./engine-domain.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { LanternEngineStore } from "./engine-store.js";
import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RequestContext } from "./engine-contracts.js";

const options = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.example/v1",
  model: "openai/gpt-5.6-luna",
  reasoningEffort: "medium",
  maxTokens: 2500,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table Engine",
};

function createStore(): LanternEngineStore {
  const directory = mkdtempSync(join(tmpdir(), "lantern-dm-"));
  return new LanternEngineStore(join(directory, "engine.db"));
}

describe("Lantern OpenRouter tool loop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads context, commits one authoritative tool, and narrates the committed result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "tool-read",
                    type: "function",
                    function: { name: "observe", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "tool-check",
                    type: "function",
                    function: {
                      name: "roll_check",
                      arguments: JSON.stringify({
                        ability: "wis",
                        skill: "perception",
                        goal: "Study the current moment for a useful detail.",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: "A useful detail emerges from the first lead.",
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-a", "actor-a");
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: "account-a",
        actorId: "actor-a",
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: "account-a",
      campaignId: state.id,
      actorId: "actor-a",
      capabilities: ["player", "dm"],
    };
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(
      context,
      state,
      randomUUID(),
      0,
      "I study the current moment for a useful detail."
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.parallel_tool_calls).toBe(false);
    expect(firstRequest.tools).toHaveLength(42);
    const systemPrompt = firstRequest.messages[0]?.content;
    expect(systemPrompt).toContain("creative director");
    expect(systemPrompt).toContain("combat_start");
    expect(systemPrompt).toContain("creature content keys");
    expect(systemPrompt).toContain("never supplies fixed demo loot");
    expect(systemPrompt).toContain("commits the complete plan atomically");
    expect(result.event?.tool).toBe("turn_plan");
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check"]);
    expect(result.event?.rolls[0]?.kind).toBe("d20");
    expect(result.state.version).toBe(1);
    expect(result.narrationSource).toBe("llm");
    expect(result.narration.text).toContain("useful detail");
    expect(result.session.log.slice(-3).map((message) => message.kind)).toEqual(["player", "roll", "narration"]);
    store.close();
  });

  it("authors and persists a proactive opening before the first player turn", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "tool-opening-context",
                type: "function",
                function: {
                  name: "world_context",
                  arguments: JSON.stringify({
                    title: "The Salt Road at Dawn",
                    description: "A cold road cuts through the frontier city as a sealed star-metal door begins to hum beneath the paving stones.",
                    features: ["star-metal vibration", "a shuttered watch post"],
                    exits: [
                      { id: "watch-post", label: "Approach the shuttered watch post" },
                      { id: "market-road", label: "Follow the market road" },
                    ],
                  }),
                },
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: "Dawn finds you at the road's first impossible tremor. The watch post door swings open by itself." } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-opening", "actor-opening");
    state.version = 1;
    state.character.created = true;
    state.character.name = "Mnehmos";
    state.phase = "tutorial";
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: "account-opening",
        actorId: "actor-opening",
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: "account-opening",
      campaignId: state.id,
      actorId: "actor-opening",
      capabilities: ["player", "dm"],
    };
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.startOpening(context, state, randomUUID(), 1);

    expect(result.accepted).toBe(true);
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["world_context"]);
    expect(result.state.worldContext?.title).toBe("The Salt Road at Dawn");
    expect(result.narrationSource).toBe("llm");
    expect(result.session.log.at(-1)?.text).toContain("impossible tremor");
    expect(result.session.log.some((message) => message.kind === "player")).toBe(false);
    store.close();
  });

  it("stages multiple ordered effects and commits them as one idempotent campaign version", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "tool-note",
                type: "function",
                function: { name: "player_note_add", arguments: JSON.stringify({ text: "Narin leads the eastbound caravan." }) },
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "tool-quest",
                type: "function",
                function: {
                  name: "quest_create",
                  arguments: JSON.stringify({
                    title: "Guard the Eastbound Caravan",
                    objective: "See Narin's caravan safely through the pass.",
                    rewardXp: 100,
                    rewardCopper: 2_500,
                  }),
                },
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: "Narin seals the bargain and orders the caravan east." } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-plan", "actor-plan");
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: "account-plan",
        actorId: "actor-plan",
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: "account-plan",
      campaignId: state.id,
      actorId: "actor-plan",
      capabilities: ["player", "dm"],
    };
    const clientCommandId = randomUUID();
    const playerText = "I agree to guard Narin's caravan through the pass.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(context, state, clientCommandId, 0, playerText);

    expect(result.accepted).toBe(true);
    expect(result.state.version).toBe(1);
    expect(result.event).toMatchObject({
      tool: "turn_plan",
      previousVersion: 0,
      version: 1,
      outcome: "atomic_turn_plan",
    });
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["player_note_add", "quest_create"]);
    expect(result.event?.stateChanges.map((change) => change.path)).toEqual(expect.arrayContaining([
      "/playerNotes",
      "/quests",
      "/quest",
    ]));
    expect(result.state.playerNotes.at(-1)?.text).toBe("Narin leads the eastbound caravan.");
    expect(result.state.quests.at(-1)).toMatchObject({
      title: "Guard the Eastbound Caravan",
      reward: { xp: 100, copper: 2_500 },
    });
    expect(result.session.log.slice(-2).map((message) => message.kind)).toEqual(["player", "narration"]);
    expect(result.session.log.at(-1)?.text).toContain("orders the caravan east");

    const replay = await dm.resolveTurn(context, state, clientCommandId, 0, playerText);
    expect(replay.replayed).toBe(true);
    expect(replay.state.version).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(store.getCampaign(context).version).toBe(1);
    store.close();
  });
});
