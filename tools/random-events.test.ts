import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, beforeEach } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, max?: number) => max === undefined ? _min : max - 1));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import type { EngineCommand, EngineWorldContext, LanternCampaignState, RequestContext } from "../src/engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "../src/engine-domain.js";
import { LanternEngineStore } from "../src/engine-store.js";
import { prepareWatchtowerWorld, watchtowerSituationDefinition } from "../src/situation-test-fixtures.js";

function contextFor(state: LanternCampaignState, capabilities: RequestContext["capabilities"] = ["player", "dm"]): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities,
  };
}

function ration(id: string, property: string, quantity = 1, ownerId = "random-events-actor") {
  return {
    id,
    quantity,
    ownerRef: { kind: "actor" as const, id: ownerId },
    authoredDefinition: { name: property, kind: "consumable" as const, weight: 1, properties: [property] },
  };
}

function seededState(campaignId = randomUUID()): LanternCampaignState {
  const state = createInitialCampaign("random-events-account", "random-events-actor", campaignId);
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Wayfinder";
  state.character.inventory = [
    ration("ration-1", "ration", 4, state.character.id),
    ration("water-1", "water", 4, state.character.id),
    ration("material-1", "project-material", 1, state.character.id),
  ];
  const worldContext: EngineWorldContext = {
    id: "roadhead",
    title: "Roadhead",
    description: "A reviewed road begins here.",
    exits: [{ id: "crossroads", label: "the crossroads" }],
    features: [],
    npcs: [],
    merchants: [],
    objects: [],
  };
  state.worldContext = worldContext;
  state.quests[0] = { ...state.quests[0]!, deadlineAtMinutes: 600 };
  state.quest = state.quests[0]!;
  state.time.worldClocks = [{ id: "frontier-watch", name: "Frontier watch", elapsedMinutes: 0, provenance: { sourceCommandId: "seed", sourceVersion: 0 } }];
  return normalizeCampaignState(state);
}

function queueRandoms(values: number[]) {
  const pending = [...values];
  deterministicRandomInt.mockImplementation((min: number, max?: number) => pending.shift() ?? (max === undefined ? min : max - 1));
}

function travel(state: LanternCampaignState, eventRoll: number, selectionRoll?: number, clientCommandId = randomUUID()) {
  queueRandoms([20, eventRoll, ...(eventRoll <= 25 ? [selectionRoll ?? 1] : [])]);
  const command: EngineCommand = { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" };
  return resolveEngineCommand(state, contextFor(state), clientCommandId, command, "travel");
}

describe("issue #22 random-event regression fixtures", () => {
  beforeEach(() => {
    deterministicRandomInt.mockReset().mockImplementation((min: number, max?: number) => max === undefined ? min : max - 1);
  });

  it("records a stable no-event result without selection or side effects", () => {
    const result = travel(seededState(), 100);
    expect(result.accepted).toBe(true);
    const event = result.state.time.randomEvents.at(-1)!;
    expect(event).toMatchObject({
      tableId: "travel-watch-v1",
      tableVersion: "1",
      occurrenceRoll: 100,
      occurrenceThreshold: 25,
      triggered: false,
      reusedEntityIds: [],
      instantiatedEntityIds: [],
      createdFactIds: [],
      createdClockIds: [],
      createdSituationIds: [],
      createdEncounterIds: [],
    });
    expect(event.selectionRoll).toBeUndefined();
    expect(event.selectedEntryId).toBeUndefined();
    expect(event.contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.state.combat.status).toBe("none");
  });

  it("records contextual selection without auto-authoring a situation, then accepts explicit authored provenance", () => {
    const result = travel(seededState(), 1, 4);
    expect(result.accepted).toBe(true);
    const event = result.state.time.randomEvents.at(-1)!;
    expect(event).toMatchObject({
      tableId: "travel-watch-v1",
      tableVersion: "1",
      occurrenceRoll: 1,
      selectionRoll: 4,
      selectedEntryId: "roadside-sign",
      createdSituationIds: [],
    });
    expect(event.createdFactIds).toHaveLength(0);
    expect(event.sourceEventId).not.toBe(event.id);
    expect(result.state.situation).toBeNull();
    expect(result.state.combat.status).toBe("none");

    const prepared = prepareWatchtowerWorld(result.state);
    const command: EngineCommand = { kind: "situation_create", definition: watchtowerSituationDefinition(), sourceRandomEventId: event.id };
    const authored = resolveEngineCommand(prepared, contextFor(prepared), "authored-event-situation", command, "situation_create");
    expect(authored.accepted).toBe(true);
    expect(authored.state.situation?.provenance.sourceRandomEvent?.id).toBe(event.id);
    expect(authored.state.time.randomEvents.find((candidate) => candidate.id === event.id)?.createdSituationIds).toEqual([authored.state.situation?.id]);
  });

  it("does not duplicate or claim existing actor and object identities", () => {
    const state = prepareWatchtowerWorld(seededState());
    const result = travel(normalizeCampaignState(state), 1, 4);
    const event = result.state.time.randomEvents.at(-1)!;
    expect(event.reusedEntityIds).toEqual([]);
    expect(event.instantiatedEntityIds).toEqual([]);
    expect(result.state.worldContext?.npcs.filter((npc) => npc.id === "watchtower-warden")).toHaveLength(1);
    expect(result.state.worldContext?.objects.filter((object) => object.id === "watchtower-relic")).toHaveLength(1);
  });

  it("never instantiates an actor or object merely because a table entry was selected", () => {
    const result = travel(seededState(), 1, 4);
    const event = result.state.time.randomEvents.at(-1)!;
    expect(event.instantiatedEntityIds).toEqual([]);
    expect(event.reusedEntityIds).toEqual([]);
    expect(result.state.worldContext?.npcs).toEqual([]);
    expect(result.state.worldContext?.objects).toEqual([]);
  });

  it("replays a retried command without rerolling or changing the committed event", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-random-retry-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    const state = seededState();
    const context = contextFor(state);
    store.createCampaign(context, state);
    const clientCommandId = "retry-random-event";
    const command: EngineCommand = { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" };
    queueRandoms([20, 1, 4]);
    const first = store.executeCommand({ context, clientCommandId, expectedCampaignVersion: 0, command, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "travel") });
    const callsAfterFirst = deterministicRandomInt.mock.calls.length;
    const replay = store.executeCommand({ context, clientCommandId, expectedCampaignVersion: 0, command, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "travel") });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(replay.state.time.randomEvents).toEqual(first.state.time.randomEvents);
    expect(deterministicRandomInt.mock.calls.length).toBe(callsAfterFirst);
    store.close();
  });

  it("retains the exact event evidence across a store restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-random-restart-"));
    const databasePath = join(directory, "engine.db");
    const state = seededState();
    const context = contextFor(state);
    const command: EngineCommand = { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" };
    const clientCommandId = "restart-random-event";
    const firstStore = new LanternEngineStore(databasePath);
    firstStore.createCampaign(context, state);
    queueRandoms([20, 1, 4]);
    const first = firstStore.executeCommand({ context, clientCommandId, expectedCampaignVersion: 0, command, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "travel") });
    const committed = first.state.time.randomEvents.at(-1)!;
    firstStore.close();

    const restarted = new LanternEngineStore(databasePath);
    expect(restarted.getCampaign(context).time.randomEvents.at(-1)).toEqual(committed);
    const replay = restarted.executeCommand({ context, clientCommandId, expectedCampaignVersion: 0, command, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "travel") });
    expect(replay.replayed).toBe(true);
    expect(replay.state.time.randomEvents.at(-1)).toEqual(committed);
    restarted.close();
  });

  it("changes the context hash for a changed context while preserving committed history", () => {
    const clear = travel(seededState(), 1, 1, randomUUID());
    const rainState = seededState();
    rainState.time.survival.weather = "rain";
    const rain = travel(rainState, 1, 1, randomUUID());
    const clearEvent = clear.state.time.randomEvents.at(-1)!;
    const rainEvent = rain.state.time.randomEvents.at(-1)!;
    expect(clearEvent.contextHash).not.toBe(rainEvent.contextHash);
    expect(clearEvent.tableVersion).toBe("1");
    const reloaded = normalizeCampaignState(JSON.parse(JSON.stringify(clear.state)) as LanternCampaignState);
    expect(reloaded.time.randomEvents.at(-1)).toEqual(clearEvent);
  });

  it("keeps a noncombat patrol event as a continuation instead of forcing initiative", () => {
    const result = travel(seededState(), 1, 3);
    const event = result.state.time.randomEvents.at(-1)!;
    expect(event.selectedEntryId).toBe("roadside-patrol");
    expect(event.createdEncounterIds).toEqual([]);
    expect(result.state.combat).toMatchObject({ status: "none" });
    expect(result.state.time.travel?.status).toBe("arrived");
  });

  it("records a potentially hostile patrol without inventing combat or initiative", () => {
    const result = travel(seededState(), 1, 3);
    const event = result.state.time.randomEvents.at(-1)!;
    expect(event.triggered).toBe(true);
    expect(event.selectedEntryId).toBe("roadside-patrol");
    expect(event.createdEncounterIds).toEqual([]);
    expect(result.state.combat.status).toBe("none");
    expect(result.state.time.gameTime.totalMinutes).toBe(480);
  });

  it("rejects narrator substitution when a committed event did not authorize the situation", () => {
    const travelResult = travel(seededState(), 100);
    const prepared = prepareWatchtowerWorld(travelResult.state);
    const before = JSON.stringify(prepared);
    const eventId = travelResult.state.time.randomEvents.at(-1)!.id;
    const command: EngineCommand = { kind: "situation_create", definition: watchtowerSituationDefinition(), sourceRandomEventId: eventId };
    const rejected = resolveEngineCommand(
      prepared,
      contextFor(prepared, ["player", "dm"]),
      "narrator-substitution",
      command,
      "situation_create",
    );
    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("random_event_not_eligible");
    expect(JSON.stringify(rejected.state)).toBe(before);
    expect(rejected.state.situation).toBeNull();
  });
});
