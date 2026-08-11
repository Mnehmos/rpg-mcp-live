import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queuedRolls = vi.hoisted(() => [] as number[]);
const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => queuedRolls.shift() ?? max - 1));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import {
  engineCommandSchema,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { commandForTool, parseToolArguments } from "./engine-tools.js";
import { ruinedGatehouseWorldContextCommand } from "./world-object-fixture.js";

function context(state: LanternCampaignState, capabilities: RequestContext["capabilities"] = ["player", "dm"]): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities,
  };
}

function apply(state: LanternCampaignState, raw: unknown, clientCommandId = randomUUID()) {
  const command = engineCommandSchema.parse(raw);
  return resolveEngineCommand(state, context(state), clientCommandId, command, command.kind);
}

function livingState(species = "human"): LanternCampaignState {
  const initial = createInitialCampaign("remains-account", "remains-actor");
  const legacySpecies = species.toLocaleLowerCase("en-US") === "dragonborn" ? "human" : species;
  const created = apply(initial, {
    kind: "character_create",
    name: "Remains Tester",
    species: legacySpecies,
    className: "fighter",
    background: "Acolyte",
    alignment: "Neutral",
  });
  if (!created.accepted) throw new Error(`character fixture failed: ${created.code}`);
  const tutorial = apply(created.state, { kind: "tutorial_advance" });
  const sandbox = apply(tutorial.state, { kind: "tutorial_advance" });
  if (!sandbox.accepted) throw new Error(`tutorial fixture failed: ${sandbox.code}`);
  if (species.toLocaleLowerCase("en-US") === "dragonborn") sandbox.state.character.species = "Dragonborn";
  return normalizeCampaignState(sandbox.state);
}

function kill(state = livingState()): LanternCampaignState {
  state.character.hp = 0;
  state.character.lifecycleState = "dying";
  state.character.conditions = ["unconscious"];
  state.character.deathSaveSuccesses = 0;
  state.character.deathSaveFailures = 2;
  const dying = normalizeCampaignState(state);
  queuedRolls.push(2);
  const dead = apply(dying, { kind: "death_save" });
  if (!dead.accepted) throw new Error(`death fixture failed: ${dead.code}`);
  return dead.state;
}

function revive(dead: LanternCampaignState): LanternCampaignState {
  return normalizeCampaignState({
    ...dead,
    character: {
      ...dead.character,
      hp: 1,
      lifecycleState: "conscious",
      conditions: [],
      corpseId: null,
    },
    effects: dead.effects.filter((effect) => effect.definitionKey !== "condition:dead"),
  });
}

function advanceToDecay(state: LanternCampaignState) {
  const staged = structuredClone(state);
  const remains = staged.corpses[0]!;
  staged.time.gameTime.totalMinutes = remains.decay.decaysAtMinutes - 60;
  staged.time.rest.lastCompletedAtMinutes = null;
  const normalized = normalizeCampaignState(staged);
  queuedRolls.push(1);
  return apply(normalized, { kind: "rest", restType: "short" });
}

describe("ordinary remains lifecycle", () => {
  beforeEach(() => {
    queuedRolls.length = 0;
    deterministicRandomInt.mockClear();
  });

  it("keeps decay, yield, and cleanup outcomes outside caller authority", () => {
    const parsed = parseToolArguments("remains_action", {
      remainsId: "remains-1",
      action: "loot",
      itemId: "item-1",
    });
    expect(commandForTool("remains_action", parsed)).toEqual({
      kind: "remains_action",
      remainsId: "remains-1",
      action: "loot",
      itemId: "item-1",
    });
    expect(() => parseToolArguments("remains_action", { remainsId: "remains-1", action: "loot" })).toThrow();
    expect(() => parseToolArguments("remains_action", { remainsId: "remains-1", action: "harvest", itemId: "invented" })).toThrow();
    expect(() => parseToolArguments("remains_action", {
      remainsId: "remains-1",
      action: "cleanup",
      decayState: "decayed",
    })).toThrow();
    expect(() => engineCommandSchema.parse({
      kind: "remains_action",
      remainsId: "remains-1",
      action: "harvest",
      yield: { name: "Caller-authored scale", quantity: 99 },
    })).toThrow();
  });

  it("creates one stable, source-linked remains record and snapshots the reviewed decay environment", () => {
    const state = livingState("dragonborn");
    state.time.survival.weather = "storm";
    const beforeInventory = structuredClone(state.character.inventory);
    const dead = kill(state);
    const remains = dead.corpses[0]!;
    expect(dead.corpses).toHaveLength(1);
    expect(dead.character.inventory).toEqual([]);
    expect(dead.character.corpseId).toBe(remains.id);
    expect(remains).toMatchObject({
      formerActorId: dead.character.id,
      formerActorName: "Remains Tester",
      formerActorSpecies: "Dragonborn",
      locationRef: dead.worldContext?.id ?? null,
      status: "lootable",
      decay: {
        profileId: "ordinary-remains-v1",
        environment: "storm",
        state: "fresh",
        createdAtMinutes: dead.time.gameTime.totalMinutes,
        decaysAtMinutes: dead.time.gameTime.totalMinutes + 1_440,
        transitionedAtMinutes: null,
      },
      harvest: { profileId: "dragonborn-scale-v1", status: "eligible" },
      cleanup: { status: "present" },
    });
    expect(remains.inventory).toEqual(beforeInventory.map((item) => expect.objectContaining({
      id: item.id,
      ownerRef: { kind: "world", id: remains.id },
      equipped: false,
    })));
    expect(normalizeCampaignState(structuredClone(dead)).corpses).toEqual(dead.corpses);
  });

  it("loots exactly one existing item, preserves container topology, and rejects a second transfer without mutation", () => {
    const recipient = revive(kill());
    const remainsId = recipient.corpses[0]!.id;
    recipient.corpses[0]!.inventory.push(
      {
        id: "remains-pack",
        quantity: 1,
        authoredDefinition: { name: "Remains pack", kind: "tool", weight: 1, containerCapacity: 20 },
        ownerRef: { kind: "world", id: remainsId },
        provenance: { kind: "authored", sourceId: "fixture:remains-pack" },
      },
      {
        id: "remains-pack-item",
        quantity: 1,
        authoredDefinition: { name: "Packed keepsake", kind: "misc", weight: 0.1 },
        ownerRef: { kind: "world", id: remainsId },
        containerRef: "remains-pack",
        provenance: { kind: "authored", sourceId: "fixture:remains-pack-item" },
      },
    );
    const state = normalizeCampaignState(recipient);
    const blockedBefore = JSON.stringify(state);
    const blocked = apply(state, { kind: "remains_action", remainsId, action: "loot", itemId: "remains-pack" });
    expect(blocked.accepted).toBe(false);
    expect(blocked.code).toBe("remains_container_not_empty");
    expect(JSON.stringify(blocked.state)).toBe(blockedBefore);

    const commandId = randomUUID();
    const recovered = apply(state, { kind: "remains_action", remainsId, action: "loot", itemId: "remains-pack-item" }, commandId);
    expect(recovered.accepted).toBe(true);
    expect(recovered.state.corpses[0]!.inventory.some((item) => item.id === "remains-pack-item")).toBe(false);
    expect(recovered.state.character.inventory.find((item) => item.id === "remains-pack-item")).toMatchObject({
      ownerRef: { kind: "actor", id: state.character.id },
      provenance: { kind: "loot", sourceId: commandId },
    });
    const beforeDuplicate = JSON.stringify(recovered.state);
    const duplicate = apply(recovered.state, { kind: "remains_action", remainsId, action: "loot", itemId: "remains-pack-item" });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.code).toBe("remains_item_not_found");
    expect(JSON.stringify(duplicate.state)).toBe(beforeDuplicate);
  });

  it("derives the sole reviewed dragonborn harvest exactly once and rejects ineligible remains", () => {
    const dragonborn = revive(kill(livingState("dragonborn")));
    const remainsId = dragonborn.corpses[0]!.id;
    const commandId = randomUUID();
    const harvested = apply(dragonborn, { kind: "remains_action", remainsId, action: "harvest" }, commandId);
    expect(harvested.accepted).toBe(true);
    const resourceId = `harvest:${remainsId}:dragonborn-scale-v1`;
    expect(harvested.state.corpses[0]!.harvest).toEqual({
      profileId: "dragonborn-scale-v1",
      status: "harvested",
      resourceItemId: resourceId,
      harvestedAtMinutes: harvested.state.time.gameTime.totalMinutes,
      sourceCommandId: commandId,
    });
    expect(harvested.state.character.inventory.find((item) => item.id === resourceId)).toMatchObject({
      quantity: 1,
      authoredDefinition: {
        name: "Preserved dragonborn scale",
        properties: ["harvested-resource", "dragonborn-scale", "recipe:dragonborn-scale-v1"],
      },
      provenance: { kind: "harvest", sourceId: remainsId },
    });
    const beforeSecond = JSON.stringify(harvested.state);
    const second = apply(harvested.state, { kind: "remains_action", remainsId, action: "harvest" });
    expect(second.code).toBe("remains_harvested");
    expect(JSON.stringify(second.state)).toBe(beforeSecond);

    const human = revive(kill(livingState("human")));
    const beforeHuman = JSON.stringify(human);
    const rejected = apply(human, { kind: "remains_action", remainsId: human.corpses[0]!.id, action: "harvest" });
    expect(rejected.code).toBe("remains_harvest_ineligible");
    expect(JSON.stringify(rejected.state)).toBe(beforeHuman);
  });

  it("advances decay only through authoritative game time, then performs explicit durable cleanup", () => {
    const recipient = revive(kill());
    const remainsId = recipient.corpses[0]!.id;
    const beforeEarly = JSON.stringify(recipient);
    const early = apply(recipient, { kind: "remains_action", remainsId, action: "cleanup" });
    expect(early.code).toBe("remains_not_decayed");
    expect(JSON.stringify(early.state)).toBe(beforeEarly);

    const advanced = advanceToDecay(recipient);
    expect(advanced.accepted).toBe(true);
    const decayed = advanced.state.corpses[0]!;
    expect(decayed.decay.state).toBe("decayed");
    expect(decayed.decay.transitionedAtMinutes).toBe(decayed.decay.decaysAtMinutes);
    expect(advanced.event?.stateChanges).toContainEqual(expect.objectContaining({ path: `/corpses/${remainsId}/decay` }));
    const lateLoot = apply(advanced.state, {
      kind: "remains_action",
      remainsId,
      action: "loot",
      itemId: decayed.inventory[0]!.id,
    });
    expect(lateLoot.code).toBe("remains_decayed");

    const retainedInventory = structuredClone(decayed.inventory);
    const retainedProvenance = structuredClone(decayed.provenance);
    const cleanupId = randomUUID();
    const cleaned = apply(advanced.state, { kind: "remains_action", remainsId, action: "cleanup" }, cleanupId);
    expect(cleaned.accepted).toBe(true);
    expect(cleaned.state.corpses[0]!.cleanup).toEqual({
      status: "removed",
      removedAtMinutes: cleaned.state.time.gameTime.totalMinutes,
      sourceCommandId: cleanupId,
    });
    expect(cleaned.state.corpses[0]!.inventory).toEqual(retainedInventory);
    expect(cleaned.state.corpses[0]!.provenance).toEqual(retainedProvenance);
    expect(normalizeCampaignState(structuredClone(cleaned.state)).corpses).toEqual(cleaned.state.corpses);
    const beforeRepeat = JSON.stringify(cleaned.state);
    const repeated = apply(cleaned.state, { kind: "remains_action", remainsId, action: "cleanup" });
    expect(repeated.code).toBe("remains_removed");
    expect(JSON.stringify(repeated.state)).toBe(beforeRepeat);
  });

  it("moves inventory-backed world objects into remains and blocks cleanup of a critical object", () => {
    const base = livingState();
    const world = apply(base, ruinedGatehouseWorldContextCommand());
    if (!world.accepted) throw new Error(`world fixture failed: ${world.code}`);
    const taken = apply(world.state, {
      kind: "interact",
      targetId: "gatehouse-clue",
      affordance: "take",
      goal: "Take the critical clue.",
    });
    if (!taken.accepted) throw new Error(`take fixture failed: ${taken.code}`);
    const dead = kill(taken.state);
    const remainsId = dead.corpses[0]!.id;
    expect(dead.corpses[0]!.inventory.some((item) => item.id === "gatehouse-clue")).toBe(true);
    expect(dead.worldContext?.objects.find((object) => object.id === "gatehouse-clue")).toMatchObject({
      ownerRef: { kind: "world", id: dead.worldContext?.id },
      containerRef: null,
      state: "hidden",
    });
    const revived = revive(dead);
    const unrelated = apply(revived, {
      kind: "interact",
      targetId: "gatehouse-door",
      affordance: "inspect",
      goal: "Confirm the remaining world-object topology.",
    });
    expect(unrelated.accepted).toBe(true);
    const beforeDirect = JSON.stringify(revived);
    const direct = apply(revived, {
      kind: "interact",
      targetId: "gatehouse-clue",
      affordance: "take",
      goal: "Bypass the remains ledger.",
    });
    expect(direct.code).toBe("object_in_remains");
    expect(JSON.stringify(direct.state)).toBe(beforeDirect);

    const recovered = apply(revived, {
      kind: "remains_action",
      remainsId,
      action: "loot",
      itemId: "gatehouse-clue",
    });
    expect(recovered.accepted).toBe(true);
    expect(recovered.state.worldContext?.objects.find((object) => object.id === "gatehouse-clue")).toMatchObject({
      ownerRef: { kind: "actor", id: revived.character.id },
      containerRef: null,
      state: "carried",
    });

    const advanced = advanceToDecay(revived);
    expect(advanced.accepted).toBe(true);
    const before = JSON.stringify(advanced.state);
    const blocked = apply(advanced.state, { kind: "remains_action", remainsId, action: "cleanup" });
    expect(blocked.code).toBe("critical_object_requires_recovery");
    expect(blocked.data).toMatchObject({ objectId: "gatehouse-clue" });
    expect(JSON.stringify(blocked.state)).toBe(before);
  });

  it("allows DM cleanup after death without reopening ordinary character actions", () => {
    const dead = kill();
    const remains = dead.corpses[0]!;
    remains.decay.state = "decayed";
    remains.decay.transitionedAtMinutes = remains.decay.decaysAtMinutes;
    const normalized = normalizeCampaignState(dead);
    const cleanupCommand = engineCommandSchema.parse({ kind: "remains_action", remainsId: remains.id, action: "cleanup" });
    const beforePlayerAttempt = JSON.stringify(normalized);
    const playerOnly = resolveEngineCommand(
      normalized,
      context(normalized, ["player"]),
      randomUUID(),
      cleanupCommand,
      "remains_action",
    );
    expect(playerOnly.code).toBe("dm_required");
    expect(JSON.stringify(playerOnly.state)).toBe(beforePlayerAttempt);
    const cleaned = apply(normalized, { kind: "remains_action", remainsId: remains.id, action: "cleanup" });
    expect(cleaned.accepted).toBe(true);
    expect(cleaned.state.character.lifecycleState).toBe("dead");
    expect(cleaned.state.corpses[0]!.cleanup.status).toBe("removed");
    expect(apply(cleaned.state, { kind: "rest", restType: "long" }).code).toBe("actor_dead");
  });
});
