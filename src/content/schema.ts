import { z } from "zod";

export const OPEN5E_COLLECTIONS = [
  "conditions",
  "damagetypes",
  "sizes",
  "documents",
  "skills",
  "rules",
  "rulesets",
  "sections",
  "planes",
  "items",
  "itemsets",
  "itemcategories",
  "weapons",
  "armor",
  "magicitems",
  "weaponproperties",
  "itemrarities",
  "creaturetypes",
  "environments",
  "creaturesets",
  "creatures",
  "spellschools",
  "spells",
  "spelllists",
  "spellprogressions",
  "abilities",
  "languages",
  "alignments",
  "species",
  "classes",
  "backgrounds",
  "feats",
  "licenses",
  "publishers",
  "gamesystems",
  "images",
  "services",
] as const;

export const open5eCollectionSchema = z.enum(OPEN5E_COLLECTIONS);

export type Open5eCollection = z.infer<typeof open5eCollectionSchema>;

export const contentPublisherSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
});

const normalizedProvenanceFields = {
  key: z.string().min(1),
  contentKey: z.string().min(1),
  sourceKey: z.string().min(1),
  documentKey: z.string().min(1),
  gamesystem: z.string().min(1),
  publisher: contentPublisherSchema,
  licenseKeys: z.array(z.string().min(1)).min(1),
  permalink: z.string().url(),
  sourceApiVersion: z.enum(["v1", "v2"]),
  sourceFetchedAt: z.string().datetime({ offset: true }),
};

export const normalizedDocumentSchema = z.object({
  kind: z.literal("document"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  packRole: z.enum(["target", "taxonomy", "content", "raw-attribution"]),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string(),
  documentType: z.string().min(1),
  author: z.string(),
  publicationDate: z.string().nullable(),
  distanceUnit: z.string().nullable(),
  weightUnit: z.string().nullable(),
  licenses: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
  })).min(1),
});

export const normalizedConditionSchema = z.object({
  kind: z.literal("condition"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.object({
    sourceKey: z.string().min(1),
    name: z.string().min(1),
    fileUrl: z.string().min(1),
    altText: z.string().min(1),
    attribution: z.string().min(1),
    documentKey: z.string().min(1),
    gamesystem: z.string().min(1),
    publisher: contentPublisherSchema,
    licenseKeys: z.array(z.string().min(1)).min(1),
    permalink: z.string().url(),
  }).nullable(),
  sourceContainerDocumentKey: z.string().min(1),
});

export const normalizedDamageTypeSchema = z.object({
  kind: z.literal("damage-type"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  sourceContainerDocumentKey: z.string().min(1),
});

export const normalizedSizeSchema = z.object({
  kind: z.literal("size"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  rank: z.number().int().nonnegative(),
  spaceDiameter: z.number().positive(),
  distanceUnit: z.string().min(1),
  suggestedHitDice: z.string().min(1),
});

export const normalizedSkillSchema = z.object({
  kind: z.literal("skill"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  engineKey: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  description: z.string().min(1),
  sourceContainerDocumentKey: z.string().min(1),
});

export const normalizedRuleSchema = z.object({
  kind: z.literal("rule"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  rulesetKey: z.string().min(1),
  index: z.number().int().nonnegative().optional(),
  initialHeaderLevel: z.number().int().nonnegative().optional(),
  crossReferences: z.array(z.string().min(1)).optional(),
});

export const normalizedRulesetSchema = z.object({
  kind: z.literal("ruleset"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string(),
  ruleContentKeys: z.array(z.string().min(1)),
  crossReferences: z.array(z.string().min(1)),
});

const normalizedLegacyReferenceFields = {
  legacyDocumentSlug: z.string().min(1),
  legacyDocumentTitle: z.string().min(1),
  legacyDocumentUrl: z.string().min(1),
  legacyLicenseUrl: z.string().min(1).nullable(),
  parent: z.string().min(1).nullable(),
};

export const normalizedSectionSchema = z.object({
  kind: z.literal("section"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  ...normalizedLegacyReferenceFields,
  name: z.string().min(1),
  description: z.string().min(1),
});

export const normalizedPlaneSchema = z.object({
  kind: z.literal("plane"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  ...normalizedLegacyReferenceFields,
  name: z.string().min(1),
  description: z.string().min(1),
});

const normalizedItemCategoryFields = {
  categoryKey: z.string().min(1),
  categoryName: z.string().min(1),
};

const normalizedPhysicalItemFields = {
  name: z.string().min(1),
  description: z.string(),
  ...normalizedItemCategoryFields,
  sizeKey: z.string().min(1),
  sizeName: z.string().min(1),
  weight: z.number().nonnegative(),
  weightUnit: z.string().min(1),
  weaponContentKey: z.string().min(1).nullable(),
  armorContentKey: z.string().min(1).nullable(),
};

export const normalizedItemSchema = z.object({
  kind: z.literal("item"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  ...normalizedPhysicalItemFields,
  valueCopper: z.number().int().nonnegative(),
});

export const normalizedMagicItemSchema = z.object({
  kind: z.literal("magic-item"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  ...normalizedPhysicalItemFields,
  valueCopper: z.number().int().nonnegative().nullable(),
  rarity: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    rank: z.number().int().positive(),
    contentKey: z.string().min(1),
  }),
  requiresAttunement: z.boolean(),
  attunementDetail: z.string().nullable(),
});

export const normalizedWeaponPropertySchema = z.object({
  kind: z.literal("weapon-property"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  propertyType: z.string().nullable(),
});

export const normalizedWeaponSchema = z.object({
  kind: z.literal("weapon"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  damageDice: z.string().min(1),
  damageTypeKey: z.string().min(1),
  damageTypeName: z.string().min(1),
  damageTypeContentKey: z.string().min(1),
  range: z.object({
    normal: z.number().int().nonnegative(),
    long: z.number().int().nonnegative(),
    unit: z.string().min(1),
  }),
  isSimple: z.boolean(),
  isMartial: z.boolean(),
  isImprovised: z.boolean(),
  properties: z.array(z.object({
    sourceKey: z.string().min(1),
    contentKey: z.string().min(1),
    name: z.string().min(1),
    propertyType: z.string().nullable(),
    description: z.string().min(1),
    detail: z.string().nullable(),
  })),
});

export const normalizedArmorSchema = z.object({
  kind: z.literal("armor"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  category: z.enum(["light", "medium", "heavy"]),
  armorClass: z.object({
    display: z.string().min(1),
    base: z.number().int().positive(),
    addDexterityModifier: z.boolean(),
    dexterityModifierCap: z.number().int().nonnegative().nullable(),
  }),
  grantsStealthDisadvantage: z.boolean(),
  strengthScoreRequired: z.number().int().nonnegative().nullable(),
});

export const normalizedItemRaritySchema = z.object({
  kind: z.literal("item-rarity"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  rank: z.number().int().positive(),
  sourceContainer: z.literal("itemrarities"),
});

export const normalizedContentReferenceSchema = z.object({
  sourceKey: z.string().min(1),
  contentKey: z.string().min(1),
  name: z.string().min(1),
});

const normalizedAbilityValuesSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});

export const normalizedCreatureTypeSchema = z.object({
  kind: z.literal("creature-type"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  sourceContainerDocumentKey: z.string().min(1),
});

export const normalizedEnvironmentSchema = z.object({
  kind: z.literal("environment"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string(),
  aquatic: z.boolean(),
  planar: z.boolean(),
  interior: z.boolean(),
});

export const normalizedCreatureSetSchema = z.object({
  kind: z.literal("creature-set"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  creatures: z.array(normalizedContentReferenceSchema),
});

const normalizedCreatureAttackMetadataSchema = z.object({
  name: z.string().min(1),
  attackType: z.enum(["WEAPON", "SPELL"]),
  toHit: z.number().int(),
  reach: z.number().nonnegative().nullable(),
  range: z.number().nonnegative().nullable(),
  longRange: z.number().nonnegative().nullable(),
  distanceUnit: z.string().min(1),
  targetCreatureOnly: z.boolean(),
  damage: z.object({
    dieCount: z.number().int().positive().nullable(),
    dieSides: z.number().int().positive().nullable(),
    bonus: z.number().int().nullable(),
    type: normalizedContentReferenceSchema.nullable(),
  }),
  extraDamage: z.object({
    dieCount: z.number().int().positive().nullable(),
    dieSides: z.number().int().positive().nullable(),
    bonus: z.number().int().nullable(),
    type: normalizedContentReferenceSchema.nullable(),
  }),
});

export const normalizedCreatureSchema = z.object({
  kind: z.literal("creature"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  creatureType: normalizedContentReferenceSchema,
  size: normalizedContentReferenceSchema,
  challengeRating: z.number().min(0).max(30),
  proficiencyBonus: z.number().int().nullable(),
  experiencePoints: z.number().int().nonnegative().nullable(),
  category: z.string().min(1),
  subcategory: z.string().nullable(),
  alignment: z.string(),
  armorClass: z.number().int().nonnegative(),
  armorDetail: z.string(),
  hitPoints: z.number().int().nonnegative(),
  hitDice: z.string().min(1).nullable(),
  abilities: normalizedAbilityValuesSchema,
  abilityModifiers: normalizedAbilityValuesSchema,
  initiativeBonus: z.number().int(),
  savingThrows: z.partialRecord(z.enum(["str", "dex", "con", "int", "wis", "cha"]), z.number().int()),
  savingThrowsAll: normalizedAbilityValuesSchema,
  skillBonuses: z.record(z.string().min(1), z.number().int()),
  skillBonusesAll: z.record(z.string().min(1), z.number().int()),
  passivePerception: z.number().int(),
  speed: z.object({
    unit: z.string().min(1),
    walk: z.number().nonnegative(),
    crawl: z.number().nonnegative(),
    hover: z.boolean(),
    fly: z.number().nonnegative(),
    burrow: z.number().nonnegative(),
    climb: z.number().nonnegative(),
    swim: z.number().nonnegative(),
  }),
  senses: z.object({
    unit: z.string().min(1),
    normal: z.number().nonnegative().nullable(),
    darkvision: z.number().nonnegative().nullable(),
    blindsight: z.number().nonnegative().nullable(),
    tremorsense: z.number().nonnegative().nullable(),
    truesight: z.number().nonnegative().nullable(),
  }),
  languages: z.object({
    display: z.string(),
    entries: z.array(z.object({
      sourceKey: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
    })),
  }),
  defenses: z.object({
    damageImmunitiesDisplay: z.string(),
    damageImmunities: z.array(normalizedContentReferenceSchema),
    damageResistancesDisplay: z.string(),
    damageResistances: z.array(normalizedContentReferenceSchema),
    damageVulnerabilitiesDisplay: z.string(),
    damageVulnerabilities: z.array(normalizedContentReferenceSchema),
    conditionImmunitiesDisplay: z.string(),
    conditionImmunities: z.array(normalizedContentReferenceSchema),
  }),
  actions: z.array(z.object({
    actionKey: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    mechanicsTier: z.literal(0),
    actionType: z.enum(["ACTION", "BONUS_ACTION", "REACTION", "LEGENDARY_ACTION", "LAIR_ACTION", "MYTHIC_ACTION"]).nullable(),
    orderInStatblock: z.number().int().nullable(),
    legendaryActionCost: z.number().int().positive().nullable(),
    limitedToForm: z.string().nullable(),
    usageLimits: z.object({ type: z.string().min(1), param: z.number().int().positive() }).nullable(),
    sourceAttackMetadata: z.array(normalizedCreatureAttackMetadataSchema),
  })),
  traits: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  creatureSets: z.array(normalizedContentReferenceSchema),
  environments: z.array(normalizedContentReferenceSchema),
  excludedEnvironmentSourceKeys: z.array(z.string().min(1)),
  illustration: z.object({
    sourceKey: z.string().min(1),
    name: z.string().min(1),
    fileUrl: z.string().min(1),
    altText: z.string(),
    attribution: z.string(),
  }).nullable(),
});

export const normalizedSpellSchoolSchema = z.object({
  kind: z.literal("spell-school"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  sourceContainerDocumentKey: z.string().min(1),
});

const normalizedSpellCastingOptionSchema = z.object({
  type: z.string().min(1),
  damageRoll: z.string().min(1).nullable(),
  targetCount: z.number().int().nonnegative().nullable(),
  duration: z.string().min(1).nullable(),
  range: z.string().min(1).nullable(),
  concentration: z.boolean().nullable(),
  shapeSize: z.number().nonnegative().nullable(),
  description: z.string().min(1).nullable(),
});

export const normalizedSpellSchema = z.object({
  kind: z.literal("spell"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: normalizedContentReferenceSchema,
  higherLevel: z.string(),
  targetType: z.enum(["creature", "object", "point", "area"]),
  targetCount: z.number().int().nonnegative().nullable(),
  range: z.object({
    text: z.string().min(1),
    distance: z.number().nonnegative(),
    unit: z.string().min(1),
  }),
  ritual: z.boolean(),
  castingTime: z.string().min(1),
  reactionCondition: z.string().min(1).nullable(),
  components: z.object({
    verbal: z.boolean(),
    somatic: z.boolean(),
    material: z.boolean(),
    materialSpecified: z.string(),
    materialCostGp: z.string().regex(/^\d+\.\d{2}$/).nullable(),
    materialConsumed: z.boolean(),
  }),
  savingThrowAbility: z.enum(["str", "dex", "con", "int", "wis", "cha"]).nullable(),
  attackRoll: z.boolean(),
  damageRoll: z.string().min(1).nullable(),
  damageTypes: z.array(normalizedContentReferenceSchema),
  duration: z.string().min(1),
  area: z.object({
    shape: z.enum(["cone", "cube", "cylinder", "line", "sphere"]).nullable(),
    size: z.number().nonnegative().nullable(),
    unit: z.string().min(1),
  }),
  concentration: z.boolean(),
  classes: z.array(z.object({
    sourceKey: z.string().min(1),
    name: z.string().min(1),
  })),
  castingOptions: z.array(normalizedSpellCastingOptionSchema),
});

export const normalizedSpellListSchema = z.object({
  kind: z.literal("spell-list"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  classSourceKey: z.string().min(1),
  className: z.string().min(1),
  sourceSlug: z.string().min(1),
  sourceDocument: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    licenseUrl: z.string().min(1),
    url: z.string().min(1),
  }),
  spells: z.array(normalizedContentReferenceSchema),
  excludedSourceSpellSlugs: z.array(z.string().min(1)),
  canonicalClassMembershipCorroborated: z.literal(true),
});

const spellSlotCountsSchema = z.object({
  "1": z.number().int().nonnegative(),
  "2": z.number().int().nonnegative(),
  "3": z.number().int().nonnegative(),
  "4": z.number().int().nonnegative(),
  "5": z.number().int().nonnegative(),
  "6": z.number().int().nonnegative(),
  "7": z.number().int().nonnegative(),
  "8": z.number().int().nonnegative(),
  "9": z.number().int().nonnegative(),
});

export const normalizedSpellProgressionSchema = z.object({
  kind: z.literal("spell-progression"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  classSourceKey: z.string().min(1),
  className: z.string().min(1),
  spellcastingAbility: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  slotMode: z.enum(["standard", "pact"]),
  slotRecovery: z.enum(["long-rest", "short-or-long-rest"]),
  selectionMode: z.enum(["known", "prepared", "spellbook"]),
  knownSpellLimits: z.array(z.number().int().nonnegative().nullable()).length(20),
  cantripsKnown: z.array(z.number().int().nonnegative().nullable()).length(20),
  preparedFormula: z.object({
    classLevelMultiplier: z.number().positive(),
    abilityModifierMultiplier: z.number().positive(),
    minimum: z.number().int().positive(),
  }).nullable(),
  spellbook: z.object({
    initialSpellCount: z.number().int().positive(),
    spellsGainedPerLevel: z.number().int().positive(),
  }).nullable(),
  levels: z.array(z.object({
    characterLevel: z.number().int().min(1).max(20),
    slots: spellSlotCountsSchema,
  })).length(20),
  sourceTableSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceDocument: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    licenseUrl: z.string().min(1),
    url: z.string().min(1),
  }),
});

export const normalizedAbilitySchema = z.object({
  kind: z.literal("ability"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  abbreviation: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  shortDescription: z.string().min(1),
  description: z.string().min(1),
  skills: z.array(normalizedContentReferenceSchema),
  sourceContainerDocumentKey: z.string().min(1),
});

export const normalizedLanguageSchema = z.object({
  kind: z.literal("language"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string(),
  isExotic: z.boolean(),
  isSecret: z.boolean(),
  scriptLanguageSourceKey: z.string().min(1).nullable(),
  sourceContainerDocumentKey: z.string().min(1),
});

export const normalizedAlignmentSchema = z.object({
  kind: z.literal("alignment"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  morality: z.enum(["good", "neutral", "evil"]),
  societalAttitude: z.enum(["lawful", "neutral", "chaotic"]),
  shortName: z.string().min(1).max(2),
  description: z.string().min(1),
  sourceContainerDocumentKey: z.string().min(1),
});

const normalizedCharacterFeatureSchema = z.object({
  sourceKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  featureType: z.enum([
    "CORE_TRAITS_TABLE",
    "CLASS_LEVEL_FEATURE",
    "CLASS_FEATURE_OPTION_LIST",
    "CLASS_TABLE_DATA",
    "PROFICIENCIES",
    "PROFICIENCY_BONUS",
    "STARTING_EQUIPMENT",
    "SPELL_SLOTS",
  ]),
  gainedAt: z.array(z.object({
    level: z.number().int().min(0).max(20),
    detail: z.string().nullable(),
  })),
  tableData: z.array(z.object({
    level: z.number().int().min(0).max(20),
    value: z.string().min(1),
  })),
});

export const normalizedSpeciesSchema = z.object({
  kind: z.literal("species"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string(),
  isSubspecies: z.boolean(),
  subspeciesOfSourceKey: z.string().min(1).nullable(),
  traits: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    traitType: z.enum(["ABILITY_MODS", "SIZE", "SPEED"]).nullable(),
    order: z.number().int().nullable(),
  })),
});

export const normalizedCharacterClassSchema = z.object({
  kind: z.literal("class"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string(),
  isSubclass: z.boolean(),
  subclassOf: normalizedContentReferenceSchema.nullable(),
  hitDie: z.number().int().min(1).max(20).nullable(),
  casterType: z.enum(["FULL", "HALF", "NONE"]).nullable(),
  savingThrows: z.array(normalizedContentReferenceSchema),
  primaryAbilities: z.array(normalizedContentReferenceSchema),
  features: z.array(normalizedCharacterFeatureSchema),
});

export const normalizedBackgroundSchema = z.object({
  kind: z.literal("background"),
  fidelityTier: z.literal(1),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  benefits: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    benefitType: z.string().min(1),
  })),
});

export const normalizedFeatSchema = z.object({
  kind: z.literal("feat"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  name: z.string().min(1),
  description: z.string().min(1),
  featType: z.enum(["GENERAL", "ORIGIN", "FIGHTING_STYLE", "EPIC_BOON"]),
  prerequisite: z.string(),
  hasPrerequisite: z.boolean(),
  benefits: z.array(z.object({ description: z.string().min(1) })),
});

export const normalizedCorpusReferenceSchema = z.object({
  kind: z.literal("corpus-reference"),
  fidelityTier: z.literal(0),
  ...normalizedProvenanceFields,
  collection: open5eCollectionSchema,
  sourceRecordKey: z.string().min(1),
  sourcePayloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1),
  description: z.string(),
  deferredReason: z.string().min(1),
});

export const normalizedContentRecordSchema = z.discriminatedUnion("kind", [
  normalizedDocumentSchema,
  normalizedConditionSchema,
  normalizedDamageTypeSchema,
  normalizedSizeSchema,
  normalizedSkillSchema,
  normalizedRuleSchema,
  normalizedRulesetSchema,
  normalizedSectionSchema,
  normalizedPlaneSchema,
  normalizedItemSchema,
  normalizedMagicItemSchema,
  normalizedWeaponPropertySchema,
  normalizedWeaponSchema,
  normalizedArmorSchema,
  normalizedItemRaritySchema,
  normalizedCreatureTypeSchema,
  normalizedEnvironmentSchema,
  normalizedCreatureSetSchema,
  normalizedCreatureSchema,
  normalizedSpellSchoolSchema,
  normalizedSpellSchema,
  normalizedSpellListSchema,
  normalizedSpellProgressionSchema,
  normalizedAbilitySchema,
  normalizedLanguageSchema,
  normalizedAlignmentSchema,
  normalizedSpeciesSchema,
  normalizedCharacterClassSchema,
  normalizedBackgroundSchema,
  normalizedFeatSchema,
  normalizedCorpusReferenceSchema,
]);

export type NormalizedDocument = z.infer<typeof normalizedDocumentSchema>;
export type NormalizedCondition = z.infer<typeof normalizedConditionSchema>;
export type NormalizedDamageType = z.infer<typeof normalizedDamageTypeSchema>;
export type NormalizedSize = z.infer<typeof normalizedSizeSchema>;
export type NormalizedSkill = z.infer<typeof normalizedSkillSchema>;
export type NormalizedRule = z.infer<typeof normalizedRuleSchema>;
export type NormalizedRuleset = z.infer<typeof normalizedRulesetSchema>;
export type NormalizedSection = z.infer<typeof normalizedSectionSchema>;
export type NormalizedPlane = z.infer<typeof normalizedPlaneSchema>;
export type NormalizedItem = z.infer<typeof normalizedItemSchema>;
export type NormalizedMagicItem = z.infer<typeof normalizedMagicItemSchema>;
export type NormalizedWeaponProperty = z.infer<typeof normalizedWeaponPropertySchema>;
export type NormalizedWeapon = z.infer<typeof normalizedWeaponSchema>;
export type NormalizedArmor = z.infer<typeof normalizedArmorSchema>;
export type NormalizedItemRarity = z.infer<typeof normalizedItemRaritySchema>;
export type NormalizedCreatureType = z.infer<typeof normalizedCreatureTypeSchema>;
export type NormalizedEnvironment = z.infer<typeof normalizedEnvironmentSchema>;
export type NormalizedCreatureSet = z.infer<typeof normalizedCreatureSetSchema>;
export type NormalizedCreature = z.infer<typeof normalizedCreatureSchema>;
export type NormalizedSpellSchool = z.infer<typeof normalizedSpellSchoolSchema>;
export type NormalizedSpell = z.infer<typeof normalizedSpellSchema>;
export type NormalizedSpellList = z.infer<typeof normalizedSpellListSchema>;
export type NormalizedSpellProgression = z.infer<typeof normalizedSpellProgressionSchema>;
export type NormalizedAbility = z.infer<typeof normalizedAbilitySchema>;
export type NormalizedLanguage = z.infer<typeof normalizedLanguageSchema>;
export type NormalizedAlignment = z.infer<typeof normalizedAlignmentSchema>;
export type NormalizedSpecies = z.infer<typeof normalizedSpeciesSchema>;
export type NormalizedCharacterClass = z.infer<typeof normalizedCharacterClassSchema>;
export type NormalizedBackground = z.infer<typeof normalizedBackgroundSchema>;
export type NormalizedFeat = z.infer<typeof normalizedFeatSchema>;
export type NormalizedCorpusReference = z.infer<typeof normalizedCorpusReferenceSchema>;
export type NormalizedContentRecord = z.infer<typeof normalizedContentRecordSchema>;

export const compiledCurrencyTableSchema = z.object({
  kind: z.literal("currency-table"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  denominations: z.array(z.object({
    key: z.enum(["cp", "sp", "ep", "gp", "pp"]),
    name: z.enum(["Copper", "Silver", "Electrum", "Gold", "Platinum"]),
    copperValue: z.number().int().positive(),
  })).length(5),
});

export const compiledEquipmentEffectSchema = z.object({
  kind: z.literal("equipment-effect"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  effects: z.array(z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("armor-class-bonus"),
      value: z.number().int(),
      stackingKey: z.string().min(1),
    }),
  ])).min(1),
});

export const compiledCreatureAttackSchema = z.object({
  kind: z.literal("creature-attack"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  actionKey: z.string().min(1),
  name: z.string().min(1),
  attackMode: z.enum(["melee", "ranged", "melee-or-ranged"]),
  attackKind: z.enum(["weapon", "spell"]),
  toHit: z.number().int(),
  distance: z.object({
    reach: z.number().nonnegative().nullable(),
    range: z.number().nonnegative().nullable(),
    longRange: z.number().nonnegative().nullable(),
    unit: z.string().min(1),
  }),
  target: z.string().min(1),
  damage: z.object({
    average: z.number().int().nonnegative(),
    diceCount: z.number().int().positive(),
    dieSides: z.number().int().positive(),
    bonus: z.number().int(),
    typeKey: z.string().min(1),
    typeName: z.string().min(1),
    typeContentKey: z.string().min(1),
  }),
  sourceDescriptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  resolutionScope: z.literal("single-target-base-damage"),
});

const compiledDamageExpressionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dice"),
    diceCount: z.number().int().positive(),
    dieSides: z.number().int().positive(),
    bonus: z.number().int(),
  }),
  z.object({
    kind: z.literal("flat"),
    amount: z.number().int().nonnegative(),
  }),
]);

export const compiledEffectDurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("persistent") }),
  z.object({
    kind: z.literal("fixed"),
    amount: z.number().int().positive(),
    unit: z.enum(["round", "minute", "hour", "day"]),
  }),
  z.object({
    kind: z.literal("turn-boundary"),
    boundary: z.enum(["start", "end"]),
    subject: z.enum(["source", "target"]),
    offsetTurns: z.number().int().min(0).max(1),
  }),
  z.object({
    kind: z.literal("source-lifetime"),
  }),
]);

const compiledSpellEffectProvenance = {
  kind: z.literal("spell-effect"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  sourceDescriptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  hasDeferredProseEffects: z.boolean(),
};

const compiledSpellDamageEffectSchema = z.object({
  ...compiledSpellEffectProvenance,
  effectKind: z.literal("damage"),
  resolution: z.enum(["spell-attack", "saving-throw", "automatic"]),
  saveOnSuccess: z.enum(["half", "none"]).nullable(),
  damageType: normalizedContentReferenceSchema,
  baseDamage: compiledDamageExpressionSchema,
  slotLevelVariants: z.record(z.string().regex(/^[1-9]$/), compiledDamageExpressionSchema),
  playerLevelVariants: z.record(z.string().regex(/^(?:[1-9]|1\d|20)$/), compiledDamageExpressionSchema),
  resolutionScope: z.literal("primary-damage"),
});

const compiledSpellHealingEffectSchema = z.object({
  ...compiledSpellEffectProvenance,
  effectKind: z.literal("healing"),
  healingAbility: z.enum(["str", "dex", "con", "int", "wis", "cha", "spellcasting"]),
  baseHealing: compiledDamageExpressionSchema,
  slotLevelVariants: z.record(z.string().regex(/^[1-9]$/), compiledDamageExpressionSchema),
  targetPolicy: z.literal("single-creature"),
  resolutionScope: z.literal("single-target-healing"),
});

const compiledSpellStatModifierEffectSchema = z.object({
  ...compiledSpellEffectProvenance,
  effectKind: z.literal("stat-modifier"),
  modifier: z.object({
    stat: z.literal("armor-class"),
    amount: z.number().int(),
    duration: compiledEffectDurationSchema,
    stackingKey: z.string().min(1),
    trigger: z.literal("incoming-attack-would-hit"),
  }),
  resolutionScope: z.literal("incoming-hit-reaction"),
});

export const compiledSpellEffectSchema = z.preprocess(
  (value) => {
    // S7 remains a pinned migration base. Its reviewed damage records predate
    // the explicit effect discriminator; normalize those records at the
    // schema boundary while new S8 output is always written with effectKind.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as Record<string, unknown>;
      if (candidate.kind === "spell-effect" && candidate.effectKind === undefined) {
        return { ...candidate, effectKind: "damage" };
      }
    }
    return value;
  },
  z.discriminatedUnion("effectKind", [
    compiledSpellDamageEffectSchema,
    compiledSpellHealingEffectSchema,
    compiledSpellStatModifierEffectSchema,
  ])
);

export const compiledEffectOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("usage-limit"),
    usage: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("per-day"), uses: z.number().int().positive() }),
      z.object({
        kind: z.literal("recharge"),
        dieSides: z.literal(6),
        minimumRoll: z.number().int().min(2).max(6),
        maximumRoll: z.literal(6),
      }),
    ]),
  }),
  z.object({
    kind: z.literal("saving-throw"),
    dc: z.number().int().min(1).max(40),
    ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
  }),
  z.object({
    kind: z.literal("damage"),
    average: z.number().int().nonnegative(),
    expression: compiledDamageExpressionSchema,
    damageType: normalizedContentReferenceSchema,
    trigger: z.enum(["failed-save", "automatic"]),
    saveOnSuccess: z.enum(["half", "none"]).nullable(),
  }),
  z.object({
    kind: z.literal("apply-condition"),
    condition: normalizedContentReferenceSchema,
    trigger: z.enum(["failed-save", "hit", "automatic"]),
    duration: compiledEffectDurationSchema,
    repeatSave: z.object({
      timing: z.enum(["start-of-turn", "end-of-turn"]),
      ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
      dc: z.number().int().min(1).max(40),
      endsOnSuccess: z.literal(true),
    }).nullable(),
  }),
  z.object({
    kind: z.literal("area"),
    shape: z.enum(["cone", "cube", "cylinder", "line", "sphere"]),
    size: z.number().positive(),
    unit: z.string().min(1),
    width: z.number().positive().nullable(),
  }),
  z.object({
    kind: z.literal("attack-sequence"),
    steps: z.array(z.object({
      actionKey: z.string().min(1),
      attackContentKey: z.string().startsWith("open5e:creature-attack:"),
      name: z.string().min(1),
      count: z.number().int().positive().max(20),
    })).min(1),
  }),
]);

export const compiledEffectProgramSchema = z.object({
  kind: z.literal("effect-program"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  sourceType: z.enum(["creature-action", "spell"]),
  sourceActionKey: z.string().min(1).nullable(),
  sourceName: z.string().min(1),
  sourceDescription: z.string().min(1),
  sourceDescriptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  compilerVersion: z.literal("open5e-effect-compiler-v1"),
  usage: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("per-day"), uses: z.number().int().positive() }),
    z.object({
      kind: z.literal("recharge"),
      dieSides: z.literal(6),
      minimumRoll: z.number().int().min(2).max(6),
      maximumRoll: z.literal(6),
    }),
  ]).nullable(),
  operations: z.array(compiledEffectOperationSchema).min(1),
  executionMode: z.enum([
    "multiattack",
    "saving-throw-damage",
    "saving-throw-condition",
    "spell-area",
    "fragments",
  ]),
  hasDeferredProse: z.boolean(),
});

const compiledAbilityBonusesSchema = z.object({
  str: z.number().int().nonnegative(),
  dex: z.number().int().nonnegative(),
  con: z.number().int().nonnegative(),
  int: z.number().int().nonnegative(),
  wis: z.number().int().nonnegative(),
  cha: z.number().int().nonnegative(),
});

export const compiledSpeciesProfileSchema = z.object({
  kind: z.literal("species-profile"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  parent: normalizedContentReferenceSchema.nullable(),
  abilityBonuses: compiledAbilityBonusesSchema,
  abilityChoice: z.object({
    count: z.number().int().positive(),
    bonus: z.number().int().positive(),
    excluded: z.array(z.enum(["str", "dex", "con", "int", "wis", "cha"])),
  }).nullable(),
  size: z.enum(["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]),
  speedFeet: z.number().int().nonnegative(),
  languages: z.array(normalizedContentReferenceSchema),
  languageChoiceCount: z.number().int().nonnegative(),
  featureNames: z.array(z.string().min(1)),
  sourceTraitsSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const compiledClassProfileSchema = z.object({
  kind: z.literal("class-profile"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  hitDie: z.number().int().min(1).max(20),
  savingThrows: z.array(z.enum(["str", "dex", "con", "int", "wis", "cha"])).length(2),
  proficiencies: z.object({
    armor: z.array(z.string().min(1)),
    weapons: z.array(z.string().min(1)),
    tools: z.array(z.string().min(1)),
  }),
  toolChoice: z.object({ count: z.number().int().positive(), description: z.string().min(1) }).nullable(),
  skillChoice: z.object({
    count: z.number().int().positive(),
    options: z.array(normalizedContentReferenceSchema).min(1),
  }),
  levelOneFeatures: z.array(z.object({
    sourceKey: z.string().min(1),
    name: z.string().min(1),
  })),
  startingEquipmentDescription: z.string().min(1),
  sourceFeaturesSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const compiledBackgroundProfileSchema = z.object({
  kind: z.literal("background-profile"),
  fidelityTier: z.literal(2),
  ...normalizedProvenanceFields,
  sourceContentKey: z.string().min(1),
  skillProficiencies: z.array(normalizedContentReferenceSchema),
  skillChoice: z.object({
    count: z.number().int().positive(),
    options: z.array(normalizedContentReferenceSchema).min(1),
  }).nullable().default(null),
  fixedLanguages: z.array(normalizedContentReferenceSchema).default([]),
  languageChoiceCount: z.number().int().nonnegative(),
  toolProficiencies: z.array(z.string().min(1)).default([]),
  toolChoice: z.object({
    count: z.number().int().positive(),
    description: z.string().min(1),
    options: z.array(z.string().min(1)).default([]),
  }).nullable().default(null),
  startingCurrencyCopper: z.number().int().nonnegative(),
  startingItemSourceKeys: z.array(z.string().min(1)),
  startingEquipmentDescription: z.string().default(""),
  selectable: z.boolean().default(true),
  sourceBenefitsSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const compiledContentRecordSchema = z.union([
  compiledCurrencyTableSchema,
  compiledEquipmentEffectSchema,
  compiledCreatureAttackSchema,
  compiledSpellEffectSchema,
  compiledEffectProgramSchema,
  compiledSpeciesProfileSchema,
  compiledClassProfileSchema,
  compiledBackgroundProfileSchema,
]);

export type CompiledCurrencyTable = z.infer<typeof compiledCurrencyTableSchema>;
export type CompiledEquipmentEffect = z.infer<typeof compiledEquipmentEffectSchema>;
export type CompiledCreatureAttack = z.infer<typeof compiledCreatureAttackSchema>;
export type CompiledSpellEffect = z.infer<typeof compiledSpellEffectSchema>;
export type CompiledEffectDuration = z.infer<typeof compiledEffectDurationSchema>;
export type CompiledEffectOperation = z.infer<typeof compiledEffectOperationSchema>;
export type CompiledEffectProgram = z.infer<typeof compiledEffectProgramSchema>;
export type CompiledSpeciesProfile = z.infer<typeof compiledSpeciesProfileSchema>;
export type CompiledClassProfile = z.infer<typeof compiledClassProfileSchema>;
export type CompiledBackgroundProfile = z.infer<typeof compiledBackgroundProfileSchema>;
export type CompiledContentRecord = z.infer<typeof compiledContentRecordSchema>;

export const contentArtifactSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  recordCount: z.number().int().nonnegative(),
});

export const contentCollectionManifestSchema = z.object({
  sourceApiVersion: z.enum(["v1", "v2"]).optional(),
  endpoint: z.string().url(),
  sourceUrls: z.array(z.string().url()).min(1),
  raw: contentArtifactSchema,
  normalized: contentArtifactSchema,
  compiled: contentArtifactSchema,
});

export const contentDocumentInventorySchema = z.object({
  key: z.string().min(1),
  packRole: z.enum(["target", "taxonomy", "content", "raw-attribution"]),
  gamesystem: z.string().min(1),
  publisher: contentPublisherSchema,
  licenseKeys: z.array(z.string().min(1)).min(1),
  permalink: z.string().url(),
});

export const open5ePackManifestSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  packVersion: z.string().min(1),
  packHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetDocumentKey: z.string().min(1),
  taxonomyDocumentKey: z.string().min(1),
  gamesystems: z.array(z.string().min(1)).min(1),
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("document") }),
    z.object({
      kind: z.literal("corpus"),
      basePackHash: z.string().regex(/^[a-f0-9]{64}$/),
      defaultDocumentKey: z.string().min(1),
    }),
  ]).optional(),
  sourceApiVersion: z.literal("v2"),
  sourceFetchedAt: z.string().datetime({ offset: true }),
  collections: z.partialRecord(open5eCollectionSchema, contentCollectionManifestSchema)
    .refine((collections) => Object.keys(collections).length > 0, "A content pack needs at least one collection."),
  documents: z.array(contentDocumentInventorySchema).min(1),
  reports: z.object({
    attributionSha256: z.string().regex(/^[a-f0-9]{64}$/),
    coverageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
}).superRefine((manifest, context) => {
  if (manifest.schemaVersion === 2 && manifest.scope?.kind !== "corpus") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scope"],
      message: "Manifest schema version 2 requires an explicit corpus scope.",
    });
  }
  if (manifest.scope?.kind === "corpus" && manifest.scope.defaultDocumentKey !== manifest.targetDocumentKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scope", "defaultDocumentKey"],
      message: "The corpus default document must match the manifest target document.",
    });
  }
});

export type Open5ePackManifest = z.infer<typeof open5ePackManifestSchema>;
