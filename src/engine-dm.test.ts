import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { buildDmContext, LanternDungeonMaster } from "./engine-dm.js";
import { EngineCommandInProgressError, LanternEngineStore } from "./engine-store.js";
import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RequestContext } from "./engine-contracts.js";
import type { ModelUsageTelemetry } from "./usage-ledger.js";
import { openAiSdkFetch as sdkFetch } from "./test-openai-stream.js";
import { engineCoreToolDefinitions } from "./engine-capabilities.js";
import { prepareWatchtowerWorld, situationFixtureId, watchtowerSituationDefinition } from "./situation-test-fixtures.js";

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

  it("reserves a player turn before asynchronous model work can be observed", async () => {
    let releaseFirstCompletion!: () => void;
    const firstCompletion = new Promise<void>((resolve) => { releaseFirstCompletion = resolve; });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstCompletion;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                  id: "tool-observe",
                  type: "function",
                  function: { name: "observe", arguments: "{}" },
                }],
              },
            }],
          }),
        };
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: JSON.stringify({ text: "The table holds its breath.", proposedFacts: [], suggestedActions: [] }),
            },
          }],
        }),
      });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-reservation", "actor-reservation");
    store.createCampaign({
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const clientCommandId = randomUUID();
    const playerText = "I wait for the table to reveal its next sign.";
    const dm = new LanternDungeonMaster(store, options);
    const firstRequest = dm.resolveTurn(context, state, clientCommandId, state.version, playerText);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(store.getStoredCommand(state.accountId, clientCommandId)).toMatchObject({ status: "processing" });
    await expect(dm.resolveTurn(context, state, clientCommandId, state.version, playerText))
      .rejects.toThrow(EngineCommandInProgressError);

    releaseFirstCompletion();
    const result = await firstRequest;
    expect(result.replayed).toBe(false);
    expect(store.getStoredCommand(state.accountId, clientCommandId)).toMatchObject({ status: "resolved" });
    store.close();
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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    const purposes: string[] = [];
    const dm = new LanternDungeonMaster(store, {
      ...options,
      onCompletionTelemetry: (event) => purposes.push(event.purpose ?? "missing"),
    });
    const result = await dm.resolveTurn(
      context,
      state,
      randomUUID(),
      0,
      "I study the current moment for a useful detail."
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstRequest.tools).toHaveLength(engineCoreToolDefinitions().length);
    const worldContextTool = (firstRequest.tools as Array<{ function: { name: string; parameters: Record<string, unknown> } }>)
      .find((candidate) => candidate.function.name === "world_context");
    const contentCompileTool = (firstRequest.tools as Array<{ function: { name: string; parameters: Record<string, unknown> } }>)
      .find((candidate) => candidate.function.name === "content_compile");
    expect(worldContextTool?.function.parameters).not.toHaveProperty("properties.objects");
    expect(contentCompileTool?.function.parameters).toHaveProperty("properties.materialization");
    expect(JSON.stringify(worldContextTool?.function.parameters)).not.toContain('"ownerRef"');
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
    expect(purposes).toEqual(expect.arrayContaining(["player_turn", "narration"]));
    const systemPrompt = firstRequest.messages[0]?.content;
    expect(systemPrompt).toContain("creative director");
    expect(systemPrompt).toContain("combat_start");
    expect(systemPrompt).toContain("creature content keys");
    expect(systemPrompt).toContain("never supplies fixed demo loot");
    expect(systemPrompt).toContain("procedural_notice");
    expect(systemPrompt).toContain("challenge_attempt");
    expect(systemPrompt).toContain("commits the complete plan atomically");
    expect(systemPrompt).toContain("seize-held-object-v1");
    expect(systemPrompt).toContain("content_compile materialization");
    expect(systemPrompt).not.toContain("world_context.objects.upsert");
    expect(systemPrompt).toContain("Never expose missing engine state");
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

  it.each([
    { label: "successful", wisdom: 20, outcome: "The attempt succeeds" },
    { label: "failed", wisdom: 8, outcome: "The attempt falls short" },
  ])("persists a contextual rules fallback for a $label check", async ({ wisdom, outcome }) => {
    const goal = "retrieve the fallen key without alerting Titus";
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
                id: "tool-fallback-check",
                type: "function",
                function: {
                  name: "roll_check",
                  arguments: JSON.stringify({ ability: "wis", goal, passive: true }),
                },
              }],
            },
          }],
        }),
      })
      .mockRejectedValueOnce(new Error("provider timeout after commit"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign(`account-${wisdom}`, `actor-${wisdom}`);
    state.character.abilities.wis = wisdom;
    state.worldContext = {
      id: "ludus-vault",
      title: "The Ludus Holding Vault",
      description: "Titus guards a fallen key beyond the bars.",
      features: ["fallen key", "barred opening"],
      exits: [],
      npcs: [],
      merchants: [],
      objects: [],
    };
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
    const clientCommandId = randomUUID();
    const playerText = "I quietly retrieve the fallen key without alerting Titus.";
    const dm = new LanternDungeonMaster(store, {
      ...options,
      onCompletionTelemetry: (event) => {
        store.recordModelUsage({
          ...event,
          requestedModel: event.model,
          latencyMs: event.durationMs,
        } as ModelUsageTelemetry);
      },
    });
    const result = await dm.resolveTurn(context, state, clientCommandId, 0, playerText);

    const rollText = result.session.log.filter((message) => message.kind === "roll").at(-1)?.text;
    const narrationText = result.session.log.at(-1)?.text;
    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toBe(narrationText);
    expect(result.narration.text).toContain(outcome);
    expect(result.narration.text).toContain("The Ludus Holding Vault");
    expect(result.narration.text).toContain(goal);
    expect(result.narration.text).not.toBe(rollText);
    expect(result.narration.text).not.toContain("against DC");

    const replay = await dm.resolveTurn(context, state, clientCommandId, 0, playerText);
    expect(replay).toMatchObject({ replayed: true, narrationSource: "rules" });
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.getModelUsageSummary({ clientCommandId }).requestCount).toBe(2);
    store.close();
  });

  it("persists immersive context fallback narration without orchestration text", async () => {
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
                id: "tool-service-arch-move",
                type: "function",
                function: { name: "move", arguments: JSON.stringify({ destinationId: "service-arch" }) },
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
                id: "tool-service-passage-context",
                type: "function",
                function: {
                  name: "world_context",
                  arguments: JSON.stringify({
                    title: "The Ludus Service Passage",
                    description: "Cold lamplight catches on damp stone while Titus listens for Ledrus behind you.",
                    features: ["damp stone", "cold lamplight"],
                    exits: [
                      { id: situationFixtureId("watchtower-relic", "node", "yard"), label: "Cross into the watchtower yard" },
                      { id: "storage-niche", label: "Search the storage niche" },
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
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "tool-watchtower-yard-move",
                type: "function",
                function: { name: "move", arguments: JSON.stringify({ destinationId: situationFixtureId("watchtower-relic", "node", "yard") }) },
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
                id: "tool-service-passage-check",
                type: "function",
                function: {
                  name: "roll_check",
                  arguments: JSON.stringify({
                    ability: "wis",
                    skill: "perception",
                    goal: "keep Titus hidden from Ledrus",
                    passive: true,
                  }),
                },
              }],
            },
          }],
        }),
      })
      .mockRejectedValueOnce(new Error("provider timeout after context commit"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = prepareWatchtowerWorld(createInitialCampaign("account-context-fallback", "actor-context-fallback"));
    state.character.created = true;
    state.character.abilities.wis = 20;
    state.phase = "sandbox";
    const situation = resolveEngineCommand(state, {
      requestId: randomUUID(), accountId: state.accountId, campaignId: state.id,
      actorId: state.actorId, capabilities: ["player", "dm"],
    }, randomUUID(), { kind: "situation_create", definition: watchtowerSituationDefinition() }, "situation_create");
    expect(situation.accepted).toBe(true);
    state.situation = situation.state.situation;
    state.worldContext = {
      id: "ludus-vault",
      title: "The Ludus Holding Vault",
      description: "Iron bars divide the vault from the arena corridor.",
      features: ["iron bars"],
      exits: [{ id: "service-arch", label: "Slip through a side arch toward the ludus service passages" }],
      npcs: [], merchants: [], objects: [],
    };
    store.createCampaign({
      requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
    const context: RequestContext = {
      requestId: randomUUID(), accountId: state.accountId, campaignId: state.id,
      actorId: state.actorId, capabilities: ["player", "dm"],
    };
    const clientCommandId = randomUUID();
    const playerText = "I guide Titus into the narrow service arch and move quietly through it.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(context, state, clientCommandId, 0, playerText);
    const replay = await dm.resolveTurn(context, state, clientCommandId, 0, playerText);

    expect(result).toMatchObject({ narrationSource: "rules", state: { version: 1 } });
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["move", "world_context", "move", "roll_check"]);
    expect(result.narration.text).toContain("You reach The Ludus Service Passage.");
    expect(result.narration.text).toContain("Cold lamplight catches on damp stone");
    expect(result.narration.text).toContain("You continue along the chosen path: Cross into the watchtower yard.");
    expect(result.narration.text).toContain("The attempt succeeds");
    expect(result.narration.text).not.toContain("against DC");
    expect(result.narration.text).not.toContain("Paths onward:");
    expect(result.state.situation?.currentLocationId).toBe(situationFixtureId("watchtower-relic", "node", "yard"));
    expect(result.event?.effects?.[2]?.stateChanges.some((change) => change.path === "/situation")).toBe(true);
    const playerFacing = JSON.stringify({
      narration: result.narration,
      log: result.session.log,
      replayNarration: replay.narration,
      replayLog: replay.session.log,
    });
    expect(playerFacing).not.toMatch(/The DM must establish|The DM establishes|toward Slip|Slip through a side arch/i);
    expect(store.getCampaign(context).log.at(-1)?.text).toBe(result.narration.text);
    expect(replay).toMatchObject({ replayed: true, narrationSource: "rules", state: { version: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    store.close();
  });

  it("retries a movement-only model plan when it drops a distraction intent and replays the corrected turn", async () => {
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
                id: "tool-wrong-move",
                type: "function",
                function: { name: "move", arguments: JSON.stringify({ destinationId: "service-arch" }) },
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
                id: "tool-correct-distraction",
                type: "function",
                function: {
                  name: "improvise",
                  arguments: JSON.stringify({
                    title: "A sharp kitchen distraction",
                    description: "The cauldrons crash together and draw the workers' attention away from Titus.",
                    effectType: "fictional",
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
              content: JSON.stringify({
                text: "The cauldrons crash together, pulling every worker's attention toward the noise while Titus gets a clear opening.",
                proposedFacts: [],
                suggestedActions: [],
              }),
            },
          }],
        }),
      });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-distraction-repair", "actor-distraction-repair");
    state.character.created = true;
    state.phase = "sandbox";
    state.worldContext = {
      id: "kitchen-arch",
      title: "Kitchen Service Arch",
      description: "Workers move between steaming cauldrons and a narrow service exit.",
      features: ["cauldrons", "service exit"],
      exits: [{ id: "service-arch", label: "Slip through the service arch" }],
      npcs: [],
      merchants: [],
      objects: [],
    };
    store.createCampaign({
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const clientCommandId = randomUUID();
    const playerText = "I create a sharp distraction among the cauldrons, then signal Titus to move.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(context, state, clientCommandId, state.version, playerText);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["improvise"]);
    expect(result.event?.effects?.some((effect) => effect.tool === "move")).toBe(false);
    expect(result.narration.text).toContain("cauldrons crash together");
    expect(result.narration.text).not.toMatch(/DM must establish|The DM establishes|toward Slip/i);
    expect(result.state.worldContext?.id).toBe("kitchen-arch");

    const replay = await dm.resolveTurn(context, state, clientCommandId, state.version, playerText);
    expect(replay.replayed).toBe(true);
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    store.close();
  });

  it("repairs valid JSON narration that exposes internal orchestration text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: JSON.stringify({
                text: "The DM must establish the next context.",
                proposedFacts: [{ kind: "location", title: "internal-only" }],
                suggestedActions: [],
              }),
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
              content: JSON.stringify({
                text: "The kitchen holds its breath while Titus watches for the opening.",
                proposedFacts: [],
                suggestedActions: [],
              }),
            },
          }],
        }),
      });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-narration-repair", "actor-narration-repair");
    state.character.created = true;
    state.phase = "sandbox";
    state.worldContext = {
      id: "kitchen-arch",
      title: "Kitchen Service Arch",
      description: "Steam hangs beneath the service stairs.",
      features: ["steam"],
      exits: [],
      npcs: [],
      merchants: [],
      objects: [],
    };
    store.createCampaign({
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
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
      state.version,
      "I watch the kitchen for a safe opening.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.narration.text).toBe("The kitchen holds its breath while Titus watches for the opening.");
    expect(result.narration.text).not.toMatch(/DM must establish|engine must|system must/i);
    store.close();
  });

  it("records a declaration when a second model attempt still replaces a distraction with movement", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "tool-repeated-move",
                type: "function",
                function: { name: "move", arguments: JSON.stringify({ destinationId: "service-arch" }) },
              }],
            },
          }],
        }),
      });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-distraction-declaration", "actor-distraction-declaration");
    state.character.created = true;
    state.phase = "sandbox";
    state.worldContext = {
      id: "kitchen-arch",
      title: "Kitchen Service Arch",
      description: "Workers move between steaming cauldrons and a narrow service exit.",
      features: ["cauldrons", "service exit"],
      exits: [{ id: "service-arch", label: "Slip through the service arch" }],
      npcs: [],
      merchants: [],
      objects: [],
    };
    store.createCampaign({
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const playerText = "I create a sharp distraction among the cauldrons, then signal Titus to move.";
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      context,
      state,
      randomUUID(),
      state.version,
      playerText,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.tool).toBe("declare");
    expect(result.event?.effects).toBeUndefined();
    expect(result.state.worldContext?.id).toBe("kitchen-arch");
    expect(result.narration.text).not.toMatch(/toward Slip|DM must establish|The DM establishes/i);
    store.close();
  });

  it("preserves the authoritative non-check outcome when its data also has success", async () => {
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
                id: "tool-death-save",
                type: "function",
                function: { name: "death_save", arguments: "{}" },
              }],
            },
          }],
        }),
      })
      .mockRejectedValueOnce(new Error("provider timeout after death save"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const initial = createInitialCampaign("account-death-fallback", "actor-death-fallback");
    initial.character.hp = 0;
    initial.character.lifecycleState = "dying";
    initial.character.conditions = ["unconscious"];
    initial.character.deathRecord = {
      source: "damage",
      sourceCommandId: randomUUID(),
      sourceVersion: initial.version,
      occurredAt: new Date(0).toISOString(),
    };
    const state = normalizeCampaignState(initial);
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
      state.version,
      "I make my death save."
    );

    expect(result.event?.effects?.[0]).toMatchObject({ tool: "death_save" });
    expect(result.event?.effects?.[0]?.data).toHaveProperty("success");
    expect(result.narration.text).toContain("Death save: d20");
    expect(result.narration.text).not.toContain("The attempt succeeds");
    expect(result.narration.text).not.toContain("The attempt falls short");
    expect(result.session.log.at(-1)?.text).toBe(result.narration.text);
    store.close();
  });

  it("persists player-facing no-check fallback narration without internal declare text", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("provider unavailable"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-declare-fallback", "actor-declare-fallback");
    state.character.created = true;
    state.phase = "sandbox";
    state.worldContext = {
      id: "ludus-service-passage",
      title: "The Ludus Service Passage",
      description: "Cold lamplight skims the cramped drain passage below the rear stairs.",
      features: ["rear stairs", "cramped drain passage", "deep shadow"],
      exits: [
        { id: "drain-passage", label: "Descend into the drain passage" },
        { id: "service-arch", label: "Return to the service arch" },
      ],
      npcs: [], merchants: [], objects: [],
    };
    store.createCampaign({
      requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
    const context: RequestContext = {
      requestId: randomUUID(), accountId: state.accountId, campaignId: state.id,
      actorId: state.actorId, capabilities: ["player", "dm"],
    };
    const clientCommandId = randomUUID();
    const playerText = "I pull Titus down into the cramped drain passage and motion for him to stay low while we use the darkness to slip past Ledrus.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(context, state, clientCommandId, state.version, playerText);
    const replay = await dm.resolveTurn(context, state, clientCommandId, state.version, playerText);

    expect(result).toMatchObject({
      tool: "declare",
      narrationSource: "rules",
      message: "You put your plan into motion.",
      state: { version: 1 },
      event: { command: { kind: "declare" }, rolls: [], stateChanges: [] },
    });
    expect(result.event?.check).toBeUndefined();
    expect(result.narration.text).toBe(
      "You put your plan into motion in The Ludus Service Passage. "
      + "Cold lamplight skims the cramped drain passage below the rear stairs. "
      + "Paths onward: Descend into the drain passage; Return to the service arch."
    );
    expect(JSON.stringify({ result, storedLog: store.getCampaign(context).log })).not.toMatch(
      /You declare|No mechanical check was required|DM must answer|\.\./i
    );
    expect(store.getCampaign(context).log.at(-1)?.text).toBe(result.narration.text);
    expect(replay).toMatchObject({ replayed: true, narrationSource: "rules", state: { version: 1 } });
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    store.close();
  });

  it("keeps the exact rest result when the provider is unavailable before the tool loop", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("provider unavailable"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-rest-fallback", "actor-rest-fallback");
    state.worldContext = {
      id: "roadside-camp",
      title: "The Roadside Camp",
      description: "A quiet camp beside the road.",
      features: ["banked fire"],
      exits: [],
      npcs: [],
      merchants: [],
      objects: [],
    };
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
      state.version,
      "I rest at the camp."
    );

    expect(result.tool).toBe("rest");
    expect(result.narration.text).toContain("You complete a long rest. Your wounds close and your resources recover.");
    expect(result.narration.text).toContain("The Roadside Camp");
    expect(result.session.log.at(-1)?.text).toBe(result.narration.text);
    store.close();
  });

  it("persists a provider-outage reply for a read-only player turn", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("provider unavailable"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-observe-fallback", "actor-observe-fallback");
    state.worldContext = {
      id: "lantern-room", title: "The Lantern Room",
      description: "A quiet room lit by one lantern.", features: ["lit lantern"],
      exits: [], npcs: [], merchants: [], objects: [],
    };
    store.createCampaign({
      requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
    const context: RequestContext = {
      requestId: randomUUID(), accountId: state.accountId, campaignId: state.id,
      actorId: state.actorId, capabilities: ["player", "dm"],
    };
    const clientCommandId = randomUUID(), playerText = "I look around the room.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(context, state, clientCommandId, state.version, playerText);

    expect(result).toMatchObject({ tool: "observe", readOnly: true, narrationSource: "rules" });
    expect(result.session.log.at(-1)?.text).toBe(result.narration.text);
    expect(store.getCampaign(context).log.at(-1)?.text).toBe(result.narration.text);
    const replay = await dm.resolveTurn(context, state, clientCommandId, state.version, playerText);
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    const purposes: string[] = [];
    const dm = new LanternDungeonMaster(store, {
      ...options,
      onCompletionTelemetry: (event) => purposes.push(event.purpose ?? "missing"),
    });
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
    expect(purposes).toEqual(["opening", "narration", "narration_repair"]);
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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

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

  it("loads a reviewed capability family before sending its detailed schemas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "tool-load-combat",
              type: "function",
              function: { name: "capability_load", arguments: JSON.stringify({ familyId: "combat" }) },
            }],
          } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "tool-read-combat",
              type: "function",
              function: { name: "combat_state", arguments: "{}" },
            }],
          } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: {
            role: "assistant",
            content: JSON.stringify({ text: "The arena waits.", proposedFacts: [], suggestedActions: [] }),
          } }],
        }),
      });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-capability-load", "actor-capability-load");
    state.phase = "sandbox";
    state.character.created = true;
    store.createCampaign({
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
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
      state.version,
      "I check the current fight.",
    );

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const firstNames = firstRequest.tools.map((tool: { function: { name: string } }) => tool.function.name);
    const secondNames = secondRequest.tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(firstNames).toContain("capability_load");
    expect(firstNames).not.toContain("combat_start");
    expect(secondNames).toContain("combat_start");
    expect(secondNames).toContain("combat_state");
    expect(result.narration.text).toContain("arena waits");
    store.close();
  });

  it("does not spend gameplay-loop rounds on capability-only loads", async () => {
    const fetchMock = vi.fn();
    for (let index = 0; index < 8; index += 1) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `tool-load-${index}`,
              type: "function",
              function: { name: "capability_load", arguments: JSON.stringify({ familyId: "combat" }) },
            }],
          } }],
        }),
      });
    }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: {
          role: "assistant",
          content: JSON.stringify({ text: "The family is ready.", proposedFacts: [], suggestedActions: [] }),
        } }],
      }),
    });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("account-capability-budget", "actor-capability-budget");
    state.phase = "sandbox";
    state.character.created = true;
    store.createCampaign({
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    }, state);
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
      state.version,
      "I prepare for the current fight.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(result.narration.text).toContain("family is ready");
    store.close();
  });
});
