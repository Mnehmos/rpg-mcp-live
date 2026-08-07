import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importOpen5eS0, importOpen5eS1, importOpen5eS2, importOpen5eS3, importOpen5eS4 } from "./open5e-import.js";
import { verifyOpen5eS2Pack, verifyOpen5eS3Pack, verifyOpen5eS4Pack } from "./open5e-pack-verify.js";
import { open5ePackManifestSchema } from "./schema.js";

const SOURCE_FETCHED_AT = "2026-08-07T00:00:00.000Z";
const API_BASE_URL = "https://fixture.open5e.test/v2";
const API_V1_BASE_URL = "https://fixture.open5e.test/v1";

describe("Open5e S0 importer", () => {
  it("builds byte-equivalent packs from independent imports and preserves raw payload fields", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "open5e-s0-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "open5e-s0-second-"));
    const firstSource = createFixtureSource();
    const secondSource = createFixtureSource();

    const first = await importOpen5eS0({
      outputRoot: firstRoot,
      packVersion: "fixture-s0",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 1,
      fetchImpl: firstSource.fetchImpl,
      sleep: async () => undefined,
    });
    const second = await importOpen5eS0({
      outputRoot: secondRoot,
      packVersion: "fixture-s0",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 1,
      fetchImpl: secondSource.fetchImpl,
      sleep: async () => undefined,
    });

    expect(first.manifest.packHash).toBe(second.manifest.packHash);
    expect(firstSource.requestedUrls.some((url) => url.includes("page=2"))).toBe(true);
    expect(open5ePackManifestSchema.parse(first.manifest)).toEqual(first.manifest);

    const rawConditions = await readNdjson(join(first.packDirectory, "raw", "conditions.ndjson"));
    expect(rawConditions).toHaveLength(2);
    expect(rawConditions[0]).toMatchObject({ key: "blinded", raw_marker: "preserve-me" });
    expect((rawConditions[0] as { descriptions: unknown[] }).descriptions).toHaveLength(3);

    const normalizedConditions = await readNdjson(join(first.packDirectory, "normalized", "conditions.ndjson"));
    expect(normalizedConditions).toHaveLength(2);
    expect(normalizedConditions.map((record) => (record as { documentKey: string }).documentKey)).toEqual([
      "srd-2014",
      "srd-2014",
    ]);
    expect(normalizedConditions.map((record) => (record as { description: string }).description)).toEqual([
      "2014 blinded text",
      "2014 prone text",
    ]);

    const compiledConditions = await readFile(join(first.packDirectory, "compiled", "conditions.ndjson"), "utf8");
    expect(compiledConditions).toBe("");
    const coverage = await readFile(join(first.packDirectory, "COVERAGE.md"), "utf8");
    expect(coverage).toContain("| conditions | 2 | 2 | 0 |");
    expect(coverage).toContain("open5e:condition:5e-2014:srd-2014:blinded");
    const attribution = await readFile(join(first.packDirectory, "ATTRIBUTION.md"), "utf8");
    expect(attribution).toContain("raw-attribution");
    expect(attribution).toContain("Adventurer's Guide");
  });

  it("retries a transient page failure without changing the resulting pack", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "open5e-s0-retry-"));
    const source = createFixtureSource({ failFirstConditionRequest: true });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const result = await importOpen5eS0({
      outputRoot,
      packVersion: "fixture-retry-s0",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 1,
      maxAttempts: 2,
      fetchImpl: source.fetchImpl,
      sleep,
    });

    expect(result.manifest.collections.conditions?.normalized.recordCount).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("fails the import when required document licensing provenance is missing", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "open5e-s0-provenance-"));
    const source = createFixtureSource({ removeTargetLicenses: true });

    await expect(importOpen5eS0({
      outputRoot,
      packVersion: "fixture-invalid-s0",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 1,
      fetchImpl: source.fetchImpl,
      sleep: async () => undefined,
    })).rejects.toThrow();
  });

  it("builds S1 skills from the pinned SRD variant and compiles the exact currency table", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "open5e-s1-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "open5e-s1-second-"));
    const first = await importOpen5eS1({
      outputRoot: firstRoot,
      packVersion: "fixture-s1",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });
    const second = await importOpen5eS1({
      outputRoot: secondRoot,
      packVersion: "fixture-s1",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });

    expect(first.manifest.packHash).toBe(second.manifest.packHash);
    expect(first.manifest.collections.skills?.raw.recordCount).toBe(2);
    expect(first.manifest.collections.skills?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.rules?.compiled.recordCount).toBe(1);

    const skills = await readNdjson(join(first.packDirectory, "normalized", "skills.ndjson"));
    expect(skills).toEqual([
      expect.objectContaining({
        kind: "skill",
        sourceKey: "animal-handling",
        engineKey: "animalHandling",
        ability: "wis",
        description: "2014 animal handling text",
      }),
    ]);
    const currency = await readNdjson(join(first.packDirectory, "compiled", "rules.ndjson"));
    expect(currency).toEqual([
      expect.objectContaining({
        kind: "currency-table",
        fidelityTier: 2,
        denominations: [
          { key: "cp", name: "Copper", copperValue: 1 },
          { key: "sp", name: "Silver", copperValue: 10 },
          { key: "ep", name: "Electrum", copperValue: 50 },
          { key: "gp", name: "Gold", copperValue: 100 },
          { key: "pp", name: "Platinum", copperValue: 1_000 },
        ],
      }),
    ]);
    const coverage = await readFile(join(first.packDirectory, "COVERAGE.md"), "utf8");
    expect(coverage).toContain("| skills | 2 | 1 | 0 |");
    expect(coverage).toContain("| rules | 1 | 1 | 1 |");
    expect(coverage).toContain("a5e-ag_culture");
  });

  it("fails S1 instead of guessing when the pinned currency table drifts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "open5e-s1-currency-drift-"));
    const source = createFixtureSource({ driftCurrencyTable: true });

    await expect(importOpen5eS1({
      outputRoot,
      packVersion: "fixture-invalid-s1",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: source.fetchImpl,
      sleep: async () => undefined,
    })).rejects.toThrow("Unexpected SRD currency row for sp");
  });

  it("builds deterministic S2 equipment records with closed references and one reviewed shield effect", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "open5e-s2-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "open5e-s2-second-"));
    const first = await importOpen5eS2({
      outputRoot: firstRoot,
      packVersion: "fixture-s2",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });
    const second = await importOpen5eS2({
      outputRoot: secondRoot,
      packVersion: "fixture-s2",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });

    expect(first.manifest.packHash).toBe(second.manifest.packHash);
    expect(first.manifest.collections.items?.normalized.recordCount).toBe(3);
    expect(first.manifest.collections.weapons?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.armor?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.magicitems?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.items?.compiled.recordCount).toBe(1);
    await expect(verifyOpen5eS2Pack(first.packDirectory)).resolves.toMatchObject({
      packHash: first.manifest.packHash,
    });

    const items = await readNdjson(join(first.packDirectory, "normalized", "items.ndjson"));
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKey: "srd_longsword",
        valueCopper: 1_500,
        weaponContentKey: "open5e:weapon:5e-2014:srd-2014:srd_longsword",
      }),
      expect.objectContaining({
        sourceKey: "srd_leather-armor",
        armorContentKey: "open5e:armor:5e-2014:srd-2014:srd_leather-armor",
      }),
    ]));
    const shieldProgram = await readNdjson(join(first.packDirectory, "compiled", "items.ndjson"));
    expect(shieldProgram).toEqual([
      expect.objectContaining({
        kind: "equipment-effect",
        sourceKey: "srd_shield",
        effects: [{ kind: "armor-class-bonus", value: 2, stackingKey: "shield" }],
      }),
    ]);
    const coverage = await readFile(join(first.packDirectory, "COVERAGE.md"), "utf8");
    expect(coverage).toContain("# Open5e S2 Coverage");
    expect(coverage).toContain("Prose-only magic effects");
  });

  it("fails S2 instead of compiling a shield rule after source prose drifts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "open5e-s2-shield-drift-"));
    await expect(importOpen5eS2({
      outputRoot,
      packVersion: "fixture-invalid-s2",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource({ driftShieldDescription: true }).fetchImpl,
      sleep: async () => undefined,
    })).rejects.toThrow("shield source no longer matches");
  });

  it("builds deterministic S3 creature statblocks and compiles only an exact simple attack", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "open5e-s3-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "open5e-s3-second-"));
    const first = await importOpen5eS3({
      outputRoot: firstRoot,
      packVersion: "fixture-s3",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });
    const second = await importOpen5eS3({
      outputRoot: secondRoot,
      packVersion: "fixture-s3",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });

    expect(first.manifest.packHash).toBe(second.manifest.packHash);
    expect(first.manifest.collections.creatures?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.creaturetypes?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.environments?.normalized.recordCount).toBe(2);
    expect(first.manifest.collections.creaturesets?.normalized.recordCount).toBe(1);
    expect(first.manifest.collections.creatures?.compiled.recordCount).toBe(1);
    await expect(verifyOpen5eS3Pack(first.packDirectory)).resolves.toMatchObject({
      packHash: first.manifest.packHash,
    });

    const creatures = await readNdjson(join(first.packDirectory, "normalized", "creatures.ndjson"));
    expect(creatures).toEqual([
      expect.objectContaining({
        sourceKey: "srd_ember-wolf",
        name: "Ember Wolf",
        armorClass: 13,
        hitPoints: 11,
        abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
        creatureSets: [expect.objectContaining({ sourceKey: "fixture-beasts" })],
        environments: [expect.objectContaining({ sourceKey: "caves" })],
        actions: expect.arrayContaining([
          expect.objectContaining({ name: "Multiattack", mechanicsTier: 0 }),
          expect.objectContaining({ name: "Fiery Bite", mechanicsTier: 0 }),
        ]),
      }),
    ]);
    const attacks = await readNdjson(join(first.packDirectory, "compiled", "creatures.ndjson"));
    expect(attacks).toEqual([
      expect.objectContaining({
        kind: "creature-attack",
        name: "Fiery Bite",
        toHit: 4,
        damage: expect.objectContaining({ diceCount: 1, dieSides: 6, bonus: 2, typeKey: "fire" }),
        resolutionScope: "single-target-base-damage",
      }),
    ]);
    const coverage = await readFile(join(first.packDirectory, "COVERAGE.md"), "utf8");
    expect(coverage).toContain("1 exact single-target base-damage attacks");
    expect(coverage).toContain("multiattack");
  });

  it("builds deterministic S4 spells from v2 definitions corroborated by v1 lists and class tables", async () => {
    const firstRoot = await mkdtemp(join(tmpdir(), "open5e-s4-first-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "open5e-s4-second-"));
    const importFixture = (outputRoot: string) => importOpen5eS4({
      outputRoot,
      packVersion: "fixture-s4",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      apiV1BaseUrl: API_V1_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource().fetchImpl,
      sleep: async () => undefined,
    });
    const first = await importFixture(firstRoot);
    const second = await importFixture(secondRoot);

    expect(first.manifest.packHash).toBe(second.manifest.packHash);
    expect(first.manifest.collections.spells).toMatchObject({ sourceApiVersion: "v2" });
    expect(first.manifest.collections.spelllists).toMatchObject({ sourceApiVersion: "v1" });
    expect(first.manifest.collections.spellprogressions).toMatchObject({ sourceApiVersion: "v1" });
    expect(first.manifest.collections.spells?.compiled.recordCount).toBe(1);
    expect(first.manifest.collections.spelllists?.normalized.recordCount).toBe(7);
    expect(first.manifest.collections.spellprogressions?.normalized.recordCount).toBe(8);
    await expect(verifyOpen5eS4Pack(first.packDirectory)).resolves.toMatchObject({
      packHash: first.manifest.packHash,
    });

    const spells = await readNdjson(join(first.packDirectory, "normalized", "spells.ndjson"));
    expect(spells).toEqual([
      expect.objectContaining({
        sourceKey: "srd_fireball",
        name: "Fireball",
        level: 3,
        savingThrowAbility: "dex",
        damageRoll: "8d6",
        classes: expect.arrayContaining([{ sourceKey: "srd_wizard", name: "Wizard" }]),
      }),
    ]);
    const effects = await readNdjson(join(first.packDirectory, "compiled", "spells.ndjson"));
    expect(effects).toEqual([
      expect.objectContaining({
        kind: "spell-effect",
        resolution: "saving-throw",
        saveOnSuccess: "half",
        baseDamage: { kind: "dice", diceCount: 8, dieSides: 6, bonus: 0 },
        slotLevelVariants: { "4": { kind: "dice", diceCount: 9, dieSides: 6, bonus: 0 } },
      }),
    ]);
    const progressions = await readNdjson(join(first.packDirectory, "normalized", "spellprogressions.ndjson"));
    expect(progressions).toEqual(expect.arrayContaining([
      expect.objectContaining({ classSourceKey: "srd_wizard", selectionMode: "spellbook", slotRecovery: "long-rest" }),
      expect.objectContaining({ classSourceKey: "srd_warlock", selectionMode: "known", slotMode: "pact", slotRecovery: "short-or-long-rest" }),
    ]));
  });

  it("fails S4 when a v1 class list diverges from v2 canonical membership", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "open5e-s4-list-drift-"));
    await expect(importOpen5eS4({
      outputRoot,
      packVersion: "fixture-invalid-s4",
      sourceFetchedAt: SOURCE_FETCHED_AT,
      apiBaseUrl: API_BASE_URL,
      apiV1BaseUrl: API_V1_BASE_URL,
      pageSize: 100,
      fetchImpl: createFixtureSource({ driftSpellList: true }).fetchImpl,
      sleep: async () => undefined,
    })).rejects.toThrow("v1 bard spell list diverges");
  });
});

interface FixtureSourceOptions {
  failFirstConditionRequest?: boolean;
  removeTargetLicenses?: boolean;
  driftCurrencyTable?: boolean;
  driftShieldDescription?: boolean;
  driftSpellList?: boolean;
}

function createFixtureSource(options: FixtureSourceOptions = {}): {
  fetchImpl: typeof fetch;
  requestedUrls: string[];
} {
  const requestedUrls: string[] = [];
  let conditionFailed = false;
  const documents = fixtureDocuments(options.removeTargetLicenses ?? false);
  const fetchImpl = vi.fn(async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    requestedUrls.push(url.toString());
    const collection = url.pathname.split("/").filter(Boolean).at(-1);
    if (collection === "conditions") {
      if (options.failFirstConditionRequest && !conditionFailed) {
        conditionFailed = true;
        return fixtureResponse({}, 503);
      }
      const page = Number(url.searchParams.get("page") ?? "1");
      if (page === 1) {
        const next = new URL(url);
        next.searchParams.set("page", "2");
        return fixtureResponse(paginated([fixtureCondition("blinded")], next.toString(), 2));
      }
      return fixtureResponse(paginated([fixtureCondition("prone")], null, 2));
    }
    if (collection === "damagetypes") {
      return fixtureResponse(paginated([fixtureDamageType()], null, 1));
    }
    if (collection === "sizes") {
      return fixtureResponse(paginated([fixtureSize()], null, 1));
    }
    if (collection === "skills") {
      return fixtureResponse(paginated([fixtureSkill(), fixtureA5eSkill()], null, 2));
    }
    if (collection === "rules") {
      return fixtureResponse(paginated([fixtureCurrencyRule(options.driftCurrencyTable ?? false)], null, 1));
    }
    if (collection === "items") {
      return fixtureResponse(paginated(fixtureItems(options.driftShieldDescription ?? false), null, 3));
    }
    if (collection === "weapons") {
      return fixtureResponse(paginated([fixtureWeapon()], null, 1));
    }
    if (collection === "armor") {
      return fixtureResponse(paginated([fixtureArmor()], null, 1));
    }
    if (collection === "magicitems") {
      return fixtureResponse(paginated([fixtureMagicItem()], null, 1));
    }
    if (collection === "weaponproperties") {
      return fixtureResponse(paginated([fixtureWeaponProperty()], null, 1));
    }
    if (collection === "itemrarities") {
      return fixtureResponse(paginated([fixtureItemRarity()], null, 1));
    }
    if (collection === "creaturetypes") {
      return fixtureResponse(paginated([fixtureCreatureType()], null, 1));
    }
    if (collection === "environments") {
      return fixtureResponse(paginated(fixtureEnvironments(), null, 2));
    }
    if (collection === "creaturesets") {
      return fixtureResponse(paginated([fixtureCreatureSet()], null, 1));
    }
    if (collection === "creatures") {
      return fixtureResponse(paginated([fixtureCreature()], null, 1));
    }
    if (collection === "spellschools") {
      return fixtureResponse(paginated([fixtureSpellSchool()], null, 1));
    }
    if (collection === "spells") {
      return fixtureResponse(paginated([fixtureSpell()], null, 1));
    }
    if (collection === "spelllist") {
      return fixtureResponse(paginated(fixtureSpellLists(options.driftSpellList ?? false), null, 7));
    }
    if (collection === "classes") {
      return fixtureResponse(paginated(fixtureCasterClasses(), null, 8));
    }
    if (collection === "documents") {
      const key = url.searchParams.get("key") ?? "";
      const document = documents.get(key);
      return fixtureResponse(paginated(document ? [document] : [], null, document ? 1 : 0));
    }
    return fixtureResponse({ detail: "not found" }, 404);
  }) as unknown as typeof fetch;
  return { fetchImpl, requestedUrls };
}

function fixtureCondition(key: "blinded" | "prone"): Record<string, unknown> {
  return {
    key,
    document: embeddedCoreDocument(),
    icon: key === "blinded" ? {
      name: "Blinded",
      key: "elderberry_blinded",
      file_url: "/static/img/object_icons/elderberry-inn-icons/conditions/blinded.svg",
      alt_text: "A crossed-out eye.",
      attribution: "Designed for Elderberry Inn.",
    } : null,
    descriptions: [
      { desc: `A5E ${key} text`, document: "a5e-ag", gamesystem: "a5e" },
      { desc: `2014 ${key} text`, document: "srd-2014", gamesystem: "5e-2014" },
      { desc: `2024 ${key} text`, document: "srd-2024", gamesystem: "5e-2024" },
    ],
    name: key[0]?.toUpperCase() + key.slice(1),
    ...(key === "blinded" ? { raw_marker: "preserve-me" } : {}),
  };
}

function fixtureDamageType(): Record<string, unknown> {
  return {
    key: "fire",
    descriptions: [
      { desc: "2014 fire text", document: "srd-2014", gamesystem: "5e-2014" },
      { desc: "2024 fire text", document: "srd-2024", gamesystem: "5e-2024" },
    ],
    name: "Fire",
    document: "core",
  };
}

function fixtureSize(): Record<string, unknown> {
  return {
    key: "medium",
    document: embeddedCoreDocument(),
    distance_unit: "feet",
    name: "Medium",
    rank: 3,
    space_diameter: 5,
    suggested_hit_dice: "d8",
  };
}

function fixtureSkill(): Record<string, unknown> {
  return {
    key: "animal-handling",
    descriptions: [
      { desc: "A5E animal handling text", document: "a5e-ag", gamesystem: "a5e" },
      { desc: "2014 animal handling text", document: "srd-2014", gamesystem: "5e-2014" },
      { desc: "2024 animal handling text", document: "srd-2024", gamesystem: "5e-2024" },
    ],
    name: "Animal Handling",
    document: "core",
    ability: "wis",
  };
}

function fixtureA5eSkill(): Record<string, unknown> {
  return {
    key: "a5e-ag_culture",
    descriptions: [
      { desc: "A5E culture text", document: "a5e-ag", gamesystem: "a5e" },
    ],
    name: "Culture",
    document: "a5e-ag",
    ability: "int",
  };
}

function fixtureCurrencyRule(driftCurrencyTable = false): Record<string, unknown> {
  return {
    key: "srd_coins_exchange-rates",
    name: "Training",
    desc: [
      "| Coin | CP | SP | EP | GP | PP |",
      "| --- | --- | --- | --- | --- | --- |",
      "| Copper (cp) | 1 | 1/10 | 1/50 | 1/100 | 1/1,000 |",
      driftCurrencyTable
        ? "| Silver (sp) | 11 | 1 | 1/5 | 1/10 | 1/100 |"
        : "| Silver (sp) | 10 | 1 | 1/5 | 1/10 | 1/100 |",
      "| Electrum (ep) | 50 | 5 | 1 | 1/2 | 1/20 |",
      "| Gold (gp) | 100 | 10 | 2 | 1 | 1/10 |",
      "| Platinum (pp) | 1,000 | 100 | 20 | 10 | 1 |",
    ].join("\n"),
    document: "srd-2014",
    ruleset: "srd_coins",
  };
}

function fixtureItems(driftShieldDescription: boolean): Record<string, unknown>[] {
  const shieldDescription = driftShieldDescription
    ? "A shield now follows different source prose."
    : "A shield is made from wood or metal and is carried in one hand. Wielding a shield increases your Armor Class by 2. You can benefit from only one shield at a time.";
  return [
    fixtureItem({
      key: "srd_shield",
      name: "Shield",
      description: shieldDescription,
      categoryKey: "shield",
      categoryName: "Shield",
      cost: "10.00",
    }),
    fixtureItem({
      key: "srd_longsword",
      name: "Longsword",
      description: "A martial melee weapon.",
      categoryKey: "weapon",
      categoryName: "Weapon",
      cost: "15.00",
      weapon: fixtureWeaponSummary(),
    }),
    fixtureItem({
      key: "srd_leather-armor",
      name: "Leather Armor",
      description: "Light armor.",
      categoryKey: "armor",
      categoryName: "Armor",
      cost: "10.00",
      armor: fixtureArmorSummary(),
    }),
  ];
}

interface FixtureItemOptions {
  key: string;
  name: string;
  description: string;
  categoryKey: string;
  categoryName: string;
  cost: string;
  weapon?: Record<string, unknown>;
  armor?: Record<string, unknown>;
}

function fixtureItem(options: FixtureItemOptions): Record<string, unknown> {
  return {
    key: options.key,
    name: options.name,
    desc: options.description,
    category: { key: options.categoryKey, name: options.categoryName },
    weapon: options.weapon ?? null,
    armor: options.armor ?? null,
    size: { key: "medium", name: "Medium" },
    weight: "3.000",
    weight_unit: "lb",
    cost: options.cost,
    document: embeddedTargetDocument(),
  };
}

function fixtureWeaponProperty(): Record<string, unknown> {
  return {
    key: "srd_versatile",
    name: "Versatile",
    desc: "This weapon can be used with one or two hands.",
    document: "srd-2014",
    type: "versatile",
  };
}

function fixtureWeaponPropertySummary(): Record<string, unknown> {
  return {
    name: "Versatile",
    type: "versatile",
    desc: "This weapon can be used with one or two hands.",
  };
}

function fixtureWeaponSummary(): Record<string, unknown> {
  return {
    name: "Longsword",
    key: "srd_longsword",
    damage_type: { key: "fire", name: "Fire" },
    damage_dice: "1d8",
    properties: [{ property: fixtureWeaponPropertySummary(), detail: "1d10" }],
    is_simple: false,
    is_improvised: false,
    distance_unit: "feet",
  };
}

function fixtureWeapon(): Record<string, unknown> {
  return {
    ...fixtureWeaponSummary(),
    document: embeddedTargetDocument(),
    range: 5,
    long_range: 5,
  };
}

function fixtureArmorSummary(): Record<string, unknown> {
  return {
    name: "Leather Armor",
    key: "srd_leather-armor",
    category: "light",
    ac_base: 11,
    ac_display: "11 + Dex modifier",
    ac_add_dexmod: true,
    ac_cap_dexmod: null,
    grants_stealth_disadvantage: false,
    strength_score_required: null,
  };
}

function fixtureArmor(): Record<string, unknown> {
  return {
    ...fixtureArmorSummary(),
    document: embeddedTargetDocument(),
  };
}

function fixtureItemRarity(): Record<string, unknown> {
  return { key: "rare", name: "Rare", rank: 3 };
}

function fixtureMagicItem(): Record<string, unknown> {
  return {
    key: "srd_flame-tongue",
    name: "Flame Tongue",
    desc: "A magic sword with a prose-only effect.",
    category: { key: "weapon", name: "Weapon" },
    weapon: fixtureWeaponSummary(),
    armor: null,
    size: { key: "medium", name: "Medium" },
    weight: "3.000",
    weight_unit: "lb",
    cost: null,
    rarity: fixtureItemRarity(),
    requires_attunement: true,
    attunement_detail: "by a creature",
    document: embeddedTargetDocument(),
  };
}

function fixtureCreatureType(): Record<string, unknown> {
  return {
    key: "beast",
    name: "Beast",
    document: "core",
    descriptions: [
      { desc: "2014 beasts are natural creatures.", document: "srd-2014", gamesystem: "5e-2014" },
    ],
  };
}

function fixtureEnvironments(): Record<string, unknown>[] {
  return [
    {
      key: "caves",
      name: "Caves",
      desc: "Natural and worked caverns.",
      aquatic: false,
      planar: false,
      interior: true,
      document: "core",
    },
    {
      key: "srd_plane-of-fire",
      name: "Plane of Fire",
      desc: "An elemental plane of fire.",
      aquatic: false,
      planar: true,
      interior: false,
      document: "srd-2014",
    },
  ];
}

function fixtureCreatureSet(): Record<string, unknown> {
  return {
    key: "fixture-beasts",
    name: "Fixture Beasts",
    document: "srd-2014",
    creatures: [{ key: "srd_ember-wolf", name: "Ember Wolf" }],
  };
}

function fixtureCreature(): Record<string, unknown> {
  const abilityScores = {
    strength: 14,
    dexterity: 15,
    constitution: 12,
    intelligence: 3,
    wisdom: 12,
    charisma: 6,
  };
  const modifiers = {
    strength: 2,
    dexterity: 2,
    constitution: 1,
    intelligence: -4,
    wisdom: 1,
    charisma: -2,
  };
  return {
    key: "srd_ember-wolf",
    name: "Ember Wolf",
    document: embeddedTargetDocument(),
    type: { key: "beast", name: "Beast" },
    size: { key: "medium", name: "Medium" },
    challenge_rating: 0.5,
    proficiency_bonus: 2,
    speed_all: {
      unit: "feet",
      walk: 40,
      crawl: 20,
      hover: false,
      fly: 0,
      burrow: 0,
      climb: 20,
      swim: 20,
    },
    category: "Monsters",
    subcategory: null,
    alignment: "unaligned",
    languages: { as_string: "", data: [] },
    armor_class: 13,
    armor_detail: "natural armor",
    hit_points: 11,
    hit_dice: "2d8+2",
    experience_points: 100,
    ability_scores: abilityScores,
    modifiers,
    initiative_bonus: 2,
    saving_throws: { dexterity: 4 },
    saving_throws_all: { ...modifiers, dexterity: 4 },
    skill_bonuses: { perception: 3, stealth: 4 },
    skill_bonuses_all: {
      acrobatics: 2,
      animal_handling: 1,
      arcana: -4,
      athletics: 2,
      deception: -2,
      history: -4,
      insight: 1,
      intimidation: -2,
      investigation: -4,
      medicine: 1,
      nature: -4,
      perception: 3,
      performance: -2,
      persuasion: -2,
      religion: -4,
      sleight_of_hand: 2,
      stealth: 4,
      survival: 1,
    },
    passive_perception: 13,
    resistances_and_immunities: {
      damage_immunities_display: "",
      damage_immunities: [],
      damage_resistances_display: "fire",
      damage_resistances: [{ key: "fire", name: "Fire" }],
      damage_vulnerabilities_display: "",
      damage_vulnerabilities: [],
      condition_immunities_display: "",
      condition_immunities: [],
    },
    normal_sight_range: 10_560,
    darkvision_range: 60,
    blindsight_range: null,
    tremorsense_range: null,
    truesight_range: null,
    actions: [
      {
        name: "Multiattack",
        desc: "The ember wolf makes two fiery bite attacks.",
        attacks: [],
        action_type: "ACTION",
        order_in_statblock: 0,
        legendary_action_cost: null,
        limited_to_form: null,
        usage_limits: null,
      },
      {
        name: "Fiery Bite",
        desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) fire damage.",
        attacks: [{
          name: "Fiery Bite attack",
          attack_type: "WEAPON",
          to_hit_mod: 4,
          reach: 5,
          range: null,
          long_range: null,
          target_creature_only: true,
          damage_die_count: 1,
          damage_die_type: "D6",
          damage_bonus: null,
          damage_type: { key: "fire", name: "Fire" },
          extra_damage_die_count: null,
          extra_damage_die_type: null,
          extra_damage_bonus: null,
          extra_damage_type: null,
          distance_unit: "feet",
        }],
        action_type: "ACTION",
        order_in_statblock: 1,
        legendary_action_cost: null,
        limited_to_form: null,
        usage_limits: null,
      },
    ],
    traits: [{ name: "Keen Hearing and Smell", desc: "The wolf has advantage on related checks." }],
    creaturesets: ["fixture-beasts"],
    environments: [{ key: "caves", name: "Caves" }],
    illustration: null,
  };
}

function fixtureSpellSchool(): Record<string, unknown> {
  return {
    key: "evocation",
    name: "Evocation",
    desc: "Evocation manipulates magical energy.",
    document: "core",
  };
}

function fixtureSpell(): Record<string, unknown> {
  const classSlugs = ["bard", "cleric", "druid", "ranger", "sorcerer", "warlock", "wizard"];
  const option = (type: string, damageRoll: string | null): Record<string, unknown> => ({
    type,
    damage_roll: damageRoll,
    target_count: null,
    duration: null,
    range: null,
    concentration: null,
    shape_size: null,
    desc: null,
  });
  return {
    key: "srd_fireball",
    document: embeddedTargetDocument(),
    casting_options: [option("default", null), option("slot_level_4", "9d6")],
    school: { key: "evocation", name: "Evocation" },
    classes: classSlugs.map((slug) => ({ key: `srd_${slug}`, name: titleCaseFixture(slug) })),
    range_unit: "feet",
    shape_size_unit: "feet",
    name: "Fireball",
    desc: "Each creature in the area must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
    level: 3,
    higher_level: "When cast with a 4th-level slot, the damage increases to 9d6.",
    target_type: "point",
    range_text: "150 feet",
    range: 150,
    ritual: false,
    casting_time: "action",
    reaction_condition: null,
    verbal: true,
    somatic: true,
    material: true,
    material_specified: "A tiny ball of bat guano and sulfur.",
    material_cost: null,
    material_consumed: false,
    target_count: 1,
    saving_throw_ability: "Dexterity",
    attack_roll: false,
    damage_roll: "8d6",
    damage_types: ["fire"],
    duration: "instantaneous",
    shape_type: "sphere",
    shape_size: 20,
    concentration: false,
  };
}

function fixtureSpellLists(driftBard: boolean): Record<string, unknown>[] {
  return ["bard", "cleric", "druid", "ranger", "sorcerer", "warlock", "wizard"].map((slug) => ({
    slug,
    name: titleCaseFixture(slug),
    desc: `${titleCaseFixture(slug)} spells.`,
    spells: driftBard && slug === "bard" ? [] : ["fireball"],
    document__slug: "wotc-srd",
    document__title: "Systems Reference Document",
    document__license_url: "https://example.test/license",
    document__url: "https://example.test/wotc-srd",
  }));
}

function fixtureCasterClasses(): Record<string, unknown>[] {
  const abilities: Record<string, string> = {
    bard: "Charisma",
    cleric: "Wisdom",
    druid: "Wisdom",
    paladin: "Charisma",
    ranger: "Wisdom",
    sorcerer: "Charisma",
    warlock: "Charisma",
    wizard: "Intelligence",
  };
  return Object.entries(abilities).map(([slug, ability]) => ({
    name: titleCaseFixture(slug),
    slug,
    desc: `${titleCaseFixture(slug)} class fixture.`,
    table: fixtureSpellProgressionTable(slug),
    spellcasting_ability: ability,
    document__slug: "wotc-srd",
    document__title: "Systems Reference Document",
    document__license_url: "https://example.test/license",
    document__url: "https://example.test/wotc-srd",
  }));
}

function fixtureSpellProgressionTable(slug: string): string {
  const known = ["bard", "ranger", "sorcerer"].includes(slug);
  const cantrips = !["paladin", "ranger"].includes(slug);
  if (slug === "warlock") {
    const headers = ["Level", "Cantrips Known", "Spells Known", "Spell Slots", "Slot Level"];
    const rows = Array.from({ length: 20 }, (_, index) => [
      ordinalFixture(index + 1),
      "2",
      String(Math.min(15, index + 2)),
      index < 1 ? "1" : "2",
      ordinalFixture(Math.min(5, 1 + Math.floor(index / 4))),
    ]);
    return markdownTableFixture(headers, rows);
  }
  const headers = [
    "Level",
    ...(cantrips ? ["Cantrips Known"] : []),
    ...(known ? ["Spells Known"] : []),
    "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th",
  ];
  const halfCaster = slug === "paladin" || slug === "ranger";
  const rows = Array.from({ length: 20 }, (_, index) => [
    ordinalFixture(index + 1),
    ...(cantrips ? ["2"] : []),
    ...(known ? [String(index + 2)] : []),
    halfCaster && index === 0 ? "-" : "2",
    ...Array.from({ length: 8 }, () => "-"),
  ]);
  return markdownTableFixture(headers, rows);
}

function markdownTableFixture(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function ordinalFixture(value: number): string {
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : value % 10 === 1
      ? "st"
      : value % 10 === 2
        ? "nd"
        : value % 10 === 3
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

function titleCaseFixture(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function embeddedCoreDocument(): Record<string, unknown> {
  return {
    name: "5e Core Concepts",
    key: "core",
    type: "MISC",
    display_name: "5e Core",
    publisher: { name: "Open5e", key: "open5e" },
    gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
    permalink: "https://example.test/core",
  };
}

function embeddedTargetDocument(): Record<string, unknown> {
  return {
    name: "System Reference Document 5.1",
    key: "srd-2014",
    type: "SOURCE",
    display_name: "System Reference Document 5.1",
    publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
    gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
    permalink: "https://example.test/srd-2014",
  };
}

function fixtureDocuments(removeTargetLicenses: boolean): Map<string, Record<string, unknown>> {
  return new Map([
    ["a5e-ag", fixtureDocument("a5e-ag", "Adventurer's Guide", "a5e", "en-publishing", ["ogl-10a"])],
    ["core", fixtureDocument("core", "5e Core", "5e-2014", "open5e", ["cc-by-40", "ogl-10a"])],
    ["elderberry-inn-icons", fixtureDocument("elderberry-inn-icons", "Elderberry Inn Icons", "5e-2014", "open5e", ["cc0"])],
    ["srd-2014", fixtureDocument(
      "srd-2014",
      "System Reference Document 5.1",
      "5e-2014",
      "wizards-of-the-coast",
      removeTargetLicenses ? [] : ["cc-by-40", "ogl-10a"]
    )],
    ["srd-2024", fixtureDocument("srd-2024", "System Reference Document 5.2", "5e-2024", "wizards-of-the-coast", ["cc-by-40"])],
  ]);
}

function fixtureDocument(
  key: string,
  displayName: string,
  gamesystem: string,
  publisher: string,
  licenses: string[]
): Record<string, unknown> {
  return {
    key,
    licenses: licenses.map((license) => ({
      key: license,
      name: license === "cc-by-40"
        ? "Creative Commons Attribution 4.0"
        : license === "cc0"
          ? "Creative Commons Zero v1.0 Universal"
          : "OPEN GAME LICENSE Version 1.0a",
    })),
    publisher: { key: publisher, name: publisher },
    gamesystem: { key: gamesystem, name: gamesystem },
    display_name: displayName,
    name: displayName,
    desc: `${displayName} fixture`,
    type: key === "core" ? "MISC" : "SOURCE",
    author: publisher,
    publication_date: "2024-01-01T00:00:00",
    permalink: `https://example.test/${key}`,
    distance_unit: "feet",
    weight_unit: "lb",
  };
}

function paginated(results: unknown[], next: string | null, count: number): Record<string, unknown> {
  return { count, next, previous: null, results };
}

function fixtureResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function readNdjson(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  return text.trim() ? text.trim().split("\n").map((line) => JSON.parse(line) as unknown) : [];
}
