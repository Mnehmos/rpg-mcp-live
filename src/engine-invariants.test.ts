import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vi, describe, expect, it, beforeEach } from "vitest";

const deterministicRandomInt = vi.hoisted(() =>
  vi.fn((min: number, _max: number) => min)
);

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import { randomUUID } from "node:crypto";
import {
  engineCommandSchema,
  type EngineCommand,
  type EngineEncounterLifecycle,
  type EngineToolName,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";
import { ruinedGatehouseWorldContextCommand } from "./world-object-fixture.js";

type CommandKind = EngineCommand["kind"];
type FixtureTool = EngineToolName | "declare" | "listen";

const ALL_COMMAND_KINDS = [
  "observe",
  "listen",
  "world_context",
  "player_note_add",
  "experience_profile_update",
  "experience_feedback_add",
  "experience_boundary",
  "challenge_attempt",
  "character_update",
  "move",
  "travel",
  "interact",
  "social_check",
  "npc_tick",
  "merchant_trade",
  "social_action",
  "quest_create",
  "quest_transition",
  "quest_update",
  "improvise",
  "campaign_beat",
  "character_roll_stats",
  "character_create",
  "equip_item",
  "inventory_transfer",
  "unequip_item",
  "drop_item",
  "use_item",
  "roll_check",
  "combat_start",
  "encounter_decision",
  "spawn_creature",
  "learn_spell",
  "prepare_spell",
  "cast_spell",
  "combat_action",
  "combat_move",
  "end_turn",
  "advance_turn",
  "advancement_confirm",
  "npc_advance",
  "death_save",
  "loot",
  "rest",
  "project",
  "tutorial_advance",
  "declare",
] as const satisfies readonly CommandKind[];

const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";
const FIRE_BOLT = "open5e:spell:5e-2014:srd-2014:srd_fire-bolt";
const BURNING_HANDS = "open5e:spell:5e-2014:srd-2014:srd_burning-hands";

interface StoreHarness {
  store: LanternEngineStore;
  context: RequestContext;
  databasePath: string;
}

interface InvalidFixture {
  kind: CommandKind;
  tool: FixtureTool;
  expectedCode: string;
  state: () => LanternCampaignState;
  rawCommand: () => unknown;
}

interface ControlFixture {
  kind: CommandKind;
  tool: FixtureTool;
  state: () => LanternCampaignState;
  rawCommand: () => unknown;
  readOnly?: boolean;
}

interface ReplayFixture {
  kind: CommandKind;
  tool: FixtureTool;
  build: () => { state: LanternCampaignState; command: EngineCommand };
}

function parseCommand(rawCommand: unknown): EngineCommand {
  return engineCommandSchema.parse(rawCommand);
}

function requestContext(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function initialState(): LanternCampaignState {
  return createInitialCampaign("account-invariants", "actor-invariants");
}

function createdState(className: "fighter" | "wizard" = "fighter"): LanternCampaignState {
  const state = initialState();
  const context = requestContext(state);
  const command = parseCommand({
    kind: "character_create",
    name: className === "wizard" ? "Census Wizard" : "Census Fighter",
    species: "human",
    className,
    background: "Acolyte",
    alignment: "Neutral",
  });
  const result = resolveEngineCommand(state, context, randomUUID(), command, "character_create");
  if (!result.accepted) throw new Error(`Fixture character creation failed: ${result.code}`);
  return result.state;
}

function applyAccepted(
  state: LanternCampaignState,
  rawCommand: unknown,
  tool: FixtureTool
): LanternCampaignState {
  const command = parseCommand(rawCommand);
  const context = requestContext(state);
  const result = resolveEngineCommand(state, context, randomUUID(), command, tool);
  if (!result.accepted) throw new Error(`Fixture ${command.kind} failed: ${result.code}`);
  return result.state;
}

function worldState(): LanternCampaignState {
  const state = createdState();
  state.worldContext = {
    id: "world-invariant-harbor",
    title: "The invariant harbor",
    description: "A bounded fixture harbor for command census tests.",
    features: ["bell tower"],
    exits: [{ id: "west-pier", label: "Walk the west pier" }],
    npcs: [{
      id: "guide",
      name: "The Guide",
      description: "A patient guide.",
      disposition: "friendly",
      goals: ["keep the route open"],
      socialDc: 12,
      relationshipScore: 0,
      memories: [],
    }],
    merchants: [{
      id: "trader",
      name: "The Trader",
      description: "A compact market stall.",
      disposition: "friendly",
      items: [{
        item: {
          id: "lamp-oil",
          quantity: 1,
          authoredDefinition: {
            name: "Lamp oil",
            kind: "consumable",
            weight: 1,
            healing: 4,
            valueCopper: 10,
          },
        },
        stock: 4,
        buyPriceCopper: 2,
        sellPriceCopper: 1,
      }],
    }],
    objects: [],
  };
  return normalizeCampaignState(state);
}

function npcAgencyWorldState(): LanternCampaignState {
  const state = worldState();
  state.worldContext!.npcs[0]!.agency = {
    actorType: "guard",
    locationRef: "world-invariant-harbor",
    schedule: [],
    goals: [{ id: "guard-route", title: "Keep the route open", priority: 80, status: "active" }],
    resources: { inventory: [], copper: 0, actionPoints: 1 },
    hp: 5,
    maxHp: 5,
    lifecycleState: "conscious",
    pendingAction: null,
    completedTriggerIds: [],
    reportedCrimeIds: [],
    invocations: [],
    consecutiveFailures: 0,
    circuitState: "closed",
    invocationDay: 0,
    invocationsToday: 0,
  };
  return normalizeCampaignState(state);
}

function travelState(): LanternCampaignState {
  const state = worldState();
  state.character.inventory.push(
    { id: "census-ration", quantity: 1, ownerRef: { kind: "actor", id: state.character.id }, authoredDefinition: { name: "Census ration", kind: "consumable", weight: 1, properties: ["ration"] } },
    { id: "census-water", quantity: 1, ownerRef: { kind: "actor", id: state.character.id }, authoredDefinition: { name: "Census water", kind: "consumable", weight: 1, properties: ["water"] } },
  );
  return normalizeCampaignState(state);
}

function worldObjectState(): LanternCampaignState {
  const state = createdState();
  return applyAccepted(state, ruinedGatehouseWorldContextCommand(), "world_context");
}

function activeCombatState(): LanternCampaignState {
  return applyAccepted(
    createdState(),
    {
      kind: "combat_start",
      encounterId: "invariant-encounter",
      encounterName: "Invariant Encounter",
      creatures: [{ creatureKey: GOBLIN, count: 1 }],
    },
    "combat_start"
  );
}

function lifecycleOfferState(): LanternCampaignState {
  const state = activeCombatState();
  state.combat.enemies[0]!.id = "fixture";
  const enemyId = "fixture";
  state.combat.lifecycle = {
    profile: "guards-surrender-v1",
    phase: "resolving",
    surprise: { eligible: true, consumed: true, source: "compatibility-default", evidence: null },
    initiative: { formulaRevision: "initiative-v1", entries: [], order: [state.actorId, enemyId], activeIndex: 0, rolledAtVersion: state.version },
    morale: {
      policy: "guards-surrender-v1",
      thresholdRatio: 0.5,
      offers: [{ id: "offer-fixture", targetId: enemyId, reason: "ally-fallen", thresholdRatio: 0.5, status: "offered", sourceVersion: state.version }],
      lastTriggerId: "offer-fixture",
    },
    objective: { id: "resolve-without-killing", status: "pending" },
    outcome: null,
    outcomeId: null,
    claimedRewards: [],
    nonlethalDefeatIds: [],
    retreatPlanRevision: null,
  } satisfies EngineEncounterLifecycle;
  return state;
}

function pendingAdvancementState(): LanternCampaignState {
  return applyAccepted(
    createdState(),
    { kind: "quest_update", questId: "first-light", status: "completed" },
    "quest_update"
  );
}

function enemyTurnState(): LanternCampaignState {
  const state = activeCombatState();
  state.combat.activeActorId = state.combat.enemies[0]?.id ?? null;
  return state;
}

function wizardPreparedState(): LanternCampaignState {
  const learned = applyAccepted(createdState("wizard"), { kind: "learn_spell", spellKey: BURNING_HANDS }, "learn_spell");
  return applyAccepted(learned, { kind: "prepare_spell", spellKey: BURNING_HANDS, prepared: true }, "prepare_spell");
}

function wizardCombatState(): LanternCampaignState {
  return applyAccepted(
    wizardPreparedState(),
    {
      kind: "combat_start",
      encounterId: "spell-encounter",
      encounterName: "Spell Encounter",
      creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
    },
    "combat_start"
  );
}

function endedCombatState(): LanternCampaignState {
  const state = activeCombatState();
  state.combat.status = "ended";
  state.combat.activeActorId = null;
  return state;
}

function unconsciousState(): LanternCampaignState {
  const state = createdState();
  state.character.hp = 0;
  state.character.conditions = [...state.character.conditions, "unconscious"];
  return state;
}

function rolledDraftState(): LanternCampaignState {
  return applyAccepted(initialState(), { kind: "character_roll_stats", method: "rolled" }, "character_roll_stats");
}

function experienceState(): LanternCampaignState {
  const state = initialState();
  state.experienceProfile.excludedThemes = ["graphic violence"];
  state.experienceProfile.fadeToBlackThemes = ["torture"];
  return normalizeCampaignState(state);
}

function consumableState(): LanternCampaignState {
  const state = createdState();
  state.character.hp = Math.max(0, state.character.maxHp - 1);
  state.character.inventory.push({
    id: "healing-draught",
    quantity: 1,
    authoredDefinition: {
      name: "Healing draught",
      kind: "consumable",
      weight: 1,
      healing: 4,
      valueCopper: 25,
    },
  } as never);
  return normalizeCampaignState(state);
}

function equippedState(): LanternCampaignState {
  return applyAccepted(createdState(), { kind: "equip_item", itemId: "longsword", slot: "mainhand" }, "equip_item");
}

function createStore(state: LanternCampaignState): StoreHarness {
  const directory = mkdtempSync(join(tmpdir(), "lantern-invariant-census-"));
  const databasePath = join(directory, "engine.db");
  const store = new LanternEngineStore(databasePath);
  store.createCampaign(
    {
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    },
    state
  );
  return { store, context: requestContext(state), databasePath };
}

const invalidFixtures: readonly InvalidFixture[] = [
  { kind: "challenge_attempt", tool: "challenge_attempt", expectedCode: "unknown_challenge_definition", state: initialState, rawCommand: () => ({ kind: "challenge_attempt", challengeId: "unreviewed", goal: "Try it", approach: "Force it" }) },
  {
    kind: "experience_profile_update",
    tool: "experience_profile_update",
    expectedCode: "invalid_experience_profile",
    state: initialState,
    rawCommand: () => ({
      kind: "experience_profile_update",
      profile: {
        pillarWeights: { combat: 0, exploration: 0, social: 0, mystery: 0 },
        difficulty: "standard",
        narrationStyle: "compact",
        verbosity: "compact",
        guidance: "balanced",
        rulesTransparency: "summary",
        excludedThemes: [],
        fadeToBlackThemes: [],
      },
    }),
  },
  {
    kind: "world_context",
    tool: "world_context",
    expectedCode: "field_not_authorable",
    state: initialState,
    rawCommand: () => ({
      kind: "world_context",
      title: "Invalid relationship fixture",
      description: "The relationship score is intentionally not authorable.",
      features: ["fixture"],
      exits: [],
      npcs: { upsert: [{ id: "guide", name: "The Guide", relationshipScore: 0 }] },
    }),
  },
  { kind: "character_update", tool: "character_update", expectedCode: "character_required", state: initialState, rawCommand: () => ({ kind: "character_update", name: "Too early" }) },
  { kind: "move", tool: "move", expectedCode: "invalid_move", state: initialState, rawCommand: () => ({ kind: "move", destinationId: "missing-exit" }) },
  { kind: "travel", tool: "travel", expectedCode: "route_unreviewed", state: initialState, rawCommand: () => ({ kind: "travel", routeId: "unreviewed", destinationId: "missing-exit", pace: "normal" }) },
  { kind: "interact", tool: "interact", expectedCode: "object_locked", state: worldObjectState, rawCommand: () => ({ kind: "interact", targetId: "gatehouse-door", affordance: "open", goal: "Open the locked gatehouse door." }) },
  { kind: "social_check", tool: "social_check", expectedCode: "npc_not_found", state: createdState, rawCommand: () => ({ kind: "social_check", npcId: "missing-npc", ability: "cha", goal: "Ask for help." }) },
  { kind: "merchant_trade", tool: "merchant_trade", expectedCode: "merchant_not_found", state: createdState, rawCommand: () => ({ kind: "merchant_trade", merchantId: "missing-merchant", itemId: "lamp-oil", side: "buy", quantity: 1 }) },
  { kind: "social_action", tool: "social_action", expectedCode: "social_target_not_found", state: createdState, rawCommand: () => ({ kind: "social_action", action: "promise", targetId: "missing-npc", terms: "Return a sealed letter." }) },
  { kind: "npc_tick", tool: "npc_tick", expectedCode: "npc_agency_unavailable", state: worldState, rawCommand: () => ({ kind: "npc_tick", trigger: "operator_batch", triggerId: "missing-agency" }) },
  { kind: "quest_update", tool: "quest_update", expectedCode: "quest_not_found", state: initialState, rawCommand: () => ({ kind: "quest_update", questId: "missing-quest", progress: 10 }) },
  { kind: "quest_transition", tool: "quest_transition", expectedCode: "quest_not_found", state: initialState, rawCommand: () => ({ kind: "quest_transition", questId: "missing-quest", transitionId: "missing-transition" }) },
  { kind: "character_roll_stats", tool: "character_roll_stats", expectedCode: "ability_scores_already_rolled", state: rolledDraftState, rawCommand: () => ({ kind: "character_roll_stats", method: "rolled" }) },
  { kind: "character_create", tool: "character_create", expectedCode: "character_locked", state: createdState, rawCommand: () => ({ kind: "character_create", name: "Duplicate", species: "human", className: "fighter" }) },
  { kind: "equip_item", tool: "equip_item", expectedCode: "item_not_found", state: createdState, rawCommand: () => ({ kind: "equip_item", itemId: "missing-item", slot: "mainhand" }) },
  { kind: "inventory_transfer", tool: "inventory_transfer", expectedCode: "item_not_found", state: createdState, rawCommand: () => ({ kind: "inventory_transfer", itemId: "missing-item", quantity: 1 }) },
  { kind: "unequip_item", tool: "unequip_item", expectedCode: "item_not_found", state: createdState, rawCommand: () => ({ kind: "unequip_item", itemId: "missing-item" }) },
  { kind: "drop_item", tool: "drop_item", expectedCode: "item_not_found", state: createdState, rawCommand: () => ({ kind: "drop_item", itemId: "missing-item", quantity: 1 }) },
  { kind: "use_item", tool: "use_item", expectedCode: "item_not_found", state: createdState, rawCommand: () => ({ kind: "use_item", itemId: "missing-item" }) },
  { kind: "combat_start", tool: "combat_start", expectedCode: "encounter_too_large", state: createdState, rawCommand: () => ({ kind: "combat_start", encounterId: "too-large", encounterName: "Too Large", creatures: [{ creatureKey: GOBLIN, count: 20 }, { creatureKey: GOBLIN, count: 1 }] }) },
  { kind: "encounter_decision", tool: "encounter_decision", expectedCode: "encounter_terminal", state: createdState, rawCommand: () => ({ kind: "encounter_decision", decision: "retreat" }) },
  { kind: "spawn_creature", tool: "spawn_creature", expectedCode: "no_active_combat", state: createdState, rawCommand: () => ({ kind: "spawn_creature", creatureKey: GOBLIN, count: 1 }) },
  { kind: "learn_spell", tool: "learn_spell", expectedCode: "spellcasting_unavailable", state: initialState, rawCommand: () => ({ kind: "learn_spell", spellKey: FIRE_BOLT }) },
  { kind: "prepare_spell", tool: "prepare_spell", expectedCode: "spellcasting_unavailable", state: initialState, rawCommand: () => ({ kind: "prepare_spell", spellKey: BURNING_HANDS, prepared: true }) },
  { kind: "cast_spell", tool: "cast_spell", expectedCode: "spellcasting_unavailable", state: initialState, rawCommand: () => ({ kind: "cast_spell", spellKey: FIRE_BOLT, targetIds: [] }) },
  { kind: "combat_action", tool: "combat_action", expectedCode: "no_active_combat", state: createdState, rawCommand: () => ({ kind: "combat_action", action: "dodge" }) },
  { kind: "combat_move", tool: "combat_move", expectedCode: "no_active_combat", state: createdState, rawCommand: () => ({ kind: "combat_move", geometryRevision: 1, destination: { frameId: "no-combat", x: 1, y: 0, z: 0 } }) },
  { kind: "end_turn", tool: "end_turn", expectedCode: "no_active_combat", state: createdState, rawCommand: () => ({ kind: "end_turn" }) },
  { kind: "advance_turn", tool: "advance_turn", expectedCode: "no_active_combat", state: createdState, rawCommand: () => ({ kind: "advance_turn" }) },
  { kind: "advancement_confirm", tool: "advancement_confirm", expectedCode: "advancement_not_pending", state: createdState, rawCommand: () => ({ kind: "advancement_confirm", pendingId: "missing-pending" }) },
  { kind: "npc_advance", tool: "npc_advance", expectedCode: "no_active_combat", state: createdState, rawCommand: () => ({ kind: "npc_advance", combatantId: "missing-combatant", templateId: "veteran" }) },
  { kind: "death_save", tool: "death_save", expectedCode: "not_unconscious", state: createdState, rawCommand: () => ({ kind: "death_save" }) },
  { kind: "loot", tool: "loot", expectedCode: "encounter_active", state: createdState, rawCommand: () => ({ kind: "loot", items: [], rewardXp: 0, rewardCopper: 0 }) },
  { kind: "rest", tool: "rest", expectedCode: "combat_active", state: activeCombatState, rawCommand: () => ({ kind: "rest", restType: "long" }) },
  { kind: "project", tool: "project", expectedCode: "project_unreviewed", state: initialState, rawCommand: () => ({ kind: "project", action: "start", projectId: "unreviewed" }) },
  { kind: "tutorial_advance", tool: "tutorial_advance", expectedCode: "character_required", state: initialState, rawCommand: () => ({ kind: "tutorial_advance" }) },
];

const controlFixtures: readonly ControlFixture[] = [
  { kind: "observe", tool: "observe", state: initialState, rawCommand: () => ({ kind: "observe" }), readOnly: true },
  { kind: "listen", tool: "listen", state: initialState, rawCommand: () => ({ kind: "listen" }) },
  { kind: "player_note_add", tool: "player_note_add", state: initialState, rawCommand: () => ({ kind: "player_note_add", text: "A durable clue.", source: "player" }) },
  { kind: "experience_feedback_add", tool: "experience_feedback_add", state: initialState, rawCommand: () => ({ kind: "experience_feedback_add", rating: 5 }) },
  { kind: "experience_boundary", tool: "experience_boundary", state: experienceState, rawCommand: () => ({ kind: "experience_boundary", theme: "graphic violence", action: "skip" }) },
  { kind: "challenge_attempt", tool: "challenge_attempt", state: initialState, rawCommand: () => ({ kind: "challenge_attempt", challengeId: "ordinary-unlocked-door-v1", goal: "Open the door", approach: "Turn the handle" }) },
  { kind: "interact", tool: "interact", state: initialState, rawCommand: () => ({ kind: "interact", targetId: "unbounded-fiction", goal: "Try the fixture interaction." }) },
  { kind: "travel", tool: "travel", state: travelState, rawCommand: () => ({ kind: "travel", routeId: "one-day-road-v1", destinationId: "west-pier", pace: "normal" }) },
  { kind: "quest_create", tool: "quest_create", state: initialState, rawCommand: () => ({ kind: "quest_create", title: "A bounded quest", objective: "Record a valid quest.", rewardXp: 1, rewardCopper: 1 }) },
  { kind: "improvise", tool: "improvise", state: initialState, rawCommand: () => ({ kind: "improvise", title: "A cosmetic detail", description: "The bell rings once.", effectType: "fictional" }) },
  { kind: "campaign_beat", tool: "campaign_beat", state: initialState, rawCommand: () => ({ kind: "campaign_beat", title: "A pressure", description: "The tide turns.", pressure: "The window is closing.", choices: ["Wait", "Act"] }) },
  { kind: "roll_check", tool: "roll_check", state: initialState, rawCommand: () => ({ kind: "roll_check", ability: "wis", goal: "Study the fixture." }) },
  { kind: "declare", tool: "declare", state: initialState, rawCommand: () => ({ kind: "declare", goal: "Take a fictional action." }) },
  { kind: "project", tool: "project", state: initialState, rawCommand: () => ({ kind: "project", action: "start", projectId: "research-v1" }) },
  { kind: "encounter_decision", tool: "encounter_decision", state: lifecycleOfferState, rawCommand: () => ({ kind: "encounter_decision", decision: "reject_surrender", targetId: "fixture" }) },
];

const replayFixtures: readonly ReplayFixture[] = [
  { kind: "observe", tool: "observe", build: () => ({ state: initialState(), command: parseCommand({ kind: "observe" }) }) },
  { kind: "listen", tool: "listen", build: () => ({ state: initialState(), command: parseCommand({ kind: "listen" }) }) },
  { kind: "world_context", tool: "world_context", build: () => ({ state: initialState(), command: parseCommand({ kind: "world_context", title: "Replay harbor", description: "A replay fixture.", features: ["bell"], exits: [] }) }) },
  { kind: "player_note_add", tool: "player_note_add", build: () => ({ state: initialState(), command: parseCommand({ kind: "player_note_add", text: "Replay note", source: "player" }) }) },
  { kind: "experience_profile_update", tool: "experience_profile_update", build: () => ({ state: initialState(), command: parseCommand({ kind: "experience_profile_update", profile: { pillarWeights: { combat: 40, exploration: 20, social: 20, mystery: 20 }, difficulty: "gentle", narrationStyle: "immersive", verbosity: "standard", guidance: "guided", rulesTransparency: "explicit", excludedThemes: ["violence"], fadeToBlackThemes: [] } }) }) },
  { kind: "experience_feedback_add", tool: "experience_feedback_add", build: () => ({ state: initialState(), command: parseCommand({ kind: "experience_feedback_add", rating: 4, note: "Replay feedback" }) }) },
  { kind: "experience_boundary", tool: "experience_boundary", build: () => ({ state: experienceState(), command: parseCommand({ kind: "experience_boundary", theme: "graphic violence", action: "redirect" }) }) },
  { kind: "challenge_attempt", tool: "challenge_attempt", build: () => ({ state: initialState(), command: parseCommand({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Shoulder it" }) }) },
  { kind: "character_update", tool: "character_update", build: () => ({ state: createdState(), command: parseCommand({ kind: "character_update", name: "Replay Hero" }) }) },
  { kind: "move", tool: "move", build: () => ({ state: worldState(), command: parseCommand({ kind: "move", destinationId: "west-pier" }) }) },
  { kind: "travel", tool: "travel", build: () => ({ state: travelState(), command: parseCommand({ kind: "travel", routeId: "one-day-road-v1", destinationId: "west-pier", pace: "normal" }) }) },
  { kind: "interact", tool: "interact", build: () => ({ state: initialState(), command: parseCommand({ kind: "interact", targetId: "fixture-object", goal: "Touch the fixture." }) }) },
  { kind: "interact", tool: "interact", build: () => ({ state: worldObjectState(), command: parseCommand({ kind: "interact", targetId: "gatehouse-door", affordance: "unlock", goal: "Replay the typed door interaction." }) }) },
  { kind: "social_check", tool: "social_check", build: () => ({ state: worldState(), command: parseCommand({ kind: "social_check", npcId: "guide", ability: "cha", goal: "Ask for directions." }) }) },
  { kind: "merchant_trade", tool: "merchant_trade", build: () => ({ state: worldState(), command: parseCommand({ kind: "merchant_trade", merchantId: "trader", itemId: "lamp-oil", side: "buy", quantity: 1 }) }) },
  { kind: "social_action", tool: "social_action", build: () => ({ state: worldState(), command: parseCommand({ kind: "social_action", action: "theft", targetId: "guide", itemId: "lamp-oil" }) }) },
  { kind: "npc_tick", tool: "npc_tick", build: () => ({ state: npcAgencyWorldState(), command: parseCommand({ kind: "npc_tick", trigger: "operator_batch", triggerId: "replay-npc" }) }) },
  { kind: "quest_create", tool: "quest_create", build: () => ({ state: initialState(), command: parseCommand({ kind: "quest_create", title: "Replay quest", objective: "Record it once.", rewardXp: 1, rewardCopper: 1 }) }) },
  {
    kind: "quest_transition",
    tool: "quest_transition",
    build: () => {
      const state = initialState();
      const graph = {
        objectives: [{ id: "replay-objective", title: "Replay objective", mode: "ordered" as const, optional: false, hidden: false, discovered: true, status: "pending" as const, predicate: { kind: "player_choice" as const, choiceId: "replay" }, completedAtMinutes: null, evidence: null }],
        transitions: [{ id: "replay-transition", label: "Replay transition", outcome: "success" as const, predicates: [], requiresObjectiveIds: [], consequence: { xp: 0, copper: 0 } }],
        deadlineAtMinutes: null,
        deadlineTransitionId: null,
        followUpQuestId: null,
        followUpEligible: false,
        clock: null,
        terminalTransitionId: null,
        consequenceRecords: [],
      };
      state.quest = { ...state.quest, graph };
      state.quests = [state.quest];
      return { state, command: parseCommand({ kind: "quest_transition", questId: state.quest.id, transitionId: "replay-transition" }) };
    },
  },
  { kind: "quest_update", tool: "quest_update", build: () => ({ state: initialState(), command: parseCommand({ kind: "quest_update", questId: "first-light", progress: 10 }) }) },
  { kind: "improvise", tool: "improvise", build: () => ({ state: initialState(), command: parseCommand({ kind: "improvise", title: "Replay detail", description: "A harmless detail.", effectType: "fictional" }) }) },
  { kind: "campaign_beat", tool: "campaign_beat", build: () => ({ state: initialState(), command: parseCommand({ kind: "campaign_beat", title: "Replay pressure", description: "A pressure.", pressure: "Act soon.", choices: ["Act"] }) }) },
  { kind: "character_roll_stats", tool: "character_roll_stats", build: () => ({ state: initialState(), command: parseCommand({ kind: "character_roll_stats", method: "rolled" }) }) },
  { kind: "character_create", tool: "character_create", build: () => ({ state: initialState(), command: parseCommand({ kind: "character_create", name: "Replay Creator", species: "human", className: "fighter" }) }) },
  { kind: "equip_item", tool: "equip_item", build: () => ({ state: createdState(), command: parseCommand({ kind: "equip_item", itemId: "longsword", slot: "mainhand" }) }) },
  {
    kind: "inventory_transfer",
    tool: "inventory_transfer",
    build: () => {
      const state = createdState();
      state.character.inventory.push({
        id: "replay-pack",
        quantity: 1,
        authoredDefinition: { name: "Replay pack", kind: "tool", weight: 1, containerCapacity: 20 },
      });
      state.character.inventory.push({
        id: "replay-ration",
        quantity: 1,
        authoredDefinition: { name: "Replay ration", kind: "consumable", weight: 1 },
      });
      const normalized = normalizeCampaignState(state);
      return { state: normalized, command: parseCommand({ kind: "inventory_transfer", itemId: "replay-ration", targetContainerId: "replay-pack", quantity: 1 }) };
    },
  },
  { kind: "unequip_item", tool: "unequip_item", build: () => ({ state: equippedState(), command: parseCommand({ kind: "unequip_item", itemId: "longsword" }) }) },
  { kind: "drop_item", tool: "drop_item", build: () => ({ state: createdState(), command: parseCommand({ kind: "drop_item", itemId: "ration", quantity: 1 }) }) },
  { kind: "use_item", tool: "use_item", build: () => ({ state: consumableState(), command: parseCommand({ kind: "use_item", itemId: "healing-draught" }) }) },
  { kind: "roll_check", tool: "roll_check", build: () => ({ state: initialState(), command: parseCommand({ kind: "roll_check", ability: "wis", goal: "Replay a check." }) }) },
  { kind: "combat_start", tool: "combat_start", build: () => ({ state: createdState(), command: parseCommand({ kind: "combat_start", encounterId: "replay-encounter", encounterName: "Replay Encounter", creatures: [{ creatureKey: GOBLIN, count: 1 }] }) }) },
  { kind: "encounter_decision", tool: "encounter_decision", build: () => ({ state: lifecycleOfferState(), command: parseCommand({ kind: "encounter_decision", decision: "reject_surrender", targetId: "fixture" }) }) },
  { kind: "spawn_creature", tool: "spawn_creature", build: () => ({ state: activeCombatState(), command: parseCommand({ kind: "spawn_creature", creatureKey: GOBLIN, count: 1 }) }) },
  { kind: "learn_spell", tool: "learn_spell", build: () => ({ state: createdState("wizard"), command: parseCommand({ kind: "learn_spell", spellKey: FIRE_BOLT }) }) },
  { kind: "prepare_spell", tool: "prepare_spell", build: () => ({ state: (() => { const state = createdState("wizard"); return applyAccepted(state, { kind: "learn_spell", spellKey: BURNING_HANDS }, "learn_spell"); })(), command: parseCommand({ kind: "prepare_spell", spellKey: BURNING_HANDS, prepared: true }) }) },
  { kind: "cast_spell", tool: "cast_spell", build: () => { const state = wizardCombatState(); return { state, command: parseCommand({ kind: "cast_spell", spellKey: BURNING_HANDS, targetIds: [state.combat.enemies[0]!.id] }) }; } },
  { kind: "combat_action", tool: "combat_action", build: () => ({ state: activeCombatState(), command: parseCommand({ kind: "combat_action", action: "dodge" }) }) },
  { kind: "combat_move", tool: "combat_move", build: () => { const state = activeCombatState(); return { state, command: parseCommand({ kind: "combat_move", geometryRevision: state.combat.tactical.geometry.revision, destination: { ...state.combat.tactical.actorPosition, y: state.combat.tactical.actorPosition.y + 1 } }) }; } },
  { kind: "end_turn", tool: "end_turn", build: () => ({ state: activeCombatState(), command: parseCommand({ kind: "end_turn" }) }) },
  { kind: "advance_turn", tool: "advance_turn", build: () => ({ state: enemyTurnState(), command: parseCommand({ kind: "advance_turn", actionKey: "scimitar" }) }) },
  { kind: "advancement_confirm", tool: "advancement_confirm", build: () => { const state = pendingAdvancementState(); return { state, command: parseCommand({ kind: "advancement_confirm", pendingId: state.pendingAdvancement!.id }) }; } },
  { kind: "npc_advance", tool: "npc_advance", build: () => { const state = activeCombatState(); return { state, command: parseCommand({ kind: "npc_advance", combatantId: state.combat.enemies[0]!.id, templateId: "veteran" }) }; } },
  { kind: "death_save", tool: "death_save", build: () => ({ state: unconsciousState(), command: parseCommand({ kind: "death_save" }) }) },
  { kind: "loot", tool: "loot", build: () => ({ state: endedCombatState(), command: parseCommand({ kind: "loot", items: [], rewardXp: 0, rewardCopper: 0 }) }) },
  { kind: "rest", tool: "rest", build: () => ({ state: createdState(), command: parseCommand({ kind: "rest", restType: "long" }) }) },
  { kind: "project", tool: "project", build: () => ({ state: initialState(), command: parseCommand({ kind: "project", action: "start", projectId: "research-v1" }) }) },
  { kind: "tutorial_advance", tool: "tutorial_advance", build: () => ({ state: createdState(), command: parseCommand({ kind: "tutorial_advance" }) }) },
  { kind: "declare", tool: "declare", build: () => ({ state: initialState(), command: parseCommand({ kind: "declare", goal: "Replay a declaration." }) }) },
];

describe("generic engine invariant census", () => {
  beforeEach(() => { deterministicRandomInt.mockClear(); });

  it("keeps the census registry aligned with every EngineCommand family", () => {
    expect(ALL_COMMAND_KINDS).toHaveLength(47);
    expect(new Set([...invalidFixtures, ...controlFixtures].map((fixture) => fixture.kind))).toEqual(new Set(ALL_COMMAND_KINDS));
    expect(new Set(replayFixtures.map((fixture) => fixture.kind))).toEqual(new Set(ALL_COMMAND_KINDS));
    for (const fixture of [...invalidFixtures, ...controlFixtures]) {
      expect(() => parseCommand(fixture.rawCommand()), fixture.kind).not.toThrow();
    }
  });

  for (const fixture of invalidFixtures) {
    it(`rejects ${fixture.kind} after schema acceptance without state, version, or event mutation`, () => {
      const state = fixture.state();
      const command = parseCommand(fixture.rawCommand());
      const harness = createStore(state);
      const before = JSON.stringify(harness.store.getCampaign(harness.context));
      let resolverEntered = false;

      const result = harness.store.executeCommand({
        context: harness.context,
        clientCommandId: randomUUID(),
        expectedCampaignVersion: state.version,
        command,
        tool: fixture.tool,
        resolve: (current) => {
          resolverEntered = true;
          return resolveEngineCommand(current, harness.context, randomUUID(), command, fixture.tool);
        },
      });

      expect(resolverEntered).toBe(true);
      expect(result.accepted).toBe(false);
      expect(result.code).toBe(fixture.expectedCode);
      expect(result.state.version).toBe(state.version);
      expect(JSON.stringify(harness.store.getCampaign(harness.context))).toBe(before);
      expect(harness.store.listCampaignEvents(harness.context)).toHaveLength(0);
      harness.store.close();
    });
  }

  for (const fixture of controlFixtures) {
    it(`records the intentional ${fixture.kind} control behavior`, () => {
      const state = fixture.state();
      const command = parseCommand(fixture.rawCommand());
      const harness = createStore(state);
      const commandId = randomUUID();
      const result = harness.store.executeCommand({
        context: harness.context,
        clientCommandId: commandId,
        expectedCampaignVersion: state.version,
        command,
        tool: fixture.tool,
        resolve: (current) => resolveEngineCommand(current, harness.context, commandId, command, fixture.tool),
      });
      expect(result.accepted).toBe(true);
      expect(result.readOnly).toBe(fixture.readOnly ?? false);
      harness.store.close();
    });
  }

  for (const fixture of replayFixtures) {
    it(`replays ${fixture.kind} exactly once across reopen without rerolling`, () => {
      const { state, command } = fixture.build();
      const harness = createStore(state);
      const commandId = randomUUID();
      const first = harness.store.executeCommand({
        context: harness.context,
        clientCommandId: commandId,
        expectedCampaignVersion: state.version,
        command,
        tool: fixture.tool,
        resolve: (current) => resolveEngineCommand(current, harness.context, commandId, command, fixture.tool),
      });
      expect(first.accepted, fixture.kind).toBe(true);
      const randomCallsAfterFirst = deterministicRandomInt.mock.calls.length;
      const eventsAfterFirst = harness.store.listCampaignEvents(harness.context);
      expect(eventsAfterFirst).toHaveLength(first.readOnly ? 0 : 1);
      harness.store.close();

      const reopened = new LanternEngineStore(harness.databasePath);
      const replay = reopened.executeCommand({
        context: harness.context,
        clientCommandId: commandId,
        expectedCampaignVersion: state.version,
        command,
        tool: fixture.tool,
        resolve: () => {
          throw new Error("A stored replay must not re-enter the resolver.");
        },
      });
      expect(replay.replayed).toBe(true);
      expect(replay.event).toEqual(first.event);
      expect(replay.state).toEqual(first.state);
      expect(deterministicRandomInt.mock.calls.length).toBe(randomCallsAfterFirst);
      expect(reopened.listCampaignEvents(harness.context)).toEqual(eventsAfterFirst);
      const newCommand = () => reopened.executeCommand({
        context: harness.context,
        clientCommandId: randomUUID(),
        expectedCampaignVersion: state.version,
        command,
        tool: fixture.tool,
        resolve: () => first,
      });
      if (first.readOnly) expect(newCommand().replayed).toBe(false);
      else expect(newCommand).toThrow(EngineVersionConflictError);
      reopened.close();
    });
  }

  it("mocks only randomInt while preserving real randomUUID values", () => {
    const firstId = randomUUID();
    const secondId = randomUUID();
    expect(firstId).not.toBe(secondId);
    const state = initialState();
    const context = requestContext(state);
    const command = parseCommand({ kind: "roll_check", ability: "wis", goal: "Deterministic roll." });
    const result = resolveEngineCommand(state, context, randomUUID(), command, "roll_check");
    expect(result.accepted).toBe(true);
    expect(result.event?.rolls[0]).toEqual({ kind: "d20", value: 1, sides: 20 });
    expect(deterministicRandomInt).toHaveBeenCalledWith(1, 21);
  });
});
