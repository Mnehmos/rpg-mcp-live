import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const queuedRolls = vi.hoisted(() => [] as number[]);
const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number, max: number) => queuedRolls.shift() ?? Math.max(min, max - 1)));
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomInt: deterministicRandomInt,
}));

import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { queryModifiers } from "./engine-effects.js";
import { LanternEngineStore } from "./engine-store.js";
import { commandForTool, parseToolArguments } from "./engine-tools.js";
import { materializeCombatant } from "./open5e-rules.js";

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

function apply(state: LanternCampaignState, raw: unknown, clientCommandId = randomUUID()) {
  const command = engineCommandSchema.parse(raw);
  return resolveEngineCommand(state, context(state), clientCommandId, command, command.kind);
}

function encounter(enemyPositions: Array<{ x: number; y: number }> = [{ x: 0, y: 2 }, { x: 3, y: 1 }]): LanternCampaignState {
  const initial = createInitialCampaign(randomUUID(), randomUUID());
  const created = apply(initial, {
    kind: "character_create",
    name: "Zone Keeper",
    species: "human",
    className: "fighter",
  });
  expect(created.accepted).toBe(true);
  const started = apply(created.state, {
    kind: "combat_start",
    encounterId: `zones-${randomUUID()}`,
    encounterName: "Reviewed Persistent Geometry",
    tactical: {
      frameId: "zone-frame",
      bounds: { minX: -6, maxX: 8, minY: -6, maxY: 8 },
      playerPosition: { frameId: "zone-frame", x: 0, y: 0, z: 0 },
    },
    creatures: enemyPositions.map((position) => ({
      creatureKey: GOBLIN,
      count: 1,
      position: { frameId: "zone-frame", ...position, z: 0 },
    })),
  });
  expect(started.accepted).toBe(true);
  started.state.character.hp = 1_000;
  started.state.character.maxHp = 1_000;
  started.state.character.ac = 100;
  started.state.combat.turnBudget.movementFeet.available = 60;
  return started.state;
}

function stationaryZone(state: LanternCampaignState): Extract<EngineCommand, { kind: "tactical_zone_create" }> {
  return engineCommandSchema.parse({
    kind: "tactical_zone_create",
    definitionKey: "hindering-circle-v1",
    geometryRevision: state.combat.tactical.geometry.revision,
    center: { frameId: state.combat.tactical.geometry.frameId, x: 0, y: 0, z: 0 },
  }) as Extract<EngineCommand, { kind: "tactical_zone_create" }>;
}

function followingAura(state: LanternCampaignState): Extract<EngineCommand, { kind: "tactical_zone_create" }> {
  return engineCommandSchema.parse({
    kind: "tactical_zone_create",
    definitionKey: "guiding-aura-v1",
    geometryRevision: state.combat.tactical.geometry.revision,
  }) as Extract<EngineCommand, { kind: "tactical_zone_create" }>;
}

function move(state: LanternCampaignState, x: number, y: number) {
  return apply(state, {
    kind: "combat_move",
    geometryRevision: state.combat.tactical.geometry.revision,
    destination: { frameId: state.combat.tactical.geometry.frameId, x, y, z: 0 },
  });
}

function advanceToNextPlayerRound(state: LanternCampaignState): LanternCampaignState {
  let current = apply(state, { kind: "end_turn" }).state;
  for (let attempt = 0; attempt < 20 && current.combat.status === "active" && current.combat.activeActorId !== current.actorId; attempt += 1) {
    const enemy = current.combat.enemies.find((candidate) => candidate.id === current.combat.activeActorId)!;
    const actionKey = materializeCombatant(enemy).attacks[0]?.actionKey;
    const advanced = apply(current, { kind: "advance_turn", combatantId: enemy.id, actionKey });
    expect(advanced.accepted).toBe(true);
    current = advanced.state;
  }
  expect(current.combat.activeActorId).toBe(current.actorId);
  return current;
}

describe("#175 persistent tactical zones", () => {
  it("derives one stationary circle through #139 geometry and applies ordinary effects", () => {
    const state = encounter();
    const insideEnemy = state.combat.enemies[0]!;
    const outsideEnemy = state.combat.enemies[1]!;
    const created = apply(state, stationaryZone(state));

    expect(created.accepted).toBe(true);
    expect(created.state.combat.turnBudget.action.spent).toBe(true);
    expect(created.state.combat.tactical.zones).toHaveLength(1);
    const zone = created.state.combat.tactical.zones[0]!;
    expect(zone).toMatchObject({
      version: 1,
      definitionKey: "hindering-circle-v1",
      source: { actorId: state.actorId, ref: `actor:${state.actorId}` },
      anchor: { kind: "stationary", position: { x: 0, y: 0, z: 0 } },
      shape: { kind: "circle", radiusFeet: 10 },
      geometryRevision: state.combat.tactical.geometry.revision,
      duration: { kind: "rounds", amount: 3, startedRound: state.combat.round, expiresAtRound: state.combat.round + 3 },
      currentCenter: { x: 0, y: 0, z: 0 },
      status: "active",
      endedReason: null,
      revision: 1,
    });
    expect(zone.affectedActorIds).toEqual(expect.arrayContaining([state.character.id, insideEnemy.id]));
    expect(zone.affectedActorIds).not.toContain(outsideEnemy.id);
    expect(zone.activeEffectIds).toHaveLength(2);
    expect(created.state.effects.filter((effect) => effect.sourceRef === `tactical-zone:${zone.id}` && effect.status === "active")).toHaveLength(2);
    expect(queryModifiers(created.state.effects, state.character.id, "ability-check").mode).toBe("disadvantage");
    expect(created.event?.stateChanges.map((change) => change.path)).toEqual(expect.arrayContaining([
      "/combat/tactical/zones",
      "/effects",
    ]));
    expect(created.data).toMatchObject({
      tacticalZone: { id: zone.id, revision: 1, affectedActorIds: expect.arrayContaining([state.character.id, insideEnemy.id]) },
      combat: { tactical: { zones: [expect.objectContaining({ id: zone.id, revision: 1 })] } },
      zoneTransitions: [expect.objectContaining({ enteredActorIds: expect.arrayContaining([state.character.id, insideEnemy.id]) })],
    });
  });

  it("moves a source-following aura, removes leavers once, and reapplies re-entrants once", () => {
    const state = encounter();
    const firstEnemy = state.combat.enemies[0]!;
    const secondEnemy = state.combat.enemies[1]!;
    const created = apply(state, followingAura(state));
    const initialZone = created.state.combat.tactical.zones[0]!;
    const initialFirstEnemyEffect = created.state.effects.find((effect) =>
      effect.status === "active" && effect.sourceRef === `tactical-zone:${initialZone.id}` && effect.targetRefs.includes(firstEnemy.id)
    )!;

    const moved = move(created.state, 3, 0);
    expect(moved.accepted).toBe(true);
    const movedZone = moved.state.combat.tactical.zones[0]!;
    expect(movedZone.currentCenter).toMatchObject({ x: 3, y: 0, z: 0 });
    expect(movedZone.revision).toBe(2);
    expect(movedZone.affectedActorIds).toEqual(expect.arrayContaining([state.character.id, secondEnemy.id]));
    expect(movedZone.affectedActorIds).not.toContain(firstEnemy.id);
    expect(moved.state.effects.find((effect) => effect.id === initialFirstEnemyEffect.id)?.status).toBe("removed");
    expect(queryModifiers(moved.state.effects, state.character.id, "ability-check").mode).toBe("advantage");
    expect(moved.data).toMatchObject({ zoneTransitions: [expect.objectContaining({
      enteredActorIds: [secondEnemy.id],
      leftActorIds: [firstEnemy.id],
    })] });

    const returned = move(moved.state, 0, 0);
    expect(returned.accepted).toBe(true);
    const returnedZone = returned.state.combat.tactical.zones[0]!;
    expect(returnedZone.revision).toBe(3);
    expect(returnedZone.affectedActorIds).toEqual(expect.arrayContaining([state.character.id, firstEnemy.id]));
    expect(returnedZone.affectedActorIds).not.toContain(secondEnemy.id);
    const firstEnemyApplications = returned.state.effects.filter((effect) =>
      effect.sourceRef === `tactical-zone:${returnedZone.id}` && effect.targetRefs.includes(firstEnemy.id)
    );
    expect(firstEnemyApplications).toHaveLength(2);
    expect(firstEnemyApplications.filter((effect) => effect.status === "active")).toHaveLength(1);
    expect(firstEnemyApplications.find((effect) => effect.status === "active")?.id).not.toBe(initialFirstEnemyEffect.id);

    const revisionBeforeHandoff = returnedZone.revision;
    const handedOff = apply(returned.state, { kind: "end_turn" });
    expect(handedOff.state.combat.tactical.zones[0]?.revision).toBe(revisionBeforeHandoff);
    expect(handedOff.event?.stateChanges.some((change) => change.path === "/combat/tactical/zones")).toBe(false);
  });

  it("expires at the authoritative round boundary and cleans up on source death or encounter end", () => {
    const expiryState = encounter([{ x: 0, y: 2 }]);
    const expiring = apply(expiryState, stationaryZone(expiryState));
    let advanced = expiring.state;
    advanced = advanceToNextPlayerRound(advanced);
    advanced = advanceToNextPlayerRound(advanced);
    advanced = advanceToNextPlayerRound(advanced);
    expect(advanced.combat.round).toBe(expiring.state.combat.round + 3);
    expect(advanced.combat.tactical.zones[0]).toMatchObject({ status: "expired", endedReason: "expired" });
    expect(advanced.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:") && effect.status === "active")).toHaveLength(0);

    const deathState = encounter([{ x: 0, y: 2 }]);
    const sourced = apply(deathState, followingAura(deathState));
    sourced.state.character.hp = 0;
    sourced.state.character.lifecycleState = "dying";
    sourced.state.character.conditions = ["unconscious"];
    sourced.state.character.deathSaveFailures = 2;
    sourced.state.character.deathSaveSuccesses = 0;
    sourced.state.character.deathRecord = {
      source: "damage",
      sourceCommandId: randomUUID(),
      sourceVersion: sourced.state.version,
      occurredAt: new Date().toISOString(),
    };
    queuedRolls.push(2);
    const dead = apply(sourced.state, { kind: "death_save" });
    expect(dead.state.character.lifecycleState).toBe("dead");
    expect(dead.state.combat.tactical.zones[0]).toMatchObject({ status: "removed", endedReason: "source-dead" });
    expect(dead.state.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:") && effect.status === "active")).toHaveLength(0);

    const endingState = encounter([{ x: 0, y: 2 }]);
    const endingZone = apply(endingState, stationaryZone(endingState));
    endingZone.state.combat.enemies[0]!.hp = 0;
    endingZone.state.combat.enemies[0]!.alive = false;
    const ended = apply(endingZone.state, { kind: "end_turn" });
    expect(ended.state.combat.status).toBe("ended");
    expect(ended.state.combat.tactical.zones[0]).toMatchObject({ status: "removed", endedReason: "encounter-ended" });
  });

  it("rejects stale or caller-authored mechanics without mutating state", () => {
    const state = encounter();
    const before = JSON.stringify(state);
    const stale = apply(state, {
      ...stationaryZone(state),
      geometryRevision: state.combat.tactical.geometry.revision + 1,
    });
    expect(stale).toMatchObject({ accepted: false, code: "stale_tactical_geometry", event: null });
    expect(JSON.stringify(stale.state)).toBe(before);

    const invalidDefinition = resolveEngineCommand(state, context(state), randomUUID(), {
      kind: "tactical_zone_create",
      definitionKey: "invented-zone",
      geometryRevision: state.combat.tactical.geometry.revision,
    } as unknown as EngineCommand, "tactical_zone_create");
    expect(invalidDefinition).toMatchObject({ accepted: false, code: "unsupported_tactical_zone_definition", event: null });
    expect(JSON.stringify(invalidDefinition.state)).toBe(before);

    for (const spoofed of [
      { ...stationaryZone(state), shape: "cube" },
      { ...stationaryZone(state), sourceActorId: "hidden-enemy" },
      { ...stationaryZone(state), targetIds: [state.combat.enemies[1]!.id] },
      { ...followingAura(state), center: { frameId: "zone-frame", x: 4, y: 4, z: 0 } },
    ]) {
      expect(engineCommandSchema.safeParse(spoofed).success).toBe(false);
    }

    const created = apply(state, stationaryZone(state));
    const corruptions: Array<{ state: LanternCampaignState; code: string }> = [];
    const stalePersisted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    stalePersisted.combat.tactical.zones[0]!.geometryRevision += 1;
    corruptions.push({ state: stalePersisted, code: "stale_tactical_geometry" });
    const invalidSource = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    invalidSource.combat.tactical.zones[0]!.source.actorId = "invented-source";
    corruptions.push({ state: invalidSource, code: "invalid_tactical_zone_source" });
    const invalidShape = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    (invalidShape.combat.tactical.zones[0]!.shape as { kind: "circle"; radiusFeet: number }).radiusFeet = 15;
    corruptions.push({ state: invalidShape, code: "invalid_tactical_zone_shape" });
    for (const corruption of corruptions) {
      const corruptedBefore = JSON.stringify(corruption.state);
      const rejected = apply(corruption.state, { kind: "end_turn" });
      expect(rejected).toMatchObject({ accepted: false, code: corruption.code, event: null });
      expect(JSON.stringify(rejected.state)).toBe(corruptedBefore);
    }
  });

  it("preserves zone identity and effect evidence on restart and command replay", () => {
    const state = encounter();
    const command = followingAura(state);
    const commandId = randomUUID();
    const directory = mkdtempSync(join(tmpdir(), "lantern-zones-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    const request = context(state);
    store.createCampaign({ requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId, capabilities: ["player", "dm"] }, state);
    const first = store.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "tactical_zone_create",
      resolve: (current) => resolveEngineCommand(current, request, commandId, command, "tactical_zone_create"),
    });
    expect(first.accepted).toBe(true);
    const normalized = normalizeCampaignState(JSON.parse(JSON.stringify(first.state)) as LanternCampaignState);
    expect(normalized.combat.tactical.zones).toEqual(first.state.combat.tactical.zones);
    expect(normalized.effects).toEqual(first.state.effects);
    const events = store.listCampaignEvents(request);
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const replay = reopened.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "tactical_zone_create",
      resolve: () => { throw new Error("zone replay re-entered the resolver"); },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(first.state);
    expect(reopened.listCampaignEvents(request)).toEqual(events);
    expect(replay.state.effects.filter((effect) => effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:"))).toHaveLength(
      first.state.effects.filter((effect) => effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:")).length,
    );
    reopened.close();
  });

  it("advertises only the two reviewed definitions through the existing tool registry", () => {
    const state = encounter();
    const args = parseToolArguments("tactical_zone_create", {
      definitionKey: "guiding-aura-v1",
      geometryRevision: state.combat.tactical.geometry.revision,
    });
    expect(commandForTool("tactical_zone_create", args)).toEqual(followingAura(state));
    expect(() => parseToolArguments("tactical_zone_create", {
      definitionKey: "guiding-aura-v1",
      geometryRevision: state.combat.tactical.geometry.revision,
      radiusFeet: 100,
    })).toThrow();
    expect(() => parseToolArguments("tactical_zone_create", {
      definitionKey: "guiding-aura-v1",
      geometryRevision: state.combat.tactical.geometry.revision,
      center: { frameId: "zone-frame", x: 4, y: 4, z: 0 },
    })).toThrow();
  });
});
