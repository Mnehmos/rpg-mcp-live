import { describe, expect, it, vi } from "vitest";

const fixedRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => max - 1));
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomInt: fixedRandomInt,
}));

import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInitialCampaign,
  deriveTacticalAreaSnapshot,
  deriveTacticalCover,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type EngineTacticalGeometry,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";
import { getOpen5eCreature } from "./open5e-rules.js";

const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";
const FIRE_BOLT = "open5e:spell:5e-2014:srd-2014:srd_fire-bolt";
const BURNING_HANDS = "open5e:spell:5e-2014:srd-2014:srd_burning-hands";
const FIREBALL = "open5e:spell:5e-2014:srd-2014:srd_fireball";
const ADULT_BLACK_DRAGON = "open5e:creature:5e-2014:srd-2014:srd_adult-black-dragon";

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

function wizardEncounter(
  spellKey: string,
  positions: Array<{ x: number; y: number }>,
  obstacles: EngineTacticalGeometry["obstacles"] = [],
): LanternCampaignState {
  const initial = createInitialCampaign(randomUUID(), randomUUID());
  const created = apply(initial, {
    kind: "character_create",
    name: "Spatial Wizard",
    species: "human",
    className: "wizard",
  });
  expect(created.accepted).toBe(true);
  const leveled = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
  leveled.character.level = 5;
  const normalized = normalizeCampaignState(leveled);
  const learned = apply(normalized, { kind: "learn_spell", spellKey });
  expect(learned.accepted).toBe(true);
  const ready = spellKey === FIRE_BOLT
    ? learned
    : apply(learned.state, { kind: "prepare_spell", spellKey, prepared: true });
  expect(ready.accepted).toBe(true);
  const started = apply(ready.state, {
    kind: "combat_start",
    encounterId: `area-${randomUUID()}`,
    encounterName: "Reviewed Area Geometry",
    tactical: {
      frameId: "area-frame",
      bounds: { minX: -5, maxX: 25, minY: -6, maxY: 6 },
      obstacles,
      playerPosition: { frameId: "area-frame", x: 0, y: 0, z: 0 },
    },
    creatures: positions.map((position) => ({
      creatureKey: GOBLIN,
      count: 1,
      position: { frameId: "area-frame", ...position, z: 0 },
    })),
  });
  expect(started.accepted).toBe(true);
  return started.state;
}

function areaCast(state: LanternCampaignState, spellKey: string, aim: { x: number; y: number }): Extract<EngineCommand, { kind: "cast_spell" }> {
  return engineCommandSchema.parse({
    kind: "cast_spell",
    spellKey,
    targetIds: [],
    area: {
      geometryRevision: state.combat.tactical.geometry.revision,
      aim: { frameId: state.combat.tactical.geometry.frameId, ...aim, z: 0 },
    },
  }) as Extract<EngineCommand, { kind: "cast_spell" }>;
}

function fighterEncounter(positions: Array<{ x: number; y: number }>): LanternCampaignState {
  const initial = createInitialCampaign(randomUUID(), randomUUID());
  const created = apply(initial, {
    kind: "character_create",
    name: "Spatial Fighter",
    species: "human",
    className: "fighter",
  });
  const started = apply(created.state, {
    kind: "combat_start",
    encounterId: `reaction-${randomUUID()}`,
    encounterName: "Ordered Movement Reactions",
    tactical: {
      frameId: "reaction-frame",
      bounds: { minX: -4, maxX: 4, minY: -3, maxY: 3 },
      obstacles: [],
      playerPosition: { frameId: "reaction-frame", x: 0, y: 0, z: 0 },
    },
    creatures: positions.map((position) => ({
      creatureKey: GOBLIN,
      count: 1,
      position: { frameId: "reaction-frame", ...position, z: 0 },
    })),
  });
  expect(started.accepted).toBe(true);
  started.state.character.maxHp = 1_000;
  started.state.character.hp = 1_000;
  started.state.character.ac = 100;
  return started.state;
}

function move(state: LanternCampaignState, x: number, y: number): EngineCommand {
  return engineCommandSchema.parse({
    kind: "combat_move",
    geometryRevision: state.combat.tactical.geometry.revision,
    destination: { frameId: state.combat.tactical.geometry.frameId, x, y, z: 0 },
  });
}

describe("#139 tactical cover", () => {
  const position = (x: number, y: number) => ({ frameId: "cover-frame", x, y, z: 0 });
  const geometry = (obstacles: EngineTacticalGeometry["obstacles"]): EngineTacticalGeometry => ({
    frameId: "cover-frame",
    revision: 7,
    metric: "five_e_simple",
    bounds: { minX: -8, maxX: 12, minY: -8, maxY: 8 },
    obstacles,
    difficultTerrain: [],
  });

  it("derives none, half, three-quarters, and total cover from the canonical blocking cells", () => {
    expect(deriveTacticalCover(geometry([]), position(0, 0), { width: 1, height: 1 }, position(4, 0), { width: 1, height: 1 }))
      .toMatchObject({ geometryRevision: 7, level: "none", armorClassBonus: 0, blockedTargetCorners: 0 });
    expect(deriveTacticalCover(geometry([{ id: "crate", x: 1, y: 0, width: 1, height: 1 }]), position(0, 0), { width: 1, height: 1 }, position(4, 0), { width: 1, height: 1 }))
      .toMatchObject({ level: "half", armorClassBonus: 2, blockedTargetCorners: 2 });
    expect(deriveTacticalCover(geometry([
      { id: "upper-wall", x: 1, y: 1, width: 3, height: 2 },
      { id: "lower-wall", x: 1, y: -3, width: 3, height: 3 },
    ]), position(0, 0), { width: 2, height: 1 }, position(4, 2), { width: 2, height: 1 }))
      .toMatchObject({ level: "three_quarters", armorClassBonus: 5, blockedTargetCorners: 3 });
    expect(deriveTacticalCover(geometry([{ id: "wall", x: 2, y: -1, width: 1, height: 3 }]), position(0, 0), { width: 1, height: 1 }, position(4, 0), { width: 1, height: 1 }))
      .toMatchObject({ level: "total", armorClassBonus: null, blockedTargetCorners: 4 });
  });

  it("applies half cover to spell attacks and rejects total cover without mutation", () => {
    const half = wizardEncounter(FIRE_BOLT, [{ x: 4, y: 0 }], [{ id: "crate", x: 1, y: 0, width: 1, height: 1 }]);
    const halfCast = apply(half, { kind: "cast_spell", spellKey: FIRE_BOLT, targetIds: [half.combat.enemies[0]!.id] });
    expect(halfCast.accepted).toBe(true);
    expect(halfCast.data).toMatchObject({ targetResults: [{ cover: { level: "half", armorClassBonus: 2 } }] });

    const total = wizardEncounter(FIRE_BOLT, [{ x: 4, y: 0 }], [{ id: "wall", x: 2, y: -1, width: 1, height: 3 }]);
    const before = JSON.stringify(total);
    const rejected = apply(total, { kind: "cast_spell", spellKey: FIRE_BOLT, targetIds: [total.combat.enemies[0]!.id] });
    expect(rejected).toMatchObject({ accepted: false, code: "target_has_total_cover", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
  });
});

describe("#139 server-derived spell areas", () => {
  it.each([
    {
      label: "cone",
      spellKey: BURNING_HANDS,
      positions: [{ x: 1, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 2 }],
      aim: { x: 1, y: 0 },
      included: [0, 1],
      shape: "cone",
      sourceShape: "cone",
    },
    {
      label: "circle",
      spellKey: FIREBALL,
      positions: [{ x: 1, y: 0 }, { x: 9, y: 4 }, { x: 10, y: 0 }],
      aim: { x: 5, y: 0 },
      included: [0, 1],
      shape: "circle",
      sourceShape: "sphere",
    },
  ])("derives $label cells and targets from reviewed spell content", ({ spellKey, positions, aim, included, shape, sourceShape }) => {
    const state = wizardEncounter(spellKey, positions);
    const expectedIds = included.map((index) => state.combat.enemies[index]!.id);
    const cast = apply(state, areaCast(state, spellKey, aim));
    expect(cast.accepted).toBe(true);
    expect(cast.data).toMatchObject({
      area: {
        geometryRevision: state.combat.tactical.geometry.revision,
        shape,
        sourceShape,
        targetIds: expectedIds,
        programContentKey: expect.stringMatching(/^open5e:effect-program:/),
      },
      targetResults: expectedIds.map((targetId) => ({ targetId })),
    });
    for (const [index, enemy] of cast.state.combat.enemies.entries()) {
      if (!included.includes(index)) expect(enemy.hp).toBe(state.combat.enemies[index]!.hp);
    }
  });

  it("derives line cells and targets from a reviewed compiled area program", () => {
    const state = wizardEncounter(FIRE_BOLT, [{ x: 4, y: 0 }, { x: 12, y: 0 }, { x: 4, y: 1 }]);
    const dragon = getOpen5eCreature(ADULT_BLACK_DRAGON);
    const program = dragon?.effects.find((candidate) => candidate.sourceActionKey === "acid-breath");
    expect(program).toBeDefined();
    const area = deriveTacticalAreaSnapshot(
      state.combat.tactical.geometry,
      state.character.id,
      state.combat.tactical.actorPosition,
      state.combat.tactical.actorFootprint,
      state.combat.enemies,
      { frameId: state.combat.tactical.geometry.frameId, x: 1, y: 0, z: 0 },
      program!,
      60,
    );
    expect(area).toMatchObject({
      shape: "line",
      sourceShape: "line",
      sizeFeet: 60,
      widthFeet: 5,
      targetIds: [state.combat.enemies[0]!.id, state.combat.enemies[1]!.id],
      programContentKey: program!.contentKey,
    });
  });

  it("includes and damages the caster when a reviewed area contains their footprint", () => {
    const state = wizardEncounter(FIREBALL, [{ x: 1, y: 0 }]);
    const beforeHp = state.character.hp;
    const cast = apply(state, areaCast(state, FIREBALL, { x: 0, y: 0 }));
    expect(cast.accepted).toBe(true);
    expect(cast.data).toMatchObject({
      area: { targetIds: [state.character.id, state.combat.enemies[0]!.id] },
      targetResults: [
        { targetId: state.character.id, hpBefore: beforeHp, defeated: true },
        { targetId: state.combat.enemies[0]!.id },
      ],
    });
    expect(cast.state.character.hp).toBe(0);
  });

  it("rejects target spoofing, stale geometry, invalid directions, and arbitrary area fields byte-for-byte", () => {
    const state = wizardEncounter(BURNING_HANDS, [{ x: 1, y: 0 }]);
    const before = JSON.stringify(state);
    const spoofed = apply(state, {
      ...areaCast(state, BURNING_HANDS, { x: 1, y: 0 }),
      targetIds: [state.combat.enemies[0]!.id],
    });
    expect(spoofed).toMatchObject({ accepted: false, code: "area_targets_server_owned", event: null });
    expect(JSON.stringify(spoofed.state)).toBe(before);

    const staleCommand = areaCast(state, BURNING_HANDS, { x: 1, y: 0 });
    const stale = apply(state, { ...staleCommand, area: { ...staleCommand.area!, geometryRevision: 2 } });
    expect(stale).toMatchObject({ accepted: false, code: "stale_tactical_geometry", event: null });
    expect(JSON.stringify(stale.state)).toBe(before);

    const invalid = apply(state, areaCast(state, BURNING_HANDS, { x: 2, y: 1 }));
    expect(invalid).toMatchObject({ accepted: false, code: "invalid_tactical_area_direction", event: null });
    expect(JSON.stringify(invalid.state)).toBe(before);

    expect(engineCommandSchema.safeParse({
      kind: "cast_spell",
      spellKey: BURNING_HANDS,
      targetIds: [],
      area: {
        geometryRevision: 1,
        aim: { frameId: "area-frame", x: 1, y: 0, z: 0 },
        shape: "sphere",
        damage: "99d99",
      },
    }).success).toBe(false);
  });
});

describe("#139 ordered movement reactions", () => {
  it("resolves simultaneous leaving-reach triggers in stable enemy order and spends each reaction once", () => {
    const state = fighterEncounter([{ x: 1, y: 0 }, { x: 1, y: 1 }]);
    const moved = apply(state, move(state, -1, 0));
    expect(moved.accepted).toBe(true);
    expect(moved.state.combat.tactical.lastPlan?.triggers).toMatchObject([
      { enemyId: state.combat.enemies[0]!.id, segmentIndex: 1, boundary: "leaving-reach", resolution: { status: "resolved", reactionSpent: true } },
      { enemyId: state.combat.enemies[1]!.id, segmentIndex: 1, boundary: "leaving-reach", resolution: { status: "resolved", reactionSpent: true } },
    ]);
    expect(moved.state.combat.enemies.map((enemy) => enemy.reaction.spent)).toEqual([true, true]);

    const entered = apply(moved.state, move(moved.state, 0, 0));
    expect(entered.accepted).toBe(true);
    const hpBeforeSecondLeave = entered.state.character.hp;
    const leftAgain = apply(entered.state, move(entered.state, -1, 0));
    expect(leftAgain.accepted).toBe(true);
    expect(leftAgain.state.combat.tactical.lastPlan?.triggers.filter((trigger) => trigger.boundary === "leaving-reach"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ resolution: expect.objectContaining({ status: "reaction_spent", reactionSpent: false }) }),
      ]));
    expect(leftAgain.state.character.hp).toBe(hpBeforeSecondLeave);
  });

  it("reconstructs and replays one reaction-bearing move without rerolling or duplicating damage", () => {
    const state = fighterEncounter([{ x: 1, y: 0 }]);
    const command = move(state, -1, 0);
    const databasePath = join(mkdtempSync(join(tmpdir(), "lantern-spatial-reaction-")), "engine.db");
    const store = new LanternEngineStore(databasePath);
    const request = context(state);
    store.createCampaign(request, state);
    const commandId = randomUUID();
    const first = store.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "combat_move",
      resolve: (current) => resolveEngineCommand(current, request, commandId, command, "combat_move"),
    });
    expect(first.accepted).toBe(true);
    expect(first.state.combat.tactical.lastPlan?.triggers[0]?.resolution?.status).toBe("resolved");
    const normalized = normalizeCampaignState(JSON.parse(JSON.stringify(first.state)));
    expect(normalized.combat.tactical.lastPlan).toEqual(first.state.combat.tactical.lastPlan);
    expect(normalized.combat.enemies[0]!.reaction).toEqual({ available: false, spent: true });
    const events = store.listCampaignEvents(request);
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const replay = reopened.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "combat_move",
      resolve: () => { throw new Error("reaction-bearing replay re-entered the resolver"); },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(first.state);
    expect(reopened.listCampaignEvents(request)).toEqual(events);
    reopened.close();
  });

  it("refreshes enemy reactions only at the authoritative next-round boundary", () => {
    const state = fighterEncounter([{ x: 1, y: 0 }]);
    const moved = apply(state, move(state, -1, 0));
    expect(moved.state.combat.enemies[0]!.reaction.spent).toBe(true);
    const ended = apply(moved.state, { kind: "end_turn" });
    expect(ended.state.combat.enemies[0]!.reaction.spent).toBe(true);
    const enemyTurn = apply(ended.state, {
      kind: "advance_turn",
      combatantId: ended.state.combat.enemies[0]!.id,
      actionKey: "scimitar",
    });
    expect(enemyTurn.accepted).toBe(true);
    expect(enemyTurn.state.combat.round).toBe(state.combat.round + 1);
    expect(enemyTurn.state.combat.enemies[0]!.reaction).toEqual({ available: true, spent: false });
  });

  it("measures leaving reach between occupied footprint cells", () => {
    const state = fighterEncounter([{ x: 1, y: 0 }]);
    state.combat.tactical.actorPosition = { frameId: "reaction-frame", x: 3, y: 0, z: 0 };
    state.combat.enemies[0]!.footprint = { width: 2, height: 2 };
    const moved = apply(state, move(state, 4, 0));
    expect(moved.accepted).toBe(true);
    expect(moved.state.combat.tactical.lastPlan?.triggers).toMatchObject([
      {
        enemyId: state.combat.enemies[0]!.id,
        boundary: "leaving-reach",
        distanceBeforeFeet: 5,
        distanceAfterFeet: 10,
        resolution: { status: "resolved", reactionSpent: true },
      },
    ]);
  });

  it("stops the remaining path before a reaction that downs the mover", () => {
    const state = fighterEncounter([{ x: 1, y: 0 }]);
    state.character.hp = 1;
    const origin = { ...state.combat.tactical.actorPosition };
    const moved = apply(state, move(state, -2, 0));
    expect(moved).toMatchObject({ accepted: true, event: { outcome: "combat_move_interrupted" } });
    expect(moved.state.character.hp).toBe(0);
    expect(moved.state.combat.tactical.actorPosition).toEqual(origin);
    expect(moved.state.combat.turnBudget.movementFeet.spent).toBe(0);
    expect(moved.state.combat.tactical.lastPlan).toMatchObject({
      from: origin,
      to: origin,
      path: [],
      costFeet: 0,
      triggers: [{ boundary: "leaving-reach", resolution: { status: "resolved", hpAfter: 0 } }],
    });
  });
});
