import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { suggestedActionSchema, type NarrationEnvelope } from "./ai-contracts.js";

/**
 * The production room is deliberately a small, engine-owned boundary.  It
 * contains no model client and never publishes a private trace.  Planner and
 * narrator adapters can use these contracts, while the engine remains the
 * only component that can commit campaign facts or release public beats.
 */

export const dmRunKindSchema = z.enum([
  "scene_build",
  "scene_extension",
  "intent_interpretation",
  "world_reaction",
  "narration",
]);
export type DmRunKind = z.infer<typeof dmRunKindSchema>;

export const dmRunStatusSchema = z.enum([
  "private_streaming",
  "completed",
  "parsed",
  "validated",
  "committed",
  "released",
  "rejected",
  "failed",
]);
export type DmRunStatus = z.infer<typeof dmRunStatusSchema>;

export const productionRoomPhaseSchema = z.enum([
  "private_planning",
  "player_resolution",
  "narration",
]);
export type ProductionRoomPhase = z.infer<typeof productionRoomPhaseSchema>;

export const productionRoomVisibilitySchema = z.enum([
  "private",
  "public_result",
  "engine_only",
]);
export type ProductionRoomVisibility = z.infer<typeof productionRoomVisibilitySchema>;

export const productionRoomAuthoritySchema = z.enum(["read", "propose", "resolve"]);
export type ProductionRoomAuthority = z.infer<typeof productionRoomAuthoritySchema>;

export const productionRoomMutationScopeSchema = z.enum(["none", "run_draft", "campaign_transaction"]);
export type ProductionRoomMutationScope = z.infer<typeof productionRoomMutationScopeSchema>;

export const productionRoomToolMetadataSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phase: productionRoomPhaseSchema,
  visibility: productionRoomVisibilitySchema,
  authority: productionRoomAuthoritySchema,
  mutationScope: productionRoomMutationScopeSchema,
  /** Engine-only resolver tools are registered but are never model-facing. */
  modelFacing: z.boolean().default(true),
}).strict();
export type ProductionRoomToolMetadata = z.infer<typeof productionRoomToolMetadataSchema>;

export class ProductionRoomPolicyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProductionRoomPolicyError";
  }
}

/** Register one tool, enforcing the hard model-facing mutation rule. */
export function registerProductionRoomTool(
  definition: ProductionRoomToolMetadata
): ProductionRoomToolMetadata {
  const parsed = productionRoomToolMetadataSchema.parse(definition);
  if (
    parsed.modelFacing
    && parsed.authority === "resolve"
    && parsed.mutationScope === "campaign_transaction"
  ) {
    throw new ProductionRoomPolicyError(
      `Model-facing tool ${parsed.name} cannot resolve a campaign transaction.`
    );
  }
  return parsed;
}

export function createProductionRoomToolRegistry(
  definitions: ProductionRoomToolMetadata[] = defaultProductionRoomTools
): ReadonlyMap<string, ProductionRoomToolMetadata> {
  const registry = new Map<string, ProductionRoomToolMetadata>();
  for (const definition of definitions) {
    const registered = registerProductionRoomTool(definition);
    if (registry.has(registered.name)) {
      throw new ProductionRoomPolicyError(`Production-room tool ${registered.name} is registered twice.`);
    }
    registry.set(registered.name, registered);
  }
  return registry;
}

export const defaultProductionRoomTools: ProductionRoomToolMetadata[] = [
  { name: "scene_context", phase: "private_planning", visibility: "private", authority: "read", mutationScope: "none", modelFacing: true },
  { name: "scene_propose", phase: "private_planning", visibility: "private", authority: "propose", mutationScope: "run_draft", modelFacing: true },
  { name: "scene_extension_propose", phase: "private_planning", visibility: "private", authority: "propose", mutationScope: "run_draft", modelFacing: true },
  { name: "narration_context", phase: "narration", visibility: "public_result", authority: "read", mutationScope: "none", modelFacing: true },
  { name: "narration_draft", phase: "narration", visibility: "public_result", authority: "propose", mutationScope: "run_draft", modelFacing: true },
  { name: "engine_commit", phase: "player_resolution", visibility: "engine_only", authority: "resolve", mutationScope: "campaign_transaction", modelFacing: false },
];

/** Startup-time registry used by the production-room adapters. */
export const productionRoomToolRegistry = createProductionRoomToolRegistry(defaultProductionRoomTools);

const refIdSchema = z.string().trim().min(1).max(160);
const timestampSchema = z.string().datetime({ offset: true });

export const dmRunUsageSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(200),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
}).strict().superRefine((usage, context) => {
  if (
    usage.inputTokens !== null
    && usage.outputTokens !== null
    && usage.totalTokens !== null
    && usage.totalTokens !== usage.inputTokens + usage.outputTokens
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalTokens"], message: "Total tokens must equal input plus output tokens." });
  }
});
export type DmRunUsage = z.infer<typeof dmRunUsageSchema>;

export const dmRunSchema = z.object({
  id: refIdSchema,
  kind: dmRunKindSchema,
  status: dmRunStatusSchema,
  accountId: refIdSchema,
  campaignId: refIdSchema,
  actorId: refIdSchema,
  baseCampaignVersion: z.number().int().nonnegative(),
  baseSceneRevision: z.number().int().nonnegative().nullable(),
  privateEventRefs: z.array(refIdSchema).max(100),
  publicEventRefs: z.array(refIdSchema).max(100),
  committedEventIds: z.array(refIdSchema).max(100),
  usage: dmRunUsageSchema,
  outputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  createdAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  releasedAt: timestampSchema.nullable(),
}).strict();
export type DmRun = z.infer<typeof dmRunSchema>;

export const sceneEntityKindSchema = z.enum(["actor", "object", "exit", "fact", "clue", "hazard", "encounter"]);
export type SceneEntityKind = z.infer<typeof sceneEntityKindSchema>;

export const sceneEntitySchema = z.object({
  id: refIdSchema,
  kind: sceneEntityKindSchema,
  label: z.string().trim().min(1).max(240),
  visibility: z.enum(["public", "hidden"]),
  sourceRef: refIdSchema.optional(),
  state: z.string().trim().min(1).max(80).optional(),
  detailClass: z.enum(["authoritative_interactable", "ephemeral_flavor", "promotable_detail"]).default("authoritative_interactable"),
}).strict();
export type SceneEntity = z.infer<typeof sceneEntitySchema>;

export const sceneClueBindingSchema = z.object({
  id: refIdSchema,
  factRef: refIdSchema,
  holderRef: refIdSchema,
  visibility: z.enum(["hidden", "revealed"]),
  discoveryEventRef: refIdSchema.optional(),
}).strict();
export type SceneClueBinding = z.infer<typeof sceneClueBindingSchema>;

export const sceneBlueprintIrSchema = z.object({
  id: refIdSchema,
  sceneId: refIdSchema,
  locationId: refIdSchema,
  mode: z.enum(["exploration", "social", "encounter", "transition"]),
  immediateQuestion: z.string().trim().min(1).max(2_000),
  actorPlacements: z.array(sceneEntitySchema).max(60),
  objectPlacements: z.array(sceneEntitySchema).max(100),
  exits: z.array(sceneEntitySchema).max(20),
  visibleFactRefs: z.array(refIdSchema).max(100),
  hiddenFactRefs: z.array(refIdSchema).max(100),
  clues: z.array(sceneClueBindingSchema).max(40),
  pressureRefs: z.array(refIdSchema).max(20),
  hazardRefs: z.array(refIdSchema).max(20),
  affordanceRefs: z.array(refIdSchema).max(100),
  encounterProposal: z.object({
    encounterRef: refIdSchema,
    budget: z.number().int().nonnegative().max(100_000),
  }).strict().nullable(),
  detailPromotionPolicy: z.object({
    allowed: z.array(refIdSchema).max(20),
    rejectsRetroactiveThreats: z.literal(true),
  }).strict(),
  baseCampaignVersion: z.number().int().nonnegative(),
  baseSceneRevision: z.number().int().nonnegative(),
}).strict();
export type SceneBlueprintIR = z.infer<typeof sceneBlueprintIrSchema>;

export const sceneSnapshotEntitySchema = sceneEntitySchema.extend({
  committed: z.literal(true),
}).strict();

export const sceneSnapshotSchema = z.object({
  sceneId: refIdSchema,
  revision: z.number().int().positive(),
  campaignVersion: z.number().int().nonnegative(),
  sourceRunId: refIdSchema,
  blueprintHash: z.string().regex(/^[a-f0-9]{64}$/),
  locationId: refIdSchema,
  mode: z.enum(["exploration", "social", "encounter", "transition"]),
  immediateQuestion: z.string().trim().min(1).max(2_000),
  entities: z.array(sceneSnapshotEntitySchema).max(240),
  visibleFactRefs: z.array(refIdSchema).max(100),
  hiddenFactRefs: z.array(refIdSchema).max(100),
  clues: z.array(sceneClueBindingSchema).max(40),
  pressureRefs: z.array(refIdSchema).max(20),
  hazardRefs: z.array(refIdSchema).max(20),
  affordanceRefs: z.array(refIdSchema).max(100),
  committedEventIds: z.array(refIdSchema).max(100),
  inputOpenedAt: timestampSchema.nullable(),
  committedAt: timestampSchema,
  provenance: z.object({
    kind: z.literal("scene_snapshot"),
    sourceRunId: refIdSchema,
    blueprintHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();
export type SceneSnapshot = z.infer<typeof sceneSnapshotSchema>;

export const actorSceneProjectionSchema = z.object({
  sceneId: refIdSchema,
  revision: z.number().int().positive(),
  campaignVersion: z.number().int().nonnegative(),
  actorId: refIdSchema,
  locationId: refIdSchema,
  mode: z.enum(["exploration", "social", "encounter", "transition"]),
  immediateQuestion: z.string().trim().min(1).max(2_000),
  entities: z.array(sceneSnapshotEntitySchema.omit({ committed: true })).max(240),
  visibleFactRefs: z.array(refIdSchema).max(100),
  revealedClueRefs: z.array(refIdSchema).max(40),
  pressureRefs: z.array(refIdSchema).max(20),
  hazardRefs: z.array(refIdSchema).max(20),
  affordanceRefs: z.array(refIdSchema).max(100),
  committedEventIds: z.array(refIdSchema).max(100),
}).strict();
export type ActorSceneProjection = z.infer<typeof actorSceneProjectionSchema>;

export const narrationBeatKindSchema = z.enum([
  "establishing",
  "sensory",
  "npc",
  "dialogue",
  "mechanical",
  "consequence",
  "question",
]);
export type NarrationBeatKind = z.infer<typeof narrationBeatKindSchema>;

export const narrationBeatSchema = z.object({
  id: refIdSchema,
  kind: narrationBeatKindSchema,
  text: z.string().trim().min(1).max(6_000),
  entityRefs: z.array(refIdSchema).max(30),
  publicFactRefs: z.array(refIdSchema).max(30),
  committedEventRefs: z.array(refIdSchema).max(30),
  revealRequests: z.array(refIdSchema).max(20),
  interruptible: z.boolean(),
}).strict();
export type NarrationBeat = z.infer<typeof narrationBeatSchema>;

export const narrationDraftBeatSchema = narrationBeatSchema.omit({ id: true, revealRequests: true }).strict();
export type NarrationDraftBeat = z.infer<typeof narrationDraftBeatSchema>;

export const narrationDraftSchema = z.object({
  beats: z.array(narrationDraftBeatSchema).min(1).max(8),
  suggestedActions: z.array(suggestedActionSchema).max(5),
}).strict().superRefine((draft, context) => {
  const combinedLength = draft.beats.reduce((total, beat) => total + beat.text.length, 0)
    + Math.max(0, draft.beats.length - 1) * 2;
  if (combinedLength > 6_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["beats"],
      message: "Combined narration text cannot exceed 6000 characters.",
    });
  }
});
export type NarrationDraft = z.infer<typeof narrationDraftSchema>;

function providerJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerJsonSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (key === "$schema") return [];
      return [[key === "oneOf" ? "anyOf" : key, providerJsonSchema(child)]];
    })
  );
}

export const narrationDraftJsonSchema = providerJsonSchema(z.toJSONSchema(narrationDraftSchema));

export const narrationSequenceIrSchema = z.object({
  id: refIdSchema,
  sceneId: refIdSchema,
  sceneRevision: z.number().int().positive(),
  campaignVersion: z.number().int().nonnegative(),
  sourceRunId: refIdSchema,
  narratorRunId: refIdSchema,
  committedEventIds: z.array(refIdSchema).max(100),
  beats: z.array(narrationBeatSchema).min(1).max(100),
  status: z.enum(["candidate", "released"]),
  createdAt: timestampSchema,
  releasedAt: timestampSchema.nullable(),
}).strict();
export type NarrationSequenceIR = z.infer<typeof narrationSequenceIrSchema>;

export const productionRoomNarrationReleaseRequestSchema = z.object({
  clientCommandId: z.string().uuid(),
  expectedCampaignVersion: z.number().int().nonnegative(),
  sequence: narrationSequenceIrSchema,
}).strict();
export type ProductionRoomNarrationReleaseRequest = z.infer<typeof productionRoomNarrationReleaseRequestSchema>;

export type PublicNarrationSequence = Omit<NarrationSequenceIR, "sourceRunId" | "narratorRunId">;

export function projectNarrationSequenceForActor(sequence: NarrationSequenceIR): PublicNarrationSequence {
  const { sourceRunId: _sourceRunId, narratorRunId: _narratorRunId, ...publicSequence } = sequence;
  return publicSequence;
}

export interface CompileNarrationDraftInput {
  draft: NarrationDraft;
  projection: ActorSceneProjection;
  sourceRunId: string;
  narratorRunId: string;
  sequenceId?: string;
  now?: string;
}

export interface CompiledNarrationDraft {
  sequence: NarrationSequenceIR;
  narration: NarrationEnvelope;
}

/**
 * Compile a completed narrator draft into the public release contract.
 * Sequence and beat IDs are engine-owned; the model may only propose text and
 * references that already exist in the actor-safe projection.
 */
export function compileNarrationDraft(input: CompileNarrationDraftInput): CompiledNarrationDraft {
  const draft = narrationDraftSchema.parse(input.draft);
  const now = input.now ?? new Date().toISOString();
  // Public sequence identity must not encode either private run identity.
  const sequenceId = input.sequenceId ?? `narration:${randomUUID()}`;
  const candidate = narrationSequenceIrSchema.parse({
    id: sequenceId,
    sceneId: input.projection.sceneId,
    sceneRevision: input.projection.revision,
    campaignVersion: input.projection.campaignVersion,
    sourceRunId: input.sourceRunId,
    narratorRunId: input.narratorRunId,
    committedEventIds: [...new Set(draft.beats.flatMap((beat) => beat.committedEventRefs))],
    beats: draft.beats.map((beat, index) => ({
      id: `${sequenceId}:beat:${index + 1}`,
      ...beat,
      revealRequests: [],
    })),
    status: "candidate",
    createdAt: now,
    releasedAt: null,
  });
  const sequence = releaseNarrationSequence(candidate, input.projection, now);
  return {
    sequence,
    narration: {
      text: sequence.beats.map((beat) => beat.text).join("\n\n"),
      proposedFacts: [],
      suggestedActions: draft.suggestedActions,
    },
  };
}

/** Compatibility parser for already-reviewed envelope fixtures and providers. */
export function narrationDraftFromEnvelope(
  narration: NarrationEnvelope,
  projection: ActorSceneProjection
): NarrationDraft {
  if (narration.proposedFacts.length > 0) {
    throw new ProductionRoomValidationError([
      "The public narrator cannot propose uncommitted campaign facts.",
    ]);
  }
  return narrationDraftSchema.parse({
    beats: [{
      kind: projection.committedEventIds.length > 0 ? "consequence" : "establishing",
      text: narration.text,
      entityRefs: [],
      publicFactRefs: [],
      committedEventRefs: [...projection.committedEventIds],
      interruptible: true,
    }],
    suggestedActions: narration.suggestedActions,
  });
}

export interface SceneValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SceneBlueprintDraft {
  runId: string;
  mutationScope: "run_draft";
  blueprint: SceneBlueprintIR;
  proposedAt: string;
}

export class ProductionRoomValidationError extends Error {
  public readonly errors: string[];

  public constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "ProductionRoomValidationError";
    this.errors = errors;
  }
}

export class ProductionRoomStaleError extends Error {
  public constructor(message = "The production-room draft is based on a stale campaign or scene revision.") {
    super(message);
    this.name = "ProductionRoomStaleError";
  }
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function allEntityIds(blueprint: SceneBlueprintIR): Set<string> {
  return new Set([
    ...blueprint.actorPlacements,
    ...blueprint.objectPlacements,
    ...blueprint.exits,
  ].map((entity) => entity.id));
}

export function validateSceneBlueprint(
  blueprint: SceneBlueprintIR,
  expectedCampaignVersion?: number,
  expectedSceneRevision?: number
): SceneValidationResult {
  const errors: string[] = [];
  const parsed = sceneBlueprintIrSchema.safeParse(blueprint);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => issue.message) };
  if (expectedCampaignVersion !== undefined && blueprint.baseCampaignVersion !== expectedCampaignVersion) {
    errors.push("The blueprint campaign revision is stale.");
  }
  if (expectedSceneRevision !== undefined && blueprint.baseSceneRevision !== expectedSceneRevision) {
    errors.push("The blueprint scene revision is stale.");
  }
  const ids = [
    ...blueprint.actorPlacements.map((entity) => entity.id),
    ...blueprint.objectPlacements.map((entity) => entity.id),
    ...blueprint.exits.map((entity) => entity.id),
    ...blueprint.clues.map((clue) => clue.id),
  ];
  if (!unique(ids)) errors.push("Scene entity and clue IDs must be unique.");
  if (!unique(blueprint.visibleFactRefs) || !unique(blueprint.hiddenFactRefs)) errors.push("Scene fact refs must be unique.");
  if (blueprint.visibleFactRefs.some((fact) => blueprint.hiddenFactRefs.includes(fact))) {
    errors.push("A fact cannot be both visible and hidden.");
  }
  const entities = allEntityIds(blueprint);
  for (const clue of blueprint.clues) {
    if (!entities.has(clue.holderRef)) errors.push(`Clue ${clue.id} references an absent holder.`);
    if (!blueprint.hiddenFactRefs.includes(clue.factRef) && clue.visibility === "hidden") {
      errors.push(`Hidden clue ${clue.id} must reference a hidden fact.`);
    }
  }
  if (!blueprint.detailPromotionPolicy.rejectsRetroactiveThreats) {
    errors.push("Scene detail promotion must reject retroactive threats.");
  }
  return { valid: errors.length === 0, errors };
}

/** A planner can only place a validated blueprint in its own run draft. */
export function proposeSceneBlueprint(
  run: DmRun,
  blueprint: SceneBlueprintIR,
  now = new Date().toISOString()
): SceneBlueprintDraft {
  if (!["scene_build", "scene_extension", "world_reaction"].includes(run.kind)) {
    throw new ProductionRoomPolicyError("Only a scene or bounded reaction run may propose a scene blueprint.");
  }
  if (!["private_streaming", "completed", "parsed", "validated"].includes(run.status)) {
    throw new ProductionRoomPolicyError("A released or failed run cannot author a new scene draft.");
  }
  const validation = validateSceneBlueprint(blueprint, run.baseCampaignVersion, run.baseSceneRevision ?? 0);
  if (!validation.valid) throw new ProductionRoomValidationError(validation.errors);
  return { runId: run.id, mutationScope: "run_draft", blueprint, proposedAt: now };
}

export interface CommitSceneSnapshotInput {
  blueprint: SceneBlueprintIR;
  sourceRunId: string;
  currentCampaignVersion: number;
  existingSnapshot?: SceneSnapshot | null;
  committedEventIds?: string[];
  now?: string;
}

/** Compile and commit the authoritative snapshot before player input opens. */
export function commitSceneSnapshot(input: CommitSceneSnapshotInput): SceneSnapshot {
  if (input.blueprint.baseCampaignVersion !== input.currentCampaignVersion) {
    throw new ProductionRoomStaleError("The blueprint campaign revision is stale.");
  }
  const candidateHash = hashBlueprint(input.blueprint);
  if (input.existingSnapshot && input.existingSnapshot.sceneId === input.blueprint.sceneId && input.existingSnapshot.blueprintHash === candidateHash) {
    return input.existingSnapshot;
  }
  if (input.existingSnapshot && input.blueprint.baseSceneRevision !== input.existingSnapshot.revision) {
    throw new ProductionRoomStaleError("The blueprint scene revision is stale.");
  }
  const validation = validateSceneBlueprint(
    input.blueprint,
    input.currentCampaignVersion,
    input.existingSnapshot?.revision ?? 0
  );
  if (!validation.valid) throw new ProductionRoomValidationError(validation.errors);
  if (input.existingSnapshot && input.existingSnapshot.sceneId === input.blueprint.sceneId) {
    throw new ProductionRoomStaleError("A different snapshot already owns this scene revision.");
  }
  const now = input.now ?? new Date().toISOString();
  const revision = (input.existingSnapshot?.revision ?? 0) + 1;
  const entities = [
    ...input.blueprint.actorPlacements,
    ...input.blueprint.objectPlacements,
    ...input.blueprint.exits,
  ].map((entity) => ({ ...entity, committed: true as const }));
  const blueprintHash = candidateHash;
  return sceneSnapshotSchema.parse({
    sceneId: input.blueprint.sceneId,
    revision,
    campaignVersion: input.currentCampaignVersion,
    sourceRunId: input.sourceRunId,
    blueprintHash,
    locationId: input.blueprint.locationId,
    mode: input.blueprint.mode,
    immediateQuestion: input.blueprint.immediateQuestion,
    entities,
    visibleFactRefs: [...input.blueprint.visibleFactRefs],
    hiddenFactRefs: [...input.blueprint.hiddenFactRefs],
    clues: input.blueprint.clues.map((clue) => ({ ...clue })),
    pressureRefs: [...input.blueprint.pressureRefs],
    hazardRefs: [...input.blueprint.hazardRefs],
    affordanceRefs: [...input.blueprint.affordanceRefs],
    committedEventIds: [...new Set(input.committedEventIds ?? [])],
    inputOpenedAt: null,
    committedAt: now,
    provenance: { kind: "scene_snapshot", sourceRunId: input.sourceRunId, blueprintHash },
  });
}

export function openSceneInput(snapshot: SceneSnapshot, now = new Date().toISOString()): SceneSnapshot {
  if (snapshot.inputOpenedAt) return snapshot;
  return sceneSnapshotSchema.parse({ ...snapshot, inputOpenedAt: now });
}

export function projectSceneForActor(snapshot: SceneSnapshot, actorId: string): ActorSceneProjection {
  const hidden = new Set(snapshot.hiddenFactRefs);
  const revealedFacts = new Set(snapshot.visibleFactRefs);
  const entities = snapshot.entities
    .filter((entity) => entity.visibility === "public" || entity.kind === "actor" && entity.id === actorId)
    .map(({ committed: _committed, ...entity }) => ({ ...entity }));
  const revealedClueRefs = snapshot.clues
    .filter((clue) => clue.visibility === "revealed" && !hidden.has(clue.factRef))
    .map((clue) => clue.id);
  return actorSceneProjectionSchema.parse({
    sceneId: snapshot.sceneId,
    revision: snapshot.revision,
    campaignVersion: snapshot.campaignVersion,
    actorId,
    locationId: snapshot.locationId,
    mode: snapshot.mode,
    immediateQuestion: snapshot.immediateQuestion,
    entities,
    visibleFactRefs: [...revealedFacts],
    revealedClueRefs,
    pressureRefs: [...snapshot.pressureRefs],
    hazardRefs: snapshot.entities.filter((entity) => entity.kind === "hazard" && entity.visibility === "public").map((entity) => entity.id),
    affordanceRefs: [...snapshot.affordanceRefs],
    committedEventIds: [...snapshot.committedEventIds],
  });
}

export function hashBlueprint(blueprint: SceneBlueprintIR): string {
  return createHash("sha256").update(JSON.stringify(blueprint)).digest("hex");
}

export function validateNarrationSequence(
  sequence: NarrationSequenceIR,
  projection: ActorSceneProjection,
  committedEventIds: string[] = projection.committedEventIds
): SceneValidationResult {
  const errors: string[] = [];
  const parsed = narrationSequenceIrSchema.safeParse(sequence);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => issue.message) };
  if (sequence.sceneId !== projection.sceneId) errors.push("Narration scene does not match the actor projection.");
  if (sequence.sceneRevision !== projection.revision) errors.push("Narration references a stale scene revision.");
  if (sequence.campaignVersion !== projection.campaignVersion) errors.push("Narration references a stale campaign revision.");
  const entityIds = new Set(projection.entities.map((entity) => entity.id));
  const publicFacts = new Set(projection.visibleFactRefs);
  const committed = new Set(committedEventIds);
  if (!unique(sequence.beats.map((beat) => beat.id))) errors.push("Narration beat IDs must be unique.");
  if (!unique(sequence.committedEventIds)) errors.push("Narration event refs must be unique.");
  for (const eventId of sequence.committedEventIds) {
    if (!committed.has(eventId)) errors.push(`Narration references uncommitted event ${eventId}.`);
  }
  for (const beat of sequence.beats) {
    for (const entityId of beat.entityRefs) {
      if (!entityIds.has(entityId)) errors.push(`Narration beat ${beat.id} references absent entity ${entityId}.`);
    }
    for (const factId of beat.publicFactRefs) {
      if (!publicFacts.has(factId)) errors.push(`Narration beat ${beat.id} references unreleased fact ${factId}.`);
    }
    for (const eventId of beat.committedEventRefs) {
      if (!committed.has(eventId)) errors.push(`Narration beat ${beat.id} references uncommitted event ${eventId}.`);
    }
    for (const reveal of beat.revealRequests) {
      if (!publicFacts.has(reveal)) errors.push(`Narration beat ${beat.id} requests an unreleased reveal ${reveal}.`);
    }
    if ((beat.kind === "mechanical" || beat.kind === "consequence") && beat.committedEventRefs.length === 0) {
      errors.push(`Narration beat ${beat.id} makes a mechanical claim without a committed event ref.`);
    }
    if (/raw token|tool[_ -]?call|tool calls?|chain[- ]of[- ]thought|private trace|"(?:function|arguments|tool_calls)"\s*:/i.test(beat.text)) {
      errors.push(`Narration beat ${beat.id} contains a private production fragment.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function releaseNarrationSequence(
  sequence: NarrationSequenceIR,
  projection: ActorSceneProjection,
  now = new Date().toISOString()
): NarrationSequenceIR {
  const validation = validateNarrationSequence(sequence, projection);
  if (!validation.valid) throw new ProductionRoomValidationError(validation.errors);
  return narrationSequenceIrSchema.parse({ ...sequence, status: "released", releasedAt: now });
}

/** Deterministic timeout/failure fallback; it cannot invent a new fact. */
export function buildSafeNarrationFallback(
  projection: ActorSceneProjection,
  sourceRunId: string,
  narratorRunId: string,
  now = new Date().toISOString()
): NarrationSequenceIR {
  const candidate = narrationSequenceIrSchema.parse({
    id: `safe-narration:${projection.sceneId}:${projection.revision}`,
    sceneId: projection.sceneId,
    sceneRevision: projection.revision,
    campaignVersion: projection.campaignVersion,
    sourceRunId,
    narratorRunId,
    committedEventIds: [...projection.committedEventIds],
    beats: [{
      id: `safe-beat:${projection.sceneId}:${projection.revision}`,
      kind: "establishing",
      text: "The scene holds steady while the next moment is prepared.",
      entityRefs: [],
      publicFactRefs: [],
      committedEventRefs: [],
      revealRequests: [],
      interruptible: true,
    }],
    status: "candidate",
    createdAt: now,
    releasedAt: null,
  });
  return releaseNarrationSequence(candidate, projection, now);
}

export interface SceneDetailPromotion {
  id: string;
  label: string;
  source: "ephemeral_flavor" | "player_observation";
  targetKind: SceneEntityKind;
  retroactiveThreat: boolean;
  contradictsCommittedState: boolean;
  grantsUnboundedPower: boolean;
}

export function validateDetailPromotion(
  detail: SceneDetailPromotion,
  snapshot: SceneSnapshot
): SceneValidationResult {
  const errors: string[] = [];
  if (!detail.id.trim() || !detail.label.trim()) errors.push("A promoted detail needs a stable ID and label.");
  if (snapshot.entities.some((entity) => entity.id === detail.id)) errors.push("A promoted detail cannot replace an existing committed entity.");
  if (detail.retroactiveThreat) errors.push("A promoted detail cannot introduce a retroactive threat.");
  if (detail.contradictsCommittedState) errors.push("A promoted detail cannot contradict committed state.");
  if (detail.grantsUnboundedPower) errors.push("A promoted detail cannot mint unbounded power.");
  return { valid: errors.length === 0, errors };
}

export function promoteSceneDetail(
  snapshot: SceneSnapshot,
  detail: SceneDetailPromotion,
  now = new Date().toISOString()
): SceneSnapshot {
  const validation = validateDetailPromotion(detail, snapshot);
  if (!validation.valid) throw new ProductionRoomValidationError(validation.errors);
  const promotedEntity: SceneEntity & { committed: true } = {
    id: detail.id,
    kind: detail.targetKind,
    label: detail.label,
    visibility: "public",
    detailClass: "promotable_detail",
    committed: true,
  };
  const promotionHash = createHash("sha256")
    .update(JSON.stringify({ previous: snapshot.blueprintHash, detail }))
    .digest("hex");
  return sceneSnapshotSchema.parse({
    ...snapshot,
    revision: snapshot.revision + 1,
    blueprintHash: promotionHash,
    entities: [...snapshot.entities, promotedEntity],
    committedAt: now,
    provenance: { ...snapshot.provenance, blueprintHash: promotionHash },
  });
}

export interface PlaybackState {
  sequenceId: string;
  nextBeatIndex: number;
  completedBeatIds: string[];
}

export function initialPlayback(sequence: NarrationSequenceIR): PlaybackState {
  if (sequence.status !== "released") throw new ProductionRoomValidationError(["Only a released narration sequence can play."]);
  return { sequenceId: sequence.id, nextBeatIndex: 0, completedBeatIds: [] };
}

export function playNextBeat(sequence: NarrationSequenceIR, playback: PlaybackState): { beat: NarrationBeat | null; playback: PlaybackState } {
  if (sequence.status !== "released" || playback.sequenceId !== sequence.id) {
    throw new ProductionRoomValidationError(["Playback must use the matching released sequence."]);
  }
  const beat = sequence.beats[playback.nextBeatIndex] ?? null;
  if (!beat) return { beat: null, playback: { ...playback, completedBeatIds: [...playback.completedBeatIds] } };
  return {
    beat,
    playback: {
      sequenceId: playback.sequenceId,
      nextBeatIndex: playback.nextBeatIndex + 1,
      completedBeatIds: [...playback.completedBeatIds, beat.id],
    },
  };
}

export interface ProductionRoomState {
  activeScene: SceneSnapshot | null;
  runs: DmRun[];
  releasedSequences: NarrationSequenceIR[];
  playback: PlaybackState[];
  processedOperationIds: string[];
}

export interface ProductionRoomLiveRelease {
  plannerRun: DmRun;
  narratorRun: DmRun;
  sequence: NarrationSequenceIR;
}

export function emptyProductionRoomState(): ProductionRoomState {
  return { activeScene: null, runs: [], releasedSequences: [], playback: [], processedOperationIds: [] };
}

/** Persist one normal-turn release without exposing either private run. */
export function recordProductionRoomLiveRelease(
  state: ProductionRoomState,
  release: ProductionRoomLiveRelease,
  operationId: string
): ProductionRoomState {
  const current = parseProductionRoomState(state);
  if (current.processedOperationIds.includes(operationId)) return current;
  const sequence = narrationSequenceIrSchema.parse(release.sequence);
  if (sequence.status !== "released") {
    throw new ProductionRoomValidationError(["Only a released normal-turn narration sequence may persist."]);
  }
  if (sequence.sourceRunId !== release.plannerRun.id || sequence.narratorRunId !== release.narratorRun.id) {
    throw new ProductionRoomValidationError(["The released sequence does not belong to its planner and narrator runs."]);
  }
  const runs = [...current.runs];
  for (const run of [release.plannerRun, release.narratorRun]) {
    const parsed = dmRunSchema.parse(run);
    const existing = runs.find((candidate) => candidate.id === parsed.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(parsed)) {
      throw new ProductionRoomValidationError([`DM run ${parsed.id} conflicts with a persisted run.`]);
    }
    if (!existing) runs.push(parsed);
  }
  const releasedSequences = current.releasedSequences.some((candidate) => candidate.id === sequence.id)
    ? current.releasedSequences
    : [...current.releasedSequences, sequence];
  const playback = current.playback.some((candidate) => candidate.sequenceId === sequence.id)
    ? current.playback
    : [...current.playback, initialPlayback(sequence)];
  return parseProductionRoomState({
    ...current,
    runs,
    releasedSequences,
    playback,
    processedOperationIds: [...current.processedOperationIds, operationId].slice(-500),
  });
}

export function createDmRun(input: Omit<DmRun, "id" | "status" | "privateEventRefs" | "publicEventRefs" | "committedEventIds" | "outputHash" | "completedAt" | "releasedAt"> & { id?: string }): DmRun {
  return dmRunSchema.parse({
    ...input,
    id: input.id ?? randomUUID(),
    status: "private_streaming",
    privateEventRefs: [],
    publicEventRefs: [],
    committedEventIds: [],
    outputHash: null,
    completedAt: null,
    releasedAt: null,
  });
}

export function completeDmRun(
  run: DmRun,
  output: string,
  status: Extract<DmRunStatus, "completed" | "parsed" | "validated" | "committed" | "released"> = "completed",
  now = new Date().toISOString()
): DmRun {
  return dmRunSchema.parse({
    ...run,
    status,
    outputHash: createHash("sha256").update(output).digest("hex"),
    completedAt: run.completedAt ?? now,
  });
}

/** JSON round-trip used by the engine store and restart/replay tests. */
export function parseProductionRoomState(value: unknown): ProductionRoomState {
  const state = value && typeof value === "object" ? value as Partial<ProductionRoomState> : {};
  return {
    activeScene: state.activeScene ? sceneSnapshotSchema.parse(state.activeScene) : null,
    runs: Array.isArray(state.runs) ? state.runs.map((run) => dmRunSchema.parse(run)) : [],
    releasedSequences: Array.isArray(state.releasedSequences) ? state.releasedSequences.map((sequence) => narrationSequenceIrSchema.parse(sequence)) : [],
    playback: Array.isArray(state.playback) ? state.playback.map((entry) => ({
      sequenceId: refIdSchema.parse(entry.sequenceId),
      nextBeatIndex: z.number().int().nonnegative().parse(entry.nextBeatIndex),
      completedBeatIds: z.array(refIdSchema).parse(entry.completedBeatIds),
    })) : [],
    processedOperationIds: Array.isArray(state.processedOperationIds) ? state.processedOperationIds.map((id) => refIdSchema.parse(id)) : [],
  };
}

export function serializeProductionRoomState(state: ProductionRoomState): string {
  return JSON.stringify(parseProductionRoomState(state));
}

export function buildRuinedGatehouseBlueprint(baseCampaignVersion: number, sourceRunId: string): SceneBlueprintIR {
  void sourceRunId;
  return sceneBlueprintIrSchema.parse({
    id: "ruined-gatehouse-blueprint-v1",
    sceneId: "ruined-gatehouse",
    locationId: "ruined-gatehouse",
    mode: "exploration",
    immediateQuestion: "Can the party secure the gatehouse before its pressure breaks the wounded guard's fragile truce?",
    actorPlacements: [
      { id: "gatehouse-wounded-guard", kind: "actor", label: "Wounded guard", visibility: "public", sourceRef: "reviewed-gatehouse:guard", detailClass: "authoritative_interactable" },
    ],
    objectPlacements: [
      { id: "gatehouse-locked-chest", kind: "object", label: "Locked chest", visibility: "public", sourceRef: "reviewed-gatehouse:chest", state: "locked", detailClass: "authoritative_interactable" },
      { id: "gatehouse-broken-lever", kind: "object", label: "Broken lever", visibility: "public", sourceRef: "reviewed-gatehouse:lever", state: "damaged", detailClass: "authoritative_interactable" },
      { id: "gatehouse-hidden-clue", kind: "clue", label: "A hidden clue in the chest", visibility: "hidden", sourceRef: "reviewed-gatehouse:hidden-clue", detailClass: "authoritative_interactable" },
    ],
    exits: [
      { id: "gatehouse-exit-north", kind: "exit", label: "North road", visibility: "public", sourceRef: "reviewed-gatehouse:north", detailClass: "authoritative_interactable" },
      { id: "gatehouse-exit-cellar", kind: "exit", label: "Cellar stairs", visibility: "public", sourceRef: "reviewed-gatehouse:cellar", detailClass: "authoritative_interactable" },
    ],
    visibleFactRefs: ["gatehouse-guard-partial-truth", "gatehouse-pressure-watch"],
    hiddenFactRefs: ["gatehouse-chest-clue-fact", "gatehouse-guard-hidden-motive"],
    clues: [{ id: "gatehouse-clue-binding", factRef: "gatehouse-chest-clue-fact", holderRef: "gatehouse-locked-chest", visibility: "hidden" }],
    pressureRefs: ["gatehouse-pressure-watch"],
    hazardRefs: [],
    affordanceRefs: ["gatehouse-locked-chest:inspect", "gatehouse-locked-chest:unlock", "gatehouse-broken-lever:repair", "gatehouse-exit-north:travel", "gatehouse-exit-cellar:descend"],
    encounterProposal: null,
    detailPromotionPolicy: { allowed: ["gatehouse-scratched-rune"], rejectsRetroactiveThreats: true },
    baseCampaignVersion,
    baseSceneRevision: 0,
  });
}
