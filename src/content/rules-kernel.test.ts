import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  loadActiveRulesKernel,
  loadRulesKernel,
  loadRulesKernelForPackHash,
  registerOpen5ePackCompatibilityAlias,
} from "./rules-kernel.js";

describe("pack-backed Open5e rules kernel", () => {
  it("reproduces the skill and currency outputs from the active pack", () => {
    const kernel = loadActiveRulesKernel();

    expect(kernel.rulesVersion).toBe(
      "open5e-pack@fbd846cf7b7833560b22f4ebffaf950fb6b2adf62cf9c6fff469266325ac31fa"
    );
    expect(kernel.skills).toEqual({
      acrobatics: "dex",
      animalHandling: "wis",
      arcana: "int",
      athletics: "str",
      deception: "cha",
      history: "int",
      insight: "wis",
      intimidation: "cha",
      investigation: "int",
      medicine: "wis",
      nature: "int",
      perception: "wis",
      performance: "cha",
      persuasion: "cha",
      religion: "int",
      sleightOfHand: "dex",
      stealth: "dex",
      survival: "wis",
    });
    expect(kernel.currency).toEqual({
      copperPerCopper: 1,
      copperPerSilver: 10,
      copperPerElectrum: 50,
      copperPerGold: 100,
      copperPerPlatinum: 1_000,
    });
    const goblin = kernel.creatures["open5e:creature:5e-2014:srd-2014:srd_goblin"];
    expect(goblin?.definition).toMatchObject({ name: "Goblin", armorClass: 15, hitPoints: 7 });
    expect(goblin?.attacks.length).toBeGreaterThan(0);
    const airElemental = kernel.creatures["open5e:creature:5e-2014:srd-2014:srd_air-elemental"];
    expect(airElemental?.effects.some((program) => program.executionMode === "multiattack")).toBe(true);
    const fireball = kernel.spells["open5e:spell:5e-2014:srd-2014:srd_fireball"];
    expect(fireball?.definition).toMatchObject({ name: "Fireball", level: 3, savingThrowAbility: "dex" });
    expect(fireball?.effect).toMatchObject({ resolution: "saving-throw", saveOnSuccess: "half" });
    expect(kernel.spellLists.srd_wizard?.spells).toHaveLength(204);
    expect(kernel.spellProgressions.srd_wizard?.levels[0]?.slots).toMatchObject({ "1": 2 });
  });

  it("loads the complete active S5 character-option graph", () => {
    const kernel = loadRulesKernel(join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s5"));

    expect(kernel.packHash).toBe("fe125d285c9860fc699d2c08a8199e8cd400a5ad2097bf6d9a8a708f717fb473");
    expect(Object.keys(kernel.abilities)).toHaveLength(6);
    expect(Object.keys(kernel.languages)).toHaveLength(18);
    expect(Object.keys(kernel.alignments)).toHaveLength(9);
    expect(Object.keys(kernel.species)).toHaveLength(13);
    expect(Object.values(kernel.classes).filter((entry) => entry.profile)).toHaveLength(12);
    expect(Object.values(kernel.classes).filter((entry) => entry.definition.isSubclass)).toHaveLength(12);
    expect(Object.keys(kernel.backgrounds)).toHaveLength(1);
    expect(Object.keys(kernel.feats)).toHaveLength(1);
    expect(kernel.species["open5e:species:5e-2014:srd-2014:srd_high-elf"]?.profile).toMatchObject({
      size: "Medium",
      speedFeet: 30,
      abilityBonuses: { dex: 2, int: 1 },
      languageChoiceCount: 1,
    });
    expect(kernel.classes["open5e:class:5e-2014:srd-2014:srd_bard"]?.profile).toMatchObject({
      hitDie: 8,
      savingThrows: ["dex", "cha"],
      toolChoice: { count: 3 },
      skillChoice: { count: 3 },
    });
  });

  it("keeps a regenerated copy of the active pack readable by hash alias", () => {
    const active = loadActiveRulesKernel();
    const priorHash = "0".repeat(64);
    registerOpen5ePackCompatibilityAlias(priorHash, active.packHash);

    const resolved = loadRulesKernelForPackHash(priorHash);
    expect(resolved?.packHash).toBe(active.packHash);
    expect(resolved?.equipment["open5e:item:5e-2014:srd-2014:srd_bedroll"]?.name).toBe("Bedroll");
  });
});
