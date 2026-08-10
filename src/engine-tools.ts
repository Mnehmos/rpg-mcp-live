import { z } from "zod";
import { ContentAccessError, type Open5eContentResolver } from "./content/resolve.js";
import { OPEN5E_COLLECTIONS, open5eCollectionSchema, type Open5eCollection } from "./content/schema.js";
import { readToolData } from "./engine-domain.js";
import { open5eCharacterOptions } from "./open5e-rules.js";
import {
  engineAbilitySchema,
  engineAdjudicationDifficultyBandSchema,
  engineAdjudicationStakeSchema,
  engineCapabilityFamilyIdSchema,
  engineCharacterDetailsSchema,
  engineCommandSchema,
  engineContentCompileArgsSchema,
  engineSpellKeySchema,
  engineExperienceProfileInputSchema,
  engineEncounterDecisionSchema,
  engineEncounterLifecycleProfileSchema,
  engineInventoryItemInputSchema,
  engineTacticalGeometryInputSchema,
  engineTacticalPositionSchema,
  engineToolNameSchema,
  engineSocialActionCommandSchema,
  engineNpcTickCommandSchema,
  engineQuestGraphInputSchema,
  engineSceneMoveSchema,
  engineWorldObjectAffordanceSchema,
  engineWorldContextArgsSchema,
  engineProceduralNoticeInputSchema,
  proceduralNoticeActionSchema,
  engineSituationDefinitionProposalSchema,
  type EngineCommand,
  type EngineToolName,
  type EngineToolResult,
  type LanternCampaignState,
} from "./engine-contracts.js";

const RULE_REFERENCE_COLLECTIONS = ["rulesets", "rules", "sections", "planes"] as const;

export interface EngineToolDefinition {
  type: "function";
  function: {
    name: EngineToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const noArguments = z.object({}).strict();
const inventoryItemSchema = engineInventoryItemInputSchema;
const lootItemSchema = inventoryItemSchema.refine((item) => item.quantity > 0, {
  message: "Loot quantity must be positive.",
});
const toolArgumentSchemas: Record<EngineToolName, z.ZodTypeAny> = {
  campaign_context: noArguments,
  capability_load: z.object({ familyId: engineCapabilityFamilyIdSchema }).strict(),
  experience_profile_update: z.object({ profile: engineExperienceProfileInputSchema }).strict(),
  experience_feedback_add: z.object({ rating: z.number().int().min(1).max(5), note: z.string().trim().min(1).max(500).optional() }).strict(),
  experience_boundary: z.object({ theme: z.string().trim().min(1).max(120), action: z.enum(["redirect", "fade_to_black", "skip"]) }).strict(),
  challenge_attempt: z.object({
    challengeId: z.string().trim().min(1).max(120),
    goal: z.string().trim().min(1).max(2_000),
    approach: z.string().trim().min(1).max(2_000),
    targetId: z.string().trim().min(1).max(120).optional(),
    sceneId: z.string().trim().min(1).max(120).optional(),
    difficultyBand: engineAdjudicationDifficultyBandSchema.optional(),
    requestedStakes: z.array(engineAdjudicationStakeSchema).max(4).optional(),
    factId: z.string().trim().min(1).max(120).optional(),
    helperId: z.string().trim().min(1).max(120).optional(),
    opponentId: z.string().trim().min(1).max(120).optional(),
    informationPolicy: z.enum(["public", "withheld"]).optional(),
    tool: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  content_search: z.object({
    query: z.string().trim().max(200).optional(),
    collection: open5eCollectionSchema.optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  content_get: z.object({
    contentKey: z.string().trim().min(1).max(300),
  }).strict(),
  content_compile: engineContentCompileArgsSchema,
  rules_reference: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("search"),
      query: z.string().trim().min(1).max(200),
      collections: z.array(z.enum(RULE_REFERENCE_COLLECTIONS)).min(1).max(4).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }).strict(),
    z.object({
      action: z.literal("get"),
      contentKey: z.string().trim().startsWith("open5e:").max(300),
    }).strict(),
  ]),
  character_options: noArguments,
  world_context: engineWorldContextArgsSchema,
  procedural_notice: z.object({
    action: proceduralNoticeActionSchema,
    noticeId: z.string().trim().min(1).max(120).optional(),
    notice: engineProceduralNoticeInputSchema.optional(),
    requestText: z.string().trim().min(1).max(1_000).optional(),
  }).strict().superRefine((value, context) => {
    if (value.action === "upsert" && !value.notice) context.addIssue({ code: z.ZodIssueCode.custom, path: ["notice"], message: "Upsert requires typed notice terms." });
    if (value.action !== "upsert" && value.notice) context.addIssue({ code: z.ZodIssueCode.custom, path: ["notice"], message: "Only upsert accepts notice terms." });
    if (value.action !== "upsert" && !value.noticeId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["noticeId"], message: "Notice actions require a notice id." });
  }),
  player_notes: noArguments,
  player_note_add: z
    .object({
      text: z.string().trim().min(1).max(4_000),
      source: z.enum(["player", "dm"]).optional(),
    })
    .strict(),
  npc_context: noArguments,
  merchant_catalog: noArguments,
  observe: noArguments,
  move: z.object({ destinationId: z.string().trim().min(1).max(120) }).strict(),
  travel: z.object({
    routeId: z.string().trim().min(1).max(120),
    destinationId: z.string().trim().min(1).max(120),
    pace: z.enum(["normal", "fast"]),
    navigatorId: z.string().trim().min(1).max(120).optional(),
    watcherId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  interact: z
    .object({
      targetId: z.string().trim().min(1).max(80),
      goal: z.string().trim().min(1).max(2_000),
      affordance: engineWorldObjectAffordanceSchema.optional(),
      sourceId: z.string().trim().min(1).max(120).optional(),
      destinationId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  social_check: z
    .object({
      npcId: z.string().trim().min(1).max(120),
      actingNpcId: z.string().trim().min(1).max(120).optional(),
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  npc_tick: engineNpcTickCommandSchema.omit({ kind: true }),
  merchant_trade: z
    .object({
      merchantId: z.string().trim().min(1).max(120),
      itemId: z.string().trim().min(1).max(120),
      side: z.enum(["buy", "sell", "offer"]),
      quantity: z.number().int().min(1).max(100),
      offerUnitPriceCopper: z.number().int().nonnegative().optional(),
    })
    .strict(),
  social_action: engineSocialActionCommandSchema.omit({ kind: true }),
  quest_create: z
    .object({
      title: z.string().trim().min(1).max(160),
      objective: z.string().trim().min(1).max(2_000),
      rewardXp: z.number().int().nonnegative().max(1_000_000),
      rewardCopper: z.number().int().nonnegative().max(100_000_000),
      giverNpcId: z.string().trim().min(1).max(120).optional(),
      deadline: z.string().trim().max(160).optional(),
      deadlineAtMinutes: z.number().int().nonnegative().max(100_000_000).optional(),
      graph: engineQuestGraphInputSchema.optional(),
    })
    .strict(),
  quest_transition: z.object({
    questId: z.string().trim().min(1).max(120),
    transitionId: z.string().trim().min(1).max(120),
    choiceId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  quest_update: z
    .object({
      questId: z.string().trim().min(1).max(120),
      status: z.enum(["active", "completed", "failed", "abandoned"]).optional(),
      objective: z.string().trim().min(1).max(2_000).optional(),
      progress: z.number().int().min(0).max(100).optional(),
    })
    .strict(),
  improvise: z
    .object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(4_000),
      effectType: z.enum(["fictional", "advantage", "disadvantage", "condition", "damage", "healing", "movement", "summoning"]),
      targetId: z.string().trim().min(1).max(120).optional(),
      amount: z.number().int().min(0).max(1_000).optional(),
      durationRounds: z.number().int().min(1).max(1_000).optional(),
      condition: z.string().trim().min(1).max(80).optional(),
      checkCategory: z.enum(["attack-roll", "ability-check", "saving-throw"]).optional(),
      sceneMove: engineSceneMoveSchema.optional(),
    })
    .strict(),
  campaign_beat: z
    .object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(4_000),
      pressure: z.string().trim().min(1).max(1_000),
      choices: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
    })
    .strict(),
  character_sheet: noArguments,
  character_create: z
    .object({
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
  character_roll_stats: z.object({ method: z.literal("rolled") }).strict(),
  character_update: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      background: z.string().trim().min(1).max(120).optional(),
      alignment: z.string().trim().min(1).max(80).optional(),
      description: z.string().trim().min(1).max(2_000).optional(),
      abilityScores: z.record(engineAbilitySchema, z.number().int().min(3).max(20)).optional(),
      details: engineCharacterDetailsSchema.optional(),
    })
    .strict(),
  inventory: noArguments,
  inventory_transfer: z.object({
    itemId: z.string().trim().min(1).max(120),
    targetContainerId: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(100).default(1),
  }).strict(),
  equip_item: z.object({ itemId: z.string().trim().min(1).max(120), slot: z.enum(["mainhand", "offhand", "armor", "head", "feet", "accessory"]) }).strict(),
  unequip_item: z.object({ itemId: z.string().trim().min(1).max(120) }).strict(),
  drop_item: z.object({ itemId: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(100).default(1) }).strict(),
  use_item: z.object({ itemId: z.string().trim().min(1).max(80) }).strict(),
  quest_progress: noArguments,
  combat_state: noArguments,
  controlled_actor_context: noArguments,
  party_context: noArguments,
  situation_context: noArguments,
  party_create: noArguments,
  party_set_viewpoint: z.object({ actorId: z.string().trim().min(1).max(120) }).strict(),
  party_split: z.object({
    actorId: z.string().trim().min(1).max(120),
    sceneId: z.string().trim().min(1).max(120),
    locationRef: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  party_rejoin: noArguments,
  party_shared_transfer: z.object({
    actorId: z.string().trim().min(1).max(120),
    itemId: z.string().trim().min(1).max(120),
    quantity: z.number().int().min(1).max(100).default(1),
    direction: z.enum(["to_shared", "from_shared"]),
  }).strict(),
  party_group_check: z.object({
    ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
    skill: z.string().trim().min(1).max(80).optional(),
    goal: z.string().trim().min(1).max(2_000),
    actorIds: z.array(z.string().trim().min(1).max(120)).min(1).max(3),
  }).strict(),
  situation_create: z.object({ definition: engineSituationDefinitionProposalSchema, sourceRandomEventId: z.string().trim().min(1).max(120).optional() }).strict(),
  situation_visit: z.object({ locationId: z.string().trim().min(1).max(120) }).strict(),
  situation_clue_attempt: z.object({ clueId: z.string().trim().min(1).max(120), approach: z.string().trim().min(1).max(2_000), sourceActorId: z.string().trim().min(1).max(120).optional() }).strict(),
  situation_ignore: noArguments,
  situation_choose: z.object({ outcomeId: z.string().trim().min(1).max(120) }).strict(),
  controlled_actor_create: z.object({ profileId: z.enum(["familiar-scout-v1", "summon-scout-v1"]) }).strict(),
  controlled_actor_command: z.object({
    actorId: z.string().trim().min(1).max(120),
    action: z.enum(["attack", "guard", "follow"]),
    targetId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  controlled_actor_dismiss: z.object({ actorId: z.string().trim().min(1).max(120) }).strict(),
  combat_start: z
    .object({
      encounterId: z.string().trim().min(1).max(120),
      encounterName: z.string().trim().min(1).max(160),
      lifecycleProfile: engineEncounterLifecycleProfileSchema.optional(),
      approach: z.object({
        challengeId: z.literal("stealth-perception-v1"),
        groupIndex: z.number().int().nonnegative().max(19),
        goal: z.string().trim().min(1).max(2_000),
        approach: z.string().trim().min(1).max(2_000),
      }).strict().optional(),
      creatures: z
        .array(
          z
            .object({
              creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
              count: z.number().int().min(1).max(20),
              distanceFeet: z.number().nonnegative().max(100_000).optional(),
              position: engineTacticalPositionSchema.optional(),
            })
            .strict()
        )
        .min(1)
        .max(20),
      tactical: engineTacticalGeometryInputSchema.optional(),
    })
    .strict(),
  encounter_decision: z.object({
    decision: engineEncounterDecisionSchema,
    targetId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  custody_action: z.object({
    action: z.enum(["surrender", "release", "escape"]),
    guardId: z.string().trim().min(1).max(120).optional(),
    affectedActorIds: z.array(z.string().trim().min(1).max(120)).min(1).max(8).optional(),
  }).strict(),
  spawn_creature: z.object({
    creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
    count: z.number().int().min(1).max(20),
    distanceFeet: z.number().nonnegative().max(100_000).optional(),
    position: engineTacticalPositionSchema.optional(),
  }).strict(),
  learn_spell: z.object({
    spellKey: engineSpellKeySchema,
  }).strict(),
  prepare_spell: z.object({
    spellKey: engineSpellKeySchema,
    prepared: z.boolean().default(true),
  }).strict(),
  cast_spell: z.object({
    spellKey: engineSpellKeySchema,
    slotLevel: z.number().int().min(1).max(9).optional(),
    targetIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    reactionId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  reaction_response: z.object({
    reactionId: z.string().trim().min(1).max(120),
    decision: z.enum(["accept", "decline"]),
    spellKey: engineSpellKeySchema.optional(),
    slotLevel: z.number().int().min(1).max(9).optional(),
  }).strict(),
  combat_action: z
    .object({
      action: z.enum(["attack", "attack_nonlethal", "dodge", "dash", "disengage", "help", "ready", "second_wind"]),
      targetId: z.string().trim().min(1).max(80).optional(),
      weaponId: z.string().trim().min(1).max(120).optional(),
      goal: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  combat_move: z.object({
    geometryRevision: z.number().int().nonnegative(),
    destination: engineTacticalPositionSchema,
    path: z.array(engineTacticalPositionSchema).max(400).optional(),
  }).strict(),
  end_turn: noArguments,
  advancement_confirm: z.object({ pendingId: z.string().trim().min(1).max(120) }).strict(),
  npc_advance: z.object({
    combatantId: z.string().trim().min(1).max(120),
    templateId: z.literal("veteran"),
  }).strict(),
  advance_turn: z.object({
    combatantId: z.string().trim().min(1).max(120).optional(),
    actionKey: z.string().trim().min(1).max(300).optional(),
    attackKey: z.string().trim().min(1).max(240).optional(),
  }).strict(),
  death_save: noArguments,
  loot: z
    .object({
      corpseId: z.string().trim().min(1).max(120).optional(),
      items: z.array(lootItemSchema).max(50).default([]),
      rewardXp: z.number().int().nonnegative().max(1_000_000).default(0),
      rewardCopper: z.number().int().nonnegative().max(100_000_000).default(0),
      questId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  rest: z.object({ restType: z.enum(["short", "long"]).default("long") }).strict(),
  project: z.object({ action: z.enum(["start", "work"]), projectId: z.string().trim().min(1).max(120) }).strict(),
  tutorial_advance: noArguments,
  roll_check: z
    .object({
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
      passive: z.boolean().optional(),
    })
    .strict(),
};

export const enginePlayerOnlyToolNames = [
  "experience_profile_update",
  "experience_feedback_add",
  "experience_boundary",
] as const satisfies readonly EngineToolName[];
const playerOnlyTools = new Set<EngineToolName>(enginePlayerOnlyToolNames);

export const engineReadOnlyToolNames = [
  "campaign_context",
  "capability_load",
  "content_search",
  "content_get",
  "rules_reference",
  "character_options",
  "player_notes",
  "npc_context",
  "merchant_catalog",
  "observe",
  "character_sheet",
  "inventory",
  "quest_progress",
  "combat_state",
  "controlled_actor_context",
  "party_context",
  "situation_context",
] as const satisfies readonly EngineToolName[];
export type EngineReadOnlyToolName = (typeof engineReadOnlyToolNames)[number];
const readOnlyTools = new Set<EngineToolName>(engineReadOnlyToolNames);

const inventoryItemJsonSchema = {
  oneOf: [
    {
      type: "object",
      description: "A pinned Open5e item reference. Use content_search first and copy the exact contentKey; definitions and mechanics are server-owned.",
      properties: {
        id: { type: "string", description: "Stable instance id within this campaign context." },
        contentKey: { type: "string", description: "Exact open5e:item or open5e:magic-item content key." },
        quantity: { type: "integer", minimum: 0 },
        slot: { type: "string", enum: ["mainhand", "offhand", "armor", "head", "feet", "accessory"] },
        equipped: { type: "boolean" },
        attuned: { type: "boolean" },
      },
      required: ["id", "contentKey", "quantity"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "A campaign-authored item only when Open5e has no suitable definition. Supplied typed fields become authoritative after validation.",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", enum: ["weapon", "armor", "consumable", "quest", "misc", "tool", "ammunition", "treasure"] },
        quantity: { type: "integer", minimum: 0 },
        weight: { type: "number", minimum: 0 },
        healing: { type: "integer", minimum: 0 },
        description: { type: "string" },
        slot: { type: "string", enum: ["mainhand", "offhand", "armor", "head", "feet", "accessory"] },
        equipped: { type: "boolean" },
        attunementRequired: { type: "boolean" },
        attuned: { type: "boolean" },
        valueCopper: { type: "integer", minimum: 0 },
        properties: { type: "array", items: { type: "string" } },
        damage: { type: "string" },
        armorClass: { type: "integer", minimum: 0 },
        containerCapacity: { type: "number", minimum: 0 },
        ammunitionId: { type: "string" },
        effectKey: { type: "string", enum: ["lantern-ward-v1"] },
        isMagic: { type: "boolean" },
        mechanicsTier: { type: "integer", enum: [0, 1, 2] },
      },
      required: ["id", "name", "kind", "quantity", "weight"],
      additionalProperties: false,
    },
  ],
} as const;

const merchantListingJsonSchema = {
  type: "object",
  properties: {
    item: inventoryItemJsonSchema,
    stock: { type: "integer", minimum: -1, description: "-1 means unlimited stock." },
    buyPriceCopper: { type: "integer", minimum: 0 },
    sellPriceCopper: { type: "integer", minimum: 0 },
  },
  required: ["item", "stock", "buyPriceCopper", "sellPriceCopper"],
  additionalProperties: false,
} as const;

const npcPatchJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    disposition: { type: "string", enum: ["hostile", "unfriendly", "neutral", "friendly", "helpful"] },
    goals: { type: "array", maxItems: 12, items: { type: "string" } },
    relationshipScore: { type: "integer", minimum: -100, maximum: 100, description: "Reserved authoritative field. Do not supply it: every supplied value is rejected." },
    memories: { type: "array", maxItems: 20, items: { type: "string" } },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

const merchantPatchJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    disposition: { type: "string", enum: ["hostile", "unfriendly", "neutral", "friendly", "helpful"] },
    stolenGoodsPolicy: { type: "string", enum: ["refuse-known", "fence"], description: "Reviewed merchant role. The engine still owns recognition, price adjustment, risk, and the transaction outcome." },
    items: {
      type: "array",
      maxItems: 100,
      items: merchantListingJsonSchema,
    },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

const npcPatchOperationsJsonSchema = {
  type: "object",
  description: "Omit this property to preserve every existing NPC. Use nonempty upsert and/or remove arrays when changing NPCs.",
  properties: {
    upsert: { type: "array", maxItems: 20, items: npcPatchJsonSchema },
    remove: { type: "array", maxItems: 20, items: { type: "string" } },
  },
  anyOf: [
    { required: ["upsert"], properties: { upsert: { type: "array", minItems: 1, maxItems: 20, items: npcPatchJsonSchema } } },
    { required: ["remove"], properties: { remove: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } } } },
  ],
  additionalProperties: false,
} as const;

const merchantPatchOperationsJsonSchema = {
  type: "object",
  description: "Omit this property to preserve every existing merchant. Use nonempty upsert and/or remove arrays when changing merchant catalogs.",
  properties: {
    upsert: { type: "array", maxItems: 20, items: merchantPatchJsonSchema },
    remove: { type: "array", maxItems: 20, items: { type: "string" } },
  },
  anyOf: [
    { required: ["upsert"], properties: { upsert: { type: "array", minItems: 1, maxItems: 20, items: merchantPatchJsonSchema } } },
    { required: ["remove"], properties: { remove: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } } } },
  ],
  additionalProperties: false,
} as const;

const worldFactPatchOperationsJsonSchema = {
  type: "object",
  properties: {
    upsert: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: ["object", "secret", "trap", "area"] }, title: { type: "string" }, description: { type: "string" }, visibility: { type: "string", enum: ["public", "hidden"] }, obscurity: { type: "string", enum: ["clear", "dark"] }, requiredSense: { type: "string", enum: ["normal", "darkvision", "blindsight", "tremorsense", "hearing"] }, passiveDc: { type: ["integer", "null"], minimum: 1, maximum: 30 } }, required: ["id", "kind", "title", "description", "visibility"], additionalProperties: false }, maxItems: 40 },
    remove: { type: "array", items: { type: "string" }, maxItems: 40 },
  },
  additionalProperties: false,
};

const runtimeContentCompileJsonSchema = (() => {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(
    engineContentCompileArgsSchema,
    { unrepresentable: "any" },
  ) as Record<string, unknown>;
  return jsonSchema;
})();

export const lanternToolDefinitions: EngineToolDefinition[] = [
  tool("campaign_context", "Read the campaign profile, emergent world context if one exists, character, notes, combat, quest, and recent log. Read-only.", {}),
  tool(
    "capability_load",
    "Load one reviewed capability family's detailed tool schemas. Loading changes visibility only; it never grants authority or mutates campaign state.",
    {
      type: "object",
      properties: {
        familyId: {
          type: "string",
          enum: [...engineCapabilityFamilyIdSchema.options],
        },
      },
      required: ["familyId"],
      additionalProperties: false,
    },
  ),
  tool(
    "content_search",
    "Search the campaign's pinned Open5e content pack. Results are game-system, document, and license gated and include their actual fidelity tier. Read-only.",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "Case-insensitive name, key, or kind fragment. Omit to list a collection." },
        collection: { type: "string", enum: [...OPEN5E_COLLECTIONS] },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    }
  ),
  tool(
    "content_get",
    "Get one exact content definition from the campaign's pinned Open5e pack. This displays reference/structured/compiled data but never mutates campaign state. Read-only.",
    {
      type: "object",
      properties: { contentKey: { type: "string" } },
      required: ["contentKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "content_compile",
    "Compile a strict campaign-scoped item, location, or spell proposal into canonical runtime content, or update one canonical location exit through exitPatch. A mundane item already established by released narration, current world context, or an actor-safe world fact may use materialization plus a stable instanceKey to create one linked world object; validation hashes that evidence, derives the object definition, and returns its canonical id. Equivalent stable item definitions are reused. For an executable spell, provide only synthesis {primitiveContentKey: exact reviewed open5e spell key, modification: damage-only}; validation derives and persists the bounded single-target damage effect from that primitive. Definitions, instances, relationships, and state remain separate; unknown fields and unreviewed mechanics are rejected.",
    runtimeContentCompileJsonSchema,
  ),
  tool(
    "rules_reference",
    "Search or load the campaign's pinned SRD-2014 rules text. Use this before ruling on exact mechanics instead of relying on memory. Read-only; reference prose never mutates state or implies an executable effect.",
    {
      type: "object",
      anyOf: [
        {
          properties: {
            action: { const: "search" },
            query: { type: "string", description: "A rule topic or phrase, such as grappling, cover, or falling." },
            collections: {
              type: "array",
              items: { type: "string", enum: [...RULE_REFERENCE_COLLECTIONS] },
              minItems: 1,
              maxItems: 4,
            },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
          required: ["action", "query"],
          additionalProperties: false,
        },
        {
          properties: {
            action: { const: "get" },
            contentKey: { type: "string", description: "Exact rule, ruleset, section, or plane contentKey returned by search." },
          },
          required: ["action", "contentKey"],
          additionalProperties: false,
        },
      ],
    }
  ),
  tool(
    "character_options",
    "List the campaign's source-backed level-one species, classes, backgrounds, alignments, languages, and required creation choices. Read-only.",
    {}
  ),
  tool(
    "world_context",
    "Establish or update the current fictional context, actors, merchants, and facts. This tool cannot create persistent objects or definitions; use content_compile materialization for a newly established actionable item, and typed interaction tools for existing object state. Omitted collections are preserved.",
    {
      type: "object",
      properties: {
        title: { type: "string", description: "The current place or situation as the player would understand it." },
        description: { type: "string", description: "What is true and immediately relevant in this context." },
        features: { type: "array", items: { type: "string" }, description: "Important people, objects, hazards, clues, or features currently present." },
        exits: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false }, description: "Only meaningful destinations the player can currently pursue." },
        npcs: npcPatchOperationsJsonSchema,
        merchants: merchantPatchOperationsJsonSchema,
        facts: worldFactPatchOperationsJsonSchema,
      },
      required: ["title", "description", "features", "exits"],
      additionalProperties: false,
    }
  ),
  tool(
    "procedural_notice",
    "Persist a player-safe formal notice and its delivery state. Use this for sealed letters, warrants, orders, dockets, or clerk procedures instead of prose-only narration. Upsert requires the exact operative terms: authorized action, actor scope, admissible/excluded evidence, response window or deadline, attendance, custody effect, and the next changing event. Restricted records never belong in these fields. Authorize, deliver, and resolve the notice explicitly; copy or clarification requests always return the minimum operative projection even when the request is denied.",
    {
      type: "object",
      properties: {
        action: { type: "string", enum: ["upsert", "authorize", "deliver", "request_copy", "request_clarification", "resolve", "withdraw"] },
        noticeId: { type: "string", description: "Stable notice id for an existing formal notice." },
        notice: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            terms: {
              type: "object",
              properties: {
                authorizedAction: { type: "string" },
                actorScope: { type: "string" },
                admissibleEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
                excludedEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
                responseWindow: { type: "string" },
                deadlineAtMinutes: { type: ["integer", "null"], minimum: 0 },
                attendance: { type: "string" },
                custodyEffect: { type: "string" },
                nextChange: { type: "string" },
                copy: { type: "object", properties: { allowed: { type: "boolean" }, denialReason: { type: "string" } }, required: ["allowed"], additionalProperties: false },
                clarification: { type: "object", properties: { allowed: { type: "boolean" }, denialReason: { type: "string" } }, required: ["allowed"], additionalProperties: false },
              },
              required: ["authorizedAction", "actorScope", "admissibleEvidence", "excludedEvidence", "responseWindow", "attendance", "custodyEffect", "nextChange", "copy", "clarification"],
              additionalProperties: false,
            },
          },
          required: ["id", "title", "terms"],
          additionalProperties: false,
        },
        requestText: { type: "string", description: "Optional player request recorded without exposing restricted records." },
      },
      required: ["action"],
      additionalProperties: false,
    }
  ),
  tool(
    "challenge_attempt",
    "Adjudicate a reviewed challenge. The server decides automatic, impossible, or uncertain feasibility, the final DC, bounded outcomes, costs, and retry policy; no caller-authored DC or consequence is accepted. For a locked typed object, use barred-door-v1 to force it with Athletics or pick-lock-v1 to pick it with Thieves' Tools, and always provide that exact worldContext object targetId. A generic roll_check cannot change object state.",
    {
      type: "object",
      properties: {
        challengeId: { type: "string", description: "Reviewed challenge id or supported alias." },
        goal: { type: "string", description: "The concrete outcome the actor is pursuing." },
        approach: { type: "string", description: "The actor's current approach; retrying it without a changed approach or situation is blocked." },
        targetId: { type: "string", description: "Exact established world-object id. Required when barred-door-v1 or pick-lock-v1 acts on a typed locked object." },
        sceneId: { type: "string", description: "Optional stable scene/situation id used for retry identity." },
        difficultyBand: { type: "string", enum: ["gentle", "standard", "challenging"], description: "Optional model proposal recorded as evidence; the active player profile selects the final band." },
        requestedStakes: { type: "array", items: { type: "string", enum: ["time", "noise", "exposure", "opportunity"] }, maxItems: 4, description: "Optional model-proposed stakes; the reviewed challenge definition controls the final stakes." },
        factId: { type: "string", description: "For search-hidden-fact-v1 only: opaque target fact id; the engine never echoes an unavailable fact." },
        helperId: { type: "string", description: "Optional legal helper actor/NPC; the engine validates eligibility and supplies at most one advantage source." },
        opponentId: { type: "string", description: "Optional established opponent id for a reviewed opposed challenge." },
        informationPolicy: { type: "string", enum: ["public", "withheld"], description: "Whether player-facing check details are public; full evidence remains authoritative." },
        tool: { type: "string", description: "Optional tool proficiency key; the engine validates the character owns it." },
      },
      required: ["challengeId", "goal", "approach"],
      additionalProperties: false,
    }
  ),
  tool("player_notes", "Read durable player-authored notes and explicitly recorded campaign facts. Read-only.", {}),
  tool(
    "player_note_add",
    "Record a durable fact, goal, preference, promise, or other note only when the player explicitly states or clearly confirms it. Do not invent private facts.",
    {
      type: "object",
      properties: { text: { type: "string" }, source: { type: "string", enum: ["dm", "player"] } },
      required: ["text"],
      additionalProperties: false,
    }
  ),
  tool("npc_context", "Read NPCs currently established in the current context, including goals, disposition, relationship score, and memories. Read-only.", {}),
  tool("merchant_catalog", "Read authoritative merchant catalogs, stock, and prices established in the current context. Read-only.", {}),
  tool("observe", "Read the current authored world context if one exists, plus encounter status. Read-only.", {}),
  tool(
    "move",
    "Move through one currently available persisted exit. Returns the committed destination and movement evidence.",
    {
      type: "object",
      properties: { destinationId: { type: "string", description: "The exit id from the current world context." } },
      required: ["destinationId"],
      additionalProperties: false,
    }
  ),
  tool(
    "travel",
    "Resolve one reviewed overland journey. The engine derives distance, elapsed time, navigation, supplies, watches, weather, and random-event evidence.",
    {
      type: "object",
      properties: {
        routeId: { type: "string", description: "A reviewed route profile id; the engine rejects unreviewed routes." },
        destinationId: { type: "string", description: "An exit id from the current world context." },
        pace: { type: "string", enum: ["normal", "fast"] },
        navigatorId: { type: "string", description: "Optional established actor reference; current actor only in this slice." },
        watcherId: { type: "string", description: "Optional established actor reference; current actor only in this slice." },
      },
      required: ["routeId", "destinationId", "pace"],
      additionalProperties: false,
    }
  ),
  tool(
    "interact",
    "Record a concrete fictional action against an established feature. Use social_check for a social contest, merchant_trade for commerce, and improvise for a mechanically meaningful stunt; do not leave NPCs waiting for an unspecified consequence.",
    {
      type: "object",
      properties: {
        targetId: { type: "string", description: "A feature or object identifier from the current context." },
        goal: { type: "string", description: "What the player is trying to do." },
        affordance: { type: "string", enum: ["inspect", "open", "close", "lock", "unlock", "move", "carry", "throw", "take", "give", "drop", "steal", "equip", "use", "ignite", "extinguish", "break", "damage", "attach", "activate"], description: "A reviewed world-object affordance. Omit only for legacy narration-only interaction." },
        sourceId: { type: "string", description: "A referenced source object for attach/ignite/prerequisite interactions." },
        destinationId: { type: "string", description: "A reviewed destination reference for move/carry/throw/drop interactions." },
      },
      required: ["targetId", "goal"],
      additionalProperties: false,
    }
  ),
  tool(
    "social_check",
    "Resolve meaningful social uncertainty against an NPC established in the current context. Provide the intended goal and actingNpcId when another established NPC acts for the player. The server owns the d20, modifier, DC, attribution, and relationship update; the player remains the roller until reviewed NPC actor mechanics exist.",
    {
      type: "object",
      properties: { npcId: { type: "string" }, actingNpcId: { type: "string", description: "Optional established NPC who speaks or acts for the player; this does not replace the player as roller." }, ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] }, skill: { type: "string" }, goal: { type: "string" } },
      required: ["npcId", "ability", "goal"],
      additionalProperties: false,
    }
  ),
  tool(
    "npc_tick",
    "Run exactly one bounded NPC agency step at an explicit authoritative trigger. The engine computes finite legal offers, filters actor knowledge, applies deterministic fallback, and commits at most one action.",
    {
      type: "object",
      properties: {
        trigger: { type: "string", enum: ["time_advance", "scene_enter", "scene_exit", "witnessed_event", "quest_clock", "combat_turn", "operator_batch"] },
        triggerId: { type: "string", description: "Stable trigger identifier; replaying it cannot repeat the action." },
        npcId: { type: "string", description: "Optional agency-enabled NPC; omitted selects the first eligible actor." },
        offerId: { type: "string", enum: ["move_to_schedule", "report_crime", "rest", "trade_resource", "no_op"], description: "Optional bounded offer selection. Omit to use deterministic policy fallback." },
        provider: { type: "string", enum: ["deterministic", "openrouter"], description: "Deterministic policy is the default. OpenRouter is guarded and falls back without a network call in this first slice." },
      },
      required: ["trigger", "triggerId"],
      additionalProperties: false,
    }
  ),
  tool(
    "merchant_trade",
    "Resolve an immediate purchase, sale, or explicit offer against an authored merchant catalog. Stolen-property recognition, fence pricing, heat, ownership, and the final outcome are server-owned. No pending merchant deliberation is stored; submit only a deal ready to resolve.",
    {
      type: "object",
      properties: { merchantId: { type: "string" }, itemId: { type: "string" }, side: { type: "string", enum: ["buy", "sell", "offer"] }, quantity: { type: "integer", minimum: 1 }, offerUnitPriceCopper: { type: "integer", minimum: 0 } },
      required: ["merchantId", "itemId", "side", "quantity"],
      additionalProperties: false,
    }
  ),
  tool(
    "social_action",
    "Record one authoritative social consequence: make or resolve a promise, steal one established marked item while recording witnessed or unwitnessed evidence, or pass a bounded rumor. The engine owns ownership, theft provenance, heat, trust, reputation, evidence status, and delayed propagation; never provide those outcomes directly.",
    {
      type: "object",
      properties: {
        action: { type: "string", enum: ["promise", "fulfill_promise", "breach_promise", "theft", "rumor"] },
        targetId: { type: "string", description: "Established NPC or merchant for a promise, victim for theft, or recipient for a rumor." },
        promiseId: { type: "string", description: "Existing open promise for fulfillment or breach." },
        terms: { type: "string", description: "Concrete promise terms; required for a new promise." },
        deadlineMinutes: { type: "integer", minimum: 1, description: "Optional server-relative deadline for a new promise." },
        itemId: { type: "string", description: "Item identifier for a theft evidence record." },
        witnessId: { type: "string", description: "Established witness; omission records an allegation rather than proven evidence." },
        rumorText: { type: "string", description: "Bounded content of a rumor; it is never treated as truth by repetition." },
        truthRelation: { type: "string", enum: ["true", "false", "unknown"], description: "Authoritative source relation for a rumor; propagation does not change it." },
      },
      required: ["action"],
      additionalProperties: false,
    }
  ),
  tool(
    "quest_create",
    "Create an authored quest with a concrete objective and reward. Persistence and later reward application are atomic.",
    {
      type: "object",
      properties: { title: { type: "string" }, objective: { type: "string" }, rewardXp: { type: "integer", minimum: 0 }, rewardCopper: { type: "integer", minimum: 0 }, giverNpcId: { type: "string" }, deadline: { type: "string" }, deadlineAtMinutes: { type: "integer", minimum: 0 }, graph: { type: "object", description: "Closed typed objectives, predicates, branches, and optional bounded clock for an authoritative quest graph." } },
      required: ["title", "objective", "rewardXp", "rewardCopper"],
      additionalProperties: false,
    }
  ),
  tool(
    "quest_transition",
    "Resolve one authored quest-graph branch. Predicates are evaluated from committed state; narration cannot complete objectives or grant rewards.",
    {
      type: "object",
      properties: { questId: { type: "string" }, transitionId: { type: "string" }, choiceId: { type: "string" } },
      required: ["questId", "transitionId"],
      additionalProperties: false,
    }
  ),
  tool(
    "quest_update",
    "Update progress or status for an authored quest and persist its journal entry and completion state.",
    {
      type: "object",
      properties: { questId: { type: "string" }, status: { type: "string", enum: ["active", "completed", "failed", "abandoned", "expired"] }, objective: { type: "string" }, progress: { type: "integer", minimum: 0, maximum: 100 } },
      required: ["questId"],
      additionalProperties: false,
    }
  ),
  tool(
    "improvise",
    "Apply an authored rule-of-cool stunt or effect. The creative description is recorded, while only the typed mechanical consequence is applied. After a check, a non-mechanical fictional sceneMove may bind a concrete caused consequence to the exact provisionalEffectIndex and outcome returned by an earlier tool round. It cannot reveal facts, move actors, or apply mechanics; use the existing authoritative tool for those changes.",
    {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        effectType: { type: "string", enum: ["fictional", "advantage", "disadvantage", "condition", "damage", "healing", "movement", "summoning"] },
        targetId: { type: "string" },
        amount: { type: "integer", minimum: 0 },
        durationRounds: { type: "integer", minimum: 1 },
        condition: { type: "string" },
        checkCategory: { type: "string", enum: ["attack-roll", "ability-check", "saving-throw"] },
        sceneMove: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["reaction", "cost", "pressure", "choice", "closure"] },
            sourceEffectIndex: { type: "integer", minimum: 0, maximum: 15 },
            outcome: { type: "string", enum: ["success", "failure"] },
            nextDecision: { type: "string" },
          },
          required: ["category", "sourceEffectIndex", "outcome", "nextDecision"],
          additionalProperties: false,
        },
      },
      required: ["title", "description", "effectType"],
      additionalProperties: false,
    }
  ),
  tool(
    "campaign_beat",
    "Commit a proactive story beat: a new pressure, immediate situation, and concrete choices. This is a campaign driver, not a room or fixed scene graph.",
    {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" }, pressure: { type: "string" }, choices: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 } },
      required: ["title", "description", "pressure", "choices"],
      additionalProperties: false,
    }
  ),
  tool("character_sheet", "Read the authoritative character sheet and derived combat values. Read-only.", {}),
  tool(
    "character_roll_stats",
    "Roll one level-one ability-score set using the Open5e 5e rule: roll 4d6, drop the lowest die, and repeat six times. The player assigns the resulting scores during character creation.",
    {
      type: "object",
      properties: { method: { type: "string", enum: ["rolled"] } },
      required: ["method"],
      additionalProperties: false,
    }
  ),
  tool(
    "character_create",
    "Create a source-backed level-one character before the first campaign action. Use character_options and pass exact content keys; the legacy four-preset fields remain compatibility-only.",
    {
      type: "object",
      properties: {
        name: { type: "string" },
        speciesKey: { type: "string", description: "Exact selectable open5e:species content key from character_options." },
        classKey: { type: "string", description: "Exact selectable open5e:class content key from character_options." },
        backgroundKey: { type: "string", description: "Exact open5e:background content key from character_options." },
        alignmentKey: { type: "string", description: "Exact open5e:alignment content key from character_options." },
        abilityBonusChoices: { type: "array", items: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] } },
        skillKeys: { type: "array", items: { type: "string" }, description: "Exact class skill content keys; count and allowed options are engine-validated." },
        languageKeys: { type: "array", items: { type: "string" }, description: "Exact chosen language content keys; fixed species languages are added automatically." },
        toolProficiencies: { type: "array", items: { type: "string" } },
        species: { type: "string", enum: ["human", "dwarf", "elf", "halfling"], description: "Legacy compatibility field." },
        className: { type: "string", enum: ["barbarian", "fighter", "rogue", "wizard"], description: "Legacy compatibility field." },
        background: { type: "string" },
        alignment: { type: "string" },
        abilityScoreMethod: { type: "string", enum: ["class_default", "standard_array", "rolled"] },
        abilityScoreDraftId: { type: "string", format: "uuid" },
        abilityScores: { type: "object" },
      },
      required: ["name"],
      anyOf: [
        { required: ["speciesKey", "classKey"] },
        { required: ["species", "className"] },
      ],
      additionalProperties: false,
    }
  ),
  tool("character_update", "Update player-authored character identity and durable sheet details such as personality, appearance, backstory, allies, treasure, inspiration, and temporary hit points.", { type: "object", properties: { name: { type: "string" }, background: { type: "string", description: "Legacy campaigns only." }, alignment: { type: "string", description: "Legacy campaigns only." }, description: { type: "string" }, abilityScores: { type: "object", description: "Legacy campaigns only." }, details: { type: "object", description: "Character sheet details such as appearance, personalityTraits, ideals, bonds, flaws, backstory, allies, treasure, inspiration, and temporaryHp." } }, additionalProperties: false }),
  tool("inventory", "Read authoritative items, quantities, gold, and carry weight. Read-only.", {}),
  tool(
    "inventory_transfer",
    "Move an owned item stack between the character root and an owned bounded container. The engine owns location, quantity splitting, nesting, and capacity validation.",
    {
      type: "object",
      properties: {
        itemId: { type: "string", description: "Stable item instance or stack id from inventory." },
        targetContainerId: { type: "string", description: "Owned container instance id; omit to move the stack to the character root." },
        quantity: { type: "integer", minimum: 1, maximum: 100, description: "Quantity to move; defaults to one." },
      },
      required: ["itemId"],
      additionalProperties: false,
    }
  ),
  tool("equip_item", "Equip a weapon or armor item in an equipment slot; the engine updates armor class.", { type: "object", properties: { itemId: { type: "string" }, slot: { type: "string", enum: ["mainhand", "offhand", "armor", "head", "feet", "accessory"] } }, required: ["itemId", "slot"], additionalProperties: false }),
  tool("unequip_item", "Unequip one item and recalculate armor class.", { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"], additionalProperties: false }),
  tool("drop_item", "Remove a quantity of an item from the player inventory.", { type: "object", properties: { itemId: { type: "string" }, quantity: { type: "integer", minimum: 1 } }, required: ["itemId"], additionalProperties: false }),
  tool(
    "use_item",
    "Use one item from the authoritative inventory. Consumable effects and consumption commit atomically.",
    {
      type: "object",
      properties: { itemId: { type: "string", description: "The item id from inventory." } },
      required: ["itemId"],
      additionalProperties: false,
    }
  ),
  tool("quest_progress", "Read objective and reward progress. Read-only.", {}),
  tool("combat_state", "Read encounter status, turn owner, action economy, enemies, and target HP. Read-only.", {}),
  tool("controlled_actor_context", "Read controlled companions and summons, their independent state, senses, knowledge, and legal controller-turn commands. Read-only.", {}),
  tool(
    "controlled_actor_create",
    "Create one fixed familiar or temporary summon profile. The engine owns identity, stats, senses, duration, and source linkage; callers cannot author them.",
    {
      type: "object",
      properties: { profileId: { type: "string", enum: ["familiar-scout-v1", "summon-scout-v1"] } },
      required: ["profileId"],
      additionalProperties: false,
    }
  ),
  tool(
    "controlled_actor_command",
    "Command one controlled familiar or summon during the controller's turn. The engine owns action/bonus cost, target validation, fixed attack, guard, follow, and fallback behavior.",
    {
      type: "object",
      properties: {
        actorId: { type: "string" },
        action: { type: "string", enum: ["attack", "guard", "follow"] },
        targetId: { type: "string" },
      },
      required: ["actorId", "action"],
      additionalProperties: false,
    }
  ),
  tool(
    "controlled_actor_dismiss",
    "Dismiss one controlled companion or summon. Dismissal is authoritative, replay-safe, and removes source-linked effects.",
    { type: "object", properties: { actorId: { type: "string" } }, required: ["actorId"], additionalProperties: false }
  ),
  tool("party_context", "Read the current party membership, active viewpoint, personal/shared ownership policy, split scenes, and shared container. Only the active viewpoint knowledge projection is exposed.", {}),
  tool("party_create", "Create the single-player party around the PC and active controlled actors. Membership, leadership, consent, and reward allocation are server-owned.", {}),
  tool("party_set_viewpoint", "Switch the active presentation viewpoint to a party member without transferring ownership or revealing another actor's hidden knowledge.", { type: "object", properties: { actorId: { type: "string" } }, required: ["actorId"], additionalProperties: false }),
  tool("party_split", "Place one allied actor in an explicit separate scene context. The party remains one authorized group and can rejoin later.", { type: "object", properties: { actorId: { type: "string" }, sceneId: { type: "string" }, locationRef: { type: "string" } }, required: ["actorId", "sceneId"], additionalProperties: false }),
  tool("party_rejoin", "Reunite all party members in the current world context and restore a coherent shared scene.", {}),
  tool("party_shared_transfer", "Move a typed owned item between one party member's personal inventory and the explicit shared container exactly once.", { type: "object", properties: { actorId: { type: "string" }, itemId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 100 }, direction: { type: "string", enum: ["to_shared", "from_shared"] } }, required: ["actorId", "itemId", "direction"], additionalProperties: false }),
  tool("party_group_check", "Resolve one reviewed server-owned group ability check. The leader's derived modifier and bounded ally assistance determine the result; model text cannot author the roll or DC.", { type: "object", properties: { ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] }, skill: { type: "string" }, goal: { type: "string" }, actorIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 } }, required: ["ability", "goal", "actorIds"], additionalProperties: false }),
  tool("situation_context", "Read the active situation's actor-safe nodes, public clue leads, discovered revelations, functional-role status, pressure, and currently legal outcomes. Hidden facts and undiscovered clue findings remain redacted.", {}),
  tool("situation_create", "Commit one authored open situation before affected choices. Supply nodes, truths, redundant clues, actor goals/knowledge, functional roles/fallbacks, pressure, references to already-canonical hard objects/actors, and declarative outcomes. This tool cannot create an NPC, object, trap, treasure, or exit after the player searches.", (() => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(toolArgumentSchemas.situation_create, { target: "draft-7" }) as Record<string, unknown>;
    return parameters;
  })()),
  tool("situation_visit", "Visit a connected location in the active situation; stable node identity and traversal order are engine-owned.", { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"], additionalProperties: false }),
  tool("situation_clue_attempt", "Resolve one authorized situation clue. Normally the engine owns the check, DC, discovery, and fail-forward complication. For an ordinary direct question, sourceActorId skips the roll only when that established present actor canonically knows the linked truth; the engine then commits the answer to player knowledge.", { type: "object", properties: { clueId: { type: "string" }, approach: { type: "string" }, sourceActorId: { type: "string" } }, required: ["clueId", "approach"], additionalProperties: false }),
  tool("situation_ignore", "Advance one fixed reviewed time boundary while leaving the active situation unattended; authoritative pressure advances only when its time boundary is due.", {}),
  tool("situation_choose", "Commit one currently available declarative outcome by the exact id returned from situation_context. Validates revelation, role, pressure, and critical-object requirements and returns committed outcome evidence.", { type: "object", properties: { outcomeId: { type: "string" } }, required: ["outcomeId"], additionalProperties: false }),
  tool(
    "combat_start",
    "Start an authored encounter using installed Open5e creature content keys. Search creatures first; never supply or invent stats.",
    {
      type: "object",
      properties: {
        encounterId: { type: "string" },
        encounterName: { type: "string" },
        lifecycleProfile: { type: "string", enum: ["guards-surrender-v1"], description: "Opt into the reviewed non-kill encounter lifecycle slice." },
        approach: {
          type: "object",
          properties: {
            challengeId: { type: "string", enum: ["stealth-perception-v1"] },
            groupIndex: { type: "integer", minimum: 0, maximum: 19 },
            goal: { type: "string" },
            approach: { type: "string" },
          },
          required: ["challengeId", "groupIndex", "goal", "approach"],
          additionalProperties: false,
        },
        creatures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              creatureKey: { type: "string", description: "Exact open5e:creature contentKey from content_search." },
              count: { type: "integer", minimum: 1, maximum: 20 },
              distanceFeet: { type: "number", minimum: 0, maximum: 100000, description: "Legacy setup hint used to derive an initial tactical cell; omit for an adjacent 5-foot default." },
              position: {
                type: "object",
                properties: {
                  frameId: { type: "string" },
                  x: { type: "integer" },
                  y: { type: "integer" },
                  z: { type: "integer", description: "Walking is limited to z=0 in this slice." },
                },
                required: ["frameId", "x", "y", "z"],
                additionalProperties: false,
              },
            },
            required: ["creatureKey", "count"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 20,
        },
        tactical: {
          type: "object",
          properties: {
            frameId: { type: "string" },
            bounds: {
              type: "object",
              properties: {
                minX: { type: "integer" },
                maxX: { type: "integer" },
                minY: { type: "integer" },
                maxY: { type: "integer" },
              },
              required: ["minX", "maxX", "minY", "maxY"],
              additionalProperties: false,
            },
            obstacles: { type: "array", items: { type: "object" } },
            difficultTerrain: { type: "array", items: { type: "object" } },
            playerPosition: { type: "object" },
          },
          required: ["frameId", "bounds"],
          additionalProperties: false,
        },
      },
      required: ["encounterId", "encounterName", "creatures"],
      additionalProperties: false,
    }
  ),
  tool(
    "encounter_decision",
    "Choose one legal response to a server-owned surrender or retreat offer. The engine validates morale, movement evidence, terminal outcome, and exactly-once reward state.",
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["accept_surrender", "reject_surrender", "capture", "retreat", "pursue", "continue_attack"] },
        targetId: { type: "string", description: "Guard id for surrender, capture, pursuit, or continued attack; omit for retreat." },
      },
      required: ["decision"],
      additionalProperties: false,
    }
  ),
  tool(
    "custody_action",
    "Commit a typed surrender, guard release, or escape. Include every established restrained actor and the established guard id. If the player escaped while companions remain captive, include those outstanding companion ids when requesting the source guard's release.",
    {
      type: "object",
      properties: {
        action: { type: "string", enum: ["surrender", "release", "escape"] },
        guardId: { type: "string", description: "Established guard or patrol NPC receiving surrender or authorizing release." },
        affectedActorIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8, description: "Established actor ids affected by surrender, or outstanding companion ids targeted by a source-guard release; include the player for surrender." },
      },
      required: ["action"],
      additionalProperties: false,
    }
  ),
  tool(
    "spawn_creature",
    "Add one or more instances of an installed Open5e creature to the active encounter. The engine copies no caller-supplied stats.",
    {
      type: "object",
      properties: {
        creatureKey: { type: "string", description: "Exact open5e:creature contentKey from content_search." },
        count: { type: "integer", minimum: 1, maximum: 20 },
        distanceFeet: { type: "number", minimum: 0, maximum: 100000, description: "Legacy setup hint used to derive an initial tactical cell." },
        position: {
          type: "object",
          properties: {
            frameId: { type: "string" },
            x: { type: "integer" },
            y: { type: "integer" },
            z: { type: "integer", description: "Walking is limited to z=0 in this slice." },
          },
          required: ["frameId", "x", "y", "z"],
          additionalProperties: false,
        },
      },
      required: ["creatureKey", "count"],
      additionalProperties: false,
    }
  ),
  tool(
    "learn_spell",
    "Add an installed Open5e spell or persisted runtime spell to a known-caster repertoire or wizard spellbook. The engine enforces class membership and level limits for Open5e content and canonical progression for runtime synthesis; use content_search or the prior content_compile result first.",
    {
      type: "object",
      properties: {
        spellKey: { type: "string", description: "Exact open5e:spell key from content_search or runtime:spell key returned by content_compile." },
      },
      required: ["spellKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "prepare_spell",
    "Prepare or unprepare one installed Open5e or persisted runtime spell. The engine enforces class lists, spellbook membership, spell level, and preparation capacity.",
    {
      type: "object",
      properties: {
        spellKey: { type: "string", description: "Exact open5e:spell key from content_search or runtime:spell key returned by content_compile." },
        prepared: { type: "boolean", description: "False unprepares the spell; defaults to true." },
      },
      required: ["spellKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "cast_spell",
    "Cast a learned or prepared Open5e or persisted runtime spell. The engine owns slots, action economy, attacks, saves, typed damage or healing, target count, concentration, reactions, and exact structured upcasting. Tier-0 prose is rejected without mutation.",
    {
      type: "object",
      properties: {
        spellKey: { type: "string", description: "Exact open5e:spell or runtime:spell key from the character spell list." },
        slotLevel: { type: "integer", minimum: 1, maximum: 9, description: "Optional slot level. Omit to use the lowest legal available slot." },
        targetIds: { type: "array", items: { type: "string" }, maxItems: 20, description: "Established combatant ids selected as affected targets." },
        reactionId: { type: "string", description: "Pending reaction id when resolving Shield through cast_spell." },
      },
      required: ["spellKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "reaction_response",
    "Resolve one server-offered incoming-hit reaction exactly once. Accept Shield to rederive armor class before the stored attack resolves, or decline to take the stored hit without spending a slot or reaction.",
    {
      type: "object",
      properties: {
        reactionId: { type: "string" },
        decision: { type: "string", enum: ["accept", "decline"] },
        spellKey: { type: "string", description: "Exact Shield spell content key when accepting." },
        slotLevel: { type: "integer", minimum: 1, maximum: 9 },
      },
      required: ["reactionId", "decision"],
      additionalProperties: false,
    }
  ),
  tool(
    "combat_action",
    "Take one legal combat action. The server owns turn order, action economy, attack rolls, damage, and target state.",
    {
      type: "object",
      properties: {
        action: { type: "string", enum: ["attack", "attack_nonlethal", "dodge", "dash", "disengage", "help", "ready", "second_wind"] },
        targetId: { type: "string" },
        weaponId: { type: "string", description: "Optional id of an equipped weapon; omitted uses mainhand." },
        goal: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    }
  ),
  tool(
    "combat_move",
    "Move the player along a bounded deterministic tactical path. The engine validates geometry revision, z=0 walking, footprint collision, corner clearance, and movement budget before committing.",
    {
      type: "object",
      properties: {
        geometryRevision: { type: "integer", minimum: 0 },
        destination: {
          type: "object",
          properties: {
            frameId: { type: "string" },
            x: { type: "integer" },
            y: { type: "integer" },
            z: { type: "integer", description: "Walking is limited to z=0 in this slice." },
          },
          required: ["frameId", "x", "y", "z"],
          additionalProperties: false,
        },
        path: { type: "array", items: { type: "object" }, maxItems: 400 },
      },
      required: ["geometryRevision", "destination"],
      additionalProperties: false,
    }
  ),
  tool("end_turn", "Explicitly end the player's combat turn and offer the opposition its turn.", {}),
  tool(
    "advancement_confirm",
    "Confirm the server-generated pending level-up preview. The engine derives every level consequence; callers cannot supply target stats or features.",
    {
      type: "object",
      properties: { pendingId: { type: "string", description: "Pending advancement id from the campaign session." } },
      required: ["pendingId"],
      additionalProperties: false,
    }
  ),
  tool(
    "npc_advance",
    "Apply the reviewed veteran v1 template once to one live encounter instance. Static Open5e content remains unchanged; revised CR/XP and instance provenance are persisted.",
    {
      type: "object",
      properties: {
        combatantId: { type: "string", description: "Live combatant instance id from combat_state." },
        templateId: { type: "string", enum: ["veteran"] },
      },
      required: ["combatantId", "templateId"],
      additionalProperties: false,
    }
  ),
  tool(
    "advance_turn",
    "Resolve the active creature's turn with a source-backed executable action. Choose actionKey from combat_state. Exact S7 multiattack and save/damage programs run atomically; incomplete prose, legendary timing, and unsupported fragments are rejected without mutation. attackKey remains a compatibility alias.",
    {
      type: "object",
      properties: {
        combatantId: { type: "string" },
        actionKey: { type: "string", description: "Creature actionKey or compiled effect-program contentKey." },
        attackKey: { type: "string", description: "Deprecated compatibility alias for a basic attack key." },
      },
      additionalProperties: false,
    }
  ),
  tool("death_save", "Resolve one death save while the character is unconscious at 0 HP.", {}),
  tool(
    "loot",
    "Resolve a defeated encounter's authored items and currency, optionally claiming one authored quest reward. Supplied content transfers atomically; no loot is invented.",
    {
      type: "object",
      properties: {
        corpseId: { type: "string", description: "Existing corpse/remains id for an authorized exactly-once transfer." },
        items: { type: "array", items: inventoryItemJsonSchema, maxItems: 50 },
        rewardXp: { type: "integer", minimum: 0 },
        rewardCopper: { type: "integer", minimum: 0 },
        questId: { type: "string" },
      },
      additionalProperties: false,
    }
  ),
  tool(
    "rest",
    "Take a rest outside active combat. Recovery is server-owned and transactional.",
    {
      type: "object",
      properties: { restType: { type: "string", enum: ["short", "long"], default: "long" } },
      additionalProperties: false,
    }
  ),
  tool(
    "project",
    "Start or work one reviewed downtime project. The engine derives work duration, material cost, progress, and completion.",
    {
      type: "object",
      properties: { action: { type: "string", enum: ["start", "work"] }, projectId: { type: "string" } },
      required: ["action", "projectId"],
      additionalProperties: false,
    }
  ),
  tool("tutorial_advance", "Advance the guided tutorial one step or enter the open campaign sandbox.", {}),
  tool(
    "roll_check",
    "Resolve one ability or skill check. The server chooses the DC, rolls the d20, applies the modifier, and persists the outcome.",
    {
      type: "object",
      properties: {
        ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] },
        skill: { type: "string" },
        goal: { type: "string" },
        passive: { type: "boolean", description: "Use the character's passive score instead of rolling a d20." },
      },
      required: ["ability", "goal"],
      additionalProperties: false,
    }
  ),
];

const modelFacingToolNames = new Set<EngineToolName>();

function assertToolRegistryParity(): void {
  const allToolNames = new Set<EngineToolName>(engineToolNameSchema.options);
  const argumentSchemaNames = Object.keys(toolArgumentSchemas) as EngineToolName[];
  if (
    argumentSchemaNames.length !== allToolNames.size
    || argumentSchemaNames.some((name) => !allToolNames.has(name))
  ) {
    throw new Error("Engine tool argument schemas do not match the engine tool enum.");
  }

  for (const name of enginePlayerOnlyToolNames) {
    if (!allToolNames.has(name)) {
      throw new Error(`Player-only engine tool is missing from the engine enum: ${name}`);
    }
  }
  for (const definition of lanternToolDefinitions) {
    const name = definition.function.name;
    if (modelFacingToolNames.has(name)) {
      throw new Error(`Duplicate model-facing engine tool definition: ${name}`);
    }
    if (playerOnlyTools.has(name)) {
      throw new Error(`Player-only engine tool was advertised to the DM: ${name}`);
    }
    assertArgumentPropertyParity(name, definition.function.parameters);
    modelFacingToolNames.add(name);
  }

  const expectedModelFacingNames = [...allToolNames].filter(
    (name) => !playerOnlyTools.has(name)
  );
  if (
    modelFacingToolNames.size !== expectedModelFacingNames.length
    || expectedModelFacingNames.some((name) => !modelFacingToolNames.has(name))
  ) {
    throw new Error("The model-facing engine catalog does not match the engine tool enum.");
  }
}

assertToolRegistryParity();

export function isModelFacingEngineToolName(value: string): value is EngineToolName {
  return isEngineToolName(value) && modelFacingToolNames.has(value);
}

export function isReadOnlyTool(toolName: EngineToolName): toolName is EngineReadOnlyToolName {
  return readOnlyTools.has(toolName);
}

export function parseToolArguments(toolName: EngineToolName, value: unknown): Record<string, unknown> {
  const parsed = toolArgumentSchemas[toolName].parse(value);
  return parsed as Record<string, unknown>;
}

export function commandForTool(toolName: EngineToolName, args: Record<string, unknown>): EngineCommand | null {
  if (isReadOnlyTool(toolName)) return null;
  switch (toolName) {
    case "move":
      return engineCommandSchema.parse({ kind: "move", destinationId: args.destinationId });
    case "travel":
      return engineCommandSchema.parse({ kind: "travel", routeId: args.routeId, destinationId: args.destinationId, pace: args.pace, navigatorId: args.navigatorId, watcherId: args.watcherId });
    case "world_context":
      return engineCommandSchema.parse({
        kind: "world_context",
        ...args,
      });
    case "content_compile":
      return engineCommandSchema.parse({
        kind: "content_compile",
        proposal: args.proposal,
        createInstance: args.createInstance,
        instanceKey: args.instanceKey,
        exitPatch: args.exitPatch,
        materialization: args.materialization,
      });
    case "procedural_notice":
      return engineCommandSchema.parse({
        kind: "procedural_notice",
        action: args.action,
        noticeId: args.noticeId,
        notice: args.notice,
        requestText: args.requestText,
      });
    case "player_note_add":
      return engineCommandSchema.parse({ kind: "player_note_add", text: args.text, source: args.source ?? "dm" });
    case "experience_profile_update":
      return engineCommandSchema.parse({ kind: "experience_profile_update", profile: args.profile });
    case "experience_feedback_add":
      return engineCommandSchema.parse({ kind: "experience_feedback_add", rating: args.rating, note: args.note });
    case "experience_boundary":
      return engineCommandSchema.parse({ kind: "experience_boundary", theme: args.theme, action: args.action });
    case "challenge_attempt":
      return engineCommandSchema.parse({
        kind: "challenge_attempt",
        challengeId: args.challengeId,
        goal: args.goal,
        approach: args.approach,
        targetId: args.targetId,
        sceneId: args.sceneId,
        difficultyBand: args.difficultyBand,
        requestedStakes: args.requestedStakes,
        factId: args.factId,
        helperId: args.helperId,
        opponentId: args.opponentId,
        informationPolicy: args.informationPolicy,
        tool: args.tool,
      });
    case "character_update":
      return engineCommandSchema.parse({ kind: "character_update", ...args });
    case "interact":
      return engineCommandSchema.parse({ kind: "interact", targetId: args.targetId, goal: args.goal, affordance: args.affordance, sourceId: args.sourceId, destinationId: args.destinationId });
    case "social_check":
      return engineCommandSchema.parse({ kind: "social_check", npcId: args.npcId, actingNpcId: args.actingNpcId, ability: args.ability, skill: args.skill, goal: args.goal });
    case "npc_tick":
      return engineCommandSchema.parse({ kind: "npc_tick", trigger: args.trigger, triggerId: args.triggerId, npcId: args.npcId, offerId: args.offerId, provider: args.provider });
    case "merchant_trade":
      return engineCommandSchema.parse({ kind: "merchant_trade", merchantId: args.merchantId, itemId: args.itemId, side: args.side, quantity: args.quantity, offerUnitPriceCopper: args.offerUnitPriceCopper });
    case "social_action":
      return engineCommandSchema.parse({
        kind: "social_action",
        action: args.action,
        targetId: args.targetId,
        promiseId: args.promiseId,
        terms: args.terms,
        deadlineMinutes: args.deadlineMinutes,
        itemId: args.itemId,
        witnessId: args.witnessId,
        rumorText: args.rumorText,
        truthRelation: args.truthRelation,
      });
    case "quest_create":
      return engineCommandSchema.parse({ kind: "quest_create", title: args.title, objective: args.objective, rewardXp: args.rewardXp, rewardCopper: args.rewardCopper, giverNpcId: args.giverNpcId, deadline: args.deadline, deadlineAtMinutes: args.deadlineAtMinutes, graph: args.graph });
    case "quest_transition":
      return engineCommandSchema.parse({ kind: "quest_transition", questId: args.questId, transitionId: args.transitionId, choiceId: args.choiceId });
    case "quest_update":
      return engineCommandSchema.parse({ kind: "quest_update", questId: args.questId, status: args.status, objective: args.objective, progress: args.progress });
    case "improvise":
      return engineCommandSchema.parse({ kind: "improvise", title: args.title, description: args.description, effectType: args.effectType, targetId: args.targetId, amount: args.amount, durationRounds: args.durationRounds, condition: args.condition, checkCategory: args.checkCategory, sceneMove: args.sceneMove });
    case "campaign_beat":
      return engineCommandSchema.parse({ kind: "campaign_beat", title: args.title, description: args.description, pressure: args.pressure, choices: args.choices });
    case "character_create":
      return engineCommandSchema.parse({
        kind: "character_create",
        name: args.name,
        speciesKey: args.speciesKey,
        classKey: args.classKey,
        species: args.species,
        className: args.className,
        backgroundKey: args.backgroundKey,
        alignmentKey: args.alignmentKey,
        background: args.background,
        alignment: args.alignment,
        abilityScoreMethod: args.abilityScoreMethod,
        abilityScoreDraftId: args.abilityScoreDraftId,
        abilityScores: args.abilityScores,
        abilityBonusChoices: args.abilityBonusChoices,
        skillKeys: args.skillKeys,
        languageKeys: args.languageKeys,
        toolProficiencies: args.toolProficiencies,
      });
    case "character_roll_stats":
      return engineCommandSchema.parse({ kind: "character_roll_stats", method: args.method });
    case "equip_item":
      return engineCommandSchema.parse({ kind: "equip_item", itemId: args.itemId, slot: args.slot });
    case "inventory_transfer":
      return engineCommandSchema.parse({ kind: "inventory_transfer", itemId: args.itemId, targetContainerId: args.targetContainerId, quantity: args.quantity ?? 1 });
    case "unequip_item":
      return engineCommandSchema.parse({ kind: "unequip_item", itemId: args.itemId });
    case "drop_item":
      return engineCommandSchema.parse({ kind: "drop_item", itemId: args.itemId, quantity: args.quantity ?? 1 });
    case "use_item":
      return engineCommandSchema.parse({ kind: "use_item", itemId: args.itemId });
    case "combat_action":
      return engineCommandSchema.parse({
        kind: "combat_action",
        action: args.action,
        targetId: args.targetId,
        weaponId: args.weaponId,
        goal: args.goal,
      });
    case "combat_move":
      return engineCommandSchema.parse({
        kind: "combat_move",
        geometryRevision: args.geometryRevision,
        destination: args.destination,
        path: args.path,
      });
    case "end_turn":
      return engineCommandSchema.parse({ kind: "end_turn" });
    case "controlled_actor_create":
      return engineCommandSchema.parse({ kind: "controlled_actor_create", profileId: args.profileId });
    case "controlled_actor_command":
      return engineCommandSchema.parse({ kind: "controlled_actor_command", actorId: args.actorId, action: args.action, targetId: args.targetId });
    case "controlled_actor_dismiss":
      return engineCommandSchema.parse({ kind: "controlled_actor_dismiss", actorId: args.actorId });
    case "party_create":
      return engineCommandSchema.parse({ kind: "party_create" });
    case "party_set_viewpoint":
      return engineCommandSchema.parse({ kind: "party_set_viewpoint", actorId: args.actorId });
    case "party_split":
      return engineCommandSchema.parse({ kind: "party_split", actorId: args.actorId, sceneId: args.sceneId, locationRef: args.locationRef });
    case "party_rejoin":
      return engineCommandSchema.parse({ kind: "party_rejoin" });
    case "party_shared_transfer":
      return engineCommandSchema.parse({ kind: "party_shared_transfer", actorId: args.actorId, itemId: args.itemId, quantity: args.quantity ?? 1, direction: args.direction });
    case "party_group_check":
      return engineCommandSchema.parse({ kind: "party_group_check", ability: args.ability, skill: args.skill, goal: args.goal, actorIds: args.actorIds });
    case "situation_create":
      return engineCommandSchema.parse({ kind: "situation_create", definition: args.definition, sourceRandomEventId: args.sourceRandomEventId });
    case "situation_visit":
      return engineCommandSchema.parse({ kind: "situation_visit", locationId: args.locationId });
    case "situation_clue_attempt":
      return engineCommandSchema.parse({ kind: "situation_clue_attempt", clueId: args.clueId, approach: args.approach, sourceActorId: args.sourceActorId });
    case "situation_ignore":
      return engineCommandSchema.parse({ kind: "situation_ignore" });
    case "situation_choose":
      return engineCommandSchema.parse({ kind: "situation_choose", outcomeId: args.outcomeId });
    case "advancement_confirm":
      return engineCommandSchema.parse({ kind: "advancement_confirm", pendingId: args.pendingId });
    case "npc_advance":
      return engineCommandSchema.parse({ kind: "npc_advance", combatantId: args.combatantId, templateId: args.templateId });
    case "combat_start":
      return engineCommandSchema.parse({
        kind: "combat_start",
        encounterId: args.encounterId,
        encounterName: args.encounterName,
        lifecycleProfile: args.lifecycleProfile,
        approach: args.approach,
        creatures: args.creatures,
        tactical: args.tactical,
      });
    case "encounter_decision":
      return engineCommandSchema.parse({
        kind: "encounter_decision",
        decision: args.decision,
        targetId: args.targetId,
      });
    case "custody_action":
      return engineCommandSchema.parse({
        kind: "custody_action",
        action: args.action,
        guardId: args.guardId,
        affectedActorIds: args.affectedActorIds,
      });
    case "spawn_creature":
      return engineCommandSchema.parse({
        kind: "spawn_creature",
        creatureKey: args.creatureKey,
        count: args.count,
        distanceFeet: args.distanceFeet,
        position: args.position,
      });
    case "learn_spell":
      return engineCommandSchema.parse({ kind: "learn_spell", spellKey: args.spellKey });
    case "prepare_spell":
      return engineCommandSchema.parse({
        kind: "prepare_spell",
        spellKey: args.spellKey,
        prepared: args.prepared ?? true,
      });
    case "cast_spell":
      return engineCommandSchema.parse({
        kind: "cast_spell",
        spellKey: args.spellKey,
        slotLevel: args.slotLevel,
        targetIds: args.targetIds ?? [],
        reactionId: args.reactionId,
      });
    case "reaction_response":
      return engineCommandSchema.parse({
        kind: "reaction_response",
        reactionId: args.reactionId,
        decision: args.decision,
        spellKey: args.spellKey,
        slotLevel: args.slotLevel,
      });
    case "advance_turn":
      return engineCommandSchema.parse({
        kind: "advance_turn",
        combatantId: args.combatantId,
        actionKey: args.actionKey,
        attackKey: args.attackKey,
      });
    case "death_save":
      return { kind: "death_save" };
    case "loot":
      return engineCommandSchema.parse({
        kind: "loot",
        corpseId: args.corpseId,
        items: args.items ?? [],
        rewardXp: args.rewardXp ?? 0,
        rewardCopper: args.rewardCopper ?? 0,
        questId: args.questId,
      });
    case "rest":
      return engineCommandSchema.parse({ kind: "rest", restType: args.restType ?? "long" });
    case "project":
      return engineCommandSchema.parse({ kind: "project", action: args.action, projectId: args.projectId });
    case "tutorial_advance":
      return { kind: "tutorial_advance" };
    case "roll_check":
      return engineCommandSchema.parse({
        kind: "roll_check",
        ability: args.ability,
        skill: args.skill,
        goal: args.goal,
        passive: args.passive,
      });
  }
  const exhaustiveToolName: never = toolName;
  return exhaustiveToolName;
}

export function executeReadTool(
  state: LanternCampaignState,
  toolName: EngineToolName,
  args: Record<string, unknown> = {},
  contentResolver: Open5eContentResolver | null = null
): EngineToolResult {
  if (!isReadOnlyTool(toolName)) {
    return {
      tool: toolName,
      readOnly: false,
      accepted: false,
      code: "not_read_only",
      message: "That tool requires a campaign command.",
      data: null,
      campaignVersion: state.version,
    };
  }
  if (toolName === "rules_reference") {
    if (!contentResolver) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "content_unavailable",
        message: "The pinned rules reference is not available to this engine process.",
        data: null,
        campaignVersion: state.version,
      };
    }
    try {
      if (args.action === "get") {
        const result = contentResolver.get(String(args.contentKey ?? ""), state.rulesVersion);
        if (!isRulesReferenceKind(result.normalized.kind)) {
          return {
            tool: toolName,
            readOnly: true,
            accepted: false,
            code: "rules_reference_wrong_kind",
            message: "That content key is installed, but it is not a rule, ruleset, section, or plane reference.",
            data: { contentKey: result.normalized.contentKey, kind: result.normalized.kind },
            campaignVersion: state.version,
          };
        }
        return {
          tool: toolName,
          readOnly: true,
          accepted: true,
          code: null,
          message: "Pinned rules reference loaded.",
          data: result,
          campaignVersion: state.version,
        };
      }
      const requestedCollections = Array.isArray(args.collections)
        ? args.collections as Open5eCollection[]
        : [...RULE_REFERENCE_COLLECTIONS];
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const results = requestedCollections
        .flatMap((collection) => contentResolver.search({
          query: String(args.query ?? ""),
          collection,
          limit,
          includeDescription: true,
        }, state.rulesVersion))
        .slice(0, limit);
      return {
        tool: toolName,
        readOnly: true,
        accepted: true,
        code: null,
        message: "Pinned rules-reference search completed.",
        data: { query: args.query, results },
        campaignVersion: state.version,
      };
    } catch (error) {
      if (error instanceof ContentAccessError) {
        return {
          tool: toolName,
          readOnly: true,
          accepted: false,
          code: error.code,
          message: error.message,
          data: { contentKey: error.contentKey },
          campaignVersion: state.version,
        };
      }
      throw error;
    }
  }
  if (toolName === "content_search" || toolName === "content_get") {
    if (!contentResolver) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "content_unavailable",
        message: "The pinned content pack is not available to this engine process.",
        data: null,
        campaignVersion: state.version,
      };
    }
    try {
      const data = toolName === "content_get"
        ? contentResolver.get(String(args.contentKey ?? ""), state.rulesVersion)
        : {
            results: contentResolver.search({
              query: typeof args.query === "string" ? args.query : undefined,
              collection: args.collection as Open5eCollection | undefined,
              limit: typeof args.limit === "number" ? args.limit : undefined,
            }, state.rulesVersion),
          };
      return {
        tool: toolName,
        readOnly: true,
        accepted: true,
        code: null,
        message: toolName === "content_get" ? "Pinned content record loaded." : "Pinned content search completed.",
        data,
        campaignVersion: state.version,
      };
    } catch (error) {
      if (error instanceof ContentAccessError) {
        return {
          tool: toolName,
          readOnly: true,
          accepted: false,
          code: error.code,
          message: error.message,
          data: { contentKey: error.contentKey },
          campaignVersion: state.version,
        };
      }
      throw error;
    }
  }
  if (toolName === "character_options") {
    const options = open5eCharacterOptions({
      gamesystem: state.contentPolicy.gamesystem,
      allowedDocuments: state.contentPolicy.allowedDocumentKeys,
      allowedLicenses: state.contentPolicy.allowedLicenseKeys,
    });
    if (options.rulesVersion !== state.rulesVersion) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "rules_version_mismatch",
        message: "This campaign is pinned to a different character-options pack.",
        data: { campaignRulesVersion: state.rulesVersion, availableRulesVersion: options.rulesVersion },
        campaignVersion: state.version,
      };
    }
    return {
      tool: toolName,
      readOnly: true,
      accepted: true,
      code: null,
      message: "Character options loaded from the pinned Open5e pack.",
      data: options,
      campaignVersion: state.version,
    };
  }
  return {
    tool: toolName,
    readOnly: true,
    accepted: true,
    code: null,
    message: "Authoritative " + toolName + " read.",
    data: readToolData(
      state,
      toolName as
      | "campaign_context"
      | "world_context"
      | "player_notes"
        | "npc_context"
        | "merchant_catalog"
        | "observe"
        | "character_sheet"
        | "inventory"
        | "quest_progress"
        | "combat_state"
        | "controlled_actor_context"
        | "party_context"
        | "situation_context"
    ),
    campaignVersion: state.version,
  };
}

function tool(
  name: EngineToolName,
  description: string,
  parameters: Record<string, unknown>
): EngineToolDefinition {
  return {
    type: "function",
    function: { name, description, parameters },
  };
}

function assertArgumentPropertyParity(name: EngineToolName, advertised: Record<string, unknown>): void {
  const runtime = z.toJSONSchema(toolArgumentSchemas[name], { unrepresentable: "any" }) as Record<string, unknown>;
  const runtimeProperties = topLevelPropertyNames(runtime);
  const advertisedProperties = topLevelPropertyNames(advertised);
  if (JSON.stringify(runtimeProperties) !== JSON.stringify(advertisedProperties)) {
    throw new Error(
      `Advertised arguments do not match the runtime schema for ${name}: runtime=${runtimeProperties.join(",")}; advertised=${advertisedProperties.join(",")}.`
    );
  }
}

function topLevelPropertyNames(schema: Record<string, unknown>): string[] {
  const properties = schema.properties;
  const direct = properties && typeof properties === "object"
    ? Object.keys(properties)
    : [];
  const alternatives = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf) ? schema.oneOf : [];
  const alternativeProperties = alternatives.flatMap((candidate) =>
      candidate && typeof candidate === "object"
        ? topLevelPropertyNames(candidate as Record<string, unknown>)
        : []
    );
  return [...new Set([...direct, ...alternativeProperties])].sort();
}

function isRulesReferenceKind(kind: string): boolean {
  return kind === "rule" || kind === "ruleset" || kind === "section" || kind === "plane";
}

export function isEngineToolName(value: string): value is EngineToolName {
  return engineToolNameSchema.safeParse(value).success;
}
