import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  engineCommandSchema,
  engineNpcTickCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, projectResolutionForActor, readToolData, resolveEngineCommand } from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

function fixtureState(): LanternCampaignState {
  const state = createInitialCampaign("npc-account", "hero");
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Hero";
  state.character.lifecycleState = "conscious";
  state.character.hp = state.character.maxHp;
  state.character.hitDiceRemaining = 1;
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
        hp: 5,
        maxHp: 10,
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
  state.worldFacts = [{
    id: "hidden-cache",
    kind: "secret",
    title: "Hidden cache",
    description: "A secret cache behind the watch-post.",
    visibility: "hidden",
    obscurity: "clear",
    requiredSense: "normal",
    passiveDc: null,
    sceneId: "town",
    revision: 1,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }];
  state.actorKnowledge = [];
  return normalizeCampaignState(state);
}

function contextFor(state: LanternCampaignState): RequestContext {
  return { requestId: randomUUID(), accountId: state.accountId, campaignId: state.id, actorId: state.actorId, capabilities: ["player", "dm"] };
}

function resolve(state: LanternCampaignState, command: EngineCommand, id = randomUUID()) {
  const context = contextFor(state);
  return resolveEngineCommand(state, context, id, command, command.kind);
}

describe("bounded event-driven NPC agency", () => {
  it("accepts a finite tick, filters hidden knowledge, and commits exactly one scheduled move", () => {
    const state = fixtureState();
    expect(engineNpcTickCommandSchema.safeParse({ kind: "npc_tick", trigger: "operator_batch", triggerId: "trigger-1" }).success).toBe(true);
    const result = resolve(state, { kind: "npc_tick", trigger: "operator_batch", triggerId: "trigger-1" });
    expect(result.accepted).toBe(true);
    expect(result.data).toMatchObject({ selectedOfferId: "move_to_schedule", invocation: { provider: "deterministic", fallback: true, inputTokens: 0, outputTokens: 0 } });
    expect((result.data as { offers: Array<{ id: string }> }).offers.map((offer) => offer.id)).toContain("no_op");
    expect((result.data as { promptContext: { facts: unknown[] } }).promptContext.facts).toEqual([]);
    expect(result.state.worldContext?.npcs[0]?.agency?.locationRef).toBe("market");
    expect(result.state.worldContext?.npcs[0]?.agency?.completedTriggerIds).toEqual(["trigger-1"]);
    expect(result.event?.stateChanges.some((change) => change.path.endsWith("/agency"))).toBe(true);
    const publicResult = projectResolutionForActor(result, state.actorId);
    expect((publicResult.data as { promptContext: { facts?: unknown[]; knowledge?: unknown[] } }).promptContext.facts).toBeUndefined();
    expect((publicResult.data as { promptContext: { knowledge?: unknown[] } }).promptContext.knowledge).toBeUndefined();

    const replay = resolve(result.state, { kind: "npc_tick", trigger: "operator_batch", triggerId: "trigger-1" }, randomUUID());
    expect(replay.accepted).toBe(false);
    expect(replay.code).toBe("npc_trigger_replayed");
    expect(replay.state.version).toBe(result.state.version);
    expect(replay.event).toBeNull();
  });

  it("uses the social witness/crime state for a bounded report and rejects unavailable resources without mutation", () => {
    const witnessed = resolve(fixtureState(), { kind: "social_action", action: "theft", targetId: "guard", itemId: "watch-key", witnessId: "guard" });
    expect(witnessed.accepted).toBe(true);
    const before = JSON.stringify(witnessed.state);
    const report = resolve(witnessed.state, { kind: "npc_tick", trigger: "witnessed_event", triggerId: "crime-trigger", npcId: "guard", offerId: "report_crime" });
    expect(report.accepted).toBe(true);
    expect(report.state.worldContext?.npcs[0]?.agency?.reportedCrimeIds).toContain(witnessed.state.social?.crimes[0]?.id);
    expect(report.state.worldContext?.npcs[0]?.memories.at(-1)).toContain("Reported crime:");

    const noResource = fixtureState();
    noResource.worldContext!.npcs[0]!.agency!.resources.actionPoints = 0;
    noResource.worldContext!.npcs[0]!.agency!.hp = 4;
    const snapshot = JSON.stringify(noResource);
    const rejected = resolve(noResource, { kind: "npc_tick", trigger: "operator_batch", triggerId: "resource-trigger", npcId: "guard", offerId: "rest" });
    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("npc_offer_illegal");
    expect(JSON.stringify(rejected.state)).toBe(snapshot);
    expect(before).not.toBe(JSON.stringify(report.state));
  });

  it("rejects dead and unreachable actions, preserves agency through context patches, and auto-ticks once on time advance", () => {
    const dead = fixtureState();
    dead.worldContext!.npcs[0]!.agency!.lifecycleState = "dead";
    dead.worldContext!.npcs[0]!.agency!.hp = 0;
    const deadResult = resolve(dead, { kind: "npc_tick", trigger: "operator_batch", triggerId: "dead-trigger", npcId: "guard" });
    expect(deadResult.accepted).toBe(false);
    expect(deadResult.code).toBe("npc_incapacitated");

    const unreachable = fixtureState();
    unreachable.worldContext!.npcs[0]!.agency!.schedule[0]!.locationRef = "far-away";
    const unreachableResult = resolve(unreachable, { kind: "npc_tick", trigger: "operator_batch", triggerId: "far-trigger", npcId: "guard", offerId: "move_to_schedule" });
    expect(unreachableResult.accepted).toBe(false);
    expect(unreachableResult.code).toBe("npc_offer_illegal");

    const patched = resolve(fixtureState(), {
      kind: "world_context",
      title: "Town updated",
      description: "The watch-post is repaired.",
      features: ["watch-post", "fountain"],
      exits: [{ id: "market", label: "the market" }],
      npcs: { upsert: [{ id: "guard", description: "A repaired watch officer." }] },
    });
    expect(patched.accepted).toBe(true);
    expect(patched.state.worldContext?.npcs[0]?.agency?.locationRef).toBe("town");
    expect(patched.state.worldContext?.npcs[0]?.agency?.resources.actionPoints).toBe(2);

    const rested = resolve(fixtureState(), { kind: "rest", restType: "short" });
    expect(rested.accepted).toBe(true);
    expect(rested.data).toMatchObject({ npcAgency: { selectedOfferId: "move_to_schedule" } });
    expect(rested.state.worldContext?.npcs[0]?.agency?.locationRef).toBe("market");
  });

  it("is stale-safe, idempotent, and restart-persistent through the engine store", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-npc-agency-"));
    const databasePath = join(directory, "engine.db");
    const state = fixtureState();
    const context = contextFor(state);
    const firstStore = new LanternEngineStore(databasePath);
    firstStore.createCampaign(context, state);
    const commandId = randomUUID();
    const command: EngineCommand = { kind: "npc_tick", trigger: "operator_batch", triggerId: "durable-trigger", npcId: "guard", offerId: "move_to_schedule" };
    const first = firstStore.executeCommand({ context, clientCommandId: commandId, expectedCampaignVersion: 0, command, tool: "npc_tick", resolve: (current) => resolveEngineCommand(current, context, commandId, command, "npc_tick") });
    const replay = firstStore.executeCommand({ context, clientCommandId: commandId, expectedCampaignVersion: 0, command, tool: "npc_tick", resolve: (current) => resolveEngineCommand(current, context, commandId, command, "npc_tick") });
    expect(first.state.version).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(replay.state.worldContext?.npcs[0]?.agency?.locationRef).toBe("market");
    expect(() => firstStore.executeCommand({ context, clientCommandId: randomUUID(), expectedCampaignVersion: 0, command, tool: "npc_tick", resolve: (current) => resolveEngineCommand(current, context, randomUUID(), command, "npc_tick") })).toThrow(EngineVersionConflictError);
    firstStore.close();

    const reopened = new LanternEngineStore(databasePath);
    const persisted = reopened.getCampaign(context);
    expect(persisted.worldContext?.npcs[0]?.agency?.completedTriggerIds).toContain("durable-trigger");
    expect(persisted.worldContext?.npcs[0]?.agency?.invocations[0]).toMatchObject({ provider: "deterministic", fallback: false, costUsd: 0 });
    reopened.close();
  });

  it("exposes NPC agency only through the explicit tool and keeps reads read-only", () => {
    const state = fixtureState();
    const parsed = engineCommandSchema.safeParse({ kind: "npc_tick", trigger: "scene_enter", triggerId: "scene-trigger", npcId: "guard" });
    expect(parsed.success).toBe(true);
    const observed = readToolData(state, "observe") as { worldContext: { npcs: Array<{ agency?: unknown }> } };
    expect(observed.worldContext.npcs[0]?.agency).toBeDefined();
    expect(state.version).toBe(0);
  });

  it("records guarded provider fallback and opens the circuit after three failures without retrying", () => {
    let state = fixtureState();
    for (const triggerId of ["provider-1", "provider-2", "provider-3"]) {
      const result = resolve(state, { kind: "npc_tick", trigger: "operator_batch", triggerId, npcId: "guard", provider: "openrouter", offerId: "no_op" });
      expect(result.accepted).toBe(true);
      expect(result.data).toMatchObject({ invocation: { provider: "openrouter", fallback: true, model: "guarded-unavailable" } });
      state = result.state;
    }
    expect(state.worldContext?.npcs[0]?.agency).toMatchObject({ consecutiveFailures: 3, circuitState: "open" });
    const blocked = resolve(state, { kind: "npc_tick", trigger: "operator_batch", triggerId: "provider-4", npcId: "guard", provider: "openrouter" });
    expect(blocked.accepted).toBe(false);
    expect(blocked.code).toBe("npc_circuit_open");
    expect(blocked.state.version).toBe(state.version);
    expect(blocked.event).toBeNull();
  });
});
