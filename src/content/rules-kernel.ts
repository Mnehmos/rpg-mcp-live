import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, sha256 } from "./hash.js";
import {
  ACTIVE_OPEN5E_PACK_DIRECTORY,
  ACTIVE_OPEN5E_PACK_VERSION,
  open5ePackDirectory,
} from "./pack.js";
import {
  compiledEquipmentEffectSchema,
  compiledCurrencyTableSchema,
  compiledSpeciesProfileSchema,
  compiledClassProfileSchema,
  compiledBackgroundProfileSchema,
  compiledContentRecordSchema,
  normalizedContentRecordSchema,
  open5ePackManifestSchema,
} from "./schema.js";
import type {
  CompiledCreatureAttack,
  CompiledEffectProgram,
  CompiledBackgroundProfile,
  CompiledClassProfile,
  CompiledSpellEffect,
  CompiledSpeciesProfile,
  NormalizedAbility,
  NormalizedAlignment,
  NormalizedBackground,
  NormalizedCharacterClass,
  NormalizedCreature,
  NormalizedContentRecord,
  NormalizedFeat,
  NormalizedLanguage,
  NormalizedSpell,
  NormalizedSpellList,
  NormalizedSpellProgression,
  NormalizedSpecies,
  NormalizedSkill,
} from "./schema.js";

type RulesAbility = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface Open5eEquipmentKernelRecord {
  contentKey: string;
  sourceKey: string;
  name: string;
  description: string;
  categoryKey: string;
  categoryName: string;
  weight: number;
  weightUnit: string;
  valueCopper: number | null;
  requiresAttunement: boolean;
  isMagic: boolean;
  rarity: { key: string; name: string; rank: number } | null;
  fidelityTier: 1;
  effectiveTier: 1 | 2;
  weapon: {
    contentKey: string;
    damageDice: string;
    damageTypeKey: string;
    damageTypeName: string;
    range: { normal: number; long: number; unit: string };
    isSimple: boolean;
    isMartial: boolean;
    isImprovised: boolean;
    properties: Array<{ key: string; name: string; type: string | null; detail: string | null }>;
  } | null;
  armor: {
    contentKey: string;
    category: "light" | "medium" | "heavy";
    display: string;
    base: number;
    addDexterityModifier: boolean;
    dexterityModifierCap: number | null;
    grantsStealthDisadvantage: boolean;
    strengthScoreRequired: number | null;
  } | null;
  effects: Array<{ kind: "armor-class-bonus"; value: number; stackingKey: string }>;
}

export interface Open5eCreatureKernelRecord {
  contentKey: string;
  sourceKey: string;
  packHash: string;
  definition: NormalizedCreature;
  attacks: CompiledCreatureAttack[];
  effects: CompiledEffectProgram[];
}

export interface Open5eSpellKernelRecord {
  contentKey: string;
  sourceKey: string;
  packHash: string;
  definition: NormalizedSpell;
  effect: CompiledSpellEffect | null;
  effects: CompiledEffectProgram[];
}

export interface Open5eSpeciesKernelRecord {
  contentKey: string;
  sourceKey: string;
  packHash: string;
  definition: NormalizedSpecies;
  profile: CompiledSpeciesProfile;
}

export interface Open5eClassKernelRecord {
  contentKey: string;
  sourceKey: string;
  packHash: string;
  definition: NormalizedCharacterClass;
  profile: CompiledClassProfile | null;
}

export interface Open5eBackgroundKernelRecord {
  contentKey: string;
  sourceKey: string;
  packHash: string;
  definition: NormalizedBackground;
  profile: CompiledBackgroundProfile;
}

export interface Open5eRulesKernel {
  packVersion: string;
  packHash: string;
  rulesVersion: string;
  apiVersion: "v1" | "v2";
  sourceDocument: string;
  gamesystem: string;
  skills: Readonly<Record<string, RulesAbility>>;
  skillDefinitions: Readonly<Record<string, NormalizedSkill>>;
  equipment: Readonly<Record<string, Open5eEquipmentKernelRecord>>;
  creatures: Readonly<Record<string, Open5eCreatureKernelRecord>>;
  spells: Readonly<Record<string, Open5eSpellKernelRecord>>;
  spellLists: Readonly<Record<string, NormalizedSpellList>>;
  spellProgressions: Readonly<Record<string, NormalizedSpellProgression>>;
  abilities: Readonly<Record<string, NormalizedAbility>>;
  languages: Readonly<Record<string, NormalizedLanguage>>;
  alignments: Readonly<Record<string, NormalizedAlignment>>;
  species: Readonly<Record<string, Open5eSpeciesKernelRecord>>;
  classes: Readonly<Record<string, Open5eClassKernelRecord>>;
  backgrounds: Readonly<Record<string, Open5eBackgroundKernelRecord>>;
  feats: Readonly<Record<string, NormalizedFeat>>;
  currency: Readonly<{
    copperPerCopper: number;
    copperPerSilver: number;
    copperPerElectrum: number;
    copperPerGold: number;
    copperPerPlatinum: number;
  }>;
}

let activeKernel: Open5eRulesKernel | undefined;
const kernelDirectories = Object.freeze([
  open5ePackDirectory("open5e-v2-srd-2014-s7"),
  ACTIVE_OPEN5E_PACK_DIRECTORY,
]);
const kernelsByHash = new Map<string, Open5eRulesKernel>();
const compatiblePackHashAliases = new Map<string, string>();

export function loadActiveRulesKernel(): Open5eRulesKernel {
  activeKernel ??= loadRulesKernel(ACTIVE_OPEN5E_PACK_DIRECTORY);
  kernelsByHash.set(activeKernel.packHash, activeKernel);
  return activeKernel;
}

export function loadRulesKernelForPackHash(packHash: string): Open5eRulesKernel | null {
  const cached = kernelsByHash.get(packHash);
  if (cached) return cached;
  for (const directory of kernelDirectories) {
    const kernel = loadRulesKernel(directory);
    kernelsByHash.set(kernel.packHash, kernel);
    if (kernel.packHash === packHash) return kernel;
  }
  const alias = compatiblePackHashAliases.get(packHash);
  if (alias && alias !== packHash) {
    const aliased = loadRulesKernelForPackHash(alias);
    if (aliased) return aliased;
  }
  return null;
}

/**
 * Keep projections readable when a previously installed copy of the active
 * pack was regenerated with a new hash but the old pack files are no longer
 * present in the deployment image. This is deliberately an in-memory,
 * read-only alias: campaign state and event evidence retain their original
 * identity, and ordinary mutation is still gated to the active rules version.
 */
export function registerOpen5ePackCompatibilityAlias(packHash: string, activePackHash: string): void {
  if (!/^[a-f0-9]{64}$/.test(packHash) || !/^[a-f0-9]{64}$/.test(activePackHash)) {
    throw new Error("Open5e pack compatibility aliases require SHA-256 pack hashes.");
  }
  if (packHash === activePackHash) return;
  const active = loadRulesKernelForPackHash(activePackHash);
  if (!active || active.packHash !== activePackHash) {
    throw new Error(`Cannot register an Open5e compatibility alias for unavailable pack ${activePackHash}.`);
  }
  compatiblePackHashAliases.set(packHash, activePackHash);
}

export function loadRulesKernel(packDirectory: string): Open5eRulesKernel {
  const manifest = open5ePackManifestSchema.parse(
    JSON.parse(readFileSync(join(packDirectory, "manifest.json"), "utf8")) as unknown
  );
  const { packHash, ...hashInput } = manifest;
  const actualPackHash = sha256(canonicalJson(hashInput));
  if (actualPackHash !== packHash) {
    throw new Error(`Open5e rules kernel pack hash mismatch: expected ${packHash}, received ${actualPackHash}.`);
  }
  if (manifest.packVersion !== ACTIVE_OPEN5E_PACK_VERSION && packDirectory === ACTIVE_OPEN5E_PACK_DIRECTORY) {
    throw new Error(`Active Open5e pack version mismatch: ${manifest.packVersion}.`);
  }
  const skillsArtifact = manifest.collections.skills?.normalized;
  const currencyArtifact = manifest.collections.rules?.compiled;
  const itemsArtifact = manifest.collections.items?.normalized;
  const magicItemsArtifact = manifest.collections.magicitems?.normalized;
  const weaponsArtifact = manifest.collections.weapons?.normalized;
  const armorArtifact = manifest.collections.armor?.normalized;
  const equipmentEffectsArtifact = manifest.collections.items?.compiled;
  const creaturesArtifact = manifest.collections.creatures?.normalized;
  const creatureAttacksArtifact = manifest.collections.creatures?.compiled;
  const spellsArtifact = manifest.collections.spells?.normalized;
  const spellEffectsArtifact = manifest.collections.spells?.compiled;
  const spellListsArtifact = manifest.collections.spelllists?.normalized;
  const spellProgressionsArtifact = manifest.collections.spellprogressions?.normalized;
  const abilitiesArtifact = manifest.collections.abilities?.normalized;
  const languagesArtifact = manifest.collections.languages?.normalized;
  const alignmentsArtifact = manifest.collections.alignments?.normalized;
  const speciesArtifact = manifest.collections.species?.normalized;
  const speciesProfilesArtifact = manifest.collections.species?.compiled;
  const classesArtifact = manifest.collections.classes?.normalized;
  const classProfilesArtifact = manifest.collections.classes?.compiled;
  const backgroundsArtifact = manifest.collections.backgrounds?.normalized;
  const backgroundProfilesArtifact = manifest.collections.backgrounds?.compiled;
  const featsArtifact = manifest.collections.feats?.normalized;
  if (
    !skillsArtifact
    || !currencyArtifact
    || !itemsArtifact
    || !magicItemsArtifact
    || !weaponsArtifact
    || !armorArtifact
    || !equipmentEffectsArtifact
    || !creaturesArtifact
    || !creatureAttacksArtifact
    || !spellsArtifact
    || !spellEffectsArtifact
    || !spellListsArtifact
    || !spellProgressionsArtifact
  ) {
    throw new Error("The active Open5e rules kernel requires normalized skills, S2 equipment, S3 creatures, S4 spells, and compiled rules.");
  }
  const characterArtifacts = [
    abilitiesArtifact,
    languagesArtifact,
    alignmentsArtifact,
    speciesArtifact,
    speciesProfilesArtifact,
    classesArtifact,
    classProfilesArtifact,
    backgroundsArtifact,
    backgroundProfilesArtifact,
    featsArtifact,
  ];
  if (characterArtifacts.some(Boolean) && !characterArtifacts.every(Boolean)) {
    throw new Error("An Open5e character-options slice must install all S5 character artifacts together.");
  }

  const skillRecords = readNormalizedKind(packDirectory, skillsArtifact, "skill");
  const currencyRecords = readVerifiedNdjson(packDirectory, currencyArtifact)
    .map((record) => compiledCurrencyTableSchema.parse(record));
  const itemRecords = readNormalizedKind(packDirectory, itemsArtifact, "item");
  const magicItemRecords = readNormalizedKind(packDirectory, magicItemsArtifact, "magic-item");
  const weaponRecords = readNormalizedKind(packDirectory, weaponsArtifact, "weapon");
  const armorRecords = readNormalizedKind(packDirectory, armorArtifact, "armor");
  const equipmentEffects = readVerifiedNdjson(packDirectory, equipmentEffectsArtifact)
    .map((record) => compiledEquipmentEffectSchema.parse(record));
  const creatureRecords = readNormalizedKind(packDirectory, creaturesArtifact, "creature");
  const creatureCompiledRecords = readVerifiedNdjson(packDirectory, creatureAttacksArtifact)
    .map((record) => compiledContentRecordSchema.parse(record));
  const creatureAttackRecords = creatureCompiledRecords
    .filter((record): record is CompiledCreatureAttack => record.kind === "creature-attack");
  const creatureEffectRecords = creatureCompiledRecords
    .filter((record): record is CompiledEffectProgram => record.kind === "effect-program");
  const spellRecords = readNormalizedKind(packDirectory, spellsArtifact, "spell");
  const spellCompiledRecords = readVerifiedNdjson(packDirectory, spellEffectsArtifact)
    .map((record) => compiledContentRecordSchema.parse(record));
  const spellEffectRecords = spellCompiledRecords
    .filter((record): record is CompiledSpellEffect => record.kind === "spell-effect");
  const spellAreaEffectRecords = spellCompiledRecords
    .filter((record): record is CompiledEffectProgram => record.kind === "effect-program");
  const spellListRecords = readNormalizedKind(packDirectory, spellListsArtifact, "spell-list");
  const spellProgressionRecords = readNormalizedKind(packDirectory, spellProgressionsArtifact, "spell-progression");
  const abilityRecords = abilitiesArtifact
    ? readNormalizedKind(packDirectory, abilitiesArtifact, "ability")
    : [];
  const languageRecords = languagesArtifact
    ? readNormalizedKind(packDirectory, languagesArtifact, "language")
    : [];
  const alignmentRecords = alignmentsArtifact
    ? readNormalizedKind(packDirectory, alignmentsArtifact, "alignment")
    : [];
  const speciesRecords = speciesArtifact
    ? readNormalizedKind(packDirectory, speciesArtifact, "species")
    : [];
  const speciesProfileRecords = speciesProfilesArtifact
    ? readVerifiedNdjson(packDirectory, speciesProfilesArtifact).map((record) => compiledSpeciesProfileSchema.parse(record))
    : [];
  const classRecords = classesArtifact
    ? readNormalizedKind(packDirectory, classesArtifact, "class")
    : [];
  const classProfileRecords = classProfilesArtifact
    ? readVerifiedNdjson(packDirectory, classProfilesArtifact).map((record) => compiledClassProfileSchema.parse(record))
    : [];
  const backgroundRecords = backgroundsArtifact
    ? readNormalizedKind(packDirectory, backgroundsArtifact, "background")
    : [];
  const backgroundProfileRecords = backgroundProfilesArtifact
    ? readVerifiedNdjson(packDirectory, backgroundProfilesArtifact).map((record) => compiledBackgroundProfileSchema.parse(record))
    : [];
  const featRecords = featsArtifact
    ? readNormalizedKind(packDirectory, featsArtifact, "feat")
    : [];
  if (currencyRecords.length !== 1) {
    throw new Error(`The Open5e rules kernel expected one currency program; found ${currencyRecords.length}.`);
  }
  const currencyRecord = currencyRecords[0];
  if (!currencyRecord) throw new Error("The Open5e currency program is missing.");

  const skills: Record<string, RulesAbility> = {};
  const skillDefinitions: Record<string, NormalizedSkill> = {};
  for (const skill of skillRecords) {
    if (skill.gamesystem !== manifest.gamesystems[0] || skill.documentKey !== manifest.targetDocumentKey) {
      throw new Error(`Open5e skill escaped the active pack partition: ${skill.contentKey}.`);
    }
    if (skills[skill.engineKey]) {
      throw new Error(`Duplicate Open5e engine skill key: ${skill.engineKey}.`);
    }
    if (skillDefinitions[skill.contentKey]) {
      throw new Error(`Duplicate Open5e skill content key: ${skill.contentKey}.`);
    }
    skills[skill.engineKey] = skill.ability;
    skillDefinitions[skill.contentKey] = deepFreeze(skill);
  }
  const denominationValues = Object.fromEntries(
    currencyRecord.denominations.map((denomination) => [denomination.key, denomination.copperValue])
  ) as Record<"cp" | "sp" | "ep" | "gp" | "pp", number>;
  const weaponsByKey = new Map(weaponRecords.map((record) => [record.contentKey, record]));
  const armorByKey = new Map(armorRecords.map((record) => [record.contentKey, record]));
  const effectsByKey = new Map(equipmentEffects.map((record) => [record.sourceContentKey, record]));
  const equipment: Record<string, Open5eEquipmentKernelRecord> = {};
  for (const item of [...itemRecords, ...magicItemRecords]) {
    const weapon = item.weaponContentKey ? weaponsByKey.get(item.weaponContentKey) : undefined;
    const armor = item.armorContentKey ? armorByKey.get(item.armorContentKey) : undefined;
    if (item.weaponContentKey && !weapon) {
      throw new Error(`${item.contentKey} references missing weapon ${item.weaponContentKey}.`);
    }
    if (item.armorContentKey && !armor) {
      throw new Error(`${item.contentKey} references missing armor ${item.armorContentKey}.`);
    }
    const compiled = effectsByKey.get(item.contentKey);
    if (equipment[item.contentKey]) {
      throw new Error(`Duplicate Open5e equipment content key: ${item.contentKey}.`);
    }
    equipment[item.contentKey] = deepFreeze({
      contentKey: item.contentKey,
      sourceKey: item.sourceKey,
      name: item.name,
      description: item.description,
      categoryKey: item.categoryKey,
      categoryName: item.categoryName,
      weight: item.weight,
      weightUnit: item.weightUnit,
      valueCopper: item.valueCopper,
      requiresAttunement: item.kind === "magic-item" && item.requiresAttunement,
      isMagic: item.kind === "magic-item",
      rarity: item.kind === "magic-item"
        ? { key: item.rarity.key, name: item.rarity.name, rank: item.rarity.rank }
        : null,
      fidelityTier: 1,
      effectiveTier: compiled ? 2 : 1,
      weapon: weapon
        ? {
            contentKey: weapon.contentKey,
            damageDice: weapon.damageDice,
            damageTypeKey: weapon.damageTypeKey,
            damageTypeName: weapon.damageTypeName,
            range: weapon.range,
            isSimple: weapon.isSimple,
            isMartial: weapon.isMartial,
            isImprovised: weapon.isImprovised,
            properties: weapon.properties.map((property) => ({
              key: property.sourceKey,
              name: property.name,
              type: property.propertyType,
              detail: property.detail,
            })),
          }
        : null,
      armor: armor
        ? {
            contentKey: armor.contentKey,
            category: armor.category,
            display: armor.armorClass.display,
            base: armor.armorClass.base,
            addDexterityModifier: armor.armorClass.addDexterityModifier,
            dexterityModifierCap: armor.armorClass.dexterityModifierCap,
            grantsStealthDisadvantage: armor.grantsStealthDisadvantage,
            strengthScoreRequired: armor.strengthScoreRequired,
          }
        : null,
      effects: compiled ? compiled.effects.map((effect) => ({ ...effect })) : [],
    });
  }
  const attacksByCreature = new Map<string, CompiledCreatureAttack[]>();
  for (const attack of creatureAttackRecords) {
    const attacks = attacksByCreature.get(attack.sourceContentKey) ?? [];
    attacks.push(attack);
    attacksByCreature.set(attack.sourceContentKey, attacks);
  }
  const effectsByCreature = groupEffectPrograms(creatureEffectRecords);
  const creatures: Record<string, Open5eCreatureKernelRecord> = {};
  for (const creature of creatureRecords) {
    if (creature.gamesystem !== manifest.gamesystems[0] || creature.documentKey !== manifest.targetDocumentKey) {
      throw new Error(`Open5e creature escaped the active pack partition: ${creature.contentKey}.`);
    }
    const attacks = (attacksByCreature.get(creature.contentKey) ?? [])
      .sort((left, right) => left.key.localeCompare(right.key));
    const effects = (effectsByCreature.get(creature.contentKey) ?? [])
      .sort((left, right) => left.key.localeCompare(right.key));
    for (const attack of attacks) {
      if (attack.documentKey !== creature.documentKey || attack.gamesystem !== creature.gamesystem) {
        throw new Error(`Open5e creature attack provenance diverges: ${attack.contentKey}.`);
      }
    }
    creatures[creature.contentKey] = deepFreeze({
      contentKey: creature.contentKey,
      sourceKey: creature.sourceKey,
      packHash,
      definition: creature,
      attacks,
      effects,
    });
  }
  const spellEffectsBySource = new Map(spellEffectRecords.map((record) => [record.sourceContentKey, record]));
  const spellAreaEffectsBySource = groupEffectPrograms(spellAreaEffectRecords);
  const spells: Record<string, Open5eSpellKernelRecord> = {};
  for (const spell of spellRecords) {
    if (spell.gamesystem !== manifest.gamesystems[0] || spell.documentKey !== manifest.targetDocumentKey) {
      throw new Error(`Open5e spell escaped the active pack partition: ${spell.contentKey}.`);
    }
    const effect = spellEffectsBySource.get(spell.contentKey) ?? null;
    const effects = (spellAreaEffectsBySource.get(spell.contentKey) ?? [])
      .sort((left, right) => left.key.localeCompare(right.key));
    spells[spell.contentKey] = deepFreeze({
      contentKey: spell.contentKey,
      sourceKey: spell.sourceKey,
      packHash,
      definition: spell,
      effect,
      effects,
    });
  }
  const spellLists: Record<string, NormalizedSpellList> = {};
  for (const list of spellListRecords) {
    if (spellLists[list.classSourceKey]) {
      throw new Error(`Duplicate Open5e spell list for ${list.classSourceKey}.`);
    }
    for (const spell of list.spells) {
      if (!spells[spell.contentKey]) throw new Error(`${list.contentKey} references missing spell ${spell.contentKey}.`);
    }
    spellLists[list.classSourceKey] = deepFreeze(list);
  }
  const spellProgressions: Record<string, NormalizedSpellProgression> = {};
  for (const progression of spellProgressionRecords) {
    if (spellProgressions[progression.classSourceKey]) {
      throw new Error(`Duplicate Open5e spell progression for ${progression.classSourceKey}.`);
    }
    spellProgressions[progression.classSourceKey] = deepFreeze(progression);
  }
  const abilities = indexCharacterDefinitions(abilityRecords, "ability");
  const languages = indexCharacterDefinitions(languageRecords, "language");
  const alignments = indexCharacterDefinitions(alignmentRecords, "alignment");
  const feats = indexCharacterDefinitions(featRecords, "feat");
  const speciesProfiles = new Map(speciesProfileRecords.map((profile) => [profile.sourceContentKey, profile]));
  const species: Record<string, Open5eSpeciesKernelRecord> = {};
  for (const definition of speciesRecords) {
    const profile = speciesProfiles.get(definition.contentKey);
    if (!profile) throw new Error(`Open5e species profile is missing for ${definition.contentKey}.`);
    species[definition.contentKey] = deepFreeze({
      contentKey: definition.contentKey,
      sourceKey: definition.sourceKey,
      packHash,
      definition,
      profile,
    });
    speciesProfiles.delete(definition.contentKey);
  }
  if (speciesProfiles.size) throw new Error("Open5e species profiles contain an orphaned source reference.");
  const classProfiles = new Map(classProfileRecords.map((profile) => [profile.sourceContentKey, profile]));
  const classes: Record<string, Open5eClassKernelRecord> = {};
  for (const definition of classRecords) {
    const profile = classProfiles.get(definition.contentKey) ?? null;
    if (!definition.isSubclass && !profile) {
      throw new Error(`Open5e base-class profile is missing for ${definition.contentKey}.`);
    }
    if (definition.isSubclass && profile) {
      throw new Error(`Open5e subclass unexpectedly has a level-one class profile: ${definition.contentKey}.`);
    }
    classes[definition.contentKey] = deepFreeze({
      contentKey: definition.contentKey,
      sourceKey: definition.sourceKey,
      packHash,
      definition,
      profile,
    });
    classProfiles.delete(definition.contentKey);
  }
  if (classProfiles.size) throw new Error("Open5e class profiles contain an orphaned source reference.");
  const backgroundProfiles = new Map(backgroundProfileRecords.map((profile) => [profile.sourceContentKey, profile]));
  const backgrounds: Record<string, Open5eBackgroundKernelRecord> = {};
  for (const definition of backgroundRecords) {
    const profile = backgroundProfiles.get(definition.contentKey);
    if (!profile) throw new Error(`Open5e background profile is missing for ${definition.contentKey}.`);
    backgrounds[definition.contentKey] = deepFreeze({
      contentKey: definition.contentKey,
      sourceKey: definition.sourceKey,
      packHash,
      definition,
      profile,
    });
    backgroundProfiles.delete(definition.contentKey);
  }
  if (backgroundProfiles.size) throw new Error("Open5e background profiles contain an orphaned source reference.");

  return Object.freeze({
    packVersion: manifest.packVersion,
    packHash,
    rulesVersion: `open5e-pack@${packHash}`,
    apiVersion: manifest.sourceApiVersion,
    sourceDocument: manifest.targetDocumentKey,
    gamesystem: manifest.gamesystems[0] as string,
    skills: Object.freeze(skills),
    skillDefinitions: Object.freeze(skillDefinitions),
    equipment: Object.freeze(equipment),
    creatures: Object.freeze(creatures),
    spells: Object.freeze(spells),
    spellLists: Object.freeze(spellLists),
    spellProgressions: Object.freeze(spellProgressions),
    abilities: Object.freeze(abilities),
    languages: Object.freeze(languages),
    alignments: Object.freeze(alignments),
    species: Object.freeze(species),
    classes: Object.freeze(classes),
    backgrounds: Object.freeze(backgrounds),
    feats: Object.freeze(feats),
    currency: Object.freeze({
      copperPerCopper: denominationValues.cp,
      copperPerSilver: denominationValues.sp,
      copperPerElectrum: denominationValues.ep,
      copperPerGold: denominationValues.gp,
      copperPerPlatinum: denominationValues.pp,
    }),
  });
}

function indexCharacterDefinitions<T extends { contentKey: string }>(records: T[], label: string): Record<string, T> {
  const index: Record<string, T> = {};
  for (const record of records) {
    if (index[record.contentKey]) throw new Error(`Duplicate Open5e ${label} content key: ${record.contentKey}.`);
    index[record.contentKey] = deepFreeze(record);
  }
  return index;
}

function groupEffectPrograms(
  records: CompiledEffectProgram[]
): Map<string, CompiledEffectProgram[]> {
  const grouped = new Map<string, CompiledEffectProgram[]>();
  for (const record of records) {
    const programs = grouped.get(record.sourceContentKey) ?? [];
    programs.push(record);
    grouped.set(record.sourceContentKey, programs);
  }
  return grouped;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function readVerifiedNdjson(
  packDirectory: string,
  artifact: { path: string; sha256: string; recordCount: number }
): unknown[] {
  const bytes = readFileSync(join(packDirectory, ...artifact.path.split("/")));
  const actualHash = sha256(bytes);
  if (actualHash !== artifact.sha256) {
    throw new Error(`Open5e rules kernel artifact hash mismatch for ${artifact.path}.`);
  }
  const text = bytes.toString("utf8");
  const records = text ? text.trimEnd().split("\n").map((line) => JSON.parse(line) as unknown) : [];
  if (records.length !== artifact.recordCount) {
    throw new Error(`Open5e rules kernel record count mismatch for ${artifact.path}.`);
  }
  return records;
}

function readNormalizedKind<K extends NormalizedContentRecord["kind"]>(
  packDirectory: string,
  artifact: { path: string; sha256: string; recordCount: number },
  kind: K
): Array<Extract<NormalizedContentRecord, { kind: K }>> {
  return readVerifiedNdjson(packDirectory, artifact)
    .map((record) => normalizedContentRecordSchema.parse(record))
    .filter((record): record is Extract<NormalizedContentRecord, { kind: K }> => record.kind === kind);
}
