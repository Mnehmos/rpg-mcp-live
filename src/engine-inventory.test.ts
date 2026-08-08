import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";
import type { EngineCommand, EngineInventoryItem, EngineItemKind, LanternCampaignState, RequestContext } from "./engine-contracts.js";

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
  const initial = createInitialCampaign("inventory-account", "inventory-actor");
  const created = apply(initial, { kind: "character_create", name: "Inventory Fighter", species: "human", className: "fighter" });
  expect(created.accepted).toBe(true);
  const tutorial = apply(created.state, { kind: "tutorial_advance" });
  const sandbox = apply(tutorial.state, { kind: "tutorial_advance" });
  expect(sandbox.accepted).toBe(true);
  return sandbox.state;
}

function authored(
  id: string,
  name: string,
  kind: EngineItemKind,
  weight: number,
  extra: Record<string, unknown> = {},
): EngineInventoryItem & { authoredDefinition: NonNullable<EngineInventoryItem["authoredDefinition"]> } {
  return {
    id,
    quantity: 1,
    authoredDefinition: { name, kind, weight, ...extra } as NonNullable<EngineInventoryItem["authoredDefinition"]>,
  };
}

function normalizedWith(items: EngineInventoryItem[]): LanternCampaignState {
  const state = fighter();
  state.character.inventory.push(...items);
  return normalizeCampaignState(state);
}

describe("authoritative inventory ownership and economy", () => {
  it("splits a stack into a bounded container and rejects over-capacity without mutation", () => {
    const state = normalizedWith([
      authored("test-pack", "Test pack", "tool", 1, { containerCapacity: 5 }),
      { ...authored("test-arrows", "Test arrows", "ammunition", 1), quantity: 3 },
      authored("heavy-stone", "Heavy stone", "treasure", 6),
    ]);
    const moved = apply(state, { kind: "inventory_transfer", itemId: "test-arrows", targetContainerId: "test-pack", quantity: 1 });
    expect(moved.accepted).toBe(true);
    expect(moved.state.character.inventory.filter((item) => item.id === "test-arrows")[0]?.quantity).toBe(2);
    const split = moved.state.character.inventory.find((item) => item.containerRef === "test-pack");
    expect(split).toMatchObject({ quantity: 1, ownerRef: { kind: "actor", id: moved.state.character.id } });
    expect(toSessionView(moved.state).character.inventory.find((item) => item.id === "test-pack")?.containerCapacity).toBe(5);
    expect(toSessionView(moved.state).character.derived.carryWeight).toBeGreaterThan(0);

    const before = JSON.stringify(moved.state);
    const blocked = apply(moved.state, { kind: "inventory_transfer", itemId: "heavy-stone", targetContainerId: "test-pack", quantity: 1 });
    expect(blocked.accepted).toBe(false);
    expect(blocked.code).toBe("container_capacity_exceeded");
    expect(JSON.stringify(blocked.state)).toBe(before);
    expect(blocked.event).toBeNull();
  });

  it("rejects container cycles and nesting beyond the bounded depth", () => {
    const cycleState = normalizedWith([
      authored("bag-a", "Bag A", "tool", 1, { containerCapacity: 100 }),
      authored("bag-b", "Bag B", "tool", 1, { containerCapacity: 100 }),
    ]);
    const nested = apply(cycleState, { kind: "inventory_transfer", itemId: "bag-b", targetContainerId: "bag-a", quantity: 1 });
    expect(nested.accepted, `${nested.code}: ${nested.message}`).toBe(true);
    const before = JSON.stringify(nested.state);
    const cycle = apply(nested.state, { kind: "inventory_transfer", itemId: "bag-a", targetContainerId: "bag-b", quantity: 1 });
    expect(cycle.code).toBe("container_cycle");
    expect(JSON.stringify(cycle.state)).toBe(before);

    const depthState = normalizedWith(Array.from({ length: 6 }, (_, index) => authored(`depth-${index}`, `Depth ${index}`, "tool", 1, { containerCapacity: 100 })));
    let current = depthState;
    for (let index = 1; index <= 4; index += 1) {
      const result = apply(current, { kind: "inventory_transfer", itemId: `depth-${index}`, targetContainerId: `depth-${index - 1}`, quantity: 1 });
      expect(result.accepted).toBe(true);
      current = result.state;
    }
    const tooDeep = apply(current, { kind: "inventory_transfer", itemId: "depth-5", targetContainerId: "depth-4", quantity: 1 });
    expect(tooDeep.code).toBe("container_depth_exceeded");
  });

  it("enforces shield/two-handed conflicts and keeps one item per slot", () => {
    const state = normalizedWith([
      authored("test-shield", "Test shield", "armor", 6, { armorClass: 2, properties: ["shield"] }),
      authored("test-greatsword", "Test greatsword", "weapon", 6, { damage: "2d6 slashing", properties: ["two-handed"] }),
      authored("test-dagger", "Test dagger", "weapon", 1, { damage: "1d4 piercing" }),
    ]);
    const shield = apply(state, { kind: "equip_item", itemId: "test-shield", slot: "offhand" });
    expect(shield.accepted).toBe(true);
    const before = JSON.stringify(shield.state);
    const blocked = apply(shield.state, { kind: "equip_item", itemId: "test-greatsword", slot: "mainhand" });
    expect(blocked.code).toBe("two_handed_conflict");
    expect(JSON.stringify(blocked.state)).toBe(before);
    const freeHand = apply(shield.state, { kind: "unequip_item", itemId: "test-shield" });
    const greatsword = apply(freeHand.state, { kind: "equip_item", itemId: "test-greatsword", slot: "mainhand" });
    expect(greatsword.accepted).toBe(true);
    expect(apply(greatsword.state, { kind: "equip_item", itemId: "test-shield", slot: "offhand" }).code).toBe("two_handed_conflict");
    const dagger = apply(freeHand.state, { kind: "equip_item", itemId: "test-dagger", slot: "mainhand" });
    expect(dagger.accepted).toBe(true);
    expect(dagger.state.character.inventory.filter((item) => item.equipped && item.slot === "mainhand")).toHaveLength(1);
  });

  it("closes both tier-gate bypasses without mutating rejected state", () => {
    const state = normalizedWith([
      authored("tier-one-weapon", "Unreviewed blade", "weapon", 1, { damage: "1d6 slashing", mechanicsTier: 1 }),
      authored("tier-one-potion", "Unreviewed potion", "consumable", 1, { healing: 4, mechanicsTier: 1 }),
    ]);
    const before = JSON.stringify(state);
    const equip = apply(state, { kind: "equip_item", itemId: "tier-one-weapon", slot: "mainhand" });
    expect(equip.code).toBe("content_tier_insufficient");
    expect(JSON.stringify(equip.state)).toBe(before);
    const use = apply(state, { kind: "use_item", itemId: "tier-one-potion" });
    expect(use.code).toBe("content_tier_insufficient");
    expect(JSON.stringify(use.state)).toBe(before);
  });

  it("consumes resolved ranged ammunition and rejects an attack before spending action when empty", () => {
    const base = normalizedWith([
      { ...authored("test-bow", "Test shortbow", "weapon", 2, { damage: "1d6 piercing", properties: ["ranged", "ammunition", "two-handed"], ammunitionId: "test-arrows" }), slot: "mainhand", equipped: true },
      { ...authored("test-arrows", "Test arrows", "ammunition", 0.1), quantity: 2 },
    ]);
    for (const item of base.character.inventory) {
      if (item.id !== "test-bow" && item.slot === "mainhand") item.equipped = false;
    }
    const started = apply(base, { kind: "combat_start", encounterId: "ammo-encounter", encounterName: "Ammo", creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }] });
    expect(started.accepted).toBe(true);
    const targetId = started.state.combat.enemies[0]!.id;
    const attack = apply(started.state, { kind: "combat_action", action: "attack", weaponId: "test-bow", targetId });
    expect(attack.accepted).toBe(true);
    expect(attack.state.character.inventory.find((item) => item.id === "test-arrows")?.quantity).toBe(1);

    const empty = normalizedWith([
      { ...authored("empty-bow", "Empty shortbow", "weapon", 2, { damage: "1d6 piercing", properties: ["ranged", "ammunition", "two-handed"], ammunitionId: "empty-arrows" }), slot: "mainhand", equipped: true },
      { ...authored("empty-arrows", "Empty arrows", "ammunition", 0.1), quantity: 0 },
    ]);
    for (const item of empty.character.inventory) {
      if (item.id !== "empty-bow" && item.slot === "mainhand") item.equipped = false;
    }
    const emptyStarted = apply(empty, { kind: "combat_start", encounterId: "empty-encounter", encounterName: "Empty", creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }] });
    const emptyBefore = JSON.stringify(emptyStarted.state);
    const rejected = apply(emptyStarted.state, { kind: "combat_action", action: "attack", weaponId: "empty-bow", targetId: emptyStarted.state.combat.enemies[0]!.id });
    expect(rejected.code).toBe("ammunition_unavailable");
    expect(JSON.stringify(rejected.state)).toBe(emptyBefore);
  });

  it("heals from zero through applyHealing and consumes the potion atomically", () => {
    const state = normalizedWith([authored("revival-potion", "Revival potion", "consumable", 0.5, { healing: 8 })]);
    state.character.hp = 0;
    state.character.conditions = ["unconscious"];
    state.character.deathSaveSuccesses = 2;
    state.character.deathSaveFailures = 1;
    const downed = normalizeCampaignState(state);
    const used = apply(downed, { kind: "use_item", itemId: "revival-potion" });
    expect(used.accepted).toBe(true);
    expect(used.state.character.hp).toBe(8);
    expect(used.state.character.conditions).not.toContain("unconscious");
    expect(used.state.character.deathSaveSuccesses).toBe(0);
    expect(used.state.character.deathSaveFailures).toBe(0);
    expect(used.state.character.inventory.some((item) => item.id === "revival-potion")).toBe(false);
  });

  it("assigns ownership/provenance for loot, blocks duplicate claims, and preserves replay state", () => {
    const state = fighter();
    state.combat.status = "ended";
    state.combat.activeActorId = null;
    const normalized = normalizeCampaignState(state);
    const lootCommandId = "00000000-0000-4000-8000-000000000001";
    const first = apply(normalized, { kind: "loot", items: [authored("loot-axe", "Loot axe", "weapon", 4)], rewardXp: 0, rewardCopper: 12 }, lootCommandId);
    expect(first.accepted).toBe(true);
    expect(first.state.character.inventory.find((item) => item.id === "loot-axe")).toMatchObject({
      ownerRef: { kind: "actor", id: first.state.character.id },
      provenance: { kind: "loot", sourceId: lootCommandId },
    });
    const before = JSON.stringify(first.state);
    const duplicate = apply(first.state, { kind: "loot", items: [authored("loot-second", "Second loot", "treasure", 1)], rewardXp: 0, rewardCopper: 0 }, "00000000-0000-4000-8000-000000000002");
    expect(duplicate.code).toBe("loot_claimed");
    expect(JSON.stringify(duplicate.state)).toBe(before);
  });

  it("uses server prices, ownership, and capacity as one merchant transaction", () => {
    const state = fighter();
    state.character.currency.copper = 100;
    state.worldContext = {
      id: "market-context",
      title: "Market",
      description: "A market fixture.",
      features: [],
      exits: [],
      npcs: [],
      merchants: [{
        id: "fixture-merchant",
        name: "Fixture merchant",
        description: "A merchant fixture.",
        disposition: "neutral",
        items: [{ item: authored("market-lantern", "Market lantern", "tool", 1), stock: 1, buyPriceCopper: 40, sellPriceCopper: 20 }],
      }],
      objects: [],
    };
    const ready = normalizeCampaignState(state);
    const bought = apply(ready, { kind: "merchant_trade", merchantId: "fixture-merchant", itemId: "market-lantern", side: "buy", quantity: 1 });
    expect(bought.accepted).toBe(true);
    expect(bought.state.character.currency.copper).toBe(60);
    expect(bought.state.character.inventory.find((item) => item.id === "market-lantern")).toMatchObject({ ownerRef: { kind: "actor" }, provenance: { kind: "merchant", sourceId: "fixture-merchant" } });
    const sold = apply(bought.state, { kind: "merchant_trade", merchantId: "fixture-merchant", itemId: "market-lantern", side: "sell", quantity: 1 });
    expect(sold.accepted).toBe(true);
    expect(sold.state.character.currency.copper).toBe(80);
    expect(sold.state.character.inventory.some((item) => item.id === "market-lantern")).toBe(false);

    const poor = normalizeCampaignState({ ...ready, character: { ...ready.character, currency: { copper: 0 } } });
    const before = JSON.stringify(poor);
    const rejected = apply(poor, { kind: "merchant_trade", merchantId: "fixture-merchant", itemId: "market-lantern", side: "buy", quantity: 1 });
    expect(rejected.code).toBe("insufficient_funds");
    expect(JSON.stringify(rejected.state)).toBe(before);
  });

  it("applies the reviewed Lantern Ward effect and removes it on depletion or unequip", () => {
    const state = normalizedWith([authored("lantern-ward", "Lantern Ward", "misc", 1, {
      effectKey: "lantern-ward-v1",
      isMagic: true,
      mechanicsTier: 2,
      attunementRequired: true,
    })]);
    const ward = state.character.inventory.find((item) => item.id === "lantern-ward")!;
    ward.attuned = true;
    const baseAc = state.character.ac;
    const equipped = apply(state, { kind: "equip_item", itemId: "lantern-ward", slot: "accessory" });
    expect(equipped.accepted).toBe(true);
    expect(equipped.state.character.ac).toBe(baseAc + 1);
    expect(equipped.state.effects.some((effect) => effect.status === "active" && effect.sourceRef === "item:lantern-ward")).toBe(true);
    const spent = apply(equipped.state, { kind: "use_item", itemId: "lantern-ward" });
    expect(spent.accepted).toBe(true);
    expect(spent.state.character.inventory.find((item) => item.id === "lantern-ward")?.charges).toEqual({ current: 0, max: 1 });
    expect(spent.state.character.ac).toBe(baseAc);
    expect(spent.state.effects.some((effect) => effect.status === "active" && effect.sourceRef === "item:lantern-ward")).toBe(false);
    const unequipped = apply(spent.state, { kind: "unequip_item", itemId: "lantern-ward" });
    expect(unequipped.accepted).toBe(true);
    expect(unequipped.state.effects.some((effect) => effect.status === "active" && effect.sourceRef === "item:lantern-ward")).toBe(false);
  });

  it("persists ownership, containers, quantities, and provenance across store restart and replays once", () => {
    const state = normalizedWith([
      authored("persist-pack", "Persist pack", "tool", 1, { containerCapacity: 20 }),
      { ...authored("persist-item", "Persist item", "treasure", 1), quantity: 2 },
    ]);
    const directory = mkdtempSync(join(tmpdir(), "lantern-inventory-"));
    const databasePath = join(directory, "engine.db");
    const firstStore = new LanternEngineStore(databasePath);
    const request = context(state);
    firstStore.createCampaign(request, state);
    const command: EngineCommand = { kind: "inventory_transfer", itemId: "persist-item", targetContainerId: "persist-pack", quantity: 1 };
    const clientCommandId = "persist-transfer-command";
    const first = firstStore.executeCommand({
      context: request,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "inventory_transfer",
      resolve: (current) => resolveEngineCommand(current, request, clientCommandId, command, "inventory_transfer"),
    });
    expect(first.accepted).toBe(true);
    firstStore.close();
    const reopened = new LanternEngineStore(databasePath);
    const persisted = reopened.getCampaign(request);
    expect(persisted.character.inventory.find((item) => item.containerRef === "persist-pack")).toMatchObject({ quantity: 1, ownerRef: { kind: "actor" } });
    expect(persisted.character.inventory.find((item) => item.id === "persist-item")?.quantity).toBe(1);
    expect(reopened.listCampaignEvents(request)).toHaveLength(1);
    const replay = reopened.executeCommand({
      context: request,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "inventory_transfer",
      resolve: () => { throw new Error("replay must not re-enter the resolver"); },
    });
    expect(replay.replayed).toBe(true);
    expect(reopened.listCampaignEvents(request)).toHaveLength(1);
    reopened.close();
  });
});
