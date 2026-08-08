import { z } from "zod";
import type { NarrationEnvelope } from "./ai-contracts.js";
import type {
  CompiledCreatureAttack,
  CompiledEffectDuration,
  CompiledEffectProgram,
  NormalizedCreature,
} from "./content/schema.js";

export const engineAbilitySchema = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
export type EngineAbility = z.infer<typeof engineAbilitySchema>;

export const engineCharacterDetailsSchema = z
  .object({
    playerName: z.string().trim().max(120),
    age: z.string().trim().max(80),
    height: z.string().trim().max(80),
    weight: z.string().trim().max(80),
    eyes: z.string().trim().max(80),
    skin: z.string().trim().max(80),
    hair: z.string().trim().max(80),
    personalityTraits: z.string().trim().max(2_000),
    ideals: z.string().trim().max(2_000),
    bonds: z.string().trim().max(2_000),
    flaws: z.string().trim().max(2_000),
    appearance: z.string().trim().max(4_000),
    backstory: z.string().trim().max(6_000),
    allies: z.string().trim().max(4_000),
    factionName: z.string().trim().max(160),
    treasure: z.string().trim().max(4_000),
    inspiration: z.boolean(),
    temporaryHp: z.number().int().nonnegative().max(1_000_000),
  })
  .partial()
  .strict();
export type EngineCharacterDetails = z.infer<typeof engineCharacterDetailsSchema> & {
  playerName: string;
  age: string;
  height: string;
  weight: string;
  eyes: string;
  skin: string;
  hair: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance: string;
  backstory: string;
  allies: string;
  factionName: string;
  treasure: string;
  inspiration: boolean;
  temporaryHp: number;
};

export const engineItemKindSchema = z.enum([
  "weapon",
  "armor",
  "consumable",
  "quest",
  "misc",
  "tool",
  "ammunition",
  "treasure",
]);
export type EngineItemKind = z.infer<typeof engineItemKindSchema>;

export const engineEquipmentSlotSchema = z.enum([
  "mainhand",
  "offhand",
  "armor",
  "head",
  "feet",
  "accessory",
]);
export type EngineEquipmentSlot = z.infer<typeof engineEquipmentSlotSchema>;

const engineAuthoredItemDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: engineItemKindSchema,
  weight: z.number().nonnegative(),
  healing: z.number().int().nonnegative().optional(),
  description: z.string().max(2_000).optional(),
  attunementRequired: z.boolean().optional(),
  valueCopper: z.number().int().nonnegative().optional(),
  properties: z.array(z.string().max(120)).max(20).optional(),
  damage: z.string().max(80).optional(),
  armorClass: z.number().int().nonnegative().optional(),
}).strict();

const engineInventoryInstanceFields = {
  id: z.string().trim().min(1).max(120),
  quantity: z.number().int().nonnegative(),
  slot: engineEquipmentSlotSchema.optional(),
  equipped: z.boolean().optional(),
  attuned: z.boolean().optional(),
};

const engineSourceItemInputSchema = z.object({
  ...engineInventoryInstanceFields,
  contentKey: z.string().trim().startsWith("open5e:").max(300),
  packHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

const engineCanonicalAuthoredItemInputSchema = z.object({
  ...engineInventoryInstanceFields,
  authoredDefinition: engineAuthoredItemDefinitionSchema,
}).strict();

const engineLegacyAuthoredItemInputSchema = z.object({
  ...engineInventoryInstanceFields,
  ...engineAuthoredItemDefinitionSchema.shape,
}).strict();

export const engineInventoryItemInputSchema = z.union([
  engineSourceItemInputSchema,
  engineCanonicalAuthoredItemInputSchema,
  engineLegacyAuthoredItemInputSchema,
]);
export type EngineInventoryItemInput = z.infer<typeof engineInventoryItemInputSchema>;

const worldContextEntityIdSchema = z.string().trim().min(1).max(120);
const worldContextDispositionSchema = z.enum(["hostile", "unfriendly", "neutral", "friendly", "helpful"]);

export const engineMerchantListingInputSchema = z.object({
  item: engineInventoryItemInputSchema,
  stock: z.number().int().min(-1),
  buyPriceCopper: z.number().int().nonnegative(),
  sellPriceCopper: z.number().int().nonnegative(),
}).strict();
export type EngineMerchantListingInput = z.infer<typeof engineMerchantListingInputSchema>;

export const engineNpcPatchSchema = z.object({
  id: worldContextEntityIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  disposition: worldContextDispositionSchema.optional(),
  goals: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
  socialDc: z.number().int().min(1).max(30).optional(),
  // Rejection-only input: the domain rejects every supplied value as server-owned.
  relationshipScore: z.number().int().min(-100).max(100).optional(),
  memories: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
}).strict();
export type EngineNpcPatch = z.infer<typeof engineNpcPatchSchema>;

export const engineMerchantPatchSchema = z.object({
  id: worldContextEntityIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  disposition: worldContextDispositionSchema.optional(),
  items: z.array(engineMerchantListingInputSchema).max(100).optional(),
}).strict();
export type EngineMerchantPatch = z.infer<typeof engineMerchantPatchSchema>;

export const engineNpcPatchOperationsSchema = z.object({
  upsert: z.array(engineNpcPatchSchema).max(20).optional(),
  remove: z.array(worldContextEntityIdSchema).max(20).optional(),
}).strict().refine(
  (operations) => (operations.upsert?.length ?? 0) + (operations.remove?.length ?? 0) > 0,
  "A provided NPC patch needs at least one operation."
);
export type EngineNpcPatchOperations = z.infer<typeof engineNpcPatchOperationsSchema>;

export const engineMerchantPatchOperationsSchema = z.object({
  upsert: z.array(engineMerchantPatchSchema).max(20).optional(),
  remove: z.array(worldContextEntityIdSchema).max(20).optional(),
}).strict().refine(
  (operations) => (operations.upsert?.length ?? 0) + (operations.remove?.length ?? 0) > 0,
  "A provided merchant patch needs at least one operation."
);
export type EngineMerchantPatchOperations = z.infer<typeof engineMerchantPatchOperationsSchema>;

export const engineWorldContextArgsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(6_000),
  features: z.array(z.string().trim().min(1).max(120)).max(20),
  exits: z.array(z.object({
    id: worldContextEntityIdSchema,
    label: z.string().trim().min(1).max(160),
  }).strict()).max(20),
  npcs: engineNpcPatchOperationsSchema.optional(),
  merchants: engineMerchantPatchOperationsSchema.optional(),
}).strict();
export type EngineWorldContextArgs = z.infer<typeof engineWorldContextArgsSchema>;

export const engineWorldContextCommandSchema = engineWorldContextArgsSchema.extend({
  kind: z.literal("world_context"),
}).strict();
export type EngineWorldContextCommand = z.infer<typeof engineWorldContextCommandSchema>;

export const engineToolNameSchema = z.enum([
  "campaign_context",
  "content_search",
  "content_get",
  "rules_reference",
  "character_options",
  "world_context",
  "player_notes",
  "player_note_add",
  "npc_context",
  "merchant_catalog",
  "observe",
  "move",
  "interact",
  "social_check",
  "merchant_trade",
  "quest_create",
  "quest_update",
  "improvise",
  "campaign_beat",
  "character_sheet",
  "character_roll_stats",
  "character_create",
  "character_update",
  "inventory",
  "equip_item",
  "unequip_item",
  "drop_item",
  "use_item",
  "quest_progress",
  "combat_state",
  "combat_start",
  "spawn_creature",
  "learn_spell",
  "prepare_spell",
  "cast_spell",
  "combat_action",
  "end_turn",
  "advance_turn",
  "death_save",
  "loot",
  "rest",
  "roll_check",
  "tutorial_advance",
]);
export type EngineToolName = z.infer<typeof engineToolNameSchema>;

export const engineCampaignPhaseSchema = z.enum(["character_creation", "tutorial", "sandbox"]);
export type EngineCampaignPhase = z.infer<typeof engineCampaignPhaseSchema>;

export const engineCampaignProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    premise: z.string().trim().min(1).max(2_000),
    setting: z.string().trim().min(1).max(120),
    tone: z.string().trim().min(1).max(120),
  })
  .strict();
export type EngineCampaignProfile = z.infer<typeof engineCampaignProfileSchema>;

export const engineContentPolicySchema = z
  .object({
    gamesystem: z.string().trim().min(1).max(80),
    baseDocumentKey: z.string().trim().min(1).max(160),
    allowedDocumentKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
    allowedLicenseKeys: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!policy.allowedDocumentKeys.includes(policy.baseDocumentKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedDocumentKeys"],
        message: "The base document must be enabled for the campaign.",
      });
    }
    if (new Set(policy.allowedDocumentKeys).size !== policy.allowedDocumentKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedDocumentKeys"],
        message: "Campaign document keys must be unique.",
      });
    }
    if (new Set(policy.allowedLicenseKeys).size !== policy.allowedLicenseKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedLicenseKeys"],
        message: "Campaign license keys must be unique.",
      });
    }
  });
export type EngineContentPolicy = z.infer<typeof engineContentPolicySchema>;

export const engineCampaignCreateSchema = engineCampaignProfileSchema.extend({
  contentPolicy: engineContentPolicySchema.optional(),
}).strict();
export type EngineCampaignCreate = z.infer<typeof engineCampaignCreateSchema>;

export const engineCampaignDeleteSchema = z
  .object({
    expectedCampaignVersion: z.number().int().nonnegative(),
    confirmation: z.literal("DELETE"),
  })
  .strict();
export type EngineCampaignDeleteRequest = z.infer<typeof engineCampaignDeleteSchema>;

export const engineCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("observe") }).strict(),
  z.object({ kind: z.literal("listen") }).strict(),
  engineWorldContextCommandSchema,
  z
    .object({
      kind: z.literal("player_note_add"),
      text: z.string().trim().min(1).max(4_000),
      source: z.enum(["player", "dm"]).default("dm"),
    })
    .strict(),
  z.object({ kind: z.literal("character_update"),
    name: z.string().trim().min(1).max(80).optional(),
    background: z.string().trim().min(1).max(120).optional(),
    alignment: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    abilityScores: z.record(engineAbilitySchema, z.number().int().min(3).max(20)).optional(),
    details: engineCharacterDetailsSchema.optional(),
  }).strict(),
  z.object({ kind: z.literal("move"), destinationId: z.string().trim().min(1).max(80) }).strict(),
  z
    .object({
      kind: z.literal("interact"),
      targetId: z.string().trim().min(1).max(80),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("social_check"),
      npcId: z.string().trim().min(1).max(120),
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("merchant_trade"),
      merchantId: z.string().trim().min(1).max(120),
      itemId: z.string().trim().min(1).max(120),
      side: z.enum(["buy", "sell", "offer"]),
      quantity: z.number().int().min(1).max(100),
      offerUnitPriceCopper: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("quest_create"),
      title: z.string().trim().min(1).max(160),
      objective: z.string().trim().min(1).max(2_000),
      rewardXp: z.number().int().nonnegative().max(1_000_000),
      rewardCopper: z.number().int().nonnegative().max(100_000_000),
      giverNpcId: z.string().trim().min(1).max(120).optional(),
      deadline: z.string().trim().max(160).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("quest_update"),
      questId: z.string().trim().min(1).max(120),
      status: z.enum(["active", "completed", "failed", "abandoned"]).optional(),
      objective: z.string().trim().min(1).max(2_000).optional(),
      progress: z.number().int().min(0).max(100).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("improvise"),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(4_000),
      effectType: z.enum(["fictional", "advantage", "disadvantage", "condition", "damage", "healing", "movement", "summoning"]),
      targetId: z.string().trim().min(1).max(120).optional(),
      amount: z.number().int().min(0).max(1_000).optional(),
      durationRounds: z.number().int().min(1).max(1_000).optional(),
      condition: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("campaign_beat"),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(4_000),
      pressure: z.string().trim().min(1).max(1_000),
      choices: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
    })
    .strict(),
  z
    .object({
      kind: z.literal("character_roll_stats"),
      method: z.literal("rolled"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("character_create"),
      name: z.string().trim().min(1).max(80),
      speciesKey: z.string().trim().startsWith("open5e:species:").max(300).optional(),
      classKey: z.string().trim().startsWith("open5e:class:").max(300).optional(),
      species: z.enum(["human", "dwarf", "elf", "halfling"]).optional(),
      className: z.enum(["barbarian", "fighter", "rogue", "wizard"]).optional(),
      backgroundKey: z.string().trim().startsWith("open5e:background:").max(300).optional(),
      alignmentKey: z.string().trim().startsWith("open5e:alignment:").max(300).optional(),
      background: z.string().trim().min(1).max(120).optional(),
      alignment: z.string().trim().min(1).max(80).optional(),
      abilityScoreMethod: z.enum(["class_default", "standard_array", "rolled"]).optional(),
      abilityScoreDraftId: z.string().uuid().optional(),
      abilityScores: z.record(engineAbilitySchema, z.number().int().min(3).max(20)).optional(),
      abilityBonusChoices: z.array(engineAbilitySchema).max(6).optional(),
      skillKeys: z.array(z.string().trim().startsWith("open5e:skill:").max(300)).max(8).optional(),
      languageKeys: z.array(z.string().trim().startsWith("open5e:language:").max(300)).max(8).optional(),
      toolProficiencies: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("equip_item"), itemId: z.string().trim().min(1).max(120), slot: z.enum(["mainhand", "offhand", "armor", "head", "feet", "accessory"]) }).strict(),
  z.object({ kind: z.literal("unequip_item"), itemId: z.string().trim().min(1).max(120) }).strict(),
  z.object({ kind: z.literal("drop_item"), itemId: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(100).default(1) }).strict(),
  z
    .object({
      kind: z.literal("use_item"),
      itemId: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({
      kind: z.literal("roll_check"),
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("combat_start"),
      encounterId: z.string().trim().min(1).max(120),
      encounterName: z.string().trim().min(1).max(160),
      creatures: z
        .array(
          z
            .object({
              creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
              count: z.number().int().min(1).max(20),
              distanceFeet: z.number().nonnegative().max(100_000).optional(),
            })
            .strict()
        )
        .min(1)
        .max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("spawn_creature"),
      creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
      count: z.number().int().min(1).max(20),
      distanceFeet: z.number().nonnegative().max(100_000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("learn_spell"),
      spellKey: z.string().trim().startsWith("open5e:spell:").max(300),
    })
    .strict(),
  z
    .object({
      kind: z.literal("prepare_spell"),
      spellKey: z.string().trim().startsWith("open5e:spell:").max(300),
      prepared: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cast_spell"),
      spellKey: z.string().trim().startsWith("open5e:spell:").max(300),
      slotLevel: z.number().int().min(1).max(9).optional(),
      targetIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("combat_action"),
      action: z.enum(["attack", "dodge", "dash", "disengage", "help", "ready", "second_wind"]),
      targetId: z.string().trim().min(1).max(80).optional(),
      weaponId: z.string().trim().min(1).max(120).optional(),
      goal: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("end_turn") }).strict(),
  z.object({
    kind: z.literal("advance_turn"),
    combatantId: z.string().trim().min(1).max(120).optional(),
    actionKey: z.string().trim().min(1).max(300).optional(),
    attackKey: z.string().trim().min(1).max(240).optional(),
  }).strict(),
  z.object({ kind: z.literal("death_save") }).strict(),
  z
    .object({
      kind: z.literal("loot"),
      items: z
        .array(
          engineInventoryItemInputSchema.refine((item) => item.quantity > 0, {
            message: "Loot quantity must be positive.",
          })
        )
        .max(50)
        .default([]),
      rewardXp: z.number().int().nonnegative().max(1_000_000).default(0),
      rewardCopper: z.number().int().nonnegative().max(100_000_000).default(0),
      questId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("rest"), restType: z.enum(["short", "long"]).default("long") }).strict(),
  z.object({ kind: z.literal("tutorial_advance") }).strict(),
  z.object({ kind: z.literal("declare"), goal: z.string().trim().min(1).max(2_000) }).strict(),
]);
export type EngineCommand = z.infer<typeof engineCommandSchema>;

export interface EngineAbilityScoreRoll {
  dice: [number, number, number, number];
  dropped: number;
  total: number;
}

export interface EngineAbilityScoreDraft {
  id: string;
  method: "rolled";
  scores: number[];
  rolls: EngineAbilityScoreRoll[];
  createdAt: string;
}

export interface EngineCharacterCreationState {
  abilityScoreDraft: EngineAbilityScoreDraft | null;
}

export interface EngineTurnPlanEffect {
  tool: EngineToolName;
  command: EngineCommand;
}

export interface EngineTurnPlanCommand {
  kind: "turn_plan";
  effects: EngineTurnPlanEffect[];
}

export interface EngineContentRepinCommand {
  kind: "content_repin";
  fromRulesVersion: string;
  toRulesVersion: string;
  reviewSha256: string;
  approvedChangedKeys: string[];
}

export interface EngineTurnEffectEvidence extends EngineTurnPlanEffect {
  contentKeys: string[];
  rolls: Array<{ kind: string; value: number; sides?: number }>;
  modifiers: Array<{ name: string; value: number }>;
  outcome: string;
  stateChanges: Array<{ path: string; before: unknown; after: unknown }>;
  data: unknown;
}

export type EnginePersistedCommand = EngineCommand | EngineTurnPlanCommand | EngineContentRepinCommand;
export type EngineResolutionTool = EngineToolName | "declare" | "listen" | "turn_plan" | "content_repin";

export const engineCommandRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
    action: z.string().trim().min(1).max(80).optional(),
    playerText: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine((value) => (value.action !== undefined) !== (value.playerText !== undefined), {
    message: "Send exactly one of action or playerText.",
  });
export type EngineCommandRequest = z.infer<typeof engineCommandRequestSchema>;

export const engineToolCallRequestSchema = z.object({
  clientCommandId: z.string().uuid(),
  expectedCampaignVersion: z.number().int().nonnegative(),
  toolName: engineToolNameSchema,
  arguments: z.record(z.string(), z.unknown()).default({}),
  playerText: z.string().trim().min(1).max(2_000).optional(),
});
export type EngineToolCallRequest = z.infer<typeof engineToolCallRequestSchema>;

export const engineOpeningRequestSchema = z
  .object({
    clientCommandId: z.string().uuid(),
    expectedCampaignVersion: z.number().int().nonnegative(),
  })
  .strict();
export type EngineOpeningRequest = z.infer<typeof engineOpeningRequestSchema>;

export interface RequestContext {
  requestId: string;
  accountId: string;
  campaignId: string;
  actorId: string;
  capabilities: string[];
}

export interface CreateCampaignContext {
  requestId: string;
  accountId: string;
  actorId: string;
  capabilities: string[];
}

export interface EngineWorldContext {
  id: string;
  title: string;
  description: string;
  exits: Array<{ id: string; label: string }>;
  features: string[];
  npcs: EngineNpc[];
  merchants: EngineMerchant[];
}

export interface EngineNpc {
  id: string;
  name: string;
  description: string;
  disposition: "hostile" | "unfriendly" | "neutral" | "friendly" | "helpful";
  goals: string[];
  socialDc: number;
  relationshipScore: number;
  memories: string[];
}

export interface EngineMerchantItem {
  item: EngineInventoryItem;
  stock: number;
  buyPriceCopper: number;
  sellPriceCopper: number;
}

export interface EngineMerchant {
  id: string;
  name: string;
  description: string;
  disposition: EngineNpc["disposition"];
  items: EngineMerchantItem[];
}

export interface EngineNote {
  id: string;
  text: string;
  source: "player" | "dm";
  createdAt: string;
}

export interface EngineCurrency {
  copper: number;
}

export interface EngineCurrencyBreakdown {
  totalCopper: number;
  platinum: number;
  gold: number;
  electrum: number;
  silver: number;
  copper: number;
}

export interface EngineSkill {
  ability: EngineAbility;
  proficient: boolean;
  expertise: boolean;
  bonus: number;
}

export interface EngineItemDefinition {
  name: string;
  kind: EngineItemKind;
  weight: number;
  healing?: number;
  description?: string;
  attunementRequired?: boolean;
  valueCopper?: number;
  properties?: string[];
  damage?: string;
  armorClass?: number;
  armorProfile?: {
    category: "light" | "medium" | "heavy";
    base: number;
    addDexterityModifier: boolean;
    dexterityModifierCap: number | null;
    grantsStealthDisadvantage: boolean;
    strengthScoreRequired: number | null;
  };
  isMagic?: boolean;
  rarity?: { key: string; name: string; rank: number };
  mechanicsTier?: 0 | 1 | 2;
}

export interface EngineInventoryItem {
  id: string;
  quantity: number;
  contentKey?: string;
  packHash?: string;
  authoredDefinition?: EngineItemDefinition;
  slot?: EngineEquipmentSlot;
  equipped?: boolean;
  attuned?: boolean;
}

export interface EngineInventoryItemView extends EngineInventoryItem, EngineItemDefinition {
  definitionSource: "open5e" | "authored";
  mechanicsStatus: "compiled" | "typed" | "authored";
}

export interface EngineMerchantItemView extends Omit<EngineMerchantItem, "item"> {
  item: EngineInventoryItemView;
}

export interface EngineMerchantView extends Omit<EngineMerchant, "items"> {
  items: EngineMerchantItemView[];
}

export interface EngineWorldContextView extends Omit<EngineWorldContext, "merchants"> {
  merchants: EngineMerchantView[];
}

export interface EngineSpellReference {
  contentKey: string;
  packHash: string;
}

export interface EngineContentReference {
  contentKey: string;
  packHash: string;
}

export interface EngineFeatureReference extends EngineContentReference {
  featureSourceKey: string;
}

export interface EngineConcentration extends EngineSpellReference {
  startedRound: number | null;
}

export interface EngineSpellcasting {
  ability: EngineAbility;
  spellSaveDc: number;
  spellAttackBonus: number;
  slots: Record<string, number>;
  slotMaximums: Record<string, number>;
  slotRecovery: "long-rest" | "short-or-long-rest";
  knownSpells: EngineSpellReference[];
  preparedSpells: EngineSpellReference[];
  concentration: EngineConcentration | null;
}

export interface EngineSpellReferenceView extends EngineSpellReference {
  name: string;
  level: number | null;
  school: string | null;
  castingTime: string | null;
  range: string | null;
  concentrationRequired: boolean | null;
  mechanicsStatus: "compiled-primary" | "prose-only" | "pack-unavailable";
}

export interface EngineSpellcastingView extends Omit<EngineSpellcasting, "knownSpells" | "preparedSpells" | "concentration"> {
  selectionMode: "known" | "prepared" | "spellbook" | null;
  knownSpellLimit: number | null;
  cantripLimit: number | null;
  preparedCapacity: number | null;
  knownSpells: EngineSpellReferenceView[];
  preparedSpells: EngineSpellReferenceView[];
  concentration: (EngineSpellReferenceView & { startedRound: number | null }) | null;
}

export interface EngineCharacter {
  id: string;
  created: boolean;
  name: string;
  species: string;
  className: string;
  speciesRef: EngineContentReference | null;
  classRef: EngineContentReference | null;
  backgroundRef: EngineContentReference | null;
  alignmentRef: EngineContentReference | null;
  skillRefs: EngineContentReference[];
  languageRefs: EngineContentReference[];
  featureRefs: EngineFeatureReference[];
  featRefs: EngineContentReference[];
  background: string;
  alignment: string;
  description: string;
  details: EngineCharacterDetails;
  level: number;
  abilities: Record<EngineAbility, number>;
  abilityModifiers: Record<EngineAbility, number>;
  proficiencyBonus: number;
  savingThrows: Record<EngineAbility, number>;
  skills: Record<string, EngineSkill>;
  size: string;
  speed: number;
  hitDie: number;
  hitDiceRemaining: number;
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  features: string[];
  featureUses: Record<string, number>;
  spellcasting: EngineSpellcasting | null;
  hp: number;
  maxHp: number;
  ac: number;
  inventory: EngineInventoryItem[];
  currency: EngineCurrency;
  gold: number;
  xp: number;
  conditions: string[];
  conditionEffects: EngineAppliedCondition[];
  deathSaveSuccesses: number;
  deathSaveFailures: number;
}

export interface EngineAppliedCondition {
  id: string;
  conditionContentKey: string;
  packHash: string;
  name: string;
  sourceContentKey: string;
  sourceCombatantId: string;
  appliedRound: number;
  duration: CompiledEffectDuration;
  repeatSave: {
    timing: "start-of-turn" | "end-of-turn";
    ability: EngineAbility;
    dc: number;
    endsOnSuccess: true;
  } | null;
}

export type EngineEffectCategory = "attack-roll" | "ability-check" | "saving-throw";

export type EngineEffectOperation =
  | { kind: "advantage" | "disadvantage"; category: EngineEffectCategory }
  | { kind: "condition"; condition: string; action: "apply" | "remove" };

export type EngineEffectDuration =
  | { kind: "persistent" }
  | { kind: "fixed"; amount: number; unit: "round" | "minute" | "hour" | "day" }
  | { kind: "turn-boundary"; boundary: "start" | "end"; subject: "source" | "target"; offsetTurns: number }
  | { kind: "source-lifetime" };

export type EngineEffectClearPolicy = "short-rest" | "long-rest" | "duration" | "source-removal" | "never";

export interface EngineEffectAnchor {
  kind: "campaign-round" | "turn";
  round: number;
  actorId?: string;
}

export interface EngineEffectProvenance {
  sourceContentKey: string | null;
  sourceCommandId: string | null;
  rulesVersion: string;
  formulaRevision: string;
}

export interface EngineEffectInstance {
  id: string;
  definitionKey: string;
  sourceRef: string;
  targetRefs: string[];
  operations: EngineEffectOperation[];
  startAnchor: EngineEffectAnchor;
  duration: EngineEffectDuration;
  stackingKey: string;
  stackingRule: "stack" | "replace" | "ignore";
  clearedBy: EngineEffectClearPolicy[];
  status: "active" | "expired" | "removed";
  provenance: EngineEffectProvenance;
}

export interface EngineCharacterFeatureView {
  name: string;
  description: string;
  sourceType: "class" | "species" | "background" | "feat" | "unknown";
  sourceName: string;
  contentKey: string;
  packHash: string;
  featureSourceKey: string;
}

export interface EngineCharacterSourceDetailsView {
  species: null | {
    contentKey: string;
    name: string;
    description: string;
    traits: Array<{ name: string; description: string }>;
  };
  characterClass: null | {
    contentKey: string;
    name: string;
    description: string;
    levelOneFeatures: Array<{ sourceKey: string; name: string; description: string }>;
    startingEquipmentDescription: string | null;
  };
  background: null | {
    contentKey: string;
    name: string;
    description: string;
    benefits: Array<{ name: string; description: string; benefitType: string }>;
  };
  alignment: null | {
    contentKey: string;
    name: string;
    description: string;
  };
  skills: Array<{
    contentKey: string;
    name: string;
    engineKey: string;
    ability: EngineAbility;
    description: string;
  }>;
  languages: Array<{
    contentKey: string;
    name: string;
    description: string;
    isExotic: boolean;
  }>;
  features: EngineCharacterFeatureView[];
}

export interface EngineCharacterView extends Omit<EngineCharacter, "inventory" | "spellcasting"> {
  inventory: EngineInventoryItemView[];
  spellcasting: EngineSpellcastingView | null;
  derived: {
    initiative: number;
    passivePerception: number;
    carryWeight: number;
    carryCapacity: number;
    encumbered: boolean;
    currencyBreakdown: EngineCurrencyBreakdown;
    savingThrowProficiencies: EngineAbility[];
  };
  sourceDetails: EngineCharacterSourceDetailsView;
}

export interface EngineCombatant {
  id: string;
  contentKey: string;
  packHash: string;
  hp: number;
  alive: boolean;
  distanceFeet: number;
  conditions: string[];
  actionResources: Record<string, EngineActionResource>;
}

export interface EngineActionResource {
  kind: "per-day" | "recharge";
  usesRemaining: number | null;
  available: boolean;
  rechargeMinimum: number | null;
  lastRechargeRound: number | null;
}

export interface EngineCombatantView extends EngineCombatant {
  name: string;
  maxHp: number;
  armorClass: number;
  challengeRating: number;
  experiencePoints: number | null;
  creatureType: NormalizedCreature["creatureType"];
  size: NormalizedCreature["size"];
  abilities: NormalizedCreature["abilities"];
  abilityModifiers: NormalizedCreature["abilityModifiers"];
  savingThrows: NormalizedCreature["savingThrows"];
  savingThrowsAll: NormalizedCreature["savingThrowsAll"];
  skillBonuses: NormalizedCreature["skillBonuses"];
  skillBonusesAll: NormalizedCreature["skillBonusesAll"];
  passivePerception: number;
  speed: NormalizedCreature["speed"];
  senses: NormalizedCreature["senses"];
  languages: NormalizedCreature["languages"];
  defenses: NormalizedCreature["defenses"];
  actions: NormalizedCreature["actions"];
  attacks: CompiledCreatureAttack[];
  effectPrograms: CompiledEffectProgram[];
  traits: NormalizedCreature["traits"];
  environments: NormalizedCreature["environments"];
  mechanicsStatus: "typed-statblock" | "basic-attacks-compiled" | "effect-programs-compiled";
}

export interface EngineWeaponAttack {
  weaponId: string;
  weaponName: string;
  ability: EngineAbility;
  abilityModifier: number;
  proficient: boolean;
  proficiencyBonus: number;
  attackBonus: number;
  damageDice: string;
  damageType: string;
  properties: string[];
  reachFeet: number | null;
  normalRangeFeet: number | null;
  longRangeFeet: number | null;
  explanation: string;
}

export interface EngineTurnBudgetSlot {
  available: boolean;
  spent: boolean;
}

export interface EngineMovementBudget {
  available: number;
  spent: number;
}

export interface EngineTurnBudget {
  profile: "srd-2014-single-actor";
  action: EngineTurnBudgetSlot;
  bonusAction: EngineTurnBudgetSlot;
  reaction: EngineTurnBudgetSlot;
  movementFeet: EngineMovementBudget;
}

export interface EnginePendingReaction {
  version: 1;
  id: string;
  kind: string;
  sourceCommandId: string;
  sourceVersion: number;
  actorId: string;
  eligibleReactionIds: string[];
  status: "offered" | "accepted" | "declined" | "resolved";
  resumeToken: string;
}

export interface EngineCombat {
  status: "none" | "active" | "ended";
  encounterId: string | null;
  encounterName: string | null;
  round: number;
  activeActorId: string | null;
  turnBudget: EngineTurnBudget;
  pendingReaction: EnginePendingReaction | null;
  enemies: EngineCombatant[];
  lootClaimed: boolean;
  lastAction: string | null;
}

export interface EngineCombatView extends Omit<EngineCombat, "enemies"> {
  enemies: EngineCombatantView[];
}

export interface EngineQuest {
  id: string;
  title: string;
  objective: string;
  status: "active" | "completed" | "failed" | "abandoned";
  reward: { xp: number; copper: number };
  rewardClaimed: boolean;
  progress: number;
  giverNpcId?: string;
  deadline?: string;
}

export interface EngineImprovEffect {
  id: string;
  title: string;
  description: string;
  effectType: "fictional" | "advantage" | "disadvantage" | "condition" | "damage" | "healing" | "movement" | "summoning";
  targetId?: string;
  amount?: number;
  condition?: string;
  createdAt: string;
}

export interface EngineCampaignBeat {
  id: string;
  title: string;
  description: string;
  pressure: string;
  choices: string[];
  createdAt: string;
}

export interface EngineMessage {
  id: string;
  kind: "narration" | "roll" | "system" | "player";
  text: string;
  createdAt: string;
}

export interface LanternCampaignState {
  id: string;
  accountId: string;
  actorId: string;
  version: number;
  rulesVersion: string;
  contentPolicy: EngineContentPolicy;
  campaign: EngineCampaignProfile;
  phase: EngineCampaignPhase;
  tutorialStep: number;
  characterCreation: EngineCharacterCreationState;
  worldContext: EngineWorldContext | null;
  playerNotes: EngineNote[];
  character: EngineCharacter;
  combat: EngineCombat;
  quest: EngineQuest;
  quests: EngineQuest[];
  effects: EngineEffectInstance[];
  improvEffects: EngineImprovEffect[];
  currentBeat: EngineCampaignBeat | null;
  suggestedActions: NarrationEnvelope["suggestedActions"];
  log: EngineMessage[];
  lastRoll: number | null;
  updatedAt: string;
}

export interface EngineEvent {
  id: string;
  kind: "command";
  tool: EngineResolutionTool;
  command: EnginePersistedCommand;
  effects?: EngineTurnEffectEvidence[];
  accountId: string;
  campaignId: string;
  actorId: string;
  requestId: string;
  clientCommandId: string;
  previousVersion: number;
  version: number;
  rulesVersion: string;
  contentKeys: string[];
  rolls: Array<{ kind: string; value: number; sides?: number }>;
  modifiers: Array<{ name: string; value: number }>;
  outcome: string;
  stateChanges: Array<{ path: string; before: unknown; after: unknown }>;
  createdAt: string;
}

export interface EngineSessionView {
  id: string;
  userId: string;
  version: number;
  rulesVersion: string;
  contentPolicy: EngineContentPolicy;
  campaign: EngineCampaignProfile;
  phase: EngineCampaignPhase;
  tutorialStep: number;
  characterCreation: EngineCharacterCreationState;
  characterCreated: boolean;
  worldContext: EngineWorldContextView | null;
  playerNotes: EngineNote[];
  log: EngineMessage[];
  availableActions: string[];
  lastRoll: number | null;
  character: EngineCharacterView;
  quests: EngineQuest[];
  effects: EngineEffectInstance[];
  improvEffects: EngineImprovEffect[];
  currentBeat: EngineCampaignBeat | null;
  suggestedActions: NarrationEnvelope["suggestedActions"];
  combat: EngineCombatView;
  updatedAt: string;
}

export interface EngineCampaignDeletionResult {
  deleted: true;
  campaignId: string;
  previousVersion: number;
  deletedCommands: number;
  deletedEvents: number;
  deletedAt: string;
}

export interface EngineResolution {
  state: LanternCampaignState;
  tool: EngineResolutionTool;
  readOnly: boolean;
  accepted: boolean;
  code: string | null;
  message: string;
  data: unknown;
  event: EngineEvent | null;
  narration: NarrationEnvelope;
}

export interface EngineCommandResult extends EngineResolution {
  context: RequestContext;
  campaignId: string;
  clientCommandId: string;
  replayed: boolean;
  session: EngineSessionView;
  narrationSource: "rules" | "llm";
}

export interface EngineToolResult {
  tool: EngineToolName;
  readOnly: boolean;
  accepted: boolean;
  code: string | null;
  message: string;
  data: unknown;
  campaignVersion: number;
  provisional?: boolean;
  commandResult?: EngineCommandResult;
}
