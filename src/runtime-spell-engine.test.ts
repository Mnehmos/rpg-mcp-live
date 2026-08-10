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

const RAY_OF_FROST = "open5e:spell:5e-2014:srd-2014:srd_ray-of-frost";
const FIRE_BOLT = "open5e:spell:5e-2014:srd-2014:srd_fire-bolt";
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

function synthesisCommand(primitiveContentKey = RAY_OF_FROST, level = 9): EngineCommand {
  return {
    kind: "content_compile",
    createInstance: true,
    instanceKey: "default",
    proposal: {
      kind: "spell",
      key: "frost-thread",
      name: "Frost thread",
      description: "A narrow cold arc that Lantern can execute safely.",
      tags: ["arcane", "cold"],
      school: "evocation",
      // This intentionally incorrect hint proves the primitive, not the model,
      // supplies the authoritative spell level.
      level,
      intent: "A single cold bolt against one creature.",
      synthesis: { primitiveContentKey, modification: "damage-only" },
    },
  };
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
        policyRevision: "runtime-arcane-synthesis-v1",
        castingTime: "action",
        rangeFeet: 60,
        targetType: "creature",
        targetCount: 1,
        effect: {
          effectKind: "damage",
          resolution: "spell-attack",
          baseDamage: { kind: "dice", diceCount: 1, dieSides: 8, bonus: 0 },
        },
      },
    });
    expect(instance).toMatchObject({ definitionId: definition?.id, state: { status: "known" } });
    expect(toSessionView(result.state).runtimeContent).toEqual(result.state.runtimeContent);
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
      expect.objectContaining({ contentKey: spellKey, packHash: "runtime-arcane-synthesis-v1" }),
    );
  });
});
