import { z } from "zod";
import type { NarrationEnvelope } from "./ai-contracts.js";
import type { ProductionRoomState } from "./engine-production-room.js";
import type {
  OrchestrationDecisionInput,
  OrchestrationState,
  SceneState,
} from "./engine-orchestration.js";
import type {
  CompiledCreatureAttack,
  CompiledEffectDuration,
  CompiledEffectProgram,
  NormalizedCreature,
} from "./content/schema.js";
import {
  contentProposalSchema,
  runtimeContentKeySchema,
  type RuntimeContentState,
} from "./content/runtime-compiler.js";

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

export const engineItemOwnerRefSchema = z.object({
  kind: z.enum(["actor", "merchant", "world"]),
  id: z.string().trim().min(1).max(120),
}).strict();
export type EngineItemOwnerRef = z.infer<typeof engineItemOwnerRefSchema>;

export const engineItemProvenanceSchema = z.object({
  kind: z.enum(["starter", "loot", "merchant", "quest", "authored", "open5e"]),
  sourceId: z.string().trim().min(1).max(160).optional(),
}).strict();
export type EngineItemProvenance = z.infer<typeof engineItemProvenanceSchema>;

export const engineLifecycleStateSchema = z.enum(["conscious", "dying", "stable", "dead"]);
export type EngineLifecycleState = z.infer<typeof engineLifecycleStateSchema>;

export interface EngineDeathRecord {
  source: "damage" | "death-save";
  sourceCommandId: string;
  sourceVersion: number;
  occurredAt: string;
}

export interface EngineCorpse {
  id: string;
  formerActorId: string;
  formerActorName: string;
  locationRef: string | null;
  inventory: EngineInventoryItem[];
  status: "lootable" | "looted";
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
    occurredAt: string;
  };
  lootedAt?: string;
}

export const engineItemChargeStateSchema = z.object({
  current: z.number().int().nonnegative(),
  max: z.number().int().positive(),
}).strict().refine((charges) => charges.current <= charges.max, "Current item charges cannot exceed the maximum.");
export type EngineItemChargeState = z.infer<typeof engineItemChargeStateSchema>;

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
  containerCapacity: z.number().nonnegative().optional(),
  ammunitionId: z.string().trim().min(1).max(120).optional(),
  effectKey: z.enum(["lantern-ward-v1"]).optional(),
  isMagic: z.boolean().optional(),
  mechanicsTier: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
}).strict();

const engineInventoryInstanceFields = {
  id: z.string().trim().min(1).max(120),
  /** Links a normal inventory instance to its campaign-scoped runtime item. */
  runtimeContentInstanceId: z.string().trim().min(1).max(220).optional(),
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

export const informationTierSchema = z.enum(["public", "perceived", "known", "rumor", "false-belief", "stale", "withheld"]);
export type InformationTier = z.infer<typeof informationTierSchema>;

export const engineSenseCapabilitiesSchema = z.object({
  normalVision: z.boolean(),
  darkvisionFeet: z.number().int().nonnegative().max(1_000),
  blindsightFeet: z.number().int().nonnegative().max(1_000),
  tremorsenseFeet: z.number().int().nonnegative().max(1_000),
  hearing: z.boolean(),
}).strict();
export type EngineSenseCapabilities = z.infer<typeof engineSenseCapabilitiesSchema>;

const worldFactKindSchema = z.enum(["object", "secret", "trap", "area"]);
const worldFactSenseSchema = z.enum(["normal", "darkvision", "blindsight", "tremorsense", "hearing"]);
const worldFactInputSchema = z.object({
  id: worldContextEntityIdSchema,
  kind: worldFactKindSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4_000),
  visibility: z.enum(["public", "hidden"]),
  obscurity: z.enum(["clear", "dark"]).default("clear"),
  requiredSense: worldFactSenseSchema.default("normal"),
  passiveDc: z.number().int().min(1).max(30).nullable().optional(),
}).strict();
export type EngineWorldFactInput = z.infer<typeof worldFactInputSchema>;

export const engineWorldFactPatchOperationsSchema = z.object({
  upsert: z.array(worldFactInputSchema).max(40).optional(),
  remove: z.array(worldContextEntityIdSchema).max(40).optional(),
}).strict().refine(
  (operations) => (operations.upsert?.length ?? 0) + (operations.remove?.length ?? 0) > 0,
  "A provided fact patch needs at least one operation."
);
export type EngineWorldFactPatchOperations = z.infer<typeof engineWorldFactPatchOperationsSchema>;

export const proceduralNoticeStatusSchema = z.enum(["sealed", "authorized", "delivered", "resolved", "withdrawn"]);
export type EngineProceduralNoticeStatus = z.infer<typeof proceduralNoticeStatusSchema>;

const proceduralNoticeTextSchema = z.string().trim().min(1).max(1_000);
const proceduralNoticePolicySchema = z.object({
  allowed: z.boolean(),
  denialReason: proceduralNoticeTextSchema.optional(),
}).strict().superRefine((policy, context) => {
  if (!policy.allowed && !policy.denialReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["denialReason"], message: "A denied notice request needs a player-safe reason." });
  }
});

export const engineProceduralNoticeTermsSchema = z.object({
  authorizedAction: proceduralNoticeTextSchema,
  actorScope: proceduralNoticeTextSchema,
  admissibleEvidence: z.array(proceduralNoticeTextSchema).max(8),
  excludedEvidence: z.array(proceduralNoticeTextSchema).max(8),
  responseWindow: proceduralNoticeTextSchema,
  deadlineAtMinutes: z.number().int().nonnegative().nullable().optional(),
  attendance: proceduralNoticeTextSchema,
  custodyEffect: proceduralNoticeTextSchema,
  nextChange: proceduralNoticeTextSchema,
  copy: proceduralNoticePolicySchema,
  clarification: proceduralNoticePolicySchema,
}).strict().superRefine((terms, context) => {
  const restrictedPattern = /\b(?:private|restricted|secret|confidential|sealed\s+(?:statement|record|testimony))\b/i;
  const checkText = (value: string, path: (string | number)[]) => {
    if (restrictedPattern.test(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: "Notice terms must describe player-safe procedure, not restricted records." });
    }
  };
  checkText(terms.authorizedAction, ["authorizedAction"]);
  checkText(terms.actorScope, ["actorScope"]);
  terms.admissibleEvidence.forEach((value, index) => checkText(value, ["admissibleEvidence", index]));
  terms.excludedEvidence.forEach((value, index) => checkText(value, ["excludedEvidence", index]));
  checkText(terms.responseWindow, ["responseWindow"]);
  checkText(terms.attendance, ["attendance"]);
  checkText(terms.custodyEffect, ["custodyEffect"]);
  checkText(terms.nextChange, ["nextChange"]);
  if (terms.copy.denialReason) checkText(terms.copy.denialReason, ["copy", "denialReason"]);
  if (terms.clarification.denialReason) checkText(terms.clarification.denialReason, ["clarification", "denialReason"]);
});
export type EngineProceduralNoticeTerms = z.infer<typeof engineProceduralNoticeTermsSchema>;

export const engineProceduralNoticeInputSchema = z.object({
  id: worldContextEntityIdSchema,
  title: proceduralNoticeTextSchema,
  terms: engineProceduralNoticeTermsSchema,
}).strict();
export type EngineProceduralNoticeInput = z.infer<typeof engineProceduralNoticeInputSchema>;

export const proceduralNoticeActionSchema = z.enum([
  "upsert",
  "authorize",
  "deliver",
  "request_copy",
  "request_clarification",
  "resolve",
  "withdraw",
]);
export type ProceduralNoticeAction = z.infer<typeof proceduralNoticeActionSchema>;

export const engineProceduralNoticeCommandSchema = z.object({
  kind: z.literal("procedural_notice"),
  action: proceduralNoticeActionSchema,
  noticeId: worldContextEntityIdSchema.optional(),
  notice: engineProceduralNoticeInputSchema.optional(),
  requestText: proceduralNoticeTextSchema.optional(),
}).strict().superRefine((command, context) => {
  if (command.action === "upsert" && !command.notice) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notice"], message: "Upserting a procedural notice requires typed player-safe terms." });
  }
  if (command.action !== "upsert" && command.notice) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["notice"], message: "Only upserting a procedural notice may supply notice terms." });
  }
  if (command.action !== "upsert" && !command.noticeId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["noticeId"], message: "A procedural notice action requires a notice id." });
  }
});
export type EngineProceduralNoticeCommand = z.infer<typeof engineProceduralNoticeCommandSchema>;

export interface EngineProceduralNoticeAttempt {
  id: string;
  kind: "copy" | "clarification";
  outcome: "granted" | "denied";
  requestText: string | null;
  reason: string;
  sourceCommandId: string;
  sourceVersion: number;
  occurredAt: string;
}

const proceduralNoticeAttemptSchema = z.object({
  id: worldContextEntityIdSchema,
  kind: z.enum(["copy", "clarification"]),
  outcome: z.enum(["granted", "denied"]),
  requestText: proceduralNoticeTextSchema.nullable(),
  reason: proceduralNoticeTextSchema,
  sourceCommandId: worldContextEntityIdSchema,
  sourceVersion: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
}).strict();

export const engineProceduralNoticeSchema = engineProceduralNoticeInputSchema.extend({
  status: proceduralNoticeStatusSchema,
  attempts: z.array(proceduralNoticeAttemptSchema).max(20),
  revision: z.number().int().positive(),
  authorizedAtVersion: z.number().int().nonnegative().nullable(),
  deliveredAtVersion: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: z.object({ sourceCommandId: worldContextEntityIdSchema, sourceVersion: z.number().int().nonnegative() }).strict(),
}).strict();

export interface EngineProceduralNotice extends EngineProceduralNoticeInput {
  status: EngineProceduralNoticeStatus;
  attempts: EngineProceduralNoticeAttempt[];
  revision: number;
  authorizedAtVersion: number | null;
  deliveredAtVersion: number | null;
  createdAt: string;
  updatedAt: string;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
  };
}

export interface EngineProceduralNoticeView extends Omit<EngineProceduralNotice, "terms"> {
  /** Operative terms are withheld until the prescribed delivery step. */
  terms: EngineProceduralNoticeTerms | null;
}

export const engineWorldObjectStateSchema = z.enum([
  "intact",
  "damaged",
  "destroyed",
  "open",
  "closed",
  "locked",
  "unlocked",
  "lit",
  "unlit",
  "wet",
  "attached",
  "active",
  "inactive",
  "carried",
  "equipped",
  "hidden",
]);
export type EngineWorldObjectState = z.infer<typeof engineWorldObjectStateSchema>;

export const engineWorldObjectMaterialSchema = z.enum([
  "wood",
  "metal",
  "stone",
  "rope",
  "oil",
  "fire",
  "cloth",
  "paper",
  "glass",
  "mixed",
]);
export type EngineWorldObjectMaterial = z.infer<typeof engineWorldObjectMaterialSchema>;

export const engineWorldObjectAffordanceSchema = z.enum([
  "inspect",
  "open",
  "close",
  "lock",
  "unlock",
  "move",
  "carry",
  "throw",
  "take",
  "give",
  "drop",
  "steal",
  "equip",
  "use",
  "ignite",
  "extinguish",
  "break",
  "damage",
  "attach",
  "activate",
]);
export type EngineWorldObjectAffordance = z.infer<typeof engineWorldObjectAffordanceSchema>;

export const engineCriticalObjectPolicySchema = z.object({
  kind: z.enum(["ordinary_consequence", "recoverable_route", "alternate_path", "quest_failure", "world_transformation"]),
  canDestroy: z.boolean(),
  canLose: z.boolean(),
  canSell: z.boolean(),
  canConsume: z.boolean(),
  canHide: z.boolean(),
  recoveryRef: worldContextEntityIdSchema.optional(),
}).strict();
export type EngineCriticalObjectPolicy = z.infer<typeof engineCriticalObjectPolicySchema>;

export const engineWorldObjectPrerequisiteSchema = z.object({
  affordance: engineWorldObjectAffordanceSchema,
  requiredTags: z.array(z.string().trim().min(1).max(80)).max(8),
  requiredState: engineWorldObjectStateSchema.optional(),
}).strict();
export type EngineWorldObjectPrerequisite = z.infer<typeof engineWorldObjectPrerequisiteSchema>;

export const engineWorldObjectEffectInteractionSchema = z.object({
  affordance: engineWorldObjectAffordanceSchema,
  targetId: worldContextEntityIdSchema,
  targetState: engineWorldObjectStateSchema,
}).strict();
export type EngineWorldObjectEffectInteraction = z.infer<typeof engineWorldObjectEffectInteractionSchema>;

export const engineWorldObjectDefinitionSchema = z.object({
  key: worldContextEntityIdSchema,
  sourceRef: z.string().trim().min(1).max(240),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2_000),
  material: engineWorldObjectMaterialSchema,
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  affordances: z.array(engineWorldObjectAffordanceSchema).max(20),
  prerequisites: z.array(engineWorldObjectPrerequisiteSchema).max(20),
  effectInteractions: z.array(engineWorldObjectEffectInteractionSchema).max(20),
  weight: z.number().nonnegative().max(10_000),
  criticalPolicy: engineCriticalObjectPolicySchema,
}).strict().superRefine((definition, context) => {
  if (new Set(definition.tags).size !== definition.tags.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tags"], message: "World-object tags must be unique." });
  }
  if (new Set(definition.affordances).size !== definition.affordances.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["affordances"], message: "World-object affordances must be unique." });
  }
});
export type EngineWorldObjectDefinition = z.infer<typeof engineWorldObjectDefinitionSchema>;

export const engineWorldObjectInputSchema = z.object({
  id: worldContextEntityIdSchema,
  definition: engineWorldObjectDefinitionSchema,
  state: engineWorldObjectStateSchema,
  locationRef: worldContextEntityIdSchema.nullable().optional(),
  ownerRef: engineItemOwnerRefSchema.optional(),
  containerRef: worldContextEntityIdSchema.nullable().optional(),
}).strict();
export type EngineWorldObjectInput = z.infer<typeof engineWorldObjectInputSchema>;

export const engineWorldObjectPatchOperationsSchema = z.object({
  upsert: z.array(engineWorldObjectInputSchema).max(40).optional(),
  remove: z.array(worldContextEntityIdSchema).max(40).optional(),
}).strict().refine(
  (operations) => (operations.upsert?.length ?? 0) + (operations.remove?.length ?? 0) > 0,
  "A provided object patch needs at least one operation."
);
export type EngineWorldObjectPatchOperations = z.infer<typeof engineWorldObjectPatchOperationsSchema>;

export interface EngineWorldObjectInstance extends EngineWorldObjectInput {
  sceneId: string;
  locationRef: string | null;
  ownerRef: EngineItemOwnerRef;
  containerRef: string | null;
  revision: number;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
    occurredAt: string;
  };
}

export interface EngineWorldFact extends EngineWorldFactInput {
  sceneId: string;
  revision: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EngineKnowledgeRecord {
  id: string;
  actorId: string;
  factId: string;
  tier: InformationTier;
  source: "passive-observation" | "active-search" | "rumor" | "false-belief" | "dm";
  provenance: string;
  confidence: number;
  campaignVersion: number;
  factRevision: number;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EngineSocialProvenance {
  sourceCommandId: string;
  sourceVersion: number;
  occurredAt: string;
}

export interface EngineSocialRelationship {
  id: string;
  actorA: string;
  actorB: string;
  trust: number;
  fear: number;
  loyalty: number;
  hostility: number;
  updatedAt: string;
  provenance: EngineSocialProvenance;
}

export interface EngineSocialFactionMember {
  actorId: string;
  role: string | null;
  standing: number;
}

export interface EngineSocialFaction {
  id: string;
  name: string;
  communityId: string;
  members: EngineSocialFactionMember[];
  provenance: EngineSocialProvenance;
}

export interface EngineSocialReputation {
  id: string;
  actorId: string;
  communityId: string;
  score: number;
  provenance: EngineSocialProvenance;
}

export interface EngineSocialObligation {
  id: string;
  kind: "promise" | "debt" | "favor";
  actorId: string;
  counterpartyId: string;
  terms: string;
  status: "open" | "fulfilled" | "breached";
  deadlineAtMinutes: number | null;
  consequenceApplied: boolean;
  createdAt: string;
  resolvedAt: string | null;
  provenance: EngineSocialProvenance;
}

export interface EngineSocialCrimeEvidence {
  id: string;
  kind: "theft" | "promise-breach";
  actorId: string;
  victimId: string;
  itemId: string | null;
  status: "allegation" | "proven";
  witnessIds: string[];
  evidenceIds: string[];
  createdAt: string;
  provenance: EngineSocialProvenance;
}

export interface EngineSocialRumor {
  id: string;
  sourceRef: string;
  sourceActorId: string;
  targetId: string;
  text: string;
  confidence: number;
  truthRelation: "true" | "false" | "unknown";
  status: "pending" | "propagated" | "corroborated";
  createdAt: string;
  propagateAtMinutes: number;
  propagatedAtMinutes: number | null;
  provenance: EngineSocialProvenance;
}

export interface EngineSocialState {
  relationships: EngineSocialRelationship[];
  factions: EngineSocialFaction[];
  reputations: EngineSocialReputation[];
  obligations: EngineSocialObligation[];
  crimes: EngineSocialCrimeEvidence[];
  rumors: EngineSocialRumor[];
}

export interface EngineSocialProjection {
  relationships: Array<Pick<EngineSocialRelationship, "id" | "actorA" | "actorB" | "trust" | "fear" | "loyalty" | "hostility" | "updatedAt">>;
  factions: Array<{ id: string; name: string; communityId: string; standing: number }>;
  reputations: EngineSocialReputation[];
  obligations: EngineSocialObligation[];
  rumors: EngineSocialRumor[];
}

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
  agency: z.object({
    actorType: z.enum(["merchant", "guard", "traveler"]),
    locationRef: worldContextEntityIdSchema,
    schedule: z.array(z.object({
      id: worldContextEntityIdSchema,
      locationRef: worldContextEntityIdSchema,
      startMinute: z.number().int().min(0).max(1_439),
      endMinute: z.number().int().min(0).max(1_439),
    }).strict()).max(12),
    goals: z.array(z.object({
      id: worldContextEntityIdSchema,
      title: z.string().trim().min(1).max(240),
      priority: z.number().int().min(0).max(100),
      status: z.enum(["active", "blocked", "complete"]),
    }).strict()).max(12),
    resources: z.object({
      inventory: z.array(engineInventoryItemInputSchema).max(40),
      copper: z.number().int().nonnegative().max(100_000_000),
      actionPoints: z.number().int().nonnegative().max(50),
    }).strict(),
    maxHp: z.number().int().positive().max(10_000),
    hp: z.number().int().nonnegative().max(10_000),
  }).strict().optional(),
  socialDc: z.number().int().min(1).max(30).optional(),
  // Rejection-only input: the domain rejects every supplied value as server-owned.
  relationshipScore: z.number().int().min(-100).max(100).optional(),
  memories: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
}).strict();
export type EngineNpcPatch = z.infer<typeof engineNpcPatchSchema>;

export const engineNpcAgencyActionSchema = z.enum([
  "move_to_schedule",
  "report_crime",
  "rest",
  "trade_resource",
  "no_op",
]);
export type EngineNpcAgencyAction = z.infer<typeof engineNpcAgencyActionSchema>;

export const engineNpcTickCommandSchema = z.object({
  kind: z.literal("npc_tick"),
  trigger: z.enum(["time_advance", "scene_enter", "scene_exit", "witnessed_event", "quest_clock", "combat_turn", "operator_batch"]),
  triggerId: worldContextEntityIdSchema,
  npcId: worldContextEntityIdSchema.optional(),
  offerId: engineNpcAgencyActionSchema.optional(),
  provider: z.enum(["deterministic", "openrouter"]).optional(),
}).strict();
export type EngineNpcTickCommand = z.infer<typeof engineNpcTickCommandSchema>;

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

/**
 * Server-owned actor custody.  This is deliberately separate from the
 * ordinary condition list so a narrated surrender cannot imply a mechanical
 * restraint without a persisted authority, source, and release policy.
 */
export const engineCustodyStatusSchema = z.object({
  actorId: worldContextEntityIdSchema,
  groupId: worldContextEntityIdSchema,
  status: z.enum(["restrained", "under_guard"]),
  sourceGuardId: worldContextEntityIdSchema,
  reason: z.enum(["surrender", "capture"]),
  locationRef: worldContextEntityIdSchema,
  startedVersion: z.number().int().nonnegative(),
  releasePolicy: z.literal("guard-release-or-escape"),
}).strict();
export type EngineCustodyStatus = z.infer<typeof engineCustodyStatusSchema>;

export const engineMerchantPatchOperationsSchema = z.object({
  upsert: z.array(engineMerchantPatchSchema).max(20).optional(),
  remove: z.array(worldContextEntityIdSchema).max(20).optional(),
}).strict().refine(
  (operations) => (operations.upsert?.length ?? 0) + (operations.remove?.length ?? 0) > 0,
  "A provided merchant patch needs at least one operation."
);
export type EngineMerchantPatchOperations = z.infer<typeof engineMerchantPatchOperationsSchema>;

export const engineSocialActionCommandSchema = z.object({
  kind: z.literal("social_action"),
  action: z.enum(["promise", "fulfill_promise", "breach_promise", "theft", "rumor"]),
  targetId: z.string().trim().min(1).max(120).optional(),
  promiseId: z.string().trim().min(1).max(120).optional(),
  terms: z.string().trim().min(1).max(2_000).optional(),
  deadlineMinutes: z.number().int().min(1).max(100_000).optional(),
  itemId: z.string().trim().min(1).max(120).optional(),
  witnessId: z.string().trim().min(1).max(120).optional(),
  rumorText: z.string().trim().min(1).max(1_000).optional(),
  truthRelation: z.enum(["true", "false", "unknown"]).optional(),
}).strict();
export type EngineSocialActionCommand = z.infer<typeof engineSocialActionCommandSchema>;

const questIdentifierSchema = z.string().trim().min(1).max(120);

export const engineQuestPredicateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("inventory_owned"),
    itemId: questIdentifierSchema,
    quantity: z.number().int().positive().max(100),
  }).strict(),
  z.object({
    kind: z.literal("encounter_outcome"),
    outcomeId: questIdentifierSchema,
    outcome: z.enum(["killed", "surrendered", "captured", "escaped", "rescue_succeeded", "rescue_failed"]),
  }).strict(),
  z.object({
    kind: z.literal("social_reputation"),
    actorId: questIdentifierSchema.optional(),
    communityId: questIdentifierSchema,
    minScore: z.number().int().min(-100).max(100),
  }).strict(),
  z.object({
    kind: z.literal("actor_at_location"),
    actorId: questIdentifierSchema,
    locationRef: questIdentifierSchema,
  }).strict(),
  z.object({
    kind: z.literal("fact_discovered"),
    factId: questIdentifierSchema,
  }).strict(),
  z.object({
    kind: z.literal("game_time_before"),
    deadlineAtMinutes: z.number().int().nonnegative().max(100_000_000),
  }).strict(),
  z.object({
    kind: z.literal("player_choice"),
    choiceId: questIdentifierSchema,
  }).strict(),
]);
export type EngineQuestPredicate = z.infer<typeof engineQuestPredicateSchema>;

export const engineQuestObjectiveInputSchema = z.object({
  id: questIdentifierSchema,
  title: z.string().trim().min(1).max(240),
  mode: z.enum(["ordered", "unordered"]),
  optional: z.boolean().default(false),
  hidden: z.boolean().default(false),
  predicate: engineQuestPredicateSchema,
}).strict();
export type EngineQuestObjectiveInput = z.infer<typeof engineQuestObjectiveInputSchema>;

export const engineQuestConsequenceSchema = z.object({
  xp: z.number().int().nonnegative().max(1_000_000).default(0),
  copper: z.number().int().nonnegative().max(100_000_000).default(0),
  items: z.array(
    engineInventoryItemInputSchema.refine((item) => item.quantity > 0, {
      message: "Quest reward quantity must be positive.",
    })
  ).max(8).optional(),
  reputation: z.object({
    actorId: questIdentifierSchema.optional(),
    communityId: questIdentifierSchema,
    delta: z.number().int().min(-100).max(100),
  }).strict().optional(),
  worldFact: z.object({
    factId: questIdentifierSchema,
    active: z.boolean(),
  }).strict().optional(),
  followUpQuestId: questIdentifierSchema.optional(),
}).strict();
export type EngineQuestConsequence = z.infer<typeof engineQuestConsequenceSchema>;

export const engineQuestTransitionInputSchema = z.object({
  id: questIdentifierSchema,
  label: z.string().trim().min(1).max(240),
  outcome: z.enum(["success", "failure", "abandonment", "expiration"]),
  predicates: z.array(engineQuestPredicateSchema).max(8).default([]),
  requiresObjectiveIds: z.array(questIdentifierSchema).max(20).default([]),
  choiceId: questIdentifierSchema.optional(),
  consequence: engineQuestConsequenceSchema.default({ xp: 0, copper: 0 }),
}).strict();
export type EngineQuestTransitionInput = z.infer<typeof engineQuestTransitionInputSchema>;

export const engineQuestClockInputSchema = z.object({
  id: questIdentifierSchema,
  title: z.string().trim().min(1).max(160),
  max: z.number().int().positive().max(1_000_000),
  source: z.enum(["time", "objective", "choice"]),
}).strict();
export type EngineQuestClockInput = z.infer<typeof engineQuestClockInputSchema>;

export const engineQuestGraphInputSchema = z.object({
  objectives: z.array(engineQuestObjectiveInputSchema).min(1).max(20),
  transitions: z.array(engineQuestTransitionInputSchema).min(1).max(20),
  deadlineAtMinutes: z.number().int().nonnegative().max(100_000_000).optional(),
  deadlineTransitionId: questIdentifierSchema.optional(),
  followUpQuestId: questIdentifierSchema.optional(),
  clock: engineQuestClockInputSchema.optional(),
}).strict().superRefine((graph, context) => {
  const objectiveIds = new Set<string>();
  for (const objective of graph.objectives) {
    if (objectiveIds.has(objective.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["objectives"], message: "Quest objective identifiers must be unique." });
    objectiveIds.add(objective.id);
  }
  const transitionIds = new Set<string>();
  for (const transition of graph.transitions) {
    if (transitionIds.has(transition.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["transitions"], message: "Quest transition identifiers must be unique." });
    transitionIds.add(transition.id);
    if (transition.requiresObjectiveIds.some((id) => !objectiveIds.has(id))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["transitions"], message: "Quest transitions may require only declared objectives." });
    }
  }
  if (graph.deadlineTransitionId && !transitionIds.has(graph.deadlineTransitionId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deadlineTransitionId"], message: "The deadline transition must be declared in the graph." });
  }
  const deadlineTransition = graph.deadlineTransitionId ? graph.transitions.find((transition) => transition.id === graph.deadlineTransitionId) : undefined;
  if (deadlineTransition && deadlineTransition.outcome !== "expiration") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deadlineTransitionId"], message: "A quest deadline must resolve through an expiration transition." });
  }
  if (graph.deadlineAtMinutes !== undefined && !graph.deadlineTransitionId && !graph.transitions.some((transition) => transition.outcome === "expiration")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deadlineAtMinutes"], message: "A graph deadline requires an expiration transition." });
  }
});
export type EngineQuestGraphInput = z.infer<typeof engineQuestGraphInputSchema>;

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
  facts: engineWorldFactPatchOperationsSchema.optional(),
  objects: engineWorldObjectPatchOperationsSchema.optional(),
}).strict();
export type EngineWorldContextArgs = z.infer<typeof engineWorldContextArgsSchema>;

export const engineWorldContextCommandSchema = engineWorldContextArgsSchema.extend({
  kind: z.literal("world_context"),
}).strict();
export type EngineWorldContextCommand = z.infer<typeof engineWorldContextCommandSchema>;

const engineLocationExitStatePatchSchema = z.object({
  open: z.boolean().optional(),
  locked: z.boolean().optional(),
  blocked: z.boolean().optional(),
  discovered: z.boolean().optional(),
  requirements: z.array(runtimeContentKeySchema).max(8).optional(),
}).strict().refine(
  (patch) => Object.keys(patch).length > 0,
  "A location exit patch needs at least one state change.",
);

export const engineLocationExitPatchSchema = z.object({
  locationInstanceId: z.string().trim().min(1).max(220),
  exitKey: runtimeContentKeySchema,
  patch: engineLocationExitStatePatchSchema,
}).strict();
export type EngineLocationExitPatch = z.infer<typeof engineLocationExitPatchSchema>;

export const engineContentCompileArgsSchema = z.object({
  proposal: contentProposalSchema.optional(),
  createInstance: z.boolean().default(true),
  instanceKey: runtimeContentKeySchema.optional(),
  exitPatch: engineLocationExitPatchSchema.optional(),
}).strict();

export const engineContentCompileCommandSchema = engineContentCompileArgsSchema.extend({
  kind: z.literal("content_compile"),
}).strict().superRefine((command, context) => {
  if (!command.proposal && !command.exitPatch) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["proposal"], message: "Provide a content proposal or a canonical location exit patch." });
  }
  if (command.proposal && command.exitPatch) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exitPatch"], message: "A content compile command cannot compile and patch an exit at the same time." });
  }
  if (command.exitPatch && (command.createInstance !== true || command.instanceKey !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exitPatch"], message: "Exit patches do not accept instance creation options." });
  }
  const patch = command.exitPatch?.patch;
  if (patch?.discovered === false) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exitPatch", "patch", "discovered"], message: "An established exit cannot be undiscovered." });
  }
});
export type EngineContentCompileCommand = z.infer<typeof engineContentCompileCommandSchema>;

export const engineToolNameSchema = z.enum([
  "campaign_context",
  "capability_load",
  "experience_profile_update",
  "experience_feedback_add",
  "experience_boundary",
  "challenge_attempt",
  "content_search",
  "content_get",
  "content_compile",
  "rules_reference",
  "character_options",
  "world_context",
  "procedural_notice",
  "player_notes",
  "player_note_add",
  "npc_context",
  "merchant_catalog",
  "observe",
  "move",
  "travel",
  "interact",
  "social_check",
  "npc_tick",
  "merchant_trade",
  "social_action",
  "quest_create",
  "quest_transition",
  "quest_update",
  "improvise",
  "campaign_beat",
  "character_sheet",
  "character_roll_stats",
  "character_create",
  "character_update",
  "inventory",
  "inventory_transfer",
  "equip_item",
  "unequip_item",
  "drop_item",
  "use_item",
  "quest_progress",
  "combat_state",
  "controlled_actor_context",
  "party_context",
  "situation_context",
  "situation_create",
  "situation_visit",
  "situation_clue_attempt",
  "situation_ignore",
  "situation_choose",
  "party_create",
  "party_set_viewpoint",
  "party_split",
  "party_rejoin",
  "party_shared_transfer",
  "party_group_check",
  "combat_start",
  "encounter_decision",
  "custody_action",
  "spawn_creature",
  "learn_spell",
  "prepare_spell",
  "cast_spell",
  "reaction_response",
  "combat_action",
  "combat_move",
  "end_turn",
  "controlled_actor_create",
  "controlled_actor_command",
  "controlled_actor_dismiss",
  "advance_turn",
  "advancement_confirm",
  "npc_advance",
  "death_save",
  "loot",
  "rest",
  "project",
  "roll_check",
  "tutorial_advance",
]);
export type EngineToolName = z.infer<typeof engineToolNameSchema>;

/**
 * Reviewed capability families are a visibility boundary only.  They do not
 * add authority or create a second tool registry; the existing tool registry
 * remains the source of truth for names and argument contracts.
 */
export const engineCapabilityFamilyIdSchema = z.enum([
  "rules",
  "exploration",
  "social",
  "commerce",
  "quests",
  "combat",
  "magic",
  "party",
]);
export type EngineCapabilityFamilyId = z.infer<typeof engineCapabilityFamilyIdSchema>;

const tacticalCoordinateSchema = z.number().int().min(-100_000).max(100_000);
const tacticalDimensionSchema = z.number().int().min(1).max(20);

export const engineTacticalPositionSchema = z.object({
  frameId: z.string().trim().min(1).max(120),
  x: tacticalCoordinateSchema,
  y: tacticalCoordinateSchema,
  z: tacticalCoordinateSchema,
}).strict();
export type EngineTacticalPosition = z.infer<typeof engineTacticalPositionSchema>;

export const engineControlledActorProfileSchema = z.enum([
  "familiar-scout-v1",
  "summon-scout-v1",
]);
export type EngineControlledActorProfile = z.infer<typeof engineControlledActorProfileSchema>;

export const engineControlledActorCommandActionSchema = z.enum(["attack", "guard", "follow"]);
export type EngineControlledActorCommandAction = z.infer<typeof engineControlledActorCommandActionSchema>;

export const engineControlledActorCreateCommandSchema = z.object({
  kind: z.literal("controlled_actor_create"),
  profileId: engineControlledActorProfileSchema,
}).strict();
export type EngineControlledActorCreateCommand = z.infer<typeof engineControlledActorCreateCommandSchema>;

export const engineControlledActorCommandSchema = z.object({
  kind: z.literal("controlled_actor_command"),
  actorId: worldContextEntityIdSchema,
  action: engineControlledActorCommandActionSchema,
  targetId: worldContextEntityIdSchema.optional(),
}).strict();
export type EngineControlledActorCommand = z.infer<typeof engineControlledActorCommandSchema>;

export const engineControlledActorDismissCommandSchema = z.object({
  kind: z.literal("controlled_actor_dismiss"),
  actorId: worldContextEntityIdSchema,
}).strict();
export type EngineControlledActorDismissCommand = z.infer<typeof engineControlledActorDismissCommandSchema>;

export const enginePartyCreateCommandSchema = z.object({
  kind: z.literal("party_create"),
}).strict();
export type EnginePartyCreateCommand = z.infer<typeof enginePartyCreateCommandSchema>;

export const enginePartySetViewpointCommandSchema = z.object({
  kind: z.literal("party_set_viewpoint"),
  actorId: worldContextEntityIdSchema,
}).strict();
export type EnginePartySetViewpointCommand = z.infer<typeof enginePartySetViewpointCommandSchema>;

export const enginePartySplitCommandSchema = z.object({
  kind: z.literal("party_split"),
  actorId: worldContextEntityIdSchema,
  sceneId: worldContextEntityIdSchema,
  locationRef: worldContextEntityIdSchema.optional(),
}).strict();
export type EnginePartySplitCommand = z.infer<typeof enginePartySplitCommandSchema>;

export const enginePartyRejoinCommandSchema = z.object({
  kind: z.literal("party_rejoin"),
}).strict();
export type EnginePartyRejoinCommand = z.infer<typeof enginePartyRejoinCommandSchema>;

export const enginePartySharedTransferCommandSchema = z.object({
  kind: z.literal("party_shared_transfer"),
  actorId: worldContextEntityIdSchema,
  itemId: worldContextEntityIdSchema,
  quantity: z.number().int().min(1).max(100).default(1),
  direction: z.enum(["to_shared", "from_shared"]),
}).strict();
export type EnginePartySharedTransferCommand = z.infer<typeof enginePartySharedTransferCommandSchema>;

export const enginePartyGroupCheckCommandSchema = z.object({
  kind: z.literal("party_group_check"),
  ability: engineAbilitySchema,
  skill: z.string().trim().min(1).max(80).optional(),
  goal: z.string().trim().min(1).max(2_000),
  actorIds: z.array(worldContextEntityIdSchema).min(1).max(3),
}).strict();
export type EnginePartyGroupCheckCommand = z.infer<typeof enginePartyGroupCheckCommandSchema>;

export const engineSituationTemplateIdSchema = z.enum(["watchtower-relic-v1"]);
export type EngineSituationTemplateId = z.infer<typeof engineSituationTemplateIdSchema>;

export const engineSituationCreateCommandSchema = z.object({
  kind: z.literal("situation_create"),
  templateId: engineSituationTemplateIdSchema,
  sourceRandomEventId: worldContextEntityIdSchema.optional(),
}).strict();
export type EngineSituationCreateCommand = z.infer<typeof engineSituationCreateCommandSchema>;

export const engineSituationVisitCommandSchema = z.object({
  kind: z.literal("situation_visit"),
  locationId: worldContextEntityIdSchema,
}).strict();
export type EngineSituationVisitCommand = z.infer<typeof engineSituationVisitCommandSchema>;

export const engineSituationClueAttemptCommandSchema = z.object({
  kind: z.literal("situation_clue_attempt"),
  clueId: worldContextEntityIdSchema,
  approach: z.string().trim().min(1).max(2_000),
}).strict();
export type EngineSituationClueAttemptCommand = z.infer<typeof engineSituationClueAttemptCommandSchema>;

export const engineSituationIgnoreCommandSchema = z.object({
  kind: z.literal("situation_ignore"),
}).strict();
export type EngineSituationIgnoreCommand = z.infer<typeof engineSituationIgnoreCommandSchema>;

export const engineSituationChoiceCommandSchema = z.object({
  kind: z.literal("situation_choose"),
  choice: z.enum(["solve", "expose", "bargain", "walk-away"]),
}).strict();
export type EngineSituationChoiceCommand = z.infer<typeof engineSituationChoiceCommandSchema>;

export const engineTacticalBoundsSchema = z.object({
  minX: tacticalCoordinateSchema,
  maxX: tacticalCoordinateSchema,
  minY: tacticalCoordinateSchema,
  maxY: tacticalCoordinateSchema,
}).strict();
export type EngineTacticalBounds = z.infer<typeof engineTacticalBoundsSchema>;

export const engineTacticalObstacleSchema = z.object({
  id: z.string().trim().min(1).max(120),
  x: tacticalCoordinateSchema,
  y: tacticalCoordinateSchema,
  width: tacticalDimensionSchema.default(1),
  height: tacticalDimensionSchema.default(1),
}).strict();
export type EngineTacticalObstacle = z.infer<typeof engineTacticalObstacleSchema>;

export const engineTacticalTerrainSchema = z.object({
  id: z.string().trim().min(1).max(120),
  x: tacticalCoordinateSchema,
  y: tacticalCoordinateSchema,
  width: tacticalDimensionSchema.default(1),
  height: tacticalDimensionSchema.default(1),
  costFeet: z.number().int().min(5).max(100).multipleOf(5).default(10),
}).strict();
export type EngineTacticalTerrain = z.infer<typeof engineTacticalTerrainSchema>;

export const engineTacticalGeometryInputSchema = z.object({
  frameId: z.string().trim().min(1).max(120),
  bounds: engineTacticalBoundsSchema,
  obstacles: z.array(engineTacticalObstacleSchema).max(500).default([]),
  difficultTerrain: z.array(engineTacticalTerrainSchema).max(500).default([]),
  playerPosition: engineTacticalPositionSchema.optional(),
}).strict();
export type EngineTacticalGeometryInput = z.infer<typeof engineTacticalGeometryInputSchema>;

export interface EngineTacticalGeometry {
  frameId: string;
  revision: number;
  metric: "five_e_simple";
  bounds: EngineTacticalBounds;
  obstacles: EngineTacticalObstacle[];
  difficultTerrain: EngineTacticalTerrain[];
}

export interface EngineTacticalFootprint {
  width: number;
  height: number;
}

export interface EnginePathTrigger {
  kind: "reach-boundary";
  enemyId: string;
  segmentIndex: number;
  boundary: "entering-reach" | "leaving-reach";
  reachFeet: 5;
  distanceBeforeFeet: number;
  distanceAfterFeet: number;
}

export interface EngineMovementPlan {
  actorId: string;
  geometryRevision: number;
  metric: "five_e_simple";
  from: EngineTacticalPosition;
  to: EngineTacticalPosition;
  path: EngineTacticalPosition[];
  costFeet: number;
  triggers: EnginePathTrigger[];
}

export interface EngineCombatTacticalState {
  geometry: EngineTacticalGeometry;
  movementMode: "walking";
  actorPosition: EngineTacticalPosition;
  actorFootprint: EngineTacticalFootprint;
  lastPlan: EngineMovementPlan | null;
}

export const engineEncounterLifecycleProfileSchema = z.literal("guards-surrender-v1");
export type EngineEncounterLifecycleProfile = z.infer<typeof engineEncounterLifecycleProfileSchema>;

export const engineEncounterDecisionSchema = z.enum([
  "accept_surrender",
  "reject_surrender",
  "capture",
  "retreat",
  "pursue",
  "continue_attack",
]);
export type EngineEncounterDecision = z.infer<typeof engineEncounterDecisionSchema>;

export type EngineEncounterPhase = "pre-combat" | "active" | "resolving" | "terminal";
export type EngineEncounterOutcome = "killed" | "surrendered" | "captured" | "escaped" | "player_surrendered";

export interface EngineEncounterApproachEvidence {
  challengeId: "stealth-perception-v1";
  approach: string;
  targetId: string;
  actorRoll: number;
  actorModifier: number;
  actorTotal: number;
  opponentRoll: number;
  opponentModifier: number;
  opponentTotal: number;
  outcome: "success" | "failure-with-complication";
  consumed: boolean;
}

export interface EngineEncounterSurprise {
  eligible: boolean;
  consumed: boolean;
  source: "stealth-perception-v1" | "compatibility-default";
  evidence: EngineEncounterApproachEvidence | null;
}

export interface EngineEncounterInitiativeEntry {
  actorId: string;
  roll: number;
  modifier: number;
  total: number;
  tieBreaker: string;
  surprised: boolean;
}

export interface EngineEncounterInitiative {
  formulaRevision: "initiative-v1";
  entries: EngineEncounterInitiativeEntry[];
  order: string[];
  activeIndex: number;
  rolledAtVersion: number;
}

export interface EngineEncounterSurrenderOffer {
  id: string;
  targetId: string;
  reason: "ally-fallen";
  thresholdRatio: 0.5;
  status: "offered" | "accepted" | "rejected" | "pursued" | "captured";
  sourceVersion: number;
}

export interface EngineEncounterMorale {
  policy: "guards-surrender-v1";
  thresholdRatio: 0.5;
  offers: EngineEncounterSurrenderOffer[];
  lastTriggerId: string | null;
}

export interface EngineEncounterLifecycle {
  profile: EngineEncounterLifecycleProfile;
  phase: EngineEncounterPhase;
  surprise: EngineEncounterSurprise;
  initiative: EngineEncounterInitiative;
  morale: EngineEncounterMorale;
  objective: {
    id: "resolve-without-killing";
    status: "pending" | "succeeded" | "failed";
  };
  outcome: EngineEncounterOutcome | null;
  outcomeId: string | null;
  claimedRewards: string[];
  nonlethalDefeatIds: string[];
  retreatPlanRevision: number | null;
}

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

const engineExperienceThemeSchema = z.string().trim().min(1).max(120);

export const engineExperiencePillarWeightsSchema = z.object({
  combat: z.number().int().min(0).max(100),
  exploration: z.number().int().min(0).max(100),
  social: z.number().int().min(0).max(100),
  mystery: z.number().int().min(0).max(100),
}).strict();
export type EngineExperiencePillarWeights = z.infer<typeof engineExperiencePillarWeightsSchema>;

export const engineExperienceProfileInputSchema = z.object({
  pillarWeights: engineExperiencePillarWeightsSchema,
  difficulty: z.enum(["gentle", "standard", "challenging"]),
  narrationStyle: z.enum(["compact", "immersive"]),
  verbosity: z.enum(["compact", "standard", "detailed"]),
  guidance: z.enum(["open", "balanced", "guided"]),
  rulesTransparency: z.enum(["summary", "explicit"]),
  excludedThemes: z.array(engineExperienceThemeSchema).max(12).default([]),
  fadeToBlackThemes: z.array(engineExperienceThemeSchema).max(12).default([]),
}).strict();
export type EngineExperienceProfileInput = z.infer<typeof engineExperienceProfileInputSchema>;

export const engineExperienceFeedbackSchema = z.object({
  id: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().min(1).max(500).optional(),
  createdAt: z.string().datetime(),
}).strict();
export type EngineExperienceFeedback = z.infer<typeof engineExperienceFeedbackSchema>;

export const engineExperienceProfileSchema = engineExperienceProfileInputSchema.extend({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  source: z.literal("player"),
  difficultyPolicyKey: z.string().trim().min(1).max(120),
  feedback: z.array(engineExperienceFeedbackSchema).max(8),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type EngineExperienceProfile = z.infer<typeof engineExperienceProfileSchema>;

export interface EngineExperienceProfileProjection {
  version: 1;
  revision: number;
  pillarWeights: EngineExperiencePillarWeights;
  difficulty: EngineExperienceProfileInput["difficulty"];
  difficultyPolicyKey: string;
  narrationStyle: EngineExperienceProfileInput["narrationStyle"];
  verbosity: EngineExperienceProfileInput["verbosity"];
  guidance: EngineExperienceProfileInput["guidance"];
  rulesTransparency: EngineExperienceProfileInput["rulesTransparency"];
  excludedThemes: string[];
  fadeToBlackThemes: string[];
}

export const engineExperienceProfileUpdateCommandSchema = z.object({
  kind: z.literal("experience_profile_update"),
  profile: engineExperienceProfileInputSchema,
}).strict();
export type EngineExperienceProfileUpdateCommand = z.infer<typeof engineExperienceProfileUpdateCommandSchema>;

export const engineExperienceFeedbackAddCommandSchema = z.object({
  kind: z.literal("experience_feedback_add"),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().min(1).max(500).optional(),
}).strict();
export type EngineExperienceFeedbackAddCommand = z.infer<typeof engineExperienceFeedbackAddCommandSchema>;

export const engineExperienceBoundaryCommandSchema = z.object({
  kind: z.literal("experience_boundary"),
  theme: engineExperienceThemeSchema,
  action: z.enum(["redirect", "fade_to_black", "skip"]),
}).strict();
export type EngineExperienceBoundaryCommand = z.infer<typeof engineExperienceBoundaryCommandSchema>;

export const engineAdjudicationFeasibilitySchema = z.enum(["automatic", "uncertain", "impossible"]);
export type EngineAdjudicationFeasibility = z.infer<typeof engineAdjudicationFeasibilitySchema>;

export const engineAdjudicationOutcomeSchema = z.enum([
  "automatic-success",
  "success",
  "success-with-cost",
  "partial-success",
  "failure-with-progress",
  "failure-with-complication",
  "failure-closes-opportunity",
  "impossible",
]);
export type EngineAdjudicationOutcome = z.infer<typeof engineAdjudicationOutcomeSchema>;

export const engineAdjudicationStakeSchema = z.enum(["time", "noise", "exposure", "opportunity"]);
export type EngineAdjudicationStake = z.infer<typeof engineAdjudicationStakeSchema>;

export const engineAdjudicationDifficultyBandSchema = z.enum(["gentle", "standard", "challenging"]);
export type EngineAdjudicationDifficultyBand = z.infer<typeof engineAdjudicationDifficultyBandSchema>;

export const engineFailurePressureStatusSchema = z.enum(["rising", "compromised"]);
export type EngineFailurePressureStatus = z.infer<typeof engineFailurePressureStatusSchema>;

export const engineFailurePressureSchema = z.object({
  id: z.string().trim().min(1).max(160),
  actorId: z.string().trim().min(1).max(120),
  challengeId: z.string().trim().min(1).max(120),
  sceneId: z.string().trim().min(1).max(120),
  failureCount: z.number().int().positive().max(10),
  threshold: z.number().int().positive().max(10),
  status: engineFailurePressureStatusSchema,
  lastFailureVersion: z.number().int().nonnegative(),
}).strict();
export type EngineFailurePressure = z.infer<typeof engineFailurePressureSchema>;

export interface EngineAdjudicationCosts {
  timeMinutes: number;
  noise: number;
  exposure: number;
}

export interface EngineAdjudicationDecision {
  id: string;
  actorId: string;
  challengeId: string;
  sceneId: string;
  goal: string;
  approach: string;
  approachHash: string;
  clarificationStatus: "not_needed" | "required";
  feasibility: EngineAdjudicationFeasibility;
  selectedRuleFamily: string;
  dcSource: "none" | "reviewed_challenge" | "reviewed_difficulty_band" | "opposed_actor" | "pinned_content";
  dc: number | null;
  dcProvenance: string;
  requestedDifficultyBand: EngineAdjudicationDifficultyBand | null;
  selectedDifficultyBand: EngineAdjudicationDifficultyBand;
  difficultyPolicyKey: string;
  requestedStakes: EngineAdjudicationStake[];
  stakes: EngineAdjudicationStake[];
  allowedOutcomes: EngineAdjudicationOutcome[];
  retryPolicy: "not_applicable" | "new_approach_or_state_change";
  costs: EngineAdjudicationCosts;
  informationPolicy: "public" | "withheld";
  helperId?: string;
  opponentId?: string;
  tool?: string;
  policyRevision: string;
  rulesVersion: string;
}

export interface EngineAdjudicationAttempt extends EngineAdjudicationDecision {
  outcome: EngineAdjudicationOutcome;
  attemptVersion: number;
  roll?: number;
  total?: number;
}

export interface EngineSocialCheckAttribution {
  actionOwnerActorId: string;
  rollingActorId: string;
  rollingActorName: string;
  actingActorId: string;
  actingActorName: string;
  targetId: string;
  targetName: string;
  modifierSourceActorId: string;
  modifierSourceActorName: string;
  mode: "direct" | "npc-mediated";
}

export interface EngineCheckEvidence {
  kind: "ability-check" | "opposed-check";
  actorId: string;
  ability: EngineAbility;
  skill: string | null;
  tool: string | null;
  proficiency: boolean;
  expertise: boolean;
  modifier: number;
  modifierSources: string[];
  advantageSources: string[];
  disadvantageSources: string[];
  mode: "normal" | "advantage" | "disadvantage" | "cancelled";
  helperId?: string;
  opponentId?: string;
  opponentAbility?: EngineAbility;
  opponentSkill?: string;
  opponentModifier?: number;
  opponentTotal?: number;
  attribution?: EngineSocialCheckAttribution;
  informationPolicy: "public" | "withheld";
  formulaRevision: string;
}

export const engineChallengeAttemptCommandSchema = z.object({
  kind: z.literal("challenge_attempt"),
  challengeId: z.string().trim().min(1).max(120),
  goal: z.string().trim().min(1).max(2_000),
  approach: z.string().trim().min(1).max(2_000),
  sceneId: z.string().trim().min(1).max(120).optional(),
  difficultyBand: engineAdjudicationDifficultyBandSchema.optional(),
  requestedStakes: z.array(engineAdjudicationStakeSchema).max(4).optional(),
  factId: z.string().trim().min(1).max(120).optional(),
  helperId: z.string().trim().min(1).max(120).optional(),
  opponentId: z.string().trim().min(1).max(120).optional(),
  informationPolicy: z.enum(["public", "withheld"]).optional(),
  tool: z.string().trim().min(1).max(120).optional(),
}).strict();
export type EngineChallengeAttemptCommand = z.infer<typeof engineChallengeAttemptCommandSchema>;

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
  experienceProfile: engineExperienceProfileInputSchema.optional(),
}).strict();
export type EngineCampaignCreate = z.infer<typeof engineCampaignCreateSchema>;

export const engineCampaignDeleteSchema = z
  .object({
    expectedCampaignVersion: z.number().int().nonnegative(),
    confirmation: z.literal("DELETE"),
  })
  .strict();
export type EngineCampaignDeleteRequest = z.infer<typeof engineCampaignDeleteSchema>;

export const engineTravelCommandSchema = z.object({
  kind: z.literal("travel"),
  routeId: z.string().trim().min(1).max(120),
  destinationId: z.string().trim().min(1).max(120),
  pace: z.enum(["normal", "fast"]),
  navigatorId: z.string().trim().min(1).max(120).optional(),
  watcherId: z.string().trim().min(1).max(120).optional(),
}).strict();
export type EngineTravelCommand = z.infer<typeof engineTravelCommandSchema>;

export const engineProjectCommandSchema = z.object({
  kind: z.literal("project"),
  action: z.enum(["start", "work"]),
  projectId: z.string().trim().min(1).max(120),
}).strict();
export type EngineProjectCommand = z.infer<typeof engineProjectCommandSchema>;

export const engineCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("observe") }).strict(),
  z.object({ kind: z.literal("listen") }).strict(),
  engineWorldContextCommandSchema,
  engineContentCompileCommandSchema,
  z
    .object({
      kind: z.literal("player_note_add"),
      text: z.string().trim().min(1).max(4_000),
      source: z.enum(["player", "dm"]).default("dm"),
    })
    .strict(),
  engineExperienceProfileUpdateCommandSchema,
  engineExperienceFeedbackAddCommandSchema,
  engineExperienceBoundaryCommandSchema,
  engineChallengeAttemptCommandSchema,
  z.object({ kind: z.literal("character_update"),
    name: z.string().trim().min(1).max(80).optional(),
    background: z.string().trim().min(1).max(120).optional(),
    alignment: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    abilityScores: z.record(engineAbilitySchema, z.number().int().min(3).max(20)).optional(),
    details: engineCharacterDetailsSchema.optional(),
  }).strict(),
  z.object({ kind: z.literal("move"), destinationId: z.string().trim().min(1).max(120) }).strict(),
  engineTravelCommandSchema,
  z
    .object({
      kind: z.literal("interact"),
      targetId: z.string().trim().min(1).max(80),
      goal: z.string().trim().min(1).max(2_000),
      affordance: engineWorldObjectAffordanceSchema.optional(),
      sourceId: z.string().trim().min(1).max(120).optional(),
      destinationId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("social_check"),
      npcId: z.string().trim().min(1).max(120),
      actingNpcId: z.string().trim().min(1).max(120).optional(),
      ability: engineAbilitySchema,
      skill: z.string().trim().min(1).max(80).optional(),
      goal: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  engineNpcTickCommandSchema,
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
  engineSocialActionCommandSchema,
  z
    .object({
      kind: z.literal("quest_create"),
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
  z
    .object({
      kind: z.literal("quest_transition"),
      questId: questIdentifierSchema,
      transitionId: questIdentifierSchema,
      choiceId: questIdentifierSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("quest_update"),
      questId: z.string().trim().min(1).max(120),
      status: z.enum(["active", "completed", "failed", "abandoned", "expired"]).optional(),
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
      checkCategory: z.enum(["attack-roll", "ability-check", "saving-throw"]).optional(),
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
  z.object({
    kind: z.literal("inventory_transfer"),
    itemId: z.string().trim().min(1).max(120),
    targetContainerId: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(100).default(1),
  }).strict(),
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
      passive: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("combat_start"),
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
  z.object({
    kind: z.literal("encounter_decision"),
    decision: engineEncounterDecisionSchema,
    targetId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  z.object({
    kind: z.literal("custody_action"),
    action: z.enum(["surrender", "release", "escape"]),
    guardId: worldContextEntityIdSchema.optional(),
    affectedActorIds: z.array(worldContextEntityIdSchema).min(1).max(8).optional(),
  }).strict(),
  z
    .object({
      kind: z.literal("spawn_creature"),
      creatureKey: z.string().trim().startsWith("open5e:creature:").max(300),
      count: z.number().int().min(1).max(20),
      distanceFeet: z.number().nonnegative().max(100_000).optional(),
      position: engineTacticalPositionSchema.optional(),
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
      reactionId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("reaction_response"),
      reactionId: z.string().trim().min(1).max(120),
      decision: z.enum(["accept", "decline"]),
      spellKey: z.string().trim().startsWith("open5e:spell:").max(300).optional(),
      slotLevel: z.number().int().min(1).max(9).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("combat_action"),
      action: z.enum(["attack", "attack_nonlethal", "dodge", "dash", "disengage", "help", "ready", "second_wind"]),
      targetId: z.string().trim().min(1).max(80).optional(),
      weaponId: z.string().trim().min(1).max(120).optional(),
      goal: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("combat_move"),
      geometryRevision: z.number().int().nonnegative(),
      destination: engineTacticalPositionSchema,
      path: z.array(engineTacticalPositionSchema).max(400).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("end_turn") }).strict(),
  engineControlledActorCreateCommandSchema,
  engineControlledActorCommandSchema,
  engineControlledActorDismissCommandSchema,
  enginePartyCreateCommandSchema,
  enginePartySetViewpointCommandSchema,
  enginePartySplitCommandSchema,
  enginePartyRejoinCommandSchema,
  enginePartySharedTransferCommandSchema,
  enginePartyGroupCheckCommandSchema,
  engineSituationCreateCommandSchema,
  engineSituationVisitCommandSchema,
  engineSituationClueAttemptCommandSchema,
  engineSituationIgnoreCommandSchema,
  engineSituationChoiceCommandSchema,
  z.object({
    kind: z.literal("advance_turn"),
    combatantId: z.string().trim().min(1).max(120).optional(),
    actionKey: z.string().trim().min(1).max(300).optional(),
    attackKey: z.string().trim().min(1).max(240).optional(),
  }).strict(),
  z.object({
    kind: z.literal("advancement_confirm"),
    pendingId: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({
    kind: z.literal("npc_advance"),
    combatantId: z.string().trim().min(1).max(120),
    templateId: z.literal("veteran"),
  }).strict(),
  z.object({ kind: z.literal("death_save") }).strict(),
  z
    .object({
      kind: z.literal("loot"),
      corpseId: z.string().trim().min(1).max(120).optional(),
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
  engineProjectCommandSchema,
  z.object({ kind: z.literal("tutorial_advance") }).strict(),
  z.object({ kind: z.literal("declare"), goal: z.string().trim().min(1).max(2_000) }).strict(),
  engineProceduralNoticeCommandSchema,
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

/** Internal engine command used by the production-room API; never model-facing. */
export interface EngineProductionRoomCommand {
  kind: "production_room_enter";
}

/** Internal engine command used by the session-orchestration API; never model-facing. */
export interface EngineOrchestrationCommand {
  kind: "orchestration_decision";
  decision: OrchestrationDecisionInput;
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
  adjudication?: EngineAdjudicationDecision;
  check?: EngineCheckEvidence;
  outcome: string;
  stateChanges: Array<{ path: string; before: unknown; after: unknown }>;
  data: unknown;
}

export type EnginePersistedCommand = EngineCommand | EngineTurnPlanCommand | EngineContentRepinCommand | EngineProductionRoomCommand | EngineOrchestrationCommand;
export type EngineResolutionTool = EngineToolName | "declare" | "listen" | "turn_plan" | "content_repin" | "production_room" | "orchestration";

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

export const engineProductionRoomEnterRequestSchema = engineOpeningRequestSchema;
export type EngineProductionRoomEnterRequest = z.infer<typeof engineProductionRoomEnterRequestSchema>;

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
  objects: EngineWorldObjectInstance[];
}

export interface EngineNpcScheduleEntry {
  id: string;
  locationRef: string;
  startMinute: number;
  endMinute: number;
}

export interface EngineNpcGoal {
  id: string;
  title: string;
  priority: number;
  status: "active" | "blocked" | "complete";
}

export interface EngineNpcResourceState {
  inventory: EngineInventoryItem[];
  copper: number;
  actionPoints: number;
}

export interface EngineNpcActionOffer {
  id: EngineNpcAgencyAction;
  label: string;
  legal: true;
  prerequisites: string[];
  costs: { actionPoints: number; copper: number; itemIds: string[] };
}

export interface EngineNpcPendingAction {
  triggerId: string;
  trigger: EngineNpcTickCommand["trigger"];
  offers: EngineNpcActionOffer[];
  selectedOfferId: EngineNpcAgencyAction;
  createdAt: string;
}

export interface EngineNpcInvocation {
  id: string;
  triggerId: string;
  trigger: EngineNpcTickCommand["trigger"];
  npcId: string;
  provider: "deterministic" | "openrouter";
  model: string;
  inputTokens: number;
  cacheTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  outcome: "selected" | "fallback" | "circuit_open" | "rejected";
  fallback: boolean;
  selectedOfferId: EngineNpcAgencyAction | null;
  budget: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    maxConsecutiveFailures: number;
    maxInvocationsPerDay: number;
  };
  createdAt: string;
}

export interface EngineNpcAgencyState {
  actorType: "merchant" | "guard" | "traveler";
  locationRef: string;
  schedule: EngineNpcScheduleEntry[];
  goals: EngineNpcGoal[];
  resources: EngineNpcResourceState;
  hp: number;
  maxHp: number;
  lifecycleState: "conscious" | "dying" | "stable" | "dead";
  pendingAction: EngineNpcPendingAction | null;
  completedTriggerIds: string[];
  reportedCrimeIds: string[];
  invocations: EngineNpcInvocation[];
  consecutiveFailures: number;
  circuitState: "closed" | "open";
  invocationDay: number;
  invocationsToday: number;
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
  custody?: EngineCustodyStatus | null;
  agency?: EngineNpcAgencyState;
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
  containerCapacity?: number;
  ammunitionId?: string;
  effectKey?: "lantern-ward-v1";
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
  /** Optional link for authored runtime items; inventory remains authoritative for ownership/location. */
  runtimeContentInstanceId?: string;
  contentKey?: string;
  packHash?: string;
  authoredDefinition?: EngineItemDefinition;
  slot?: EngineEquipmentSlot;
  equipped?: boolean;
  attuned?: boolean;
  ownerRef?: EngineItemOwnerRef;
  containerRef?: string;
  charges?: EngineItemChargeState;
  provenance?: EngineItemProvenance;
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
  facts: EngineWorldFact[];
}

export interface PublicProjection {
  actorId: string;
  informationTiers: InformationTier[];
  worldContext: EngineWorldContextView | null;
  proceduralNotices: EngineProceduralNoticeView[];
  facts: EngineWorldFact[];
  knowledge: EngineKnowledgeRecord[];
  social: EngineSocialProjection;
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
  senses: EngineSenseCapabilities;
  features: string[];
  featureUses: Record<string, number>;
  spellcasting: EngineSpellcasting | null;
  hp: number;
  maxHp: number;
  lifecycleState: EngineLifecycleState;
  deathRecord: EngineDeathRecord | null;
  corpseId: string | null;
  ac: number;
  inventory: EngineInventoryItem[];
  currency: EngineCurrency;
  gold: number;
  xp: number;
  conditions: string[];
  conditionEffects: EngineAppliedCondition[];
  custody?: EngineCustodyStatus | null;
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  /** Revision of the server-owned progression formulas used for derived state. */
  progressionFormulaRevision?: string;
  /** Canonical max HP captured by the progression transition for load-time repair. */
  progressionMaxHp?: number;
}

export interface EngineAdvancementPolicy {
  version: 1;
  mode: "milestone";
  maxLevel: 2;
  hpPolicy: "fixed-average";
  formulaRevision: "progression-v1";
}

export interface EngineAdvancementPreview {
  fromLevel: number;
  toLevel: number;
  hpGain: number;
  maxHpBefore: number;
  maxHpAfter: number;
  currentHpBefore: number;
  currentHpAfter: number;
  hitDieBefore: number;
  hitDieAfter: number;
  hitDiceRemainingBefore: number;
  hitDiceRemainingAfter: number;
  proficiencyBonusBefore: number;
  proficiencyBonusAfter: number;
  savingThrowsBefore: Record<EngineAbility, number>;
  savingThrowsAfter: Record<EngineAbility, number>;
  skillsBefore: Record<string, EngineSkill>;
  skillsAfter: Record<string, EngineSkill>;
  spellSlotsBefore: Record<string, number> | null;
  spellSlotsAfter: Record<string, number> | null;
  featureRefsAdded: EngineFeatureReference[];
  featuresAdded: string[];
}

export interface EnginePendingAdvancement {
  version: 1;
  id: string;
  sourceKind: "quest-milestone";
  sourceId: string;
  sourceCommandId: string;
  sourceVersion: number;
  ownerActorId: string;
  fromLevel: 1;
  toLevel: 2;
  className: string;
  classRef: EngineContentReference | null;
  rulesVersion: string;
  formulaRevision: "progression-v1";
  legalChoices: {
    className: string;
    classRef: EngineContentReference | null;
  };
  preview: EngineAdvancementPreview;
  status: "pending" | "consumed";
  consumedCommandId?: string;
  consumedAt?: string;
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
  | { kind: "stat-modifier"; stat: "armor-class"; value: number; stackingKey: string }
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
  /** Optional campaign-clock anchor for fixed minute/hour/day durations. */
  startTimeMinutes?: number;
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
  position: EngineTacticalPosition;
  footprint: EngineTacticalFootprint;
  /** Derived compatibility projection; tactical positions are authoritative. */
  distanceFeet: number;
  conditions: string[];
  actionResources: Record<string, EngineActionResource>;
  progression?: EngineCombatantProgression | null;
}

export interface EngineCombatantProgression {
  templateId: "veteran";
  templateVersion: "v1";
  sourceCommandId: string;
  sourceVersion: number;
  base: {
    maxHp: number;
    armorClass: number;
    challengeRating: number;
    experiencePoints: number | null;
  };
  revised: {
    maxHp: number;
    armorClass: number;
    challengeRating: number;
    experiencePoints: number | null;
  };
  modifications: {
    maxHp: number;
    armorClass: number;
    attackBonus: number;
    damageBonus: number;
  };
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

export type EngineControlledActorKind = "companion" | "summon";
export type EngineControlledActorStatus = "active" | "incapacitated" | "dead" | "dismissed" | "expired";
export type EngineControlledActorTurnPolicy = "controller-turn";
export type EngineControlledActorDefaultBehavior = "guard";
export type EngineControlledActorBehavior = "idle" | "attack" | "guard" | "follow";
export type EngineControlledActorCommandCost = "action" | "bonus-action";
export type EngineControlledActorProgressionPolicy = "none";
export type EngineControlledActorLootPolicy = "none";
export type EngineControlledActorInventoryPolicy = "independent";

export interface EngineControlledActorAttack {
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  damageType: string;
  rangeFeet: number;
}

export interface EngineControlledActor {
  id: string;
  profileId: EngineControlledActorProfile;
  kind: EngineControlledActorKind;
  name: string;
  ownerActorId: string;
  controllerActorId: string;
  summonerActorId: string | null;
  riderActorId: string | null;
  passengerOfActorId: string | null;
  employerActorId: string | null;
  charmControllerActorId: string | null;
  factionId: string | null;
  sourceRef: string | null;
  status: EngineControlledActorStatus;
  hp: number;
  maxHp: number;
  position: EngineTacticalPosition;
  footprint: EngineTacticalFootprint;
  senses: EngineSenseCapabilities;
  turnPolicy: EngineControlledActorTurnPolicy;
  defaultBehavior: EngineControlledActorDefaultBehavior;
  progressionPolicy: EngineControlledActorProgressionPolicy;
  lootPolicy: EngineControlledActorLootPolicy;
  inventoryPolicy: EngineControlledActorInventoryPolicy;
  turnBudget: EngineTurnBudget;
  commandedThisTurn: boolean;
  lastCommandId: string | null;
  lastBehavior: EngineControlledActorBehavior;
  guardedUntilRound: number | null;
  attack: EngineControlledActorAttack;
  effects: EngineEffectInstance[];
  custody?: EngineCustodyStatus | null;
  inventory: EngineInventoryItem[];
  createdAtMinutes: number;
  expiresAtMinutes: number | null;
  terminalAtMinutes: number | null;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
    profileRevision: string;
  };
}

export interface EngineControlledActorCommandOffer {
  action: EngineControlledActorCommandAction;
  cost: EngineControlledActorCommandCost;
  targetRequired: boolean;
  legal: boolean;
  reason: string | null;
}

export interface EngineControlledActorView extends Omit<
  EngineControlledActor,
  | "inventory"
  | "ownerActorId"
  | "controllerActorId"
  | "summonerActorId"
  | "riderActorId"
  | "passengerOfActorId"
  | "employerActorId"
  | "charmControllerActorId"
  | "factionId"
  | "sourceRef"
  | "provenance"
> {
  inventory: EngineInventoryItemView[];
  knowledge: EngineKnowledgeRecord[];
  legalCommands: EngineControlledActorCommandOffer[];
}

export type EnginePartyMemberRole = "leader" | "companion";
export type EnginePartyMode = "together" | "split";

export interface EnginePartyMember {
  actorId: string;
  role: EnginePartyMemberRole;
  controllerActorId: string;
  sceneId: string;
  locationRef: string;
  joinedAtVersion: number;
}

export interface EnginePartySharedState {
  questIds: string[];
  currency: EngineCurrency;
  container: {
    id: string;
    name: string;
    inventory: EngineInventoryItem[];
  };
}

export interface EnginePartyConsentPolicy {
  mode: "single-controller-future-member-seam";
  permanentChoiceRequires: "leader-confirmation";
}

export interface EnginePartyState {
  id: string;
  leaderActorId: string;
  activeViewpointActorId: string;
  mode: EnginePartyMode;
  members: EnginePartyMember[];
  shared: EnginePartySharedState;
  rewardAllocation: "leader-only";
  consent: EnginePartyConsentPolicy;
  revision: number;
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
  ammunitionId?: string;
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
  trigger: "incoming-attack-would-hit";
  sourceCommandId: string;
  sourceVersion: number;
  actorId: string;
  attackerId: string;
  targetId: string;
  sourceActionKey: string;
  attackName: string;
  attackRoll: number;
  attackTotal: number;
  attackBonus: number;
  critical: boolean;
  originalArmorClass: number;
  damageDiceCount: number;
  damageDieSides: number;
  damageBonus: number;
  damageType: string;
  eligibleReactionIds: string[];
  status: "offered" | "accepted" | "declined" | "resolved";
  resumeToken: string;
}

export type EngineActionOfferTiming = "action" | "bonus_action" | "reaction" | "movement" | "free";

export interface EngineActionOfferCost {
  action?: number;
  bonusAction?: number;
  reaction?: number;
  movementFeet?: number;
}

/**
 * A server-derived action choice.  The caller may select an offer, but never
 * supplies its timing, cost, target set, or legality.
 */
export interface EngineActionOffer {
  actionId: string;
  label: string;
  timing: EngineActionOfferTiming;
  validTargets: string[];
  cost: EngineActionOfferCost;
  stateVersion: number;
  reasonUnavailable: string | null;
}

export interface EngineCombat {
  status: "none" | "active" | "ended";
  encounterId: string | null;
  encounterName: string | null;
  lifecycle: EngineEncounterLifecycle | null;
  round: number;
  activeActorId: string | null;
  turnBudget: EngineTurnBudget;
  tactical: EngineCombatTacticalState;
  pendingReaction: EnginePendingReaction | null;
  enemies: EngineCombatant[];
  lootClaimed: boolean;
  lastAction: string | null;
}

export interface EngineCombatView extends Omit<EngineCombat, "enemies"> {
  enemies: EngineCombatantView[];
}

export type EngineQuestStatus = "active" | "completed" | "failed" | "abandoned" | "expired";
export type EngineQuestTerminalOutcome = "success" | "failure" | "abandonment" | "expiration";

export interface EngineQuestObjective {
  id: string;
  title: string;
  mode: "ordered" | "unordered";
  optional: boolean;
  hidden: boolean;
  discovered: boolean;
  status: "pending" | "completed";
  predicate: EngineQuestPredicate;
  completedAtMinutes: number | null;
  evidence: string | null;
}

export interface EngineQuestTransition {
  id: string;
  label: string;
  outcome: EngineQuestTerminalOutcome;
  predicates: EngineQuestPredicate[];
  requiresObjectiveIds: string[];
  choiceId?: string;
  consequence: EngineQuestConsequence;
}

export interface EngineQuestProgressClock {
  id: string;
  title: string;
  current: number;
  max: number;
  source: "time" | "objective" | "choice";
  resolvedAtMinutes: number | null;
  resolvedByTransitionId: string | null;
}

export interface EngineQuestConsequenceRecord {
  transitionId: string;
  outcomeId: string;
  rewardKeys: string[];
  reputationApplied: boolean;
  worldChangeApplied: boolean;
  followUpEligible: boolean;
  appliedAtMinutes: number;
  sourceCommandId: string;
}

export interface EngineQuestGraph {
  objectives: EngineQuestObjective[];
  transitions: EngineQuestTransition[];
  deadlineAtMinutes: number | null;
  deadlineTransitionId: string | null;
  followUpQuestId: string | null;
  followUpEligible: boolean;
  clock: EngineQuestProgressClock | null;
  terminalTransitionId: string | null;
  consequenceRecords: EngineQuestConsequenceRecord[];
}

export interface EngineQuest {
  id: string;
  title: string;
  objective: string;
  status: EngineQuestStatus;
  reward: { xp: number; copper: number };
  rewardClaimed: boolean;
  progress: number;
  giverNpcId?: string;
  deadline?: string;
  /** Engine-owned in-fiction deadline. `deadline` remains legacy display text. */
  deadlineAtMinutes?: number;
  graph?: EngineQuestGraph;
}

export type EngineTravelPace = "normal" | "fast";
export type EngineGameWeather = "clear" | "rain" | "storm";

export interface EngineGameTime {
  calendarId: string;
  year: number;
  day: number;
  hour: number;
  minute: number;
  totalMinutes: number;
}

export interface EngineScheduledEvent {
  id: string;
  kind: "rest-interruption" | "effect-expiry" | "world-clock" | "quest-deadline" | "social-propagation" | "controlled-actor-expiry";
  dueAtMinutes: number;
  status: "pending" | "processed";
  sourceRef?: string;
  targetRef?: string;
  processedAtMinutes?: number;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
  };
}

export interface EngineTravelPlan {
  id: string;
  routeId: string;
  originRef: string;
  destinationRef: string;
  pace: EngineTravelPace;
  navigatorId: string;
  watcherId: string;
  distanceMiles: number;
  elapsedMinutes: number;
  startedAtMinutes: number;
  arrivalAtMinutes: number;
  status: "arrived" | "failed";
  navigation: {
    roll: number;
    modifier: number;
    total: number;
    dc: number;
    success: boolean;
  };
  supplies: { rations: number; water: number };
  weather: EngineGameWeather;
  randomEventId: string;
  forcedMarch: boolean;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
  };
}

export interface EngineRestState {
  status: "idle" | "in_progress" | "completed" | "interrupted";
  restType: "short" | "long" | null;
  startedAtMinutes: number | null;
  completedAtMinutes: number | null;
  requiredMinutes: number;
  interruptionEventId: string | null;
  lastCompletedAtMinutes: number | null;
}

export interface EngineSurvivalState {
  exhaustionLevel: number;
  exposure: number;
  forcedMarches: number;
  weather: EngineGameWeather;
}

export interface EngineWorldClock {
  id: string;
  name: string;
  elapsedMinutes: number;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
  };
}

export interface EngineRandomEventResolution {
  id: string;
  trigger: "travel-day" | "travel-watch" | "rest-watch" | "downtime";
  triggerId: string;
  tableId: string;
  tableVersion: string;
  contextHash: string;
  occurrenceRoll: number;
  occurrenceThreshold: number;
  triggered: boolean;
  selectionRoll?: number;
  selectedEntryId?: string;
  reusedEntityIds: string[];
  instantiatedEntityIds: string[];
  createdFactIds: string[];
  createdClockIds: string[];
  createdSituationIds: string[];
  createdEncounterIds: string[];
  sourceEventId: string;
  campaignVersion: number;
}

export interface EngineProjectClock {
  id: string;
  definitionId: "research-v1";
  title: string;
  workRequiredMinutes: number;
  workCompletedMinutes: number;
  materialProperty: "project-material";
  materialQuantity: number;
  status: "active" | "completed";
  startedAtMinutes: number;
  completedAtMinutes: number | null;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
  };
}

export interface EngineTimeState {
  gameTime: EngineGameTime;
  scheduledEvents: EngineScheduledEvent[];
  travel: EngineTravelPlan | null;
  rest: EngineRestState;
  survival: EngineSurvivalState;
  worldClocks: EngineWorldClock[];
  randomEvents: EngineRandomEventResolution[];
  projects: EngineProjectClock[];
}

export interface EngineImprovEffect {
  id: string;
  title: string;
  description: string;
  effectType: "fictional" | "advantage" | "disadvantage" | "condition" | "damage" | "healing" | "movement" | "summoning";
  targetId?: string;
  amount?: number;
  condition?: string;
  checkCategory?: EngineEffectCategory;
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

export type EngineSituationStatus = "active" | "resolved" | "walked-away";
export type EngineSituationReactivityTier = "systemic" | "contextual" | "booster" | "major-branch";
export type EngineSituationChoice = "solve" | "expose" | "bargain" | "walk-away";

export interface EngineSituationNode {
  id: string;
  title: string;
  description: string;
  exitIds: string[];
}

export interface EngineSituationTruth {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "hidden";
  discoveredBy: string[];
}

export interface EngineSituationRevelation {
  id: string;
  title: string;
  truthId: string;
  clueIds: string[];
  status: "hidden" | "revealed";
}

export interface EngineSituationClue {
  id: string;
  title: string;
  locationId: string;
  revelationId: string;
  factId: string;
  challengeId: "barred-door-v1";
  difficultyBand: "gentle" | "standard" | "challenging";
  foundBy: string[];
  attempts: number;
  failedAttempts: number;
  lastComplication: string | null;
}

export interface EngineSituationRole {
  id: string;
  capability: "reveal_location";
  preferredRef: string;
  alternateRefs: string[];
  fallbackRef: string;
  activeSourceRef: string | null;
  status: "preferred" | "fallback" | "impossible";
}

export interface EngineSituationPressure {
  id: string;
  title: string;
  current: number;
  max: number;
  nextAdvanceAtMinutes: number;
  lastAdvancedAtMinutes: number | null;
  defaultDevelopmentId: string;
  defaultDevelopmentApplied: boolean;
}

export interface EngineSituationCriticalObject {
  objectId: string;
  policy: EngineCriticalObjectPolicy;
  acquiredByActorId: string | null;
  destroyed: boolean;
  reaction: "none" | "retained-early" | "declared-loss";
}

export interface EngineSituationOutcome {
  choice: EngineSituationChoice;
  committedAtMinutes: number;
  sourceCommandId: string;
  reactivityTier: EngineSituationReactivityTier;
}

export interface EngineSituation {
  id: string;
  templateId: EngineSituationTemplateId;
  status: EngineSituationStatus;
  currentLocationId: string;
  visitedLocationIds: string[];
  nodes: EngineSituationNode[];
  truths: EngineSituationTruth[];
  revelations: EngineSituationRevelation[];
  clues: EngineSituationClue[];
  role: EngineSituationRole;
  pressure: EngineSituationPressure;
  criticalObject: EngineSituationCriticalObject;
  outcome: EngineSituationOutcome | null;
  sourceRandomEventId: string | null;
  revision: number;
  complicationCount: number;
  lastComplication: string | null;
  provenance: {
    sourceCommandId: string;
    sourceVersion: number;
    rulesVersion: string;
    sourceRandomEvent: {
      id: string;
      tableId: string;
      tableVersion: string;
      entryId: string;
    } | null;
  };
}

export interface EngineSituationProjection {
  id: string;
  templateId: EngineSituationTemplateId;
  status: EngineSituationStatus;
  currentLocationId: string;
  visitedLocationIds: string[];
  nodes: EngineSituationNode[];
  truths: Array<Pick<EngineSituationTruth, "id" | "title" | "visibility"> & { description?: string; discovered: boolean }>;
  revelations: Array<Pick<EngineSituationRevelation, "id" | "title" | "status">>;
  clues: Array<Omit<EngineSituationClue, "factId">>;
  role: Omit<EngineSituationRole, "preferredRef"> & { preferredAvailable: boolean };
  pressure: Omit<EngineSituationPressure, "nextAdvanceAtMinutes">;
  criticalObject: EngineSituationCriticalObject;
  outcome: EngineSituationOutcome | null;
  sourceRandomEventId: string | null;
  revision: number;
  complicationCount: number;
  lastComplication: string | null;
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
  experienceProfile: EngineExperienceProfile;
  adjudicationHistory: EngineAdjudicationAttempt[];
  /** Bounded pressure records prevent repeated failed approaches from stalling a scene. */
  failurePressures: EngineFailurePressure[];
  phase: EngineCampaignPhase;
  tutorialStep: number;
  characterCreation: EngineCharacterCreationState;
  advancementPolicy: EngineAdvancementPolicy;
  pendingAdvancement: EnginePendingAdvancement | null;
  /** Shared exactly-once reward-key space used by encounters and quests. */
  claimedRewards: string[];
  controlledActors: EngineControlledActor[];
  party: EnginePartyState | null;
  time: EngineTimeState;
  social?: EngineSocialState;
  worldContext: EngineWorldContext | null;
  /** Strict, inert runtime content definitions and separately persisted instances. */
  runtimeContent: RuntimeContentState;
  proceduralNotices: EngineProceduralNotice[];
  worldFacts: EngineWorldFact[];
  actorKnowledge: EngineKnowledgeRecord[];
  playerNotes: EngineNote[];
  character: EngineCharacter;
  combat: EngineCombat;
  quest: EngineQuest;
  quests: EngineQuest[];
  corpses: EngineCorpse[];
  effects: EngineEffectInstance[];
  improvEffects: EngineImprovEffect[];
  currentBeat: EngineCampaignBeat | null;
  situation: EngineSituation | null;
  /** Private production-room traces are persisted with the campaign but never projected publicly. */
  productionRoom?: ProductionRoomState | null;
  /** Public facilitation metadata; it never contains model/private production-room traces. */
  orchestration?: OrchestrationState | null;
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
  adjudication?: EngineAdjudicationDecision;
  check?: EngineCheckEvidence;
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
  experienceProfile: EngineExperienceProfile;
  failurePressures: EngineFailurePressure[];
  phase: EngineCampaignPhase;
  tutorialStep: number;
  characterCreation: EngineCharacterCreationState;
  advancementPolicy: EngineAdvancementPolicy;
  pendingAdvancement: EnginePendingAdvancement | null;
  time: EngineTimeState;
  social: EngineSocialProjection;
  characterCreated: boolean;
  worldContext: EngineWorldContextView | null;
  runtimeContent: RuntimeContentState;
  proceduralNotices: EngineProceduralNoticeView[];
  playerNotes: EngineNote[];
  log: EngineMessage[];
  availableActions: string[];
  actionOffers: EngineActionOffer[];
  lastRoll: number | null;
  character: EngineCharacterView;
  quests: EngineQuest[];
  corpses: EngineCorpse[];
  effects: EngineEffectInstance[];
  improvEffects: EngineImprovEffect[];
  currentBeat: EngineCampaignBeat | null;
  situation: EngineSituationProjection | null;
  scene: SceneState | null;
  suggestedActions: NarrationEnvelope["suggestedActions"];
  combat: EngineCombatView;
  controlledActors: EngineControlledActorView[];
  party: EnginePartyState | null;
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
