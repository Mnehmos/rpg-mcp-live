import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialCampaign } from "./engine-domain.js";
import { buildDmContext, LanternDungeonMaster } from "./engine-dm.js";
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

  it("passes the authoritative structured action offers to the DM context", () => {
    const state = createInitialCampaign("account-offers", "actor-offers");
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const dmContext = buildDmContext(state, context, "I look around.", "player_turn");
    expect(dmContext.actionOffers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: "create_character",
        timing: "free",
        cost: {},
        validTargets: [],
        reasonUnavailable: null,
        stateVersion: state.version,
      }),
    ]));
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
                content: JSON.stringify({
                  text: "A useful detail emerges from the first lead.",
                  proposedFacts: [],
                  suggestedActions: [{
                    id: "study-lead",
                    label: "Study the lead",
                    prompt: "I study the first lead closely for anything it reveals.",
                  }],
                }),
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
    expect(firstRequest.tools).toHaveLength(72);
    expect(firstRequest.provider).toEqual({ require_parameters: true });
    expect(firstRequest.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "lantern_narration",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["text", "proposedFacts", "suggestedActions"],
        },
      },
    });
    const systemPrompt = firstRequest.messages[0]?.content;
    expect(systemPrompt).toContain("creative director");
    expect(systemPrompt).toContain("combat_start");
    expect(systemPrompt).toContain("creature content keys");
    expect(systemPrompt).toContain("never supplies fixed demo loot");
    expect(systemPrompt).toContain("challenge_attempt");
    expect(systemPrompt).toContain("commits the complete plan atomically");
    expect(systemPrompt).toContain("context-aware moves");
    expect(systemPrompt).toContain('The shorthand kinds "npc" and "location" are invalid');
    expect(result.event?.tool).toBe("turn_plan");
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check"]);
    expect(result.event?.rolls[0]?.kind).toBe("d20");
    expect(result.state.version).toBe(1);
    expect(result.narrationSource).toBe("llm");
    expect(result.narration.text).toContain("useful detail");
    expect(result.narration.suggestedActions[0]?.prompt).toContain("first lead");
    expect(result.session.suggestedActions[0]?.id).toBe("study-lead");
    expect(store.getCampaign(context).suggestedActions[0]?.id).toBe("study-lead");
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
          choices: [{ message: { role: "assistant", content: JSON.stringify({
            text: "Dawn finds you at the road's first impossible tremor. The watch post door swings open by itself.",
            proposedFacts: [],
            suggestedActions: [],
          }) } }],
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

  it("returns narration validation errors for one bounded repair before accepting an opening", async () => {
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
                id: "tool-repair-context",
                type: "function",
                function: {
                  name: "world_context",
                  arguments: JSON.stringify({
                    title: "The Ludus Holding Vault",
                    description: "Iron bars separate the holding vault from the arena corridor.",
                    features: ["a dropped key"],
                    exits: [{ id: "arena-corridor", label: "Enter the arena corridor" }],
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
          choices: [{ message: { role: "assistant", content: JSON.stringify({
            text: "A key rings against the stones just beyond the bars.",
            proposedFacts: [{
              kind: "location",
              title: "The Ludus Holding Vault",
              description: "A cell beneath the arena.",
              visibility: "public",
            }],
            suggestedActions: [],
          }) } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: JSON.stringify({
            text: "A key rings against the stones just beyond the bars. The guard has not noticed it fall.",
            proposedFacts: [],
            suggestedActions: [{
              id: "reach-for-key",
              label: "Reach for the key",
              prompt: "I reach through the bars and try to draw the key closer.",
            }],
          }) } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-opening-repair", "actor-opening-repair");
    state.version = 1;
    state.character.created = true;
    state.character.name = "Mnehmos";
    state.phase = "tutorial";
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: state.accountId,
        actorId: state.actorId,
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const dm = new LanternDungeonMaster(store, options);
    const commandId = randomUUID();
    const result = await dm.startOpening(
      context,
      state,
      commandId,
      1
    );
    const replay = await dm.startOpening(context, state, commandId, 1);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const repairRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(repairRequest.tools).toBeUndefined();
    expect(repairRequest.messages.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("proposedFacts.0.kind"),
    });
    expect(repairRequest.messages.at(-1)?.content).toContain("discover_location");
    expect(result.narrationSource).toBe("llm");
    expect(result.narration.text).toContain("guard has not noticed");
    expect(result.narration.text).not.toContain("proposedFacts");
    expect(result.state.version).toBe(2);
    expect(result.state.worldContext?.title).toBe("The Ludus Holding Vault");
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["world_context"]);
    expect(replay).toMatchObject({ replayed: true, state: { version: 2 } });
    store.close();
  });

  it("never exposes raw JSON when the narration repair also fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const malformed = (text: string) => JSON.stringify({
      text,
      proposedFacts: [{ kind: "npc", title: "Invalid shorthand" }],
      suggestedActions: [],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: malformed("The bellkeeper lowers her voice.") } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: malformed("The invalid repair should not replace safe text.") } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-repair-fallback", "actor-repair-fallback");
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: state.accountId,
        actorId: state.actorId,
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      randomUUID(),
      0,
      "I ask what the bellkeeper knows."
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("narration contract repair failed"));
    expect(result.narration.text).toBe("The bellkeeper lowers her voice.");
    expect(result.narration.text).not.toContain("proposedFacts");
    expect(result.narration.proposedFacts).toEqual([]);
    expect(result.narration.suggestedActions).toEqual([]);
    store.close();
  });

  it("decodes a top-level JSON string before using it as safe narration", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: JSON.stringify("The hall is dark.\nSomething moves.") } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: JSON.stringify("The repair is still only a string.") } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-scalar-fallback", "actor-scalar-fallback");
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: state.accountId,
        actorId: state.actorId,
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      randomUUID(),
      0,
      "I listen for movement."
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("narration contract repair failed"));
    expect(result.narration.text).toBe("The hall is dark.\nSomething moves.");
    expect(result.narration.proposedFacts).toEqual([]);
    expect(result.narration.suggestedActions).toEqual([]);
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
          choices: [{ message: { role: "assistant", content: JSON.stringify({
            text: "Narin seals the bargain and orders the caravan east.",
            proposedFacts: [],
            suggestedActions: [],
          }) } }],
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

  it("does not stage a rejected world_context effect before a corrected patch", async () => {
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
                id: "tool-rejected-world-context",
                type: "function",
                function: {
                  name: "world_context",
                  arguments: JSON.stringify({
                    title: "The Bellkeeper's Wharf",
                    description: "Rain rattles the shutters while the bellkeeper studies a soaked ledger.",
                    features: ["soaked ledger"],
                    exits: [],
                    npcs: { upsert: [{ id: "bellkeeper", name: "The Bellkeeper", relationshipScore: 0 }] },
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
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "tool-corrected-world-context",
                type: "function",
                function: {
                  name: "world_context",
                  arguments: JSON.stringify({
                    title: "The Bellkeeper's Wharf",
                    description: "Rain rattles the shutters while the bellkeeper studies a soaked ledger.",
                    features: ["soaked ledger"],
                    exits: [],
                    npcs: { upsert: [{ id: "bellkeeper", name: "The Bellkeeper" }] },
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
          choices: [{ message: { role: "assistant", content: JSON.stringify({
            text: "The bellkeeper taps the ledger and points toward the storm-dark channel.",
            proposedFacts: [],
            suggestedActions: [],
          }) } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-corrected-world", "actor-corrected-world");
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: "account-corrected-world",
        actorId: "actor-corrected-world",
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: "account-corrected-world",
      campaignId: state.id,
      actorId: "actor-corrected-world",
      capabilities: ["player", "dm"],
    };
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(
      context,
      state,
      randomUUID(),
      0,
      "I ask the bellkeeper why the ledger is soaked."
    );

    const correctionRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(correctionRequest.messages.at(-1)).toMatchObject({
      role: "tool",
      content: expect.stringContaining('"code":"field_not_authorable"'),
    });
    expect(result.accepted).toBe(true);
    expect(result.state.version).toBe(1);
    expect(result.state.worldContext?.npcs).toEqual([expect.objectContaining({
      id: "bellkeeper",
      name: "The Bellkeeper",
      relationshipScore: 0,
    })]);
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["world_context"]);
    expect(result.event?.effects?.[0]?.command).toMatchObject({
      kind: "world_context",
      npcs: { upsert: [{ id: "bellkeeper", name: "The Bellkeeper" }] },
    });
    expect(result.event?.stateChanges.map((change) => change.path)).toEqual([
      "/worldContext/id",
      "/worldContext/title",
      "/worldContext/description",
      "/worldContext/features",
      "/worldContext/exits",
      "/worldContext/npcs/bellkeeper",
    ]);
    store.close();
  });

  it("keeps player experience mutations out of the DM tool catalog and rejects a model attempt", async () => {
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
                id: "tool-profile-update",
                type: "function",
                function: {
                  name: "experience_profile_update",
                  arguments: JSON.stringify({
                    profile: {
                      pillarWeights: { combat: 10, exploration: 40, social: 30, mystery: 20 },
                      difficulty: "gentle",
                      narrationStyle: "immersive",
                      verbosity: "standard",
                      guidance: "guided",
                      rulesTransparency: "explicit",
                      excludedThemes: ["private boundary"],
                      fadeToBlackThemes: [],
                    },
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
          choices: [{
            message: {
              role: "assistant",
              content: JSON.stringify({ text: "I keep the focus on a safer path.", proposedFacts: [], suggestedActions: [] }),
            },
          }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const store = createStore();
    const state = createInitialCampaign("account-profile-dm", "actor-profile-dm");
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: "account-profile-dm",
        actorId: "actor-profile-dm",
        capabilities: ["player", "dm"],
      },
      state
    );
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: "account-profile-dm",
      campaignId: state.id,
      actorId: "actor-profile-dm",
      capabilities: ["player", "dm"],
    };
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      randomUUID(),
      0,
      "I choose a safer path."
    );

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const names = request.tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(names).not.toContain("experience_profile_update");
    expect(names).not.toContain("experience_feedback_add");
    expect(names).not.toContain("experience_boundary");
    expect(request.messages[0]?.content).toContain("minimum projection");
    expect(result.state.experienceProfile.revision).toBe(0);
    expect(result.narration.text).toContain("safer path");
    store.close();
  });
});
