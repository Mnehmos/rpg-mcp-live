import type {
  EngineAbility,
  EngineCombatant,
  EngineCombatantView,
  EngineEquipmentSlot,
  EngineItemChargeState,
  EngineItemOwnerRef,
  EngineItemProvenance,
  EngineSpellScrollDefinition,
  EngineItemTheftProvenance,
  EngineInventoryItem,
  EngineInventoryItemInput,
  EngineInventoryItemView,
  EngineItemDefinition,
  EngineItemKind,
  EngineSkill,
  EngineTacticalFootprint,
  EngineTacticalPosition,
} from "./engine-contracts.js";
import { engineItemTheftProvenanceSchema } from "./engine-contracts.js";
import {
  loadActiveRulesKernel,
  loadRulesKernelForPackHash,
  type Open5eEquipmentKernelRecord,
  type Open5eCreatureKernelRecord,
  type Open5eBackgroundKernelRecord,
  type Open5eClassKernelRecord,
  type Open5eSpellKernelRecord,
  type Open5eSpeciesKernelRecord,
} from "./content/rules-kernel.js";
import type {
  NormalizedAbility,
  NormalizedAlignment,
  NormalizedLanguage,
  NormalizedFeat,
  NormalizedSkill,
  NormalizedSpellList,
  NormalizedSpellProgression,
} from "./content/schema.js";

/**
 * The live engine uses Open5e as its rules/content reference, not as a
 * runtime narrator.  Campaign-authored content may extend these structures;
 * this module contains only the small, deterministic rules kernel needed by
 * the player loop.
 */
const rulesKernel = loadActiveRulesKernel();

export const OPEN5E_RULES_VERSION = rulesKernel.rulesVersion;
export const OPEN5E_RULES_PACK_HASH = rulesKernel.packHash;
export const OPEN5E_API_VERSION = rulesKernel.apiVersion;
export const OPEN5E_SOURCE_DOCUMENT = rulesKernel.sourceDocument;

export const REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY = "spell-scroll-cure-wounds-v1" as const;
export const REVIEWED_FIRST_LEVEL_SCROLL_CONTENT_KEY = "open5e:magic-item:5e-2014:srd-2014:srd_spell-scroll-1st-level" as const;
export const REVIEWED_CURE_WOUNDS_CONTENT_KEY = "open5e:spell:5e-2014:srd-2014:srd_cure-wounds" as const;

export const ENGINE_ABILITIES: EngineAbility[] = ["str", "dex", "con", "int", "wis", "cha"];

export const OPEN5E_SKILLS = rulesKernel.skills as Readonly<Record<string, EngineAbility>>;

export const OPEN5E_CURRENCY = rulesKernel.currency;

export interface Open5eClassPreset {
  hitDie: number;
  savingThrows: EngineAbility[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  startingFeatures: string[];
  startingEquipment: EngineInventoryItem[];
  spellcastingAbility?: EngineAbility;
}

export interface Open5eSpeciesPreset {
  abilityBonuses: Partial<Record<EngineAbility, number>>;
  size: string;
  speed: number;
  languages: string[];
  features: string[];
}

export const OPEN5E_CLASS_PRESETS: Record<string, Open5eClassPreset> = {
  barbarian: {
    hitDie: 12,
    savingThrows: ["str", "con"],
    armorProficiencies: ["light armor", "medium armor", "shields"],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    toolProficiencies: [],
    startingFeatures: ["Rage", "Unarmored Defense"],
    startingEquipment: [
      sourceItem("greataxe", "srd_greataxe", 1, "mainhand", true),
      sourceItem("handaxe", "srd_handaxe", 1, "offhand"),
    ],
  },
  fighter: {
    hitDie: 10,
    savingThrows: ["str", "con"],
    armorProficiencies: ["all armor", "shields"],
    weaponProficiencies: ["simple weapons", "martial weapons"],
    toolProficiencies: [],
    startingFeatures: ["Fighting Style", "Second Wind"],
    startingEquipment: [
      sourceItem("longsword", "srd_longsword", 1, "mainhand", true),
      sourceItem("chain-mail", "srd_chain-mail", 1, "armor", true),
      sourceItem("shield", "srd_shield", 1, "offhand", true),
    ],
  },
  rogue: {
    hitDie: 8,
    savingThrows: ["dex", "int"],
    armorProficiencies: ["light armor"],
    weaponProficiencies: ["simple weapons", "hand crossbows", "longswords", "rapiers", "shortswords"],
    toolProficiencies: ["thieves' tools"],
    startingFeatures: ["Expertise", "Sneak Attack", "Thieves' Cant"],
    startingEquipment: [
      sourceItem("rapier", "srd_rapier", 1, "mainhand", true),
      sourceItem("leather-armor", "srd_leather-armor", 1, "armor", true),
      sourceItem("thieves-tools", "srd_thieves-tools"),
    ],
  },
  wizard: {
    hitDie: 6,
    savingThrows: ["int", "wis"],
    armorProficiencies: [],
    weaponProficiencies: ["daggers", "darts", "slings", "quarterstaffs", "light crossbows"],
    toolProficiencies: [],
    startingFeatures: ["Spellcasting", "Arcane Recovery"],
    spellcastingAbility: "int",
    startingEquipment: [
      sourceItem("quarterstaff", "srd_quarterstaff", 1, "mainhand", true),
      sourceItem("spellbook", "srd_spellbook"),
    ],
  },
};

export const OPEN5E_SPECIES_PRESETS: Record<string, Open5eSpeciesPreset> = {
  human: {
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    size: "Medium",
    speed: 30,
    languages: ["Common"],
    features: ["Versatile"],
  },
  dwarf: {
    abilityBonuses: { con: 2 },
    size: "Medium",
    speed: 25,
    languages: ["Common", "Dwarvish"],
    features: ["Darkvision", "Dwarven Resilience", "Dwarven Combat Training"],
  },
  elf: {
    abilityBonuses: { dex: 2 },
    size: "Medium",
    speed: 30,
    languages: ["Common", "Elvish"],
    features: ["Darkvision", "Keen Senses", "Fey Ancestry", "Trance"],
  },
  halfling: {
    abilityBonuses: { dex: 2 },
    size: "Small",
    speed: 25,
    languages: ["Common", "Halfling"],
    features: ["Lucky", "Brave", "Halfling Nimbleness"],
  },
};

export const OPEN5E_DEFAULT_ABILITY_SCORES: Record<string, Record<EngineAbility, number>> = {
  barbarian: { str: 15, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
  bard: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
  cleric: { str: 12, dex: 10, con: 14, int: 8, wis: 15, cha: 13 },
  druid: { str: 8, dex: 12, con: 14, int: 13, wis: 15, cha: 10 },
  fighter: { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 },
  monk: { str: 10, dex: 15, con: 13, int: 8, wis: 14, cha: 12 },
  paladin: { str: 15, dex: 8, con: 13, int: 10, wis: 12, cha: 14 },
  ranger: { str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8 },
  rogue: { str: 10, dex: 15, con: 12, int: 12, wis: 10, cha: 10 },
  sorcerer: { str: 8, dex: 13, con: 14, int: 10, wis: 12, cha: 15 },
  warlock: { str: 8, dex: 13, con: 14, int: 12, wis: 10, cha: 15 },
  wizard: { str: 8, dex: 12, con: 10, int: 15, wis: 12, cha: 10 },
};

interface StarterItemSpec {
  sourceKey: string;
  quantity?: number;
  slot?: EngineEquipmentSlot;
  equipped?: boolean;
}

const OPEN5E_CLASS_STARTER_KITS: Record<string, StarterItemSpec[]> = {
  srd_barbarian: [
    { sourceKey: "srd_greataxe", slot: "mainhand", equipped: true },
    { sourceKey: "srd_handaxe", quantity: 2, slot: "offhand" },
    { sourceKey: "srd_javelin", quantity: 4 },
  ],
  srd_bard: [
    { sourceKey: "srd_rapier", slot: "mainhand", equipped: true },
    { sourceKey: "srd_leather-armor", slot: "armor", equipped: true },
    { sourceKey: "srd_dagger" },
    { sourceKey: "srd_lute" },
  ],
  srd_cleric: [
    { sourceKey: "srd_mace", slot: "mainhand", equipped: true },
    { sourceKey: "srd_scale-mail", slot: "armor", equipped: true },
    { sourceKey: "srd_shield", slot: "offhand", equipped: true },
    { sourceKey: "srd_crossbow-light" },
    { sourceKey: "srd_crossbow-bolt", quantity: 20 },
  ],
  srd_druid: [
    { sourceKey: "srd_scimitar", slot: "mainhand", equipped: true },
    { sourceKey: "srd_leather-armor", slot: "armor", equipped: true },
    { sourceKey: "srd_shield", slot: "offhand", equipped: true },
    { sourceKey: "srd_herbalism-kit" },
  ],
  srd_fighter: [
    { sourceKey: "srd_longsword", slot: "mainhand", equipped: true },
    { sourceKey: "srd_chain-mail", slot: "armor", equipped: true },
    { sourceKey: "srd_shield", slot: "offhand", equipped: true },
    { sourceKey: "srd_crossbow-light" },
    { sourceKey: "srd_crossbow-bolt", quantity: 20 },
  ],
  srd_monk: [
    { sourceKey: "srd_shortsword", slot: "mainhand", equipped: true },
    { sourceKey: "srd_dart", quantity: 10 },
  ],
  srd_paladin: [
    { sourceKey: "srd_longsword", slot: "mainhand", equipped: true },
    { sourceKey: "srd_chain-mail", slot: "armor", equipped: true },
    { sourceKey: "srd_shield", slot: "offhand", equipped: true },
    { sourceKey: "srd_javelin", quantity: 5 },
  ],
  srd_ranger: [
    { sourceKey: "srd_shortsword", slot: "mainhand", equipped: true },
    { sourceKey: "srd_shortsword", slot: "offhand" },
    { sourceKey: "srd_scale-mail", slot: "armor", equipped: true },
    { sourceKey: "srd_longbow" },
    { sourceKey: "srd_arrow-bow", quantity: 20 },
  ],
  srd_rogue: [
    { sourceKey: "srd_rapier", slot: "mainhand", equipped: true },
    { sourceKey: "srd_shortbow" },
    { sourceKey: "srd_arrow-bow", quantity: 20 },
    { sourceKey: "srd_leather-armor", slot: "armor", equipped: true },
    { sourceKey: "srd_dagger", quantity: 2 },
    { sourceKey: "srd_thieves-tools" },
  ],
  srd_sorcerer: [
    { sourceKey: "srd_crossbow-light", slot: "mainhand", equipped: true },
    { sourceKey: "srd_crossbow-bolt", quantity: 20 },
    { sourceKey: "srd_component-pouch" },
    { sourceKey: "srd_dagger", quantity: 2 },
  ],
  srd_warlock: [
    { sourceKey: "srd_crossbow-light", slot: "mainhand", equipped: true },
    { sourceKey: "srd_crossbow-bolt", quantity: 20 },
    { sourceKey: "srd_component-pouch" },
    { sourceKey: "srd_leather-armor", slot: "armor", equipped: true },
    { sourceKey: "srd_dagger", quantity: 2 },
  ],
  srd_wizard: [
    { sourceKey: "srd_quarterstaff", slot: "mainhand", equipped: true },
    { sourceKey: "srd_component-pouch" },
    { sourceKey: "srd_spellbook" },
  ],
};

export const OPEN5E_DEFAULT_TOOL_CHOICES: Record<string, string[]> = {
  srd_bard: ["lute", "flute", "drum"],
  srd_monk: ["smith's tools"],
};

const OPEN5E_GAMING_TOOL_CHOICES = [
  "Dice Set",
  "Dragonchess Set",
  "Playing Card Set",
  "Three-Dragon Ante Set",
];

const OPEN5E_MUSICAL_TOOL_CHOICES = [
  "Bagpipes",
  "Drum",
  "Dulcimer",
  "Flute",
  "Lute",
  "Lyre",
  "Horn",
  "Pan Flute",
  "Shawm",
  "Viol",
];

const OPEN5E_ARTISAN_TOOL_CHOICES = [
  "Alchemist's Supplies",
  "Brewer's Supplies",
  "Calligrapher's Supplies",
  "Carpenter's Tools",
  "Cartographer's Tools",
  "Cobbler's Tools",
  "Cook's Utensils",
  "Glassblower's Tools",
  "Jeweler's Tools",
  "Leatherworker's Tools",
  "Mason's Tools",
  "Painter's Supplies",
  "Potter's Tools",
  "Smith's Tools",
  "Tinker's Tools",
  "Weaver's Tools",
  "Woodcarver's Tools",
];

const OPEN5E_KIT_TOOL_CHOICES = [
  "Disguise Kit",
  "Forgery Kit",
  "Herbalism Kit",
  "Navigator's Tools",
  "Poisoner's Kit",
  "Thieves' Tools",
];

const OPEN5E_VEHICLE_TOOL_CHOICES = ["Vehicles (Land)", "Vehicles (Water)"];

export const OPEN5E_TOOL_PROFICIENCY_CATALOG = [
  ...OPEN5E_ARTISAN_TOOL_CHOICES,
  ...OPEN5E_GAMING_TOOL_CHOICES,
  ...OPEN5E_KIT_TOOL_CHOICES,
  ...OPEN5E_MUSICAL_TOOL_CHOICES,
  ...OPEN5E_VEHICLE_TOOL_CHOICES,
];

export function open5eToolChoiceOptions(
  choice: { description: string; options?: readonly string[] } | null | undefined
): string[] {
  if (!choice) return [];
  const explicitOptions = (choice.options ?? []).filter(Boolean);
  if (explicitOptions.length > 0) return [...explicitOptions];
  const description = choice.description.toLocaleLowerCase("en-US");
  if (description.includes("gaming set")) return [...OPEN5E_GAMING_TOOL_CHOICES];
  if (description.includes("musical instrument")) return [...OPEN5E_MUSICAL_TOOL_CHOICES];
  if (description.includes("artisan") || description.includes("artisan's tools")) {
    return [...OPEN5E_ARTISAN_TOOL_CHOICES];
  }
  if (description.includes("thieves' tools")) return ["Thieves' Tools"];
  return [...OPEN5E_TOOL_PROFICIENCY_CATALOG];
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor(Math.max(0, level - 1) / 4);
}

export function currencyFromCopper(copper: number): {
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
  totalCopper: number;
} {
  const totalCopper = Math.max(0, Math.trunc(copper));
  const platinum = Math.floor(totalCopper / OPEN5E_CURRENCY.copperPerPlatinum);
  const afterPlatinum = totalCopper % OPEN5E_CURRENCY.copperPerPlatinum;
  const gold = Math.floor(afterPlatinum / OPEN5E_CURRENCY.copperPerGold);
  const afterGold = afterPlatinum % OPEN5E_CURRENCY.copperPerGold;
  const electrum = Math.floor(afterGold / OPEN5E_CURRENCY.copperPerElectrum);
  const afterElectrum = afterGold % OPEN5E_CURRENCY.copperPerElectrum;
  const silver = Math.floor(afterElectrum / OPEN5E_CURRENCY.copperPerSilver);
  return {
    copper: afterElectrum % OPEN5E_CURRENCY.copperPerSilver,
    silver,
    electrum,
    gold,
    platinum,
    totalCopper,
  };
}

export function copperFromDenominations(gold: number, silver: number, copper: number): number {
  return Math.max(0, Math.trunc(gold)) * OPEN5E_CURRENCY.copperPerGold
    + Math.max(0, Math.trunc(silver)) * OPEN5E_CURRENCY.copperPerSilver
    + Math.max(0, Math.trunc(copper)) * OPEN5E_CURRENCY.copperPerCopper;
}

export function buildSkillSheet(
  abilities: Record<EngineAbility, number>,
  proficientSkills: string[],
  level: number
): Record<string, EngineSkill> {
  const bonus = proficiencyBonus(level);
  return Object.fromEntries(
    Object.entries(OPEN5E_SKILLS).map(([skill, ability]) => [skill, {
        ability,
        proficient: proficientSkills.includes(skill),
        expertise: false,
        bonus: abilityModifier(abilities[ability]) + (proficientSkills.includes(skill) ? bonus : 0),
      }])
  ) as Record<string, EngineSkill>;
}

export function buildSavingThrows(
  abilities: Record<EngineAbility, number>,
  savingThrows: EngineAbility[],
  level: number
): Record<EngineAbility, number> {
  const bonus = proficiencyBonus(level);
  return Object.fromEntries(
    ENGINE_ABILITIES.map((ability) => [
      ability,
      abilityModifier(abilities[ability]) + (savingThrows.includes(ability) ? bonus : 0),
    ])
  ) as Record<EngineAbility, number>;
}

export function carryCapacity(abilityStrength: number): number {
  return Math.max(0, abilityStrength) * 15;
}

export function normalizeInventoryItem(
  item: EngineInventoryItem | EngineInventoryItemInput | Record<string, unknown>
): EngineInventoryItem {
  const raw = item as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) throw new Error("An inventory item requires an instance id.");
  const quantity = Math.max(0, Math.trunc(typeof raw.quantity === "number" ? raw.quantity : 1));
  const instance: EngineInventoryItem = {
    id,
    runtimeContentInstanceId: typeof raw.runtimeContentInstanceId === "string" && raw.runtimeContentInstanceId.trim()
      ? raw.runtimeContentInstanceId.trim()
      : undefined,
    quantity,
    slot: isEquipmentSlot(raw.slot) ? raw.slot : undefined,
    equipped: raw.equipped === true,
    attuned: raw.attuned === true,
  };
  const ownerRef = normalizeOwnerRef(raw.ownerRef);
  const containerRef = typeof raw.containerRef === "string" && raw.containerRef.trim()
    ? raw.containerRef.trim()
    : undefined;
  const charges = normalizeChargeState(raw.charges);
  const suppliedProvenance = normalizeItemProvenance(raw.provenance);
  const theftProvenance = normalizeItemTheftProvenance(raw.theftProvenance);
  if (typeof raw.contentKey === "string" && raw.contentKey.trim()) {
    const contentKey = raw.contentKey.trim();
    const packHash = typeof raw.packHash === "string" && raw.packHash.trim()
      ? raw.packHash.trim()
      : rulesKernel.packHash;
    requireOpen5eEquipment(contentKey, packHash);
    return compactItem({
      ...instance,
      contentKey,
      packHash,
      ownerRef,
      containerRef,
      charges,
      provenance: suppliedProvenance ?? { kind: "open5e" },
      theftProvenance,
    });
  }

  const authored = isRecord(raw.authoredDefinition)
    ? normalizeAuthoredDefinition(raw.authoredDefinition)
    : normalizeLegacyDefinition(raw);
  const authoredCharges = charges ?? defaultChargesForDefinition(authored);
  return compactItem({
    ...instance,
    authoredDefinition: authored,
    ownerRef,
    containerRef,
    charges: authoredCharges,
    provenance: suppliedProvenance ?? { kind: "authored" },
    theftProvenance,
  });
}

export function materializeInventoryItem(item: EngineInventoryItem): EngineInventoryItemView {
  const instance = normalizeInventoryItem(item);
  if (instance.contentKey) {
    const source = requireOpen5eEquipment(instance.contentKey, instance.packHash);
    const definition = definitionFromOpen5e(source);
    return {
      ...instance,
      ...definition,
      definitionSource: "open5e",
      mechanicsStatus: source.effectiveTier === 2 ? "compiled" : "typed",
    };
  }
  if (!instance.authoredDefinition) {
    throw new Error(`Authored inventory item ${instance.id} has no definition.`);
  }
  return {
    ...instance,
    ...instance.authoredDefinition,
    definitionSource: "authored",
    mechanicsStatus: "authored",
  };
}

export function materializeInventory(inventory: EngineInventoryItem[]): EngineInventoryItemView[] {
  return inventory.map(materializeInventoryItem);
}

export function createOpen5eInventoryItem(
  id: string,
  contentKey: string,
  quantity = 1,
  slot?: EngineEquipmentSlot,
  equipped = false
): EngineInventoryItem {
  return normalizeInventoryItem({ id, contentKey, quantity, slot, equipped });
}

export function getOpen5eEquipment(contentKey: string, packHash?: string): Open5eEquipmentKernelRecord | null {
  return kernelForPackHash(packHash)?.equipment[contentKey] ?? null;
}

export function getOpen5eCreature(contentKey: string, packHash?: string): Open5eCreatureKernelRecord | null {
  return kernelForPackHash(packHash)?.creatures[contentKey] ?? null;
}

export function getOpen5eSpell(contentKey: string, packHash?: string): Open5eSpellKernelRecord | null {
  return kernelForPackHash(packHash)?.spells[contentKey] ?? null;
}

export function getOpen5eSpecies(contentKey: string, packHash?: string): Open5eSpeciesKernelRecord | null {
  return kernelForPackHash(packHash)?.species[contentKey] ?? null;
}

export function getOpen5eClass(contentKey: string, packHash?: string): Open5eClassKernelRecord | null {
  return kernelForPackHash(packHash)?.classes[contentKey] ?? null;
}

export function getOpen5eBackground(contentKey: string, packHash?: string): Open5eBackgroundKernelRecord | null {
  return kernelForPackHash(packHash)?.backgrounds[contentKey] ?? null;
}

export function getOpen5eFeat(contentKey: string, packHash?: string): NormalizedFeat | null {
  return kernelForPackHash(packHash)?.feats[contentKey] ?? null;
}

export function getOpen5eAlignment(contentKey: string, packHash?: string): NormalizedAlignment | null {
  return kernelForPackHash(packHash)?.alignments[contentKey] ?? null;
}

export function getOpen5eLanguage(contentKey: string, packHash?: string): NormalizedLanguage | null {
  return kernelForPackHash(packHash)?.languages[contentKey] ?? null;
}

export function getOpen5eSkill(contentKey: string, packHash?: string): NormalizedSkill | null {
  return kernelForPackHash(packHash)?.skillDefinitions[contentKey] ?? null;
}

export function requireOpen5eSpecies(contentKey: string, packHash?: string): Open5eSpeciesKernelRecord {
  const record = getOpen5eSpecies(contentKey, packHash);
  if (!record) throw new Error(`Open5e species is not installed: ${contentKey}.`);
  return record;
}

export function requireOpen5eClass(contentKey: string, packHash?: string): Open5eClassKernelRecord {
  const record = getOpen5eClass(contentKey, packHash);
  if (!record) throw new Error(`Open5e class is not installed: ${contentKey}.`);
  return record;
}

export function requireOpen5eBackground(contentKey: string, packHash?: string): Open5eBackgroundKernelRecord {
  const record = getOpen5eBackground(contentKey, packHash);
  if (!record) throw new Error(`Open5e background is not installed: ${contentKey}.`);
  return record;
}

export function requireOpen5eAlignment(contentKey: string, packHash?: string): NormalizedAlignment {
  const record = getOpen5eAlignment(contentKey, packHash);
  if (!record) throw new Error(`Open5e alignment is not installed: ${contentKey}.`);
  return record;
}

export function requireOpen5eLanguage(contentKey: string, packHash?: string): NormalizedLanguage {
  const record = getOpen5eLanguage(contentKey, packHash);
  if (!record) throw new Error(`Open5e language is not installed: ${contentKey}.`);
  return record;
}

export function requireOpen5eSkill(contentKey: string, packHash?: string): NormalizedSkill {
  const record = getOpen5eSkill(contentKey, packHash);
  if (!record) throw new Error(`Open5e skill is not installed: ${contentKey}.`);
  return record;
}

export function open5eCharacterContentKey(
  kind: "species" | "class" | "background" | "alignment" | "language",
  sourceKey: string
): string {
  const collections = {
    species: rulesKernel.species,
    class: rulesKernel.classes,
    background: rulesKernel.backgrounds,
    alignment: rulesKernel.alignments,
    language: rulesKernel.languages,
  } as const;
  const record = Object.values(collections[kind]).find((candidate) => candidate.sourceKey === sourceKey);
  if (!record) throw new Error(`Open5e ${kind} source is not installed: ${sourceKey}.`);
  return record.contentKey;
}

export interface Open5eCharacterReferenceOption {
  contentKey: string;
  sourceKey: string;
  name: string;
}

export interface Open5eSpeciesOption extends Open5eCharacterReferenceOption {
  description: string;
  isSubspecies: boolean;
  parentSourceKey: string | null;
  requiresSubspecies: boolean;
  selectable: boolean;
  abilityBonuses: Record<EngineAbility, number>;
  abilityChoice: { count: number; bonus: number; excluded: EngineAbility[] } | null;
  size: string;
  speedFeet: number;
  fixedLanguages: Open5eCharacterReferenceOption[];
  languageChoiceCount: number;
  featureNames: string[];
}

export interface Open5eClassOption extends Open5eCharacterReferenceOption {
  description: string;
  isSubclass: boolean;
  subclassOf: { contentKey: string; sourceKey: string; name: string } | null;
  selectable: boolean;
  hitDie: number | null;
  savingThrows: EngineAbility[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[] } | null;
  toolChoice: { count: number; description: string; options: string[] } | null;
  defaultToolChoices: string[];
  skillChoice: { count: number; options: Array<Open5eCharacterReferenceOption & { engineKey: string; ability: EngineAbility }> } | null;
  levelOneFeatures: Array<{ sourceKey: string; name: string }>;
  startingEquipmentDescription: string | null;
}

export interface Open5eBackgroundOption extends Open5eCharacterReferenceOption {
  description: string;
  skillProficiencies: Array<Open5eCharacterReferenceOption & { engineKey: string; ability: EngineAbility }>;
  skillChoice: {
    count: number;
    options: Array<Open5eCharacterReferenceOption & { engineKey: string; ability: EngineAbility }>;
  } | null;
  fixedLanguages: Open5eCharacterReferenceOption[];
  languageChoiceCount: number;
  toolProficiencies: string[];
  toolChoice: { count: number; description: string; options: string[] } | null;
  startingCurrencyCopper: number;
  startingEquipmentDescription: string;
  selectable: boolean;
  benefits: Array<{ name: string; description: string; benefitType: string }>;
}

export interface Open5eCharacterOptions {
  rulesVersion: string;
  packHash: string;
  species: Open5eSpeciesOption[];
  classes: Open5eClassOption[];
  backgrounds: Open5eBackgroundOption[];
  alignments: Array<Pick<NormalizedAlignment, "contentKey" | "sourceKey" | "name" | "shortName" | "description">>;
  languages: Array<Pick<NormalizedLanguage, "contentKey" | "sourceKey" | "name" | "description" | "isExotic" | "isSecret"> & { selectable: boolean }>;
  abilities: Array<Pick<NormalizedAbility, "contentKey" | "sourceKey" | "name" | "abbreviation" | "shortDescription">>;
}

export interface Open5eCharacterOptionPolicy {
  gamesystem: string;
  allowedDocuments: readonly string[];
  allowedLicenses: readonly string[];
}

export function open5eCharacterOptions(policy?: Open5eCharacterOptionPolicy): Open5eCharacterOptions {
  const speciesWithChildren = new Set(
    Object.values(rulesKernel.species)
      .map((entry) => entry.definition.subspeciesOfSourceKey)
      .filter((sourceKey): sourceKey is string => Boolean(sourceKey))
  );
  return {
    rulesVersion: rulesKernel.rulesVersion,
    packHash: rulesKernel.packHash,
    species: Object.values(rulesKernel.species)
      .filter((entry) => optionAllowed(entry, policy))
      .map((entry) => ({
        contentKey: entry.contentKey,
        sourceKey: entry.sourceKey,
        name: entry.definition.name,
        description: entry.definition.description,
        isSubspecies: entry.definition.isSubspecies,
        parentSourceKey: entry.definition.subspeciesOfSourceKey,
        requiresSubspecies: speciesWithChildren.has(entry.sourceKey),
        selectable: !speciesWithChildren.has(entry.sourceKey),
        abilityBonuses: entry.profile.abilityBonuses,
        abilityChoice: entry.profile.abilityChoice,
        size: entry.profile.size,
        speedFeet: entry.profile.speedFeet,
        fixedLanguages: entry.profile.languages.map((language) => ({
          contentKey: language.contentKey,
          sourceKey: language.sourceKey,
          name: language.name,
        })),
        languageChoiceCount: entry.profile.languageChoiceCount,
        featureNames: entry.profile.featureNames,
      }))
      .sort(compareCharacterOption),
    classes: Object.values(rulesKernel.classes)
      .filter((entry) => optionAllowed(entry, policy))
      .map((entry) => ({
        contentKey: entry.contentKey,
        sourceKey: entry.sourceKey,
        name: entry.definition.name,
        description: entry.definition.description,
        isSubclass: entry.definition.isSubclass,
        subclassOf: entry.definition.subclassOf,
        selectable: entry.profile !== null,
        hitDie: entry.profile?.hitDie ?? null,
        savingThrows: entry.profile?.savingThrows ?? [],
        proficiencies: entry.profile?.proficiencies ?? null,
        toolChoice: entry.profile?.toolChoice
          ? {
              ...entry.profile.toolChoice,
              options: open5eToolChoiceOptions(entry.profile.toolChoice),
            }
          : null,
        defaultToolChoices: OPEN5E_DEFAULT_TOOL_CHOICES[entry.sourceKey] ?? [],
        skillChoice: entry.profile
          ? {
              count: entry.profile.skillChoice.count,
              options: entry.profile.skillChoice.options.map((option) => {
                const skill = requireOpen5eSkill(option.contentKey);
                return { ...option, engineKey: skill.engineKey, ability: skill.ability };
              }),
            }
          : null,
        levelOneFeatures: entry.profile?.levelOneFeatures ?? [],
        startingEquipmentDescription: entry.profile?.startingEquipmentDescription ?? null,
      }))
      .sort(compareCharacterOption),
    backgrounds: Object.values(rulesKernel.backgrounds)
      .filter((entry) => optionAllowed(entry, policy))
      .map((entry) => ({
        contentKey: entry.contentKey,
        sourceKey: entry.sourceKey,
        name: entry.definition.name,
        description: entry.definition.description,
        skillProficiencies: entry.profile.skillProficiencies.map((reference) => {
          const skill = requireOpen5eSkill(reference.contentKey);
          return { ...reference, engineKey: skill.engineKey, ability: skill.ability };
        }),
        skillChoice: entry.profile.skillChoice
          ? {
              count: entry.profile.skillChoice.count,
              options: entry.profile.skillChoice.options.map((reference) => {
                const skill = requireOpen5eSkill(reference.contentKey);
                return { ...reference, engineKey: skill.engineKey, ability: skill.ability };
              }),
            }
          : null,
        fixedLanguages: entry.profile.fixedLanguages,
        languageChoiceCount: entry.profile.languageChoiceCount,
        toolProficiencies: entry.profile.toolProficiencies,
        toolChoice: entry.profile.toolChoice
          ? {
              ...entry.profile.toolChoice,
              options: open5eToolChoiceOptions(entry.profile.toolChoice),
            }
          : null,
        startingCurrencyCopper: entry.profile.startingCurrencyCopper,
        startingEquipmentDescription: entry.profile.startingEquipmentDescription,
        selectable: entry.profile.selectable,
        benefits: entry.definition.benefits,
      }))
      .sort(compareCharacterOption),
    alignments: Object.values(rulesKernel.alignments)
      .map((entry) => ({
        contentKey: entry.contentKey,
        sourceKey: entry.sourceKey,
        name: entry.name,
        shortName: entry.shortName,
        description: entry.description,
      }))
      .sort(compareCharacterOption),
    languages: Object.values(rulesKernel.languages)
      .map((entry) => ({
        contentKey: entry.contentKey,
        sourceKey: entry.sourceKey,
        name: entry.name,
        description: entry.description,
        isExotic: entry.isExotic,
        isSecret: entry.isSecret,
        selectable: !entry.isSecret,
      }))
      .sort(compareCharacterOption),
    abilities: Object.values(rulesKernel.abilities)
      .map((entry) => ({
        contentKey: entry.contentKey,
        sourceKey: entry.sourceKey,
        name: entry.name,
        abbreviation: entry.abbreviation,
        shortDescription: entry.shortDescription,
      }))
      .sort(compareCharacterOption),
  };
}

function optionAllowed(
  entry: { definition: { gamesystem: string; documentKey: string; licenseKeys: string[] } },
  policy?: Open5eCharacterOptionPolicy
): boolean {
  if (!policy) return true;
  return entry.definition.gamesystem === policy.gamesystem
    && policy.allowedDocuments.includes(entry.definition.documentKey)
    && entry.definition.licenseKeys.some((license) => policy.allowedLicenses.includes(license));
}

export function createOpen5eStarterInventory(
  classSourceKey: string,
  background?: Open5eBackgroundKernelRecord | null
): EngineInventoryItem[] {
  const starterKit = OPEN5E_CLASS_STARTER_KITS[classSourceKey];
  if (!starterKit) throw new Error(`No reviewed starter-kit policy is installed for ${classSourceKey}.`);
  const itemSpecs: StarterItemSpec[] = [
    { sourceKey: "srd_bedroll" },
    { sourceKey: "srd_rations-1-day", quantity: 2 },
    ...starterKit,
    ...(background?.profile.startingItemSourceKeys.map((sourceKey) => ({ sourceKey })) ?? []),
  ];
  const occurrences = new Map<string, number>();
  return itemSpecs.map((spec) => {
    const occurrence = (occurrences.get(spec.sourceKey) ?? 0) + 1;
    occurrences.set(spec.sourceKey, occurrence);
    const baseId = spec.sourceKey.replace(/^srd_/, "").replace(/[^a-z0-9]+/g, "-");
    const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
    return createOpen5eInventoryItem(
      id,
      open5eItemContentKey(spec.sourceKey),
      spec.quantity ?? 1,
      spec.slot,
      spec.equipped ?? false
    );
  });
}

export function defaultOpen5eLanguages(
  fixedContentKeys: string[],
  choiceCount: number
): NormalizedLanguage[] {
  const fixed = fixedContentKeys.map((contentKey) => requireOpen5eLanguage(contentKey));
  const fixedKeys = new Set(fixed.map((language) => language.contentKey));
  const choices = Object.values(rulesKernel.languages)
    .filter((language) => !language.isSecret && !language.isExotic && !fixedKeys.has(language.contentKey))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, choiceCount);
  if (choices.length !== choiceCount) throw new Error(`The installed pack cannot satisfy ${choiceCount} language choices.`);
  return [...fixed, ...choices];
}

function compareCharacterOption(left: { name: string; sourceKey: string }, right: { name: string; sourceKey: string }): number {
  return left.name.localeCompare(right.name) || left.sourceKey.localeCompare(right.sourceKey);
}

export function requireOpen5eSpell(contentKey: string, packHash?: string): Open5eSpellKernelRecord {
  const record = getOpen5eSpell(contentKey, packHash);
  if (!record) throw new Error(`Open5e spell is not installed: ${contentKey}.`);
  return record;
}

export function getOpen5eSpellList(className: string, packHash?: string): NormalizedSpellList | null {
  return kernelForPackHash(packHash)?.spellLists[open5eClassSourceKey(className)] ?? null;
}

export function getOpen5eSpellProgression(className: string, packHash?: string): NormalizedSpellProgression | null {
  return kernelForPackHash(packHash)?.spellProgressions[open5eClassSourceKey(className)] ?? null;
}

export function open5eSpellSlots(className: string, characterLevel: number, packHash?: string): Record<string, number> {
  const progression = getOpen5eSpellProgression(className, packHash);
  if (!progression) return {};
  const level = Math.max(1, Math.min(20, Math.trunc(characterLevel)));
  const row = progression.levels[level - 1];
  if (!row) throw new Error(`Open5e spell progression ${progression.contentKey} is missing level ${level}.`);
  return Object.fromEntries(Object.entries(row.slots).filter(([, count]) => count > 0));
}

export function open5eClassSourceKey(className: string): string {
  const normalized = className.trim().toLocaleLowerCase("en-US").replaceAll(" ", "-");
  return normalized.startsWith("srd_") ? normalized : `srd_${normalized}`;
}

export function createOpen5eCombatant(
  contentKey: string,
  id: string,
  distanceFeet = 30,
  position: EngineTacticalPosition = {
    frameId: "legacy",
    x: Math.max(1, Math.ceil(Math.max(0, distanceFeet) / 5)),
    y: 0,
    z: 0,
  }
): EngineCombatant {
  const source = requireOpen5eCreature(contentKey);
  const sizeName = source.definition.size.name.trim().toLocaleLowerCase("en-US");
  const footprint: EngineTacticalFootprint = sizeName === "large"
    ? { width: 2, height: 2 }
    : { width: 1, height: 1 };
  const actionResources = Object.fromEntries(
    source.effects
      .filter((program) => program.sourceActionKey && program.usage)
      .map((program) => {
        const usage = program.usage!;
        return [program.sourceActionKey as string, usage.kind === "per-day"
          ? {
              kind: "per-day" as const,
              usesRemaining: usage.uses,
              available: usage.uses > 0,
              rechargeMinimum: null,
              lastRechargeRound: null,
            }
          : {
              kind: "recharge" as const,
              usesRemaining: null,
              available: true,
              rechargeMinimum: usage.minimumRoll,
              lastRechargeRound: null,
            }];
      })
  );
  return {
    id,
    contentKey,
    packHash: rulesKernel.packHash,
    hp: source.definition.hitPoints,
    alive: source.definition.hitPoints > 0,
    position,
    footprint,
    distanceFeet: Math.max(0, distanceFeet),
    conditions: [],
    actionResources,
    progression: null,
  };
}

export function materializeCombatant(combatant: EngineCombatant): EngineCombatantView {
  const source = requireOpen5eCreature(combatant.contentKey, combatant.packHash);
  const creature = source.definition;
  const progression = combatant.progression;
  const attackBonusDelta = progression?.modifications.attackBonus ?? 0;
  const damageBonusDelta = progression?.modifications.damageBonus ?? 0;
  const attacks = source.attacks.map((attack) => ({
    ...attack,
    toHit: attack.toHit + attackBonusDelta,
    damage: {
      ...attack.damage,
      average: attack.damage.average + damageBonusDelta,
      bonus: attack.damage.bonus + damageBonusDelta,
    },
  }));
  return {
    ...combatant,
    name: creature.name,
    maxHp: progression?.revised.maxHp ?? creature.hitPoints,
    armorClass: progression?.revised.armorClass ?? creature.armorClass,
    challengeRating: progression?.revised.challengeRating ?? creature.challengeRating,
    experiencePoints: progression?.revised.experiencePoints ?? creature.experiencePoints,
    creatureType: creature.creatureType,
    size: creature.size,
    abilities: creature.abilities,
    abilityModifiers: creature.abilityModifiers,
    savingThrows: creature.savingThrows,
    savingThrowsAll: creature.savingThrowsAll,
    skillBonuses: creature.skillBonuses,
    skillBonusesAll: creature.skillBonusesAll,
    passivePerception: creature.passivePerception,
    speed: creature.speed,
    senses: creature.senses,
    languages: creature.languages,
    defenses: creature.defenses,
    actions: creature.actions,
    attacks,
    effectPrograms: source.effects,
    traits: creature.traits,
    environments: creature.environments,
    mechanicsStatus: source.effects.some((program) => program.executionMode !== "fragments")
      ? "effect-programs-compiled"
      : source.attacks.length
        ? "basic-attacks-compiled"
        : "typed-statblock",
  };
}

export function materializeCombatants(combatants: EngineCombatant[]): EngineCombatantView[] {
  return combatants.map(materializeCombatant);
}

export function open5eItemContentKey(sourceKey: string): string {
  return `open5e:item:${rulesKernel.gamesystem}:${rulesKernel.sourceDocument}:${sourceKey}`;
}

function sourceItem(
  id: string,
  sourceKey: string,
  quantity = 1,
  slot?: EngineEquipmentSlot,
  equipped = false
): EngineInventoryItem {
  return createOpen5eInventoryItem(
    id,
    open5eItemContentKey(sourceKey),
    quantity,
    slot,
    equipped
  );
}

function requireOpen5eEquipment(contentKey: string, packHash?: string): Open5eEquipmentKernelRecord {
  const record = getOpen5eEquipment(contentKey, packHash);
  if (!record) throw new Error(`Open5e equipment is not installed: ${contentKey}.`);
  return record;
}

function requireOpen5eCreature(contentKey: string, packHash?: string): Open5eCreatureKernelRecord {
  const record = getOpen5eCreature(contentKey, packHash);
  if (!record) throw new Error(`Open5e creature is not installed: ${contentKey}.`);
  return record;
}

function kernelForPackHash(packHash?: string) {
  return packHash ? loadRulesKernelForPackHash(packHash) : rulesKernel;
}

function definitionFromOpen5e(record: Open5eEquipmentKernelRecord): EngineItemDefinition {
  const properties = new Set<string>();
  for (const property of record.weapon?.properties ?? []) {
    properties.add((property.type ?? property.name).toLocaleLowerCase("en-US").replaceAll(" ", "-"));
  }
  if (record.armor) properties.add(record.armor.category);
  if (record.effects.some((effect) => effect.stackingKey === "shield")) properties.add("shield");
  return {
    name: record.name,
    kind: itemKindFromOpen5e(record),
    weight: record.weight,
    description: record.description,
    attunementRequired: record.requiresAttunement,
    valueCopper: record.valueCopper ?? undefined,
    properties: [...properties],
    damage: record.weapon
      ? `${record.weapon.damageDice} ${record.weapon.damageTypeName.toLocaleLowerCase("en-US")}`
      : undefined,
    armorClass: record.armor?.base
      ?? record.effects.find((effect) => effect.kind === "armor-class-bonus")?.value,
    armorProfile: record.armor
      ? {
          category: record.armor.category,
          base: record.armor.base,
          addDexterityModifier: record.armor.addDexterityModifier,
          dexterityModifierCap: record.armor.dexterityModifierCap,
          grantsStealthDisadvantage: record.armor.grantsStealthDisadvantage,
          strengthScoreRequired: record.armor.strengthScoreRequired,
        }
      : undefined,
    isMagic: record.isMagic,
    rarity: record.rarity ?? undefined,
    mechanicsTier: record.effectiveTier,
  };
}

function itemKindFromOpen5e(record: Open5eEquipmentKernelRecord): EngineItemKind {
  if (record.weapon) return "weapon";
  if (record.armor || record.effects.some((effect) => effect.stackingKey === "shield")) return "armor";
  if (record.categoryKey === "ammunition") return "ammunition";
  if (record.categoryKey === "tools") return "tool";
  if (record.categoryKey === "trade-good") return "treasure";
  if (record.categoryKey === "potion" || record.categoryKey === "poison") return "consumable";
  return "misc";
}

function normalizeAuthoredDefinition(raw: Record<string, unknown>): EngineItemDefinition {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new Error("An authored inventory item requires a name.");
  const kind = isItemKind(raw.kind) ? raw.kind : "misc";
  const weight = typeof raw.weight === "number" && Number.isFinite(raw.weight)
    ? Math.max(0, raw.weight)
    : 0;
  const effectKey = raw.effectKey === "lantern-ward-v1"
    ? "lantern-ward-v1"
    : raw.effectKey === REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY
      ? REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY
      : undefined;
  return {
    name,
    kind,
    weight,
    healing: finiteNonnegativeInteger(raw.healing),
    description: typeof raw.description === "string" ? raw.description : "",
    attunementRequired: effectKey === REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY ? false : raw.attunementRequired === true,
    valueCopper: finiteNonnegativeInteger(raw.valueCopper) ?? 0,
    properties: Array.isArray(raw.properties)
      ? raw.properties.filter((value): value is string => typeof value === "string")
      : [],
    damage: typeof raw.damage === "string" ? raw.damage : undefined,
    armorClass: finiteNonnegativeInteger(raw.armorClass),
    containerCapacity: typeof raw.containerCapacity === "number" && Number.isFinite(raw.containerCapacity)
      ? Math.max(0, raw.containerCapacity)
      : undefined,
    ammunitionId: typeof raw.ammunitionId === "string" && raw.ammunitionId.trim() ? raw.ammunitionId.trim() : undefined,
    effectKey,
    spellScroll: effectKey === REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY
      ? reviewedCureWoundsScrollDefinition(raw.spellScroll)
      : undefined,
    isMagic: effectKey === REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY || raw.isMagic === true,
    mechanicsTier: raw.mechanicsTier === 0 || raw.mechanicsTier === 1 || raw.mechanicsTier === 2
      ? raw.mechanicsTier
      : 2,
  };
}

function reviewedCureWoundsScrollDefinition(value: unknown): EngineSpellScrollDefinition {
  const persisted = isRecord(value) ? value : null;
  const packHash = typeof persisted?.packHash === "string" && /^[a-f0-9]{64}$/.test(persisted.packHash)
    ? persisted.packHash
    : rulesKernel.packHash;
  return {
    policyRevision: "spell-scroll-v1",
    sourceItemContentKey: REVIEWED_FIRST_LEVEL_SCROLL_CONTENT_KEY,
    spellContentKey: REVIEWED_CURE_WOUNDS_CONTENT_KEY,
    packHash,
    activationPolicy: "class-list-v1",
  };
}

function normalizeLegacyDefinition(raw: Record<string, unknown>): EngineItemDefinition {
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new Error("An inventory item requires either an Open5e content key or an authored definition.");
  }
  return normalizeAuthoredDefinition(raw);
}

function compactItem(item: EngineInventoryItem): EngineInventoryItem {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined && value !== false)
  ) as unknown as EngineInventoryItem;
}

function normalizeOwnerRef(value: unknown): EngineItemOwnerRef | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if ((kind !== "actor" && kind !== "merchant" && kind !== "world") || !id) return undefined;
  return { kind, id };
}

function normalizeItemProvenance(value: unknown): EngineItemProvenance | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  if (kind !== "starter" && kind !== "loot" && kind !== "merchant" && kind !== "authored" && kind !== "open5e") return undefined;
  const sourceId = typeof value.sourceId === "string" && value.sourceId.trim() ? value.sourceId.trim() : undefined;
  return { kind, ...(sourceId ? { sourceId } : {}) };
}

function normalizeItemTheftProvenance(value: unknown): EngineItemTheftProvenance[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Inventory theft provenance must be an append-only record list.");
  const records = value.map((candidate) => engineItemTheftProvenanceSchema.parse(candidate));
  return records.length > 0 ? records : undefined;
}

function normalizeChargeState(value: unknown): EngineItemChargeState | undefined {
  if (!isRecord(value)) return undefined;
  const current = finiteNonnegativeInteger(value.current);
  const max = finiteNonnegativeInteger(value.max);
  if (current === undefined || max === undefined || max < 1 || current > max) return undefined;
  return { current, max };
}

function defaultChargesForDefinition(definition: EngineItemDefinition): EngineItemChargeState | undefined {
  return definition.effectKey === "lantern-ward-v1" ? { current: 1, max: 1 } : undefined;
}

function finiteNonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEquipmentSlot(value: unknown): value is EngineEquipmentSlot {
  return value === "mainhand"
    || value === "offhand"
    || value === "armor"
    || value === "head"
    || value === "feet"
    || value === "accessory";
}

function isItemKind(value: unknown): value is EngineItemKind {
  return value === "weapon"
    || value === "armor"
    || value === "consumable"
    || value === "quest"
    || value === "misc"
    || value === "tool"
    || value === "ammunition"
    || value === "treasure";
}
