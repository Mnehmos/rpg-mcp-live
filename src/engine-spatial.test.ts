import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  fiveESimpleDistanceFeet,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";
const OGRE = "open5e:creature:5e-2014:srd-2014:srd_ogre";

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, raw: unknown) {
  const command = engineCommandSchema.parse(raw);
  return resolveEngineCommand(state, context(state), randomUUID(), command, command.kind);
}

function fighter(): LanternCampaignState {
  const initial = createInitialCampaign("spatial-account", "spatial-actor");
  const created = apply(initial, {
    kind: "character_create",
    name: "Spatial Fighter",
    species: "human",
    className: "fighter",
    background: "Soldier",
    alignment: "Neutral",
  });
  expect(created.accepted).toBe(true);
  return created.state;
}

function combat(options: { blocker?: boolean; enemyX?: number; enemyY?: number } = {}): LanternCampaignState {
  const state = fighter();
  const started = apply(state, {
    kind: "combat_start",
    encounterId: "spatial-encounter",
    encounterName: "Spatial Encounter",
    tactical: {
      frameId: "frame-spatial",
      bounds: { minX: -2, maxX: 6, minY: -2, maxY: 4 },
      obstacles: options.blocker === false ? [] : [{ id: "pillar", x: 1, y: 0, width: 1, height: 1 }],
      playerPosition: { frameId: "frame-spatial", x: 0, y: 0, z: 0 },
    },
    creatures: [{
      creatureKey: GOBLIN,
      count: 1,
      position: {
        frameId: "frame-spatial",
        x: options.enemyX ?? 2,
        y: options.enemyY ?? 0,
        z: 0,
      },
    }],
  });
  expect(started.accepted).toBe(true);
  started.state.combat.enemies[0]!.hp = 100;
  started.state.combat.enemies[0]!.alive = true;
  return started.state;
}

function moveCommand(state: LanternCampaignState, destination: { x: number; y: number; z?: number }, path?: Array<{ x: number; y: number; z?: number }>): EngineCommand {
  return engineCommandSchema.parse({
    kind: "combat_move",
    geometryRevision: state.combat.tactical.geometry.revision,
    destination: { frameId: state.combat.tactical.geometry.frameId, x: destination.x, y: destination.y, z: destination.z ?? 0 },
    ...(path ? {
      path: path.map((cell) => ({ frameId: state.combat.tactical.geometry.frameId, x: cell.x, y: cell.y, z: cell.z ?? 0 })),
    } : {}),
  });
}

describe("bounded tactical movement", () => {
  it("uses five_e_simple for straight and diagonal movement and preserves the Action", () => {
    const state = combat({ blocker: false, enemyX: 4 });
    const diagonal = apply(state, moveCommand(state, { x: 1, y: 1 }));

    expect(diagonal.accepted).toBe(true);
    expect(diagonal.data).toMatchObject({ movement: { costFeet: 5, metric: "five_e_simple", path: [{ x: 1, y: 1 }] } });
    expect(diagonal.state.combat.turnBudget.movementFeet).toEqual({ available: state.character.speed, spent: 5 });
    expect(diagonal.state.combat.turnBudget.action.spent).toBe(false);
    expect(fiveESimpleDistanceFeet({ frameId: "frame-spatial", x: 0, y: 0, z: 0 }, { frameId: "frame-spatial", x: 3, y: 2, z: 0 })).toBe(15);
  });

  it("persists a Large footprint and validates its occupied cells", () => {
    const state = fighter();
    const started = apply(state, {
      kind: "combat_start",
      encounterId: "large-encounter",
      encounterName: "Large Encounter",
      tactical: {
        frameId: "frame-large",
        bounds: { minX: -2, maxX: 6, minY: -2, maxY: 4 },
        obstacles: [],
        playerPosition: { frameId: "frame-large", x: 0, y: 0, z: 0 },
      },
      creatures: [{ creatureKey: OGRE, count: 1, position: { frameId: "frame-large", x: 3, y: 0, z: 0 } }],
    });
    expect(started.accepted).toBe(true);
    expect(started.state.combat.enemies[0]!.footprint).toEqual({ width: 2, height: 2 });
    const before = JSON.stringify(started.state);
    const collision = apply(started.state, moveCommand(started.state, { x: 3, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]));
    expect(collision).toMatchObject({ accepted: false, code: "tactical_creature_collision", event: null });
    expect(JSON.stringify(collision.state)).toBe(before);
  });

  it("finds a bounded detour around a blocker and emits an ordered reach trigger", () => {
    const state = combat({ enemyX: 2, enemyY: 0 });
    const around = apply(state, moveCommand(state, { x: 3, y: 1 }));

    expect(around.accepted).toBe(true);
    expect(around.data).toMatchObject({ movement: { costFeet: 20 } });
    expect(around.state.combat.tactical.actorPosition).toEqual({ frameId: "frame-spatial", x: 3, y: 1, z: 0 });
    expect(around.state.combat.tactical.lastPlan?.path.some((cell) => cell.x === 1 && cell.y === 0)).toBe(false);
    expect(around.state.combat.turnBudget.action.spent).toBe(false);

    const afterAttack = apply(around.state, { kind: "combat_action", action: "attack", targetId: around.state.combat.enemies[0]!.id });
    expect(afterAttack.accepted).toBe(true);
    expect(afterAttack.state.combat.turnBudget.action.spent).toBe(true);
    const remaining = apply(afterAttack.state, moveCommand(afterAttack.state, { x: 4, y: 1 }));
    expect(remaining.accepted).toBe(true);
    expect(remaining.state.combat.tactical.lastPlan?.triggers).toMatchObject([{
      kind: "reach-boundary",
      enemyId: remaining.state.combat.enemies[0]!.id,
      segmentIndex: 1,
      boundary: "leaving-reach",
    }]);
    const ended = apply(remaining.state, { kind: "end_turn" });
    const enemyTurn = apply(ended.state, {
      kind: "advance_turn",
      combatantId: remaining.state.combat.enemies[0]!.id,
      actionKey: "scimitar",
    });
    expect(enemyTurn.accepted).toBe(true);
    expect(enemyTurn.state.combat.activeActorId).toBe(enemyTurn.state.actorId);
    expect(enemyTurn.state.combat.turnBudget.movementFeet).toEqual({ available: enemyTurn.state.character.speed, spent: 0 });
  });

  it("rejects z, corner cutting, insufficient movement, and stale geometry without mutation", () => {
    const state = combat({ blocker: false, enemyX: 4 });
    const zBefore = JSON.stringify(state);
    const zRejected = apply(state, moveCommand(state, { x: 1, y: 0, z: 1 }));
    expect(zRejected).toMatchObject({ accepted: false, code: "tactical_z_unsupported", event: null });
    expect(JSON.stringify(zRejected.state)).toBe(zBefore);

    const cornerState = combat({ enemyX: 4 });
    cornerState.combat.tactical.geometry.obstacles.push(
      { id: "north", x: 0, y: 1, width: 1, height: 1 },
    );
    const cornerBefore = JSON.stringify(cornerState);
    const cornerRejected = apply(cornerState, moveCommand(cornerState, { x: 1, y: 1 }, [{ x: 1, y: 1 }]));
    expect(cornerRejected).toMatchObject({ accepted: false, code: "tactical_corner_blocked", event: null });
    expect(JSON.stringify(cornerRejected.state)).toBe(cornerBefore);

    const budgetState = combat({ blocker: false, enemyX: 4 });
    budgetState.combat.turnBudget.movementFeet.available = 5;
    const budgetBefore = JSON.stringify(budgetState);
    const insufficient = apply(budgetState, moveCommand(budgetState, { x: 2, y: 0 }));
    expect(insufficient).toMatchObject({ accepted: false, code: "insufficient_movement", event: null });
    expect(JSON.stringify(insufficient.state)).toBe(budgetBefore);

    const staleState = combat({ blocker: false, enemyX: 4 });
    const staleBefore = JSON.stringify(staleState);
    const stale = apply(staleState, { ...moveCommand(staleState, { x: 1, y: 0 }), geometryRevision: 2 });
    expect(stale).toMatchObject({ accepted: false, code: "stale_tactical_geometry", event: null });
    expect(JSON.stringify(stale.state)).toBe(staleBefore);
  });

  it("derives melee reach from positions and persists split movement through restart", () => {
    const state = combat({ blocker: false, enemyX: 2 });
    const outOfRange = apply(state, { kind: "combat_action", action: "attack", targetId: state.combat.enemies[0]!.id });
    expect(outOfRange).toMatchObject({ accepted: false, code: "target_out_of_range", event: null });

    const moved = apply(state, moveCommand(state, { x: 1, y: 0 }));
    expect(moved.accepted).toBe(true);
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(moved.state)));
    expect(restarted.combat.tactical).toEqual(moved.state.combat.tactical);
    expect(restarted.combat.turnBudget).toEqual(moved.state.combat.turnBudget);
    const attack = apply(restarted, { kind: "combat_action", action: "attack", targetId: restarted.combat.enemies[0]!.id });
    expect(attack.accepted).toBe(true);
  });

  it("replays one movement exactly once and rejects a stale new command", () => {
    const state = combat({ blocker: false, enemyX: 4 });
    const command = moveCommand(state, { x: 1, y: 0 });
    const directory = mkdtempSync(join(tmpdir(), "lantern-spatial-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    const request = context(state);
    store.createCampaign({ requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId, capabilities: ["player", "dm"] }, state);
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
    const events = store.listCampaignEvents(request);
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const replay = reopened.executeCommand({
      context: request,
      clientCommandId: commandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "combat_move",
      resolve: () => { throw new Error("replay re-entered resolver"); },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(first.state);
    expect(reopened.listCampaignEvents(request)).toEqual(events);
    expect(() => reopened.executeCommand({
      context: request,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: state.version,
      command,
      tool: "combat_move",
      resolve: () => first,
    })).toThrow(EngineVersionConflictError);
    reopened.close();
  });
});
