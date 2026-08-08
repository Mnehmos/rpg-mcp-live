import { randomUUID } from "node:crypto";
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
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";

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
  const initial = createInitialCampaign("lifecycle-account", "lifecycle-actor");
  const created = apply(initial, { kind: "character_create", name: "Lifecycle Fighter", species: "human", className: "fighter" });
  expect(created.accepted).toBe(true);
  const tutorial = apply(created.state, { kind: "tutorial_advance" });
  const sandbox = apply(tutorial.state, { kind: "tutorial_advance" });
  expect(sandbox.accepted).toBe(true);
  return sandbox.state;
}

function dyingState(): LanternCampaignState {
  const state = fighter();
  state.character.hp = 0;
  state.character.lifecycleState = "dying";
  state.character.deathRecord = {
    source: "damage",
    sourceCommandId: randomUUID(),
    sourceVersion: state.version,
    occurredAt: new Date().toISOString(),
  };
  state.character.conditions = ["unconscious"];
  state.character.deathSaveSuccesses = 0;
  state.character.deathSaveFailures = 0;
  return normalizeCampaignState(state);
}

describe("authoritative actor death and recovery lifecycle", () => {
  it("pins natural 1 to two failures and natural 20 to one healing HP", () => {
    const naturalOne = dyingState();
    queuedRolls.push(1);
    const failed = apply(naturalOne, { kind: "death_save" });
    expect(failed.accepted).toBe(true);
    expect(failed.state.character.lifecycleState).toBe("dying");
    expect(failed.state.character.deathSaveFailures).toBe(2);
    expect(failed.event?.outcome).toBe("death_save_natural_1");

    const naturalTwenty = dyingState();
    queuedRolls.push(20);
    const recovered = apply(naturalTwenty, { kind: "death_save" });
    expect(recovered.accepted).toBe(true);
    expect(recovered.state.character.hp).toBe(1);
    expect(recovered.state.character.lifecycleState).toBe("conscious");
    expect(recovered.state.character.conditions).not.toContain("unconscious");
    expect(recovered.state.character.deathSaveSuccesses).toBe(0);
    expect(recovered.state.character.deathSaveFailures).toBe(0);
  });

  it("creates one corpse and transfers item ownership after the third failure", () => {
    const state = dyingState();
    state.character.deathSaveFailures = 2;
    const beforeInventory = [...state.character.inventory];
    queuedRolls.push(2);
    const deathSaveId = randomUUID();
    const dead = apply(state, { kind: "death_save" }, deathSaveId);
    expect(dead.accepted).toBe(true);
    expect(dead.state.character.lifecycleState).toBe("dead");
    expect(dead.state.character.hp).toBe(0);
    expect(dead.state.combat.status).toBe("ended");
    expect(dead.state.corpses).toHaveLength(1);
    expect(dead.state.character.inventory).toEqual([]);
    expect(dead.state.corpses[0]).toMatchObject({
      formerActorId: state.character.id,
      status: "lootable",
      inventory: beforeInventory.map((item) => expect.objectContaining({
        id: item.id,
        ownerRef: expect.objectContaining({ kind: "world" }),
      })),
    });

    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(dead.state)) as LanternCampaignState);
    expect(restarted.character.lifecycleState).toBe("dead");
    expect(restarted.character.corpseId).toBe(dead.state.character.corpseId);
    expect(restarted.corpses).toEqual(dead.state.corpses);
    expect(restarted.effects.some((effect) => effect.definitionKey === "condition:dead" && effect.status === "active")).toBe(true);

    const replayed = apply(dead.state, { kind: "death_save" }, deathSaveId);
    expect(replayed.accepted).toBe(false);
    expect(replayed.code).toBe("actor_dead");
    expect(JSON.stringify(replayed.state)).toBe(JSON.stringify(dead.state));
    expect(replayed.event).toBeNull();

    const serialized = JSON.stringify(dead.state);
    const rejected = apply(dead.state, { kind: "rest", restType: "long" });
    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("actor_dead");
    expect(JSON.stringify(rejected.state)).toBe(serialized);
    expect(rejected.event).toBeNull();
  });

  it("applies a critical hit at 0 HP as two failures without creating a duplicate corpse", () => {
    let state = fighter();
    const started = apply(state, {
      kind: "combat_start",
      encounterId: "lifecycle-encounter",
      encounterName: "Lifecycle encounter",
      creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
    });
    expect(started.accepted).toBe(true);
    state = started.state;
    state.character.hp = 0;
    state.character.lifecycleState = "dying";
    state.character.conditions = ["unconscious"];
    state = normalizeCampaignState(state);
    const endedTurn = apply(state, { kind: "end_turn" });
    expect(endedTurn.accepted).toBe(true);
    queuedRolls.push(20);
    const incoming = apply(endedTurn.state, { kind: "advance_turn", combatantId: endedTurn.state.combat.enemies[0]!.id, actionKey: "scimitar" });
    expect(incoming.accepted).toBe(true);
    expect(incoming.state.character.deathSaveFailures).toBe(2);
    expect(incoming.state.character.lifecycleState).toBe("dying");
    expect(incoming.state.corpses).toHaveLength(0);
  });

  it("drops stability when damage reaches an already-stable actor at 0 HP", () => {
    let state = dyingState();
    queuedRolls.push(10, 10, 10);
    state = apply(state, { kind: "death_save" }).state;
    state = apply(state, { kind: "death_save" }).state;
    state = apply(state, { kind: "death_save" }).state;
    expect(state.character.lifecycleState).toBe("stable");
    expect(state.character.deathSaveSuccesses).toBe(3);

    const started = apply(state, {
      kind: "combat_start",
      encounterId: "stable-encounter",
      encounterName: "Stable encounter",
      creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
    });
    state = started.state;
    const endedTurn = apply(state, { kind: "end_turn" });
    queuedRolls.push(20);
    const incoming = apply(endedTurn.state, { kind: "advance_turn", combatantId: endedTurn.state.combat.enemies[0]!.id, actionKey: "scimitar" });
    expect(incoming.accepted).toBe(true);
    expect(incoming.state.character.deathSaveSuccesses).toBe(0);
    expect(incoming.state.character.deathSaveFailures).toBe(2);
    expect(incoming.state.character.lifecycleState).toBe("dying");
  });

  it("rejects dead actor actions and recovers corpse inventory exactly once through DM loot", () => {
    const state = dyingState();
    state.character.deathSaveFailures = 2;
    queuedRolls.push(2);
    const dead = apply(state, { kind: "death_save" });
    const blocked = apply(dead.state, { kind: "use_item", itemId: "ration" });
    expect(blocked.code).toBe("actor_dead");
    expect(blocked.event).toBeNull();

    const recipient = normalizeCampaignState({
      ...dead.state,
      character: { ...dead.state.character, hp: 1, lifecycleState: "conscious", conditions: [], corpseId: null },
      effects: dead.state.effects.filter((effect) => !effect.operations.some((operation) => operation.kind === "condition" && operation.condition === "dead" && operation.action === "apply")),
    });
    const corpseId = recipient.corpses[0]!.id;
    const recovered = apply(recipient, { kind: "loot", corpseId, items: [], rewardXp: 0, rewardCopper: 0 });
    expect(recovered.accepted).toBe(true);
    expect(recovered.state.corpses[0]!.status).toBe("looted");
    expect(recovered.state.corpses[0]!.inventory).toEqual([]);
    expect(recovered.state.character.inventory.length).toBeGreaterThan(0);
    const before = JSON.stringify(recovered.state);
    const duplicate = apply(recovered.state, { kind: "loot", corpseId, items: [], rewardXp: 0, rewardCopper: 0 });
    expect(duplicate.code).toBe("corpse_looted");
    expect(JSON.stringify(duplicate.state)).toBe(before);
  });

  it("keeps a producer-backed poison effect through rest until its duration expires", () => {
    const state = fighter();
    const poisoned = apply(state, {
      kind: "improvise",
      title: "Venom takes hold",
      description: "A reviewed poison marker takes hold.",
      effectType: "condition",
      condition: "poisoned",
      durationRounds: 2,
    });
    expect(poisoned.accepted).toBe(true);
    expect(poisoned.state.character.conditions).toContain("poisoned");
    const rested = apply(poisoned.state, { kind: "rest", restType: "short" });
    expect(rested.accepted).toBe(true);
    expect(rested.state.character.conditions).toContain("poisoned");
  });
});
