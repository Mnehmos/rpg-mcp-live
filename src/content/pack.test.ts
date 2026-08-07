import { describe, expect, it } from "vitest";
import { loadActiveOpen5eContentPack } from "./pack.js";
import { ContentAccessError, Open5eContentResolver, type ContentPolicy } from "./resolve.js";
import { OPEN5E_COLLECTIONS } from "./schema.js";

const EXPECTED_HASH = "56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f";

const hostedPolicy: ContentPolicy = {
  gamesystem: "5e-2014",
  allowedLicenses: ["cc-by-40", "cc0"],
  allowedDocuments: ["srd-2014", "core", "elderberry-inn-icons"],
};

describe("Open5e S8 content store", () => {
  it("loads the verified pack into immutable normalized and compiled indexes", async () => {
    const pack = await loadActiveOpen5eContentPack();

    expect(pack.descriptor.packHash).toBe(EXPECTED_HASH);
    expect(pack.descriptor.rulesVersion).toBe(`open5e-pack@${EXPECTED_HASH}`);
    expect(pack.collectionNames()).toEqual(OPEN5E_COLLECTIONS);
    expect(pack.records("skills")).toHaveLength(56);
    expect(pack.records("rules")).toHaveLength(283);
    expect(pack.records("rulesets")).toHaveLength(52);
    expect(pack.records("sections")).toHaveLength(45);
    expect(pack.records("planes")).toHaveLength(8);
    expect(pack.records("items")).toHaveLength(440);
    expect(pack.records("magicitems")).toHaveLength(2_319);
    expect(pack.records("creatures")).toHaveLength(3_541);
    expect(pack.records("spells")).toHaveLength(1_955);
    expect(pack.records("spelllists")).toHaveLength(7);
    expect(pack.records("spellprogressions")).toHaveLength(8);
    expect(pack.records("abilities")).toHaveLength(18);
    expect(pack.records("languages")).toHaveLength(19);
    expect(pack.records("alignments")).toHaveLength(18);
    expect(pack.records("species")).toHaveLength(63);
    expect(pack.records("classes")).toHaveLength(151);
    expect(pack.records("backgrounds")).toHaveLength(58);
    expect(pack.compiledRecords().filter((record) => record.kind === "background-profile")).toHaveLength(27);
    expect(pack.records("feats")).toHaveLength(91);
    expect(Object.isFrozen(pack.records("skills")[0])).toBe(true);
  });

  it("exposes reviewed spell effects while keeping prose-only spells non-executable", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const resolver = new Open5eContentResolver(pack, hostedPolicy);
    const rulesVersion = pack.descriptor.rulesVersion;
    const fireball = resolver.get("open5e:spell:5e-2014:srd-2014:srd_fireball", rulesVersion);
    const magicMissile = resolver.get("open5e:spell:5e-2014:srd-2014:srd_magic-missile", rulesVersion);

    expect(fireball.effectiveTier).toBe(2);
    expect(fireball.compiled).toMatchObject({
      kind: "spell-effect",
      resolution: "saving-throw",
      saveOnSuccess: "half",
      baseDamage: { kind: "dice", diceCount: 8, dieSides: 6, bonus: 0 },
      slotLevelVariants: { "4": { kind: "dice", diceCount: 9, dieSides: 6, bonus: 0 } },
    });
    expect(magicMissile.effectiveTier).toBe(1);
    expect(magicMissile.compiled).toBeNull();
    expectAccessCode(
      () => resolver.resolveAtTier(magicMissile.normalized.contentKey, 2, rulesVersion),
      "content_tier_insufficient"
    );
  });

  it("exposes full creature statblocks and every compiled attack program by source", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const resolver = new Open5eContentResolver(pack, hostedPolicy);
    const goblin = resolver.get(
      "open5e:creature:5e-2014:srd-2014:srd_goblin",
      pack.descriptor.rulesVersion
    );

    expect(goblin.normalized).toMatchObject({
      kind: "creature",
      name: "Goblin",
      armorClass: 15,
      hitPoints: 7,
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    });
    expect(goblin.effectiveTier).toBe(2);
    expect(goblin.compiledPrograms.length).toBeGreaterThan(0);
    expect(goblin.compiledPrograms.some((program) => program.kind === "creature-attack")).toBe(true);
  });

  it("resolves typed equipment and keeps prose-only magic effects non-executable", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const resolver = new Open5eContentResolver(pack, hostedPolicy);
    const rulesVersion = pack.descriptor.rulesVersion;
    const shield = resolver.get("open5e:item:5e-2014:srd-2014:srd_shield", rulesVersion);
    const flameTongue = resolver.get(
      "open5e:magic-item:5e-2014:srd-2014:srd_flame-tongue-longsword",
      rulesVersion
    );

    expect(shield.effectiveTier).toBe(2);
    expect(shield.compiled).toMatchObject({
      kind: "equipment-effect",
      effects: [{ kind: "armor-class-bonus", value: 2, stackingKey: "shield" }],
    });
    expect(flameTongue.effectiveTier).toBe(1);
    expect(flameTongue.compiled).toBeNull();
    expectAccessCode(
      () => resolver.resolveAtTier(flameTongue.normalized.contentKey, 2, rulesVersion),
      "content_tier_insufficient"
    );
  });

  it("returns effective fidelity and the deterministic currency program", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const resolver = new Open5eContentResolver(pack, hostedPolicy);
    const rulesVersion = pack.descriptor.rulesVersion;
    const skill = resolver.get("open5e:skill:5e-2014:srd-2014:animal-handling", rulesVersion);
    const currency = resolver.get(
      "open5e:rule:5e-2014:srd-2014:srd_coins_exchange-rates",
      rulesVersion
    );

    expect(skill.effectiveTier).toBe(1);
    expect(skill.compiled).toBeNull();
    expect(currency.effectiveTier).toBe(2);
    expect(currency.compiled).toMatchObject({
      kind: "currency-table",
      denominations: [
        { key: "cp", copperValue: 1 },
        { key: "sp", copperValue: 10 },
        { key: "ep", copperValue: 50 },
        { key: "gp", copperValue: 100 },
        { key: "pp", copperValue: 1_000 },
      ],
    });
  });

  it("gates game systems, documents, licenses, and campaign pack identity with stable codes", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const rulesVersion = pack.descriptor.rulesVersion;
    const resolver = new Open5eContentResolver(pack, hostedPolicy);

    expectAccessCode(
      () => resolver.get("open5e:document:a5e:a5e-ag:a5e-ag", rulesVersion),
      "content_gamesystem_forbidden"
    );
    const documentRestricted = new Open5eContentResolver(pack, {
      ...hostedPolicy,
      allowedDocuments: ["core"],
    });
    expectAccessCode(
      () => documentRestricted.get("open5e:skill:5e-2014:srd-2014:athletics", rulesVersion),
      "content_document_forbidden"
    );
    const licenseRestricted = new Open5eContentResolver(pack, {
      ...hostedPolicy,
      allowedLicenses: ["ogl-only-not-installed"],
    });
    expectAccessCode(
      () => licenseRestricted.get("open5e:skill:5e-2014:srd-2014:athletics", rulesVersion),
      "content_license_forbidden"
    );
    expectAccessCode(
      () => resolver.get("open5e:skill:5e-2014:srd-2014:athletics", "open5e-pack@missing"),
      "content_pack_not_installed"
    );
  });

  it("keeps tier-zero conditions reference-only and searches only policy-allowed records", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const resolver = new Open5eContentResolver(pack, hostedPolicy);
    const rulesVersion = pack.descriptor.rulesVersion;
    const conditionKey = "open5e:condition:5e-2014:srd-2014:blinded";

    expect(resolver.get(conditionKey, rulesVersion).effectiveTier).toBe(0);
    expectAccessCode(
      () => resolver.resolveAtTier(conditionKey, 1, rulesVersion),
      "content_tier_insufficient"
    );
    const search = resolver.search({ query: "animal", collection: "skills", limit: 10 }, rulesVersion);
    expect(search.map((result) => result.normalized.contentKey)).toEqual([
      "open5e:skill:5e-2014:srd-2014:animal-handling",
    ]);
    expect(resolver.search({ query: "culture", limit: 10 }, rulesVersion)).toEqual([]);
  });
});

function expectAccessCode(action: () => unknown, code: ContentAccessError["code"]): void {
  try {
    action();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ContentAccessError);
    expect((error as ContentAccessError).code).toBe(code);
  }
}
