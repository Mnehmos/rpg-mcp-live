import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  compiledContentRecordSchema,
  normalizedContentRecordSchema,
  open5ePackManifestSchema,
  type CompiledContentRecord,
  type CompiledCurrencyTable,
  type CompiledCreatureAttack,
  type CompiledBackgroundProfile,
  type CompiledClassProfile,
  type CompiledEquipmentEffect,
  type CompiledSpellEffect,
  type CompiledSpeciesProfile,
  type NormalizedAbility,
  type NormalizedAlignment,
  type NormalizedArmor,
  type NormalizedBackground,
  type NormalizedCharacterClass,
  type NormalizedCondition,
  type NormalizedContentRecord,
  type NormalizedCreature,
  type NormalizedCreatureSet,
  type NormalizedCreatureType,
  type NormalizedDamageType,
  type NormalizedDocument,
  type NormalizedEnvironment,
  type NormalizedFeat,
  type NormalizedItem,
  type NormalizedItemRarity,
  type NormalizedMagicItem,
  type NormalizedLanguage,
  type NormalizedPlane,
  type NormalizedRule,
  type NormalizedRuleset,
  type NormalizedSection,
  type NormalizedSize,
  type NormalizedSkill,
  type NormalizedSpell,
  type NormalizedSpellList,
  type NormalizedSpellProgression,
  type NormalizedSpellSchool,
  type NormalizedSpecies,
  type NormalizedWeapon,
  type NormalizedWeaponProperty,
  type Open5eCollection,
  type Open5ePackManifest,
} from "./schema.js";
import { canonicalJson, sha256 } from "./hash.js";
import { compileOpen5eEffectPrograms } from "./effect-compiler.js";

const S0_COLLECTIONS: Open5eCollection[] = [
  "conditions",
  "damagetypes",
  "sizes",
  "documents",
];
const S1_COLLECTIONS: Open5eCollection[] = [...S0_COLLECTIONS, "skills", "rules"];
const S2_COLLECTIONS: Open5eCollection[] = [
  ...S1_COLLECTIONS,
  "items",
  "weapons",
  "armor",
  "magicitems",
  "weaponproperties",
  "itemrarities",
];
const S3_COLLECTIONS: Open5eCollection[] = [
  ...S2_COLLECTIONS,
  "creaturetypes",
  "environments",
  "creaturesets",
  "creatures",
];
const S4_COLLECTIONS: Open5eCollection[] = [
  ...S3_COLLECTIONS,
  "spellschools",
  "spells",
  "spelllists",
  "spellprogressions",
];
const S5_COLLECTIONS: Open5eCollection[] = [
  ...S4_COLLECTIONS,
  "abilities",
  "languages",
  "alignments",
  "species",
  "classes",
  "backgrounds",
  "feats",
];
const S6_COLLECTIONS: Open5eCollection[] = [
  ...S5_COLLECTIONS,
  "rulesets",
  "sections",
  "planes",
];
const S7_COLLECTIONS: Open5eCollection[] = [...S6_COLLECTIONS];
const SRD_SPELLCASTING_CLASSES = [
  "bard",
  "cleric",
  "druid",
  "paladin",
  "ranger",
  "sorcerer",
  "warlock",
  "wizard",
] as const;
const REVIEWED_IMMEDIATE_PRIMARY_DAMAGE_SPELLS = new Set([
  "srd_arcane-sword",
  "srd_blight",
  "srd_burning-hands",
  "srd_call-lightning",
  "srd_chill-touch",
  "srd_circle-of-death",
  "srd_cone-of-cold",
  "srd_disintegrate",
  "srd_eldritch-blast",
  "srd_finger-of-death",
  "srd_fire-bolt",
  "srd_fire-storm",
  "srd_fireball",
  "srd_freezing-sphere",
  "srd_guiding-bolt",
  "srd_harm",
  "srd_hellish-rebuke",
  "srd_incendiary-cloud",
  "srd_insect-plague",
  "srd_lightning-bolt",
  "srd_magic-missile",
  "srd_produce-flame",
  "srd_ray-of-frost",
  "srd_scorching-ray",
  "srd_shatter",
  "srd_shocking-grasp",
  "srd_sunbeam",
  "srd_sunburst",
  "srd_thunderwave",
  "srd_vampiric-touch",
  "srd_wall-of-fire",
  "srd_wall-of-ice",
  "srd_wall-of-thorns",
  "srd_wind-wall",
]);
const CURRENCY_RULE_KEY = "srd_coins_exchange-rates";
const SHIELD_ITEM_KEY = "srd_shield";

const rawPublisherSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
});

const rawGamesystemSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
});

const rawLicenseSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
});

const rawEmbeddedDocumentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  display_name: z.string().min(1),
  publisher: rawPublisherSchema,
  gamesystem: rawGamesystemSchema,
  permalink: z.string().url(),
}).passthrough();

const rawDescriptionSchema = z.object({
  desc: z.string().min(1),
  document: z.string().min(1),
  gamesystem: z.string().min(1),
}).passthrough();

const rawConditionIconSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  file_url: z.string().min(1),
  alt_text: z.string().min(1),
  attribution: z.string().min(1),
}).passthrough();

const rawConditionSchema = z.object({
  key: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
  icon: rawConditionIconSchema.nullable(),
  descriptions: z.array(rawDescriptionSchema).min(1),
  name: z.string().min(1),
}).passthrough();

const rawDamageTypeSchema = z.object({
  key: z.string().min(1),
  document: z.string().min(1),
  descriptions: z.array(rawDescriptionSchema).min(1),
  name: z.string().min(1),
}).passthrough();

const rawSizeSchema = z.object({
  key: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
  distance_unit: z.string().min(1),
  name: z.string().min(1),
  rank: z.number().int().nonnegative(),
  space_diameter: z.number().positive(),
  suggested_hit_dice: z.string().min(1),
}).passthrough();

const rawSkillSchema = z.object({
  key: z.string().min(1),
  descriptions: z.array(rawDescriptionSchema).min(1),
  name: z.string().min(1),
  document: z.string().min(1),
  ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
}).passthrough();

const rawRuleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  document: z.string().min(1),
  ruleset: z.string().min(1),
  index: z.number().int().nonnegative().optional(),
  initialHeaderLevel: z.number().int().nonnegative().optional(),
  crossreferences: z.object({ to: z.array(z.unknown()) }).passthrough().optional(),
}).passthrough();

const rawRulesetSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string(),
  document: rawEmbeddedDocumentSchema,
  rules: z.array(rawRuleSchema),
  crossreferences: z.object({ to: z.array(z.unknown()) }).passthrough().optional(),
}).passthrough();

const rawV1ReferenceFields = {
  slug: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  document__slug: z.string().min(1),
  document__title: z.string().min(1),
  document__url: z.string().min(1),
  parent: z.string().min(1).nullable(),
};

const rawV1SectionSchema = z.object({
  ...rawV1ReferenceFields,
  document__license_url: z.string().min(1),
}).passthrough();

const rawV1PlaneSchema = z.object(rawV1ReferenceFields).passthrough();

const rawSpeciesTraitSchema = z.object({
  name: z.string().min(1),
  desc: z.string().min(1),
  type: z.enum(["ABILITY_MODS", "SIZE", "SPEED"]).nullable(),
  order: z.number().int().nullable(),
}).passthrough();

const rawSpeciesSchema = z.object({
  key: z.string().min(1),
  is_subspecies: z.boolean(),
  document: rawEmbeddedDocumentSchema,
  traits: z.array(rawSpeciesTraitSchema),
  name: z.string().min(1),
  desc: z.string(),
  subspecies_of: z.string().min(1).nullable(),
}).passthrough();

const rawClassFeatureSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string(),
  feature_type: z.enum([
    "CORE_TRAITS_TABLE",
    "CLASS_LEVEL_FEATURE",
    "CLASS_FEATURE_OPTION_LIST",
    "CLASS_TABLE_DATA",
    "PROFICIENCIES",
    "PROFICIENCY_BONUS",
    "STARTING_EQUIPMENT",
    "SPELL_SLOTS",
  ]),
  gained_at: z.array(z.object({
    level: z.number().int().min(0).max(20),
    detail: z.string().nullable(),
  }).passthrough()),
  data_for_class_table: z.array(z.object({
    level: z.number().int().min(0).max(20),
    column_value: z.string().min(1),
  }).passthrough()),
}).passthrough();

const rawAbilitySummarySchema = z.object({
  name: z.string().min(1),
}).passthrough();

const rawClassSummarySchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
}).passthrough();

const rawCharacterClassSchema = z.object({
  key: z.string().min(1),
  features: z.array(rawClassFeatureSchema),
  document: rawEmbeddedDocumentSchema,
  saving_throws: z.array(rawAbilitySummarySchema),
  subclass_of: rawClassSummarySchema.nullable(),
  name: z.string().min(1),
  desc: z.string(),
  hit_dice: z.string().nullable(),
  caster_type: z.string().nullable(),
  primary_abilities: z.array(rawAbilitySummarySchema),
}).passthrough();

const rawBackgroundBenefitSchema = z.object({
  name: z.string().min(1),
  desc: z.string().min(1),
  type: z.string().min(1),
}).passthrough();

const rawBackgroundSchema = z.object({
  key: z.string().min(1),
  benefits: z.array(rawBackgroundBenefitSchema),
  document: rawEmbeddedDocumentSchema,
  name: z.string().min(1),
  desc: z.string().min(1),
}).passthrough();

const rawCorpusBackgroundSchema = rawBackgroundSchema.extend({
  desc: z.string(),
});

const rawFeatSchema = z.object({
  key: z.string().min(1),
  has_prerequisite: z.boolean(),
  benefits: z.array(z.object({ desc: z.string().min(1) }).passthrough()),
  document: rawEmbeddedDocumentSchema,
  name: z.string().min(1),
  desc: z.string().min(1),
  prerequisite: z.string(),
  type: z.enum(["GENERAL", "ORIGIN", "FIGHTING_STYLE", "EPIC_BOON"]),
}).passthrough();

const rawLanguageSchema = z.object({
  key: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
  name: z.string().min(1),
  desc: z.string(),
  is_exotic: z.boolean(),
  is_secret: z.boolean(),
  script_language: z.string().min(1).nullable(),
}).passthrough();

const rawAlignmentSchema = z.object({
  key: z.string().min(1),
  morality: z.enum(["good", "neutral", "evil"]),
  societal_attitude: z.enum(["lawful", "neutral", "chaotic"]),
  short_name: z.string().min(1).max(2),
  descriptions: z.array(rawDescriptionSchema).min(1),
  document: rawEmbeddedDocumentSchema,
}).passthrough();

const rawAbilitySchema = z.object({
  key: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  descriptions: z.array(rawDescriptionSchema).min(1),
  skills: z.array(rawSkillSchema),
  name: z.string().min(1),
  short_desc: z.string().min(1),
  document: z.string().min(1),
}).passthrough();

const rawKeyNameSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

const rawDamageTypeSummarySchema = rawKeyNameSchema;

const rawWeaponPropertySummarySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).nullable(),
  desc: z.string().min(1),
}).passthrough();

const rawWeaponPropertyAssignmentSchema = z.object({
  property: rawWeaponPropertySummarySchema,
  detail: z.string().min(1).nullable(),
}).passthrough();

const rawWeaponSummarySchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  damage_type: rawDamageTypeSummarySchema,
  damage_dice: z.string().min(1),
  properties: z.array(rawWeaponPropertyAssignmentSchema),
  is_simple: z.boolean(),
  is_improvised: z.boolean(),
  distance_unit: z.string().min(1),
}).passthrough();

const rawArmorSummarySchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1),
  category: z.enum(["light", "medium", "heavy"]),
  ac_base: z.number().int().positive(),
  ac_display: z.string().min(1),
  ac_add_dexmod: z.boolean(),
  ac_cap_dexmod: z.number().int().nonnegative().nullable(),
  grants_stealth_disadvantage: z.boolean(),
  strength_score_required: z.number().int().nonnegative().nullable(),
}).passthrough();

const rawPhysicalItemFields = {
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string(),
  category: rawKeyNameSchema,
  weapon: rawWeaponSummarySchema.nullable(),
  armor: rawArmorSummarySchema.nullable(),
  size: rawKeyNameSchema,
  weight: z.string().regex(/^\d+\.\d{3}$/),
  weight_unit: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
};

const rawItemSchema = z.object({
  ...rawPhysicalItemFields,
  cost: z.string().regex(/^\d+\.\d{2}$/),
}).passthrough();

const rawItemRaritySummarySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  rank: z.number().int().positive(),
}).passthrough();

const rawMagicItemSchema = z.object({
  ...rawPhysicalItemFields,
  cost: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  rarity: rawItemRaritySummarySchema,
  requires_attunement: z.boolean(),
  attunement_detail: z.string().min(1).nullable(),
}).passthrough();

const rawWeaponSchema = z.object({
  key: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
  properties: z.array(rawWeaponPropertyAssignmentSchema),
  damage_type: rawDamageTypeSummarySchema,
  distance_unit: z.string().min(1),
  name: z.string().min(1),
  damage_dice: z.string().min(1),
  range: z.number().int().nonnegative(),
  long_range: z.number().int().nonnegative(),
  is_simple: z.boolean(),
  is_improvised: z.boolean(),
}).passthrough();

const rawArmorSchema = z.object({
  key: z.string().min(1),
  ac_display: z.string().min(1),
  category: z.enum(["light", "medium", "heavy"]),
  document: rawEmbeddedDocumentSchema,
  name: z.string().min(1),
  grants_stealth_disadvantage: z.boolean(),
  strength_score_required: z.number().int().nonnegative().nullable(),
  ac_base: z.number().int().positive(),
  ac_add_dexmod: z.boolean(),
  ac_cap_dexmod: z.number().int().nonnegative().nullable(),
}).passthrough();

const rawWeaponPropertySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  document: z.string().min(1),
  type: z.string().min(1).nullable(),
}).passthrough();

const rawItemRaritySchema = rawItemRaritySummarySchema;

const rawCreatureTypeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  document: z.string().min(1),
  descriptions: z.array(rawDescriptionSchema).min(1),
}).passthrough();

const rawEnvironmentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string(),
  aquatic: z.boolean(),
  planar: z.boolean(),
  interior: z.boolean(),
  document: z.string().min(1),
}).passthrough();

const rawCreatureSetCreatureSummarySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

const rawCreatureSetSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  document: z.string().min(1),
  creatures: z.array(rawCreatureSetCreatureSummarySchema),
}).passthrough();

const rawCreatureActionAttackSchema = z.object({
  name: z.string().min(1),
  attack_type: z.enum(["WEAPON", "SPELL"]),
  to_hit_mod: z.number().int(),
  reach: z.number().nonnegative().nullable(),
  range: z.number().nonnegative().nullable(),
  long_range: z.number().nonnegative().nullable(),
  target_creature_only: z.boolean(),
  damage_die_count: z.number().int().positive().nullable(),
  damage_die_type: z.string().min(1).nullable(),
  damage_bonus: z.number().int().nullable(),
  damage_type: rawDamageTypeSummarySchema.nullable(),
  extra_damage_die_count: z.number().int().positive().nullable(),
  extra_damage_die_type: z.string().min(1).nullable(),
  extra_damage_bonus: z.number().int().nullable(),
  extra_damage_type: rawDamageTypeSummarySchema.nullable(),
  distance_unit: z.string().min(1),
}).passthrough();

const rawCreatureActionSchema = z.object({
  name: z.string().min(1),
  desc: z.string(),
  attacks: z.array(rawCreatureActionAttackSchema),
  action_type: z.string().min(1).nullable(),
  order_in_statblock: z.number().int().nullable(),
  legendary_action_cost: z.number().int().positive().nullable(),
  limited_to_form: z.string().nullable(),
  usage_limits: z.object({
    type: z.string().min(1),
    param: z.number().int().positive(),
  }).nullable(),
}).passthrough();

const rawCreatureReferenceSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

const rawAbilityValuesSchema = z.object({
  strength: z.number().int(),
  dexterity: z.number().int(),
  constitution: z.number().int(),
  intelligence: z.number().int(),
  wisdom: z.number().int(),
  charisma: z.number().int(),
});

const rawCreatureSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
  type: rawCreatureReferenceSchema,
  size: rawCreatureReferenceSchema,
  challenge_rating: z.number().min(0).max(30),
  proficiency_bonus: z.number().int().nullable(),
  speed_all: z.object({
    unit: z.string().min(1),
    walk: z.number().nonnegative(),
    crawl: z.number().nonnegative(),
    hover: z.boolean(),
    fly: z.number().nonnegative(),
    burrow: z.number().nonnegative(),
    climb: z.number().nonnegative(),
    swim: z.number().nonnegative(),
  }),
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  alignment: z.string(),
  languages: z.object({
    as_string: z.string(),
    data: z.array(z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      desc: z.string(),
    }).passthrough()),
  }),
  armor_class: z.number().int().nonnegative(),
  armor_detail: z.string(),
  hit_points: z.number().int().nonnegative(),
  hit_dice: z.string().min(1).nullable(),
  experience_points: z.number().int().nonnegative().nullable(),
  ability_scores: rawAbilityValuesSchema,
  modifiers: rawAbilityValuesSchema,
  initiative_bonus: z.number().int(),
  saving_throws: z.record(z.string(), z.number().int()),
  saving_throws_all: z.record(z.string(), z.number().int()),
  skill_bonuses: z.record(z.string(), z.number().int()),
  skill_bonuses_all: z.record(z.string(), z.number().int()),
  passive_perception: z.number().int(),
  resistances_and_immunities: z.object({
    damage_immunities_display: z.string(),
    damage_immunities: z.array(rawDamageTypeSummarySchema),
    damage_resistances_display: z.string(),
    damage_resistances: z.array(rawDamageTypeSummarySchema),
    damage_vulnerabilities_display: z.string(),
    damage_vulnerabilities: z.array(rawDamageTypeSummarySchema),
    condition_immunities_display: z.string(),
    condition_immunities: z.array(rawCreatureReferenceSchema),
  }),
  normal_sight_range: z.number().nonnegative().nullable(),
  darkvision_range: z.number().nonnegative().nullable(),
  blindsight_range: z.number().nonnegative().nullable(),
  tremorsense_range: z.number().nonnegative().nullable(),
  truesight_range: z.number().nonnegative().nullable(),
  actions: z.array(rawCreatureActionSchema),
  traits: z.array(z.object({ name: z.string().min(1), desc: z.string() }).passthrough()),
  creaturesets: z.array(z.string().min(1)),
  environments: z.array(rawCreatureReferenceSchema),
  illustration: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    file_url: z.string().min(1),
    alt_text: z.string(),
    attribution: z.string(),
  }).nullable(),
}).passthrough();

const rawSpellSchoolSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  document: z.string().min(1),
}).passthrough();

const rawSpellCastingOptionSchema = z.object({
  type: z.string().min(1),
  damage_roll: z.string().nullable(),
  target_count: z.number().int().nonnegative().nullable(),
  duration: z.string().nullable(),
  range: z.string().nullable(),
  concentration: z.boolean().nullable(),
  shape_size: z.number().nonnegative().nullable(),
  desc: z.string().nullable(),
}).passthrough();

const rawSpellSchema = z.object({
  key: z.string().min(1),
  document: rawEmbeddedDocumentSchema,
  casting_options: z.array(rawSpellCastingOptionSchema),
  school: rawKeyNameSchema,
  classes: z.array(rawKeyNameSchema),
  range_unit: z.string().min(1),
  shape_size_unit: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  level: z.number().int().min(0).max(9),
  higher_level: z.string(),
  target_type: z.enum(["creature", "object", "point", "area"]),
  range_text: z.string().min(1),
  range: z.number().nonnegative(),
  ritual: z.boolean(),
  casting_time: z.string().min(1),
  reaction_condition: z.string().nullable(),
  verbal: z.boolean(),
  somatic: z.boolean(),
  material: z.boolean(),
  material_specified: z.string(),
  material_cost: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  material_consumed: z.boolean(),
  target_count: z.number().int().nonnegative().nullable(),
  saving_throw_ability: z.string(),
  attack_roll: z.boolean(),
  damage_roll: z.string(),
  damage_types: z.array(z.string().min(1)),
  duration: z.string().min(1),
  shape_type: z.enum(["cone", "cube", "cylinder", "line", "sphere"]).nullable(),
  shape_size: z.number().nonnegative().nullable(),
  concentration: z.boolean(),
}).passthrough();

const rawV1SpellListSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  desc: z.string(),
  spells: z.array(z.string().min(1)),
  document__slug: z.string().min(1),
  document__title: z.string().min(1),
  document__license_url: z.string().min(1),
  document__url: z.string().min(1),
}).passthrough();

const rawV1ClassSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  desc: z.string(),
  table: z.string(),
  spellcasting_ability: z.string().nullable(),
  document__slug: z.string().min(1),
  document__title: z.string().min(1),
  document__license_url: z.string().min(1),
  document__url: z.string().min(1),
}).passthrough();

const rawDocumentSchema = z.object({
  key: z.string().min(1),
  licenses: z.array(rawLicenseSchema).min(1),
  publisher: rawPublisherSchema,
  gamesystem: rawGamesystemSchema,
  display_name: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().nullish(),
  type: z.string().min(1),
  author: z.string().nullish(),
  publication_date: z.string().nullish(),
  permalink: z.string().url(),
  distance_unit: z.string().nullish(),
  weight_unit: z.string().nullish(),
}).passthrough();

const paginationSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().url().nullable(),
  previous: z.string().url().nullable(),
  results: z.array(z.unknown()),
});

type RawDocument = z.infer<typeof rawDocumentSchema>;

interface PaginatedFetchResult {
  records: unknown[];
  sourceUrls: string[];
}

export interface Open5eImportOptions {
  outputRoot: string;
  packVersion: string;
  sourceFetchedAt: string;
  targetDocumentKey?: string;
  taxonomyDocumentKey?: string;
  targetV1DocumentSlug?: string;
  apiBaseUrl?: string;
  apiV1BaseUrl?: string;
  pageSize?: number;
  maxAttempts?: number;
  overwrite?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface Open5eImportResult {
  packDirectory: string;
  manifest: Open5ePackManifest;
}

type Open5eImportSlice = "s0" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7";
type CollectionRecords<T> = Partial<Record<Open5eCollection, T[]>>;

interface ImportContext {
  sourceFetchedAt: string;
  targetDocumentKey: string;
  taxonomyDocumentKey: string;
  targetGamesystem: string;
  documents: Map<string, RawDocument>;
}

export async function importOpen5eS0(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s0");
}

export async function importOpen5eS1(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s1");
}

export async function importOpen5eS2(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s2");
}

export async function importOpen5eS3(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s3");
}

export async function importOpen5eS4(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s4");
}

export async function importOpen5eS5(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s5");
}

export async function importOpen5eS6(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s6");
}

export async function importOpen5eS7(options: Open5eImportOptions): Promise<Open5eImportResult> {
  return importOpen5e(options, "s7");
}

async function importOpen5e(
  options: Open5eImportOptions,
  slice: Open5eImportSlice
): Promise<Open5eImportResult> {
  const collections = slice === "s0"
    ? S0_COLLECTIONS
    : slice === "s1"
      ? S1_COLLECTIONS
      : slice === "s2"
        ? S2_COLLECTIONS
        : slice === "s3"
          ? S3_COLLECTIONS
          : slice === "s4"
            ? S4_COLLECTIONS
            : slice === "s5"
              ? S5_COLLECTIONS
              : slice === "s6"
                ? S6_COLLECTIONS
                : S7_COLLECTIONS;
  const includesS2 = !["s0", "s1"].includes(slice);
  const includesS3 = !["s0", "s1", "s2"].includes(slice);
  const includesS4 = !["s0", "s1", "s2", "s3"].includes(slice);
  const includesS5 = slice === "s5" || slice === "s6" || slice === "s7";
  const includesS6 = slice === "s6" || slice === "s7";
  const includesS7 = slice === "s7";
  const targetDocumentKey = options.targetDocumentKey ?? "srd-2014";
  const taxonomyDocumentKey = options.taxonomyDocumentKey ?? "core";
  const targetV1DocumentSlug = options.targetV1DocumentSlug ?? "wotc-srd";
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl ?? "https://api.open5e.com/v2");
  const apiV1BaseUrl = normalizeApiBaseUrl(options.apiV1BaseUrl ?? "https://api.open5e.com/v1");
  const pageSize = options.pageSize ?? 100;
  const maxAttempts = options.maxAttempts ?? 4;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  assertSafePackVersion(options.packVersion);
  assertIsoTimestamp(options.sourceFetchedAt);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("Open5e pageSize must be an integer from 1 through 500.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("Open5e maxAttempts must be an integer from 1 through 10.");
  }

  const packDirectory = join(options.outputRoot, options.packVersion);
  if (!options.overwrite && await pathExists(join(packDirectory, "manifest.json"))) {
    throw new Error(`Open5e pack already exists: ${packDirectory}`);
  }

  const listOptions = { fetchImpl, maxAttempts, sleep };
  const [conditionsFetch, damageTypesFetch, sizesFetch] = await Promise.all([
    fetchPaginated([
      buildListUrl(apiBaseUrl, "conditions", pageSize, { document__key: taxonomyDocumentKey }),
    ], listOptions),
    fetchPaginated([
      buildListUrl(apiBaseUrl, "damagetypes", pageSize, { document__key: taxonomyDocumentKey }),
    ], listOptions),
    fetchPaginated([
      buildListUrl(apiBaseUrl, "sizes", pageSize, { document__key: taxonomyDocumentKey }),
    ], listOptions),
  ]);
  const [skillsFetch, rulesFetch] = slice !== "s0"
    ? await Promise.all([
        fetchPaginated([buildListUrl(apiBaseUrl, "skills", pageSize, {})], listOptions),
        fetchPaginated([
          buildListUrl(
            apiBaseUrl,
            "rules",
            pageSize,
            includesS6 ? { document__key__in: targetDocumentKey } : { key: CURRENCY_RULE_KEY }
          ),
        ], listOptions),
      ])
    : [null, null];
  const [itemsFetch, weaponsFetch, armorFetch, magicItemsFetch, weaponPropertiesFetch, itemRaritiesFetch]
    = includesS2
      ? await Promise.all([
          fetchPaginated([
            buildListUrl(apiBaseUrl, "items", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "weapons", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "armor", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "magicitems", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "weaponproperties", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([buildListUrl(apiBaseUrl, "itemrarities", pageSize, {})], listOptions),
        ])
      : [null, null, null, null, null, null];
  const [creatureTypesFetch, environmentsFetch, creatureSetsFetch, creaturesFetch]
    = includesS3
      ? await Promise.all([
          fetchPaginated([buildListUrl(apiBaseUrl, "creaturetypes", pageSize, {})], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "environments", pageSize, {
              document__key__in: `${taxonomyDocumentKey},${targetDocumentKey}`,
            }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "creaturesets", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "creatures", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
        ])
      : [null, null, null, null];
  const [spellSchoolsFetch, spellsFetch, spellListsFetch, spellProgressionsFetch]
    = includesS4
      ? await Promise.all([
          fetchPaginated([
            buildListUrl(apiBaseUrl, "spellschools", pageSize, { document__key: taxonomyDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "spells", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildV1ListUrl(apiV1BaseUrl, "spelllist", pageSize, {}),
          ], listOptions),
          fetchPaginated([
            buildV1ListUrl(apiV1BaseUrl, "classes", pageSize, { document__slug: "wotc-srd" }),
          ], listOptions),
        ])
      : [null, null, null, null];
  const [abilitiesFetch, languagesFetch, alignmentsFetch, speciesFetch, classesFetch, backgroundsFetch, featsFetch]
    = includesS5
      ? await Promise.all([
          fetchPaginated([buildListUrl(apiBaseUrl, "abilities", pageSize, {})], listOptions),
          fetchPaginated([buildListUrl(apiBaseUrl, "languages", pageSize, {})], listOptions),
          fetchPaginated([buildListUrl(apiBaseUrl, "alignments", pageSize, {})], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "species", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "classes", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "backgrounds", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildListUrl(apiBaseUrl, "feats", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
        ])
      : [null, null, null, null, null, null, null];
  const [rulesetsFetch, sectionsFetch, planesFetch]
    = includesS6
      ? await Promise.all([
          fetchPaginated([
            buildListUrl(apiBaseUrl, "rulesets", pageSize, { document__key__in: targetDocumentKey }),
          ], listOptions),
          fetchPaginated([
            buildV1ListUrl(apiV1BaseUrl, "sections", pageSize, { document__slug: targetV1DocumentSlug }),
          ], listOptions),
          fetchPaginated([
            buildV1ListUrl(apiV1BaseUrl, "planes", pageSize, { document__slug: targetV1DocumentSlug }),
          ], listOptions),
        ])
      : [null, null, null];

  const documentKeys = collectReferencedDocumentKeys(
    conditionsFetch.records,
    damageTypesFetch.records,
    sizesFetch.records,
    skillsFetch?.records ?? [],
    rulesFetch?.records ?? [],
    creatureTypesFetch?.records ?? [],
    environmentsFetch?.records ?? [],
    spellSchoolsFetch?.records ?? [],
    abilitiesFetch?.records ?? [],
    languagesFetch?.records ?? [],
    alignmentsFetch?.records ?? [],
    speciesFetch?.records ?? [],
    classesFetch?.records ?? [],
    backgroundsFetch?.records ?? [],
    featsFetch?.records ?? [],
    targetDocumentKey,
    taxonomyDocumentKey
  );
  const documentInitialUrls = documentKeys.map((key) =>
    buildListUrl(apiBaseUrl, "documents", pageSize, { key })
  );
  const documentsFetch = await fetchPaginated(documentInitialUrls, listOptions);

  const rawByCollection: CollectionRecords<unknown> = {
    conditions: validateAndSortRawRecords(conditionsFetch.records, rawConditionSchema, "conditions"),
    damagetypes: validateAndSortRawRecords(damageTypesFetch.records, rawDamageTypeSchema, "damagetypes"),
    sizes: validateAndSortRawRecords(sizesFetch.records, rawSizeSchema, "sizes"),
    documents: validateAndSortRawRecords(documentsFetch.records, rawDocumentSchema, "documents"),
  };
  if (slice !== "s0" && skillsFetch && rulesFetch) {
    rawByCollection.skills = validateAndSortRawRecords(skillsFetch.records, rawSkillSchema, "skills");
    rawByCollection.rules = validateAndSortRawRecords(rulesFetch.records, rawRuleSchema, "rules");
  }
  if (
    includesS2
    && itemsFetch
    && weaponsFetch
    && armorFetch
    && magicItemsFetch
    && weaponPropertiesFetch
    && itemRaritiesFetch
  ) {
    rawByCollection.items = validateAndSortRawRecords(itemsFetch.records, rawItemSchema, "items");
    rawByCollection.weapons = validateAndSortRawRecords(weaponsFetch.records, rawWeaponSchema, "weapons");
    rawByCollection.armor = validateAndSortRawRecords(armorFetch.records, rawArmorSchema, "armor");
    rawByCollection.magicitems = validateAndSortRawRecords(magicItemsFetch.records, rawMagicItemSchema, "magicitems");
    rawByCollection.weaponproperties = validateAndSortRawRecords(
      weaponPropertiesFetch.records,
      rawWeaponPropertySchema,
      "weaponproperties"
    );
    rawByCollection.itemrarities = validateAndSortRawRecords(
      itemRaritiesFetch.records,
      rawItemRaritySchema,
      "itemrarities"
    );
  }
  if (includesS3 && creatureTypesFetch && environmentsFetch && creatureSetsFetch && creaturesFetch) {
    rawByCollection.creaturetypes = validateAndSortRawRecords(
      creatureTypesFetch.records,
      rawCreatureTypeSchema,
      "creaturetypes"
    );
    rawByCollection.environments = validateAndSortRawRecords(
      environmentsFetch.records,
      rawEnvironmentSchema,
      "environments"
    );
    rawByCollection.creaturesets = validateAndSortRawRecords(
      creatureSetsFetch.records,
      rawCreatureSetSchema,
      "creaturesets"
    );
    rawByCollection.creatures = validateAndSortRawRecords(
      creaturesFetch.records,
      rawCreatureSchema,
      "creatures"
    );
  }
  if (includesS4 && spellSchoolsFetch && spellsFetch && spellListsFetch && spellProgressionsFetch) {
    rawByCollection.spellschools = validateAndSortRawRecords(
      spellSchoolsFetch.records,
      rawSpellSchoolSchema,
      "spellschools"
    );
    rawByCollection.spells = validateAndSortRawRecords(spellsFetch.records, rawSpellSchema, "spells");
    rawByCollection.spelllists = validateAndSortRawRecordsBy(
      spellListsFetch.records,
      rawV1SpellListSchema,
      "spelllists",
      (record) => record.slug
    );
    rawByCollection.spellprogressions = validateAndSortRawRecordsBy(
      spellProgressionsFetch.records,
      rawV1ClassSchema,
      "spellprogressions",
      (record) => record.slug
    );
  }
  if (
    includesS5
    && abilitiesFetch
    && languagesFetch
    && alignmentsFetch
    && speciesFetch
    && classesFetch
    && backgroundsFetch
    && featsFetch
  ) {
    rawByCollection.abilities = validateAndSortRawRecords(abilitiesFetch.records, rawAbilitySchema, "abilities");
    rawByCollection.languages = validateAndSortRawRecords(languagesFetch.records, rawLanguageSchema, "languages");
    rawByCollection.alignments = validateAndSortRawRecords(alignmentsFetch.records, rawAlignmentSchema, "alignments");
    rawByCollection.species = validateAndSortRawRecords(speciesFetch.records, rawSpeciesSchema, "species");
    rawByCollection.classes = validateAndSortRawRecords(classesFetch.records, rawCharacterClassSchema, "classes");
    rawByCollection.backgrounds = validateAndSortRawRecords(backgroundsFetch.records, rawBackgroundSchema, "backgrounds");
    rawByCollection.feats = validateAndSortRawRecords(featsFetch.records, rawFeatSchema, "feats");
  }
  if (includesS6 && rulesetsFetch && sectionsFetch && planesFetch) {
    rawByCollection.rulesets = validateAndSortRawRecords(rulesetsFetch.records, rawRulesetSchema, "rulesets");
    rawByCollection.sections = validateAndSortRawRecordsBy(
      sectionsFetch.records,
      rawV1SectionSchema,
      "sections",
      (record) => record.slug
    );
    rawByCollection.planes = validateAndSortRawRecordsBy(
      planesFetch.records,
      rawV1PlaneSchema,
      "planes",
      (record) => record.slug
    );
  }

  const rawDocuments = requireCollection(rawByCollection, "documents")
    .map((record) => rawDocumentSchema.parse(record));
  assertRequestedDocumentsResolved(documentKeys, rawDocuments);
  const documents = new Map(rawDocuments.map((document) => [document.key, document]));
  const targetDocument = requireDocument(documents, targetDocumentKey);
  if (targetDocument.gamesystem.key !== "5e-2014") {
    throw new Error(
      `S0 is pinned to the 5e-2014 game system; ${targetDocumentKey} is ${targetDocument.gamesystem.key}.`
    );
  }

  const context: ImportContext = {
    sourceFetchedAt: options.sourceFetchedAt,
    targetDocumentKey,
    taxonomyDocumentKey,
    targetGamesystem: targetDocument.gamesystem.key,
    documents,
  };
  const normalizedByCollection: CollectionRecords<NormalizedContentRecord> = {
    conditions: normalizeConditions(requireCollection(rawByCollection, "conditions"), context),
    damagetypes: normalizeDamageTypes(requireCollection(rawByCollection, "damagetypes"), context),
    sizes: normalizeSizes(requireCollection(rawByCollection, "sizes"), context),
    documents: normalizeDocuments(rawDocuments, context),
  };
  if (slice !== "s0") {
    normalizedByCollection.skills = normalizeSkills(requireCollection(rawByCollection, "skills"), context);
    normalizedByCollection.rules = normalizeRules(requireCollection(rawByCollection, "rules"), context);
  }
  if (includesS2) {
    normalizedByCollection.weaponproperties = normalizeWeaponProperties(
      requireCollection(rawByCollection, "weaponproperties"),
      context
    );
    normalizedByCollection.itemrarities = normalizeItemRarities(
      requireCollection(rawByCollection, "itemrarities"),
      context
    );
    normalizedByCollection.weapons = normalizeWeapons(
      requireCollection(rawByCollection, "weapons"),
      requireCollection(normalizedByCollection, "weaponproperties"),
      context
    );
    normalizedByCollection.armor = normalizeArmor(requireCollection(rawByCollection, "armor"), context);
    normalizedByCollection.items = normalizeItems(requireCollection(rawByCollection, "items"), context);
    normalizedByCollection.magicitems = normalizeMagicItems(
      requireCollection(rawByCollection, "magicitems"),
      requireCollection(normalizedByCollection, "itemrarities"),
      context
    );
    verifyItemReferences(normalizedByCollection);
  }
  if (includesS3) {
    normalizedByCollection.creaturetypes = normalizeCreatureTypes(
      requireCollection(rawByCollection, "creaturetypes"),
      context
    );
    normalizedByCollection.environments = normalizeEnvironments(
      requireCollection(rawByCollection, "environments"),
      context
    );
    normalizedByCollection.creaturesets = normalizeCreatureSets(
      requireCollection(rawByCollection, "creaturesets"),
      requireCollection(rawByCollection, "creatures"),
      context
    );
    normalizedByCollection.creatures = normalizeCreatures(
      requireCollection(rawByCollection, "creatures"),
      requireCollection(normalizedByCollection, "creaturetypes"),
      requireCollection(normalizedByCollection, "environments"),
      requireCollection(normalizedByCollection, "creaturesets"),
      requireCollection(normalizedByCollection, "damagetypes"),
      requireCollection(normalizedByCollection, "conditions"),
      requireCollection(normalizedByCollection, "sizes"),
      context
    );
    verifyCreatureReferences(normalizedByCollection);
  }
  if (includesS4) {
    normalizedByCollection.spellschools = normalizeSpellSchools(
      requireCollection(rawByCollection, "spellschools"),
      context
    );
    normalizedByCollection.spells = normalizeSpells(
      requireCollection(rawByCollection, "spells"),
      requireCollection(normalizedByCollection, "spellschools"),
      requireCollection(normalizedByCollection, "damagetypes"),
      context
    );
    normalizedByCollection.spelllists = normalizeSpellLists(
      requireCollection(rawByCollection, "spelllists"),
      requireCollection(normalizedByCollection, "spells"),
      context
    );
    normalizedByCollection.spellprogressions = normalizeSpellProgressions(
      requireCollection(rawByCollection, "spellprogressions"),
      context
    );
    verifySpellReferences(normalizedByCollection);
  }
  if (includesS5) {
    normalizedByCollection.abilities = normalizeAbilities(
      requireCollection(rawByCollection, "abilities"),
      requireCollection(normalizedByCollection, "skills"),
      context
    );
    normalizedByCollection.languages = normalizeLanguages(
      requireCollection(rawByCollection, "languages"),
      context
    );
    normalizedByCollection.alignments = normalizeAlignments(
      requireCollection(rawByCollection, "alignments"),
      context
    );
    normalizedByCollection.species = normalizeSpecies(
      requireCollection(rawByCollection, "species"),
      context
    );
    normalizedByCollection.classes = normalizeCharacterClasses(
      requireCollection(rawByCollection, "classes"),
      requireCollection(normalizedByCollection, "abilities"),
      context
    );
    normalizedByCollection.backgrounds = normalizeBackgrounds(
      requireCollection(rawByCollection, "backgrounds"),
      context
    );
    normalizedByCollection.feats = normalizeFeats(requireCollection(rawByCollection, "feats"), context);
    verifyCharacterOptionReferences(normalizedByCollection);
  }
  if (includesS6) {
    normalizedByCollection.rulesets = normalizeRulesets(
      requireCollection(rawByCollection, "rulesets"),
      requireCollection(normalizedByCollection, "rules"),
      context
    );
    normalizedByCollection.sections = normalizeSections(
      requireCollection(rawByCollection, "sections"),
      targetV1DocumentSlug,
      context
    );
    normalizedByCollection.planes = normalizePlanes(
      requireCollection(rawByCollection, "planes"),
      targetV1DocumentSlug,
      context
    );
    verifyRulesReferenceGraph(normalizedByCollection);
  }

  for (const collection of collections) {
    normalizedByCollection[collection] = validateNormalizedRecords(
      requireCollection(normalizedByCollection, collection),
      collection
    );
  }

  const compiledByCollection = Object.fromEntries(
    collections.map((collection) => [collection, []])
  ) as CollectionRecords<CompiledContentRecord>;
  if (slice !== "s0") {
    compiledByCollection.rules = validateCompiledRecords(
      compileCurrencyRules(requireCollection(normalizedByCollection, "rules")),
      "rules"
    );
  }
  if (includesS2) {
    compiledByCollection.items = validateCompiledRecords(
      compileEquipmentEffects(requireCollection(normalizedByCollection, "items")),
      "items"
    );
  }
  if (includesS3) {
    compiledByCollection.creatures = validateCompiledRecords(
      compileCreatureAttacks(
        requireCollection(normalizedByCollection, "creatures"),
        requireCollection(normalizedByCollection, "damagetypes")
      ),
      "creatures"
    );
  }
  if (includesS4) {
    compiledByCollection.spells = validateCompiledRecords(
      compileSpellEffects(requireCollection(normalizedByCollection, "spells")),
      "spells"
    );
  }
  if (includesS5) {
    compiledByCollection.species = validateCompiledRecords(
      compileSpeciesProfiles(
        requireCollection(normalizedByCollection, "species"),
        requireCollection(normalizedByCollection, "languages")
      ),
      "species"
    );
    compiledByCollection.classes = validateCompiledRecords(
      compileClassProfiles(
        requireCollection(normalizedByCollection, "classes"),
        requireCollection(normalizedByCollection, "skills")
      ),
      "classes"
    );
    compiledByCollection.backgrounds = validateCompiledRecords(
      compileBackgroundProfiles(
        requireCollection(normalizedByCollection, "backgrounds"),
        requireCollection(normalizedByCollection, "skills"),
        requireCollection(normalizedByCollection, "languages"),
        requireCollection(normalizedByCollection, "items")
      ),
      "backgrounds"
    );
  }
  if (includesS7) {
    const effectPrograms = compileOpen5eEffectPrograms({
      creatures: requireCollection(normalizedByCollection, "creatures")
        .filter((record): record is NormalizedCreature => record.kind === "creature"),
      spells: requireCollection(normalizedByCollection, "spells")
        .filter((record): record is NormalizedSpell => record.kind === "spell"),
      conditions: requireCollection(normalizedByCollection, "conditions")
        .filter((record): record is NormalizedCondition => record.kind === "condition"),
      damageTypes: requireCollection(normalizedByCollection, "damagetypes")
        .filter((record): record is NormalizedDamageType => record.kind === "damage-type"),
      creatureAttacks: requireCollection(compiledByCollection, "creatures")
        .filter((record): record is CompiledCreatureAttack => record.kind === "creature-attack"),
    });
    compiledByCollection.creatures = validateCompiledRecords([
      ...requireCollection(compiledByCollection, "creatures"),
      ...effectPrograms.creaturePrograms,
    ], "creatures");
    compiledByCollection.spells = validateCompiledRecords([
      ...requireCollection(compiledByCollection, "spells"),
      ...effectPrograms.spellPrograms,
    ], "spells");
  }

  const coverage = slice === "s0"
    ? renderS0Coverage(
        options.packVersion,
        options.sourceFetchedAt,
        targetDocumentKey,
        rawByCollection,
        normalizedByCollection
      )
    : renderS1Coverage(
        slice,
        options.packVersion,
        options.sourceFetchedAt,
        targetDocumentKey,
        collections,
        rawByCollection,
        normalizedByCollection,
        compiledByCollection
      );
  const attribution = renderAttribution(
    slice,
    options.packVersion,
    options.sourceFetchedAt,
    requireCollection(normalizedByCollection, "documents")
  );

  await mkdir(join(packDirectory, "raw"), { recursive: true });
  await mkdir(join(packDirectory, "normalized"), { recursive: true });
  await mkdir(join(packDirectory, "compiled"), { recursive: true });

  const sourceUrls: Partial<Record<Open5eCollection, string[]>> = {
    conditions: conditionsFetch.sourceUrls,
    damagetypes: damageTypesFetch.sourceUrls,
    sizes: sizesFetch.sourceUrls,
    documents: documentsFetch.sourceUrls,
  };
  if (slice !== "s0" && skillsFetch && rulesFetch) {
    sourceUrls.skills = skillsFetch.sourceUrls;
    sourceUrls.rules = rulesFetch.sourceUrls;
  }
  if (
    includesS2
    && itemsFetch
    && weaponsFetch
    && armorFetch
    && magicItemsFetch
    && weaponPropertiesFetch
    && itemRaritiesFetch
  ) {
    sourceUrls.items = itemsFetch.sourceUrls;
    sourceUrls.weapons = weaponsFetch.sourceUrls;
    sourceUrls.armor = armorFetch.sourceUrls;
    sourceUrls.magicitems = magicItemsFetch.sourceUrls;
    sourceUrls.weaponproperties = weaponPropertiesFetch.sourceUrls;
    sourceUrls.itemrarities = itemRaritiesFetch.sourceUrls;
  }
  if (includesS3 && creatureTypesFetch && environmentsFetch && creatureSetsFetch && creaturesFetch) {
    sourceUrls.creaturetypes = creatureTypesFetch.sourceUrls;
    sourceUrls.environments = environmentsFetch.sourceUrls;
    sourceUrls.creaturesets = creatureSetsFetch.sourceUrls;
    sourceUrls.creatures = creaturesFetch.sourceUrls;
  }
  if (includesS4 && spellSchoolsFetch && spellsFetch && spellListsFetch && spellProgressionsFetch) {
    sourceUrls.spellschools = spellSchoolsFetch.sourceUrls;
    sourceUrls.spells = spellsFetch.sourceUrls;
    sourceUrls.spelllists = spellListsFetch.sourceUrls;
    sourceUrls.spellprogressions = spellProgressionsFetch.sourceUrls;
  }
  if (
    includesS5
    && abilitiesFetch
    && languagesFetch
    && alignmentsFetch
    && speciesFetch
    && classesFetch
    && backgroundsFetch
    && featsFetch
  ) {
    sourceUrls.abilities = abilitiesFetch.sourceUrls;
    sourceUrls.languages = languagesFetch.sourceUrls;
    sourceUrls.alignments = alignmentsFetch.sourceUrls;
    sourceUrls.species = speciesFetch.sourceUrls;
    sourceUrls.classes = classesFetch.sourceUrls;
    sourceUrls.backgrounds = backgroundsFetch.sourceUrls;
    sourceUrls.feats = featsFetch.sourceUrls;
  }
  if (includesS6 && rulesetsFetch && sectionsFetch && planesFetch) {
    sourceUrls.rulesets = rulesetsFetch.sourceUrls;
    sourceUrls.sections = sectionsFetch.sourceUrls;
    sourceUrls.planes = planesFetch.sourceUrls;
  }

  const collectionArtifacts = {} as Open5ePackManifest["collections"];
  for (const collection of collections) {
    const rawRecords = requireCollection(rawByCollection, collection);
    const normalizedRecords = requireCollection(normalizedByCollection, collection);
    const compiledRecords = requireCollection(compiledByCollection, collection);
    const rawArtifact = await writeArtifact(
      packDirectory,
      `raw/${collection}.ndjson`,
      toNdjson(rawRecords),
      rawRecords.length
    );
    const normalizedArtifact = await writeArtifact(
      packDirectory,
      `normalized/${collection}.ndjson`,
      toNdjson(normalizedRecords),
      normalizedRecords.length
    );
    const compiledArtifact = await writeArtifact(
      packDirectory,
      `compiled/${collection}.ndjson`,
      toNdjson(compiledRecords),
      compiledRecords.length
    );
    const collectionApiVersion = collection === "spelllists"
      || collection === "spellprogressions"
      || collection === "sections"
      || collection === "planes"
      ? "v1"
      : "v2";
    const endpoint = collection === "spelllists"
      ? `${apiV1BaseUrl}/spelllist/`
      : collection === "spellprogressions"
        ? `${apiV1BaseUrl}/classes/`
        : collection === "sections" || collection === "planes"
          ? `${apiV1BaseUrl}/${collection}/`
          : `${apiBaseUrl}/${collection}/`;
    collectionArtifacts[collection] = {
      ...(includesS4 ? { sourceApiVersion: collectionApiVersion } : {}),
      endpoint,
      sourceUrls: [...(sourceUrls[collection] ?? [])].sort(),
      raw: rawArtifact,
      normalized: normalizedArtifact,
      compiled: compiledArtifact,
    };
  }

  const coverageArtifact = await writeArtifact(packDirectory, "COVERAGE.md", coverage, 0);
  const attributionArtifact = await writeArtifact(packDirectory, "ATTRIBUTION.md", attribution, 0);
  const normalizedDocuments = requireCollection(normalizedByCollection, "documents").map((record) => {
    if (record.kind !== "document") {
      throw new Error("The normalized documents collection contains a non-document record.");
    }
    return record;
  });
  const documentInventory = normalizedDocuments.map((document) => ({
    key: document.sourceKey,
    packRole: document.packRole,
    gamesystem: document.gamesystem,
    publisher: document.publisher,
    licenseKeys: document.licenseKeys,
    permalink: document.permalink,
  }));

  const hashInput = {
    schemaVersion: 1,
    packVersion: options.packVersion,
    targetDocumentKey,
    taxonomyDocumentKey,
    gamesystems: [targetDocument.gamesystem.key],
    sourceApiVersion: "v2",
    sourceFetchedAt: options.sourceFetchedAt,
    collections: collectionArtifacts,
    documents: documentInventory,
    reports: {
      attributionSha256: attributionArtifact.sha256,
      coverageSha256: coverageArtifact.sha256,
    },
  } as const;
  const packHash = sha256(canonicalJson(hashInput));
  const manifest = open5ePackManifestSchema.parse({ ...hashInput, packHash });
  await writeFile(join(packDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { packDirectory, manifest };
}

async function fetchPaginated(
  initialUrls: string[],
  options: {
    fetchImpl: typeof fetch;
    maxAttempts: number;
    sleep: (milliseconds: number) => Promise<void>;
  }
): Promise<PaginatedFetchResult> {
  const records: unknown[] = [];
  const sourceUrls: string[] = [];
  const visited = new Set<string>();

  for (const initialUrl of [...initialUrls].sort()) {
    let nextUrl: string | null = initialUrl;
    while (nextUrl !== null) {
      if (visited.has(nextUrl)) {
        throw new Error(`Open5e pagination cycle detected at ${nextUrl}`);
      }
      visited.add(nextUrl);
      sourceUrls.push(nextUrl);
      const page = await fetchPageWithRetry(nextUrl, options);
      records.push(...page.results);
      nextUrl = page.next;
    }
  }

  return { records, sourceUrls };
}

async function fetchPageWithRetry(
  url: string,
  options: {
    fetchImpl: typeof fetch;
    maxAttempts: number;
    sleep: (milliseconds: number) => Promise<void>;
  }
): Promise<z.infer<typeof paginationSchema>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const response = await options.fetchImpl(url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === options.maxAttempts) {
          throw new Error(`Open5e request failed (${response.status}) for ${url}`);
        }
        lastError = new Error(`Open5e retryable response (${response.status}) for ${url}`);
      } else {
        return paginationSchema.parse(await response.json());
      }
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts || !isRetryableFetchError(error)) {
        throw error;
      }
    }
    await options.sleep(Math.min(4_000, 250 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Open5e request failed for ${url}`);
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  return !error.message.startsWith("Open5e request failed (");
}

function collectReferencedDocumentKeys(
  conditionRecords: unknown[],
  damageTypeRecords: unknown[],
  sizeRecords: unknown[],
  skillRecords: unknown[],
  ruleRecords: unknown[],
  creatureTypeRecords: unknown[],
  environmentRecords: unknown[],
  spellSchoolRecords: unknown[],
  abilityRecords: unknown[],
  languageRecords: unknown[],
  alignmentRecords: unknown[],
  speciesRecords: unknown[],
  classRecords: unknown[],
  backgroundRecords: unknown[],
  featRecords: unknown[],
  targetDocumentKey: string,
  taxonomyDocumentKey: string
): string[] {
  const keys = new Set<string>([targetDocumentKey, taxonomyDocumentKey]);
  for (const record of conditionRecords.map((value) => rawConditionSchema.parse(value))) {
    keys.add(record.document.key);
    if (record.icon) {
      keys.add(conditionIconDocumentKey(record.icon.file_url));
    }
    for (const description of record.descriptions) {
      keys.add(description.document);
    }
  }
  for (const record of damageTypeRecords.map((value) => rawDamageTypeSchema.parse(value))) {
    keys.add(record.document);
    for (const description of record.descriptions) {
      keys.add(description.document);
    }
  }
  for (const record of sizeRecords.map((value) => rawSizeSchema.parse(value))) {
    keys.add(record.document.key);
  }
  for (const record of skillRecords.map((value) => rawSkillSchema.parse(value))) {
    keys.add(record.document);
    for (const description of record.descriptions) {
      keys.add(description.document);
    }
  }
  for (const record of ruleRecords.map((value) => rawRuleSchema.parse(value))) {
    keys.add(record.document);
  }
  for (const record of creatureTypeRecords.map((value) => rawCreatureTypeSchema.parse(value))) {
    keys.add(record.document);
    for (const description of record.descriptions) keys.add(description.document);
  }
  for (const record of environmentRecords.map((value) => rawEnvironmentSchema.parse(value))) {
    keys.add(record.document);
  }
  for (const record of spellSchoolRecords.map((value) => rawSpellSchoolSchema.parse(value))) {
    keys.add(record.document);
  }
  for (const record of abilityRecords.map((value) => rawAbilitySchema.parse(value))) {
    keys.add(record.document);
    for (const description of record.descriptions) keys.add(description.document);
    for (const skill of record.skills) {
      keys.add(skill.document);
      for (const description of skill.descriptions) keys.add(description.document);
    }
  }
  for (const record of languageRecords.map((value) => rawLanguageSchema.parse(value))) {
    keys.add(record.document.key);
  }
  for (const record of alignmentRecords.map((value) => rawAlignmentSchema.parse(value))) {
    keys.add(record.document.key);
    for (const description of record.descriptions) keys.add(description.document);
  }
  for (const record of speciesRecords.map((value) => rawSpeciesSchema.parse(value))) {
    keys.add(record.document.key);
  }
  for (const record of classRecords.map((value) => rawCharacterClassSchema.parse(value))) {
    keys.add(record.document.key);
  }
  for (const record of backgroundRecords.map((value) => rawBackgroundSchema.parse(value))) {
    keys.add(record.document.key);
  }
  for (const record of featRecords.map((value) => rawFeatSchema.parse(value))) {
    keys.add(record.document.key);
  }
  return [...keys].sort();
}

function normalizeDocuments(records: RawDocument[], context: ImportContext): NormalizedDocument[] {
  return records.map<NormalizedDocument>((record) => ({
    kind: "document",
    fidelityTier: 0,
    ...buildProvenance("document", record.key, record, context.sourceFetchedAt),
    packRole: documentRole(record.key, context),
    name: record.name,
    displayName: record.display_name,
    description: record.desc ?? "",
    documentType: record.type,
    author: record.author ?? "",
    publicationDate: record.publication_date ?? null,
    distanceUnit: record.distance_unit ?? null,
    weightUnit: record.weight_unit ?? null,
    licenses: [...record.licenses].sort((left, right) => left.key.localeCompare(right.key)),
  })).sort(compareByKey);
}

function normalizeConditions(records: unknown[], context: ImportContext): NormalizedCondition[] {
  const sourceDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedCondition>((value) => {
    const record = rawConditionSchema.parse(value);
    const description = requireDescriptionVariant(
      "condition",
      record.key,
      record.descriptions,
      context.targetDocumentKey,
      context.targetGamesystem
    );
    const provenance = buildProvenance("condition", record.key, sourceDocument, context.sourceFetchedAt);
    const icon = normalizeConditionIcon(record.icon, context);
    return {
      kind: "condition",
      fidelityTier: 0,
      ...provenance,
      licenseKeys: [...new Set([
        ...provenance.licenseKeys,
        ...(icon?.licenseKeys ?? []),
      ])].sort(),
      name: record.name,
      description: description.desc,
      icon,
      sourceContainerDocumentKey: record.document.key,
    };
  }).sort(compareByKey);
}

function normalizeConditionIcon(
  icon: z.infer<typeof rawConditionIconSchema> | null,
  context: ImportContext
): NormalizedCondition["icon"] {
  if (!icon) return null;
  const documentKey = conditionIconDocumentKey(icon.file_url);
  const document = requireDocument(context.documents, documentKey);
  return {
    sourceKey: icon.key,
    name: icon.name,
    fileUrl: icon.file_url,
    altText: icon.alt_text,
    attribution: icon.attribution,
    documentKey,
    gamesystem: document.gamesystem.key,
    publisher: document.publisher,
    licenseKeys: document.licenses.map((license) => license.key).sort(),
    permalink: document.permalink,
  };
}

function conditionIconDocumentKey(fileUrl: string): string {
  const match = /\/object_icons\/([^/]+)\//.exec(fileUrl);
  const documentKey = match?.[1];
  if (!documentKey) {
    throw new Error(`Condition icon provenance cannot be derived from ${fileUrl}.`);
  }
  return decodeURIComponent(documentKey);
}

function normalizeDamageTypes(records: unknown[], context: ImportContext): NormalizedDamageType[] {
  const sourceDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedDamageType>((value) => {
    const record = rawDamageTypeSchema.parse(value);
    const description = requireDescriptionVariant(
      "damage type",
      record.key,
      record.descriptions,
      context.targetDocumentKey,
      context.targetGamesystem
    );
    return {
      kind: "damage-type",
      fidelityTier: 1,
      ...buildProvenance("damage-type", record.key, sourceDocument, context.sourceFetchedAt),
      name: record.name,
      description: description.desc,
      sourceContainerDocumentKey: record.document,
    };
  }).sort(compareByKey);
}

function normalizeSizes(records: unknown[], context: ImportContext): NormalizedSize[] {
  return records.map<NormalizedSize>((value) => {
    const record = rawSizeSchema.parse(value);
    if (record.document.gamesystem.key !== context.targetGamesystem) {
      throw new Error(
        `Size ${record.key} belongs to ${record.document.gamesystem.key}, not ${context.targetGamesystem}.`
      );
    }
    const sourceDocument = requireDocument(context.documents, record.document.key);
    return {
      kind: "size",
      fidelityTier: 1,
      ...buildProvenance("size", record.key, sourceDocument, context.sourceFetchedAt),
      name: record.name,
      rank: record.rank,
      spaceDiameter: record.space_diameter,
      distanceUnit: record.distance_unit,
      suggestedHitDice: record.suggested_hit_dice,
    };
  }).sort(compareByKey);
}

function normalizeSkills(records: unknown[], context: ImportContext): NormalizedSkill[] {
  const sourceDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records
    .map((value) => rawSkillSchema.parse(value))
    .filter((record) => record.document === context.taxonomyDocumentKey)
    .map<NormalizedSkill>((record) => {
      const description = requireDescriptionVariant(
        "skill",
        record.key,
        record.descriptions,
        context.targetDocumentKey,
        context.targetGamesystem
      );
      return {
        kind: "skill",
        fidelityTier: 1,
        ...buildProvenance("skill", record.key, sourceDocument, context.sourceFetchedAt),
        name: record.name,
        engineKey: kebabToCamel(record.key),
        ability: record.ability,
        description: description.desc,
        sourceContainerDocumentKey: record.document,
      };
    })
    .sort(compareByKey);
}

function normalizeRules(records: unknown[], context: ImportContext): NormalizedRule[] {
  const sourceDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedRule>((value) => {
    const record = rawRuleSchema.parse(value);
    if (record.document !== context.targetDocumentKey) {
      throw new Error(
        `Rule ${record.key} belongs to ${record.document}, not ${context.targetDocumentKey}.`
      );
    }
    return {
      kind: "rule",
      fidelityTier: 0,
      ...buildProvenance("rule", record.key, sourceDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      rulesetKey: record.ruleset,
      index: record.index,
      initialHeaderLevel: record.initialHeaderLevel,
      crossReferences: normalizeCrossReferences(record.crossreferences?.to ?? []),
    };
  }).sort(compareByKey);
}

function normalizeRulesets(
  records: unknown[],
  rules: NormalizedContentRecord[],
  context: ImportContext
): NormalizedRuleset[] {
  const normalizedRules = rules.filter((record): record is NormalizedRule => record.kind === "rule");
  const rulesBySourceKey = new Map(normalizedRules.map((rule) => [rule.sourceKey, rule]));
  return records.map<NormalizedRuleset>((value) => {
    const record = rawRulesetSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Ruleset ${record.key}`);
    const sourceDocument = requireDocument(context.documents, record.document.key);
    const ruleContentKeys = [...record.rules]
      .sort((left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER)
        || left.key.localeCompare(right.key))
      .map((rule) => {
        const normalized = rulesBySourceKey.get(rule.key);
        if (!normalized) throw new Error(`Ruleset ${record.key} references missing rule ${rule.key}.`);
        if (normalized.rulesetKey !== record.key || rule.ruleset !== record.key) {
          throw new Error(`Ruleset ${record.key} contains divergent rule ${rule.key}.`);
        }
        return normalized.contentKey;
      });
    return {
      kind: "ruleset",
      fidelityTier: 0,
      ...buildProvenance("ruleset", record.key, sourceDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      ruleContentKeys,
      crossReferences: normalizeCrossReferences(record.crossreferences?.to ?? []),
    };
  }).sort(compareByKey);
}

function normalizeSections(
  records: unknown[],
  targetV1DocumentSlug: string,
  context: ImportContext
): NormalizedSection[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedSection>((value) => {
    const record = rawV1SectionSchema.parse(value);
    assertV1Document(record.document__slug, targetV1DocumentSlug, `Section ${record.slug}`);
    return {
      kind: "section",
      fidelityTier: 0,
      ...buildV1Provenance("section", record.slug, targetDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      legacyDocumentSlug: record.document__slug,
      legacyDocumentTitle: record.document__title,
      legacyDocumentUrl: record.document__url,
      legacyLicenseUrl: record.document__license_url,
      parent: record.parent,
    };
  }).sort(compareByKey);
}

function normalizePlanes(
  records: unknown[],
  targetV1DocumentSlug: string,
  context: ImportContext
): NormalizedPlane[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedPlane>((value) => {
    const record = rawV1PlaneSchema.parse(value);
    assertV1Document(record.document__slug, targetV1DocumentSlug, `Plane ${record.slug}`);
    return {
      kind: "plane",
      fidelityTier: 0,
      ...buildV1Provenance("plane", record.slug, targetDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      legacyDocumentSlug: record.document__slug,
      legacyDocumentTitle: record.document__title,
      legacyDocumentUrl: record.document__url,
      legacyLicenseUrl: null,
      parent: record.parent,
    };
  }).sort(compareByKey);
}

function normalizeWeaponProperties(
  records: unknown[],
  context: ImportContext
): NormalizedWeaponProperty[] {
  return records.map<NormalizedWeaponProperty>((value) => {
    const record = rawWeaponPropertySchema.parse(value);
    if (record.document !== context.targetDocumentKey) {
      throw new Error(
        `Weapon property ${record.key} belongs to ${record.document}, not ${context.targetDocumentKey}.`
      );
    }
    const document = requireDocument(context.documents, record.document);
    return {
      kind: "weapon-property",
      fidelityTier: 0,
      ...buildProvenance("weapon-property", record.key, document, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      propertyType: record.type,
    };
  }).sort(compareByKey);
}

function normalizeItemRarities(records: unknown[], context: ImportContext): NormalizedItemRarity[] {
  const document = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedItemRarity>((value) => {
    const record = rawItemRaritySchema.parse(value);
    return {
      kind: "item-rarity",
      fidelityTier: 1,
      ...buildProvenance("item-rarity", record.key, document, context.sourceFetchedAt),
      name: record.name,
      rank: record.rank,
      sourceContainer: "itemrarities",
    };
  }).sort(compareByKey);
}

function normalizeWeapons(
  records: unknown[],
  properties: NormalizedContentRecord[],
  context: ImportContext
): NormalizedWeapon[] {
  const propertyByName = new Map<string, NormalizedWeaponProperty>();
  for (const candidate of properties) {
    if (candidate.kind !== "weapon-property") {
      throw new Error(`The weapon-property collection contains ${candidate.kind}.`);
    }
    if (propertyByName.has(candidate.name)) {
      throw new Error(`Duplicate normalized weapon-property name: ${candidate.name}.`);
    }
    propertyByName.set(candidate.name, candidate);
  }
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedWeapon>((value) => {
    const record = rawWeaponSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Weapon ${record.key}`);
    const assignments = record.properties.map((assignment) => {
      const property = propertyByName.get(assignment.property.name);
      if (!property) {
        throw new Error(
          `Weapon ${record.key} references unknown property ${assignment.property.name}.`
        );
      }
      if (
        property.description !== assignment.property.desc
        || property.propertyType !== assignment.property.type
      ) {
        throw new Error(
          `Weapon ${record.key} property ${property.name} diverges from its normalized definition.`
        );
      }
      return {
        sourceKey: property.sourceKey,
        contentKey: property.contentKey,
        name: property.name,
        propertyType: property.propertyType,
        description: property.description,
        detail: assignment.detail,
      };
    });
    return {
      kind: "weapon",
      fidelityTier: 1,
      ...buildProvenance("weapon", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      damageDice: record.damage_dice,
      damageTypeKey: record.damage_type.key,
      damageTypeName: record.damage_type.name,
      damageTypeContentKey: contentKeyFor(
        "damage-type",
        record.damage_type.key,
        targetDocument
      ),
      range: {
        normal: record.range,
        long: record.long_range,
        unit: record.distance_unit,
      },
      isSimple: record.is_simple,
      isMartial: !record.is_simple && !record.is_improvised,
      isImprovised: record.is_improvised,
      properties: assignments,
    };
  }).sort(compareByKey);
}

function normalizeArmor(records: unknown[], context: ImportContext): NormalizedArmor[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedArmor>((value) => {
    const record = rawArmorSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Armor ${record.key}`);
    return {
      kind: "armor",
      fidelityTier: 1,
      ...buildProvenance("armor", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      category: record.category,
      armorClass: {
        display: record.ac_display,
        base: record.ac_base,
        addDexterityModifier: record.ac_add_dexmod,
        dexterityModifierCap: record.ac_cap_dexmod,
      },
      grantsStealthDisadvantage: record.grants_stealth_disadvantage,
      strengthScoreRequired: record.strength_score_required,
    };
  }).sort(compareByKey);
}

function normalizeItems(records: unknown[], context: ImportContext): NormalizedItem[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedItem>((value) => {
    const record = rawItemSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Item ${record.key}`);
    return {
      kind: "item",
      fidelityTier: 1,
      ...buildProvenance("item", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      categoryKey: record.category.key,
      categoryName: record.category.name,
      sizeKey: record.size.key,
      sizeName: record.size.name,
      weight: parseDecimal(record.weight, 3, `item ${record.key} weight`),
      weightUnit: record.weight_unit,
      valueCopper: parseGoldCost(record.cost, `item ${record.key}`),
      weaponContentKey: record.weapon
        ? contentKeyFor("weapon", record.weapon.key, targetDocument)
        : null,
      armorContentKey: record.armor
        ? contentKeyFor("armor", record.armor.key, targetDocument)
        : null,
    };
  }).sort(compareByKey);
}

function normalizeMagicItems(
  records: unknown[],
  rarities: NormalizedContentRecord[],
  context: ImportContext
): NormalizedMagicItem[] {
  const rarityByKey = new Map<string, NormalizedItemRarity>();
  for (const candidate of rarities) {
    if (candidate.kind !== "item-rarity") {
      throw new Error(`The item-rarity collection contains ${candidate.kind}.`);
    }
    rarityByKey.set(candidate.sourceKey, candidate);
  }
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedMagicItem>((value) => {
    const record = rawMagicItemSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Magic item ${record.key}`);
    const rarity = rarityByKey.get(record.rarity.key);
    if (!rarity || rarity.name !== record.rarity.name || rarity.rank !== record.rarity.rank) {
      throw new Error(`Magic item ${record.key} references an unknown or divergent rarity.`);
    }
    return {
      kind: "magic-item",
      fidelityTier: 1,
      ...buildProvenance("magic-item", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      categoryKey: record.category.key,
      categoryName: record.category.name,
      sizeKey: record.size.key,
      sizeName: record.size.name,
      weight: parseDecimal(record.weight, 3, `magic item ${record.key} weight`),
      weightUnit: record.weight_unit,
      valueCopper: record.cost === null ? null : parseGoldCost(record.cost, `magic item ${record.key}`),
      weaponContentKey: record.weapon
        ? contentKeyFor("weapon", record.weapon.key, targetDocument)
        : null,
      armorContentKey: record.armor
        ? contentKeyFor("armor", record.armor.key, targetDocument)
        : null,
      rarity: {
        key: rarity.sourceKey,
        name: rarity.name,
        rank: rarity.rank,
        contentKey: rarity.contentKey,
      },
      requiresAttunement: record.requires_attunement,
      attunementDetail: record.attunement_detail,
    };
  }).sort(compareByKey);
}

function normalizeCreatureTypes(records: unknown[], context: ImportContext): NormalizedCreatureType[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedCreatureType>((value) => {
    const record = rawCreatureTypeSchema.parse(value);
    if (record.document !== context.taxonomyDocumentKey) {
      throw new Error(`Creature type ${record.key} is not from ${context.taxonomyDocumentKey}.`);
    }
    const description = requireDescriptionVariant(
      "creature type",
      record.key,
      record.descriptions,
      context.targetDocumentKey,
      context.targetGamesystem
    );
    return {
      kind: "creature-type",
      fidelityTier: 1,
      ...buildProvenance("creature-type", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      description: description.desc,
      sourceContainerDocumentKey: record.document,
    };
  }).sort(compareByKey);
}

function normalizeEnvironments(records: unknown[], context: ImportContext): NormalizedEnvironment[] {
  return records.map<NormalizedEnvironment>((value) => {
    const record = rawEnvironmentSchema.parse(value);
    if (record.document !== context.taxonomyDocumentKey && record.document !== context.targetDocumentKey) {
      throw new Error(`Environment ${record.key} escapes the core/SRD-2014 partition: ${record.document}.`);
    }
    const document = requireDocument(context.documents, record.document);
    return {
      kind: "environment",
      fidelityTier: 1,
      ...buildProvenance("environment", record.key, document, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      aquatic: record.aquatic,
      planar: record.planar,
      interior: record.interior,
    };
  }).sort(compareByKey);
}

function normalizeCreatureSets(
  records: unknown[],
  creatureRecords: unknown[],
  context: ImportContext
): NormalizedCreatureSet[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  const creatures = new Map(
    creatureRecords.map((value) => {
      const creature = rawCreatureSchema.parse(value);
      return [creature.key, creature] as const;
    })
  );
  return records.map<NormalizedCreatureSet>((value) => {
    const record = rawCreatureSetSchema.parse(value);
    if (record.document !== context.targetDocumentKey) {
      throw new Error(`Creature set ${record.key} escapes ${context.targetDocumentKey}.`);
    }
    const members = record.creatures.map((summary) => {
      const creature = creatures.get(summary.key);
      if (!creature || creature.name !== summary.name) {
        throw new Error(`Creature set ${record.key} references missing or divergent creature ${summary.key}.`);
      }
      return {
        sourceKey: creature.key,
        contentKey: contentKeyFor("creature", creature.key, targetDocument),
        name: creature.name,
      };
    }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    return {
      kind: "creature-set",
      fidelityTier: 1,
      ...buildProvenance("creature-set", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      creatures: members,
    };
  }).sort(compareByKey);
}

function normalizeCreatures(
  records: unknown[],
  creatureTypes: NormalizedContentRecord[],
  environments: NormalizedContentRecord[],
  creatureSets: NormalizedContentRecord[],
  damageTypes: NormalizedContentRecord[],
  conditions: NormalizedContentRecord[],
  sizes: NormalizedContentRecord[],
  context: ImportContext
): NormalizedCreature[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  const creatureTypeByKey = indexNormalizedKind(creatureTypes, "creature-type");
  const environmentByKey = indexNormalizedKind(environments, "environment");
  const creatureSetByKey = indexNormalizedKind(creatureSets, "creature-set");
  const damageTypeByKey = indexNormalizedKind(damageTypes, "damage-type");
  const conditionByKey = indexNormalizedKind(conditions, "condition");
  const sizeByKey = indexNormalizedKind(sizes, "size");

  return records.map<NormalizedCreature>((value) => {
    const record = rawCreatureSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Creature ${record.key}`);
    const creatureType = requireIndexedRecord(creatureTypeByKey, record.type.key, `creature type for ${record.key}`);
    const size = requireIndexedRecord(sizeByKey, record.size.key, `size for ${record.key}`);
    if (creatureType.name !== record.type.name || size.name !== record.size.name) {
      throw new Error(`Creature ${record.key} has divergent type or size metadata.`);
    }
    const actions = normalizeCreatureActions(record, damageTypeByKey);
    const referencedSets = record.creaturesets.map((key) => {
      const set = requireIndexedRecord(creatureSetByKey, key, `creature set for ${record.key}`);
      return contentReference(set);
    }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    const includedEnvironments: Array<ReturnType<typeof contentReference>> = [];
    const excludedEnvironmentSourceKeys: string[] = [];
    for (const summary of record.environments) {
      const environment = environmentByKey.get(summary.key);
      if (!environment) {
        excludedEnvironmentSourceKeys.push(summary.key);
        continue;
      }
      if (environment.name !== summary.name) {
        throw new Error(`Creature ${record.key} has divergent environment ${summary.key}.`);
      }
      includedEnvironments.push(contentReference(environment));
    }
    const defenses = record.resistances_and_immunities;
    return {
      kind: "creature",
      fidelityTier: 1,
      ...buildProvenance("creature", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      creatureType: contentReference(creatureType),
      size: contentReference(size),
      challengeRating: record.challenge_rating,
      proficiencyBonus: record.proficiency_bonus,
      experiencePoints: record.experience_points,
      category: record.category,
      subcategory: record.subcategory,
      alignment: record.alignment,
      armorClass: record.armor_class,
      armorDetail: record.armor_detail,
      hitPoints: record.hit_points,
      hitDice: record.hit_dice,
      abilities: normalizeAbilityValues(record.ability_scores),
      abilityModifiers: normalizeAbilityValues(record.modifiers),
      initiativeBonus: record.initiative_bonus,
      savingThrows: normalizePartialAbilityValues(record.saving_throws, `saving throws for ${record.key}`),
      savingThrowsAll: normalizeRequiredAbilityValues(record.saving_throws_all, `all saving throws for ${record.key}`),
      skillBonuses: normalizeSkillBonuses(record.skill_bonuses),
      skillBonusesAll: normalizeSkillBonuses(record.skill_bonuses_all),
      passivePerception: record.passive_perception,
      speed: { ...record.speed_all },
      senses: {
        unit: record.speed_all.unit,
        normal: record.normal_sight_range,
        darkvision: record.darkvision_range,
        blindsight: record.blindsight_range,
        tremorsense: record.tremorsense_range,
        truesight: record.truesight_range,
      },
      languages: {
        display: record.languages.as_string,
        entries: record.languages.data.map((language) => ({
          sourceKey: language.key,
          name: language.name,
          description: language.desc,
        })).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
      },
      defenses: {
        damageImmunitiesDisplay: defenses.damage_immunities_display,
        damageImmunities: normalizeSummaryReferences(defenses.damage_immunities, damageTypeByKey, record.key),
        damageResistancesDisplay: defenses.damage_resistances_display,
        damageResistances: normalizeSummaryReferences(defenses.damage_resistances, damageTypeByKey, record.key),
        damageVulnerabilitiesDisplay: defenses.damage_vulnerabilities_display,
        damageVulnerabilities: normalizeSummaryReferences(defenses.damage_vulnerabilities, damageTypeByKey, record.key),
        conditionImmunitiesDisplay: defenses.condition_immunities_display,
        conditionImmunities: normalizeSummaryReferences(defenses.condition_immunities, conditionByKey, record.key),
      },
      actions,
      traits: record.traits.map((trait) => ({ name: trait.name, description: trait.desc })),
      creatureSets: referencedSets,
      environments: includedEnvironments.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
      excludedEnvironmentSourceKeys: [...new Set(excludedEnvironmentSourceKeys)].sort(),
      illustration: record.illustration ? {
        sourceKey: record.illustration.key,
        name: record.illustration.name,
        fileUrl: record.illustration.file_url,
        altText: record.illustration.alt_text,
        attribution: record.illustration.attribution,
      } : null,
    };
  }).sort(compareByKey);
}

function normalizeCreatureActions(
  creature: z.infer<typeof rawCreatureSchema>,
  damageTypes: Map<string, Extract<NormalizedContentRecord, { kind: "damage-type" }>>
): NormalizedCreature["actions"] {
  const ordered = [...creature.actions].sort((left, right) => {
    const leftOrder = left.order_in_statblock ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order_in_statblock ?? Number.MAX_SAFE_INTEGER;
    return `${left.action_type ?? ""}:${String(leftOrder).padStart(8, "0")}:${left.name}:${left.desc}`
      .localeCompare(`${right.action_type ?? ""}:${String(rightOrder).padStart(8, "0")}:${right.name}:${right.desc}`);
  });
  const slugCounts = new Map<string, number>();
  return ordered.map((action) => {
    const baseSlug = slugify(action.name);
    const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, occurrence);
    const actionKey = occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`;
    return {
      actionKey,
      name: action.name,
      description: action.desc,
      mechanicsTier: 0 as const,
      actionType: normalizeActionType(action.action_type, creature.key, action.name),
      orderInStatblock: action.order_in_statblock,
      legendaryActionCost: action.legendary_action_cost,
      limitedToForm: action.limited_to_form,
      usageLimits: action.usage_limits ? { ...action.usage_limits } : null,
      sourceAttackMetadata: action.attacks.map((attack) => ({
        name: attack.name,
        attackType: attack.attack_type,
        toHit: attack.to_hit_mod,
        reach: attack.reach,
        range: attack.range,
        longRange: attack.long_range,
        distanceUnit: attack.distance_unit,
        targetCreatureOnly: attack.target_creature_only,
        damage: {
          dieCount: attack.damage_die_count,
          dieSides: parseSourceDieSides(attack.damage_die_type),
          bonus: attack.damage_bonus,
          type: attack.damage_type
            ? contentReference(requireIndexedRecord(damageTypes, attack.damage_type.key, `source attack damage type for ${creature.key}`))
            : null,
        },
        extraDamage: {
          dieCount: attack.extra_damage_die_count,
          dieSides: parseSourceDieSides(attack.extra_damage_die_type),
          bonus: attack.extra_damage_bonus,
          type: attack.extra_damage_type
            ? contentReference(requireIndexedRecord(damageTypes, attack.extra_damage_type.key, `source extra damage type for ${creature.key}`))
            : null,
        },
      })),
    };
  });
}

function normalizeSpellSchools(
  records: unknown[],
  context: ImportContext
): NormalizedSpellSchool[] {
  const sourceDocument = requireDocument(context.documents, context.taxonomyDocumentKey);
  return records.map<NormalizedSpellSchool>((value) => {
    const record = rawSpellSchoolSchema.parse(value);
    if (record.document !== context.taxonomyDocumentKey) {
      throw new Error(`Spell school ${record.key} escaped the pinned taxonomy document.`);
    }
    return {
      kind: "spell-school",
      fidelityTier: 1,
      ...buildProvenance("spell-school", record.key, sourceDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      sourceContainerDocumentKey: record.document,
    };
  }).sort(compareByKey);
}

function normalizeSpells(
  records: unknown[],
  schools: NormalizedContentRecord[],
  damageTypes: NormalizedContentRecord[],
  context: ImportContext
): NormalizedSpell[] {
  const schoolIndex = indexNormalizedKind(schools, "spell-school");
  const damageTypeIndex = indexNormalizedKind(damageTypes, "damage-type");
  return records.map<NormalizedSpell>((value) => {
    const record = rawSpellSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Spell ${record.key}`);
    const school = requireIndexedRecord(schoolIndex, record.school.key, "spell school");
    if (school.name !== record.school.name) {
      throw new Error(`Spell ${record.key} has a divergent school summary.`);
    }
    const normalizedDamageTypes = [...new Set(record.damage_types)].map((sourceKey) => {
      const damageType = requireIndexedRecord(damageTypeIndex, sourceKey, "spell damage type");
      return contentReference(damageType);
    }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    return {
      kind: "spell",
      fidelityTier: 1,
      ...buildProvenance("spell", record.key, requireDocument(context.documents, record.document.key), context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      level: record.level,
      school: contentReference(school),
      higherLevel: record.higher_level,
      targetType: record.target_type,
      targetCount: record.target_count,
      range: {
        text: record.range_text,
        distance: record.range,
        unit: record.range_unit,
      },
      ritual: record.ritual,
      castingTime: record.casting_time,
      reactionCondition: record.reaction_condition?.trim() || null,
      components: {
        verbal: record.verbal,
        somatic: record.somatic,
        material: record.material,
        materialSpecified: record.material_specified,
        materialCostGp: record.material_cost,
        materialConsumed: record.material_consumed,
      },
      savingThrowAbility: normalizeSpellAbility(record.saving_throw_ability),
      attackRoll: record.attack_roll,
      damageRoll: record.damage_roll.trim() || null,
      damageTypes: normalizedDamageTypes,
      duration: record.duration,
      area: {
        shape: record.shape_type,
        size: record.shape_size,
        unit: record.shape_size_unit,
      },
      concentration: record.concentration,
      classes: [...record.classes]
        .map((candidate) => ({ sourceKey: candidate.key, name: candidate.name }))
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
      castingOptions: [...record.casting_options]
        .map((option) => ({
          type: option.type,
          damageRoll: option.damage_roll?.trim() || null,
          targetCount: option.target_count,
          duration: option.duration?.trim() || null,
          range: option.range?.trim() || null,
          concentration: option.concentration,
          shapeSize: option.shape_size,
          description: option.desc?.trim() || null,
        }))
        .sort((left, right) => left.type.localeCompare(right.type)),
    };
  }).sort(compareByKey);
}

function normalizeSpellLists(
  records: unknown[],
  spells: NormalizedContentRecord[],
  context: ImportContext
): NormalizedSpellList[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  const targetSpells = spells.filter((record): record is NormalizedSpell => record.kind === "spell");
  const spellByV1Slug = new Map<string, NormalizedSpell>();
  for (const spell of targetSpells) {
    const slug = spell.sourceKey.replace(/^srd_/, "");
    if (spellByV1Slug.has(slug)) throw new Error(`Duplicate SRD spell v1 slug projection: ${slug}.`);
    spellByV1Slug.set(slug, spell);
  }

  return records.map<NormalizedSpellList>((value) => {
    const record = rawV1SpellListSchema.parse(value);
    if (!SRD_SPELLCASTING_CLASSES.includes(record.slug as typeof SRD_SPELLCASTING_CLASSES[number]) || record.slug === "paladin") {
      throw new Error(`Unexpected v1 spell-list class: ${record.slug}.`);
    }
    const classSourceKey = `srd_${record.slug}`;
    const sourceSlugs = [...new Set(record.spells)].sort();
    const included = sourceSlugs
      .map((slug) => spellByV1Slug.get(slug))
      .filter((spell): spell is NormalizedSpell => spell !== undefined)
      .sort(compareByKey);
    const canonical = targetSpells
      .filter((spell) => spell.classes.some((candidate) => candidate.sourceKey === classSourceKey))
      .sort(compareByKey);
    if (canonicalJson(included.map((spell) => spell.contentKey)) !== canonicalJson(canonical.map((spell) => spell.contentKey))) {
      throw new Error(`v1 ${record.slug} spell list diverges from v2 canonical class membership.`);
    }
    const provenance = buildV1Provenance(
      "spell-list",
      record.slug,
      targetDocument,
      context.sourceFetchedAt
    );
    return {
      kind: "spell-list",
      fidelityTier: 1,
      ...provenance,
      classSourceKey,
      className: canonical[0]?.classes.find((candidate) => candidate.sourceKey === classSourceKey)?.name
        ?? titleCase(record.name),
      sourceSlug: record.slug,
      sourceDocument: v1DocumentSummary(record),
      spells: included.map(contentReference),
      excludedSourceSpellSlugs: sourceSlugs.filter((slug) => !spellByV1Slug.has(slug)),
      canonicalClassMembershipCorroborated: true,
    };
  }).sort(compareByKey);
}

function normalizeSpellProgressions(
  records: unknown[],
  context: ImportContext
): NormalizedSpellProgression[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  const casterClasses = records
    .map((value) => rawV1ClassSchema.parse(value))
    .filter((record) => SRD_SPELLCASTING_CLASSES.includes(record.slug as typeof SRD_SPELLCASTING_CLASSES[number]));
  if (casterClasses.length !== SRD_SPELLCASTING_CLASSES.length) {
    throw new Error(`Expected ${SRD_SPELLCASTING_CLASSES.length} SRD spellcasting classes; found ${casterClasses.length}.`);
  }
  return casterClasses.map<NormalizedSpellProgression>((record) => {
    if (record.document__slug !== "wotc-srd") {
      throw new Error(`Spell progression ${record.slug} is not sourced from the v1 WotC SRD document.`);
    }
    const table = parseMarkdownTable(record.table, `class ${record.slug}`);
    if (table.rows.length !== 20) throw new Error(`Class ${record.slug} table must contain levels 1 through 20.`);
    const slotMode = record.slug === "warlock" ? "pact" : "standard";
    const levels = table.rows.map((row, index) => {
      const characterLevel = parseOrdinal(row.Level ?? "", `class ${record.slug} level`);
      if (characterLevel !== index + 1) {
        throw new Error(`Class ${record.slug} table level order diverges at ${characterLevel}.`);
      }
      const slots = emptySpellSlots();
      if (slotMode === "pact") {
        const count = parseTableCount(row["Spell Slots"], `class ${record.slug} spell slots`);
        const slotLevel = parseOrdinal(row["Slot Level"] ?? "", `class ${record.slug} slot level`);
        slots[String(slotLevel) as keyof typeof slots] = count;
      } else {
        for (let spellLevel = 1; spellLevel <= 9; spellLevel += 1) {
          slots[String(spellLevel) as keyof typeof slots] = parseTableCount(
            row[ordinal(spellLevel)],
            `class ${record.slug} ${ordinal(spellLevel)}-level slots`
          );
        }
      }
      return { characterLevel, slots };
    });
    const mode = spellSelectionMode(record.slug);
    return {
      kind: "spell-progression",
      fidelityTier: 1,
      ...buildV1Provenance("spell-progression", record.slug, targetDocument, context.sourceFetchedAt),
      classSourceKey: `srd_${record.slug}`,
      className: record.name,
      spellcastingAbility: requireSpellAbility(record.spellcasting_ability, record.slug),
      slotMode,
      slotRecovery: slotMode === "pact" ? "short-or-long-rest" : "long-rest",
      selectionMode: mode,
      knownSpellLimits: table.rows.map((row) => table.headers.includes("Spells Known")
        ? parseTableCount(row["Spells Known"], `class ${record.slug} spells known`)
        : null),
      cantripsKnown: table.rows.map((row) => table.headers.includes("Cantrips Known")
        ? parseTableCount(row["Cantrips Known"], `class ${record.slug} cantrips known`)
        : null),
      preparedFormula: mode === "known"
        ? null
        : {
            classLevelMultiplier: record.slug === "paladin" ? 0.5 : 1,
            abilityModifierMultiplier: 1,
            minimum: 1,
          },
      spellbook: mode === "spellbook" ? { initialSpellCount: 6, spellsGainedPerLevel: 2 } : null,
      levels,
      sourceTableSha256: sha256(record.table),
      sourceDocument: v1DocumentSummary(record),
    };
  }).sort(compareByKey);
}

function verifySpellReferences(records: CollectionRecords<NormalizedContentRecord>): void {
  const schools = indexNormalizedKind(requireCollection(records, "spellschools"), "spell-school");
  const damageTypes = indexNormalizedKind(requireCollection(records, "damagetypes"), "damage-type");
  const spells = indexNormalizedKind(requireCollection(records, "spells"), "spell");
  for (const spell of spells.values()) {
    requireIndexedRecord(schools, spell.school.sourceKey, "spell school");
    for (const damageType of spell.damageTypes) {
      requireIndexedRecord(damageTypes, damageType.sourceKey, "spell damage type");
    }
  }
  for (const list of requireCollection(records, "spelllists")) {
    if (list.kind !== "spell-list") continue;
    for (const spell of list.spells) {
      const installed = [...spells.values()].find((candidate) => candidate.contentKey === spell.contentKey);
      if (!installed || installed.name !== spell.name) {
        throw new Error(`${list.contentKey} references missing or divergent spell ${spell.contentKey}.`);
      }
    }
  }
}

function normalizeAbilities(
  records: unknown[],
  skills: NormalizedContentRecord[],
  context: ImportContext
): NormalizedAbility[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  const skillIndex = indexNormalizedKind(skills, "skill");
  return records.map<NormalizedAbility>((value) => {
    const record = rawAbilitySchema.parse(value);
    if (record.document !== context.taxonomyDocumentKey) {
      throw new Error(`Ability ${record.key} escaped the pinned taxonomy container.`);
    }
    const description = requireDescriptionVariant(
      "ability",
      record.key,
      record.descriptions,
      context.targetDocumentKey,
      context.targetGamesystem
    );
    const abilitySkills = record.skills
      .filter((skill) => skill.document === context.taxonomyDocumentKey)
      .map((skill) => {
        const normalized = requireIndexedRecord(skillIndex, skill.key, `ability skill for ${record.key}`);
        if (normalized.name !== skill.name || normalized.ability !== record.key) {
          throw new Error(`Ability ${record.key} has a divergent skill summary for ${skill.key}.`);
        }
        return contentReference(normalized);
      })
      .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
    return {
      kind: "ability",
      fidelityTier: 1,
      ...buildProvenance("ability", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      abbreviation: record.key,
      shortDescription: record.short_desc,
      description: description.desc,
      skills: abilitySkills,
      sourceContainerDocumentKey: record.document,
    };
  }).sort(compareByKey);
}

function normalizeLanguages(records: unknown[], context: ImportContext): NormalizedLanguage[] {
  const taxonomyDocument = requireDocument(context.documents, context.taxonomyDocumentKey);
  return records
    .map((value) => rawLanguageSchema.parse(value))
    .filter((record) => record.document.key === context.taxonomyDocumentKey)
    .map<NormalizedLanguage>((record) => {
      if (record.document.gamesystem.key !== context.targetGamesystem) {
        throw new Error(`Language ${record.key} belongs to ${record.document.gamesystem.key}.`);
      }
      return {
        kind: "language",
        fidelityTier: 1,
        ...buildProvenance("language", record.key, taxonomyDocument, context.sourceFetchedAt),
        name: record.name,
        description: record.desc,
        isExotic: record.is_exotic,
        isSecret: record.is_secret,
        scriptLanguageSourceKey: record.script_language,
        sourceContainerDocumentKey: record.document.key,
      };
    })
    .sort(compareByKey);
}

function normalizeAlignments(records: unknown[], context: ImportContext): NormalizedAlignment[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  return records.map<NormalizedAlignment>((value) => {
    const record = rawAlignmentSchema.parse(value);
    if (
      record.document.key !== context.taxonomyDocumentKey
      || record.document.gamesystem.key !== context.targetGamesystem
    ) {
      throw new Error(`Alignment ${record.key} escaped the pinned core taxonomy.`);
    }
    const description = requireDescriptionVariant(
      "alignment",
      record.key,
      record.descriptions,
      context.targetDocumentKey,
      context.targetGamesystem
    );
    return {
      kind: "alignment",
      fidelityTier: 1,
      ...buildProvenance("alignment", record.key, targetDocument, context.sourceFetchedAt),
      name: record.key === "neutral" ? "Neutral" : titleCase(record.key),
      morality: record.morality,
      societalAttitude: record.societal_attitude,
      shortName: record.short_name,
      description: description.desc,
      sourceContainerDocumentKey: record.document.key,
    };
  }).sort(compareByKey);
}

function normalizeSpecies(records: unknown[], context: ImportContext): NormalizedSpecies[] {
  return records.map<NormalizedSpecies>((value) => {
    const record = rawSpeciesSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Species ${record.key}`);
    if (record.is_subspecies !== Boolean(record.subspecies_of)) {
      throw new Error(`Species ${record.key} has divergent subspecies metadata.`);
    }
    return {
      kind: "species",
      fidelityTier: 1,
      ...buildProvenance("species", record.key, requireDocument(context.documents, record.document.key), context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      isSubspecies: record.is_subspecies,
      subspeciesOfSourceKey: record.subspecies_of,
      traits: record.traits.map((trait) => ({
        name: trait.name,
        description: trait.desc,
        traitType: trait.type,
        order: trait.order,
      })),
    };
  }).sort(compareByKey);
}

function normalizeCharacterClasses(
  records: unknown[],
  abilities: NormalizedContentRecord[],
  context: ImportContext
): NormalizedCharacterClass[] {
  const targetDocument = requireDocument(context.documents, context.targetDocumentKey);
  const abilityRecords = abilities.filter((record): record is NormalizedAbility => record.kind === "ability");
  const abilityByName = new Map(abilityRecords.map((ability) => [ability.name.toLocaleLowerCase("en-US"), ability]));
  const rawRecords = records.map((value) => rawCharacterClassSchema.parse(value));
  const rawByKey = new Map(rawRecords.map((record) => [record.key, record]));
  return rawRecords.map<NormalizedCharacterClass>((record) => {
    assertEmbeddedTargetDocument(record.document, context, `Class ${record.key}`);
    const subclassOf = record.subclass_of
      ? (() => {
          const parent = rawByKey.get(record.subclass_of.key);
          if (!parent || parent.name !== record.subclass_of.name) {
            throw new Error(`Class ${record.key} references a missing or divergent base class.`);
          }
          return {
            sourceKey: parent.key,
            contentKey: contentKeyFor("class", parent.key, targetDocument),
            name: parent.name,
          };
        })()
      : null;
    return {
      kind: "class",
      fidelityTier: 1,
      ...buildProvenance("class", record.key, targetDocument, context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      isSubclass: subclassOf !== null,
      subclassOf,
      hitDie: parseClassHitDie(record.hit_dice, record.key),
      casterType: normalizeCasterType(record.caster_type, record.key),
      savingThrows: normalizeAbilitySummaries(record.saving_throws, abilityByName, record.key),
      primaryAbilities: normalizeAbilitySummaries(record.primary_abilities, abilityByName, record.key),
      features: [...record.features].sort((left, right) => left.key.localeCompare(right.key)).map((feature) => ({
        sourceKey: feature.key,
        name: feature.name,
        description: feature.desc,
        featureType: feature.feature_type,
        gainedAt: [...feature.gained_at]
          .sort((left, right) => left.level - right.level || (left.detail ?? "").localeCompare(right.detail ?? ""))
          .map((item) => ({ level: item.level, detail: item.detail })),
        tableData: [...feature.data_for_class_table]
          .sort((left, right) => left.level - right.level || left.column_value.localeCompare(right.column_value))
          .map((item) => ({ level: item.level, value: item.column_value })),
      })),
    };
  }).sort(compareByKey);
}

function normalizeBackgrounds(records: unknown[], context: ImportContext): NormalizedBackground[] {
  return records.map<NormalizedBackground>((value) => {
    const record = rawBackgroundSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Background ${record.key}`);
    return {
      kind: "background",
      fidelityTier: 1,
      ...buildProvenance("background", record.key, requireDocument(context.documents, record.document.key), context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      benefits: [...record.benefits]
        .map((benefit) => ({ name: benefit.name, description: benefit.desc, benefitType: benefit.type }))
        .sort((left, right) => `${left.benefitType}:${left.name}`.localeCompare(`${right.benefitType}:${right.name}`)),
    };
  }).sort(compareByKey);
}

/**
 * Promote the 5e-2014 background partition from the full v2 corpus into the
 * same typed/profile contract used by the pinned SRD slice. Other game
 * systems remain corpus references until they have their own rules kernel.
 */
export function promoteOpen5e2014Backgrounds(
  records: unknown[],
  documents: unknown[],
  skills: NormalizedContentRecord[],
  languages: NormalizedContentRecord[],
  items: NormalizedContentRecord[],
  sourceFetchedAt: string
): { normalized: NormalizedBackground[]; compiled: CompiledBackgroundProfile[] } {
  const documentByKey = new Map(
    documents.map((value) => {
      const document = rawDocumentSchema.parse(value);
      return [document.key, document] as const;
    })
  );
  const normalized = records
    .map((value) => rawCorpusBackgroundSchema.parse(value))
    .filter((record) => record.document.gamesystem.key === "5e-2014")
    .map<NormalizedBackground>((record) => {
      const document = documentByKey.get(record.document.key);
      if (!document) throw new Error(`Background ${record.key} references missing document ${record.document.key}.`);
      return {
        kind: "background",
        fidelityTier: 1,
        ...buildProvenance("background", record.key, document, sourceFetchedAt),
        name: record.name,
        description: record.desc,
        benefits: [...record.benefits]
          .map((benefit) => ({ name: benefit.name, description: benefit.desc, benefitType: benefit.type }))
          .sort((left, right) => `${left.benefitType}:${left.name}`.localeCompare(`${right.benefitType}:${right.name}`)),
      };
    })
    .sort(compareByKey);
  return {
    normalized,
    compiled: compileBackgroundProfiles(normalized, skills, languages, items),
  };
}

function normalizeFeats(records: unknown[], context: ImportContext): NormalizedFeat[] {
  return records.map<NormalizedFeat>((value) => {
    const record = rawFeatSchema.parse(value);
    assertEmbeddedTargetDocument(record.document, context, `Feat ${record.key}`);
    return {
      kind: "feat",
      fidelityTier: 0,
      ...buildProvenance("feat", record.key, requireDocument(context.documents, record.document.key), context.sourceFetchedAt),
      name: record.name,
      description: record.desc,
      featType: record.type,
      prerequisite: record.prerequisite,
      hasPrerequisite: record.has_prerequisite,
      benefits: record.benefits.map((benefit) => ({ description: benefit.desc })),
    };
  }).sort(compareByKey);
}

function verifyCharacterOptionReferences(records: CollectionRecords<NormalizedContentRecord>): void {
  const skills = indexNormalizedKind(requireCollection(records, "skills"), "skill");
  const abilities = indexNormalizedKind(requireCollection(records, "abilities"), "ability");
  const languages = indexNormalizedKind(requireCollection(records, "languages"), "language");
  const species = indexNormalizedKind(requireCollection(records, "species"), "species");
  const classes = indexNormalizedKind(requireCollection(records, "classes"), "class");
  for (const ability of abilities.values()) {
    for (const skill of ability.skills) requireIndexedRecord(skills, skill.sourceKey, `skill for ${ability.sourceKey}`);
  }
  for (const language of languages.values()) {
    if (language.scriptLanguageSourceKey) {
      requireIndexedRecord(languages, language.scriptLanguageSourceKey, `script language for ${language.sourceKey}`);
    }
  }
  for (const candidate of species.values()) {
    if (candidate.subspeciesOfSourceKey) {
      const parent = requireIndexedRecord(species, candidate.subspeciesOfSourceKey, `parent species for ${candidate.sourceKey}`);
      if (parent.isSubspecies) throw new Error(`Species ${candidate.sourceKey} cannot inherit from another subspecies.`);
    }
  }
  for (const candidate of classes.values()) {
    if (candidate.subclassOf) {
      const parent = requireIndexedRecord(classes, candidate.subclassOf.sourceKey, `base class for ${candidate.sourceKey}`);
      if (parent.isSubclass || parent.contentKey !== candidate.subclassOf.contentKey) {
        throw new Error(`Class ${candidate.sourceKey} has an invalid base-class reference.`);
      }
    }
    for (const ability of [...candidate.savingThrows, ...candidate.primaryAbilities]) {
      requireIndexedRecord(abilities, ability.sourceKey, `ability for ${candidate.sourceKey}`);
    }
  }
}

function verifyRulesReferenceGraph(records: CollectionRecords<NormalizedContentRecord>): void {
  const rules = indexNormalizedKind(requireCollection(records, "rules"), "rule");
  const rulesets = indexNormalizedKind(requireCollection(records, "rulesets"), "ruleset");
  const rulesByContentKey = new Map([...rules.values()].map((rule) => [rule.contentKey, rule]));
  const referencedRuleKeys = new Set<string>();
  for (const rule of rules.values()) {
    requireIndexedRecord(rulesets, rule.rulesetKey, `ruleset for ${rule.sourceKey}`);
    if (rule.index === undefined || rule.initialHeaderLevel === undefined || rule.crossReferences === undefined) {
      throw new Error(`S6 rule ${rule.sourceKey} is missing hierarchy metadata.`);
    }
  }
  for (const ruleset of rulesets.values()) {
    for (const contentKey of ruleset.ruleContentKeys) {
      const rule = rulesByContentKey.get(contentKey);
      if (!rule || rule.rulesetKey !== ruleset.sourceKey) {
        throw new Error(`Ruleset ${ruleset.sourceKey} references missing or divergent rule ${contentKey}.`);
      }
      if (referencedRuleKeys.has(contentKey)) {
        throw new Error(`Rule ${contentKey} appears in more than one ruleset.`);
      }
      referencedRuleKeys.add(contentKey);
    }
  }
  if (referencedRuleKeys.size !== rules.size) {
    throw new Error(`S6 ruleset graph covers ${referencedRuleKeys.size} of ${rules.size} normalized rules.`);
  }
}

function compileSpeciesProfiles(
  records: NormalizedContentRecord[],
  languages: NormalizedContentRecord[]
): CompiledSpeciesProfile[] {
  const species = indexNormalizedKind(records, "species");
  const languageRecords = indexNormalizedKind(languages, "language");
  const languageByName = new Map(
    [...languageRecords.values()].map((language) => [language.name.toLocaleLowerCase("en-US"), language])
  );
  const cache = new Map<string, CompiledSpeciesProfile>();
  const compileOne = (source: NormalizedSpecies, stack: Set<string>): CompiledSpeciesProfile => {
    const cached = cache.get(source.sourceKey);
    if (cached) return cached;
    if (stack.has(source.sourceKey)) throw new Error(`Species inheritance cycle at ${source.sourceKey}.`);
    const nextStack = new Set(stack).add(source.sourceKey);
    const parentSource = source.subspeciesOfSourceKey
      ? requireIndexedRecord(species, source.subspeciesOfSourceKey, `parent species for ${source.sourceKey}`)
      : null;
    const parent = parentSource ? compileOne(parentSource, nextStack) : null;
    const local = parseSpeciesTraits(source, languageByName);
    const abilityChoice = mergeAbilityChoices(parent?.abilityChoice ?? null, local.abilityChoice, source.sourceKey);
    const profile: CompiledSpeciesProfile = {
      kind: "species-profile",
      fidelityTier: 2,
      ...compiledProvenance("species-profile", source),
      sourceContentKey: source.contentKey,
      parent: parentSource ? contentReference(parentSource) : null,
      abilityBonuses: addAbilityBonuses(parent?.abilityBonuses, local.abilityBonuses),
      abilityChoice,
      size: local.size ?? parent?.size ?? fail(`Species ${source.sourceKey} has no inherited size.`),
      speedFeet: local.speedFeet ?? parent?.speedFeet ?? fail(`Species ${source.sourceKey} has no inherited speed.`),
      languages: uniqueReferences([...(parent?.languages ?? []), ...local.languages]),
      languageChoiceCount: (parent?.languageChoiceCount ?? 0) + local.languageChoiceCount,
      featureNames: [...new Set([...(parent?.featureNames ?? []), ...local.featureNames])],
      sourceTraitsSha256: sha256(canonicalJson({
        parent: parent?.sourceTraitsSha256 ?? null,
        traits: source.traits,
      })),
    };
    cache.set(source.sourceKey, profile);
    return profile;
  };
  return [...species.values()].map((source) => compileOne(source, new Set())).sort(compareByKey);
}

function compileClassProfiles(
  records: NormalizedContentRecord[],
  skills: NormalizedContentRecord[]
): CompiledClassProfile[] {
  const classes = indexNormalizedKind(records, "class");
  const skillRecords = indexNormalizedKind(skills, "skill");
  const skillByName = new Map(
    [...skillRecords.values()].map((skill) => [skill.name.toLocaleLowerCase("en-US"), skill])
  );
  return [...classes.values()].filter((source) => !source.isSubclass).map<CompiledClassProfile>((source) => {
    if (!source.hitDie || source.savingThrows.length !== 2) {
      throw new Error(`Base class ${source.sourceKey} is missing hit-die or saving-throw mechanics.`);
    }
    const proficienciesFeature = requireSingleFeature(source, "PROFICIENCIES");
    const equipmentFeature = requireSingleFeature(source, "STARTING_EQUIPMENT");
    const parsed = parseClassProficiencies(proficienciesFeature.description, skillByName, source.sourceKey);
    const typedSavingThrows = source.savingThrows.map((ability) => ability.sourceKey).sort();
    if (canonicalJson([...parsed.savingThrows].sort()) !== canonicalJson(typedSavingThrows)) {
      throw new Error(`Class ${source.sourceKey} saving-throw prose diverges from its typed references.`);
    }
    return {
      kind: "class-profile",
      fidelityTier: 2,
      ...compiledProvenance("class-profile", source),
      sourceContentKey: source.contentKey,
      hitDie: source.hitDie,
      savingThrows: parsed.savingThrows,
      proficiencies: parsed.proficiencies,
      toolChoice: parsed.toolChoice,
      skillChoice: parsed.skillChoice,
      levelOneFeatures: source.features
        .filter((feature) => feature.featureType === "CLASS_LEVEL_FEATURE" && feature.gainedAt.some((item) => item.level === 1))
        .map((feature) => ({ sourceKey: feature.sourceKey, name: feature.name }))
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
      startingEquipmentDescription: equipmentFeature.description,
      sourceFeaturesSha256: sha256(canonicalJson(source.features)),
    };
  }).sort(compareByKey);
}

function compileBackgroundProfiles(
  records: NormalizedContentRecord[],
  skills: NormalizedContentRecord[],
  languages: NormalizedContentRecord[] = [],
  items: NormalizedContentRecord[] = []
): CompiledBackgroundProfile[] {
  const backgrounds = indexNormalizedKind(records, "background");
  const skillRecords = indexNormalizedKind(skills, "skill");
  const skillByName = new Map(
    [...skillRecords.values()].map((skill) => [skill.name.toLocaleLowerCase("en-US"), skill])
  );
  const languageRecords = indexNormalizedKind(languages, "language");
  const languageByName = new Map(
    [...languageRecords.values()].map((language) => [language.name.toLocaleLowerCase("en-US"), language])
  );
  const itemRecords = items.filter((record): record is NormalizedItem => record.kind === "item");
  return [...backgrounds.values()].map<CompiledBackgroundProfile>((source) => {
    const skillBenefit = source.benefits.find((benefit) => benefit.benefitType === "skill_proficiency");
    const languageBenefit = source.benefits.find((benefit) => benefit.benefitType === "language");
    const toolBenefit = source.benefits.find((benefit) => benefit.benefitType === "tool_proficiency");
    const equipmentBenefit = source.benefits.find((benefit) =>
      benefit.benefitType === "equipment" || benefit.benefitType === "suggested_equipment"
    );
    const skillResult = parseBackgroundSkills(skillBenefit?.description ?? "", skillByName, source.sourceKey);
    const languageResult = parseBackgroundLanguages(languageBenefit?.description ?? "", languageByName);
    const toolResult = parseBackgroundTools(toolBenefit?.description ?? "");
    const equipmentDescription = equipmentBenefit?.description ?? "";
    const currencyMatch = /\b(\d+)\s*g(?:p)?\b/i.exec(equipmentDescription);
    const startingItemSourceKeys = inferBackgroundItemSourceKeys(equipmentDescription, itemRecords);
    const selectable = source.sourceKey !== "tdcs_fate-touched"
      && !skillResult.unsupported
      && !languageResult.unsupported;
    return {
      kind: "background-profile",
      fidelityTier: 2,
      ...compiledProvenance("background-profile", source),
      sourceContentKey: source.contentKey,
      skillProficiencies: skillResult.fixed,
      skillChoice: skillResult.choice,
      fixedLanguages: languageResult.fixed,
      languageChoiceCount: languageResult.choiceCount,
      toolProficiencies: toolResult.fixed,
      toolChoice: toolResult.choice,
      startingCurrencyCopper: currencyMatch?.[1] ? Number(currencyMatch[1]) * 100 : 0,
      startingItemSourceKeys,
      startingEquipmentDescription: equipmentDescription,
      selectable,
      sourceBenefitsSha256: sha256(canonicalJson(source.benefits)),
    };
  }).sort(compareByKey);
}

interface BackgroundSkillParseResult {
  fixed: Array<{ sourceKey: string; contentKey: string; name: string }>;
  choice: CompiledBackgroundProfile["skillChoice"];
  unsupported: boolean;
}

function parseBackgroundSkills(
  description: string,
  skillByName: Map<string, NormalizedSkill>,
  sourceKey: string
): BackgroundSkillParseResult {
  const text = normalizeTypography(description).replace(/\s+/g, " ").trim();
  if (!text) return { fixed: [], choice: null, unsupported: false };
  let remainder = text;
  let choice: CompiledBackgroundProfile["skillChoice"] = null;
  let unsupported = false;
  const choiceMatch = /\b(?:choose\s+|your choice of\s+)?(one|two|three|four|\d+)\s+(?:of your choice\s+)?(?:from among|between|from)\s+([^.;]+)/i.exec(remainder);
  const eitherMatch = /\beither\s+([^.;]+)/i.exec(remainder);
  const selectedText = choiceMatch?.[0] ?? eitherMatch?.[0] ?? "";
  const selectedCount = choiceMatch?.[1] ? wordOrNumber(choiceMatch[1], `background skill choice for ${sourceKey}`) : 1;
  const selectedNames = choiceMatch?.[2] ?? eitherMatch?.[1] ?? "";
  if (selectedText && selectedNames) {
    const names = splitEnglishChoiceList(selectedNames);
    const references = names.flatMap((name) => {
      const skill = skillByName.get(name.toLocaleLowerCase("en-US"));
      if (!skill) {
        unsupported = true;
        return [];
      }
      return [contentReference(skill)];
    });
    if (references.length === 0 || references.length < selectedCount) unsupported = true;
    else choice = {
      count: selectedCount,
      options: references.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
    };
    remainder = remainder.replace(selectedText, " ");
  }
  const fixed = [...skillByName.values()]
    .filter((skill) => new RegExp(`\\b${escapeRegExp(skill.name)}\\b`, "i").test(remainder))
    .map(contentReference)
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  return { fixed, choice, unsupported };
}

interface BackgroundLanguageParseResult {
  fixed: Array<{ sourceKey: string; contentKey: string; name: string }>;
  choiceCount: number;
  unsupported: boolean;
}

function parseBackgroundLanguages(
  description: string,
  languageByName: Map<string, NormalizedLanguage>
): BackgroundLanguageParseResult {
  const text = normalizeTypography(description).replace(/\s+/g, " ").trim();
  if (!text || /no additional languages?/i.test(text)) return { fixed: [], choiceCount: 0, unsupported: false };
  const choiceMatch = /\b(one|two|three|four|\d+)\s+(?:language(?:s)?\s+)?(?:of\s+)?your choice\b/i.exec(text);
  const fixed = [...languageByName.values()]
    .filter((language) => new RegExp(`\\b${escapeRegExp(language.name)}\\b`, "i").test(text))
    .map(contentReference)
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  return {
    fixed,
    choiceCount: choiceMatch?.[1] ? wordOrNumber(choiceMatch[1], "background language choice") : 0,
    unsupported: Boolean(!choiceMatch && fixed.length === 0),
  };
}

interface BackgroundToolParseResult {
  fixed: string[];
  choice: CompiledBackgroundProfile["toolChoice"];
}

function parseBackgroundTools(description: string): BackgroundToolParseResult {
  const text = normalizeTypography(description).replace(/\s+/g, " ").trim();
  if (!text || /no additional tool proficiencies?/i.test(text)) return { fixed: [], choice: null };
  let remainder = text;
  let choice: CompiledBackgroundProfile["toolChoice"] = null;
  const pairedChoiceMatch = /\bone type of gaming set,\s*one musical instrument\b/i.exec(remainder);
  if (pairedChoiceMatch?.[0]) {
    choice = { count: 2, description: text, options: [] };
    remainder = remainder.replace(pairedChoiceMatch[0], " ");
  }
  const structuredChoiceMatch = /\b(?:your choice of\s+)?(one|two|three|four|\d+)\s+(?:(?:type(?:s)? of\s+)?(?:your choice|of your choice)\b(?:\s+from\s+([^.;]+))?|from\s+([^.;]+))/i.exec(remainder)
    ?? /\b(one|two|three|four|\d+)\s+artisan(?:['\u2019])s tools? set of your choice\b/i.exec(remainder);
  if (structuredChoiceMatch?.[0] && structuredChoiceMatch[1]) {
    choice = {
      count: wordOrNumber(structuredChoiceMatch[1], "background tool choice"),
      description: text,
      options: structuredChoiceMatch[2]
        ? splitEnglishChoiceList(structuredChoiceMatch[2])
        : structuredChoiceMatch[3]
          ? splitEnglishChoiceList(structuredChoiceMatch[3])
          : [],
    };
    remainder = remainder.replace(structuredChoiceMatch[0], " ");
  }
  const choiceMatch = /\b(one|two|three|four|\d+)\s+(?:type of\s+|types of\s+)?(?:your choice|of your choice)\b(?:\s+from\s+([^.;]+))?/i.exec(remainder)
    ?? /\b(one|two|three|four|\d+)\s+artisan[’']s tools? set of your choice\b/i.exec(remainder);
  if (choiceMatch?.[0] && choiceMatch[1]) {
    const count = wordOrNumber(choiceMatch[1], "background tool choice");
    const options = choiceMatch[2] ? splitEnglishList(choiceMatch[2]) : [];
    choice = {
      count,
      description: text,
      options,
    };
    remainder = remainder.replace(choiceMatch[0], " ");
  } else if (/\bone type of\b/i.test(remainder) || /\b(?:one|two) of your choice\b/i.test(remainder)) {
    const countMatch = /\b(one|two|three|four|\d+)\b/i.exec(remainder);
    choice = {
      count: countMatch?.[1] ? wordOrNumber(countMatch[1], "background tool choice") : 1,
      description: text,
      options: [],
    };
    remainder = remainder.replace(/\b(?:one type of|one|two|three|four|\d+)\b[^,]*/i, " ");
  }
  const fixed = splitEnglishList(remainder
    .replace(/^(?:and|plus)\s+/i, "")
    .replace(/\s*,\s*$/, ""))
    .map((value) => value.replace(/^a\s+set\s+of\s+/i, "").trim())
    .map((value) => value.replace(/^[\s.,;:]+|[\s.,;:]+$/g, "").trim())
    .filter((value) => value && !/^(?:your choice|of your choice)$/i.test(value));
  return { fixed: [...new Set(fixed)], choice };
}

function inferBackgroundItemSourceKeys(description: string, items: NormalizedItem[]): string[] {
  if (!description) return [];
  const guaranteedDescription = normalizeTypography(description)
    .replace(/(?:^|,\s*)(?:a|an|one)\s+[^,.;]+,\s*[^,.;]+,\s*or\s+[^,.;]+/gi, " ")
    .replace(/(?:^|,\s*)(?:a|an|one)\s+[^,.;]+\s+(?:or|either)\s+[^,.;]+/gi, " ");
  const haystack = normalizeItemSearchText(guaranteedDescription);
  return items
    .filter((item) => {
      const itemWords = normalizeItemSearchText(item.name).split(" ").filter((word) => word.length > 2);
      return itemWords.length > 0 && itemWords.every((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(haystack));
    })
    .sort((left, right) => normalizeItemSearchText(right.name).length - normalizeItemSearchText(left.name).length)
    .map((item) => item.sourceKey)
    .filter((sourceKey, index, all) => all.indexOf(sourceKey) === index);
}

function normalizeItemSearchText(value: string): string {
  return normalizeTypography(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type CharacterAbility = "str" | "dex" | "con" | "int" | "wis" | "cha";

const EMPTY_ABILITY_BONUSES: Record<CharacterAbility, number> = {
  str: 0,
  dex: 0,
  con: 0,
  int: 0,
  wis: 0,
  cha: 0,
};

function parseSpeciesTraits(
  source: NormalizedSpecies,
  languageByName: Map<string, NormalizedLanguage>
): {
  abilityBonuses: Record<CharacterAbility, number>;
  abilityChoice: CompiledSpeciesProfile["abilityChoice"];
  size: CompiledSpeciesProfile["size"] | null;
  speedFeet: number | null;
  languages: CompiledSpeciesProfile["languages"];
  languageChoiceCount: number;
  featureNames: string[];
} {
  const abilityTrait = requireTrait(source, "Ability Score Increase");
  const ability = parseSpeciesAbilityIncrease(abilityTrait.description, source.sourceKey);
  const sizeTrait = source.traits.find((trait) => trait.name === "Size");
  const speedTrait = source.traits.find((trait) => trait.name === "Speed");
  const languageTraits = source.traits.filter((trait) => trait.name === "Languages" || trait.name === "Extra Language");
  const sizeMatch = sizeTrait
    ? /\byour size is (Tiny|Small|Medium|Large|Huge|Gargantuan)\./i.exec(sizeTrait.description)
    : null;
  if (sizeTrait && !sizeMatch?.[1]) throw new Error(`Species ${source.sourceKey} has an unsupported size trait.`);
  const speedMatch = speedTrait ? /\bbase walking speed is (\d+) feet\b/i.exec(speedTrait.description) : null;
  if (speedTrait && !speedMatch?.[1]) throw new Error(`Species ${source.sourceKey} has an unsupported speed trait.`);
  const parsedLanguages = languageTraits.map((trait) => parseSpeciesLanguages(trait.description, languageByName, source.sourceKey));
  return {
    abilityBonuses: ability.bonuses,
    abilityChoice: ability.choice,
    size: (sizeMatch?.[1] as CompiledSpeciesProfile["size"] | undefined) ?? null,
    speedFeet: speedMatch?.[1] ? Number(speedMatch[1]) : null,
    languages: uniqueReferences(parsedLanguages.flatMap((entry) => entry.languages)),
    languageChoiceCount: parsedLanguages.reduce((sum, entry) => sum + entry.choiceCount, 0),
    featureNames: source.traits
      .map((trait) => trait.name)
      .filter((name) => !["Ability Score Increase", "Age", "Alignment", "Size", "Speed", "Languages", "Extra Language"].includes(name)),
  };
}

function parseSpeciesAbilityIncrease(
  description: string,
  sourceKey: string
): { bonuses: Record<CharacterAbility, number>; choice: CompiledSpeciesProfile["abilityChoice"] } {
  const bonuses = { ...EMPTY_ABILITY_BONUSES };
  if (description === "Your ability scores each increase by 1.") {
    for (const ability of Object.keys(bonuses) as CharacterAbility[]) bonuses[ability] = 1;
    return { bonuses, choice: null };
  }
  const choiceMatch = /^Your (\w+) score increases by (\d+), and (\w+) other ability scores? of your choice increase by (\d+)\.$/.exec(description);
  if (choiceMatch?.[1] && choiceMatch[2] && choiceMatch[3] && choiceMatch[4]) {
    const fixed = abilityKeyFromName(choiceMatch[1], sourceKey);
    bonuses[fixed] = Number(choiceMatch[2]);
    return {
      bonuses,
      choice: {
        count: wordOrNumber(choiceMatch[3], `species ability choice for ${sourceKey}`),
        bonus: Number(choiceMatch[4]),
        excluded: [fixed],
      },
    };
  }
  const matches = [...description.matchAll(/(?:Your|your) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d+)/g)];
  if (!matches.length) throw new Error(`Species ${sourceKey} has an unsupported ability increase trait.`);
  for (const match of matches) {
    const name = match[1];
    const amount = match[2];
    if (!name || !amount) continue;
    const ability = abilityKeyFromName(name, sourceKey);
    if (bonuses[ability] !== 0) throw new Error(`Species ${sourceKey} repeats ${ability} ability increase.`);
    bonuses[ability] = Number(amount);
  }
  return { bonuses, choice: null };
}

function parseSpeciesLanguages(
  description: string,
  languageByName: Map<string, NormalizedLanguage>,
  sourceKey: string
): { languages: CompiledSpeciesProfile["languages"]; choiceCount: number } {
  const sentence = description.split(".")[0]?.trim() ?? "";
  if (!sentence) throw new Error(`Species ${sourceKey} has an empty language trait.`);
  const choiceMatches = [...sentence.matchAll(/(?:one|two|three|four|\d+) (?:extra )?languages? of your choice/gi)];
  const choiceCount = choiceMatches.reduce((sum, match) => sum + wordOrNumber(match[0]?.split(" ")[0] ?? "", sourceKey), 0);
  const prefix = sentence
    .replace(/^You can speak, read, and write\s+/i, "")
    .replace(/(?:,?\s*and\s*)?(?:one|two|three|four|\d+) (?:extra )?languages? of your choice/gi, "")
    .replace(/^one extra language of your choice$/i, "")
    .trim();
  const names = prefix ? splitEnglishList(prefix) : [];
  const languages = names.map((name) => requireNamedRecord(languageByName, name, `language for species ${sourceKey}`));
  return { languages: languages.map(contentReference), choiceCount };
}

function parseClassProficiencies(
  description: string,
  skillByName: Map<string, NormalizedSkill>,
  sourceKey: string
): Pick<CompiledClassProfile, "proficiencies" | "toolChoice" | "skillChoice" | "savingThrows"> {
  const fields = new Map<string, string>();
  for (const line of description.split(/\r?\n/)) {
    const match = /^\*\*(Armor|Weapons|Tools|Saving Throws|Skills):\*\*\s*(.+)$/.exec(line.trim());
    if (match?.[1] && match[2]) fields.set(match[1], match[2].trim());
  }
  for (const field of ["Armor", "Weapons", "Tools", "Saving Throws", "Skills"]) {
    if (!fields.has(field)) throw new Error(`Class ${sourceKey} is missing ${field} proficiency source text.`);
  }
  const armor = parseProficiencyList(fields.get("Armor") ?? "");
  const weapons = parseProficiencyList(fields.get("Weapons") ?? "");
  const toolsSource = fields.get("Tools") ?? "";
  const toolChoiceMatch = /^(?:Choose\s+)?(one|two|three|four|\d+)\b/i.exec(toolsSource);
  const toolChoice = toolChoiceMatch?.[1]
    ? { count: wordOrNumber(toolChoiceMatch[1], sourceKey), description: normalizeTypography(toolsSource) }
    : null;
  const tools = toolChoice ? [] : parseProficiencyList(toolsSource);
  const savingThrows = splitEnglishList(fields.get("Saving Throws") ?? "")
    .map((name) => abilityKeyFromName(name, sourceKey));
  if (savingThrows.length !== 2 || new Set(savingThrows).size !== 2) {
    throw new Error(`Class ${sourceKey} must compile exactly two distinct saving throws.`);
  }
  const skillsSource = fields.get("Skills") ?? "";
  const anyMatch = /^Choose any (one|two|three|four|\d+)$/i.exec(skillsSource);
  const fromMatch = /^Choose (one|two|three|four|\d+)(?: skills?)? from (.+)$/i.exec(skillsSource);
  if (!anyMatch && !fromMatch) throw new Error(`Class ${sourceKey} has an unsupported skill-choice line.`);
  const count = wordOrNumber((anyMatch?.[1] ?? fromMatch?.[1]) as string, sourceKey);
  const options = anyMatch
    ? [...skillByName.values()]
    : splitEnglishList(fromMatch?.[2] ?? "").map((name) => requireNamedRecord(skillByName, name, `class skill for ${sourceKey}`));
  return {
    proficiencies: { armor, weapons, tools },
    toolChoice,
    savingThrows,
    skillChoice: {
      count,
      options: options.map(contentReference).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
    },
  };
}

function parseProficiencyList(value: string): string[] {
  const withoutParenthetical = value.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (/^none$/i.test(withoutParenthetical)) return [];
  return splitEnglishList(withoutParenthetical).map((entry) => normalizeTypography(entry).toLocaleLowerCase("en-US"));
}

function splitEnglishList(value: string): string[] {
  return value
    .replace(/,\s+and\s+/g, ", ")
    .replace(/\s+and\s+/g, ", ")
    .split(",")
    .map((entry) => normalizeTypography(entry.trim()))
    .filter(Boolean);
}

function splitEnglishChoiceList(value: string): string[] {
  return splitEnglishList(value.replace(/\s+or\s+/gi, ", "));
}

function normalizeTypography(value: string): string {
  value = value
    .replace(/\u00e2\u20ac\u02dc/g, "'")
    .replace(/\u00e2\u20ac\u2122/g, "'")
    .replace(/\u00e2\u20ac\u0153/g, '"')
    .replace(/\u00e2\u20ac\u009d/g, '"')
    .replace(/\u00e2\u20ac\u0094/g, "—")
    .replace(/\u00e2\u20ac\u0093/g, "–");
  return value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function normalizeAbilitySummaries(
  summaries: z.infer<typeof rawAbilitySummarySchema>[],
  abilityByName: Map<string, NormalizedAbility>,
  sourceKey: string
): Array<{ sourceKey: string; contentKey: string; name: string }> {
  return summaries.map((summary) => contentReference(
    requireNamedRecord(abilityByName, summary.name, `ability for ${sourceKey}`)
  )).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function parseClassHitDie(value: string | null, sourceKey: string): number | null {
  if (value === null || !value.trim()) return null;
  const match = /^D(\d+)$/i.exec(value.trim());
  if (!match?.[1]) throw new Error(`Class ${sourceKey} has an unsupported hit die: ${value}.`);
  return Number(match[1]);
}

function normalizeCasterType(value: string | null, sourceKey: string): "FULL" | "HALF" | "NONE" | null {
  const normalized = value?.trim().toLocaleUpperCase("en-US") ?? "";
  if (!normalized) return null;
  if (normalized === "FULL" || normalized === "HALF" || normalized === "NONE") return normalized;
  throw new Error(`Class ${sourceKey} has an unsupported caster type: ${value}.`);
}

function abilityKeyFromName(value: string, sourceKey: string): CharacterAbility {
  const key = ({
    strength: "str",
    dexterity: "dex",
    constitution: "con",
    intelligence: "int",
    wisdom: "wis",
    charisma: "cha",
  } as const)[value.toLocaleLowerCase("en-US") as keyof typeof abilityNameKeys];
  if (!key) throw new Error(`Unknown ability ${value} in ${sourceKey}.`);
  return key;
}

const abilityNameKeys = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
} as const;

function wordOrNumber(value: string, label: string): number {
  const normalized = value.toLocaleLowerCase("en-US");
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  const parsed = words[normalized] ?? Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Unsupported count ${value} in ${label}.`);
  return parsed;
}

function requireTrait(source: NormalizedSpecies, name: string): NormalizedSpecies["traits"][number] {
  const matches = source.traits.filter((trait) => trait.name === name);
  if (matches.length !== 1) throw new Error(`Species ${source.sourceKey} requires exactly one ${name} trait.`);
  return matches[0] as NormalizedSpecies["traits"][number];
}

function requireSingleFeature(
  source: NormalizedCharacterClass,
  featureType: NormalizedCharacterClass["features"][number]["featureType"]
): NormalizedCharacterClass["features"][number] {
  const matches = source.features.filter((feature) => feature.featureType === featureType);
  if (matches.length !== 1) throw new Error(`Class ${source.sourceKey} requires exactly one ${featureType} feature.`);
  return matches[0] as NormalizedCharacterClass["features"][number];
}

function requireNamedRecord<T extends { name: string }>(index: Map<string, T>, name: string, label: string): T {
  const record = index.get(name.toLocaleLowerCase("en-US"));
  if (!record) throw new Error(`Missing ${label}: ${name}.`);
  return record;
}

function compiledProvenance(
  kind: "species-profile" | "class-profile" | "background-profile",
  source: NormalizedSpecies | NormalizedCharacterClass | NormalizedBackground
): Pick<CompiledContentRecord, "key" | "contentKey" | "sourceKey" | "documentKey" | "gamesystem" | "publisher" | "licenseKeys" | "permalink" | "sourceApiVersion" | "sourceFetchedAt"> {
  return {
    key: `${source.key}_profile`,
    contentKey: `open5e:${kind}:${source.gamesystem}:${source.documentKey}:${source.sourceKey}`,
    sourceKey: `${source.sourceKey}/profile`,
    documentKey: source.documentKey,
    gamesystem: source.gamesystem,
    publisher: source.publisher,
    licenseKeys: source.licenseKeys,
    permalink: source.permalink,
    sourceApiVersion: source.sourceApiVersion,
    sourceFetchedAt: source.sourceFetchedAt,
  };
}

function addAbilityBonuses(
  left: Record<CharacterAbility, number> | undefined,
  right: Record<CharacterAbility, number>
): Record<CharacterAbility, number> {
  return Object.fromEntries(
    (Object.keys(EMPTY_ABILITY_BONUSES) as CharacterAbility[]).map((ability) => [
      ability,
      (left?.[ability] ?? 0) + right[ability],
    ])
  ) as Record<CharacterAbility, number>;
}

function mergeAbilityChoices(
  left: CompiledSpeciesProfile["abilityChoice"],
  right: CompiledSpeciesProfile["abilityChoice"],
  sourceKey: string
): CompiledSpeciesProfile["abilityChoice"] {
  if (left && right) throw new Error(`Species ${sourceKey} has multiple independent ability-choice programs.`);
  return left ?? right;
}

function uniqueReferences<T extends { contentKey: string; sourceKey: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.contentKey, record])).values()]
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function fail(message: string): never {
  throw new Error(message);
}

function compileSpellEffects(records: NormalizedContentRecord[]): CompiledSpellEffect[] {
  const programs: CompiledSpellEffect[] = [];
  for (const spell of records) {
    if (spell.kind !== "spell" || !spell.damageRoll || spell.damageTypes.length !== 1) continue;
    if (!REVIEWED_IMMEDIATE_PRIMARY_DAMAGE_SPELLS.has(spell.sourceKey)) continue;
    const baseDamage = parseDamageExpression(spell.damageRoll);
    if (!baseDamage) continue;
    const damageType = spell.damageTypes[0];
    if (!damageType) continue;
    const resolution = classifySpellDamageResolution(spell, spell.damageRoll, damageType.name);
    if (!resolution) continue;
    const slotLevelVariants: Record<string, CompiledSpellEffect["baseDamage"]> = {};
    const playerLevelVariants: Record<string, CompiledSpellEffect["baseDamage"]> = {};
    for (const option of spell.castingOptions) {
      if (!option.damageRoll || option.description) continue;
      const damage = parseDamageExpression(option.damageRoll);
      if (!damage) continue;
      const slotMatch = /^slot_level_([1-9])$/.exec(option.type);
      if (slotMatch?.[1]) slotLevelVariants[slotMatch[1]] = damage;
      const playerMatch = /^player_level_((?:[1-9]|1\d|20))$/.exec(option.type);
      if (playerMatch?.[1]) playerLevelVariants[playerMatch[1]] = damage;
    }
    programs.push({
      kind: "spell-effect",
      fidelityTier: 2,
      key: `${spell.key}_primary-damage`,
      contentKey: `open5e:spell-effect:${spell.gamesystem}:${spell.documentKey}:${spell.sourceKey}/primary-damage`,
      sourceKey: `${spell.sourceKey}/primary-damage`,
      documentKey: spell.documentKey,
      gamesystem: spell.gamesystem,
      publisher: spell.publisher,
      licenseKeys: spell.licenseKeys,
      permalink: spell.permalink,
      sourceApiVersion: spell.sourceApiVersion,
      sourceFetchedAt: spell.sourceFetchedAt,
      sourceContentKey: spell.contentKey,
      resolution: resolution.kind,
      saveOnSuccess: resolution.saveOnSuccess,
      damageType,
      baseDamage,
      slotLevelVariants,
      playerLevelVariants,
      sourceDescriptionSha256: sha256(spell.description),
      resolutionScope: "primary-damage",
      hasDeferredProseEffects: true,
    });
  }
  return programs.sort(compareByKey);
}

function classifySpellDamageResolution(
  spell: NormalizedSpell,
  damageRoll: string,
  damageTypeName: string
): { kind: CompiledSpellEffect["resolution"]; saveOnSuccess: CompiledSpellEffect["saveOnSuccess"] } | null {
  const normalized = spell.description.replace(/\s+/g, " ");
  const roll = escapeRegExp(damageRoll).replaceAll("\\+", "\\s*\\+\\s*");
  const damageType = escapeRegExp(damageTypeName);
  const damage = `${roll}\\s+${damageType}\\s+damage`;
  if (spell.attackRoll) {
    if (/\bOn a miss\b/i.test(normalized)) return null;
    return new RegExp(`\\bOn a hit,[^.]{0,180}\\b${damage}`, "i").test(normalized)
      ? { kind: "spell-attack", saveOnSuccess: null }
      : null;
  }
  if (spell.savingThrowAbility) {
    const half = new RegExp(
      `(?:takes|take)\\s+${damage}\\s+on a failed save,?\\s+or half as much damage on a successful one`,
      "i"
    );
    const halfAfterFailure = new RegExp(
      `on a failed save,[^.]{0,180}(?:takes|take)\\s+${damage}[^.]{0,120}half as much damage on a successful`,
      "i"
    );
    if (
      half.test(normalized)
      || halfAfterFailure.test(normalized)
      || (
        new RegExp(`on a failed save,[^.]{0,180}(?:takes|take)\\s+${damage}`, "i").test(normalized)
        && /half as much damage on a successful|successful save[^.]{0,120}half as much damage/i.test(normalized)
      )
    ) {
      return { kind: "saving-throw", saveOnSuccess: "half" };
    }
    const failureOnly = new RegExp(
      `on a failed save,[^.]{0,180}(?:takes|take)\\s+${damage}`,
      "i"
    );
    if (
      failureOnly.test(normalized)
      && !/half as much damage on a successful|successful save[^.]{0,120}half as much damage/i.test(normalized)
    ) {
      return { kind: "saving-throw", saveOnSuccess: "none" };
    }
    return null;
  }
  if (spell.sourceKey === "srd_magic-missile") {
    return new RegExp(`(?:takes|deals?)\\s+${damage}|${damage}\\s+to (?:its|the) target`, "i").test(normalized)
      ? { kind: "automatic", saveOnSuccess: null }
      : null;
  }
  return null;
}

function parseDamageExpression(value: string): CompiledSpellEffect["baseDamage"] | null {
  const compact = value.replace(/\s+/g, "");
  const dice = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(compact);
  if (dice) {
    const diceCount = Number(dice[1]);
    const dieSides = Number(dice[2]);
    const magnitude = Number(dice[4] ?? 0);
    const bonus = dice[3] === "-" ? -magnitude : magnitude;
    if (diceCount > 0 && dieSides > 1) return { kind: "dice", diceCount, dieSides, bonus };
  }
  if (/^\d+$/.test(compact)) return { kind: "flat", amount: Number(compact) };
  return null;
}

function normalizeSpellAbility(value: string): NormalizedSpell["savingThrowAbility"] {
  if (!value.trim()) return null;
  return requireSpellAbility(value, "spell saving throw");
}

function requireSpellAbility(value: string | null, label: string): NormalizedSpell["savingThrowAbility"] & string {
  const normalized = value?.trim().toLocaleLowerCase("en-US") ?? "";
  const abilities = {
    strength: "str",
    dexterity: "dex",
    constitution: "con",
    intelligence: "int",
    wisdom: "wis",
    charisma: "cha",
  } as const;
  const ability = abilities[normalized as keyof typeof abilities];
  if (!ability) throw new Error(`Unknown ${label} ability: ${value ?? "null"}.`);
  return ability;
}

function buildV1Provenance(
  kind: NormalizedContentRecord["kind"],
  sourceKey: string,
  document: RawDocument,
  sourceFetchedAt: string
): ReturnType<typeof buildProvenance> {
  return {
    ...buildProvenance(kind, sourceKey, document, sourceFetchedAt),
    sourceApiVersion: "v1",
  };
}

function assertV1Document(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} belongs to legacy document ${actual}, not ${expected}.`);
  }
}

function normalizeCrossReferences(values: unknown[]): string[] {
  const keys = values.map((value) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && "key" in value) {
      const key = (value as { key?: unknown }).key;
      if (typeof key === "string" && key.trim()) return key.trim();
    }
    throw new Error("Open5e returned an unsupported rules cross-reference shape.");
  });
  return [...new Set(keys)].sort();
}

function v1DocumentSummary(record: {
  document__slug: string;
  document__title: string;
  document__license_url: string;
  document__url: string;
}): NormalizedSpellList["sourceDocument"] {
  return {
    slug: record.document__slug,
    title: record.document__title,
    licenseUrl: record.document__license_url,
    url: record.document__url,
  };
}

function parseMarkdownTable(
  source: string,
  label: string
): { headers: string[]; rows: Array<Record<string, string>> } {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("|"));
  if (lines.length < 3) throw new Error(`Missing markdown table for ${label}.`);
  const cells = (line: string): string[] => line.slice(1, line.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());
  const headers = cells(lines[0] as string);
  const rows = lines.slice(2).map((line) => {
    const values = cells(line);
    if (values.length !== headers.length) {
      throw new Error(`Malformed markdown row for ${label}: expected ${headers.length} cells, received ${values.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, rows };
}

function parseTableCount(value: string | undefined, label: string): number {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized === "-") return 0;
  if (!/^\d+$/.test(normalized)) throw new Error(`Invalid ${label}: ${value ?? "missing"}.`);
  return Number(normalized);
}

function parseOrdinal(value: string, label: string): number {
  const match = /^(\d+)(?:st|nd|rd|th)$/.exec(value.trim());
  if (!match?.[1]) throw new Error(`Invalid ${label}: ${value}.`);
  return Number(match[1]);
}

function ordinal(value: number): string {
  const remainder100 = value % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
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

function emptySpellSlots(): NormalizedSpellProgression["levels"][number]["slots"] {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0 };
}

function spellSelectionMode(slug: string): NormalizedSpellProgression["selectionMode"] {
  if (slug === "wizard") return "spellbook";
  if (slug === "cleric" || slug === "druid" || slug === "paladin") return "prepared";
  return "known";
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-US"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verifyCreatureReferences(records: CollectionRecords<NormalizedContentRecord>): void {
  const installedKeys = new Set(
    Object.values(records).flatMap((collection) => collection ?? []).map((record) => record.contentKey)
  );
  for (const record of requireCollection(records, "creatures")) {
    if (record.kind !== "creature") throw new Error(`The creatures collection contains ${record.kind}.`);
    const references = [
      record.creatureType,
      record.size,
      ...record.creatureSets,
      ...record.environments,
      ...record.defenses.damageImmunities,
      ...record.defenses.damageResistances,
      ...record.defenses.damageVulnerabilities,
      ...record.defenses.conditionImmunities,
    ];
    for (const reference of references) {
      if (!installedKeys.has(reference.contentKey)) {
        throw new Error(`${record.contentKey} references missing content ${reference.contentKey}.`);
      }
    }
  }
  for (const record of requireCollection(records, "creaturesets")) {
    if (record.kind !== "creature-set") throw new Error(`The creaturesets collection contains ${record.kind}.`);
    for (const creature of record.creatures) {
      if (!installedKeys.has(creature.contentKey)) {
        throw new Error(`${record.contentKey} references missing creature ${creature.contentKey}.`);
      }
    }
  }
}

const EXACT_SIMPLE_CREATURE_ATTACK = /^(Melee|Ranged|Melee or Ranged) (Weapon|Spell) Attack:\s*([+-]?\d+) to hit,\s*((?:reach \d+ ft\.|range \d+(?:\/\d+)? ft\.|reach \d+ ft\. or range \d+\/\d+ ft\.)),\s*(one (?:target|creature|object)|up to [A-Za-z-]+ targets)\.\s*Hit:\s*(\d+)\s*\((\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\)\s+([A-Za-z]+) damage\.\s*$/i;

function compileCreatureAttacks(
  records: NormalizedContentRecord[],
  damageTypes: NormalizedContentRecord[]
): CompiledCreatureAttack[] {
  const damageTypeByKey = indexNormalizedKind(damageTypes, "damage-type");
  const programs: CompiledCreatureAttack[] = [];
  for (const candidate of records) {
    if (candidate.kind !== "creature") throw new Error(`The creatures collection contains ${candidate.kind}.`);
    for (const action of candidate.actions) {
      if (action.actionType !== "ACTION") continue;
      const match = EXACT_SIMPLE_CREATURE_ATTACK.exec(action.description);
      if (!match) continue;
      const attackMode = match[1] === "Melee"
        ? "melee"
        : match[1] === "Ranged"
          ? "ranged"
          : "melee-or-ranged";
      const attackKind = match[2]?.toLowerCase() === "spell" ? "spell" : "weapon";
      const toHit = Number(match[3]);
      const distance = parseCreatureAttackDistance(match[4] as string);
      const target = match[5] as string;
      const average = Number(match[6]);
      const diceCount = Number(match[7]);
      const dieSides = Number(match[8]);
      const bonus = match[9]
        ? (match[9] === "-" ? -1 : 1) * Number(match[10])
        : 0;
      const expectedAverage = Math.floor(diceCount * (dieSides + 1) / 2) + bonus;
      if (average !== expectedAverage) {
        throw new Error(`Creature attack average diverges from its dice for ${candidate.contentKey}/${action.actionKey}.`);
      }
      const damageTypeKey = (match[11] as string).toLowerCase();
      const damageType = requireIndexedRecord(
        damageTypeByKey,
        damageTypeKey,
        `compiled damage type for ${candidate.contentKey}/${action.actionKey}`
      );
      const compatibleMetadata = action.sourceAttackMetadata.some((metadata) =>
        metadata.toHit === toHit
        && metadata.attackType.toLowerCase() === attackKind
        && (metadata.damage.dieCount === null || metadata.damage.dieCount === diceCount)
        && (metadata.damage.dieSides === null || metadata.damage.dieSides === dieSides)
      );
      if (!compatibleMetadata) {
        throw new Error(`Creature attack metadata no longer corroborates ${candidate.contentKey}/${action.actionKey}.`);
      }
      const sourceKey = `${candidate.sourceKey}/${action.actionKey}`;
      programs.push({
        kind: "creature-attack",
        fidelityTier: 2,
        key: `${candidate.key}_${action.actionKey}`,
        contentKey: `open5e:creature-attack:${candidate.gamesystem}:${candidate.documentKey}:${sourceKey}`,
        sourceKey,
        documentKey: candidate.documentKey,
        gamesystem: candidate.gamesystem,
        publisher: candidate.publisher,
        licenseKeys: candidate.licenseKeys,
        permalink: candidate.permalink,
        sourceApiVersion: candidate.sourceApiVersion,
        sourceFetchedAt: candidate.sourceFetchedAt,
        sourceContentKey: candidate.contentKey,
        actionKey: action.actionKey,
        name: action.name,
        attackMode,
        attackKind,
        toHit,
        distance,
        target,
        damage: {
          average,
          diceCount,
          dieSides,
          bonus,
          typeKey: damageType.sourceKey,
          typeName: damageType.name,
          typeContentKey: damageType.contentKey,
        },
        sourceDescriptionSha256: sha256(action.description),
        resolutionScope: "single-target-base-damage",
      });
    }
  }
  return programs.sort(compareByKey);
}

function parseCreatureAttackDistance(value: string): CompiledCreatureAttack["distance"] {
  const both = /^reach (\d+) ft\. or range (\d+)\/(\d+) ft\.$/.exec(value);
  if (both) {
    return { reach: Number(both[1]), range: Number(both[2]), longRange: Number(both[3]), unit: "feet" };
  }
  const reach = /^reach (\d+) ft\.$/.exec(value);
  if (reach) return { reach: Number(reach[1]), range: null, longRange: null, unit: "feet" };
  const range = /^range (\d+)(?:\/(\d+))? ft\.$/.exec(value);
  if (range) {
    return { reach: null, range: Number(range[1]), longRange: range[2] ? Number(range[2]) : null, unit: "feet" };
  }
  throw new Error(`Unsupported exact creature attack distance: ${value}.`);
}

function indexNormalizedKind<K extends NormalizedContentRecord["kind"]>(
  records: NormalizedContentRecord[],
  kind: K
): Map<string, Extract<NormalizedContentRecord, { kind: K }>> {
  const index = new Map<string, Extract<NormalizedContentRecord, { kind: K }>>();
  for (const record of records) {
    if (record.kind !== kind) throw new Error(`Expected normalized ${kind}; received ${record.kind}.`);
    if (index.has(record.sourceKey)) throw new Error(`Duplicate normalized ${kind} source key: ${record.sourceKey}.`);
    index.set(record.sourceKey, record as Extract<NormalizedContentRecord, { kind: K }>);
  }
  return index;
}

function requireIndexedRecord<T>(index: Map<string, T>, key: string, label: string): T {
  const record = index.get(key);
  if (!record) throw new Error(`Missing ${label}: ${key}.`);
  return record;
}

function contentReference(record: { sourceKey: string; contentKey: string; name: string }): {
  sourceKey: string;
  contentKey: string;
  name: string;
} {
  return { sourceKey: record.sourceKey, contentKey: record.contentKey, name: record.name };
}

function normalizeSummaryReferences<T extends { key: string; name: string }>(
  summaries: T[],
  index: Map<string, { sourceKey: string; contentKey: string; name: string }>,
  ownerKey: string
): Array<{ sourceKey: string; contentKey: string; name: string }> {
  return summaries.map((summary) => {
    const record = requireIndexedRecord(index, summary.key, `reference for ${ownerKey}`);
    if (record.name !== summary.name) throw new Error(`${ownerKey} has divergent reference ${summary.key}.`);
    return contentReference(record);
  }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function normalizeAbilityValues(value: z.infer<typeof rawAbilityValuesSchema>): NormalizedCreature["abilities"] {
  return {
    str: value.strength,
    dex: value.dexterity,
    con: value.constitution,
    int: value.intelligence,
    wis: value.wisdom,
    cha: value.charisma,
  };
}

const FULL_ABILITY_TO_SHORT = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
} as const;

function normalizePartialAbilityValues(
  value: Record<string, number>,
  label: string
): NormalizedCreature["savingThrows"] {
  const result: NormalizedCreature["savingThrows"] = {};
  for (const [key, bonus] of Object.entries(value)) {
    const short = FULL_ABILITY_TO_SHORT[key as keyof typeof FULL_ABILITY_TO_SHORT];
    if (!short) throw new Error(`Unknown ability in ${label}: ${key}.`);
    result[short] = bonus;
  }
  return result;
}

function normalizeRequiredAbilityValues(
  value: Record<string, number>,
  label: string
): NormalizedCreature["savingThrowsAll"] {
  const partial = normalizePartialAbilityValues(value, label);
  for (const key of Object.values(FULL_ABILITY_TO_SHORT)) {
    if (partial[key] === undefined) throw new Error(`Missing ${key} in ${label}.`);
  }
  return partial as NormalizedCreature["savingThrowsAll"];
}

function normalizeSkillBonuses(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, bonus]): [string, number] => [
        key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
        bonus,
      ])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizeActionType(
  value: string | null,
  creatureKey: string,
  actionName: string
): NormalizedCreature["actions"][number]["actionType"] {
  if (value === null) return null;
  const allowed = new Set(["ACTION", "BONUS_ACTION", "REACTION", "LEGENDARY_ACTION", "LAIR_ACTION", "MYTHIC_ACTION"]);
  if (!allowed.has(value)) throw new Error(`Unknown action type ${value} on ${creatureKey}/${actionName}.`);
  return value as NormalizedCreature["actions"][number]["actionType"];
}

function parseSourceDieSides(value: string | null): number | null {
  if (value === null) return null;
  const match = /^D(\d+)$/.exec(value);
  if (!match) throw new Error(`Invalid Open5e creature die type: ${value}.`);
  return Number(match[1]);
}

function slugify(value: string): string {
  const slug = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new Error(`Cannot create a stable content slug from ${value}.`);
  return slug;
}

function verifyItemReferences(records: CollectionRecords<NormalizedContentRecord>): void {
  const installedKeys = new Set(
    Object.values(records).flatMap((collection) => collection ?? []).map((record) => record.contentKey)
  );
  for (const collection of ["items", "magicitems"] as const) {
    for (const record of requireCollection(records, collection)) {
      if (record.kind !== "item" && record.kind !== "magic-item") {
        throw new Error(`The ${collection} collection contains ${record.kind}.`);
      }
      for (const reference of [record.weaponContentKey, record.armorContentKey]) {
        if (reference && !installedKeys.has(reference)) {
          throw new Error(`${record.contentKey} references missing content ${reference}.`);
        }
      }
      if (record.kind === "magic-item" && !installedKeys.has(record.rarity.contentKey)) {
        throw new Error(`${record.contentKey} references missing rarity ${record.rarity.contentKey}.`);
      }
    }
  }
  for (const record of requireCollection(records, "weapons")) {
    if (record.kind !== "weapon") throw new Error(`The weapons collection contains ${record.kind}.`);
    if (!installedKeys.has(record.damageTypeContentKey)) {
      throw new Error(`${record.contentKey} references missing damage type ${record.damageTypeContentKey}.`);
    }
    for (const property of record.properties) {
      if (!installedKeys.has(property.contentKey)) {
        throw new Error(`${record.contentKey} references missing weapon property ${property.contentKey}.`);
      }
    }
  }
}

function compileEquipmentEffects(records: NormalizedContentRecord[]): CompiledEquipmentEffect[] {
  const shield = records.find(
    (record): record is NormalizedItem => record.kind === "item" && record.sourceKey === SHIELD_ITEM_KEY
  );
  if (!shield) throw new Error(`The normalized shield item is missing: ${SHIELD_ITEM_KEY}.`);
  const expectedDescription = "A shield is made from wood or metal and is carried in one hand. Wielding a shield increases your Armor Class by 2. You can benefit from only one shield at a time.";
  if (
    shield.categoryKey !== "shield"
    || shield.description !== expectedDescription
    || shield.weaponContentKey !== null
    || shield.armorContentKey !== null
  ) {
    throw new Error("The SRD shield source no longer matches the reviewed armor-class effect.");
  }
  return [{
    kind: "equipment-effect",
    fidelityTier: 2,
    key: shield.key,
    contentKey: shield.contentKey,
    sourceKey: shield.sourceKey,
    documentKey: shield.documentKey,
    gamesystem: shield.gamesystem,
    publisher: shield.publisher,
    licenseKeys: shield.licenseKeys,
    permalink: shield.permalink,
    sourceApiVersion: shield.sourceApiVersion,
    sourceFetchedAt: shield.sourceFetchedAt,
    sourceContentKey: shield.contentKey,
    effects: [{ kind: "armor-class-bonus", value: 2, stackingKey: "shield" }],
  }];
}

function compileCurrencyRules(records: NormalizedContentRecord[]): CompiledCurrencyTable[] {
  const source = records.find(
    (record): record is NormalizedRule => record.kind === "rule" && record.sourceKey === CURRENCY_RULE_KEY
  );
  if (!source) {
    throw new Error(`The normalized currency source rule is missing: ${CURRENCY_RULE_KEY}.`);
  }
  const denominations = parseCurrencyDenominations(source.description);
  return [{
    kind: "currency-table",
    fidelityTier: 2,
    key: source.key,
    contentKey: source.contentKey,
    sourceKey: source.sourceKey,
    documentKey: source.documentKey,
    gamesystem: source.gamesystem,
    publisher: source.publisher,
    licenseKeys: source.licenseKeys,
    permalink: source.permalink,
    sourceApiVersion: source.sourceApiVersion,
    sourceFetchedAt: source.sourceFetchedAt,
    sourceContentKey: source.contentKey,
    denominations,
  }];
}

function parseCurrencyDenominations(description: string): CompiledCurrencyTable["denominations"] {
  const denominationNames = {
    cp: "Copper",
    sp: "Silver",
    ep: "Electrum",
    gp: "Gold",
    pp: "Platinum",
  } as const;
  const expectedValues = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1_000 } as const;
  const parsed = new Map<keyof typeof denominationNames, number>();
  for (const line of description.split(/\r?\n/)) {
    const match = /^\|\s*(Copper|Silver|Electrum|Gold|Platinum)\s+\((cp|sp|ep|gp|pp)\)\s*\|\s*([\d,]+)\s*\|/.exec(line);
    if (!match) continue;
    const key = match[2] as keyof typeof denominationNames;
    const name = match[1];
    const copperValue = Number((match[3] ?? "").replaceAll(",", ""));
    if (name !== denominationNames[key] || copperValue !== expectedValues[key]) {
      throw new Error(`Unexpected SRD currency row for ${key}: ${line}`);
    }
    if (parsed.has(key)) {
      throw new Error(`Duplicate SRD currency row for ${key}.`);
    }
    parsed.set(key, copperValue);
  }
  const orderedKeys = ["cp", "sp", "ep", "gp", "pp"] as const;
  if (parsed.size !== orderedKeys.length) {
    throw new Error(`Expected five SRD currency rows; found ${parsed.size}.`);
  }
  return orderedKeys.map((key) => ({
    key,
    name: denominationNames[key],
    copperValue: parsed.get(key) as number,
  }));
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

function buildProvenance(
  kind: NormalizedContentRecord["kind"],
  sourceKey: string,
  document: RawDocument,
  sourceFetchedAt: string
): Pick<
  NormalizedContentRecord,
  | "key"
  | "contentKey"
  | "sourceKey"
  | "documentKey"
  | "gamesystem"
  | "publisher"
  | "licenseKeys"
  | "permalink"
  | "sourceApiVersion"
  | "sourceFetchedAt"
> {
  const key = sourceKey === document.key ? sourceKey : `${document.key}_${sourceKey}`;
  return {
    key,
    contentKey: `open5e:${kind}:${document.gamesystem.key}:${document.key}:${sourceKey}`,
    sourceKey,
    documentKey: document.key,
    gamesystem: document.gamesystem.key,
    publisher: document.publisher,
    licenseKeys: document.licenses.map((license) => license.key).sort(),
    permalink: document.permalink,
    sourceApiVersion: "v2",
    sourceFetchedAt,
  };
}

function contentKeyFor(
  kind: NormalizedContentRecord["kind"],
  sourceKey: string,
  document: RawDocument
): string {
  return `open5e:${kind}:${document.gamesystem.key}:${document.key}:${sourceKey}`;
}

function assertEmbeddedTargetDocument(
  document: z.infer<typeof rawEmbeddedDocumentSchema>,
  context: ImportContext,
  label: string
): void {
  if (
    document.key !== context.targetDocumentKey
    || document.gamesystem.key !== context.targetGamesystem
  ) {
    throw new Error(
      `${label} belongs to ${document.key}/${document.gamesystem.key}, not ${context.targetDocumentKey}/${context.targetGamesystem}.`
    );
  }
  const inventoryDocument = requireDocument(context.documents, document.key);
  if (
    inventoryDocument.publisher.key !== document.publisher.key
    || inventoryDocument.permalink !== document.permalink
  ) {
    throw new Error(`${label} embedded document provenance diverges from the document inventory.`);
  }
}

function parseDecimal(value: string, decimalPlaces: number, label: string): number {
  const pattern = new RegExp(`^\\d+\\.\\d{${decimalPlaces}}$`);
  if (!pattern.test(value)) throw new Error(`Invalid ${label}: ${value}.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${label}: ${value}.`);
  return parsed;
}

function parseGoldCost(value: string, label: string): number {
  parseDecimal(value, 2, `${label} cost`);
  const [whole = "0", fraction = "00"] = value.split(".");
  const copper = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(copper) || copper < 0) {
    throw new Error(`Invalid ${label} cost: ${value}.`);
  }
  return copper;
}

function requireDescriptionVariant(
  collectionLabel: string,
  sourceKey: string,
  descriptions: z.infer<typeof rawDescriptionSchema>[],
  documentKey: string,
  gamesystem: string
): z.infer<typeof rawDescriptionSchema> {
  const matches = descriptions.filter((description) =>
    description.document === documentKey && description.gamesystem === gamesystem
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${documentKey}/${gamesystem} description for ${collectionLabel} ${sourceKey}; found ${matches.length}.`
    );
  }
  return matches[0] as z.infer<typeof rawDescriptionSchema>;
}

function validateAndSortRawRecords<T extends z.ZodTypeAny>(
  records: unknown[],
  schema: T,
  collection: Open5eCollection
): unknown[] {
  const validated = records.map((record) => ({
    original: record,
    parsed: schema.parse(record) as { key: string },
  }));
  const keys = new Set<string>();
  for (const record of validated) {
    const key = record.parsed.key;
    if (keys.has(key)) {
      throw new Error(`Duplicate Open5e ${collection} key: ${key}`);
    }
    keys.add(key);
  }
  return validated
    .sort((left, right) => left.parsed.key.localeCompare(right.parsed.key))
    .map((record) => record.original);
}

function validateAndSortRawRecordsBy<T extends z.ZodTypeAny>(
  records: unknown[],
  schema: T,
  collection: Open5eCollection,
  keyOf: (record: z.infer<T>) => string
): unknown[] {
  const validated = records.map((record) => ({
    original: record,
    parsed: schema.parse(record) as z.infer<T>,
  }));
  const keys = new Set<string>();
  for (const record of validated) {
    const key = keyOf(record.parsed);
    if (!key) throw new Error(`Open5e ${collection} record has an empty source key.`);
    if (keys.has(key)) throw new Error(`Duplicate Open5e ${collection} key: ${key}`);
    keys.add(key);
  }
  return validated
    .sort((left, right) => keyOf(left.parsed).localeCompare(keyOf(right.parsed)))
    .map((record) => record.original);
}

function validateNormalizedRecords(
  records: NormalizedContentRecord[],
  collection: Open5eCollection
): NormalizedContentRecord[] {
  const parsed = records.map((record) => normalizedContentRecordSchema.parse(record));
  const keys = new Set<string>();
  const contentKeys = new Set<string>();
  for (const record of parsed) {
    if (keys.has(record.key)) {
      throw new Error(`Duplicate normalized ${collection} key: ${record.key}`);
    }
    if (contentKeys.has(record.contentKey)) {
      throw new Error(`Duplicate normalized ${collection} contentKey: ${record.contentKey}`);
    }
    keys.add(record.key);
    contentKeys.add(record.contentKey);
  }
  return parsed.sort(compareByKey);
}

function validateCompiledRecords(
  records: CompiledContentRecord[],
  collection: Open5eCollection
): CompiledContentRecord[] {
  const parsed = records.map((record) => compiledContentRecordSchema.parse(record));
  const keys = new Set<string>();
  const contentKeys = new Set<string>();
  for (const record of parsed) {
    if (keys.has(record.key)) {
      throw new Error(`Duplicate compiled ${collection} key: ${record.key}`);
    }
    if (contentKeys.has(record.contentKey)) {
      throw new Error(`Duplicate compiled ${collection} contentKey: ${record.contentKey}`);
    }
    keys.add(record.key);
    contentKeys.add(record.contentKey);
  }
  return parsed.sort(compareByKey);
}

function requireCollection<T>(
  records: CollectionRecords<T>,
  collection: Open5eCollection
): T[] {
  const collectionRecords = records[collection];
  if (!collectionRecords) {
    throw new Error(`Open5e import collection is missing: ${collection}.`);
  }
  return collectionRecords;
}

function assertRequestedDocumentsResolved(keys: string[], documents: RawDocument[]): void {
  const actualKeys = new Set(documents.map((document) => document.key));
  for (const key of keys) {
    if (!actualKeys.has(key)) {
      throw new Error(`Open5e document metadata is missing for ${key}.`);
    }
  }
  for (const document of documents) {
    if (!keys.includes(document.key)) {
      throw new Error(`Open5e document query returned unexpected key ${document.key}.`);
    }
  }
}

function requireDocument(documents: Map<string, RawDocument>, key: string): RawDocument {
  const document = documents.get(key);
  if (!document) {
    throw new Error(`Open5e provenance document is missing: ${key}`);
  }
  return document;
}

function documentRole(key: string, context: ImportContext): NormalizedDocument["packRole"] {
  if (key === context.targetDocumentKey) {
    return "target";
  }
  if (key === context.taxonomyDocumentKey) {
    return "taxonomy";
  }
  return "raw-attribution";
}

function renderS0Coverage(
  packVersion: string,
  sourceFetchedAt: string,
  targetDocumentKey: string,
  rawByCollection: CollectionRecords<unknown>,
  normalizedByCollection: CollectionRecords<NormalizedContentRecord>
): string {
  const lines = [
    "# Open5e S0 Coverage",
    "",
    `Pack: \`${packVersion}\`  `,
    `Target document: \`${targetDocumentKey}\`  `,
    `Pinned source timestamp: \`${sourceFetchedAt}\``,
    "",
    "S0 imports reference and structured taxonomy data only. No tier-2 effect programs are compiled in this slice.",
    "",
    "## Collection totals",
    "",
    "| Collection | Raw records | Normalized records | Compiled records |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const collection of S0_COLLECTIONS) {
    lines.push(
      `| ${collection} | ${requireCollection(rawByCollection, collection).length} | ${requireCollection(normalizedByCollection, collection).length} | 0 |`
    );
  }

  lines.push(
    "",
    "## Fidelity by provenance",
    "",
    "| Collection | Document | Game system | Tier 0 | Tier 1 | Tier 2 |",
    "| --- | --- | --- | ---: | ---: | ---: |"
  );
  const grouped = new Map<string, { collection: Open5eCollection; document: string; gamesystem: string; tiers: number[] }>();
  for (const collection of S0_COLLECTIONS) {
    for (const record of requireCollection(normalizedByCollection, collection)) {
      const groupKey = `${collection}\u0000${record.documentKey}\u0000${record.gamesystem}`;
      const group = grouped.get(groupKey) ?? {
        collection,
        document: record.documentKey,
        gamesystem: record.gamesystem,
        tiers: [0, 0, 0],
      };
      group.tiers[record.fidelityTier] = (group.tiers[record.fidelityTier] ?? 0) + 1;
      grouped.set(groupKey, group);
    }
  }
  for (const group of [...grouped.values()].sort((left, right) =>
    `${left.collection}:${left.document}`.localeCompare(`${right.collection}:${right.document}`)
  )) {
    lines.push(
      `| ${group.collection} | ${group.document} | ${group.gamesystem} | ${group.tiers[0]} | ${group.tiers[1]} | ${group.tiers[2]} |`
    );
  }

  const deferredConditions = requireCollection(normalizedByCollection, "conditions")
    .filter((record): record is NormalizedCondition => record.kind === "condition")
    .sort(compareByKey);
  lines.push(
    "",
    "## Tier-2 compilation status",
    "",
    "Compilation was not attempted in S0. The condition prose below remains tier 0 by design; resolving it mechanically must return a structured tier rejection until a later reviewed compiler promotes it.",
    "",
    "| Content key | Status | Reason |",
    "| --- | --- | --- |"
  );
  for (const condition of deferredConditions) {
    lines.push(
      `| \`${escapeMarkdown(condition.contentKey)}\` | deferred | Condition effect compilation is outside S0. |`
    );
  }
  lines.push(
    "",
    "Damage types and sizes are tier 1 because their imported fields are structured taxonomies. Documents are tier 0 attribution/reference metadata.",
    ""
  );
  return `${lines.join("\n")}\n`;
}

function renderS1Coverage(
  slice: Exclude<Open5eImportSlice, "s0">,
  packVersion: string,
  sourceFetchedAt: string,
  targetDocumentKey: string,
  collections: Open5eCollection[],
  rawByCollection: CollectionRecords<unknown>,
  normalizedByCollection: CollectionRecords<NormalizedContentRecord>,
  compiledByCollection: CollectionRecords<CompiledContentRecord>
): string {
  const sliceLabel = slice.toUpperCase();
  const lines = [
    `# Open5e ${sliceLabel} Coverage`,
    "",
    `Pack: \`${packVersion}\`  `,
    `Target document: \`${targetDocumentKey}\`  `,
    `Pinned source timestamp: \`${sourceFetchedAt}\``,
    "",
    slice === "s1"
      ? "S1 preserves the S0 reference spine, adds the typed SRD-2014 skill registry, and deterministically compiles the SRD coin exchange table. Conditions remain non-executable tier-0 references."
      : slice === "s2"
        ? "S2 preserves the S1 rules kernel and adds SRD-2014 mundane items, weapons, armor, magic items, weapon properties, and rarity taxonomy. Typed equipment fields are tier 1. Prose-only magic effects and weapon-property rules remain non-executable; the exact shield AC bonus is the only reviewed S2 equipment effect."
        : slice === "s3"
          ? "S3 preserves S2 and adds the complete pinned SRD-2014 creature statblock corpus plus core/SRD creature types, environments, and creature sets. Only exact single-target base-damage attack sentences whose averages and v2 metadata corroborate the parsed dice are executable. Multiattack, legendary actions, reactions, secondary damage, saves, and prose effects remain non-executable."
          : slice === "s4"
            ? "S4 preserves S3 and adds the pinned SRD-2014 v2 spell corpus, core spell schools, v1 spell-list corroboration, and v1 SRD class-table slot progressions. Tier-2 spell programs resolve only a corroborated primary damage path; all remaining prose effects stay explicitly deferred."
            : slice === "s5"
              ? "S5 preserves S4 and adds source-backed SRD-2014 abilities, languages, alignments, species, classes, backgrounds, and feats. Reviewed level-one species, base-class, and background profiles are deterministic; uncompiled feat and feature prose remains reference-only."
              : slice === "s6"
                ? "S6 preserves S5 and imports the complete pinned SRD-2014 v2 rule/ruleset graph plus the v1-only WotC SRD sections and planes. These are read-only reference records for the DM; they do not become executable mechanics merely because their prose is available."
                : "S7 preserves S6 and adds deterministic, source-retaining effect programs for saves, damage, conditions and durations, recharge and daily limits, exact multiattack sequences, and area shapes. Only complete reviewed execution modes may mutate combat state; fragment programs remain inspectable but non-executable.",
    "",
    "## Collection totals",
    "",
    "| Collection | Raw records | Normalized records | Compiled records |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const collection of collections) {
    lines.push(
      `| ${collection} | ${requireCollection(rawByCollection, collection).length} | ${requireCollection(normalizedByCollection, collection).length} | ${requireCollection(compiledByCollection, collection).length} |`
    );
  }

  lines.push(
    "",
    "## Effective fidelity by provenance",
    "",
    "A compiled record promotes only its matching normalized source record. It does not promote the rest of that collection.",
    "",
    "| Collection | Document | Game system | Tier 0 | Tier 1 | Tier 2 |",
    "| --- | --- | --- | ---: | ---: | ---: |"
  );
  const grouped = new Map<string, { collection: Open5eCollection; document: string; gamesystem: string; tiers: number[] }>();
  for (const collection of collections) {
    const compiledKeys = new Set(
      requireCollection(compiledByCollection, collection).map((record) => record.sourceContentKey)
    );
    for (const record of requireCollection(normalizedByCollection, collection)) {
      const groupKey = `${collection}\u0000${record.documentKey}\u0000${record.gamesystem}`;
      const group = grouped.get(groupKey) ?? {
        collection,
        document: record.documentKey,
        gamesystem: record.gamesystem,
        tiers: [0, 0, 0],
      };
      const tier = compiledKeys.has(record.contentKey) ? 2 : record.fidelityTier;
      group.tiers[tier] = (group.tiers[tier] ?? 0) + 1;
      grouped.set(groupKey, group);
    }
  }
  for (const group of [...grouped.values()].sort((left, right) =>
    `${left.collection}:${left.document}`.localeCompare(`${right.collection}:${right.document}`)
  )) {
    lines.push(
      `| ${group.collection} | ${group.document} | ${group.gamesystem} | ${group.tiers[0]} | ${group.tiers[1]} | ${group.tiers[2]} |`
    );
  }

  const deferredConditions = requireCollection(normalizedByCollection, "conditions")
    .filter((record): record is NormalizedCondition => record.kind === "condition")
    .sort(compareByKey);
  const excludedSkills = requireCollection(rawByCollection, "skills")
    .map((record) => rawSkillSchema.parse(record))
    .filter((record) => record.document !== "core")
    .sort(compareByKey);
  const currencyProgram = requireCollection(compiledByCollection, "rules")[0];
  lines.push(
    "",
    "## Compilation and exclusion report",
    "",
    "| Content or source key | Status | Reason |",
    "| --- | --- | --- |"
  );
  if (currencyProgram) {
    lines.push(
      `| \`${escapeMarkdown(currencyProgram.contentKey)}\` | compiled | Five denomination rows matched the reviewed SRD-2014 coin table exactly. |`
    );
  }
  if (slice !== "s1") {
    for (const program of requireCollection(compiledByCollection, "items")) {
      lines.push(
        `| \`${escapeMarkdown(program.contentKey)}\` | compiled | The source text matched the reviewed shield armor-class effect exactly. |`
      );
    }
  }
  for (const condition of deferredConditions) {
    lines.push(
      `| \`${escapeMarkdown(condition.contentKey)}\` | deferred | Condition effect compilation remains outside ${sliceLabel}. |`
    );
  }
  for (const skill of excludedSkills) {
    lines.push(
      `| \`${escapeMarkdown(skill.key)}\` | excluded | Source container \`${escapeMarkdown(skill.document)}\` is outside the pinned core/SRD-2014 skill registry. |`
    );
  }
  if (slice !== "s1") {
    for (const record of requireCollection(normalizedByCollection, "weaponproperties")) {
      if (record.kind !== "weapon-property") continue;
      lines.push(
        `| \`${escapeMarkdown(record.contentKey)}\` | deferred | Weapon-property prose is displayable but is not an executable effect program in S2. |`
      );
    }
    for (const record of requireCollection(normalizedByCollection, "magicitems")) {
      if (record.kind !== "magic-item") continue;
      lines.push(
        `| \`${escapeMarkdown(record.contentKey)}\` | deferred | Typed identity, equipment links, rarity, value, weight, and attunement are available; the magic effect remains prose. |`
      );
    }
  }
  if (slice === "s3" || slice === "s4" || slice === "s5" || slice === "s6" || slice === "s7") {
    const creatures = requireCollection(normalizedByCollection, "creatures")
      .filter((record): record is NormalizedCreature => record.kind === "creature");
    const compiledAttacks = requireCollection(compiledByCollection, "creatures")
      .filter((record): record is CompiledCreatureAttack => record.kind === "creature-attack");
    const actionCount = creatures.reduce((total, creature) => total + creature.actions.length, 0);
    const excludedEnvironmentKeys = [...new Set(
      creatures.flatMap((creature) => creature.excludedEnvironmentSourceKeys)
    )].sort();
    lines.push(
      `| \`creatures/exact-simple-attacks\` | compiled | ${compiledAttacks.length} exact single-target base-damage attacks compiled from pinned prose; source averages and compatible v2 attack metadata were checked. |`,
      `| \`creatures/deferred-actions\` | deferred | ${actionCount - compiledAttacks.length} actions remain display-only because they require multiattack, legendary/reaction timing, saves, secondary damage, conditions, recharge, or other effect semantics. |`
    );
    for (const key of excludedEnvironmentKeys) {
      lines.push(
        `| \`${escapeMarkdown(key)}\` | excluded | A target creature payload referenced an environment outside the core/SRD-2014 partition; the raw link is preserved but is not normalized into this pack. |`
      );
    }
  }
  if (slice === "s4" || slice === "s5" || slice === "s6" || slice === "s7") {
    const spells = requireCollection(normalizedByCollection, "spells")
      .filter((record): record is NormalizedSpell => record.kind === "spell");
    const compiledSpells = requireCollection(compiledByCollection, "spells")
      .filter((record): record is CompiledSpellEffect => record.kind === "spell-effect");
    const progressions = requireCollection(normalizedByCollection, "spellprogressions")
      .filter((record): record is NormalizedSpellProgression => record.kind === "spell-progression");
    lines.push(
      `| \`spells/primary-damage\` | compiled | ${compiledSpells.length} spells have a deterministic primary damage program sourced from typed v2 fields and corroborated damage prose. Secondary and persistent prose effects remain deferred and are reported to the DM. |`,
      `| \`spells/deferred\` | deferred | ${spells.length - compiledSpells.length} spells remain typed references because they lack one unambiguous primary damage path or require healing, conditions, movement, summoning, repeated effects, or other uncompiled semantics. |`,
      `| \`spellprogressions/v1-srd-tables\` | compiled-source | ${progressions.length} caster progressions were parsed from hashed v1 WotC SRD markdown tables. The v2 class slot-column duplicate/missing-row defect is preserved upstream and not silently repaired. |`
    );
  }
  if (slice === "s5" || slice === "s6" || slice === "s7") {
    const speciesProfiles = requireCollection(compiledByCollection, "species").length;
    const classProfiles = requireCollection(compiledByCollection, "classes").length;
    const backgroundProfiles = requireCollection(compiledByCollection, "backgrounds").length;
    lines.push(
      `| \`characters/reviewed-profiles\` | compiled | ${speciesProfiles} species, ${classProfiles} base classes, and ${backgroundProfiles} backgrounds have deterministic level-one creation profiles. |`,
      "| `characters/deferred-features` | deferred | Feature and feat prose without a reviewed mechanical program remains reference-only and cannot mutate character state by implication. |"
    );
  }
  if (slice === "s6" || slice === "s7") {
    const rules = requireCollection(normalizedByCollection, "rules").length;
    const rulesets = requireCollection(normalizedByCollection, "rulesets").length;
    const sections = requireCollection(normalizedByCollection, "sections").length;
    const planes = requireCollection(normalizedByCollection, "planes").length;
    lines.push(
      `| \`rules-reference/v2\` | reference | ${rules} rules are linked into ${rulesets} complete rulesets with pinned hierarchy metadata. |`,
      `| \`rules-reference/v1-only\` | reference | ${sections} legacy sections and ${planes} planes are preserved with explicit v1 provenance and mapped to the SRD-2014 document policy. |`
    );
  }
  if (slice === "s7") {
    const creaturePrograms = requireCollection(compiledByCollection, "creatures")
      .filter((record) => record.kind === "effect-program");
    const spellPrograms = requireCollection(compiledByCollection, "spells")
      .filter((record) => record.kind === "effect-program");
    const executable = creaturePrograms.filter((program) => program.executionMode !== "fragments");
    const fragments = creaturePrograms.filter((program) => program.executionMode === "fragments");
    lines.push(
      `| \`effects/creature-actions\` | compiled | ${creaturePrograms.length} source-retaining action programs compiled; ${executable.length} have a complete execution mode and ${fragments.length} remain non-executable typed fragments. |`,
      `| \`effects/spell-areas\` | compiled | ${spellPrograms.length} spells have typed area-shape programs corroborated by normalized Open5e geometry. |`,
      "| `effects/round-trip` | verified-source | Every S7 program stores its exact source description and SHA-256; pack verification compares both against the normalized source record. |"
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderAttribution(
  slice: Open5eImportSlice,
  packVersion: string,
  sourceFetchedAt: string,
  records: NormalizedContentRecord[]
): string {
  const documents = records
    .filter((record): record is NormalizedDocument => record.kind === "document")
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  const lines = [
    `# Open5e ${slice.toUpperCase()} Attribution`,
    "",
    `Generated for \`${packVersion}\` from Open5e API ${slice === "s6" || slice === "s7" ? "v2 canonical data plus v1-only spell-list, class-table, section, and plane evidence" : slice === "s4" || slice === "s5" ? "v2 canonical data plus v1-only spell-list and class-table evidence" : "v2 data"} pinned at \`${sourceFetchedAt}\`.`,
    "",
    slice === "s0"
      ? "The target and taxonomy documents supply normalized gameplay references. Raw-attribution documents are included only because their provenance appears in verbatim shared-taxonomy payloads; their gameplay variants are not normalized into this SRD 2014 pack."
      : `The target and taxonomy documents supply normalized gameplay references and the ${slice.toUpperCase()} rules/content layer. Raw-attribution documents are included only because their provenance appears in verbatim shared-taxonomy payloads; their gameplay variants are not normalized into this SRD 2014 pack.`,
    "",
  ];
  for (const document of documents) {
    lines.push(
      `## ${document.displayName} (\`${document.sourceKey}\`)`,
      "",
      `- Pack role: ${document.packRole}`,
      `- Publisher: ${document.publisher.name} (\`${document.publisher.key}\`)`,
      `- Game system: \`${document.gamesystem}\``,
      `- Licenses: ${document.licenses.map((license) => `${license.name} (\`${license.key}\`)`).join(", ")}`,
      `- Source: ${document.permalink}`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildListUrl(
  apiBaseUrl: string,
  collection: Open5eCollection,
  pageSize: number,
  filters: Record<string, string>
): string {
  const url = new URL(`${apiBaseUrl}/${collection}/`);
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("ordering", "key");
  for (const [key, value] of Object.entries(filters).sort(([left], [right]) => left.localeCompare(right))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildV1ListUrl(
  apiBaseUrl: string,
  endpoint: "spelllist" | "classes" | "sections" | "planes",
  pageSize: number,
  filters: Record<string, string>
): string {
  const url = new URL(`${apiBaseUrl}/${endpoint}/`);
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("ordering", "slug");
  for (const [key, value] of Object.entries(filters).sort(([left], [right]) => left.localeCompare(right))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function writeArtifact(
  packDirectory: string,
  relativePath: string,
  content: string,
  recordCount: number
): Promise<{ path: string; sha256: string; recordCount: number }> {
  const absolutePath = join(packDirectory, ...relativePath.split("/"));
  await writeFile(absolutePath, content, "utf8");
  return { path: relativePath, sha256: sha256(content), recordCount };
}

function toNdjson(records: unknown[]): string {
  if (records.length === 0) {
    return "";
  }
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function compareByKey(left: { key: string }, right: { key: string }): number {
  return left.key.localeCompare(right.key);
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|");
}

function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function assertSafePackVersion(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error("Open5e packVersion may contain only letters, numbers, dots, underscores, and hyphens.");
  }
}

function assertIsoTimestamp(value: string): void {
  const result = z.string().datetime({ offset: true }).safeParse(value);
  if (!result.success) {
    throw new Error("sourceFetchedAt must be an ISO-8601 timestamp with an explicit offset.");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
