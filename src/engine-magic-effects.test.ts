import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";

const CURE_WOUNDS = "open5e:spell:5e-2014:srd-2014:srd_cure-wounds";
const SHIELD = "open5e:spell:5e-2014:srd-2014:srd_shield";
const BURNING_HANDS = "open5e:spell:5e-2014:srd-2014:srd_burning-hands";
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

function apply(state: LanternCampaignState, command: EngineCommand) {
  const requestContext = context(state);
  return resolveEngineCommand(state, requestContext, randomUUID(), command, command.kind);
}

function clericCombat(): LanternCampaignState {
  const initial = createInitialCampaign("magic-cleric", "magic-cleric-actor");
  const created = apply(initial, {
    kind: "character_create",
    name: "Kernel Cleric",
    speciesKey: "open5e:species:5e-2014:srd-2014:srd_human",
    classKey: "open5e:class:5e-2014:srd-2014:srd_cleric",
    backgroundKey: "open5e:background:5e-2014:srd-2014:srd_acolyte",
    alignmentKey: "open5e:alignment:5e-2014:srd-2014:neutral",
  });
  expect(created.accepted).toBe(true);
  const prepared = apply(created.state, { kind: "prepare_spell", spellKey: CURE_WOUNDS, prepared: true });
  expect(prepared.accepted).toBe(true);
  const started = apply(prepared.state, {
    kind: "combat_start",
    encounterId: "magic-cleric-encounter",
    encounterName: "Magic Kernel",
    creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
  });
  expect(started.accepted).toBe(true);
  return started.state;
}

function wizardShieldCombat(): LanternCampaignState {
  const initial = createInitialCampaign("magic-wizard", "magic-wizard-actor");
  const created = apply(initial, { kind: "character_create", name: "Kernel Wizard", species: "human", className: "wizard" });
  expect(created.accepted).toBe(true);
  const learned = apply(created.state, { kind: "learn_spell", spellKey: SHIELD });
  expect(learned.accepted).toBe(true);
  const prepared = apply(learned.state, { kind: "prepare_spell", spellKey: SHIELD, prepared: true });
  expect(prepared.accepted).toBe(true);
  const started = apply(prepared.state, {
    kind: "combat_start",
    encounterId: "magic-wizard-encounter",
    encounterName: "Reaction Kernel",
    creatures: [{ creatureKey: GOBLIN, count: 5 }],
  });
  expect(started.accepted).toBe(true);
  return started.state;
}

function warlockCombat(): LanternCampaignState {
  const initial = createInitialCampaign("magic-warlock", "magic-warlock-actor");
  const created = apply(initial, {
    kind: "character_create",
    name: "Kernel Warlock",
    speciesKey: "open5e:species:5e-2014:srd-2014:srd_human",
    classKey: "open5e:class:5e-2014:srd-2014:srd_warlock",
    backgroundKey: "open5e:background:5e-2014:srd-2014:srd_acolyte",
    alignmentKey: "open5e:alignment:5e-2014:srd-2014:neutral",
  });
  expect(created.accepted).toBe(true);
  expect(created.state.character.spellcasting).toMatchObject({ slotRecovery: "short-or-long-rest", slots: { "1": 1 } });
  const learned = apply(created.state, { kind: "learn_spell", spellKey: BURNING_HANDS });
  expect(learned.accepted).toBe(true);
  const started = apply(learned.state, {
    kind: "combat_start",
    encounterId: "magic-warlock-encounter",
    encounterName: "Pact Kernel",
    creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
  });
  expect(started.accepted).toBe(true);
  return started.state;
}

function offerShield(state: LanternCampaignState) {
  state.character.abilities.dex = 200;
  state.character.maxHp = 100;
  state.character.hp = 100;
  let current = apply(state, { kind: "end_turn" }).state;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    // Force the attempted attack to hit while retaining natural-1 semantics;
    // retrying a miss keeps this evidence independent of one random d20.
    current.character.ac = 0;
    const enemyId = current.combat.activeActorId ?? current.combat.enemies[0]!.id;
    const result = apply(current, { kind: "advance_turn", combatantId: enemyId, actionKey: "scimitar" });
    if (result.accepted && result.event?.outcome === "reaction_offered") {
      if (result.state.combat.pendingReaction?.attackRoll !== 20) return result;
      current = apply(result.state, {
        kind: "reaction_response",
        reactionId: result.state.combat.pendingReaction.id,
        decision: "decline",
      }).state;
      if (current.combat.activeActorId === current.actorId) current = apply(current, { kind: "end_turn" }).state;
      continue;
    }
    expect(result.accepted).toBe(true);
    current = result.state;
    if (current.combat.activeActorId === current.actorId) current = apply(current, { kind: "end_turn" }).state;
  }
  throw new Error("The deterministic retry budget did not observe a Shield offer.");
}

describe("generic magic effects kernel", () => {
  it("compiles and casts Cure Wounds through canonical healing", () => {
    let state = clericCombat();
    state.character.hp = state.character.maxHp - 5;
    const beforeSlot = state.character.spellcasting!.slots["1"];
    const cast = apply(state, { kind: "cast_spell", spellKey: CURE_WOUNDS, targetIds: [] });
    expect(cast).toMatchObject({ accepted: true, event: { outcome: "spell_healing" } });
    expect(cast.data).toMatchObject({ effectKind: "healing", targetId: state.character.id });
    expect(cast.state.character.hp).toBeGreaterThan(state.character.hp);
    expect(cast.state.character.spellcasting!.slots["1"]).toBe(beforeSlot - 1);
  });

  it("rejects full-health healing and clears downed markers on rest recovery", () => {
    const full = clericCombat();
    const before = JSON.stringify(full);
    const rejected = apply(full, { kind: "cast_spell", spellKey: CURE_WOUNDS, targetIds: [] });
    expect(rejected).toMatchObject({ accepted: false, code: "already_full_health", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);

    const downed = clericCombat();
    downed.combat.status = "ended";
    downed.combat.activeActorId = null;
    downed.character.hp = 0;
    downed.character.conditions = ["unconscious", "stable"];
    downed.character.deathSaveSuccesses = 2;
    downed.character.deathSaveFailures = 1;
    const rested = apply(downed, { kind: "rest", restType: "short" });
    expect(rested.accepted).toBe(true);
    expect(rested.state.character.hp).toBeGreaterThan(0);
    expect(rested.state.character.conditions).not.toEqual(expect.arrayContaining(["unconscious", "stable"]));
    expect(rested.state.character.deathSaveSuccesses).toBe(0);
    expect(rested.state.character.deathSaveFailures).toBe(0);
  });

  it("offers Shield only for an incoming hit and resolves it once", () => {
    const noTrigger = wizardShieldCombat();
    const noTriggerBefore = JSON.stringify(noTrigger);
    const noTriggerCast = apply(noTrigger, { kind: "cast_spell", spellKey: SHIELD, targetIds: [] });
    expect(noTriggerCast).toMatchObject({ accepted: false, code: "reaction_trigger_required", event: null });
    expect(JSON.stringify(noTriggerCast.state)).toBe(noTriggerBefore);

    const offered = offerShield(wizardShieldCombat());
    const pending = offered.state.combat.pendingReaction;
    expect(pending).toMatchObject({ trigger: "incoming-attack-would-hit", status: "offered", eligibleReactionIds: [SHIELD] });
    expect(toSessionView(offered.state).availableActions).toEqual(["reaction_response:accept", "reaction_response:decline"]);
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(offered.state))).combat.pendingReaction).toEqual(pending);
    const beforeSlot = offered.state.character.spellcasting!.slots["1"];
    const accepted = apply(offered.state, {
      kind: "reaction_response",
      reactionId: pending!.id,
      decision: "accept",
      spellKey: SHIELD,
    });
    expect(accepted).toMatchObject({ accepted: true, event: { outcome: "reaction_resolved_miss" } });
    expect(accepted.data).toMatchObject({ acBefore: 0, hitAfter: false, reactionId: pending!.id });
    expect(accepted.state.combat.pendingReaction).toBeNull();
    expect(accepted.state.character.spellcasting!.slots["1"]).toBe(beforeSlot - 1);
    expect(accepted.state.combat.turnBudget.reaction.spent).toBe(true);
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(accepted.state))).character.ac).toBe(accepted.state.character.ac);

    const duplicate = apply(accepted.state, {
      kind: "reaction_response",
      reactionId: pending!.id,
      decision: "accept",
      spellKey: SHIELD,
    });
    expect(duplicate).toMatchObject({ accepted: false, code: "reaction_not_found", event: null });
    expect(JSON.stringify(duplicate.state)).toBe(JSON.stringify(accepted.state));
  });

  it("supports explicit Shield decline without spending a slot", () => {
    const offered = offerShield(wizardShieldCombat());
    const pending = offered.state.combat.pendingReaction!;
    const beforeSlot = offered.state.character.spellcasting!.slots["1"];
    const declined = apply(offered.state, { kind: "reaction_response", reactionId: pending.id, decision: "decline" });
    expect(declined).toMatchObject({ accepted: true, event: { outcome: "reaction_declined" } });
    expect(declined.state.combat.pendingReaction).toBeNull();
    expect(declined.state.character.spellcasting!.slots["1"]).toBe(beforeSlot);
    expect(declined.data).toMatchObject({ decision: "decline", damage: { applied: expect.any(Number) } });
  });

  it("recovers a Warlock pact slot on short rest before casting again", () => {
    let state = warlockCombat();
    const first = apply(state, { kind: "cast_spell", spellKey: BURNING_HANDS, targetIds: [state.combat.enemies[0]!.id] });
    expect(first.accepted).toBe(true);
    expect(["spell_cast", "spell_encounter_ended"]).toContain(first.event?.outcome);
    expect(first.state.character.spellcasting!.slots["1"]).toBe(0);

    // End the encounter through the normal player/enemy turn transitions.
    state = first.state;
    state.character.abilities.dex = 100;
    state.character.hp = state.character.maxHp;
    state.combat.enemies[0]!.hp = 1;
    state.combat.enemies[0]!.alive = true;
    state = apply(state, { kind: "end_turn" }).state;
    for (let attempt = 0; attempt < 20 && state.combat.status === "active"; attempt += 1) {
      const enemy = state.combat.activeActorId!;
      state = apply(state, { kind: "advance_turn", combatantId: enemy, actionKey: "scimitar" }).state;
      if (state.combat.status !== "active") break;
      const targetId = state.combat.enemies[0]!.id;
      const attack = apply(state, { kind: "combat_action", action: "attack", targetId });
      expect(attack.accepted).toBe(true);
      state = attack.state;
      if (state.combat.status === "active") state = apply(state, { kind: "end_turn" }).state;
    }
    expect(state.combat.status).toBe("ended");

    const rested = apply(state, { kind: "rest", restType: "short" });
    expect(rested).toMatchObject({ accepted: true, event: { outcome: "short_rest" } });
    expect(rested.state.character.spellcasting!.slots["1"]).toBe(1);
    const restarted = apply(rested.state, {
      kind: "combat_start",
      encounterId: "magic-warlock-encounter-2",
      encounterName: "Pact Kernel Again",
      creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
    });
    const second = apply(restarted.state, { kind: "cast_spell", spellKey: BURNING_HANDS, targetIds: [restarted.state.combat.enemies[0]!.id] });
    expect(second.accepted).toBe(true);
    expect(["spell_cast", "spell_encounter_ended"]).toContain(second.event?.outcome);
    expect(second.state.character.spellcasting!.slots["1"]).toBe(0);
  });
});
