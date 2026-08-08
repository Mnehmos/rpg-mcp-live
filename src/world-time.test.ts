import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, beforeEach } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number) => min));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import type { EngineCommand, EngineWorldContext, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

function contextFor(state: LanternCampaignState): RequestContext {
  return { requestId: randomUUID(), accountId: state.accountId, campaignId: state.id, actorId: state.actorId, capabilities: ["player", "dm"] };
}

function ration(id: string, property: string, quantity = 1) {
  return {
    id,
    quantity,
    ownerRef: { kind: "actor" as const, id: "actor-time" },
    authoredDefinition: { name: property, kind: "consumable" as const, weight: 1, properties: [property] },
  };
}

function seededState(): LanternCampaignState {
  const state = createInitialCampaign("account-time", "actor-time", randomUUID());
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Wayfinder";
  state.character.inventory = [ration("ration-1", "ration", 4), ration("water-1", "water", 4), ration("material-1", "project-material", 1)]
    .map((item) => ({ ...item, ownerRef: { kind: "actor" as const, id: state.character.id } }));
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

function resolve(state: LanternCampaignState, command: EngineCommand, id = randomUUID()) {
  return resolveEngineCommand(state, contextFor(state), id, command, command.kind);
}

describe("authoritative world time, travel, rest, and projects", () => {
  beforeEach(() => {
    deterministicRandomInt.mockReset().mockImplementation((min: number, max?: number) => max ? max - 1 : min);
  });

  it("derives one-day normal and fast travel from the reviewed route profile", () => {
    const normal = resolve(seededState(), { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" });
    expect(normal.accepted).toBe(true);
    expect(normal.state.time.gameTime.totalMinutes).toBe(480);
    expect(normal.state.time.travel).toMatchObject({ distanceMiles: 24, elapsedMinutes: 480, pace: "normal", status: "arrived" });
    expect(normal.state.time.randomEvents[0]).toMatchObject({ triggered: false, occurrenceRoll: 100, tableId: "travel-watch-v1" });
    expect(normal.data).toMatchObject({ timeAdvance: { before: { totalMinutes: 0 }, after: { totalMinutes: 480 }, reason: "travel-arrival" } });
    expect(normal.event?.check?.formulaRevision).toBe("checks-v1");

    const fast = resolve(seededState(), { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "fast" });
    expect(fast.accepted).toBe(true);
    expect(fast.state.time.gameTime.totalMinutes).toBe(360);
    expect(fast.state.time.travel).toMatchObject({ distanceMiles: 30, elapsedMinutes: 360, pace: "fast", forcedMarch: true });
    expect(fast.state.time.survival.exhaustionLevel).toBe(1);
  });

  it("consumes ration and water atomically and records a bounded navigation failure", () => {
    deterministicRandomInt.mockImplementation((min: number) => min);
    const missingWater = seededState();
    missingWater.character.inventory = missingWater.character.inventory.filter((item) => item.id !== "water-1");
    const before = JSON.stringify(missingWater);
    const rejected = resolve(missingWater, { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" });
    expect(rejected.accepted).toBe(false);
    expect(JSON.stringify(rejected.state)).toBe(before);

    const failed = resolve(seededState(), { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" });
    expect(failed.accepted).toBe(true);
    expect(failed.state.time.travel?.status).toBe("failed");
    expect(failed.state.time.survival.exhaustionLevel).toBe(1);
    expect(failed.state.time.randomEvents[0]?.triggered).toBe(true);
    expect(failed.state.character.inventory.find((item) => item.id === "ration-1")?.quantity).toBe(3);
    expect(failed.state.character.inventory.find((item) => item.id === "water-1")?.quantity).toBe(3);
  });

  it("processes scheduled effect expiry, deadline crossing, and an interrupted long rest", () => {
    const state = seededState();
    state.effects.push({
      id: "timed-road-effect",
      definitionKey: "condition:road-weariness",
      sourceRef: "travel",
      targetRefs: [state.character.id],
      operations: [{ kind: "condition", condition: "road-weariness", action: "apply" }],
      startAnchor: { kind: "campaign-round", round: 0 },
      duration: { kind: "fixed", amount: 60, unit: "minute" },
      startTimeMinutes: 0,
      stackingKey: "road-weariness",
      stackingRule: "ignore",
      clearedBy: ["duration"],
      status: "active",
      provenance: { sourceContentKey: null, sourceCommandId: "seed", rulesVersion: state.rulesVersion, formulaRevision: "test" },
    });
    state.time.scheduledEvents.push({
      id: "rest-interrupt",
      kind: "rest-interruption",
      dueAtMinutes: 600,
      status: "pending",
      provenance: { sourceCommandId: "seed", sourceVersion: 0 },
    });
    const travel = resolve(state, { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" });
    expect(travel.accepted).toBe(true);
    expect(travel.state.effects.find((effect) => effect.id === "timed-road-effect")?.status).toBe("expired");
    expect(travel.state.quests[0]?.status).toBe("active");
    expect(travel.state.time.worldClocks[0]?.elapsedMinutes).toBe(480);

    const hpBefore = travel.state.character.hp;
    const rest = resolve(travel.state, { kind: "rest", restType: "long" });
    expect(rest.accepted).toBe(true);
    expect(rest.state.time.gameTime.totalMinutes).toBe(960);
    expect(rest.state.time.rest.status).toBe("interrupted");
    expect(rest.state.quests[0]?.status).toBe("failed");
    expect(rest.state.character.hp).toBe(hpBefore);
    expect(rest.state.time.scheduledEvents.find((event) => event.id === "rest-interrupt")?.status).toBe("processed");
  });

  it("prevents rest spam and completes one persisted project exactly once", () => {
    const state = seededState();
    const firstRest = resolve(state, { kind: "rest", restType: "long" });
    expect(firstRest.accepted).toBe(true);
    const repeated = resolve(firstRest.state, { kind: "rest", restType: "long" });
    expect(repeated.accepted).toBe(false);
    expect(repeated.code).toBe("rest_too_soon");
    expect(JSON.stringify(repeated.state)).toBe(JSON.stringify(firstRest.state));

    const projectStart = resolve(firstRest.state, { kind: "project", action: "start", projectId: "research-v1" });
    expect(projectStart.accepted).toBe(true);
    const projectWork = resolve(projectStart.state, { kind: "project", action: "work", projectId: "research-v1" });
    expect(projectWork.accepted).toBe(true);
    expect(projectWork.state.time.projects[0]).toMatchObject({ status: "completed", workCompletedMinutes: 480, completedAtMinutes: 960 });
    expect(projectWork.state.character.inventory.find((item) => item.id === "material-1")?.quantity).toBe(0);
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(projectWork.state)) as LanternCampaignState);
    expect(restarted.time).toEqual(projectWork.state.time);
  });

  it("replays a travel command without consuming another day or supply", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-time-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    const state = seededState();
    const context = contextFor(state);
    store.createCampaign(context, state);
    const clientCommandId = randomUUID();
    const command: EngineCommand = { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" };
    const first = store.executeCommand({ context, clientCommandId, expectedCampaignVersion: 0, command, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "travel") });
    const replay = store.executeCommand({ context, clientCommandId, expectedCampaignVersion: 0, command, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "travel") });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(store.getCampaign(context).time.gameTime.totalMinutes).toBe(480);
    expect(store.getCampaign(context).character.inventory.find((item) => item.id === "ration-1")?.quantity).toBe(3);
    expect(() => store.executeCommand({ context, clientCommandId: randomUUID(), expectedCampaignVersion: 0, command: { kind: "travel", routeId: "one-day-road-v1", destinationId: "crossroads", pace: "normal" }, tool: "travel", resolve: (current) => resolveEngineCommand(current, context, randomUUID(), command, "travel") })).toThrow(EngineVersionConflictError);
    store.close();
  });
});
