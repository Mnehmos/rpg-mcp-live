import { z } from "zod";
import { ContentAccessError, type Open5eContentResolver } from "./content/resolve.js";
import { OPEN5E_COLLECTIONS, open5eCollectionSchema, type Open5eCollection } from "./content/schema.js";
import { readToolData } from "./engine-domain.js";
import { open5eCharacterOptions } from "./open5e-rules.js";
import {
  engineAbilitySchema,
  engineCharacterDetailsSchema,
  engineCommandSchema,
  engineInventoryItemInputSchema,
  engineToolNameSchema,
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
const npcSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).default(""),
    disposition: z.enum(["hostile", "unfriendly", "neutral", "friendly", "helpful"]).default("neutral"),
    goals: z.array(z.string().trim().min(1).max(240)).max(12).default([]),
    socialDc: z.number().int().min(1).max(30).default(12),
    relationshipScore: z.number().int().min(-100).max(100).default(0),
    memories: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  })
  .strict();
const merchantSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).default(""),
    disposition: z.enum(["hostile", "unfriendly", "neutral", "friendly", "helpful"]).default("neutral"),
    items: z
      .array(
        z
          .object({
            item: inventoryItemSchema,
            stock: z.number().int().min(-1),
            buyPriceCopper: z.number().int().nonnegative(),
            sellPriceCopper: z.number().int().nonnegative(),
          })
          .strict()
      )
      .max(100)
      .default([]),
  })
  .strict();
const worldContextArgsSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(6_000),
    features: z.array(z.string().trim().min(1).max(120)).max(20),
    exits: z
      .array(
        z
          .object({ id: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(160) })
          .strict()
      )
      .max(20),
    npcs: z.array(npcSchema).max(20).default([]),
    merchants: z.array(merchantSchema).max(20).default([]),
  })
  .strict();
const toolArgumentSchemas: Record<EngineToolName, z.ZodTypeAny> = {
  campaign_context: noArguments,
  content_search: z.object({
    query: z.string().trim().max(200).optional(),
    collection: open5eCollectionSchema.optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  content_get: z.object({
    contentKey: z.string().trim().min(1).max(300),
  }).strict(),
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
  world_context: worldContextArgsSchema,
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
  move: z.object({ destinationId: z.string().trim().min(1).max(80) }).strict(),
  interact: z
    .object({
      targetId: z.string().trim().min(1).max(80),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  social_check: z
    .object({
      npcId: z.string().trim().min(1).max(120),
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  merchant_trade: z
    .object({
      merchantId: z.string().trim().min(1).max(120),
      itemId: z.string().trim().min(1).max(120),
      side: z.enum(["buy", "sell", "offer"]),
      quantity: z.number().int().min(1).max(100),
      offerUnitPriceCopper: z.number().int().nonnegative().optional(),
    })
    .strict(),
  quest_create: z
    .object({
      title: z.string().trim().min(1).max(160),
      objective: z.string().trim().min(1).max(2_000),
      rewardXp: z.number().int().nonnegative().max(1_000_000),
      rewardCopper: z.number().int().nonnegative().max(100_000_000),
      giverNpcId: z.string().trim().min(1).max(120).optional(),
      deadline: z.string().trim().max(160).optional(),
    })
    .strict(),
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
  equip_item: z.object({ itemId: z.string().trim().min(1).max(120), slot: z.enum(["mainhand", "offhand", "armor", "head", "feet", "accessory"]) }).strict(),
  unequip_item: z.object({ itemId: z.string().trim().min(1).max(120) }).strict(),
  drop_item: z.object({ itemId: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(100).default(1) }).strict(),
  use_item: z.object({ itemId: z.string().trim().min(1).max(80) }).strict(),
  quest_progress: noArguments,
  combat_state: noArguments,
  combat_start: z
    .object({
      encounterId: z.string().trim().min(1).max(120),
      encounterName: z.string().trim().min(1).max(160),
      creatures: z
        .array(
          z
            .object({
              creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
              count: z.number().int().min(1).max(20),
              distanceFeet: z.number().nonnegative().max(100_000).default(30),
            })
            .strict()
        )
        .min(1)
        .max(20),
    })
    .strict(),
  spawn_creature: z.object({
    creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
    count: z.number().int().min(1).max(20),
    distanceFeet: z.number().nonnegative().max(100_000).default(30),
  }).strict(),
  learn_spell: z.object({
    spellKey: z.string().trim().startsWith("open5e:spell:").max(300),
  }).strict(),
  prepare_spell: z.object({
    spellKey: z.string().trim().startsWith("open5e:spell:").max(300),
    prepared: z.boolean().default(true),
  }).strict(),
  cast_spell: z.object({
    spellKey: z.string().trim().startsWith("open5e:spell:").max(300),
    slotLevel: z.number().int().min(1).max(9).optional(),
    targetIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  }).strict(),
  combat_action: z
    .object({
      action: z.enum(["attack", "dodge", "dash", "disengage", "help"]),
      targetId: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  advance_turn: z.object({
    combatantId: z.string().trim().min(1).max(120).optional(),
    actionKey: z.string().trim().min(1).max(300).optional(),
    attackKey: z.string().trim().min(1).max(240).optional(),
  }).strict(),
  death_save: noArguments,
  loot: z
    .object({
      items: z.array(lootItemSchema).max(50).default([]),
      rewardXp: z.number().int().nonnegative().max(1_000_000).default(0),
      rewardCopper: z.number().int().nonnegative().max(100_000_000).default(0),
      questId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  rest: z.object({ restType: z.enum(["short", "long"]).default("long") }).strict(),
  tutorial_advance: noArguments,
  roll_check: z
    .object({
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
};

const readOnlyTools = new Set<EngineToolName>([
  "campaign_context",
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
]);

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
      description: "A campaign-authored item only when Open5e has no suitable definition. The DM owns its fiction; the supplied typed fields become authoritative.",
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
      },
      required: ["id", "name", "kind", "quantity", "weight"],
      additionalProperties: false,
    },
  ],
} as const;

const merchantJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    disposition: { type: "string", enum: ["hostile", "unfriendly", "neutral", "friendly", "helpful"] },
    items: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        properties: {
          item: inventoryItemJsonSchema,
          stock: { type: "integer", minimum: -1, description: "-1 means unlimited stock." },
          buyPriceCopper: { type: "integer", minimum: 0 },
          sellPriceCopper: { type: "integer", minimum: 0 },
        },
        required: ["item", "stock", "buyPriceCopper", "sellPriceCopper"],
        additionalProperties: false,
      },
    },
  },
  required: ["id", "name", "items"],
  additionalProperties: false,
} as const;

export const lanternToolDefinitions: EngineToolDefinition[] = [
  tool("campaign_context", "Read the campaign profile, emergent world context if one exists, character, notes, combat, quest, and recent log. Read-only.", {}),
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
    "Establish or update the current fictional context. Use this when the player reaches a town, ship, battlefield, wilderness, or any other meaningful place; there is no fixed opening room or pre-authored map.",
    {
      type: "object",
      properties: {
        title: { type: "string", description: "The current place or situation as the player would understand it." },
        description: { type: "string", description: "What is true and immediately relevant in this context." },
        features: { type: "array", items: { type: "string" }, description: "Important people, objects, hazards, clues, or features currently present." },
        exits: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false }, description: "Only meaningful destinations the player can currently pursue." },
        npcs: { type: "array", description: "NPCs the DM is authoring into the current context, including social DCs and goals." },
        merchants: { type: "array", items: merchantJsonSchema, description: "Merchant catalogs authored by the DM. Prefer exact Open5e content references; prices and stock become authoritative for trade tools." },
      },
      required: ["title", "description", "features", "exits"],
      additionalProperties: false,
    }
  ),
  tool("player_notes", "Read durable notes about the player, including notes the player wrote and facts the DM explicitly recorded. Read-only.", {}),
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
  tool("merchant_catalog", "Read authoritative merchant catalogs, stock, and prices established by the DM in the current context. Read-only.", {}),
  tool("observe", "Read the current DM-authored world context if one exists, plus encounter status. Read-only.", {}),
  tool(
    "move",
    "Move along an exit returned by the current world_context. The DM must establish the next context after movement.",
    {
      type: "object",
      properties: { destinationId: { type: "string", description: "The exit id from the current world context." } },
      required: ["destinationId"],
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
      },
      required: ["targetId", "goal"],
      additionalProperties: false,
    }
  ),
  tool(
    "social_check",
    "Resolve a social ability or skill check against an NPC established in the current context. The DM authors the NPC and goal; the engine owns the d20, modifier, DC, and relationship update.",
    {
      type: "object",
      properties: { npcId: { type: "string" }, ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] }, skill: { type: "string" }, goal: { type: "string" } },
      required: ["npcId", "ability", "goal"],
      additionalProperties: false,
    }
  ),
  tool(
    "merchant_trade",
    "Resolve an immediate purchase, sale, or explicit offer against a DM-authored merchant catalog. No pending merchant deliberation is stored: use the tool only when the deal is ready to resolve.",
    {
      type: "object",
      properties: { merchantId: { type: "string" }, itemId: { type: "string" }, side: { type: "string", enum: ["buy", "sell", "offer"] }, quantity: { type: "integer", minimum: 1 }, offerUnitPriceCopper: { type: "integer", minimum: 0 } },
      required: ["merchantId", "itemId", "side", "quantity"],
      additionalProperties: false,
    }
  ),
  tool(
    "quest_create",
    "Create a DM-authored quest with a concrete objective and reward. The engine persists it and later applies its reward atomically.",
    {
      type: "object",
      properties: { title: { type: "string" }, objective: { type: "string" }, rewardXp: { type: "integer", minimum: 0 }, rewardCopper: { type: "integer", minimum: 0 }, giverNpcId: { type: "string" }, deadline: { type: "string" } },
      required: ["title", "objective", "rewardXp", "rewardCopper"],
      additionalProperties: false,
    }
  ),
  tool(
    "quest_update",
    "Update progress or status for a DM-authored quest. The engine persists the journal entry and completion state.",
    {
      type: "object",
      properties: { questId: { type: "string" }, status: { type: "string", enum: ["active", "completed", "failed", "abandoned"] }, objective: { type: "string" }, progress: { type: "integer", minimum: 0, maximum: 100 } },
      required: ["questId"],
      additionalProperties: false,
    }
  ),
  tool(
    "improvise",
    "Apply a DM-authored rule-of-cool stunt or effect. The engine records the creative description and applies only the typed mechanical consequence (damage, healing, condition, advantage, movement, or duration).",
    {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" }, effectType: { type: "string", enum: ["fictional", "advantage", "disadvantage", "condition", "damage", "healing", "movement", "summoning"] }, targetId: { type: "string" }, amount: { type: "integer", minimum: 0 }, durationRounds: { type: "integer", minimum: 1 }, condition: { type: "string" } },
      required: ["title", "description", "effectType"],
      additionalProperties: false,
    }
  ),
  tool(
    "campaign_beat",
    "Commit a proactive DM story beat: a new pressure, immediate situation, and concrete choices. This is the campaign driver, not a room or fixed scene graph.",
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
  tool("character_update", "Update player-authored character identity and sheet details. The DM may also populate durable personality, appearance, backstory, allies, treasure, inspiration, and temporary hit points.", { type: "object", properties: { name: { type: "string" }, background: { type: "string", description: "Legacy campaigns only." }, alignment: { type: "string", description: "Legacy campaigns only." }, description: { type: "string" }, abilityScores: { type: "object", description: "Legacy campaigns only." }, details: { type: "object", description: "Character sheet details such as appearance, personalityTraits, ideals, bonds, flaws, backstory, allies, treasure, inspiration, and temporaryHp." } }, additionalProperties: false }),
  tool("inventory", "Read authoritative items, quantities, gold, and carry weight. Read-only.", {}),
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
  tool(
    "combat_start",
    "Start a DM-authored encounter using installed Open5e creature content keys. Search creatures first; never supply or invent stats.",
    {
      type: "object",
      properties: {
        encounterId: { type: "string" },
        encounterName: { type: "string" },
        creatures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              creatureKey: { type: "string", description: "Exact open5e:creature contentKey from content_search." },
              count: { type: "integer", minimum: 1, maximum: 20 },
              distanceFeet: { type: "number", minimum: 0, maximum: 100000, description: "Authoritative starting distance from the player; defaults to 30 feet." },
            },
            required: ["creatureKey", "count"],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 20,
        },
      },
      required: ["encounterId", "encounterName", "creatures"],
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
        distanceFeet: { type: "number", minimum: 0, maximum: 100000, description: "Authoritative distance from the player; defaults to 30 feet." },
      },
      required: ["creatureKey", "count"],
      additionalProperties: false,
    }
  ),
  tool(
    "learn_spell",
    "Add an installed Open5e spell to a known-caster repertoire or wizard spellbook. The engine enforces class membership and level limits; use content_search first.",
    {
      type: "object",
      properties: {
        spellKey: { type: "string", description: "Exact open5e:spell contentKey from content_search." },
      },
      required: ["spellKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "prepare_spell",
    "Prepare or unprepare one installed Open5e spell. The engine enforces class lists, spellbook membership, spell level, and preparation capacity.",
    {
      type: "object",
      properties: {
        spellKey: { type: "string", description: "Exact open5e:spell contentKey from content_search." },
        prepared: { type: "boolean", description: "False unprepares the spell; defaults to true." },
      },
      required: ["spellKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "cast_spell",
    "Cast a learned or prepared Open5e spell. The engine owns slots, action economy, attacks, saves, typed damage, target count, concentration, and exact structured upcasting. Tier-0 prose is rejected without mutation.",
    {
      type: "object",
      properties: {
        spellKey: { type: "string", description: "Exact open5e:spell contentKey from the character spell list." },
        slotLevel: { type: "integer", minimum: 1, maximum: 9, description: "Optional slot level. Omit to use the lowest legal available slot." },
        targetIds: { type: "array", items: { type: "string" }, maxItems: 20, description: "Combatant ids selected by the DM as affected targets." },
      },
      required: ["spellKey"],
      additionalProperties: false,
    }
  ),
  tool(
    "combat_action",
    "Take one legal combat action. The server owns turn order, action economy, attack rolls, damage, and target state.",
    {
      type: "object",
      properties: {
        action: { type: "string", enum: ["attack", "dodge", "dash", "disengage", "help"] },
        targetId: { type: "string" },
        goal: { type: "string" },
      },
      required: ["action"],
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
    "Resolve a defeated encounter's DM-authored items and currency, optionally claiming one authored quest reward. The engine transfers the supplied content atomically and never invents loot.",
    {
      type: "object",
      properties: {
        items: { type: "array", items: inventoryItemJsonSchema, maxItems: 50 },
        rewardXp: { type: "integer", minimum: 0 },
        rewardCopper: { type: "integer", minimum: 0 },
        questId: { type: "string" },
      },
      additionalProperties: false,
    }
  ),
  tool("rest", "Take a rest outside active combat. Recovery is server-owned and transactional.", {}),
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
      },
      required: ["ability", "goal"],
      additionalProperties: false,
    }
  ),
];

export function isReadOnlyTool(toolName: EngineToolName): boolean {
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
    case "world_context":
      return engineCommandSchema.parse({
        kind: "world_context",
        title: args.title,
        description: args.description,
        features: args.features,
        exits: args.exits,
        npcs: args.npcs ?? [],
        merchants: args.merchants ?? [],
      });
    case "player_note_add":
      return engineCommandSchema.parse({ kind: "player_note_add", text: args.text, source: args.source ?? "dm" });
    case "character_update":
      return engineCommandSchema.parse({ kind: "character_update", ...args });
    case "interact":
      return engineCommandSchema.parse({ kind: "interact", targetId: args.targetId, goal: args.goal });
    case "social_check":
      return engineCommandSchema.parse({ kind: "social_check", npcId: args.npcId, ability: args.ability, skill: args.skill, goal: args.goal });
    case "merchant_trade":
      return engineCommandSchema.parse({ kind: "merchant_trade", merchantId: args.merchantId, itemId: args.itemId, side: args.side, quantity: args.quantity, offerUnitPriceCopper: args.offerUnitPriceCopper });
    case "quest_create":
      return engineCommandSchema.parse({ kind: "quest_create", title: args.title, objective: args.objective, rewardXp: args.rewardXp, rewardCopper: args.rewardCopper, giverNpcId: args.giverNpcId, deadline: args.deadline });
    case "quest_update":
      return engineCommandSchema.parse({ kind: "quest_update", questId: args.questId, status: args.status, objective: args.objective, progress: args.progress });
    case "improvise":
      return engineCommandSchema.parse({ kind: "improvise", title: args.title, description: args.description, effectType: args.effectType, targetId: args.targetId, amount: args.amount, durationRounds: args.durationRounds, condition: args.condition });
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
        goal: args.goal,
      });
    case "combat_start":
      return engineCommandSchema.parse({
        kind: "combat_start",
        encounterId: args.encounterId,
        encounterName: args.encounterName,
        creatures: args.creatures,
      });
    case "spawn_creature":
      return engineCommandSchema.parse({
        kind: "spawn_creature",
        creatureKey: args.creatureKey,
        count: args.count,
        distanceFeet: args.distanceFeet ?? 30,
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
        items: args.items ?? [],
        rewardXp: args.rewardXp ?? 0,
        rewardCopper: args.rewardCopper ?? 0,
        questId: args.questId,
      });
    case "rest":
      return engineCommandSchema.parse({ kind: "rest", restType: args.restType ?? "long" });
    case "tutorial_advance":
      return { kind: "tutorial_advance" };
    case "roll_check":
      return engineCommandSchema.parse({
        kind: "roll_check",
        ability: args.ability,
        skill: args.skill,
        goal: args.goal,
      });
    case "campaign_context":
    case "content_search":
    case "content_get":
    case "rules_reference":
    case "character_options":
    case "player_notes":
    case "npc_context":
    case "merchant_catalog":
    case "observe":
    case "character_sheet":
    case "inventory":
    case "quest_progress":
    case "combat_state":
      return null;
  }
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

function isRulesReferenceKind(kind: string): boolean {
  return kind === "rule" || kind === "ruleset" || kind === "section" || kind === "plane";
}

export function isEngineToolName(value: string): value is EngineToolName {
  return engineToolNameSchema.safeParse(value).success;
}
