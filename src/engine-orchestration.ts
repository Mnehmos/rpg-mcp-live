import { z } from "zod";
import type {
  EngineEvent,
  EngineExperienceProfileProjection,
  EngineRandomEventResolution,
} from "./engine-contracts.js";

const refSchema = z.string().trim().min(1).max(160);
const timestampSchema = z.string().datetime({ offset: true });

export const sceneModeSchema = z.enum([
  "freeplay",
  "exploration",
  "social",
  "encounter",
  "travel",
  "downtime",
  "transition",
]);
export type SceneMode = z.infer<typeof sceneModeSchema>;

export const scenePurposeSchema = z.enum([
  "orientation",
  "decision",
  "discovery",
  "conflict",
  "transition",
  "recovery",
  "clarification",
]);
export type ScenePurpose = z.infer<typeof scenePurposeSchema>;

export const sceneTensionBandSchema = z.enum(["quiet", "rising", "high", "resolved"]);
export type SceneTensionBand = z.infer<typeof sceneTensionBandSchema>;

export const sceneStatusSchema = z.enum(["opening", "active", "resolved"]);
export type SceneStatus = z.infer<typeof sceneStatusSchema>;

export const sceneTransitionReasonSchema = z.enum([
  "opening",
  "player_resolution",
  "stall_clarification",
  "stall_pressure",
  "reframe",
  "completed",
  "restart",
  "manual",
]).nullable();
export type SceneTransitionReason = z.infer<typeof sceneTransitionReasonSchema>;

export const characterHookKindSchema = z.enum([
  "goal",
  "person",
  "place",
  "debt",
  "promise",
  "enemy",
  "mystery",
  "belief",
  "fear",
  "temptation",
]);
export type CharacterHookKind = z.infer<typeof characterHookKindSchema>;

export const characterHookStatusSchema = z.enum(["open", "active", "dormant", "resolved"]);
export type CharacterHookStatus = z.infer<typeof characterHookStatusSchema>;

export const characterHookSchema = z.object({
  id: refSchema,
  kind: characterHookKindSchema,
  label: z.string().trim().min(1).max(240),
  status: characterHookStatusSchema,
  sourceRef: refSchema.nullable(),
  lastUsedSceneId: refSchema.nullable(),
  lastUsedVersion: z.number().int().nonnegative().nullable(),
}).strict();
export type CharacterHook = z.infer<typeof characterHookSchema>;

export const sceneStateSchema = z.object({
  sceneId: refSchema,
  revision: z.number().int().positive(),
  campaignVersion: z.number().int().nonnegative(),
  mode: sceneModeSchema,
  purpose: scenePurposeSchema,
  immediateQuestion: z.string().trim().min(1).max(2_000),
  situationRefs: z.array(refSchema).max(40),
  pressureRefs: z.array(refSchema).max(40),
  actorIds: z.array(refSchema).max(20),
  viewpointActorId: refSchema,
  tensionBand: sceneTensionBandSchema,
  noChangeTurns: z.number().int().nonnegative().max(100),
  status: sceneStatusSchema,
  transitionReason: sceneTransitionReasonSchema,
  discoveredFactRefs: z.array(refSchema).max(100),
  committedEventRefs: z.array(refSchema).max(200),
  releasedNarrationRefs: z.array(refSchema).max(100),
  recapRefs: z.array(refSchema).max(40),
  unresolvedRefs: z.array(refSchema).max(100),
  hookRefs: z.array(refSchema).max(100),
  surfacedRefs: z.array(refSchema).max(100),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();
export type SceneState = z.infer<typeof sceneStateSchema>;

export const sceneRecapSchema = z.object({
  id: refSchema,
  sceneId: refSchema,
  sceneRevision: z.number().int().positive(),
  campaignVersion: z.number().int().nonnegative(),
  committedEventRefs: z.array(refSchema).max(200),
  publicFactRefs: z.array(refSchema).max(100),
  resolvedRefs: z.array(refSchema).max(100),
  unresolvedRefs: z.array(refSchema).max(100),
  hookRefs: z.array(refSchema).max(100),
  headline: z.string().trim().min(1).max(500),
  createdAt: timestampSchema,
}).strict();
export type SceneRecap = z.infer<typeof sceneRecapSchema>;

export const orchestrationActionSchema = z.enum([
  "surface_existing",
  "clarify",
  "reframe",
  "transition",
]);
export type OrchestrationAction = z.infer<typeof orchestrationActionSchema>;

export const orchestrationDecisionInputSchema = z.object({
  sceneId: refSchema,
  sceneRevision: z.number().int().positive(),
  action: orchestrationActionSchema,
  selectedRef: refSchema.optional(),
  clarificationQuestion: z.string().trim().min(1).max(2_000).optional(),
  transitionReason: sceneTransitionReasonSchema.optional(),
  hookId: refSchema.optional(),
}).strict();
export type OrchestrationDecisionInput = z.infer<typeof orchestrationDecisionInputSchema>;

export const orchestrationDecisionRequestSchema = z.object({
  clientCommandId: z.string().uuid(),
  expectedCampaignVersion: z.number().int().nonnegative(),
  decision: orchestrationDecisionInputSchema,
}).strict();
export type OrchestrationDecisionRequest = z.infer<typeof orchestrationDecisionRequestSchema>;

export const orchestrationDecisionSchema = orchestrationDecisionInputSchema.extend({
  id: refSchema,
  campaignVersion: z.number().int().nonnegative(),
  noChangeTurns: z.number().int().nonnegative().max(100),
  authorizedRefs: z.array(refSchema).max(200),
  recapId: refSchema.nullable(),
  createdAt: timestampSchema,
}).strict();
export type OrchestrationDecision = z.infer<typeof orchestrationDecisionSchema>;

export const orchestrationStateSchema = z.object({
  activeScene: sceneStateSchema.nullable(),
  recaps: z.array(sceneRecapSchema).max(50),
  hooks: z.array(characterHookSchema).max(200),
  decisions: z.array(orchestrationDecisionSchema).max(200),
  processedOperationIds: z.array(refSchema).max(200),
}).strict();
export type OrchestrationState = z.infer<typeof orchestrationStateSchema>;

export interface OrchestrationResumeProjection {
  scene: SceneState | null;
  recap: SceneRecap | null;
  unresolvedRefs: string[];
  hookRefs: string[];
  hooks: CharacterHook[];
  lastReleasedNarrationRef: string | null;
  experienceProfile: EngineExperienceProfileProjection;
}

export interface AuthorizedPacingRefs {
  pressureRefs?: string[];
  clueRefs?: string[];
  consequenceRefs?: string[];
  committedEventRefs?: string[];
  randomEventRefs?: string[];
  hiddenRefs?: string[];
  staleRefs?: string[];
  surfacedRefs?: string[];
}

export interface PacingAuthorization {
  pressureRefs: string[];
  clueRefs: string[];
  consequenceRefs: string[];
  committedEventRefs: string[];
  randomEventRefs: string[];
  allRefs: string[];
}

export interface OrchestrationValidationResult {
  valid: boolean;
  errors: string[];
  authorization: PacingAuthorization;
}

export function emptyOrchestrationState(): OrchestrationState {
  return {
    activeScene: null,
    recaps: [],
    hooks: [],
    decisions: [],
    processedOperationIds: [],
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function safeTimestamp(value: unknown, fallback: string): string {
  const parsed = timestampSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function normalizeOrchestrationState(value: unknown, fallbackAt = new Date().toISOString()): OrchestrationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyOrchestrationState();
  const raw = value as Partial<OrchestrationState>;
  const activeScene = sceneStateSchema.safeParse(raw.activeScene);
  const recaps = Array.isArray(raw.recaps)
    ? raw.recaps.flatMap((recap) => {
        const parsed = sceneRecapSchema.safeParse(recap);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const hooks = Array.isArray(raw.hooks)
    ? raw.hooks.flatMap((hook) => {
        const parsed = characterHookSchema.safeParse(hook);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.flatMap((decision) => {
        const parsed = orchestrationDecisionSchema.safeParse(decision);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  return orchestrationStateSchema.parse({
    activeScene: activeScene.success
      ? { ...activeScene.data, updatedAt: safeTimestamp(activeScene.data.updatedAt, fallbackAt) }
      : null,
    recaps: recaps.slice(-50),
    hooks: hooks.slice(-200),
    decisions: decisions.slice(-200),
    processedOperationIds: Array.isArray(raw.processedOperationIds)
      ? unique(raw.processedOperationIds.filter((id): id is string => typeof id === "string")).slice(-200)
      : [],
  });
}

function meaningfulStateChanges(event: Pick<EngineEvent, "stateChanges">): boolean {
  return event.stateChanges.some((change) =>
    !change.path.startsWith("/orchestration")
    && !change.path.startsWith("/productionRoom")
    && !change.path.startsWith("/log")
  );
}

function countsAsSceneTurn(event: Pick<EngineEvent, "stateChanges"> & { tool?: string }): boolean {
  if (event.tool === "orchestration" || event.tool === "production_room") return false;
  if (event.stateChanges.length > 0 && !meaningfulStateChanges(event)) return false;
  return true;
}

/** Count only trailing committed events with no authoritative state delta. */
export function deriveNoChangeTurns(events: Array<Pick<EngineEvent, "version" | "stateChanges"> & { tool?: string }>, afterVersion = 0): number {
  let count = 0;
  for (const event of [...events].sort((left, right) => left.version - right.version)) {
    if (event.version <= afterVersion) continue;
    if (!countsAsSceneTurn(event)) continue;
    if (meaningfulStateChanges(event)) count = 0;
    else count = Math.min(100, count + 1);
  }
  return count;
}

export function refreshSceneFromEvents(scene: SceneState, events: Array<Pick<EngineEvent, "id" | "version" | "stateChanges"> & { tool?: string }>, now = new Date().toISOString()): SceneState {
  const relevant = [...events]
    .filter((event) => event.version > scene.campaignVersion)
    .filter(countsAsSceneTurn)
    .sort((left, right) => left.version - right.version);
  if (relevant.length === 0) return scene;
  const committedEventRefs = unique([...scene.committedEventRefs, ...relevant.map((event) => event.id)]);
  return sceneStateSchema.parse({
    ...scene,
    noChangeTurns: deriveNoChangeTurns(relevant, 0),
    committedEventRefs,
    updatedAt: now,
  });
}

export function sceneStateFromProjection(input: {
  sceneId: string;
  revision: number;
  campaignVersion: number;
  mode: SceneMode;
  immediateQuestion: string;
  pressureRefs: string[];
  committedEventRefs: string[];
  actorId: string;
  situationRefs?: string[];
  now?: string;
}): SceneState {
  const now = input.now ?? new Date().toISOString();
  const pressureRefs = unique(input.pressureRefs);
  return sceneStateSchema.parse({
    sceneId: input.sceneId,
    revision: input.revision,
    campaignVersion: input.campaignVersion,
    mode: input.mode,
    purpose: "orientation",
    immediateQuestion: input.immediateQuestion,
    situationRefs: unique(input.situationRefs ?? []),
    pressureRefs,
    actorIds: [input.actorId],
    viewpointActorId: input.actorId,
    tensionBand: pressureRefs.length > 0 ? "rising" : "quiet",
    noChangeTurns: 0,
    status: "opening",
    transitionReason: "opening",
    discoveredFactRefs: [],
    committedEventRefs: unique(input.committedEventRefs),
    releasedNarrationRefs: [],
    recapRefs: [],
    unresolvedRefs: [...pressureRefs],
    hookRefs: [],
    surfacedRefs: [],
    createdAt: now,
    updatedAt: now,
  });
}

/** Create explicit, non-forcing hook records for already-authorized scene pressure. */
export function hooksForScene(scene: SceneState): CharacterHook[] {
  return scene.pressureRefs.map((sourceRef) => characterHookSchema.parse({
    id: `hook:${scene.sceneId}:${sourceRef}`,
    kind: "mystery",
    label: `Authorized pressure: ${sourceRef}`,
    status: "open",
    sourceRef,
    lastUsedSceneId: null,
    lastUsedVersion: null,
  }));
}

export function activateScene(scene: SceneState, now = new Date().toISOString()): SceneState {
  if (scene.status === "resolved") return scene;
  return sceneStateSchema.parse({ ...scene, status: "active", updatedAt: now });
}

export function authorizePacingRefs(input: AuthorizedPacingRefs): PacingAuthorization {
  const hidden = new Set(input.hiddenRefs ?? []);
  const stale = new Set(input.staleRefs ?? []);
  const surfaced = new Set(input.surfacedRefs ?? []);
  const filter = (values: string[] | undefined): string[] => unique(values ?? []).filter((value) => !hidden.has(value) && !stale.has(value) && !surfaced.has(value));
  const pressureRefs = filter(input.pressureRefs);
  const clueRefs = filter(input.clueRefs);
  const consequenceRefs = filter(input.consequenceRefs);
  const committedEventRefs = filter(input.committedEventRefs);
  const randomEventRefs = filter(input.randomEventRefs);
  return {
    pressureRefs,
    clueRefs,
    consequenceRefs,
    committedEventRefs,
    randomEventRefs,
    allRefs: unique([...pressureRefs, ...clueRefs, ...consequenceRefs, ...committedEventRefs, ...randomEventRefs]),
  };
}

export function authorizedRandomEventRefs(
  resolutions: EngineRandomEventResolution[],
  committedEventRefs: string[],
  publicFactRefs?: string[],
): string[] {
  const committed = new Set(committedEventRefs);
  const publicFacts = publicFactRefs ? new Set(publicFactRefs) : null;
  return unique(resolutions
    .filter((resolution) => resolution.triggered && committed.has(resolution.sourceEventId))
    .flatMap((resolution) => [
      resolution.id,
      ...resolution.createdFactIds.filter((factId) => !publicFacts || publicFacts.has(factId)),
      ...resolution.createdSituationIds,
      ...resolution.createdEncounterIds,
    ]));
}

function neutralQuestion(value: string): boolean {
  return value.trim().endsWith("?")
    && !/\b(must|required|only option|have to|force|forced)\b/i.test(value);
}

export function validateOrchestrationDecision(
  scene: SceneState,
  input: OrchestrationDecisionInput,
  authorization: PacingAuthorization,
  noChangeTurns: number,
  campaignVersion: number,
): OrchestrationValidationResult {
  const errors: string[] = [];
  if (scene.sceneId !== input.sceneId) errors.push("The orchestration decision references a different scene.");
  if (scene.revision !== input.sceneRevision) errors.push("The orchestration decision references a stale scene revision.");
  if (scene.status === "resolved") errors.push("The scene is already resolved.");
  if (scene.campaignVersion > campaignVersion) errors.push("The scene campaign revision is ahead of the campaign.");
  if (input.action !== "transition" && noChangeTurns < 3) errors.push("Pacing intervention requires three consecutive committed no-change turns.");
  if (input.action === "surface_existing" || input.action === "reframe") {
    if (!input.selectedRef) errors.push("This pacing action needs an authorized existing reference.");
    else if (!authorization.allRefs.includes(input.selectedRef)) errors.push("The selected pacing reference is not authorized, public, or current.");
  }
  if (input.action === "clarify") {
    if (!input.clarificationQuestion || !neutralQuestion(input.clarificationQuestion)) errors.push("Clarification must be a neutral question ending in a question mark.");
  }
  if (input.action === "transition" && !input.transitionReason) errors.push("A transition needs a typed reason.");
  if (input.hookId && !scene.hookRefs.includes(input.hookId)) errors.push("The selected hook is not attached to this scene.");
  return { valid: errors.length === 0, errors, authorization };
}

export function buildSceneRecap(input: {
  scene: SceneState;
  campaignVersion: number;
  committedEvents: Pick<EngineEvent, "id" | "outcome" | "stateChanges">[];
  publicFactRefs: string[];
  resolvedRefs?: string[];
  unresolvedRefs?: string[];
  hookRefs?: string[];
  now?: string;
}): SceneRecap {
  const now = input.now ?? new Date().toISOString();
  const committedEventRefs = unique(input.committedEvents.map((event) => event.id));
  const resolvedRefs = unique(input.resolvedRefs ?? []);
  const unresolvedRefs = unique(input.unresolvedRefs ?? input.scene.unresolvedRefs);
  const headline = resolvedRefs.length > 0
    ? `Scene ${input.scene.sceneId} resolved with ${resolvedRefs.length} recorded consequence reference(s).`
    : `Scene ${input.scene.sceneId} recorded ${committedEventRefs.length} committed event(s) and remains open to the next decision.`;
  return sceneRecapSchema.parse({
    id: `recap:${input.scene.sceneId}:${input.campaignVersion}`,
    sceneId: input.scene.sceneId,
    sceneRevision: input.scene.revision,
    campaignVersion: input.campaignVersion,
    committedEventRefs,
    publicFactRefs: unique(input.publicFactRefs),
    resolvedRefs,
    unresolvedRefs,
    hookRefs: unique(input.hookRefs ?? input.scene.hookRefs),
    headline,
    createdAt: now,
  });
}

export function applyOrchestrationDecision(
  orchestration: OrchestrationState,
  input: OrchestrationDecisionInput,
  authorization: PacingAuthorization,
  noChangeTurns: number,
  campaignVersion: number,
  committedEvents: Pick<EngineEvent, "id" | "version" | "outcome" | "stateChanges">[] = [],
  publicFactRefs: string[] = [],
  now = new Date().toISOString(),
): { state: OrchestrationState; decision: OrchestrationDecision; recap: SceneRecap | null } {
  const scene = orchestration.activeScene;
  if (!scene) throw new Error("No active scene is available for orchestration.");
  const validation = validateOrchestrationDecision(scene, input, authorization, noChangeTurns, campaignVersion);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const refreshed = refreshSceneFromEvents(scene, committedEvents, now);
  const nextScene = activateScene(refreshed, now);
  const selectedRef = input.selectedRef;
  const surfacedRefs = selectedRef ? unique([...nextScene.surfacedRefs, selectedRef]) : nextScene.surfacedRefs;
  const question = input.action === "clarify"
    ? input.clarificationQuestion!
    : input.action === "reframe" && selectedRef
      ? `What matters about ${selectedRef} now?`
      : nextScene.immediateQuestion;
  const recap = input.action === "transition"
    ? buildSceneRecap({
        scene: nextScene,
        campaignVersion,
        committedEvents,
        publicFactRefs,
        resolvedRefs: selectedRef ? [selectedRef] : [],
        unresolvedRefs: nextScene.unresolvedRefs.filter((ref) => ref !== selectedRef),
        hookRefs: nextScene.hookRefs,
        now,
      })
    : null;
  const finalScene = sceneStateSchema.parse({
    ...nextScene,
    revision: nextScene.revision + 1,
    campaignVersion,
    immediateQuestion: question,
    purpose: input.action === "clarify" ? "clarification" : input.action === "transition" ? "transition" : nextScene.purpose,
    status: input.action === "transition" ? "resolved" : "active",
    transitionReason: input.action === "transition"
      ? (input.transitionReason ?? "manual")
      : input.action === "reframe"
        ? "reframe"
        : input.action === "clarify"
          ? "stall_clarification"
          : input.action === "surface_existing"
            ? "stall_pressure"
            : nextScene.transitionReason,
    tensionBand: input.action === "transition" ? "resolved" : input.action === "reframe" ? "rising" : nextScene.tensionBand,
    noChangeTurns,
    surfacedRefs,
    unresolvedRefs: nextScene.unresolvedRefs.filter((ref) => ref !== selectedRef),
    recapRefs: recap ? unique([...nextScene.recapRefs, recap.id]) : nextScene.recapRefs,
    updatedAt: now,
  });
  const id = `orchestration:${input.sceneId}:${campaignVersion}:${input.action}`;
  const decision = orchestrationDecisionSchema.parse({
    ...input,
    id,
    campaignVersion,
    noChangeTurns,
    authorizedRefs: authorization.allRefs,
    recapId: recap?.id ?? null,
    createdAt: now,
  });
  const hooks = orchestration.hooks.map((hook) => input.hookId === hook.id
    ? { ...hook, status: hook.status === "open" ? "active" as const : hook.status, lastUsedSceneId: scene.sceneId, lastUsedVersion: campaignVersion }
    : hook);
  return {
    state: orchestrationStateSchema.parse({
      activeScene: finalScene,
      recaps: recap ? [...orchestration.recaps, recap].slice(-50) : orchestration.recaps,
      hooks,
      decisions: [...orchestration.decisions, decision].slice(-200),
      processedOperationIds: orchestration.processedOperationIds,
    }),
    decision,
    recap,
  };
}

export function buildResumeProjection(
  orchestration: OrchestrationState,
  experienceProfile: EngineExperienceProfileProjection,
): OrchestrationResumeProjection {
  const scene = orchestration.activeScene;
  const recap = scene?.recapRefs.at(-1)
    ? orchestration.recaps.find((candidate) => candidate.id === scene.recapRefs.at(-1)) ?? null
    : orchestration.recaps.at(-1) ?? null;
  const lastReleasedNarrationRef = scene?.releasedNarrationRefs.at(-1) ?? null;
  return {
    scene,
    recap,
    unresolvedRefs: scene?.unresolvedRefs ?? [],
    hookRefs: scene?.hookRefs ?? [],
    hooks: orchestration.hooks.filter((hook) => hook.status !== "resolved"),
    lastReleasedNarrationRef,
    experienceProfile,
  };
}
