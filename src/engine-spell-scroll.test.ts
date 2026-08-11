import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engineInventoryItemInputSchema, type EngineCommand, type LanternCampaignState, type RequestContext } from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";
import { materializeInventoryItem, OPEN5E_RULES_PACK_HASH } from "./open5e-rules.js";

const CURE_WOUNDS = "open5e:spell:5e-2014:srd-2014:srd_cure-wounds";
const FIRST_LEVEL_SCROLL = "open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-1st-level";
const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";
const SCROLL_EFFECT = "spell-scroll-cure-wounds-v1" as const;

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, command: EngineCommand, clientCommandId: string = randomUUID()) {
  return resolveEngineCommand(state, context(state), clientCommandId, command, command.kind);
}

function scrollInput(id = "cure-wounds-scroll", mechanicsTier: 0 | 1 | 2 = 2) {
  return {
    id,
    quantity: 1,
    authoredDefinition: {
      name: "Spell Scroll (Cure Wounds)",
      kind: "consumable" as const,
      weight: 0,
      description: "A reviewed first-level Cure Wounds scroll.",
      effectKey: SCROLL_EFFECT,
      isMagic: true,
      mechanicsTier,
    },
  };
}

function character(classKey: string, accountId: string): LanternCampaignState {
  const initial = createInitialCampaign(accountId, `${accountId}-actor`);
  const created = apply(initial, {
    kind: "character_create",
    name: "Scroll Reader",
    speciesKey: "open5e:species:5e-2014:srd-2014:srd_human",
    classKey,
    backgroundKey: "open5e:background:5e-2014:srd-2014:srd_acolyte",
    alignmentKey: "open5e:alignment:5e-2014:srd-2014:neutral",
  });
  expect(created.accepted, `${created.code}: ${created.message}`).toBe(true);
  return created.state;
}

function acquireScroll(state: LanternCampaignState, item = scrollInput()): LanternCampaignState {
  state.combat.status = "ended";
  state.combat.activeActorId = null;
  state.combat.lootClaimed = false;
  const ready = normalizeCampaignState(state);
  const looted = apply(ready, { kind: "loot", items: [item], rewardXp: 0, rewardCopper: 0 }, "scroll-loot-command");
  expect(looted.accepted, `${looted.code}: ${looted.message}`).toBe(true);
  return looted.state;
}

function startDamagedCombat(state: LanternCampaignState): LanternCampaignState {
  const started = apply(state, {
    kind: "combat_start",
    encounterId: "scroll-encounter",
    encounterName: "Scroll Evidence",
    creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
  });
  expect(started.accepted, `${started.code}: ${started.message}`).toBe(true);
  started.state.character.hp = Math.max(1, started.state.character.maxHp - 5);
  return normalizeCampaignState(started.state);
}

function eligibleScrollCombat(accountId = "scroll-cleric"): LanternCampaignState {
  return startDamagedCombat(acquireScroll(character(
    "open5e:class:5e-2014:srd-2014:srd_cleric",
    accountId,
  )));
}

describe("reviewed spell scroll execution", () => {
  it("uses ordinary loot and Cure Wounds authority, then heals and consumes atomically without spending a slot", () => {
    const state = eligibleScrollCombat();
    const scroll = state.character.inventory.find((item) => item.id === "cure-wounds-scroll")!;
    expect(scroll).toMatchObject({
      quantity: 1,
      ownerRef: { kind: "actor", id: state.character.id },
      provenance: { kind: "loot", sourceId: "scroll-loot-command" },
      authoredDefinition: {
        effectKey: SCROLL_EFFECT,
        spellScroll: {
          policyRevision: "spell-scroll-v1",
          sourceItemContentKey: FIRST_LEVEL_SCROLL,
          spellContentKey: CURE_WOUNDS,
          packHash: OPEN5E_RULES_PACK_HASH,
          activationPolicy: "class-list-v1",
        },
      },
    });
    const hpBefore = state.character.hp;
    const slotsBefore = { ...state.character.spellcasting!.slots };

    const used = apply(state, { kind: "use_item", itemId: scroll.id }, "use-reviewed-scroll");

    expect(used).toMatchObject({ accepted: true, event: { outcome: "spell_scroll_used" } });
    expect(used.state.character.hp).toBeGreaterThan(hpBefore);
    expect(used.state.character.spellcasting!.slots).toEqual(slotsBefore);
    expect(used.state.character.inventory.some((item) => item.id === scroll.id)).toBe(false);
    expect(used.state.combat.turnBudget.action.spent).toBe(true);
    expect(used.state.combat.activeActorId).not.toBe(state.actorId);
    expect(used.data).toMatchObject({
      resource: { kind: "spell-scroll", policyRevision: "spell-scroll-v1", activationPolicy: "class-list-v1" },
      item: { id: scroll.id, provenance: { kind: "loot", sourceId: "scroll-loot-command" } },
      sourceItem: { contentKey: FIRST_LEVEL_SCROLL, packHash: OPEN5E_RULES_PACK_HASH },
      spellReference: { contentKey: CURE_WOUNDS, packHash: OPEN5E_RULES_PACK_HASH },
      effectKind: "healing",
      slotLevel: null,
    });
    expect(used.event!.contentKeys).toEqual(expect.arrayContaining([FIRST_LEVEL_SCROLL, CURE_WOUNDS]));
    expect(used.event!.stateChanges.map((change) => change.path)).toEqual(expect.arrayContaining([
      "/character/hp",
      "/character/inventory",
      "/combat/turnBudget/action/spent",
    ]));
  });

  it("rejects a wrong class and a full-health target without changing any state", () => {
    const wizard = startDamagedCombat(acquireScroll(character(
      "open5e:class:5e-2014:srd-2014:srd_wizard",
      "scroll-wizard",
    )));
    const wizardBefore = JSON.stringify(wizard);
    const wrongClass = apply(wizard, { kind: "use_item", itemId: "cure-wounds-scroll" });
    expect(wrongClass).toMatchObject({ accepted: false, code: "spell_not_on_class_list", event: null });
    expect(JSON.stringify(wrongClass.state)).toBe(wizardBefore);

    const full = eligibleScrollCombat("scroll-full-health");
    full.character.hp = full.character.maxHp;
    const normalized = normalizeCampaignState(full);
    const fullBefore = JSON.stringify(normalized);
    const rejected = apply(normalized, { kind: "use_item", itemId: "cure-wounds-scroll" });
    expect(rejected).toMatchObject({ accepted: false, code: "already_full_health", event: null });
    expect(JSON.stringify(rejected.state)).toBe(fullBefore);
  });

  it("rejects unreviewed, tier-one, and stale-pack scroll mechanics without mutation", () => {
    const tierOne = startDamagedCombat(acquireScroll(character(
      "open5e:class:5e-2014:srd-2014:srd_cleric",
      "scroll-tier-one",
    ), scrollInput("tier-one-scroll", 1)));
    const tierOneBefore = JSON.stringify(tierOne);
    const blockedTier = apply(tierOne, { kind: "use_item", itemId: "tier-one-scroll" });
    expect(blockedTier).toMatchObject({ accepted: false, code: "content_tier_insufficient", event: null });
    expect(JSON.stringify(blockedTier.state)).toBe(tierOneBefore);

    const unreviewed = eligibleScrollCombat("scroll-unreviewed");
    const unreviewedItem = unreviewed.character.inventory.find((item) => item.id === "cure-wounds-scroll")!;
    unreviewedItem.authoredDefinition = {
      name: "Unreviewed scroll",
      kind: "consumable",
      weight: 0,
      mechanicsTier: 2,
    };
    const unreviewedState = normalizeCampaignState(unreviewed);
    const unreviewedBefore = JSON.stringify(unreviewedState);
    const blockedUnreviewed = apply(unreviewedState, { kind: "use_item", itemId: unreviewedItem.id });
    expect(blockedUnreviewed).toMatchObject({ accepted: false, code: "content_tier_insufficient", event: null });
    expect(JSON.stringify(blockedUnreviewed.state)).toBe(unreviewedBefore);

    const stale = eligibleScrollCombat("scroll-stale-pack");
    const staleItem = stale.character.inventory.find((item) => item.id === "cure-wounds-scroll")!;
    staleItem.authoredDefinition!.spellScroll!.packHash = "0".repeat(64);
    const staleState = normalizeCampaignState(stale);
    const staleBefore = JSON.stringify(staleState);
    const blockedStale = apply(staleState, { kind: "use_item", itemId: staleItem.id });
    expect(blockedStale).toMatchObject({ accepted: false, code: "content_pack_mismatch", event: null });
    expect(JSON.stringify(blockedStale.state)).toBe(staleBefore);
  });

  it("lets callers select only the reviewed effect key, never executable scroll fields", () => {
    const callerAuthoredMechanics = engineInventoryItemInputSchema.safeParse({
      ...scrollInput("forged-scroll"),
      authoredDefinition: {
        ...scrollInput("forged-scroll").authoredDefinition,
        spellScroll: {
          policyRevision: "spell-scroll-v1",
          sourceItemContentKey: "open5e:magic-item:forged",
          spellContentKey: "open5e:spell:forged",
          packHash: "0".repeat(64),
          activationPolicy: "class-list-v1",
        },
      },
    });
    expect(callerAuthoredMechanics.success).toBe(false);
    expect(engineInventoryItemInputSchema.safeParse({
      ...scrollInput("arbitrary-scroll"),
      authoredDefinition: {
        ...scrollInput("arbitrary-scroll").authoredDefinition,
        effectKey: "spell-scroll-any-spell-v1",
      },
    }).success).toBe(false);
  });

  it("preserves the derived pin across restart and replays one accepted use without rehealing or reconsuming", () => {
    const state = eligibleScrollCombat("scroll-restart");
    const directory = mkdtempSync(join(tmpdir(), "lantern-spell-scroll-"));
    const databasePath = join(directory, "engine.db");
    const request = context(state);
    const initialStore = new LanternEngineStore(databasePath);
    initialStore.createCampaign(request, state);
    initialStore.close();

    const reopened = new LanternEngineStore(databasePath);
    const persisted = reopened.getCampaign(request);
    expect(materializeInventoryItem(persisted.character.inventory.find((item) => item.id === "cure-wounds-scroll")!)).toMatchObject({
      spellScroll: {
        sourceItemContentKey: FIRST_LEVEL_SCROLL,
        spellContentKey: CURE_WOUNDS,
        packHash: OPEN5E_RULES_PACK_HASH,
      },
    });
    const command: EngineCommand = { kind: "use_item", itemId: "cure-wounds-scroll" };
    const clientCommandId = "restart-scroll-use";
    const first = reopened.executeCommand({
      context: request,
      clientCommandId,
      expectedCampaignVersion: persisted.version,
      command,
      tool: "use_item",
      resolve: (current) => resolveEngineCommand(current, request, clientCommandId, command, "use_item"),
    });
    expect(first).toMatchObject({ accepted: true, replayed: false, event: { outcome: "spell_scroll_used" } });
    const hpAfter = first.state.character.hp;
    expect(first.state.character.inventory.some((item) => item.id === "cure-wounds-scroll")).toBe(false);
    expect(reopened.listCampaignEvents(request)).toHaveLength(1);
    reopened.close();

    const afterUseRestart = new LanternEngineStore(databasePath);
    const persistedAfterUse = afterUseRestart.getCampaign(request);
    expect(persistedAfterUse.character.hp).toBe(hpAfter);
    expect(persistedAfterUse.character.inventory.some((item) => item.id === "cure-wounds-scroll")).toBe(false);
    expect(afterUseRestart.listCampaignEvents(request)).toHaveLength(1);

    const replay = afterUseRestart.executeCommand({
      context: request,
      clientCommandId,
      expectedCampaignVersion: persisted.version,
      command,
      tool: "use_item",
      resolve: () => { throw new Error("replay must not re-enter the resolver"); },
    });
    expect(replay).toMatchObject({ accepted: true, replayed: true });
    expect(replay.state.character.hp).toBe(hpAfter);
    expect(replay.state.character.inventory.some((item) => item.id === "cure-wounds-scroll")).toBe(false);
    expect(afterUseRestart.listCampaignEvents(request)).toHaveLength(1);
    afterUseRestart.close();
  });
});
