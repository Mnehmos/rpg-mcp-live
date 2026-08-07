import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileOpen5eEffectPrograms } from "./effect-compiler.js";
import { sha256 } from "./hash.js";
import { loadOpen5eContentPack } from "./pack.js";
import {
  compiledEffectProgramSchema,
  type CompiledCreatureAttack,
  type NormalizedCondition,
  type NormalizedCreature,
  type NormalizedDamageType,
  type NormalizedSpell,
} from "./schema.js";

const S6_PACK = resolve("content/open5e/open5e-v2-srd-2014-s6");

describe("Open5e S7 effect compiler", () => {
  it("compiles deterministic source-retaining programs without promoting ambiguous prose", async () => {
    const pack = await loadOpen5eContentPack(S6_PACK);
    const records = pack.records();
    const creatures = records.filter((record): record is NormalizedCreature => record.kind === "creature");
    const spells = records.filter((record): record is NormalizedSpell => record.kind === "spell");
    const conditions = records.filter((record): record is NormalizedCondition => record.kind === "condition");
    const damageTypes = records.filter((record): record is NormalizedDamageType => record.kind === "damage-type");
    const creatureAttacks = creatures
      .flatMap((creature) => pack.getCompiledForSource(creature.contentKey))
      .filter((record): record is CompiledCreatureAttack => record.kind === "creature-attack");

    const first = compileOpen5eEffectPrograms({ creatures, spells, conditions, damageTypes, creatureAttacks });
    const second = compileOpen5eEffectPrograms({ creatures, spells, conditions, damageTypes, creatureAttacks });
    expect(second).toEqual(first);
    expect(first.creaturePrograms).toHaveLength(291);
    expect(first.spellPrograms).toHaveLength(49);
    expect(countModes(first.creaturePrograms)).toEqual({
      fragments: 207,
      "saving-throw-damage": 42,
      multiattack: 37,
      "saving-throw-condition": 5,
    });

    const breath = first.creaturePrograms.find((program) =>
      program.sourceKey === "srd_young-red-dragon/fire-breath/effect-program"
    );
    expect(breath).toMatchObject({
      executionMode: "saving-throw-damage",
      hasDeferredProse: false,
      usage: { kind: "recharge", minimumRoll: 5, maximumRoll: 6 },
    });
    expect(breath?.operations.map((operation) => operation.kind)).toEqual([
      "usage-limit",
      "area",
      "saving-throw",
      "damage",
    ]);

    const elemental = first.creaturePrograms.find((program) =>
      program.sourceKey === "srd_air-elemental/multiattack/effect-program"
    );
    expect(elemental).toMatchObject({
      executionMode: "multiattack",
      hasDeferredProse: false,
      operations: [{ kind: "attack-sequence", steps: [{ actionKey: "slam", count: 2 }] }],
    });

    expect(first.creaturePrograms.some((program) =>
      program.sourceKey === "srd_adult-black-dragon/multiattack/effect-program"
    )).toBe(false);
    expect(first.creaturePrograms.some((program) =>
      program.sourceKey === "srd_bandit-captain/multiattack/effect-program"
    )).toBe(false);

    for (const program of [...first.creaturePrograms, ...first.spellPrograms]) {
      expect(program.sourceDescriptionSha256).toBe(sha256(program.sourceDescription));
      expect(compiledEffectProgramSchema.parse(JSON.parse(JSON.stringify(program)))).toEqual(program);
    }
  });
});

function countModes(
  programs: Array<{ executionMode: string }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const program of programs) counts[program.executionMode] = (counts[program.executionMode] ?? 0) + 1;
  return counts;
}
