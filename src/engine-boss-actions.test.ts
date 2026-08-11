import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const queuedRolls = vi.hoisted(() => [] as number[]);
const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => queuedRolls.shift() ?? max - 1));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import {
  createInitialCampaign,
  deriveActionOffers,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";

const ADULT_BLACK_DRAGON = "open5e:creature:5e-2014:srd-2014:srd_adult-black-dragon";
const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";
const LEGENDARY_TAIL = "boss:adult-black-dragon:legendary:tail-attack-v1";
const LAIR_ACID_GEYSER = "boss:adult-black-dragon:lair:acid-geyser-v1";
const PASS = "boss:window:pass";
const SHIELD = "open5e:spell:5e-2014:srd-2014:srd_shield";
const FIRE_BOLT = "open5e:spell:5e-2014:srd-2014:srd_fire-bolt";

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
  let state = createInitialCampaign("boss-account", "boss-actor");
  for (const command of [
    { kind: "character_create", name: "Boss Hunter", species: "human", className: "fighter" },
    { kind: "tutorial_advance" },
    { kind: "tutorial_advance" },
  ] as EngineCommand[]) {
    const result = apply(state, command);
    expect(result.accepted).toBe(true);
    state = result.state;
  }
  return state;
}

function wizard(): LanternCampaignState {
  let state = createInitialCampaign("boss-wizard-account", "boss-wizard-actor");
  for (const command of [
    { kind: "character_create", name: "Boss Ward", species: "human", className: "wizard" },
    { kind: "learn_spell", spellKey: SHIELD },
    { kind: "prepare_spell", spellKey: SHIELD, prepared: true },
    { kind: "tutorial_advance" },
    { kind: "tutorial_advance" },
  ] as EngineCommand[]) {
    const result = apply(state, command);
    expect(result.accepted).toBe(true);
    state = result.state;
  }
  return state;
}

function startBoss(state: LanternCampaignState, actorInitiative = 20, bossInitiative = 18) {
  queuedRolls.push(actorInitiative, bossInitiative);
  return apply(state, {
    kind: "combat_start",
    encounterId: "black-dragon-vault",
    encounterName: "Black Dragon Vault",
    lifecycleProfile: "adult-black-dragon-boss-v1",
    creatures: [{ creatureKey: ADULT_BLACK_DRAGON, count: 1 }],
  });
}

function establishGuard(state: LanternCampaignState): LanternCampaignState {
  const established = apply(state, {
    kind: "world_context",
    title: "The guarded boss arena",
    description: "A watch patrol holds the only exit.",
    features: ["guard post"],
    exits: [{ id: "arena-exit", label: "Arena exit" }],
    npcs: {
      upsert: [{
        id: "guard-patrol",
        name: "Patrol guard",
        description: "A guard authorized to take prisoners.",
        disposition: "hostile",
        goals: ["secure the arena"],
        memories: [],
        agency: {
          actorType: "guard",
          locationRef: "boss-arena",
          schedule: [],
          goals: [],
          resources: { inventory: [], copper: 0, actionPoints: 0 },
          maxHp: 10,
          hp: 10,
        },
      }],
    },
  });
  expect(established.accepted).toBe(true);
  return established.state;
}

function openLegendaryAndLairWindow(state: LanternCampaignState) {
  const started = startBoss(state);
  expect(started.accepted).toBe(true);
  expect(started.state.combat.activeActorId).toBe(started.state.actorId);
  const ended = apply(started.state, { kind: "end_turn" });
  expect(ended.accepted).toBe(true);
  expect(ended.state.combat.lifecycle?.bossTiming?.pendingWindow?.queue).toEqual(["legendary", "lair"]);
  return ended;
}

describe("reviewed boss-action timing", () => {
  it("binds exact legendary source prose to the compiled Tail attack and exposes finite offers", () => {
    const started = startBoss(fighter());
    expect(started.accepted).toBe(true);
    expect(started.state.combat.lifecycle).toMatchObject({
      profile: "adult-black-dragon-boss-v1",
      objective: { id: "defeat-boss", status: "pending" },
      morale: null,
      bossTiming: {
        revision: "boss-timing-v1",
        legendary: {
          maximum: 3,
          remaining: 3,
          totalSpent: 0,
          refresh: "start-of-source-turn",
          action: {
            actionRef: LEGENDARY_TAIL,
            sourceActionKey: "tail-attack",
            attackContentKey: "open5e:creature-attack:5e-2014:srd-2014:srd_adult-black-dragon/tail",
          },
        },
        lair: {
          available: true,
          initiative: { count: 20, orderIndex: 1, cycle: 1, formulaRevision: "initiative-count-20-v1" },
          action: { actionRef: LAIR_ACID_GEYSER, source: "lantern-reviewed", dc: 15 },
        },
      },
    });
    expect(deriveActionOffers(started.state).some((offer) => offer.actionId.startsWith("boss_action:"))).toBe(false);

    const ended = apply(started.state, { kind: "end_turn" });
    expect(ended.accepted).toBe(true);
    expect(ended.state.combat.lifecycle?.bossTiming?.pendingWindow?.queue).toEqual(["legendary", "lair"]);
    expect(deriveActionOffers(ended.state)).toEqual([
      expect.objectContaining({
        actionId: `boss_action:${LEGENDARY_TAIL}`,
        timing: "legendary",
        cost: { legendary: 1 },
        validTargets: [ended.state.actorId],
        reasonUnavailable: null,
      }),
      expect.objectContaining({ actionId: `boss_action:${PASS}`, timing: "free", cost: {}, validTargets: [] }),
    ]);
  });

  it("consumes Legendary Tail once, then resolves the initiative-20 lair save/damage primitive", () => {
    const state = fighter();
    state.character.maxHp = 200;
    state.character.hp = 200;
    const ended = openLegendaryAndLairWindow(state);

    queuedRolls.push(10, 4, 4);
    const tail = apply(ended.state, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: ended.state.actorId });
    expect(tail.accepted).toBe(true);
    expect(tail.state.character.hp).toBe(186);
    expect(tail.state.combat.turnBudget).toEqual(ended.state.combat.turnBudget);
    expect(tail.state.combat.enemies[0]?.reaction).toEqual(ended.state.combat.enemies[0]?.reaction);
    expect(tail.state.combat.lifecycle?.bossTiming).toMatchObject({
      legendary: { remaining: 2, totalSpent: 1 },
      pendingWindow: { queue: ["lair"] },
    });
    expect(deriveActionOffers(tail.state)).toEqual([
      expect.objectContaining({ actionId: `boss_action:${LAIR_ACID_GEYSER}`, timing: "lair", cost: { lair: 1 } }),
      expect.objectContaining({ actionId: `boss_action:${PASS}` }),
    ]);

    queuedRolls.push(20, 3, 3);
    const lair = apply(tail.state, { kind: "boss_action", actionRef: LAIR_ACID_GEYSER, targetId: tail.state.actorId });
    expect(lair.accepted).toBe(true);
    expect(lair.state.character.hp).toBe(183);
    expect(lair.state.combat.lifecycle?.bossTiming).toMatchObject({
      legendary: { remaining: 3, totalSpent: 1 },
      lair: { available: false, usedCycle: 1 },
      pendingWindow: null,
    });
    expect(lair.state.combat.activeActorId).toBe(lair.state.combat.enemies[0]?.id);
    expect(lair.event?.contentKeys).toEqual(expect.arrayContaining([ADULT_BLACK_DRAGON, "open5e:damage-type:5e-2014:srd-2014:acid"]));
    expect(lair.data).toMatchObject({ actionRef: LAIR_ACID_GEYSER, initiativeCount: 20, initiativeCycle: 1 });
  });

  it("offers Shield before Legendary Tail damage and resumes the same persisted boss window", () => {
    const ended = openLegendaryAndLairWindow(wizard());
    const hpBefore = ended.state.character.hp;
    queuedRolls.push(2);
    const offered = apply(ended.state, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: ended.state.actorId });
    expect(offered).toMatchObject({ accepted: true, event: { outcome: "reaction_offered" } });
    expect(offered.state.character.hp).toBe(hpBefore);
    expect(offered.state.combat.pendingReaction).toMatchObject({
      resumeMode: "finish-boss-window",
      bossWindowId: offered.state.combat.lifecycle?.bossTiming?.pendingWindow?.id,
      eligibleReactionIds: [SHIELD],
    });
    expect(offered.state.combat.lifecycle?.bossTiming).toMatchObject({
      legendary: { remaining: 2, totalSpent: 1 },
      pendingWindow: { queue: ["legendary", "lair"], legendaryResolution: "used" },
    });
    const mismatched = structuredClone(offered.state);
    mismatched.combat.pendingReaction!.bossWindowId = "invented-window";
    const mismatchedBefore = structuredClone(mismatched);
    const blocked = apply(mismatched, {
      kind: "reaction_response",
      reactionId: mismatched.combat.pendingReaction!.id,
      decision: "decline",
    });
    expect(blocked).toMatchObject({ accepted: false, code: "boss_reaction_resume_invalid", event: null });
    expect(blocked.state).toEqual(mismatchedBefore);
    expect(normalizeCampaignState(mismatched).combat).toMatchObject({
      status: "ended",
      activeActorId: null,
      lifecycle: null,
      pendingReaction: null,
      lastAction: "invalid_boss_state_quarantined",
    });
    const mismatchedConsumption = structuredClone(offered.state);
    mismatchedConsumption.combat.lifecycle!.bossTiming!.legendary.lastConsumedWindowId = "invented-window";
    expect(normalizeCampaignState(mismatchedConsumption).combat).toMatchObject({
      status: "ended",
      activeActorId: null,
      lifecycle: null,
      pendingReaction: null,
      lastAction: "invalid_boss_state_quarantined",
    });
    const missingBossBinding = structuredClone(offered.state);
    missingBossBinding.combat.pendingReaction!.resumeMode = "finish-creature-turn";
    missingBossBinding.combat.pendingReaction!.bossWindowId = null;
    expect(normalizeCampaignState(missingBossBinding).combat).toMatchObject({
      status: "ended",
      activeActorId: null,
      lifecycle: null,
      pendingReaction: null,
      lastAction: "invalid_boss_state_quarantined",
    });
    const rejectReactionMechanics = (
      mutate: (reaction: NonNullable<LanternCampaignState["combat"]["pendingReaction"]>) => void,
    ) => {
      const corrupted = structuredClone(offered.state);
      mutate(corrupted.combat.pendingReaction!);
      expect(normalizeCampaignState(corrupted).combat).toMatchObject({
        status: "ended",
        activeActorId: null,
        lifecycle: null,
        pendingReaction: null,
        lastAction: "invalid_boss_state_quarantined",
      });
    };
    rejectReactionMechanics((reaction) => { reaction.attackName = "Invented Tail"; });
    rejectReactionMechanics((reaction) => { reaction.attackRoll += 1; });
    rejectReactionMechanics((reaction) => { reaction.attackTotal += 1; });
    rejectReactionMechanics((reaction) => { reaction.attackBonus += 1; });
    rejectReactionMechanics((reaction) => { reaction.critical = true; });
    rejectReactionMechanics((reaction) => { reaction.originalArmorClass += 1; });
    rejectReactionMechanics((reaction) => { reaction.damageDiceCount += 1; });
    rejectReactionMechanics((reaction) => { reaction.damageDieSides += 1; });
    rejectReactionMechanics((reaction) => { reaction.damageBonus += 1; });
    rejectReactionMechanics((reaction) => { reaction.damageType = "invented"; });
    rejectReactionMechanics((reaction) => { reaction.eligibleReactionIds = []; });
    rejectReactionMechanics((reaction) => { reaction.targetId = "invented-target"; });
    rejectReactionMechanics((reaction) => { reaction.sourceVersion -= 1; });
    const profileUpdated = apply(offered.state, { kind: "experience_feedback_add", rating: 4 });
    expect(profileUpdated.accepted).toBe(true);
    expect(profileUpdated.state.version).toBe(offered.state.version + 1);
    expect(profileUpdated.state.combat.pendingReaction).toEqual(offered.state.combat.pendingReaction);
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(profileUpdated.state)) as LanternCampaignState);
    expect(restarted.combat.pendingReaction).toEqual(profileUpdated.state.combat.pendingReaction);

    const pending = restarted.combat.pendingReaction!;
    const slotBefore = restarted.character.spellcasting!.slots["1"];
    const shielded = apply(restarted, {
      kind: "reaction_response",
      reactionId: pending.id,
      decision: "accept",
      spellKey: SHIELD,
    });
    expect(shielded).toMatchObject({ accepted: true, event: { outcome: "reaction_resolved_miss" } });
    expect(shielded.state.character.hp).toBe(hpBefore);
    expect(shielded.state.character.spellcasting!.slots["1"]).toBe(slotBefore - 1);
    expect(shielded.state.combat.pendingReaction).toBeNull();
    expect(shielded.state.combat.lifecycle?.bossTiming).toMatchObject({
      legendary: { remaining: 2, totalSpent: 1 },
      pendingWindow: { queue: ["lair"] },
    });
  });

  it("preserves an explicit nonlethal final strike as a subdued boss outcome", () => {
    const started = startBoss(fighter());
    expect(started.accepted).toBe(true);
    const dragon = started.state.combat.enemies[0]!;
    dragon.hp = 1;
    const subdued = apply(started.state, { kind: "combat_action", action: "attack_nonlethal", targetId: dragon.id });
    expect(subdued.accepted).toBe(true);
    expect(subdued.message).toContain("ends without a kill");
    expect(subdued.state.combat.status).toBe("ended");
    expect(subdued.state.combat.enemies[0]).toMatchObject({ alive: false, conditions: expect.arrayContaining(["unconscious"]) });
    expect(subdued.state.combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "subdued",
      objective: { status: "succeeded" },
      nonlethalDefeatIds: [dragon.id],
      bossTiming: { pendingWindow: null },
    });
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(subdued.state)) as LanternCampaignState).combat.lifecycle?.outcome).toBe("subdued");
  });

  it("terminalizes reviewed boss defeats from spell and controlled-actor damage", () => {
    const learned = apply(wizard(), { kind: "learn_spell", spellKey: FIRE_BOLT });
    expect(learned.accepted).toBe(true);
    const spellStarted = startBoss(learned.state);
    expect(spellStarted.accepted).toBe(true);
    const spellTarget = spellStarted.state.combat.enemies[0]!;
    spellTarget.hp = 1;
    queuedRolls.push(20, 1, 1);
    const spellDefeat = apply(spellStarted.state, {
      kind: "cast_spell",
      spellKey: FIRE_BOLT,
      targetIds: [spellTarget.id],
    });
    expect(spellDefeat.accepted).toBe(true);
    expect(spellDefeat.state.combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "killed",
      objective: { status: "succeeded" },
      bossTiming: { pendingWindow: null, lastCompletedWindow: null },
    });
    expect(normalizeCampaignState(structuredClone(spellDefeat.state)).combat.lifecycle?.outcome).toBe("killed");

    const familiar = apply(fighter(), { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
    expect(familiar.accepted).toBe(true);
    const controlledStarted = startBoss(familiar.state);
    expect(controlledStarted.accepted).toBe(true);
    const controlledTarget = controlledStarted.state.combat.enemies[0]!;
    controlledTarget.hp = 1;
    queuedRolls.push(20, 1, 1);
    const controlledDefeat = apply(controlledStarted.state, {
      kind: "controlled_actor_command",
      actorId: controlledStarted.state.controlledActors[0]!.id,
      action: "attack",
      targetId: controlledTarget.id,
    });
    expect(controlledDefeat.accepted).toBe(true);
    expect(controlledDefeat.state.combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "killed",
      objective: { status: "succeeded" },
      bossTiming: { pendingWindow: null, lastCompletedWindow: null },
    });
    expect(normalizeCampaignState(structuredClone(controlledDefeat.state)).combat.lifecycle?.outcome).toBe("killed");
  });

  it("routes a surviving action spell through the reviewed boss window", () => {
    const learned = apply(wizard(), { kind: "learn_spell", spellKey: FIRE_BOLT });
    expect(learned.accepted).toBe(true);
    const started = startBoss(learned.state);
    expect(started.accepted).toBe(true);
    queuedRolls.push(1);
    const cast = apply(started.state, {
      kind: "cast_spell",
      spellKey: FIRE_BOLT,
      targetIds: [started.state.combat.enemies[0]!.id],
    });

    expect(cast.accepted).toBe(true);
    const sourceId = cast.state.combat.enemies[0]!.id;
    expect(cast.state.combat).toMatchObject({ status: "active", activeActorId: sourceId });
    expect(cast.state.combat.lifecycle?.initiative.activeIndex)
      .toBe(cast.state.combat.lifecycle?.initiative.order.indexOf(sourceId));
    expect(cast.state.combat.lifecycle?.bossTiming?.pendingWindow).toMatchObject({
      triggerActorId: cast.state.actorId,
      resumeActorId: sourceId,
      queue: ["legendary", "lair"],
      legendaryResolution: "pending",
    });
    expect(normalizeCampaignState(structuredClone(cast.state)).combat.lifecycle?.bossTiming?.pendingWindow)
      .toEqual(cast.state.combat.lifecycle?.bossTiming?.pendingWindow);
  });

  it("records player surrender as a failed, non-lootable boss outcome", () => {
    const started = startBoss(establishGuard(fighter()));
    expect(started.accepted).toBe(true);
    const surrendered = apply(started.state, {
      kind: "custody_action",
      action: "surrender",
      guardId: "guard-patrol",
    });

    expect(surrendered.accepted).toBe(true);
    expect(surrendered.state.combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "player_surrendered",
      objective: { id: "defeat-boss", status: "failed" },
      bossTiming: { pendingWindow: null, lastCompletedWindow: null },
    });
    const reloaded = normalizeCampaignState(structuredClone(surrendered.state));
    expect(reloaded.combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "player_surrendered",
      objective: { status: "failed" },
    });
    const beforeLoot = structuredClone(reloaded);
    const loot = apply(reloaded, { kind: "loot", items: [], rewardXp: 1_000, rewardCopper: 1_000 });
    expect(loot).toMatchObject({ accepted: false, code: "boss_outcome_not_lootable", event: null });
    expect(loot.state).toEqual(beforeLoot);
  });

  it("routes death-save handoffs through boss timing and terminalizes death-save death", () => {
    const makeDying = (state: LanternCampaignState) => {
      const dying = structuredClone(state);
      dying.character.hp = 0;
      dying.character.lifecycleState = "dying";
      dying.character.deathRecord = {
        source: "damage",
        sourceCommandId: randomUUID(),
        sourceVersion: dying.version,
        occurredAt: new Date().toISOString(),
      };
      dying.character.conditions = ["unconscious"];
      dying.character.deathSaveSuccesses = 0;
      dying.character.deathSaveFailures = 0;
      return normalizeCampaignState(dying);
    };

    const started = startBoss(fighter());
    expect(started.accepted).toBe(true);
    const dying = makeDying(started.state);
    queuedRolls.push(10);
    const saved = apply(dying, { kind: "death_save" });
    const sourceId = saved.state.combat.enemies[0]!.id;
    expect(saved.accepted).toBe(true);
    expect(saved.state.character.lifecycleState).toBe("dying");
    expect(saved.state.combat.activeActorId).toBe(sourceId);
    expect(saved.state.combat.lifecycle).toMatchObject({
      initiative: {
        activeIndex: saved.state.combat.lifecycle!.initiative.order.indexOf(sourceId),
      },
      bossTiming: { pendingWindow: { triggerActorId: saved.state.actorId, resumeActorId: sourceId, queue: ["legendary", "lair"] } },
    });

    const fatalStarted = startBoss(fighter());
    expect(fatalStarted.accepted).toBe(true);
    const fatal = makeDying(fatalStarted.state);
    fatal.character.deathSaveFailures = 2;
    queuedRolls.push(2);
    const dead = apply(fatal, { kind: "death_save" });
    expect(dead.accepted).toBe(true);
    expect(dead.state.character.lifecycleState).toBe("dead");
    expect(dead.state.combat).toMatchObject({ status: "ended", activeActorId: null });
    expect(dead.state.combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "player_defeated",
      objective: { status: "failed" },
      bossTiming: { pendingWindow: null },
    });
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(dead.state)) as LanternCampaignState).combat.lifecycle)
      .toMatchObject({ phase: "terminal", outcome: "player_defeated", objective: { status: "failed" } });
  });

  it("rejects a death save until initiative returns to the downed player", () => {
    const ended = openLegendaryAndLairWindow(fighter());
    const fragile = structuredClone(ended.state);
    fragile.character.hp = 1;
    queuedRolls.push(10, 1, 1);
    const downed = apply(fragile, {
      kind: "boss_action",
      actionRef: LEGENDARY_TAIL,
      targetId: fragile.actorId,
    });
    expect(downed.accepted).toBe(true);
    expect(downed.state.character).toMatchObject({ hp: 0, lifecycleState: "dying" });
    const resumedBossTurn = apply(downed.state, { kind: "boss_action", actionRef: PASS });
    expect(resumedBossTurn.accepted).toBe(true);
    expect(resumedBossTurn.state.combat).toMatchObject({
      status: "active",
      activeActorId: resumedBossTurn.state.combat.enemies[0]!.id,
    });
    expect(resumedBossTurn.state.combat.lifecycle?.bossTiming?.pendingWindow).toBeNull();

    const before = structuredClone(resumedBossTurn.state);
    const offTurn = apply(resumedBossTurn.state, { kind: "death_save" });
    expect(offTurn).toMatchObject({ accepted: false, code: "death_save_off_turn", event: null });
    expect(offTurn.state).toEqual(before);
  });

  it("rejects restored boss windows that do not match initiative semantics", () => {
    const initial = startBoss(fighter(), 10, 11);
    expect(initial.accepted).toBe(true);
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(initial.state)) as LanternCampaignState).combat.lifecycle?.bossTiming?.pendingWindow)
      .toEqual(initial.state.combat.lifecycle?.bossTiming?.pendingWindow);

    const ended = openLegendaryAndLairWindow(fighter());
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(ended.state)) as LanternCampaignState).combat.lifecycle?.bossTiming?.pendingWindow)
      .toEqual(ended.state.combat.lifecycle?.bossTiming?.pendingWindow);
    const sourceId = ended.state.combat.enemies[0]!.id;
    const rejectWindow = (mutate: (state: LanternCampaignState) => void) => {
      const corrupted = structuredClone(ended.state);
      mutate(corrupted);
      const quarantined = normalizeCampaignState(corrupted);
      expect(quarantined.combat).toMatchObject({
        status: "ended",
        activeActorId: null,
        lifecycle: null,
        pendingReaction: null,
        lastAction: "invalid_boss_state_quarantined",
      });
      const blocked = apply(quarantined, {
        kind: "spawn_creature",
        creatureKey: GOBLIN,
        count: 1,
      });
      expect(blocked).toMatchObject({ accepted: false, code: "no_active_combat", event: null });
      expect(blocked.state).toEqual(quarantined);
    };

    rejectWindow((state) => { state.combat.lifecycle!.bossTiming!.pendingWindow!.triggerActorId = sourceId; });
    rejectWindow((state) => { state.combat.lifecycle!.bossTiming!.pendingWindow!.queue = ["lair", "legendary"]; });
    rejectWindow((state) => { state.combat.activeActorId = state.actorId; });
    rejectWindow((state) => { state.combat.lifecycle!.bossTiming!.legendary.remaining = 4; });
    rejectWindow((state) => { state.combat.lifecycle!.bossTiming!.lair.usedCycle = 0; });
    rejectWindow((state) => { state.combat.lifecycle!.bossTiming!.lair.available = false; });
    rejectWindow((state) => {
      const actorEntry = state.combat.lifecycle!.initiative.entries.find((entry) => entry.actorId === state.actorId)!;
      actorEntry.modifier += 1;
      actorEntry.total += 1;
    });
    rejectWindow((state) => {
      for (const entry of state.combat.lifecycle!.initiative.entries) entry.total = 21;
      state.combat.lifecycle!.bossTiming!.pendingWindow!.queue = ["lair"];
    });

    const passed = apply(ended.state, { kind: "boss_action", actionRef: PASS });
    expect(passed.accepted).toBe(true);
    expect(passed.state.combat.lifecycle?.bossTiming).toMatchObject({
      legendary: { remaining: 3, totalSpent: 0 },
      pendingWindow: { queue: ["lair"], legendaryResolution: "passed" },
    });
    expect(normalizeCampaignState(structuredClone(passed.state)).combat.lifecycle?.bossTiming?.pendingWindow)
      .toEqual(passed.state.combat.lifecycle?.bossTiming?.pendingWindow);
    const readdedLegendary = structuredClone(passed.state);
    readdedLegendary.combat.lifecycle!.bossTiming!.pendingWindow!.queue = ["legendary", "lair"];
    expect(normalizeCampaignState(readdedLegendary).combat).toMatchObject({
      status: "ended",
      activeActorId: null,
      lifecycle: null,
      pendingReaction: null,
      lastAction: "invalid_boss_state_quarantined",
    });

    const standaloneStarted = startBoss(fighter(), 20, 19);
    expect(standaloneStarted.accepted).toBe(true);
    const standaloneOpened = apply(standaloneStarted.state, { kind: "end_turn" });
    expect(standaloneOpened.state.combat.lifecycle?.bossTiming?.pendingWindow).toMatchObject({
      queue: ["legendary"],
      legendaryResolution: "pending",
    });
    const standalonePassed = apply(standaloneOpened.state, { kind: "boss_action", actionRef: PASS });
    expect(standalonePassed.accepted).toBe(true);
    expect(standalonePassed.state.combat.lifecycle?.bossTiming).toMatchObject({
      pendingWindow: null,
      lastCompletedWindow: {
        triggerActorId: standalonePassed.state.actorId,
        resumeActorId: standalonePassed.state.combat.enemies[0]!.id,
        legendaryResolution: "passed",
      },
    });
    expect(normalizeCampaignState(structuredClone(standalonePassed.state)).combat.lifecycle?.bossTiming?.lastCompletedWindow)
      .toEqual(standalonePassed.state.combat.lifecycle?.bossTiming?.lastCompletedWindow);
    const reopenedStandalone = structuredClone(standalonePassed.state);
    const completed = reopenedStandalone.combat.lifecycle!.bossTiming!.lastCompletedWindow!;
    reopenedStandalone.combat.lifecycle!.bossTiming!.pendingWindow = {
      id: randomUUID(),
      triggerActorId: completed.triggerActorId,
      resumeActorId: completed.resumeActorId,
      queue: ["legendary"],
      legendaryResolution: "pending",
      openedAtVersion: reopenedStandalone.version,
    };
    reopenedStandalone.combat.lifecycle!.bossTiming!.lastCompletedWindow = null;
    expect(normalizeCampaignState(reopenedStandalone).combat).toMatchObject({
      status: "ended",
      activeActorId: null,
      lifecycle: null,
      pendingReaction: null,
      lootClaimed: true,
      lastAction: "invalid_boss_state_quarantined",
    });
  });

  it("quarantines cross-field boss lifecycle contradictions", () => {
    const started = startBoss(fighter());
    expect(started.accepted).toBe(true);
    const terminal = structuredClone(started.state);
    terminal.combat.status = "ended";
    terminal.combat.activeActorId = null;
    terminal.combat.enemies[0]!.hp = 0;
    terminal.combat.enemies[0]!.alive = false;
    terminal.combat.lifecycle!.phase = "terminal";
    terminal.combat.lifecycle!.outcome = "killed";
    terminal.combat.lifecycle!.outcomeId = `${terminal.combat.encounterId}:killed`;
    terminal.combat.lifecycle!.objective.status = "succeeded";
    terminal.combat.lifecycle!.bossTiming!.pendingWindow = null;
    expect(normalizeCampaignState(terminal).combat.lifecycle).toMatchObject({
      phase: "terminal",
      outcome: "killed",
      objective: { status: "succeeded" },
    });

    const rejectLifecycle = (mutate: (state: LanternCampaignState) => void) => {
      const corrupted = structuredClone(terminal);
      mutate(corrupted);
      expect(normalizeCampaignState(corrupted).combat).toMatchObject({
        status: "ended",
        activeActorId: null,
        lifecycle: null,
        pendingReaction: null,
        lastAction: "invalid_boss_state_quarantined",
      });
    };
    rejectLifecycle((state) => {
      state.combat.status = "active";
      state.combat.activeActorId = state.actorId;
    });
    rejectLifecycle((state) => { state.combat.lifecycle!.phase = "active"; });
    rejectLifecycle((state) => { state.combat.lifecycle!.outcome = null; });
    rejectLifecycle((state) => { state.combat.lifecycle!.outcomeId = "invented-outcome"; });
    rejectLifecycle((state) => { state.combat.lifecycle!.objective.status = "pending"; });
  });

  it("rejects mismatched content, unknown refs, bad targets, insufficient points, and incapacitated sources without mutation", () => {
    const base = fighter();
    const mismatchBefore = structuredClone(base);
    const mismatch = apply(base, {
      kind: "combat_start",
      encounterId: "wrong-boss",
      encounterName: "Wrong Boss",
      lifecycleProfile: "adult-black-dragon-boss-v1",
      creatures: [{ creatureKey: GOBLIN, count: 1 }],
    });
    expect(mismatch.accepted).toBe(false);
    expect(mismatch.code).toBe("boss_profile_mismatch");
    expect(mismatch.state).toEqual(mismatchBefore);

    const fixedRoster = startBoss(fighter());
    expect(fixedRoster.accepted).toBe(true);
    const fixedRosterBefore = structuredClone(fixedRoster.state);
    const spawned = apply(fixedRoster.state, { kind: "spawn_creature", creatureKey: GOBLIN, count: 1 });
    expect(spawned.accepted).toBe(false);
    expect(spawned.code).toBe("boss_profile_fixed_roster");
    expect(spawned.state).toEqual(fixedRosterBefore);

    const ended = openLegendaryAndLairWindow(fighter());
    for (const [command, code] of [
      [{ kind: "boss_action", actionRef: "boss:invented", targetId: ended.state.actorId }, "boss_action_not_offered"],
      [{ kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: "invented-target" }, "boss_action_target_invalid"],
    ] as const) {
      const before = structuredClone(ended.state);
      const result = apply(ended.state, command);
      expect(result.accepted).toBe(false);
      expect(result.code).toBe(code);
      expect(result.state).toEqual(before);
    }

    const spent = structuredClone(ended.state);
    spent.combat.lifecycle!.bossTiming!.legendary.remaining = 0;
    const spentBefore = structuredClone(spent);
    const insufficient = apply(spent, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: spent.actorId });
    expect(insufficient.accepted).toBe(false);
    expect(insufficient.code).toBe("boss_legendary_resource_insufficient");
    expect(insufficient.state).toEqual(spentBefore);

    const stunned = structuredClone(ended.state);
    stunned.combat.enemies[0]!.conditions.push("stunned");
    const stunnedBefore = structuredClone(stunned);
    const blocked = apply(stunned, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: stunned.actorId });
    expect(blocked.accepted).toBe(false);
    expect(blocked.code).toBe("boss_action_unavailable");
    expect(blocked.state).toEqual(stunnedBefore);

    const deadSource = structuredClone(ended.state);
    deadSource.combat.enemies[0]!.alive = false;
    deadSource.combat.enemies[0]!.hp = 0;
    const deadSourceBefore = structuredClone(deadSource);
    const deadBlocked = apply(deadSource, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: deadSource.actorId });
    expect(deadBlocked.accepted).toBe(false);
    expect(deadBlocked.code).toBe("boss_action_unavailable");
    expect(deadBlocked.state).toEqual(deadSourceBefore);

    const outOfRange = structuredClone(ended.state);
    outOfRange.combat.tactical.actorPosition.x = 20;
    expect(deriveActionOffers(outOfRange)[0]?.reasonUnavailable).toContain("15-foot reach");
    const outOfRangeBefore = structuredClone(outOfRange);
    const rangedBlocked = apply(outOfRange, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: outOfRange.actorId });
    expect(rangedBlocked.accepted).toBe(false);
    expect(rangedBlocked.code).toBe("boss_action_target_out_of_range");
    expect(rangedBlocked.state).toEqual(outOfRangeBefore);

    const terminal = structuredClone(ended.state);
    terminal.combat.status = "ended";
    terminal.combat.lifecycle!.phase = "terminal";
    const terminalBefore = structuredClone(terminal);
    const afterTerminal = apply(terminal, { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: terminal.actorId });
    expect(afterTerminal.accepted).toBe(false);
    expect(afterTerminal.code).toBe("no_active_combat");
    expect(afterTerminal.state).toEqual(terminalBefore);
  });

  it("treats a passed lair boundary as spent for that persisted initiative cycle", () => {
    const started = startBoss(fighter(), 10, 11);
    expect(started.accepted).toBe(true);
    expect(started.message).toContain("boss-action window opens before initiative begins");
    expect(started.state.combat.lifecycle?.bossTiming?.pendingWindow?.queue).toEqual(["lair"]);
    expect(deriveActionOffers(started.state)[0]).toMatchObject({ actionId: `boss_action:${LAIR_ACID_GEYSER}` });
    const hpBefore = started.state.character.hp;
    const passed = apply(started.state, { kind: "boss_action", actionRef: PASS });
    expect(passed.accepted).toBe(true);
    expect(passed.state.character.hp).toBe(hpBefore);
    expect(passed.state.combat.lifecycle?.bossTiming).toMatchObject({
      lair: { available: false, usedCycle: 1 },
      pendingWindow: null,
    });
    const beforeRepeat = structuredClone(passed.state);
    const repeated = apply(passed.state, { kind: "boss_action", actionRef: LAIR_ACID_GEYSER, targetId: passed.state.actorId });
    expect(repeated.accepted).toBe(false);
    expect(repeated.code).toBe("boss_action_off_timing");
    expect(repeated.state).toEqual(beforeRepeat);
  });

  it("preserves exactly-once damage/resource evidence across command replay and store restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-boss-actions-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    let state = createInitialCampaign("boss-store-account", "boss-store-actor");
    const request = context(state);
    store.createCampaign(request, state);

    const execute = (command: EngineCommand, id = randomUUID(), expectedVersion = state.version) => {
      const result = store.executeCommand({
        context: request,
        clientCommandId: id,
        expectedCampaignVersion: expectedVersion,
        command,
        tool: command.kind,
        resolve: (current) => resolveEngineCommand(current, request, id, command, command.kind),
      });
      state = result.state;
      return result;
    };
    for (const command of [
      { kind: "character_create", name: "Persisted Boss Hunter", species: "human", className: "fighter" },
      { kind: "tutorial_advance" },
      { kind: "tutorial_advance" },
    ] as EngineCommand[]) execute(command);
    queuedRolls.push(20, 18);
    execute({
      kind: "combat_start",
      encounterId: "persisted-black-dragon",
      encounterName: "Persisted Black Dragon",
      lifecycleProfile: "adult-black-dragon-boss-v1",
      creatures: [{ creatureKey: ADULT_BLACK_DRAGON, count: 1 }],
    });
    execute({ kind: "end_turn" });

    const hpBefore = state.character.hp;
    queuedRolls.push(10, 1, 1);
    const action: EngineCommand = { kind: "boss_action", actionRef: LEGENDARY_TAIL, targetId: state.actorId };
    const actionId = randomUUID();
    const expectedVersion = state.version;
    const committed = execute(action, actionId, expectedVersion);
    const callsAfterCommit = deterministicRandomInt.mock.calls.length;
    const replayed = store.executeCommand({
      context: request,
      clientCommandId: actionId,
      expectedCampaignVersion: expectedVersion,
      command: action,
      tool: "boss_action",
      resolve: (current) => resolveEngineCommand(current, request, actionId, action, "boss_action"),
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.state).toEqual(committed.state);
    expect(committed.state.character.hp).toBeLessThan(hpBefore);
    expect(replayed.state.character.hp).toBe(committed.state.character.hp);
    expect(replayed.state.combat.lifecycle?.bossTiming?.legendary.totalSpent).toBe(1);
    expect(deterministicRandomInt.mock.calls.length).toBe(callsAfterCommit);
    const normalized = normalizeCampaignState(JSON.parse(JSON.stringify(committed.state)) as LanternCampaignState);
    expect(normalized.combat.lifecycle?.bossTiming).toEqual(committed.state.combat.lifecycle?.bossTiming);
    const corrupted = JSON.parse(JSON.stringify(committed.state)) as LanternCampaignState;
    corrupted.combat.lifecycle!.bossTiming!.sourceCombatantId = "invented-source";
    const quarantined = normalizeCampaignState(corrupted);
    expect(quarantined.combat).toMatchObject({
      status: "ended",
      activeActorId: null,
      lifecycle: null,
      pendingReaction: null,
      lootClaimed: true,
      lastAction: "invalid_boss_state_quarantined",
    });
    const beforeQuarantinedLoot = structuredClone(quarantined);
    const quarantinedLoot = apply(quarantined, {
      kind: "loot",
      items: [],
      rewardXp: 1_000,
      rewardCopper: 1_000,
    });
    expect(quarantinedLoot).toMatchObject({ accepted: false, code: "encounter_quarantined", event: null });
    expect(quarantinedLoot.state).toEqual(beforeQuarantinedLoot);

    const missingPlayer = structuredClone(committed.state);
    const sourceId = missingPlayer.combat.enemies[0]!.id;
    missingPlayer.combat.lifecycle!.initiative.entries = missingPlayer.combat.lifecycle!.initiative.entries
      .filter((entry) => entry.actorId === sourceId);
    missingPlayer.combat.lifecycle!.initiative.order = [sourceId];
    expect(normalizeCampaignState(missingPlayer).combat).toMatchObject({
      status: "ended",
      lifecycle: null,
      lastAction: "invalid_boss_state_quarantined",
    });

    const duplicateSource = structuredClone(committed.state);
    const sourceEntry = duplicateSource.combat.lifecycle!.initiative.entries.find((entry) => entry.actorId === sourceId)!;
    duplicateSource.combat.lifecycle!.initiative.entries = [sourceEntry, structuredClone(sourceEntry)];
    duplicateSource.combat.lifecycle!.initiative.order = [sourceId, sourceId];
    expect(normalizeCampaignState(duplicateSource).combat).toMatchObject({
      status: "ended",
      lifecycle: null,
      lastAction: "invalid_boss_state_quarantined",
    });

    const mismatchedOrder = structuredClone(committed.state);
    mismatchedOrder.combat.lifecycle!.initiative.order = [mismatchedOrder.actorId, "invented-actor"];
    expect(normalizeCampaignState(mismatchedOrder).combat).toMatchObject({
      status: "ended",
      lifecycle: null,
      lastAction: "invalid_boss_state_quarantined",
    });

    store.close();
    const reopened = new LanternEngineStore(databasePath);
    const persisted = reopened.getCampaign(request);
    expect(persisted.combat.lifecycle?.bossTiming?.legendary.totalSpent).toBe(1);
    expect(persisted.combat.lifecycle?.bossTiming?.pendingWindow?.queue).toEqual(["lair"]);
    reopened.close();
  });
});
