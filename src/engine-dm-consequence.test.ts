import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { createInitialCampaign, projectResolutionForActor, resolveEngineCommand } from "./engine-domain.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { LanternEngineStore } from "./engine-store.js";
import {
  prepareSiltedBellWorld,
  siltedBellSituationDefinition,
  situationFixtureId,
} from "./situation-test-fixtures.js";
import { openAiSdkFetch as sdkFetch } from "./test-openai-stream.js";
import { ruinedGatehouseWorldContextCommand } from "./world-object-fixture.js";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number, _max: number) => min));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

const options = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.example/v1",
  model: "deepseek/deepseek-v4-flash",
  reasoningEffort: "medium",
  maxTokens: 2_500,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table Engine",
};

function createStore(): LanternEngineStore {
  const directory = mkdtempSync(join(tmpdir(), "lantern-dm-consequence-"));
  return new LanternEngineStore(join(directory, "engine.db"));
}

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function toolResponse(id: string, name: string, args: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          }],
        },
      }],
    }),
  };
}

function multiToolResponse(calls: Array<{ id: string; name: string; args: Record<string, unknown> }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        },
      }],
    }),
  };
}

function narrationResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({ text, proposedFacts: [], suggestedActions: [] }),
        },
      }],
    }),
  };
}

function siltedBellState(wisdom: number): LanternCampaignState {
  const state = prepareSiltedBellWorld(createInitialCampaign("silted-account", "silted-actor"));
  state.character.created = true;
  state.character.name = "Wharf Investigator";
  state.character.abilities.wis = wisdom;
  state.character.skills.perception = { ability: "wis", proficient: true, expertise: true, bonus: 0 };
  state.phase = "sandbox";
  const created = resolveEngineCommand(
    state,
    context(state),
    randomUUID(),
    { kind: "situation_create", definition: siltedBellSituationDefinition() },
    "situation_create",
  );
  if (!created.accepted) throw new Error(`${created.code}: ${created.message}`);
  return created.state;
}

function lockedGatehouseState(): LanternCampaignState {
  const state = createInitialCampaign("gatehouse-account", "gatehouse-actor");
  state.character.created = true;
  state.character.name = "Gatebreaker";
  state.character.abilities.str = 20;
  state.character.skills.athletics = { ability: "str", proficient: true, expertise: false, bonus: 0 };
  state.phase = "sandbox";
  const created = resolveEngineCommand(
    state,
    context(state),
    randomUUID(),
    ruinedGatehouseWorldContextCommand(),
    "world_context",
  );
  if (!created.accepted) throw new Error(created.code + ": " + created.message);
  return created.state;
}

function sceneMove(outcome: "success" | "failure") {
  return {
    title: outcome === "success" ? "The wharf reacts" : "Mara hears the scrape",
    description: outcome === "success"
      ? "Your close inspection makes Mara step nearer and point to the tide marks you were already studying."
      : "Your boot scrapes the wet grate; Mara snaps her lantern toward you and demands to know whether you will stop or explain yourself.",
    effectType: "fictional",
    sceneMove: {
      category: "reaction",
      sourceEffectIndex: 0,
      outcome,
      nextDecision: outcome === "success"
        ? "Decide whether to compare the marks with Mara or follow the draft."
        : "Choose whether to answer Mara, back away, or keep searching under her scrutiny.",
    },
  } as const;
}

beforeEach(() => {
  deterministicRandomInt.mockReset();
  deterministicRandomInt.mockImplementation((min: number, _max: number) => min);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DM consequence binding", () => {
  it("accepts a target-bound object transition as the check consequence without an extra scene move", async () => {
    deterministicRandomInt.mockImplementation((_min: number, max: number) => max - 1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse("force-door", "challenge_attempt", {
        challengeId: "barred-door-v1",
        targetId: "gatehouse-door",
        goal: "Force the locked gatehouse door open",
        approach: "Drive a shoulder into the swollen boards",
      }))
      .mockResolvedValueOnce(narrationResponse("The gatehouse door gives way under the committed result."))
      .mockRejectedValueOnce(new Error("public narrator unavailable"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = lockedGatehouseState();
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(
      requestContext,
      state,
      randomUUID(),
      state.version,
      "I shoulder the Wooden gatehouse door and force it open.",
    );

    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["challenge_attempt"]);
    expect(result.event?.effects?.[0]).toMatchObject({
      command: { kind: "challenge_attempt", targetId: "gatehouse-door" },
      data: {
        success: true,
        objectTransition: { objectId: "gatehouse-door", beforeState: "locked", afterState: "open" },
      },
    });
    expect(result.state.worldContext?.objects.find((object) => object.id === "gatehouse-door")?.state).toBe("open");
    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toContain("Wooden gatehouse door is now open.");
    expect(result.narration.text).not.toMatch(/DM must establish|pending-dm-consequence|sourceEffectIndex/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    store.close();
  });

  it("commits an authorized Silted Bell clue before narrating the concrete successful discovery", async () => {
    deterministicRandomInt.mockImplementation((_min: number, max: number) => max - 1);
    const clueId = situationFixtureId("silted-bell-wharf", "clue", "draft");
    const truthId = situationFixtureId("silted-bell-wharf", "truth", "stair-source");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse("load-exploration", "capability_load", { familyId: "exploration" }))
      .mockResolvedValueOnce(toolResponse("study-draft", "situation_clue_attempt", {
        clueId,
        approach: "Study the water and old marks around the sealed stair.",
      }))
      .mockResolvedValueOnce(narrationResponse("The draft gives the investigation a concrete direction."))
      .mockResolvedValueOnce(narrationResponse("A faint inward draft pulses through the lower portcullis seam in time with the falling tide."));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = siltedBellState(20);
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const clientCommandId = randomUUID();
    const playerText = "I study the water and old marks around the sealed stair.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(requestContext, state, clientCommandId, state.version, playerText);

    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["situation_clue_attempt"]);
    expect(result.event?.effects?.[0]).toMatchObject({ data: { success: true, clueId } });
    expect(result.state.actorKnowledge.some((record) => record.actorId === state.actorId && record.factId === truthId)).toBe(true);
    expect(result.session.situation?.clues.find((clue) => clue.id === clueId)?.finding).toContain("inward draft");
    expect(result.narration.text).toContain("inward draft");
    expect(result.narration.text).not.toMatch(/outcome now stands|DM must establish|engine must/i);
    const narratorRequest = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(JSON.stringify(narratorRequest)).toContain("A faint inward draft pulses");
    expect(JSON.stringify(narratorRequest)).not.toContain("Mara heard the bell answer");
    expect(result.state.version).toBe(state.version + 1);

    const replay = await dm.resolveTurn(requestContext, state, clientCommandId, state.version, playerText);
    expect(replay).toMatchObject({ replayed: true, state: { version: state.version + 1 } });
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    store.close();
  });

  it("repairs a failed Silted Bell check with one bound caused consequence and leaks no hidden clue", async () => {
    const clueId = situationFixtureId("silted-bell-wharf", "clue", "draft");
    const truthId = situationFixtureId("silted-bell-wharf", "truth", "stair-source");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse("load-exploration", "capability_load", { familyId: "exploration" }))
      .mockResolvedValueOnce(toolResponse("miss-draft", "situation_clue_attempt", {
        clueId,
        approach: "Study the water and old marks around the sealed stair.",
      }))
      .mockResolvedValueOnce(narrationResponse("The search ends without a concrete consequence."))
      .mockResolvedValueOnce(toolResponse("bind-reaction", "improvise", sceneMove("failure")))
      .mockResolvedValueOnce(narrationResponse("Mara turns sharply at the scrape and demands an answer."))
      .mockRejectedValueOnce(new Error("public narrator unavailable"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = siltedBellState(8);
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const clientCommandId = randomUUID();
    const playerText = "I study the water and old marks around the sealed stair.";
    const dm = new LanternDungeonMaster(store, options);
    const result = await dm.resolveTurn(requestContext, state, clientCommandId, state.version, playerText);

    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["situation_clue_attempt", "improvise"]);
    expect(result.event?.effects?.[0]).toMatchObject({ data: { success: false, clueId } });
    expect(result.event?.effects?.[1]?.command).toMatchObject({
      kind: "improvise",
      sceneMove: { sourceEffectIndex: 0, outcome: "failure", category: "reaction" },
    });
    expect(result.state.actorKnowledge.some((record) => record.actorId === state.actorId && record.factId === truthId)).toBe(false);
    expect(result.state.improvEffects.at(-1)).not.toHaveProperty("sceneMove");
    expect(result.session.improvEffects.at(-1)).not.toHaveProperty("sceneMove");
    expect(result.session.situation?.lastComplication).toContain("Mara snaps her lantern");
    expect(result.session.situation?.lastComplication).not.toBe("pending-dm-consequence");
    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toContain("Mara snaps her lantern");
    expect(result.narration.text).toContain("Choose whether to answer Mara");
    expect(result.narration.text).not.toMatch(/outcome now stands|DM must establish|pending-dm-consequence/i);
    const publicSurface = JSON.stringify({ narration: result.narration, session: result.session });
    expect(publicSurface).not.toContain("submerged conduit");
    expect(publicSurface).not.toContain("A faint inward draft pulses");
    expect(JSON.stringify(projectResolutionForActor(result, state.actorId))).not.toContain("sourceEffectIndex");
    const repairRequest = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(repairRequest.messages.at(-1)?.content).toContain("OutcomeEnvelope");
    expect(repairRequest.messages.at(-1)?.content).toContain('"sourceEffectIndex":0');
    expect(repairRequest.messages.at(-1)?.content).toContain('"outcome":"failure"');
    expect(result.state.version).toBe(state.version + 1);

    const replay = await dm.resolveTurn(requestContext, state, clientCommandId, state.version, playerText);
    expect(replay.replayed).toBe(true);
    expect(replay.narration.text).toBe(result.narration.text);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    store.close();
  });

  it("rejects a same-round guessed scene move, then accepts the corrected next-round binding", async () => {
    const firstRound = multiToolResponse([
      { id: "check-now", name: "roll_check", args: { ability: "wis", goal: "Read the room.", passive: true } },
      { id: "guess-now", name: "improvise", args: sceneMove("failure") },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(firstRound)
      .mockResolvedValueOnce(toolResponse("bind-next", "improvise", sceneMove("failure")))
      .mockResolvedValueOnce(narrationResponse("The room reacts after the failed read."))
      .mockResolvedValueOnce(narrationResponse("The scrape turns every eye toward you, forcing a choice."));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("order-account", "order-actor");
    state.character.created = true;
    state.character.abilities.wis = 8;
    state.phase = "sandbox";
    state.worldContext = {
      id: "order-room", title: "Order Room", description: "A quiet room watches you.",
      features: ["watchful room"], exits: [], npcs: [], merchants: [], objects: [],
    };
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      requestContext,
      state,
      randomUUID(),
      state.version,
      "I read the room.",
    );

    const correctionRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(correctionRequest)).toContain("scene_move_wrong_order");
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check", "improvise"]);
    expect(result.state.improvEffects).toHaveLength(1);
    expect(result.narration.text).toContain("forcing a choice");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    store.close();
  });

  it("rejects a scene move whose claimed outcome contradicts the exact prior roll", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse("check-fails", "roll_check", { ability: "wis", goal: "Read the room.", passive: true }))
      .mockResolvedValueOnce(toolResponse("wrong-outcome", "improvise", sceneMove("success")))
      .mockResolvedValueOnce(toolResponse("right-outcome", "improvise", sceneMove("failure")))
      .mockResolvedValueOnce(narrationResponse("The failed read draws unwanted attention."))
      .mockResolvedValueOnce(narrationResponse("Your scrutiny draws unwanted attention and forces a new choice."));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("outcome-account", "outcome-actor");
    state.character.created = true;
    state.character.abilities.wis = 8;
    state.phase = "sandbox";
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      requestContext,
      state,
      randomUUID(),
      state.version,
      "I read the room.",
    );

    const correctionRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(JSON.stringify(correctionRequest)).toContain("scene_move_outcome_mismatch");
    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["roll_check", "improvise"]);
    expect(result.event?.effects?.[1]?.command).toMatchObject({ kind: "improvise", sceneMove: { outcome: "failure" } });
    expect(result.state.improvEffects).toHaveLength(1);
    store.close();
  });

  it("discards the dependent suffix when an earlier check remains orphaned", async () => {
    const secondCheckMove = sceneMove("failure");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(multiToolResponse([
        { id: "first-check", name: "roll_check", args: { ability: "wis", goal: "Notice the watcher.", passive: true } },
        { id: "second-check", name: "roll_check", args: { ability: "wis", goal: "Read the watcher's intent.", passive: true } },
      ]))
      .mockResolvedValueOnce(toolResponse("bind-second", "improvise", {
        ...secondCheckMove,
        sceneMove: { ...secondCheckMove.sceneMove, sourceEffectIndex: 1 },
      }))
      .mockResolvedValueOnce(narrationResponse("The second read draws a sharp reaction, but the first check has no consequence."))
      .mockRejectedValueOnce(new Error("consequence repair unavailable"))
      .mockRejectedValueOnce(new Error("public narrator unavailable"));
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = createInitialCampaign("suffix-account", "suffix-actor");
    state.character.created = true;
    state.character.abilities.wis = 8;
    state.phase = "sandbox";
    state.worldContext = {
      id: "suffix-room",
      title: "The Watch Room",
      description: "A silent watcher studies the doorway.",
      features: ["silent watcher"],
      exits: [],
      npcs: [],
      merchants: [],
      objects: [],
    };
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      requestContext,
      state,
      randomUUID(),
      state.version,
      "I study the watcher carefully.",
    );

    expect(result.tool).toBe("declare");
    expect(result.event?.effects).toBeUndefined();
    expect(result.state.lastRoll).toBeNull();
    expect(result.state.adjudicationHistory).toEqual([]);
    expect(result.state.failurePressures).toEqual([]);
    expect(result.state.improvEffects).toEqual([]);
    expect(result.session.log.some((message) => message.kind === "roll")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    store.close();
  });

  it("lets Mara answer an ordinary direct question in character without a social roll", async () => {
    const clueId = situationFixtureId("silted-bell-wharf", "clue", "mara");
    const truthId = situationFixtureId("silted-bell-wharf", "truth", "mara-witness");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(toolResponse("load-exploration", "capability_load", { familyId: "exploration" }))
      .mockResolvedValueOnce(toolResponse("ask-mara", "situation_clue_attempt", {
        clueId,
        approach: "Ask Mara when and where she heard the bell.",
        sourceActorId: "mara-wharfkeeper",
      }))
      .mockResolvedValueOnce(narrationResponse("Mara answers the questions directly."))
      .mockResolvedValueOnce(narrationResponse("Mara watches the river. The landing remains quiet."))
      .mockImplementationOnce(async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const narratorContext = JSON.parse(request.messages[1]!.content) as {
          scene: { committedEventIds: string[] };
        };
        const eventId = narratorContext.scene.committedEventIds[0]!;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: "assistant",
                content: JSON.stringify({
                  beats: [
                    {
                      kind: "dialogue",
                      text: "Mara folds her arms. 'The bell rings at the last low tide.'",
                      entityRefs: ["mara-wharfkeeper"],
                      publicFactRefs: [],
                      committedEventRefs: [eventId],
                      interruptible: true,
                    },
                    {
                      kind: "dialogue",
                      text: "'I heard the bell below the stair,' she says.",
                      entityRefs: ["mara-wharfkeeper"],
                      publicFactRefs: [],
                      committedEventRefs: [],
                      interruptible: true,
                    },
                    {
                      kind: "dialogue",
                      text: "'The stair is barred because the water rises without warning.'",
                      entityRefs: ["mara-wharfkeeper"],
                      publicFactRefs: [],
                      committedEventRefs: [],
                      interruptible: true,
                    },
                  ],
                  suggestedActions: [],
                }),
              },
            }],
          }),
        };
      });
    vi.stubGlobal("fetch", sdkFetch(fetchMock));

    const store = createStore();
    const state = siltedBellState(12);
    const requestContext = context(state);
    store.createCampaign(requestContext, state);
    const result = await new LanternDungeonMaster(store, options).resolveTurn(
      requestContext,
      state,
      randomUUID(),
      state.version,
      "I ask Mara when the bell rings, where she heard it, and why the stair is barred.",
    );

    expect(result.event?.effects?.map((effect) => effect.tool)).toEqual(["situation_clue_attempt"]);
    expect(result.event?.rolls).toEqual([]);
    expect(result.session.log.some((message) => message.kind === "roll")).toBe(false);
    expect(result.state.actorKnowledge.some((record) => record.actorId === state.actorId && record.factId === truthId)).toBe(true);
    expect(result.narration.text).toContain("heard the bell below the stair");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const narratorRepairRequest = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body));
    expect(narratorRepairRequest.messages.at(-1)?.content).toContain("intent-1 (question)");
    expect(narratorRepairRequest.messages.at(-1)?.content).toContain("intent-3 (question)");
    store.close();
  });

  it("refuses a no-roll NPC answer when that actor does not know the linked truth", () => {
    const state = siltedBellState(12);
    const before = structuredClone(state);
    const result = resolveEngineCommand(state, context(state), randomUUID(), {
      kind: "situation_clue_attempt",
      clueId: situationFixtureId("silted-bell-wharf", "clue", "draft"),
      approach: "Ask Mara to explain the draft.",
      sourceActorId: "mara-wharfkeeper",
    }, "situation_clue_attempt");
    expect(result).toMatchObject({ accepted: false, code: "clue_source_actor_uninformed", event: null });
    expect(result.state).toEqual(before);
  });

  it("rejects mechanical effects disguised as a post-check fictional scene move", () => {
    const state = createInitialCampaign("mechanical-account", "mechanical-actor");
    state.character.created = true;
    const command: EngineCommand = {
      kind: "improvise",
      title: "Hidden damage",
      description: "The failed read somehow causes damage.",
      effectType: "damage",
      amount: 1,
      sceneMove: {
        category: "cost",
        sourceEffectIndex: 0,
        outcome: "failure",
        nextDecision: "Choose what to do next.",
      },
    };
    const result = resolveEngineCommand(state, context(state), randomUUID(), command, "improvise");
    expect(result).toMatchObject({ accepted: false, code: "scene_move_must_be_fictional", event: null });
    expect(result.state).toEqual(state);

    const unbound = resolveEngineCommand(state, context(state), randomUUID(), {
      ...command,
      effectType: "fictional",
      amount: undefined,
    }, "improvise");
    expect(unbound).toMatchObject({ accepted: false, code: "scene_move_binding_required", event: null });
    expect(unbound.state).toEqual(state);
  });
});
