import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  deriveActionOffers,
  deriveWeaponAttack,
  normalizeCampaignState,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import type { EngineCommand, RequestContext } from "./engine-contracts.js";

function context(state: ReturnType<typeof createInitialCampaign>): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: ReturnType<typeof createInitialCampaign>, command: EngineCommand) {
  const request = context(state);
  return resolveEngineCommand(state, request, randomUUID(), command, command.kind === "end_turn" ? "end_turn" : command.kind);
}

function fighter() {
  const state = createInitialCampaign("action-account", "action-actor");
  const created = apply(state, { kind: "character_create", name: "Action Fighter", species: "human", className: "fighter" }).state;
  const firstTutorial = apply(created, { kind: "tutorial_advance" }).state;
  return apply(firstTutorial, { kind: "tutorial_advance" }).state;
}

function encounter() {
  return apply(fighter(), {
    kind: "combat_start",
    encounterId: "action-encounter",
    encounterName: "Action Economy",
    creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
  });
}

describe("typed action-economy kernel", () => {
  it("derives equipped weapon facts from the authoritative item", () => {
    const state = fighter();
    const attack = deriveWeaponAttack(state.character);
    expect(attack).toMatchObject({
      weaponId: "longsword",
      ability: "str",
      proficient: true,
      damageDice: "1d8",
      normalRangeFeet: null,
    });
    expect(attack?.attackBonus).toBe(state.character.abilityModifiers.str + state.character.proficiencyBonus);
    expect(attack?.explanation).toContain("Longsword uses STR");
  });

  it("projects structured combat offers with costs, targets, and reasons", () => {
    const started = encounter();
    expect(started.accepted).toBe(true);
    const state = started.state;
    const offers = deriveActionOffers(state);
    const attack = offers.find((offer) => offer.actionId === "combat_action:attack");
    const nonlethal = offers.find((offer) => offer.actionId === "combat_action:attack_nonlethal");
    const secondWind = offers.find((offer) => offer.actionId === "combat_action:second_wind");
    const endTurn = offers.find((offer) => offer.actionId === "end_turn");
    expect(attack).toMatchObject({
      timing: "action",
      cost: { action: 1 },
      validTargets: [state.combat.enemies[0]!.id],
      stateVersion: state.version,
      reasonUnavailable: null,
    });
    expect(nonlethal).toMatchObject({
      timing: "action",
      cost: { action: 1 },
      validTargets: [state.combat.enemies[0]!.id],
      reasonUnavailable: "Nonlethal attacks require an active encounter lifecycle.",
    });
    expect(secondWind).toMatchObject({ timing: "bonus_action", cost: { bonusAction: 1 }, reasonUnavailable: null });
    expect(endTurn).toMatchObject({ timing: "free", cost: {}, reasonUnavailable: null });
    expect(toSessionView(state).availableActions).toContain("combat_action:attack");
    expect(toSessionView(state).availableActions).not.toContain("combat_action:attack_nonlethal");
  });

  it("refreshes offer reasons from spent budgets without changing the action contract", () => {
    const started = encounter();
    started.state.character.hp = Math.max(1, started.state.character.maxHp - 4);
    const wind = apply(started.state, { kind: "combat_action", action: "second_wind" });
    expect(wind.accepted).toBe(true);
    const afterWind = deriveActionOffers(wind.state);
    expect(afterWind.find((offer) => offer.actionId === "combat_action:second_wind")).toMatchObject({
      cost: { bonusAction: 1 },
      reasonUnavailable: "Second Wind has no uses remaining.",
    });
    wind.state.combat.enemies[0]!.hp = 100;
    wind.state.combat.enemies[0]!.alive = true;
    const attack = apply(wind.state, { kind: "combat_action", action: "attack", targetId: wind.state.combat.enemies[0]!.id });
    expect(attack.accepted).toBe(true);
    const afterAttack = deriveActionOffers(attack.state);
    expect(afterAttack.find((offer) => offer.actionId === "combat_action:attack")).toMatchObject({
      cost: { action: 1 },
      reasonUnavailable: "Action already spent this turn.",
    });
    expect(afterAttack.find((offer) => offer.actionId === "end_turn")).toMatchObject({ reasonUnavailable: null });
    expect(toSessionView(attack.state).availableActions).not.toContain("combat_action:attack");
  });

  it("handles finesse, ranged, and non-proficient weapons without caller numbers", () => {
    const state = fighter();
    const longsword = state.character.inventory.find((item) => item.id === "longsword");
    if (longsword) longsword.equipped = false;
    state.character.abilities.str = 10;
    state.character.abilities.dex = 18;
    state.character.abilityModifiers.str = 0;
    state.character.abilityModifiers.dex = 4;
    state.character.proficiencies.weapons = [];
    state.character.inventory.push({
      id: "finesse-test",
      quantity: 1,
      slot: "mainhand",
      equipped: true,
      authoredDefinition: { name: "Finesse Test", kind: "weapon", weight: 1, damage: "1d6 piercing", properties: ["finesse"] },
    });
    const attack = deriveWeaponAttack(state.character, "finesse-test");
    expect(attack).toMatchObject({ ability: "dex", abilityModifier: 4, proficient: false, attackBonus: 4, damageDice: "1d6" });

    state.character.inventory.push({
      id: "ranged-test",
      quantity: 1,
      slot: "offhand",
      equipped: true,
      authoredDefinition: { name: "Ranged Test", kind: "weapon", weight: 1, damage: "1d4 piercing", properties: ["ranged"] },
    });
    expect(deriveWeaponAttack(state.character, "ranged-test")?.ability).toBe("dex");
  });

  it("spends Action and Bonus Action independently and keeps the turn open", () => {
    const started = encounter();
    expect(started.accepted).toBe(true);
    const state = started.state;
    state.character.hp = Math.max(1, state.character.maxHp - 4);
    const wind = apply(state, { kind: "combat_action", action: "second_wind" });
    expect(wind).toMatchObject({ accepted: true });
    expect(wind.event?.outcome).toBe("second_wind");
    expect(wind.state.combat.turnBudget).toMatchObject({
      action: { available: true, spent: false },
      bonusAction: { available: false, spent: true },
    });
    expect(wind.state.combat.activeActorId).toBe(wind.state.actorId);
    wind.state.combat.enemies[0]!.hp = 100;
    const attack = apply(wind.state, { kind: "combat_action", action: "attack", targetId: wind.state.combat.enemies[0]!.id });
    expect(attack.accepted).toBe(true);
    expect(attack.state.combat.status).toBe("active");
    expect(attack.state.combat.turnBudget.action.spent).toBe(true);
    expect(apply(attack.state, { kind: "combat_action", action: "second_wind" }).code).toBe("bonus_action_already_used");
    expect(apply(attack.state, { kind: "combat_action", action: "attack", targetId: attack.state.combat.enemies[0]!.id }).code).toBe("action_already_used");
  });

  it("requires explicit end_turn, refreshes the typed budget, and survives normalization", () => {
    const started = encounter();
    const state = started.state;
    const targetId = state.combat.enemies[0]!.id;
    // Keep this turn-handoff assertion independent of the random attack roll/damage.
    state.character.maxHp = 1_000;
    state.character.hp = 1_000;
    state.combat.enemies[0]!.hp = 100;
    state.combat.enemies[0]!.alive = true;
    const attack = apply(state, { kind: "combat_action", action: "attack", targetId });
    expect(attack.state.combat.activeActorId).toBe(attack.state.actorId);
    const ended = apply(attack.state, { kind: "end_turn" });
    expect(ended.accepted).toBe(true);
    expect(ended.state.combat.activeActorId).toBe(targetId);
    const enemy = apply(ended.state, { kind: "advance_turn", combatantId: targetId, actionKey: "scimitar" });
    expect(enemy.accepted).toBe(true);
    expect(enemy.state.combat.activeActorId).toBe(enemy.state.actorId);
    expect(enemy.state.combat.turnBudget).toMatchObject({
      action: { available: true, spent: false },
      bonusAction: { available: true, spent: false },
      reaction: { available: true, spent: false },
      movementFeet: { spent: 0 },
    });
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(enemy.state)));
    expect(restarted.combat.turnBudget).toEqual(enemy.state.combat.turnBudget);
    expect(toSessionView(restarted).availableActions).toEqual(expect.arrayContaining(["combat_action:attack", "end_turn"]));
  });

  it("rejects narration-only actions without mutation", () => {
    const started = encounter();
    const before = JSON.stringify(started.state);
    const rejected = apply(started.state, { kind: "combat_action", action: "dash" });
    expect(rejected).toMatchObject({ accepted: false, code: "unsupported_action", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
  });

  it("rejects an unequipped weapon selection without spending the Action", () => {
    const started = encounter();
    const before = JSON.stringify(started.state);
    const rejected = apply(started.state, {
      kind: "combat_action",
      action: "attack",
      targetId: started.state.combat.enemies[0]!.id,
      weaponId: "not-equipped",
    });
    expect(rejected).toMatchObject({ accepted: false, code: "weapon_not_equipped", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
  });

  it("normalizes and projects a generic pending-reaction envelope", () => {
    const state = fighter();
    state.combat.status = "active";
    state.combat.activeActorId = state.actorId;
    state.combat.pendingReaction = {
      version: 1,
      id: "reaction-1",
      kind: "incoming-hit",
      trigger: "incoming-attack-would-hit",
      sourceCommandId: "command-1",
      sourceVersion: state.version,
      actorId: state.actorId,
      attackerId: "enemy-1",
      targetId: state.character.id,
      sourceActionKey: "open5e:action:attack",
      attackName: "Longsword",
      attackRoll: 15,
      attackTotal: 20,
      attackBonus: 5,
      critical: false,
      originalArmorClass: state.character.ac,
      damageDiceCount: 1,
      damageDieSides: 8,
      damageBonus: 3,
      damageType: "slashing",
      eligibleReactionIds: ["shield"],
      status: "offered",
      resumeMode: "finish-creature-turn",
      movementTriggerId: null,
      resumeToken: "resume-1",
    };
    const normalized = normalizeCampaignState(JSON.parse(JSON.stringify(state)));
    expect(normalized.combat.pendingReaction).toEqual(state.combat.pendingReaction);
    const view = toSessionView(normalized);
    expect(view.combat.pendingReaction?.status).toBe("offered");
    expect(view.actionOffers).toEqual([
      expect.objectContaining({
        actionId: "reaction_response:accept",
        timing: "reaction",
        cost: { reaction: 1 },
        validTargets: ["reaction-1"],
        reasonUnavailable: null,
      }),
      expect.objectContaining({
        actionId: "reaction_response:decline",
        timing: "free",
        validTargets: ["reaction-1"],
        reasonUnavailable: null,
      }),
    ]);
    expect(deriveActionOffers(normalized)).toEqual(deriveActionOffers(JSON.parse(JSON.stringify(normalized))));
  });

  it("restores the once-per-rest Second Wind resource", () => {
    const state = fighter();
    state.character.featureUses.secondWind = 0;
    const rested = apply(state, { kind: "rest", restType: "long" });
    expect(rested.accepted).toBe(true);
    expect(rested.state.character.featureUses.secondWind).toBe(1);
  });
});
