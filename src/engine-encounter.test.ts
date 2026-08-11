import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const queuedRolls = vi.hoisted(() => [] as number[]);
const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => queuedRolls.shift() ?? max - 1));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import {
  EngineVersionConflictError,
  LanternEngineStore,
} from "./engine-store.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";

const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, command: EngineCommand, clientCommandId = randomUUID()) {
  return resolveEngineCommand(state, context(state), clientCommandId, command, command.kind);
}

function fighter(): LanternCampaignState {
  const initial = createInitialCampaign("encounter-account", "encounter-actor");
  const created = apply(initial, { kind: "character_create", name: "Guard Negotiator", species: "human", className: "fighter" });
  const tutorial = apply(created.state, { kind: "tutorial_advance" });
  const sandbox = apply(tutorial.state, { kind: "tutorial_advance" });
  expect(sandbox.accepted).toBe(true);
  return sandbox.state;
}

function startProfile(state: LanternCampaignState) {
  queuedRolls.push(18, 5, 17, 16, 15);
  return apply(state, {
    kind: "combat_start",
    encounterId: "guard-negotiation",
    encounterName: "Guard Negotiation",
    lifecycleProfile: "guards-surrender-v1",
    approach: {
      challengeId: "stealth-perception-v1",
      groupIndex: 0,
      goal: "Approach the guards without starting a fight.",
      approach: "Keep to the shadows and speak only when close.",
    },
    creatures: [
      { creatureKey: GOBLIN, count: 2 },
    ],
  });
}

describe("reviewed encounter lifecycle", () => {
  it("derives surprise and persists one server-owned initiative roll", () => {
    const started = startProfile(fighter());
    expect(started.accepted).toBe(true);
    expect(started.state.combat.lifecycle).toMatchObject({
      profile: "guards-surrender-v1",
      phase: "active",
      surprise: {
        source: "stealth-perception-v1",
        eligible: true,
        consumed: true,
      },
      objective: { id: "resolve-without-killing", status: "pending" },
    });
    expect(started.state.combat.lifecycle?.initiative.formulaRevision).toBe("initiative-v1");
    expect(started.state.combat.lifecycle?.initiative.order[0]).toBe(started.state.actorId);
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(started.state)) as LanternCampaignState);
    expect(restarted.combat.lifecycle).toEqual(started.state.combat.lifecycle);
  });

  it("offers surrender after an ally falls and resolves acceptance exactly once", () => {
    const started = startProfile(fighter());
    const first = started.state.combat.enemies[0]!;
    const second = started.state.combat.enemies[1]!;
    first.hp = 1;
    second.hp = 1;
    const attack = apply(started.state, { kind: "combat_action", action: "attack_nonlethal", targetId: first.id });
    expect(attack.accepted).toBe(true);
    expect(attack.state.combat.lifecycle?.phase).toBe("resolving");
    expect(attack.state.combat.lifecycle?.morale?.offers[0]).toMatchObject({ targetId: second.id, status: "offered" });
    expect(attack.state.combat.lifecycle?.nonlethalDefeatIds).toContain(first.id);

    const accepted = apply(attack.state, { kind: "encounter_decision", decision: "accept_surrender", targetId: second.id });
    expect(accepted.accepted).toBe(true);
    expect(accepted.state.combat.status).toBe("ended");
    expect(accepted.state.combat.lifecycle).toMatchObject({ phase: "terminal", outcome: "surrendered", objective: { status: "succeeded" } });

    const postTerminal = apply(accepted.state, { kind: "combat_action", action: "attack", targetId: second.id });
    expect(postTerminal.accepted).toBe(false);
    expect(postTerminal.code).toBe("no_active_combat");
    expect(postTerminal.state).toEqual(accepted.state);
  });

  it("rejects an invalid response without mutation and records outcome rewards by key", () => {
    const started = startProfile(fighter());
    const before = JSON.parse(JSON.stringify(started.state)) as LanternCampaignState;
    const invalid = apply(started.state, { kind: "encounter_decision", decision: "accept_surrender", targetId: "not-offered" });
    expect(invalid.accepted).toBe(false);
    expect(invalid.code).toBe("surrender_not_offered");
    expect(invalid.state).toEqual(before);

    const first = started.state.combat.enemies[0]!;
    const second = started.state.combat.enemies[1]!;
    first.hp = 1;
    second.hp = 1;
    const attack = apply(started.state, { kind: "combat_action", action: "attack", targetId: first.id });
    const accepted = apply(attack.state, { kind: "encounter_decision", decision: "accept_surrender", targetId: second.id });
    const looted = apply(accepted.state, { kind: "loot", items: [], rewardXp: 10, rewardCopper: 3 });
    expect(looted.accepted).toBe(true);
    expect(looted.state.combat.lifecycle?.claimedRewards).toEqual(["guard-negotiation:surrendered:loot"]);
    const duplicate = apply(looted.state, { kind: "loot", items: [], rewardXp: 10, rewardCopper: 3 });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.code).toBe("reward_claimed");
    expect(duplicate.state).toEqual(looted.state);
  });

  it("requires #10 leaving-reach evidence before recording an escaped outcome", () => {
    const started = startProfile(fighter());
    const moved = apply(started.state, {
      kind: "combat_move",
      geometryRevision: started.state.combat.tactical.geometry.revision,
      destination: { ...started.state.combat.tactical.actorPosition, y: started.state.combat.tactical.actorPosition.y + 2 },
    });
    expect(moved.accepted).toBe(true);
    expect(moved.state.combat.tactical.lastPlan?.triggers.some((trigger) => trigger.boundary === "leaving-reach")).toBe(true);
    const escaped = apply(moved.state, { kind: "encounter_decision", decision: "retreat" });
    expect(escaped.accepted).toBe(true);
    expect(escaped.state.combat.lifecycle).toMatchObject({ phase: "terminal", outcome: "escaped", retreatPlanRevision: 1 });
    expect(escaped.state.combat.status).toBe("ended");
  });

  it("persists idempotent profile start and rejects a stale new command", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-encounter-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    const initial = createInitialCampaign("store-encounter-account", "store-encounter-actor");
    const createContext = context(initial);
    store.createCampaign(createContext, initial);
    let current = store.getCampaign(createContext);
    for (const command of [
      { kind: "character_create", name: "Persisted Guard Negotiator", species: "human", className: "fighter" },
      { kind: "tutorial_advance" },
      { kind: "tutorial_advance" },
    ] as EngineCommand[]) {
      const id = randomUUID();
      const result = store.executeCommand({
        context: createContext,
        clientCommandId: id,
        expectedCampaignVersion: current.version,
        command,
        tool: command.kind,
        resolve: (state) => resolveEngineCommand(state, createContext, id, command, command.kind),
      });
      current = result.state;
    }
    queuedRolls.push(18, 5, 17, 16, 15);
    const startCommand: EngineCommand = {
      kind: "combat_start",
      encounterId: "persisted-guards",
      encounterName: "Persisted Guards",
      lifecycleProfile: "guards-surrender-v1",
      approach: { challengeId: "stealth-perception-v1", groupIndex: 0, goal: "Approach", approach: "Quietly approach." },
      creatures: [{ creatureKey: GOBLIN, count: 2 }],
    };
    const startId = randomUUID();
    const expectedVersion = current.version;
    const committed = store.executeCommand({
      context: createContext,
      clientCommandId: startId,
      expectedCampaignVersion: expectedVersion,
      command: startCommand,
      tool: "combat_start",
      resolve: (state) => resolveEngineCommand(state, createContext, startId, startCommand, "combat_start"),
    });
    const replayed = store.executeCommand({
      context: createContext,
      clientCommandId: startId,
      expectedCampaignVersion: expectedVersion,
      command: startCommand,
      tool: "combat_start",
      resolve: (state) => resolveEngineCommand(state, createContext, startId, startCommand, "combat_start"),
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.state.combat.lifecycle).toEqual(committed.state.combat.lifecycle);
    expect(store.getCampaign(createContext).combat.lifecycle).toEqual(committed.state.combat.lifecycle);
    expect(() => store.executeCommand({
      context: createContext,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: expectedVersion,
      command: { kind: "encounter_decision", decision: "retreat" },
      tool: "encounter_decision",
      resolve: (state) => resolveEngineCommand(state, createContext, randomUUID(), { kind: "encounter_decision", decision: "retreat" }, "encounter_decision"),
    })).toThrow(EngineVersionConflictError);
    store.close();
    const reopened = new LanternEngineStore(databasePath);
    expect(reopened.getCampaign(createContext).combat.lifecycle).toEqual(committed.state.combat.lifecycle);
    reopened.close();
  });
});
