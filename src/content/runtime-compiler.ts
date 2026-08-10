import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The runtime content compiler is deliberately smaller than the rules engine.
 * It accepts descriptive proposals and produces typed, campaign-scoped
 * definitions. Executable mechanics are reviewed by the child issues and are
 * therefore not part of this compiler revision; mundane item instances are
 * bridged into the existing inventory kernel by the engine boundary.
 */

export const runtimeContentKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const runtimeContentNameSchema = z.string().trim().min(1).max(160);
const runtimeContentDescriptionSchema = z.string().trim().min(1).max(4_000);
const runtimeContentTagsSchema = z.array(z.string().trim().min(1).max(80)).max(12);
const runtimeItemAffordancesSchema = z.array(z.enum(["inspect", "take", "give", "drop", "use"])).max(8).default([]);

/**
 * A derived item is a new definition with explicit recipe provenance. The
 * source records are references only; no mechanical field is accepted here,
 * so the existing item policy remains the sole authority for execution.
 */
export const runtimeItemDerivationSchema = z.object({
  sourceDefinitionIds: z.array(z.string().trim().min(1).max(180)).min(1).max(4),
  sourceInstanceIds: z.array(z.string().trim().min(1).max(220)).max(4).default([]),
  recipeKey: runtimeContentKeySchema,
  modification: z.string().trim().min(1).max(400),
}).strict().superRefine((derivation, context) => {
  if (new Set(derivation.sourceDefinitionIds).size !== derivation.sourceDefinitionIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceDefinitionIds"], message: "Derived item source definitions must be unique." });
  }
  if (new Set(derivation.sourceInstanceIds).size !== derivation.sourceInstanceIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceInstanceIds"], message: "Derived item source instances must be unique." });
  }
});
export type RuntimeItemDerivation = z.infer<typeof runtimeItemDerivationSchema>;

const runtimeContentProposalBase = {
  name: runtimeContentNameSchema,
  description: runtimeContentDescriptionSchema,
  key: runtimeContentKeySchema.optional(),
  tags: runtimeContentTagsSchema.default([]),
};

export const runtimeItemProposalSchema = z.object({
  kind: z.literal("item"),
  ...runtimeContentProposalBase,
  category: z.enum(["misc", "tool", "consumable", "quest", "treasure"]),
  material: z.string().trim().min(1).max(80),
  weight: z.number().nonnegative().max(100_000),
  valueCopper: z.number().int().nonnegative().max(100_000_000).optional(),
  affordances: runtimeItemAffordancesSchema,
  derivation: runtimeItemDerivationSchema.optional(),
}).strict().superRefine((proposal, context) => {
  if (proposal.derivation && !proposal.key) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["key"], message: "A derived item must declare a stable key." });
  }
});
export type RuntimeItemProposal = z.infer<typeof runtimeItemProposalSchema>;

export const runtimeLocationExitStateSchema = z.object({
  key: runtimeContentKeySchema,
  label: z.string().trim().min(1).max(160),
  kind: z.enum(["door", "passage", "road", "portal", "stairs", "other"]),
  // Null keeps legacy #131 definitions/relationships readable. New compiled
  // topology always carries the canonical target key.
  targetKey: runtimeContentKeySchema.nullable().default(null),
  open: z.boolean(),
  locked: z.boolean(),
  blocked: z.boolean(),
  hidden: z.boolean(),
  discovered: z.boolean(),
  requirements: z.array(runtimeContentKeySchema).max(8),
}).strict();
export type RuntimeLocationExitState = z.infer<typeof runtimeLocationExitStateSchema>;

const runtimeLocationExitSchema = z.object({
  key: runtimeContentKeySchema,
  label: z.string().trim().min(1).max(160),
  kind: z.enum(["door", "passage", "road", "portal", "stairs", "other"]),
  targetKey: runtimeContentKeySchema,
  open: z.boolean().default(true),
  locked: z.boolean().default(false),
  blocked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  discovered: z.boolean().default(true),
  requirements: z.array(runtimeContentKeySchema).max(8).default([]),
}).strict().superRefine((exit, context) => {
  if (!exit.hidden && !exit.discovered) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["discovered"], message: "A visible exit cannot begin undiscovered." });
  }
});

/**
 * Persisted definitions predate typed topology. Defaults deliberately retain
 * those definitions instead of silently dropping them during reload; a legacy
 * exit with no target remains descriptive and is not traversable.
 */
const runtimeLocationExitDefinitionSchema = z.object({
  key: runtimeContentKeySchema,
  label: z.string().trim().min(1).max(160),
  kind: z.enum(["door", "passage", "road", "portal", "stairs", "other"]),
  targetKey: runtimeContentKeySchema.nullable().default(null),
  open: z.boolean().default(true),
  locked: z.boolean().default(false),
  blocked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  discovered: z.boolean().default(true),
  requirements: z.array(runtimeContentKeySchema).max(8).default([]),
}).strict();

const runtimeLocationEntityRefSchema = z.object({
  kind: z.enum(["actor", "world_object", "merchant"]),
  id: z.string().trim().min(1).max(220),
}).strict();
export type RuntimeLocationEntityRef = z.infer<typeof runtimeLocationEntityRefSchema>;

export const runtimeLocationProposalSchema = z.object({
  kind: z.literal("location"),
  ...runtimeContentProposalBase,
  locationKind: z.enum(["room", "building", "street", "district", "ship_compartment", "cave", "battlefield", "wilderness", "region"]),
  parentKey: runtimeContentKeySchema.optional(),
  features: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  exits: z.array(runtimeLocationExitSchema).max(20).default([]),
  occupants: z.array(runtimeLocationEntityRefSchema).max(20).default([]),
  objects: z.array(runtimeLocationEntityRefSchema.extend({ kind: z.literal("world_object") })).max(40).default([]),
}).strict().superRefine((proposal, context) => {
  const keys = proposal.exits.map((exit) => exit.key);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exits"], message: "Location exit keys must be unique." });
  }
  if ((proposal.parentKey || proposal.exits.length > 0 || proposal.occupants.length > 0 || proposal.objects.length > 0) && !proposal.key) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["key"], message: "A location with canonical topology references must declare a stable key." });
  }
});
export type RuntimeLocationProposal = z.infer<typeof runtimeLocationProposalSchema>;

export const runtimeSpellProposalSchema = z.object({
  kind: z.literal("spell"),
  ...runtimeContentProposalBase,
  school: z.enum(["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"]),
  level: z.number().int().min(0).max(9),
  intent: z.string().trim().min(1).max(1_000),
}).strict();
export type RuntimeSpellProposal = z.infer<typeof runtimeSpellProposalSchema>;

export const contentProposalSchema = z.discriminatedUnion("kind", [
  runtimeItemProposalSchema,
  runtimeLocationProposalSchema,
  runtimeSpellProposalSchema,
]);
export type RuntimeContentProposal = z.infer<typeof contentProposalSchema>;

export const runtimeContentProvenanceSchema = z.object({
  source: z.enum(["player", "dm", "derived", "system"]),
  authorId: z.string().trim().min(1).max(160),
  campaignId: z.string().trim().min(1).max(160),
  sourceRefs: z.array(z.string().trim().min(1).max(240)).max(20),
  compilerRevision: z.literal("runtime-content-v1"),
  policyRevision: z.literal("runtime-content-policy-v1"),
  createdAt: z.string().datetime({ offset: true }),
}).strict();
export type RuntimeContentProvenance = z.infer<typeof runtimeContentProvenanceSchema>;

const runtimeDefinitionBase = {
  id: z.string().trim().min(1).max(180),
  key: runtimeContentKeySchema.nullable(),
  schemaRevision: z.literal(1),
  name: runtimeContentNameSchema,
  description: runtimeContentDescriptionSchema,
  tags: runtimeContentTagsSchema,
  campaignId: z.string().trim().min(1).max(160),
  provenance: runtimeContentProvenanceSchema,
  executionTier: z.literal(0),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(12),
};

export const runtimeItemDefinitionSchema = z.object({
  kind: z.literal("item"),
  ...runtimeDefinitionBase,
  category: runtimeItemProposalSchema.shape.category,
  material: z.string().trim().min(1).max(80),
  weight: z.number().nonnegative().max(100_000),
  valueCopper: z.number().int().nonnegative().max(100_000_000).nullable(),
  affordances: runtimeItemAffordancesSchema,
  // Default preserves #131 item definitions written before derived-item
  // provenance was added to the persisted schema.
  derivation: runtimeItemDerivationSchema.nullable().default(null),
}).strict();
export type RuntimeItemDefinition = z.infer<typeof runtimeItemDefinitionSchema>;

export const runtimeLocationDefinitionSchema = z.object({
  kind: z.literal("location"),
  ...runtimeDefinitionBase,
  locationKind: runtimeLocationProposalSchema.shape.locationKind,
  parentKey: runtimeContentKeySchema.nullable(),
  features: runtimeLocationProposalSchema.shape.features,
  exits: z.array(runtimeLocationExitDefinitionSchema).max(20),
}).strict();
export type RuntimeLocationDefinition = z.infer<typeof runtimeLocationDefinitionSchema>;

export const runtimeSpellDefinitionSchema = z.object({
  kind: z.literal("spell"),
  ...runtimeDefinitionBase,
  school: runtimeSpellProposalSchema.shape.school,
  level: runtimeSpellProposalSchema.shape.level,
  intent: runtimeSpellProposalSchema.shape.intent,
}).strict();
export type RuntimeSpellDefinition = z.infer<typeof runtimeSpellDefinitionSchema>;

export const runtimeContentDefinitionSchema = z.discriminatedUnion("kind", [
  runtimeItemDefinitionSchema,
  runtimeLocationDefinitionSchema,
  runtimeSpellDefinitionSchema,
]);
export type RuntimeContentDefinition = z.infer<typeof runtimeContentDefinitionSchema>;

const runtimeInstanceStateSchema = z.object({
  status: z.enum(["available", "active", "known"]),
  quantity: z.number().int().nonnegative().max(1_000_000).optional(),
}).strict();

export const runtimeContentInstanceSchema = z.object({
  id: z.string().trim().min(1).max(220),
  definitionId: z.string().trim().min(1).max(180),
  kind: z.enum(["item", "location", "spell"]),
  instanceKey: runtimeContentKeySchema,
  campaignId: z.string().trim().min(1).max(160),
  state: runtimeInstanceStateSchema,
  provenance: runtimeContentProvenanceSchema,
}).strict();
export type RuntimeContentInstance = z.infer<typeof runtimeContentInstanceSchema>;

const runtimeRelationshipEndpointKindSchema = z.enum(["content_instance", "actor", "world_object", "merchant"]);

export const runtimeContentRelationshipSchema = z.object({
  id: z.string().trim().min(1).max(220),
  campaignId: z.string().trim().min(1).max(160),
  fromId: z.string().trim().min(1).max(220),
  fromKind: runtimeRelationshipEndpointKindSchema.default("content_instance"),
  relation: z.enum(["located_in", "contains", "connects_to"]),
  toId: z.string().trim().min(1).max(220),
  toKind: runtimeRelationshipEndpointKindSchema.default("content_instance"),
  exit: runtimeLocationExitStateSchema.optional(),
  provenance: runtimeContentProvenanceSchema,
}).strict().superRefine((relationship, context) => {
  if (relationship.relation === "connects_to") {
    if (relationship.fromKind !== "content_instance" || relationship.toKind !== "content_instance") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["relation"], message: "Location exits may connect only canonical location instances." });
    }
    if (!relationship.exit) context.addIssue({ code: z.ZodIssueCode.custom, path: ["exit"], message: "A typed location exit must persist its authoritative state." });
  } else if (relationship.exit) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exit"], message: "Only a connects_to relationship may carry exit state." });
  }
  if (relationship.relation === "located_in" && relationship.toKind !== "content_instance") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["toKind"], message: "Containment must target a canonical location instance." });
  }
});
export type RuntimeContentRelationship = z.infer<typeof runtimeContentRelationshipSchema>;

export const runtimeContentStateSchema = z.object({
  definitions: z.array(runtimeContentDefinitionSchema).max(2_000),
  instances: z.array(runtimeContentInstanceSchema).max(5_000),
  relationships: z.array(runtimeContentRelationshipSchema).max(10_000),
}).strict();
export type RuntimeContentState = z.infer<typeof runtimeContentStateSchema>;

export interface RuntimeContentCompileContext {
  campaignId: string;
  authorId: string;
  source: RuntimeContentProvenance["source"];
  sourceRefs: string[];
  createdAt: string;
}

export interface RuntimeContentCompileSuccess {
  ok: true;
  definition: RuntimeContentDefinition;
  instance: RuntimeContentInstance | null;
  relationships: RuntimeContentRelationship[];
}

export interface RuntimeContentCompileFailure {
  ok: false;
  code: "invalid_proposal" | "invalid_context" | "unsupported_mechanics";
  message: string;
}

export type RuntimeContentCompileResult = RuntimeContentCompileSuccess | RuntimeContentCompileFailure;

export function emptyRuntimeContentState(): RuntimeContentState {
  return { definitions: [], instances: [], relationships: [] };
}

function canonicalPart(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, "-");
}

function stableContentId(campaignId: string, kind: RuntimeContentProposal["kind"], key: string, prefix: "runtime" | "instance" | "relationship"): string {
  const digest = createHash("sha256").update([campaignId, kind, key].join("\n")).digest("hex").slice(0, 12);
  return `${prefix}:${kind}:${canonicalPart(key).slice(0, 56)}-${digest}`;
}

function provenance(context: RuntimeContentCompileContext): RuntimeContentProvenance {
  return {
    source: context.source,
    authorId: context.authorId,
    campaignId: context.campaignId,
    sourceRefs: [...context.sourceRefs],
    compilerRevision: "runtime-content-v1",
    policyRevision: "runtime-content-policy-v1",
    createdAt: context.createdAt,
  };
}

function contextFailure(context: RuntimeContentCompileContext): RuntimeContentCompileFailure | null {
  const parsed = runtimeContentProvenanceSchema.safeParse({
    source: context.source,
    authorId: context.authorId,
    campaignId: context.campaignId,
    sourceRefs: context.sourceRefs,
    compilerRevision: "runtime-content-v1",
    policyRevision: "runtime-content-policy-v1",
    createdAt: context.createdAt,
  });
  return parsed.success ? null : { ok: false, code: "invalid_context", message: "Runtime content provenance is invalid." };
}

export function compileRuntimeContent(proposal: unknown, context: RuntimeContentCompileContext, createInstance = true, instanceKey = "default"): RuntimeContentCompileResult {
  const parsed = contentProposalSchema.safeParse(proposal);
  if (!parsed.success) return { ok: false, code: "invalid_proposal", message: "Runtime content proposals must use one strict supported family and contain no unreviewed mechanics." };
  const contextError = contextFailure(context);
  if (contextError) return contextError;
  const normalizedInstanceKey = runtimeContentKeySchema.safeParse(instanceKey);
  if (!normalizedInstanceKey.success) return { ok: false, code: "invalid_context", message: "The runtime content instance key is invalid." };

  const value = parsed.data;
  const key = value.key ?? value.name;
  const source = provenance(context);
  const id = stableContentId(context.campaignId, value.kind, key, "runtime");
  let definition: RuntimeContentDefinition;
  if (value.kind === "item") {
    definition = runtimeItemDefinitionSchema.parse({
      ...value,
      id,
      key: value.key ?? null,
      schemaRevision: 1,
      campaignId: context.campaignId,
      provenance: source,
      executionTier: 0,
      capabilities: ["inventory"],
      valueCopper: value.valueCopper ?? null,
      derivation: value.derivation ?? null,
    });
  } else if (value.kind === "location") {
    const { occupants: _occupants, objects: _objects, ...locationValue } = value;
    definition = runtimeLocationDefinitionSchema.parse({
      ...locationValue,
      id,
      key: value.key ?? null,
      schemaRevision: 1,
      campaignId: context.campaignId,
      provenance: source,
      executionTier: 0,
      capabilities: ["navigation"],
      parentKey: value.parentKey ?? null,
    });
  } else {
    definition = runtimeSpellDefinitionSchema.parse({
      ...value,
      id,
      key: value.key ?? null,
      schemaRevision: 1,
      campaignId: context.campaignId,
      provenance: source,
      executionTier: 0,
      capabilities: ["spell-description"],
    });
  }

  const instance = createInstance
    ? runtimeContentInstanceSchema.parse({
      id: stableContentId(context.campaignId, value.kind, `${key}:${normalizedInstanceKey.data}`, "instance"),
      definitionId: definition.id,
      kind: value.kind,
      instanceKey: normalizedInstanceKey.data,
      campaignId: context.campaignId,
      state: value.kind === "item" ? { status: "available", quantity: 1 } : value.kind === "location" ? { status: "active" } : { status: "known" },
      provenance: source,
    })
    : null;

  const relationships: RuntimeContentRelationship[] = [];
  if (instance && value.kind === "location" && value.parentKey) {
    const parentId = stableContentId(context.campaignId, "location", `${value.parentKey}:default`, "instance");
    relationships.push(runtimeContentRelationshipSchema.parse({
      id: stableContentId(context.campaignId, "location", `${instance.id}:located_in:${parentId}`, "relationship"),
      campaignId: context.campaignId,
      fromId: instance.id,
      fromKind: "content_instance",
      relation: "located_in",
      toId: parentId,
      toKind: "content_instance",
      provenance: source,
    }));
  }
  if (instance && value.kind === "location") {
    for (const occupant of value.occupants) {
      relationships.push(runtimeContentRelationshipSchema.parse({
        id: stableContentId(context.campaignId, "location", `${occupant.kind}:${occupant.id}:located_in:${instance.id}`, "relationship"),
        campaignId: context.campaignId,
        fromId: occupant.id,
        fromKind: occupant.kind,
        relation: "located_in",
        toId: instance.id,
        toKind: "content_instance",
        provenance: source,
      }));
    }
    for (const object of value.objects) {
      relationships.push(runtimeContentRelationshipSchema.parse({
        id: stableContentId(context.campaignId, "location", `world_object:${object.id}:located_in:${instance.id}`, "relationship"),
        campaignId: context.campaignId,
        fromId: object.id,
        fromKind: "world_object",
        relation: "located_in",
        toId: instance.id,
        toKind: "content_instance",
        provenance: source,
      }));
    }
    for (const exit of value.exits) {
      const targetId = stableContentId(context.campaignId, "location", `${exit.targetKey}:default`, "instance");
      relationships.push(runtimeContentRelationshipSchema.parse({
        id: stableContentId(context.campaignId, "location", `${instance.id}:connects_to:${exit.key}:${targetId}`, "relationship"),
        campaignId: context.campaignId,
        fromId: instance.id,
        fromKind: "content_instance",
        relation: "connects_to",
        toId: targetId,
        toKind: "content_instance",
        exit: {
          key: exit.key,
          label: exit.label,
          kind: exit.kind,
          targetKey: exit.targetKey,
          open: exit.open,
          locked: exit.locked,
          blocked: exit.blocked,
          hidden: exit.hidden,
          discovered: exit.discovered,
          requirements: [...exit.requirements],
        },
        provenance: source,
      }));
    }
  }
  return { ok: true, definition, instance, relationships };
}

/** Hide undiscovered secret exits from actor-facing projections while retaining them in campaign state. */
export function projectRuntimeContentForActor(value: RuntimeContentState): RuntimeContentState {
  return {
    definitions: value.definitions.map((definition) => definition.kind === "location"
      ? { ...definition, exits: definition.exits.filter((exit) => !exit.hidden || exit.discovered) }
      : definition),
    instances: value.instances,
    relationships: value.relationships.filter((relationship) =>
      relationship.relation !== "connects_to" || !relationship.exit || !relationship.exit.hidden || relationship.exit.discovered
    ),
  };
}

export function normalizeRuntimeContentState(value: unknown): RuntimeContentState {
  if (!value || typeof value !== "object") return emptyRuntimeContentState();
  const candidate = value as Record<string, unknown>;
  const definitions = new Map<string, RuntimeContentDefinition>();
  const instances = new Map<string, RuntimeContentInstance>();
  const relationships = new Map<string, RuntimeContentRelationship>();
  for (const item of Array.isArray(candidate.definitions) ? candidate.definitions : []) {
    const parsed = runtimeContentDefinitionSchema.safeParse(item);
    if (parsed.success && !definitions.has(parsed.data.id)) definitions.set(parsed.data.id, parsed.data);
  }
  for (const item of Array.isArray(candidate.instances) ? candidate.instances : []) {
    const parsed = runtimeContentInstanceSchema.safeParse(item);
    if (parsed.success && !instances.has(parsed.data.id)) instances.set(parsed.data.id, parsed.data);
  }
  for (const item of Array.isArray(candidate.relationships) ? candidate.relationships : []) {
    const parsed = runtimeContentRelationshipSchema.safeParse(item);
    if (parsed.success && !relationships.has(parsed.data.id)) relationships.set(parsed.data.id, parsed.data);
  }
  return {
    definitions: [...definitions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    instances: [...instances.values()].sort((left, right) => left.id.localeCompare(right.id)),
    relationships: [...relationships.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}
