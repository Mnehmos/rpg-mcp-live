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
  resolveProductionRoomEnter,
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
import { registerOpen5ePackCompatibilityAlias } from "./content/rules-kernel.js";
import { materializeCombatant, OPEN5E_RULES_PACK_HASH } from "./open5e-rules.js";

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

function encounter(
  enemyPositions: Array<{ x: number; y: number }> = [{ x: 0, y: 2 }, { x: 3, y: 1 }],
  lifecycleProfile = false,
): LanternCampaignState {
  const initial = createInitialCampaign(randomUUID(), randomUUID());
  const created = apply(initial, {
    kind: "character_create",
    name: "Zone Keeper",
    species: "human",
    className: "fighter",
  });
  expect(created.accepted).toBe(true);
  if (lifecycleProfile) queuedRolls.push(18, 5, 17, 16, 15);
  const started = apply(created.state, {
    kind: "combat_start",
    encounterId: `zones-${randomUUID()}`,
    encounterName: "Reviewed Persistent Geometry",
    ...(lifecycleProfile ? {
      lifecycleProfile: "guards-surrender-v1" as const,
      approach: {
        challengeId: "stealth-perception-v1" as const,
        groupIndex: 0,
        goal: "Approach the guards without starting a fight.",
        approach: "Keep to the shadows until the tactical zone is needed.",
      },
    } : {}),
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
    const characterEffectId = created.state.effects.find((effect) =>
      effect.status === "active"
      && effect.sourceRef === `tactical-zone:${zone.id}`
      && effect.targetRefs.includes(state.character.id)
    )!.id;
    queuedRolls.push(18, 3);
    const checked = apply(created.state, { kind: "roll_check", ability: "str", goal: "Test the hindering field." });
    expect(checked.accepted).toBe(true);
    expect(checked.state.lastRoll).toBe(3);
    expect(checked.event?.check).toMatchObject({
      mode: "disadvantage",
      advantageSources: [],
      disadvantageSources: [characterEffectId],
    });
    expect(checked.event?.rolls).toEqual([
      { kind: "d20", value: 18, sides: 20 },
      { kind: "d20_disadvantage", value: 3, sides: 20 },
    ]);
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

  it("applies zone advantage and disadvantage to the party leader's group check", () => {
    for (const scenario of [
      { command: followingAura, mode: "advantage" as const, selectedRoll: 17 },
      { command: stationaryZone, mode: "disadvantage" as const, selectedRoll: 4 },
    ]) {
      const state = encounter([{ x: 0, y: 2 }]);
      const companion = apply(state, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
      expect(companion.accepted).toBe(true);
      const party = apply(companion.state, { kind: "party_create" });
      expect(party.accepted).toBe(true);
      const created = apply(party.state, scenario.command(party.state));
      expect(created.accepted).toBe(true);
      const passiveScore = scenario.mode === "advantage" ? 15 : 5;
      const passive = apply(created.state, {
        kind: "roll_check",
        ability: "wis",
        goal: "Notice the zone passively.",
        passive: true,
      });
      expect(passive.accepted).toBe(true);
      expect(passive.state.lastRoll).toBe(passiveScore);
      expect(passive.event?.check).toMatchObject({ mode: scenario.mode });
      expect(passive.event?.rolls).toEqual([
        { kind: "passive_score", value: passiveScore, sides: undefined },
      ]);
      const nextRound = advanceToNextPlayerRound(created.state);
      const zoneEffectId = nextRound.effects.find((effect) =>
        effect.status === "active"
        && effect.sourceRef.startsWith("tactical-zone:")
        && effect.targetRefs.includes(nextRound.character.id)
      )!.id;

      queuedRolls.push(4, 17);
      const checked = apply(nextRound, {
        kind: "party_group_check",
        ability: "wis",
        goal: "Search the zone together.",
        actorIds: [nextRound.actorId, nextRound.controlledActors[0]!.id],
      });

      expect(checked.accepted).toBe(true);
      expect(checked.state.lastRoll).toBe(scenario.selectedRoll);
      expect(checked.event?.check).toMatchObject({
        actorId: nextRound.actorId,
        mode: scenario.mode,
        advantageSources: scenario.mode === "advantage" ? [zoneEffectId] : [],
        disadvantageSources: scenario.mode === "disadvantage" ? [zoneEffectId] : [],
        formulaRevision: "party-group-check-v1",
      });
      expect(checked.event?.rolls).toEqual([
        { kind: "d20", value: 4, sides: 20 },
        { kind: `d20_${scenario.mode}`, value: 17, sides: 20 },
      ]);
    }
  });

  it("applies zone modifiers independently to both sides of an opposed check", () => {
    const state = encounter([{ x: 0, y: 2 }]);
    const opponentId = state.combat.enemies[0]!.id;
    const created = apply(state, stationaryZone(state));
    expect(created.accepted).toBe(true);
    const zone = created.state.combat.tactical.zones[0]!;
    const actorEffectId = created.state.effects.find((effect) =>
      effect.status === "active"
      && effect.sourceRef === `tactical-zone:${zone.id}`
      && effect.targetRefs.includes(state.character.id)
    )!.id;
    const opponentEffectId = created.state.effects.find((effect) =>
      effect.status === "active"
      && effect.sourceRef === `tactical-zone:${zone.id}`
      && effect.targetRefs.includes(opponentId)
    )!.id;

    queuedRolls.push(19, 12, 18, 2);
    const checked = apply(created.state, {
      kind: "challenge_attempt",
      challengeId: "stealth-perception-v1",
      goal: "Slip past the hindered guard.",
      approach: "Move through the edge of the circle.",
      opponentId,
    });

    expect(checked.accepted).toBe(true);
    expect(checked.event?.check).toMatchObject({
      kind: "opposed-check",
      mode: "disadvantage",
      advantageSources: [],
      disadvantageSources: [actorEffectId],
      opponentId,
      opponentMode: "disadvantage",
      opponentAdvantageSources: [],
      opponentDisadvantageSources: [opponentEffectId],
    });
    expect(checked.event?.rolls).toEqual([
      { kind: "d20", value: 19, sides: 20 },
      { kind: "d20_disadvantage", value: 12, sides: 20 },
      { kind: "opposed_d20", value: 18, sides: 20 },
      { kind: "opposed_disadvantage_d20", value: 2, sides: 20 },
    ]);
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

    const endingState = encounter([{ x: 0, y: 1 }]);
    const endingZone = apply(endingState, stationaryZone(endingState));
    const killReady = advanceToNextPlayerRound(endingZone.state);
    killReady.combat.enemies[0]!.hp = 1;
    queuedRolls.push(20);
    const ended = apply(killReady, {
      kind: "combat_action",
      action: "attack",
      targetId: killReady.combat.enemies[0]!.id,
    });
    expect(ended.accepted).toBe(true);
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
    const emptyCommandProvenance = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    emptyCommandProvenance.combat.tactical.zones[0]!.provenance.sourceCommandId = "   ";
    corruptions.push({ state: emptyCommandProvenance, code: "invalid_tactical_zone_source" });
    const futureVersionProvenance = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    futureVersionProvenance.combat.tactical.zones[0]!.provenance.sourceVersion = futureVersionProvenance.version + 1;
    corruptions.push({ state: futureVersionProvenance, code: "invalid_tactical_zone_source" });
    const blankRulesProvenance = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    blankRulesProvenance.combat.tactical.zones[0]!.provenance.rulesVersion = "";
    blankRulesProvenance.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:"))
      .forEach((effect) => { effect.provenance.rulesVersion = ""; });
    corruptions.push({ state: blankRulesProvenance, code: "invalid_tactical_zone_source" });
    const inventedRulesProvenance = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    const inventedRulesVersion = `open5e-pack@${"0".repeat(64)}`;
    inventedRulesProvenance.combat.tactical.zones[0]!.provenance.rulesVersion = inventedRulesVersion;
    inventedRulesProvenance.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:"))
      .forEach((effect) => { effect.provenance.rulesVersion = inventedRulesVersion; });
    corruptions.push({ state: inventedRulesProvenance, code: "invalid_tactical_zone_source" });
    const invalidShape = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    (invalidShape.combat.tactical.zones[0]!.shape as { kind: "circle"; radiusFeet: number }).radiusFeet = 15;
    corruptions.push({ state: invalidShape, code: "invalid_tactical_zone_shape" });
    const nonIncrementableRevision = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    nonIncrementableRevision.combat.tactical.zones[0]!.revision = Number.MAX_SAFE_INTEGER;
    corruptions.push({ state: nonIncrementableRevision, code: "invalid_tactical_zone_shape" });
    const insufficientRevisionHeadroom = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    insufficientRevisionHeadroom.combat.tactical.zones[0]!.revision = Number.MAX_SAFE_INTEGER - 1;
    corruptions.push({ state: insufficientRevisionHeadroom, code: "invalid_tactical_zone_shape" });
    const inactiveEncounter = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    inactiveEncounter.combat.status = "ended";
    corruptions.push({ state: inactiveEncounter, code: "invalid_tactical_zone_shape" });
    const mismatchedExpiredReason = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    mismatchedExpiredReason.combat.tactical.zones[0]!.status = "expired";
    mismatchedExpiredReason.combat.tactical.zones[0]!.endedReason = "source-dead";
    corruptions.push({ state: mismatchedExpiredReason, code: "invalid_tactical_zone_shape" });
    const mismatchedRemovedReason = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    mismatchedRemovedReason.combat.tactical.zones[0]!.status = "removed";
    mismatchedRemovedReason.combat.tactical.zones[0]!.endedReason = "expired";
    corruptions.push({ state: mismatchedRemovedReason, code: "invalid_tactical_zone_shape" });
    const expiredWithMembership = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    expiredWithMembership.combat.tactical.zones[0]!.status = "expired";
    expiredWithMembership.combat.tactical.zones[0]!.endedReason = "expired";
    corruptions.push({ state: expiredWithMembership, code: "invalid_tactical_zone_shape" });
    const removedWithMembership = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    removedWithMembership.combat.tactical.zones[0]!.status = "removed";
    removedWithMembership.combat.tactical.zones[0]!.endedReason = "source-dead";
    corruptions.push({ state: removedWithMembership, code: "invalid_tactical_zone_shape" });
    for (const corruption of corruptions) {
      const corruptedBefore = JSON.stringify(corruption.state);
      const rejected = apply(corruption.state, { kind: "end_turn" });
      expect(rejected).toMatchObject({ accepted: false, code: corruption.code, event: null });
      expect(JSON.stringify(rejected.state)).toBe(corruptedBefore);
    }
  });

  it("rejects zone creation whenever ordinary combat actions are prohibited without mutation", () => {
    for (const condition of ["incapacitated", "paralyzed", "petrified", "stunned"]) {
      const state = encounter();
      state.character.conditions = [condition];
      const before = JSON.stringify(state);
      const rejected = apply(state, stationaryZone(state));

      expect(rejected).toMatchObject({ accepted: false, code: "condition_prevents_action", event: null });
      expect(JSON.stringify(rejected.state)).toBe(before);
      expect(rejected.state.combat.turnBudget.action.spent).toBe(false);
      expect(rejected.state.combat.tactical.zones).toHaveLength(0);
    }

    const resolving = encounter(undefined, true);
    expect(resolving.combat.lifecycle).not.toBeNull();
    resolving.combat.lifecycle!.phase = "resolving";
    const before = JSON.stringify(resolving);
    const rejected = apply(resolving, stationaryZone(resolving));

    expect(rejected).toMatchObject({ accepted: false, code: "surrender_decision_required", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
    expect(rejected.state.combat.turnBudget.action.spent).toBe(false);
    expect(rejected.state.combat.tactical.zones).toHaveLength(0);
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

  it("keeps historical zone provenance valid after the campaign rules pack is re-pinned", () => {
    const state = encounter();
    const created = apply(state, followingAura(state));
    const historicalRulesVersion = created.state.rulesVersion;
    const repinned = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    repinned.rulesVersion = `${historicalRulesVersion}:reviewed-repin`;

    const enteringEnemyId = repinned.combat.enemies[1]!.id;
    const moved = move(repinned, 3, 0);
    expect(moved.accepted).toBe(true);
    expect(moved.state.effects.find((effect) =>
      effect.status === "active"
      && effect.sourceRef.startsWith("tactical-zone:")
      && effect.targetRefs.includes(enteringEnemyId)
    )?.provenance.rulesVersion).toBe(historicalRulesVersion);

    const continued = apply(moved.state, { kind: "end_turn" });
    expect(continued.accepted).toBe(true);
    expect(continued.state.rulesVersion).toBe(repinned.rulesVersion);
    expect(continued.state.combat.tactical.zones[0]!.provenance.rulesVersion).toBe(historicalRulesVersion);
    expect(continued.state.effects.filter((effect) => effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ provenance: expect.objectContaining({ rulesVersion: historicalRulesVersion }) }),
      ]));
  });

  it("preserves a registered compatibility-alias rules identity", () => {
    const state = encounter();
    const created = apply(state, followingAura(state));
    const aliasHash = `${OPEN5E_RULES_PACK_HASH[0] === "0" ? "1" : "0"}${OPEN5E_RULES_PACK_HASH.slice(1)}`;
    const aliasRulesVersion = `open5e-pack@${aliasHash}`;
    registerOpen5ePackCompatibilityAlias(aliasHash, OPEN5E_RULES_PACK_HASH);
    const aliased = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    aliased.combat.tactical.zones[0]!.provenance.rulesVersion = aliasRulesVersion;
    aliased.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:"))
      .forEach((effect) => { effect.provenance.rulesVersion = aliasRulesVersion; });

    const normalized = normalizeCampaignState(aliased);
    expect(normalized.combat.tactical.zoneIntegrityIssue).toBeNull();
    expect(normalized.combat.tactical.zones[0]!.provenance.rulesVersion).toBe(aliasRulesVersion);
    expect(normalized.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ provenance: expect.objectContaining({ rulesVersion: aliasRulesVersion }) }),
      ]));
    expect(apply(normalized, { kind: "end_turn" }).accepted).toBe(true);
  });

  it("preserves inert terminal-zone history after its rules pack is retired", () => {
    const state = encounter([{ x: 0, y: 1 }]);
    const created = apply(state, stationaryZone(state));
    const killReady = advanceToNextPlayerRound(created.state);
    killReady.combat.enemies[0]!.hp = 1;
    queuedRolls.push(20);
    const ended = apply(killReady, {
      kind: "combat_action",
      action: "attack",
      targetId: killReady.combat.enemies[0]!.id,
    });
    expect(ended.accepted).toBe(true);
    expect(ended.state.combat.status).toBe("ended");
    expect(ended.state.combat.tactical.zones[0]).toMatchObject({
      status: "removed",
      endedReason: "encounter-ended",
      affectedActorIds: [],
      activeEffectIds: [],
    });

    const retiredRulesVersion = `open5e-pack@${"0".repeat(64)}`;
    const terminal = structuredClone(ended.state);
    terminal.combat.tactical.zones[0]!.provenance.rulesVersion = retiredRulesVersion;
    const normalized = normalizeCampaignState(terminal);
    expect(normalized.combat.tactical.zoneIntegrityIssue).toBeNull();
    expect(normalized.combat.tactical.zones[0]!.provenance.rulesVersion).toBe(retiredRulesVersion);

    const directory = mkdtempSync(join(tmpdir(), "lantern-retired-terminal-zone-"));
    const databasePath = join(directory, "engine.db");
    const request = context(terminal);
    const store = new LanternEngineStore(databasePath);
    store.createCampaign(
      { requestId: randomUUID(), accountId: terminal.accountId, actorId: terminal.actorId, capabilities: ["player", "dm"] },
      terminal,
    );
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const loaded = reopened.getCampaign(request);
    expect(loaded.combat.tactical.zoneIntegrityIssue).toBeNull();
    expect(loaded.combat.tactical.zones[0]!.provenance.rulesVersion).toBe(retiredRulesVersion);
    const command = engineCommandSchema.parse({
      kind: "roll_check",
      ability: "wis",
      goal: "Recall the concluded encounter.",
      passive: true,
    });
    const commandId = randomUUID();
    const continued = reopened.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: loaded.version,
      command,
      tool: "roll_check",
      resolve: (current) => resolveEngineCommand(current, request, commandId, command, "roll_check"),
    });
    expect(continued.accepted).toBe(true);
    expect(continued.state.combat.tactical.zones[0]!.provenance.rulesVersion).toBe(retiredRulesVersion);
    reopened.close();
  });

  it("fails closed after restart on an impossible zero-revision empty zone", () => {
    const state = encounter([{ x: -6, y: -6 }]);
    state.combat.tactical.geometry.bounds.maxX = 20;
    state.combat.tactical.geometry.bounds.maxY = 20;
    const command = {
      ...stationaryZone(state),
      center: { frameId: state.combat.tactical.geometry.frameId, x: 15, y: 15, z: 0 },
    } satisfies Extract<EngineCommand, { kind: "tactical_zone_create" }>;
    const created = apply(state, command);
    expect(created.accepted).toBe(true);
    expect(created.state.combat.tactical.zones[0]).toMatchObject({
      revision: 1,
      affectedActorIds: [],
      activeEffectIds: [],
    });
    expect(created.state.effects.some((effect) => effect.sourceRef.startsWith("tactical-zone:"))).toBe(false);

    const corrupted = structuredClone(created.state);
    corrupted.combat.tactical.zones[0]!.revision = 0;
    const directory = mkdtempSync(join(tmpdir(), "lantern-zero-revision-zone-"));
    const databasePath = join(directory, "engine.db");
    const request = context(corrupted);
    const store = new LanternEngineStore(databasePath);
    store.createCampaign(
      { requestId: randomUUID(), accountId: corrupted.accountId, actorId: corrupted.actorId, capabilities: ["player", "dm"] },
      corrupted,
    );
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const loaded = reopened.getCampaign(request);
    expect(loaded.combat.tactical.zones).toEqual([]);
    expect(loaded.combat.tactical.zoneIntegrityIssue).toMatchObject({ code: "invalid_tactical_zone_shape" });
    const before = JSON.stringify(loaded);
    const nextCommand = engineCommandSchema.parse({ kind: "end_turn" });
    const commandId = randomUUID();
    const rejected = reopened.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: loaded.version,
      command: nextCommand,
      tool: "end_turn",
      resolve: (current) => resolveEngineCommand(current, request, commandId, nextCommand, "end_turn"),
    });
    expect(rejected).toMatchObject({ accepted: false, code: "invalid_tactical_zone_shape", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
    expect(reopened.listCampaignEvents(request)).toEqual([]);
    reopened.close();
  });

  it("fails closed after restart on duplicate active zone ids or definitions", () => {
    for (const duplicate of [
      (state: LanternCampaignState) => {
        state.combat.tactical.zones.push(structuredClone(state.combat.tactical.zones[0]!));
      },
      (state: LanternCampaignState) => {
        const original = state.combat.tactical.zones[0]!;
        const copy = structuredClone(original);
        copy.id = `${original.id}:duplicate-definition`;
        const copiedEffects = state.effects
          .filter((effect) => effect.status === "active" && effect.sourceRef === `tactical-zone:${original.id}`)
          .map((effect) => ({
            ...structuredClone(effect),
            id: `${effect.id}:duplicate-definition`,
            sourceRef: `tactical-zone:${copy.id}`,
          }));
        copy.activeEffectIds = copiedEffects.map((effect) => effect.id).sort();
        state.combat.tactical.zones.push(copy);
        state.effects.push(...copiedEffects);
      },
    ]) {
      const state = encounter();
      const created = apply(state, followingAura(state));
      const corrupted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
      duplicate(corrupted);
      const directory = mkdtempSync(join(tmpdir(), "lantern-duplicate-zones-"));
      const databasePath = join(directory, "engine.db");
      const request = context(corrupted);
      const store = new LanternEngineStore(databasePath);
      store.createCampaign(
        { requestId: randomUUID(), accountId: corrupted.accountId, actorId: corrupted.actorId, capabilities: ["player", "dm"] },
        corrupted,
      );
      store.close();

      const reopened = new LanternEngineStore(databasePath);
      const loaded = reopened.getCampaign(request);
      expect(loaded.combat.tactical.zoneIntegrityIssue).toMatchObject({ code: "invalid_tactical_zone_shape" });
      const before = JSON.stringify(loaded);
      const command = engineCommandSchema.parse({ kind: "end_turn" });
      const commandId = randomUUID();
      const rejected = reopened.executeCommand({
        context: request,
        clientCommandId: commandId,
        expectedCampaignVersion: loaded.version,
        command,
        tool: "end_turn",
        resolve: (current) => resolveEngineCommand(current, request, commandId, command, "end_turn"),
      });
      expect(rejected).toMatchObject({ accepted: false, code: "invalid_tactical_zone_shape", event: null });
      expect(JSON.stringify(rejected.state)).toBe(before);
      expect(reopened.listCampaignEvents(request)).toEqual([]);
      reopened.close();
    }
  });

  it("fails closed after restart when persisted active zone authority is corrupt", () => {
    for (const corruption of [
      {
        code: "invalid_tactical_zone_source",
        apply: (state: LanternCampaignState) => { state.combat.tactical.zones[0]!.source.actorId = "invented-source"; },
      },
      {
        code: "invalid_tactical_zone_source",
        apply: (state: LanternCampaignState) => { state.combat.tactical.zones[0]!.provenance.sourceCommandId = "   "; },
      },
      {
        code: "invalid_tactical_zone_source",
        apply: (state: LanternCampaignState) => { state.combat.tactical.zones[0]!.provenance.sourceVersion = state.version + 1; },
      },
      {
        code: "invalid_tactical_zone_source",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.zones[0]!.provenance.rulesVersion = "";
          state.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:"))
            .forEach((effect) => { effect.provenance.rulesVersion = ""; });
        },
      },
      {
        code: "invalid_tactical_zone_source",
        apply: (state: LanternCampaignState) => {
          const invented = `open5e-pack@${"0".repeat(64)}`;
          state.combat.tactical.zones[0]!.provenance.rulesVersion = invented;
          state.effects.filter((effect) => effect.sourceRef.startsWith("tactical-zone:"))
            .forEach((effect) => { effect.provenance.rulesVersion = invented; });
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          (state.combat.tactical.zones[0]!.shape as { kind: "circle"; radiusFeet: number }).radiusFeet = 15;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.zones[0]!.revision = Number.MAX_SAFE_INTEGER;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.zones[0]!.revision = Number.MAX_SAFE_INTEGER - 1;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.geometry.bounds.maxX = state.combat.tactical.geometry.bounds.minX - 1;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.actorPosition.x = state.combat.tactical.geometry.bounds.maxX + 1;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          const duration = state.combat.tactical.zones[0]!.duration;
          duration.startedRound = state.combat.round + 100;
          duration.expiresAtRound = duration.startedRound + duration.amount;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.round = state.combat.tactical.zones[0]!.duration.expiresAtRound;
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => { state.combat.status = "ended"; },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.zones[0]!.status = "expired";
          state.combat.tactical.zones[0]!.endedReason = "source-dead";
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          state.combat.tactical.zones[0]!.status = "removed";
          state.combat.tactical.zones[0]!.endedReason = "expired";
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          const zone = state.combat.tactical.zones[0]!;
          zone.affectedActorIds.push(zone.affectedActorIds[0]!);
        },
      },
      {
        code: "invalid_tactical_zone_shape",
        apply: (state: LanternCampaignState) => {
          const zone = state.combat.tactical.zones[0]!;
          zone.activeEffectIds.push(zone.activeEffectIds[0]!);
        },
      },
    ]) {
      const state = encounter();
      const created = apply(state, followingAura(state));
      const corrupted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
      corruption.apply(corrupted);
      const directory = mkdtempSync(join(tmpdir(), "lantern-corrupt-zones-"));
      const databasePath = join(directory, "engine.db");
      const request = context(corrupted);
      const store = new LanternEngineStore(databasePath);
      store.createCampaign(
        { requestId: randomUUID(), accountId: corrupted.accountId, actorId: corrupted.actorId, capabilities: ["player", "dm"] },
        corrupted,
      );
      store.close();

      const reopened = new LanternEngineStore(databasePath);
      const loaded = reopened.getCampaign(request);
      expect(loaded.combat.tactical.zones).toEqual([]);
      expect(loaded.combat.tactical.zoneIntegrityIssue).toMatchObject({ code: corruption.code });
      expect(normalizeCampaignState(loaded).combat.tactical.zoneIntegrityIssue).toEqual(loaded.combat.tactical.zoneIntegrityIssue);
      expect(loaded.effects.some((effect) => effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:"))).toBe(true);
      const before = JSON.stringify(loaded);
      const command = engineCommandSchema.parse({
        kind: "roll_check",
        ability: "str",
        goal: "Prove an expired or corrupt zone cannot influence this roll.",
      });
      const commandId = randomUUID();
      const rejected = reopened.executeCommand({
        context: request,
        clientCommandId: commandId,
        expectedCampaignVersion: loaded.version,
        command,
        tool: "roll_check",
        resolve: (current) => resolveEngineCommand(current, request, commandId, command, "roll_check"),
      });
      expect(rejected).toMatchObject({ accepted: false, code: corruption.code, event: null });
      expect(JSON.stringify(rejected.state)).toBe(before);
      expect(reopened.listCampaignEvents(request)).toEqual([]);
      reopened.close();
    }
  });

  it("fails closed after restart when a terminal zone retains membership evidence", () => {
    for (const scenario of [
      { status: "expired" as const, endedReason: "expired" as const, retained: "actors" as const },
      { status: "removed" as const, endedReason: "source-dead" as const, retained: "effects" as const },
    ]) {
      const state = encounter();
      const created = apply(state, followingAura(state));
      const corrupted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
      const zone = corrupted.combat.tactical.zones[0]!;
      zone.status = scenario.status;
      zone.endedReason = scenario.endedReason;
      if (scenario.retained === "actors") zone.activeEffectIds = [];
      else zone.affectedActorIds = [];
      corrupted.effects = corrupted.effects.map((effect) => effect.sourceRef === `tactical-zone:${zone.id}`
        ? { ...effect, status: "removed" as const }
        : effect);

      const directory = mkdtempSync(join(tmpdir(), "lantern-terminal-zone-membership-"));
      const databasePath = join(directory, "engine.db");
      const request = context(corrupted);
      const store = new LanternEngineStore(databasePath);
      store.createCampaign(
        { requestId: randomUUID(), accountId: corrupted.accountId, actorId: corrupted.actorId, capabilities: ["player", "dm"] },
        corrupted,
      );
      store.close();

      const reopened = new LanternEngineStore(databasePath);
      const loaded = reopened.getCampaign(request);
      expect(loaded.combat.tactical.zones).toEqual([]);
      expect(loaded.combat.tactical.zoneIntegrityIssue).toMatchObject({ code: "invalid_tactical_zone_shape" });
      expect(loaded.effects.some((effect) => effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:"))).toBe(false);
      const before = JSON.stringify(loaded);
      const command = engineCommandSchema.parse({ kind: "end_turn" });
      const commandId = randomUUID();
      const rejected = reopened.executeCommand({
        context: request,
        clientCommandId: commandId,
        expectedCampaignVersion: loaded.version,
        command,
        tool: "end_turn",
        resolve: (current) => resolveEngineCommand(current, request, commandId, command, "end_turn"),
      });
      expect(rejected).toMatchObject({ accepted: false, code: "invalid_tactical_zone_shape", event: null });
      expect(JSON.stringify(rejected.state)).toBe(before);
      expect(reopened.listCampaignEvents(request)).toEqual([]);
      reopened.close();
    }
  });

  it("rejects tampered or orphaned producer effects before any command can use them", () => {
    const corruptions: Array<{
      apply: (state: LanternCampaignState) => void;
    }> = [
      {
        apply: (state) => {
          state.effects.find((effect) => effect.sourceRef.startsWith("tactical-zone:"))!.definitionKey = "invented-zone-definition";
        },
      },
      {
        apply: (state) => {
          const effect = state.effects.find((candidate) => candidate.sourceRef.startsWith("tactical-zone:"))!;
          const originalId = effect.id;
          effect.id = "forged-tactical-zone-effect";
          const zone = state.combat.tactical.zones[0]!;
          zone.activeEffectIds = zone.activeEffectIds.map((id) => id === originalId ? effect.id : id);
        },
      },
      {
        apply: (state) => {
          state.effects.find((effect) => effect.sourceRef.startsWith("tactical-zone:"))!.operations = [
            { kind: "disadvantage", category: "ability-check" },
          ];
        },
      },
      {
        apply: (state) => {
          state.effects.find((effect) => effect.sourceRef.startsWith("tactical-zone:"))!.stackingRule = "stack";
        },
      },
      {
        apply: (state) => {
          state.effects.find((effect) => effect.sourceRef.startsWith("tactical-zone:"))!.duration = {
            kind: "fixed",
            amount: 1,
            unit: "round",
          };
        },
      },
      {
        apply: (state) => {
          const effect = state.effects.find((candidate) => candidate.sourceRef.startsWith("tactical-zone:"))!;
          effect.startAnchor = {
            kind: "campaign-round",
            round: state.combat.tactical.zones[0]!.duration.startedRound - 1,
          };
        },
      },
      {
        apply: (state) => {
          state.effects.find((effect) => effect.sourceRef.startsWith("tactical-zone:"))!.targetRefs = [
            state.combat.enemies[1]!.id,
          ];
        },
      },
      {
        apply: (state) => {
          state.combat.tactical.zones = [];
        },
      },
    ];

    for (const corruption of corruptions) {
      const state = encounter();
      const created = apply(state, followingAura(state));
      const corrupted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
      corruption.apply(corrupted);
      const directory = mkdtempSync(join(tmpdir(), "lantern-corrupt-zone-effects-"));
      const databasePath = join(directory, "engine.db");
      const request = context(corrupted);
      const store = new LanternEngineStore(databasePath);
      store.createCampaign(
        { requestId: randomUUID(), accountId: corrupted.accountId, actorId: corrupted.actorId, capabilities: ["player", "dm"] },
        corrupted,
      );
      store.close();

      const reopened = new LanternEngineStore(databasePath);
      const loaded = reopened.getCampaign(request);
      expect(loaded.effects.some((effect) => effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:"))).toBe(true);
      const before = JSON.stringify(loaded);
      const command = engineCommandSchema.parse({ kind: "end_turn" });
      const commandId = randomUUID();
      const rejected = reopened.executeCommand({
        context: request,
        clientCommandId: commandId,
        expectedCampaignVersion: loaded.version,
        command,
        tool: "end_turn",
        resolve: (current) => resolveEngineCommand(current, request, commandId, command, "end_turn"),
      });
      expect(rejected).toMatchObject({ accepted: false, code: "invalid_tactical_zone_effect", event: null });
      expect(JSON.stringify(rejected.state)).toBe(before);
      expect(reopened.listCampaignEvents(request)).toEqual([]);
      reopened.close();
    }
  });

  it("guards direct persisted resolvers before their callback or player text can mutate state", () => {
    const state = encounter();
    const created = apply(state, followingAura(state));
    const corrupted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    corrupted.effects.find((effect) => effect.sourceRef.startsWith("tactical-zone:"))!.operations = [
      { kind: "disadvantage", category: "ability-check" },
    ];
    const directory = mkdtempSync(join(tmpdir(), "lantern-zone-store-boundary-"));
    const databasePath = join(directory, "engine.db");
    const request = context(corrupted);
    const store = new LanternEngineStore(databasePath);
    store.createCampaign(
      { requestId: randomUUID(), accountId: corrupted.accountId, actorId: corrupted.actorId, capabilities: ["player", "dm"] },
      corrupted,
    );
    const loaded = store.getCampaign(request);
    const before = JSON.stringify(loaded);
    const command = { kind: "production_room_enter" } as const;
    const commandId = randomUUID();
    let resolverInvoked = false;

    const rejected = store.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: loaded.version,
      command,
      tool: "production_room",
      playerText: "This text must not be appended when zone integrity fails.",
      resolve: (current) => {
        resolverInvoked = true;
        return resolveProductionRoomEnter(current, request, commandId);
      },
    });

    expect(resolverInvoked).toBe(false);
    expect(rejected).toMatchObject({ accepted: false, code: "invalid_tactical_zone_effect", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
    expect(JSON.stringify(store.getCampaign(request))).toBe(before);
    expect(store.listCampaignEvents(request)).toEqual([]);
    store.close();
  });

  it("does not remove an unrelated persisted effect that shares a departing zone effect id", () => {
    const state = encounter();
    const created = apply(state, followingAura(state));
    const enemyId = created.state.combat.enemies[0]!.id;
    const zoneEffect = created.state.effects.find((effect) =>
      effect.sourceRef.startsWith("tactical-zone:") && effect.targetRefs.includes(enemyId)
    )!;
    const persisted = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    persisted.effects.push({
      ...structuredClone(zoneEffect),
      sourceRef: "spell:unrelated-persistent-effect",
      targetRefs: [persisted.character.id],
    });
    const directory = mkdtempSync(join(tmpdir(), "lantern-zone-effect-id-collision-"));
    const databasePath = join(directory, "engine.db");
    const request = context(persisted);
    const store = new LanternEngineStore(databasePath);
    store.createCampaign(
      { requestId: randomUUID(), accountId: persisted.accountId, actorId: persisted.actorId, capabilities: ["player", "dm"] },
      persisted,
    );
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const loaded = reopened.getCampaign(request);
    expect(loaded.effects.filter((effect) => effect.id === zoneEffect.id)).toHaveLength(2);
    const command = engineCommandSchema.parse({
      kind: "combat_move",
      geometryRevision: loaded.combat.tactical.geometry.revision,
      destination: { frameId: loaded.combat.tactical.geometry.frameId, x: -3, y: 0, z: 0 },
    });
    const commandId = randomUUID();
    const moved = reopened.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: loaded.version,
      command,
      tool: "combat_move",
      resolve: (current) => resolveEngineCommand(current, request, commandId, command, "combat_move"),
    });

    expect(moved.accepted).toBe(true);
    expect(moved.state.effects.find((effect) =>
      effect.id === zoneEffect.id && effect.sourceRef.startsWith("tactical-zone:")
    )?.status).toBe("removed");
    expect(moved.state.effects.find((effect) =>
      effect.id === zoneEffect.id && effect.sourceRef === "spell:unrelated-persistent-effect"
    )?.status).toBe("active");
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
