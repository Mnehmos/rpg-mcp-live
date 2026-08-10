import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { engineCommandSchema } from "./engine-contracts.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { runtimeSpellExecutionSchema } from "./content/runtime-compiler.js";

const RAY_OF_FROST = "open5e:spell:5e-2014:srd-2014:srd_ray-of-frost";
const FIRE_BOLT = "open5e:spell:5e-2014:srd-2014:srd_fire-bolt";
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
  return resolveEngineCommand(state, context(state), randomUUID(), command, command.kind);
}

function wizard(): LanternCampaignState {
  const initial = createInitialCampaign("arcane-134", "arcane-134-actor");
  const created = apply(initial, {
    kind: "character_create",
    name: "Arcane Tester",
    species: "human",
    className: "wizard",
  });
  expect(created.accepted).toBe(true);
  return created.state;
}

type SynthesisModification = "damage-only" | "healing-only" | "bounded-modifier-only";

function synthesisCommand(
  primitiveContentKey = RAY_OF_FROST,
  modification: SynthesisModification = "damage-only",
  level = 9,
  key = "frost-thread",
): EngineCommand {
  return {
    kind: "content_compile",
    createInstance: true,
    instanceKey: "default",
    proposal: {
      kind: "spell",
      key,
      name: key.replaceAll("-", " "),
      description: "A narrow cold arc that Lantern can execute safely.",
      tags: ["arcane", "cold"],
      school: "evocation",
      // This intentionally incorrect hint proves the primitive, not the model,
      // supplies the authoritative spell level.
      level,
      intent: "A single cold bolt against one creature.",
      synthesis: { primitiveContentKey, modification },
    },
  };
}

function learnAndPrepare(state: LanternCampaignState, spellKey: string): LanternCampaignState {
  const learned = apply(state, { kind: "learn_spell", spellKey });
  expect(learned.accepted).toBe(true);
  if (learned.state.character.spellcasting?.knownSpells.find((reference) => reference.contentKey === spellKey)?.packHash) {
    const definition = learned.state.runtimeContent.definitions.find((candidate) => candidate.id === spellKey);
    if (definition?.kind === "spell" && definition.level > 0) {
      const prepared = apply(learned.state, { kind: "prepare_spell", spellKey, prepared: true });
      expect(prepared.accepted).toBe(true);
      return prepared.state;
    }
  }
  return learned.state;
}

function offerIncomingHit(state: LanternCampaignState) {
  state.character.abilities.dex = 200;
  state.character.maxHp = 100;
  state.character.hp = 100;
  let current = apply(state, { kind: "end_turn" }).state;
  for (let attempt = 0; attempt < 24; attempt += 1) {
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
  throw new Error("The retry budget did not observe an incoming-hit reaction offer.");
}

describe("runtime arcane synthesis", () => {
  it("compiles one reviewed primitive into persistent executable spell data", () => {
    const result = apply(wizard(), synthesisCommand());
    expect(result).toMatchObject({ accepted: true, event: { outcome: "content_compiled" } });
    const definition = result.state.runtimeContent.definitions.find((candidate) => candidate.kind === "spell");
    const instance = result.state.runtimeContent.instances.find((candidate) => candidate.kind === "spell");
    expect(definition).toMatchObject({
      kind: "spell",
      executionTier: 2,
      capabilities: ["spell", "damage", "runtime-synthesis"],
      level: 0,
      school: "evocation",
      provenance: { sourceRefs: expect.arrayContaining([RAY_OF_FROST]) },
      execution: {
        primitiveContentKey: RAY_OF_FROST,
        policyRevision: "runtime-arcane-synthesis-v2",
        castingTime: "action",
        rangeKind: "distance",
        rangeFeet: 60,
        targetType: "creature",
        targetCount: 1,
        savingThrowAbility: null,
        reactionCondition: null,
        duration: "instantaneous",
        effect: {
          effectKind: "damage",
          resolution: "spell-attack",
          baseDamage: { kind: "dice", diceCount: 1, dieSides: 8, bonus: 0 },
        },
      },
    });
    expect(instance).toMatchObject({ definitionId: definition?.id, state: { status: "known" } });
    expect(toSessionView(result.state).runtimeContent).toEqual(result.state.runtimeContent);
    if (definition?.kind !== "spell" || !definition.execution) throw new Error("missing runtime execution");
    expect(runtimeSpellExecutionSchema.safeParse({
      ...definition.execution,
      primitiveContentKey: FIRE_BOLT,
    }).success).toBe(false);
  });

  it("fails closed on an over-budget primitive without mutating campaign state", () => {
    const initial = wizard();
    const before = JSON.stringify(initial);
    const result = apply(initial, synthesisCommand(FIRE_BOLT));
    expect(result).toMatchObject({ accepted: false, code: "synthesis_power_budget_exceeded", event: null });
    expect(JSON.stringify(result.state)).toBe(before);
  });

  it("rejects proposal-authored mechanics at the schema boundary", () => {
    const base = synthesisCommand();
    if (base.kind !== "content_compile" || !base.proposal) throw new Error("invalid synthesis fixture");
    const unsafe = {
      ...base,
      proposal: { ...base.proposal, damageDice: "10d6" },
    };
    expect(engineCommandSchema.safeParse(unsafe).success).toBe(false);
  });

  it("learns, casts, reloads, and rejects duplicate learning from the canonical definition", () => {
    let state = wizard();
    const compiled = apply(state, synthesisCommand());
    expect(compiled.accepted).toBe(true);
    state = compiled.state;
    const spellKey = state.runtimeContent.definitions.find((candidate) => candidate.kind === "spell")!.id;

    const learned = apply(state, { kind: "learn_spell", spellKey });
    expect(learned).toMatchObject({ accepted: true, event: { outcome: "spell_learned" } });
    state = learned.state;
    expect(toSessionView(state).character.spellcasting?.knownSpells).toEqual(expect.arrayContaining([
      expect.objectContaining({ contentKey: spellKey, mechanicsStatus: "compiled-primary", level: 0 }),
    ]));

    const duplicateLearn = apply(state, { kind: "learn_spell", spellKey });
    expect(duplicateLearn).toMatchObject({ accepted: false, code: "spell_already_known", event: null });
    expect(duplicateLearn.state.version).toBe(state.version);

    // The next turn must be able to resolve the canonical runtime definition
    // after a save/restart, not just from the in-memory pre-reload object.
    state = normalizeCampaignState(JSON.parse(JSON.stringify(state)));
    expect(toSessionView(state).character.spellcasting?.knownSpells).toEqual(expect.arrayContaining([
      expect.objectContaining({ contentKey: spellKey, mechanicsStatus: "compiled-primary" }),
    ]));

    const started = apply(state, {
      kind: "combat_start",
      encounterId: "arcane-134-encounter",
      encounterName: "Arcane synthesis",
      creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
    });
    expect(started.accepted).toBe(true);
    const targetId = started.state.combat.enemies[0]!.id;
    const cast = apply(started.state, { kind: "cast_spell", spellKey, targetIds: [targetId] });
    expect(cast.accepted).toBe(true);
    expect(["spell_cast", "spell_encounter_ended"]).toContain(cast.event?.outcome);
    expect(cast.event?.contentKeys).toEqual(expect.arrayContaining([spellKey, RAY_OF_FROST]));

    const reloaded = normalizeCampaignState(JSON.parse(JSON.stringify(cast.state)));
    expect(reloaded.runtimeContent.definitions).toEqual(cast.state.runtimeContent.definitions);
    expect(reloaded.runtimeContent.instances).toEqual(cast.state.runtimeContent.instances);
    expect(reloaded.character.spellcasting?.knownSpells).toContainEqual(
      expect.objectContaining({ contentKey: spellKey, packHash: "runtime-arcane-synthesis-v2" }),
    );
  });

  it("copies reviewed healing and casts it through canonical healing after restart", () => {
    const compiled = apply(
      wizard(),
      synthesisCommand(CURE_WOUNDS, "healing-only", 0, "mending-thread"),
    );
    expect(compiled).toMatchObject({ accepted: true, event: { outcome: "content_compiled" } });
    const definition = compiled.state.runtimeContent.definitions.find((candidate) => candidate.kind === "spell")!;
    expect(definition).toMatchObject({
      executionTier: 2,
      level: 1,
      school: "evocation",
      capabilities: ["spell", "healing", "runtime-synthesis"],
      execution: {
        primitiveContentKey: CURE_WOUNDS,
        policyRevision: "runtime-arcane-synthesis-v2",
        castingTime: "action",
        rangeKind: "touch",
        rangeFeet: 0,
        duration: "instantaneous",
        effect: {
          effectKind: "healing",
          baseHealing: { kind: "dice", diceCount: 1, dieSides: 8, bonus: 0 },
          healingAbility: "spellcasting",
        },
      },
    });

    let state = learnAndPrepare(compiled.state, definition.id);
    state = normalizeCampaignState(JSON.parse(JSON.stringify(state)));
    const started = apply(state, {
      kind: "combat_start",
      encounterId: "arcane-healing-encounter",
      encounterName: "Arcane healing",
      creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
    });
    expect(started.accepted).toBe(true);
    started.state.character.hp = Math.max(1, started.state.character.maxHp - 6);
    const hpBefore = started.state.character.hp;
    const slotBefore = started.state.character.spellcasting!.slots["1"];
    const cast = apply(started.state, { kind: "cast_spell", spellKey: definition.id, targetIds: [] });
    expect(cast).toMatchObject({ accepted: true, event: { outcome: "spell_healing" } });
    expect(cast.state.character.hp).toBeGreaterThan(hpBefore);
    expect(cast.state.character.spellcasting!.slots["1"]).toBe(slotBefore - 1);
    expect(cast.event?.contentKeys).toEqual(expect.arrayContaining([definition.id, CURE_WOUNDS]));
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(cast.state))).runtimeContent.definitions)
      .toEqual(cast.state.runtimeContent.definitions);
  });

  it("copies the reviewed finite AC modifier and resolves it through the persisted reaction lifecycle", () => {
    const compiled = apply(
      wizard(),
      synthesisCommand(SHIELD, "bounded-modifier-only", 0, "mirror-ward"),
    );
    expect(compiled.accepted).toBe(true);
    const definition = compiled.state.runtimeContent.definitions.find((candidate) => candidate.kind === "spell")!;
    expect(definition).toMatchObject({
      level: 1,
      school: "abjuration",
      capabilities: ["spell", "modifier", "runtime-synthesis"],
      execution: {
        primitiveContentKey: SHIELD,
        policyRevision: "runtime-arcane-synthesis-v2",
        castingTime: "reaction",
        rangeKind: "self",
        rangeFeet: 0,
        duration: "1 round",
        effect: {
          effectKind: "stat-modifier",
          modifier: {
            stat: "armor-class",
            amount: 5,
            duration: { kind: "turn-boundary", boundary: "start", subject: "target", offsetTurns: 1 },
            trigger: "incoming-attack-would-hit",
          },
        },
      },
    });

    let state = learnAndPrepare(compiled.state, definition.id);
    const started = apply(state, {
      kind: "combat_start",
      encounterId: "arcane-modifier-encounter",
      encounterName: "Arcane modifier",
      creatures: [{ creatureKey: GOBLIN, count: 5 }],
    });
    expect(started.accepted).toBe(true);
    const beforeUntriggered = JSON.stringify(started.state);
    const untriggered = apply(started.state, { kind: "cast_spell", spellKey: definition.id, targetIds: [] });
    expect(untriggered).toMatchObject({ accepted: false, code: "reaction_trigger_required", event: null });
    expect(JSON.stringify(untriggered.state)).toBe(beforeUntriggered);

    const offered = offerIncomingHit(started.state);
    expect(offered.state.combat.pendingReaction?.eligibleReactionIds).toContain(definition.id);
    state = normalizeCampaignState(JSON.parse(JSON.stringify(offered.state)));
    const pending = state.combat.pendingReaction!;
    const slotBefore = state.character.spellcasting!.slots["1"];
    const accepted = apply(state, {
      kind: "reaction_response",
      reactionId: pending.id,
      decision: "accept",
      spellKey: definition.id,
    });
    expect(accepted).toMatchObject({ accepted: true, event: { outcome: "reaction_resolved_miss" } });
    expect(accepted.state.character.spellcasting!.slots["1"]).toBe(slotBefore - 1);
    expect(accepted.state.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceRef: `spell:${definition.id}`,
        status: "active",
        operations: expect.arrayContaining([
          expect.objectContaining({ kind: "stat-modifier", stat: "armor-class", value: 5 }),
        ]),
      }),
    ]));
    expect(accepted.event?.contentKeys).toEqual(expect.arrayContaining([definition.id, SHIELD]));

    const beforeDuplicate = JSON.stringify(accepted.state);
    const duplicate = apply(accepted.state, {
      kind: "reaction_response",
      reactionId: pending.id,
      decision: "accept",
      spellKey: definition.id,
    });
    expect(duplicate).toMatchObject({ accepted: false, code: "reaction_not_found", event: null });
    expect(JSON.stringify(duplicate.state)).toBe(beforeDuplicate);
  });

  it("rejects category mismatches and reviewed area spells without mutation", () => {
    const initial = wizard();
    const before = JSON.stringify(initial);
    const mismatch = apply(initial, synthesisCommand(CURE_WOUNDS, "damage-only", 0, "false-bolt"));
    expect(mismatch).toMatchObject({ accepted: false, code: "synthesis_modification_mismatch", event: null });
    expect(JSON.stringify(mismatch.state)).toBe(before);

    const area = apply(initial, synthesisCommand(BURNING_HANDS, "damage-only", 0, "false-cone"));
    expect(area).toMatchObject({ accepted: false, code: "synthesis_primitive_out_of_scope", event: null });
    expect(JSON.stringify(area.state)).toBe(before);
  });

  it("keeps persisted v1 damage spells readable and executable", () => {
    const compiled = apply(wizard(), synthesisCommand());
    expect(compiled.accepted).toBe(true);
    const persisted = JSON.parse(JSON.stringify(compiled.state)) as LanternCampaignState;
    const definition = persisted.runtimeContent.definitions.find((candidate) => candidate.kind === "spell")!;
    const execution = definition.execution;
    if (!execution || execution.policyRevision !== "runtime-arcane-synthesis-v2" || execution.effect.effectKind !== "damage") {
      throw new Error("Expected a v2 damage fixture.");
    }
    definition.execution = {
      primitiveContentKey: execution.primitiveContentKey,
      policyRevision: "runtime-arcane-synthesis-v1",
      castingTime: "action",
      rangeFeet: execution.rangeFeet,
      targetType: "creature",
      targetCount: 1,
      effect: execution.effect,
    };
    let state = normalizeCampaignState(persisted);
    const learned = apply(state, { kind: "learn_spell", spellKey: definition.id });
    expect(learned.accepted).toBe(true);
    state = learned.state;
    expect(toSessionView(state).character.spellcasting?.knownSpells).toContainEqual(
      expect.objectContaining({
        contentKey: definition.id,
        packHash: "runtime-arcane-synthesis-v1",
        mechanicsStatus: "compiled-primary",
      }),
    );
    const started = apply(state, {
      kind: "combat_start",
      encounterId: "arcane-v1-encounter",
      encounterName: "Legacy synthesis",
      creatures: [{ creatureKey: GOBLIN, count: 1, distanceFeet: 10 }],
    });
    const cast = apply(started.state, {
      kind: "cast_spell",
      spellKey: definition.id,
      targetIds: [started.state.combat.enemies[0]!.id],
    });
    expect(cast.accepted).toBe(true);
    expect(cast.event?.contentKeys).toEqual(expect.arrayContaining([definition.id, RAY_OF_FROST]));
  });
});
