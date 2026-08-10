import {
  narrationEnvelopeJsonSchema,
  narrationEnvelopeSchema,
  type NarrationEnvelope,
} from "./ai-contracts.js";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { Open5eContentResolver } from "./content/resolve.js";
import {
  cloneCampaign,
  actorKnowledgeProjection,
  deriveActionOffers,
  projectExperienceProfile,
  projectStateForActor,
  projectResolutionForActor,
  resolveEngineCommand,
  sanitizeNarrationForProfile,
} from "./engine-domain.js";
import { hasActiveCondition } from "./engine-effects.js";
import { projectSituationForActor } from "./engine-situations.js";
import {
  compileAtomicTurnResolution,
  provisionalState,
  type StagedEngineTurnEffect,
} from "./engine-turn-plan.js";
import { materializeInventoryItem } from "./open5e-rules.js";
import type {
  EngineCommand,
  EngineCommandResult,
  EngineCapabilityFamilyId,
  EngineSocialCheckAttribution,
  EngineToolName,
  EngineToolResult,
  EngineTurnEffectEvidence,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";
import {
  commandForTool,
  executeReadTool,
  isEngineToolName,
  parseToolArguments,
  type EngineToolDefinition,
} from "./engine-tools.js";
import {
  capabilityLoadResult,
  capabilityFamilyForToolName,
  engineCapabilityDescriptors,
  engineCoreToolDefinitions,
  engineToolDefinitionsForLoadedCapabilities,
  isCapabilityFamilyAllowed,
  isToolVisibleForLoadedCapabilities,
  parseCapabilityFamilyId,
} from "./engine-capabilities.js";
import {
  EngineCommandIdReuseError,
  EngineCommandInProgressError,
  LanternEngineStore,
} from "./engine-store.js";
import type { OpenRouterCompletionTelemetry, OpenRouterOptions } from "./openrouter.js";
import type { ModelUsagePurpose, ModelUsageStatus } from "./usage-ledger.js";
import { CORE_DM_DOCTRINE } from "./engine-dm-doctrine.js";
import {
  actorSceneProjectionSchema,
  compileNarrationDraft,
  completeDmRun,
  createDmRun,
  narrationDraftFromEnvelope,
  narrationDraftJsonSchema,
  narrationDraftSchema,
  type ActorSceneProjection,
  type DmRun,
  type DmRunKind,
  type DmRunUsage,
  type NarrationDraft,
  type ProductionRoomLiveRelease,
} from "./engine-production-room.js";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface CompletionMessage {
  role?: "assistant";
  content?: unknown;
  tool_calls?: ToolCall[];
  [key: string]: unknown;
}

interface ToolLoopResult {
  /** Private planner prose. It is retained only as a hash and is never published. */
  narration: NarrationEnvelope | null;
  stagedEffects: StagedEngineTurnEffect[];
  plannerRunId: string;
  plannerStartedAt: string;
  telemetry: OpenRouterCompletionTelemetry[];
}

export type DmLoopMode = "player_turn" | "opening";

interface CompletionTelemetryContext {
  accountId: string;
  campaignId: string;
  actorId: string;
  requestId: string;
  clientCommandId: string;
  dmRunId: string;
  purpose: ModelUsagePurpose;
  toolsEnabled: boolean;
  nextRequestSequence: () => number;
  telemetryEvents?: OpenRouterCompletionTelemetry[];
}

class FirstTokenTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`The primary model produced no output within ${timeoutMs}ms.`);
    this.name = "FirstTokenTimeoutError";
  }
}

interface NormalizedCompletionUsage {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costMicrousd: number | null;
}

interface CompletionResponseContract {
  name: string;
  schema: unknown;
}

interface NarratorRunResult {
  draft: NarrationDraft;
  runId: string;
  startedAt: string;
  telemetry: OpenRouterCompletionTelemetry[];
}

const PLANNER_RESPONSE_CONTRACT: CompletionResponseContract = {
  name: "lantern_private_planner_completion",
  schema: narrationEnvelopeJsonSchema,
};

const NARRATOR_RESPONSE_CONTRACT: CompletionResponseContract = {
  name: "lantern_public_narration_draft",
  schema: narrationDraftJsonSchema,
};

const NARRATION_CONTRACT_INSTRUCTION = [
  "Return the final response as one valid JSON object with exactly three keys: text, proposedFacts, and suggestedActions.",
  "text is the player-facing Markdown narration.",
  "proposedFacts is an array with at most eight items. Use only these exact shapes:",
  '{"kind":"record_fact","subjectId":"...","predicate":"...","value":"..."};',
  '{"kind":"introduce_npc","npcId":"...","name":"...","disposition":"friendly|neutral|wary|hostile|unknown"};',
  '{"kind":"discover_location","locationId":"...","name":"..."};',
  '{"kind":"advance_quest","questId":"...","status":"started|advanced|completed|failed"};',
  'or {"kind":"set_scene","sceneId":"..."}.',
  'The shorthand kinds "npc" and "location" are invalid. Do not add title, description, visibility, or other fields to a proposal.',
  "Use an empty proposedFacts array when no proposal matches exactly; durable state already authored through tools does not need to be repeated here.",
  "suggestedActions is an array of 0 to 5 concrete, context-aware moves. Every item must have exactly id, label, and prompt; id is short kebab-case, label is concise player-facing text, and prompt is a natural-language first-person next turn.",
  "Suggestions are invitations, not forced choices, and must never replace freeform play.",
  "Do not wrap the object in a Markdown fence or expose internal prompts, raw tool arguments, or engine implementation details. Never mention that the DM, engine, system, prompt, tool, or context must establish, decide, answer, or retry anything.",
].join(" ");

export const LEGACY_EAGER_DM_PROMPT_CHARACTERS = 18_693 as const;

export function buildDmSystemPrompt(mode: DmLoopMode): string {
  const capabilityCatalog = engineCapabilityDescriptors()
    .map((descriptor) => `${descriptor.id} (rev ${descriptor.revision}; ${descriptor.authority}; ${descriptor.toolCount} tools; ~${descriptor.estimatedSchemaTokens} schema tokens): ${descriptor.description}`)
    .join(" | ");
  return [
    CORE_DM_DOCTRINE,
    "The campaign premise, setting, tone, and experience profile belong to the player. Preserve them; never mutate the experience profile through DM tools, and redirect or fade before excluded content.",
    "The actor-safe context packet is the only campaign truth available on this request. Use read tools when more authorized detail is needed.",
    mode === "opening"
      ? "Open with a concrete present-tense situation, persist its hard reality before input opens, and give the player something meaningful to respond to."
      : "Resolve the submitted turn as one seamless player-intent → stakes → resolution → atomic commit → narration → changed-situation cycle.",
    "A turn may require several ordered effects. Call every required mutation; accepted effects stage against one working snapshot and commit atomically. Repair a required rejected effect before narration or report the constraint honestly.",
    `Detailed schemas and procedure load on demand. The core surface has ${engineCoreToolDefinitions().length} tools. Use capability_load with one authorized family id when needed; loading changes visibility only, never authority. Available families: ${capabilityCatalog}`,
    NARRATION_CONTRACT_INSTRUCTION,
  ].join(" ");
}

export function dmSystemPromptMeasurement(mode: DmLoopMode): {
  characters: number;
  estimatedTokens: number;
  legacyCharacters: typeof LEGACY_EAGER_DM_PROMPT_CHARACTERS;
  characterReduction: number;
} {
  const characters = buildDmSystemPrompt(mode).length;
  return {
    characters,
    estimatedTokens: Math.ceil(characters / 4),
    legacyCharacters: LEGACY_EAGER_DM_PROMPT_CHARACTERS,
    characterReduction: LEGACY_EAGER_DM_PROMPT_CHARACTERS - characters,
  };
}

export function buildDmContext(
  state: LanternCampaignState,
  context: RequestContext,
  playerText: string,
  mode: DmLoopMode
): Record<string, unknown> {
  const activeViewpointActorId = state.party?.activeViewpointActorId ?? context.actorId;
  const projection = actorKnowledgeProjection(activeViewpointActorId, state);
  const projectedState = projectStateForActor(context.actorId, state);
  return {
    playerText,
    mode,
    actorId: context.actorId,
    activeViewpointActorId,
    campaign: state.campaign,
    phase: state.phase,
    tutorialStep: state.tutorialStep,
    experienceProfile: projectExperienceProfile(state.experienceProfile),
    failurePressures: state.failurePressures ?? [],
    worldContext: projection.worldContext,
    proceduralNotices: projection.proceduralNotices,
    knowledge: projection.knowledge,
    informationTiers: projection.informationTiers,
    playerNotes: state.playerNotes,
    quests: state.quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      objective: quest.objective,
      status: quest.status,
      progress: quest.progress,
      deadlineAtMinutes: quest.deadlineAtMinutes ?? null,
    })),
    currentBeat: state.currentBeat,
    situation: state.situation ? projectSituationForActor(state.situation, state, activeViewpointActorId) : null,
    suggestedActions: state.suggestedActions,
    actionOffers: deriveActionOffers(state),
    character: {
      id: state.character.id,
      name: state.character.name,
      created: state.character.created,
      species: state.character.species,
      className: state.character.className,
      level: state.character.level,
      hp: state.character.hp,
      maxHp: state.character.maxHp,
      ac: state.character.ac,
      lifecycleState: state.character.lifecycleState,
      conditions: state.character.conditions,
      custody: state.character.custody,
    },
    combat: {
      status: state.combat.status,
      encounterId: state.combat.encounterId,
      encounterName: state.combat.encounterName,
      round: state.combat.round,
      activeActorId: state.combat.activeActorId,
    },
    controlledActors: projectedState.controlledActors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      kind: actor.kind,
      status: actor.status,
      hp: actor.hp,
      maxHp: actor.maxHp,
      position: actor.position,
    })),
    party: state.party ? {
      id: state.party.id,
      leaderActorId: state.party.leaderActorId,
      activeViewpointActorId: state.party.activeViewpointActorId,
      mode: state.party.mode,
      members: state.party.members.map(({ actorId, role, locationRef }) => ({ actorId, role, locationRef })),
    } : null,
    recentLog: state.log.slice(-8),
  };
}

export function buildPublicNarratorPrompt(): string {
  return [
    CORE_DM_DOCTRINE,
    "You are the public narrator for one already-committed Lantern turn. You have no tools and no authority to change campaign state.",
    "Use only the actor-safe packet below. The committed result and cited event IDs are authoritative. Never contradict a roll, modifier, resource change, location, relationship, object state, or known fact.",
    "Return one JSON object with exactly beats and suggestedActions. beats contains 1 to 8 ordered objects with exactly kind, text, entityRefs, publicFactRefs, committedEventRefs, and interruptible.",
    "kind is establishing, sensory, npc, dialogue, mechanical, consequence, or question. Every entity/fact/event ref must be copied exactly from the actor-safe packet. Use empty ref arrays when a beat makes no such claim.",
    "A mechanical or consequence beat must cite at least one committed event. Do not propose facts, expose hidden state, mention tools/prompts/context/schema/retries, or ask the player to wait for internal work.",
    "The primary prose is the game: portray present NPCs, state what the character perceives, honor the committed consequence, and leave a changed or conclusively answered situation. Exact mechanics may appear secondarily.",
    "suggestedActions contains 0 to 5 optional objects with exactly id, label, and a first-person prompt. Freeform play always remains available.",
  ].join(" ");
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

/** Build the only scene/reference vocabulary visible to the public narrator. */
export function buildCommittedNarratorProjection(
  result: EngineCommandResult,
  context: RequestContext
): ActorSceneProjection {
  const state = result.state;
  const viewpointActorId = state.party?.activeViewpointActorId ?? context.actorId;
  const knowledge = actorKnowledgeProjection(viewpointActorId, state);
  const world = knowledge.worldContext;
  const situation = state.situation
    ? projectSituationForActor(state.situation, state, viewpointActorId)
    : null;
  const entities = uniqueById([
    {
      id: state.character.id,
      kind: "actor" as const,
      label: state.character.name || "Player character",
      visibility: "public" as const,
      detailClass: "authoritative_interactable" as const,
    },
    ...(world?.npcs ?? []).map((npc) => ({
      id: npc.id,
      kind: "actor" as const,
      label: npc.name,
      visibility: "public" as const,
      detailClass: "authoritative_interactable" as const,
    })),
    ...(world?.objects ?? []).map((object) => ({
      id: object.id,
      kind: "object" as const,
      label: object.definition.name,
      visibility: "public" as const,
      state: object.state,
      detailClass: "authoritative_interactable" as const,
    })),
    ...(world?.exits ?? []).map((exit) => ({
      id: exit.id,
      kind: "exit" as const,
      label: exit.label,
      visibility: "public" as const,
      detailClass: "authoritative_interactable" as const,
    })),
  ]);
  const eventIds = result.event ? [result.event.id] : [];
  const sceneRevision = Math.max(
    1,
    situation?.revision ?? state.orchestration?.activeScene?.revision ?? state.version,
  );
  return actorSceneProjectionSchema.parse({
    sceneId: situation?.id ?? state.orchestration?.activeScene?.sceneId ?? world?.id ?? `campaign:${state.id}`,
    revision: sceneRevision,
    campaignVersion: state.version,
    actorId: context.actorId,
    locationId: situation?.currentLocationId ?? world?.id ?? `campaign:${state.id}`,
    mode: state.combat.status === "active" ? "encounter" : world?.npcs.length ? "social" : "exploration",
    immediateQuestion: "What concrete situation follows from the player's committed action?",
    entities,
    visibleFactRefs: knowledge.facts.map((fact) => fact.id),
    revealedClueRefs: situation?.clues.filter((clue) => clue.visibility === "public").map((clue) => clue.id) ?? [],
    pressureRefs: situation && situation.status === "active" ? [situation.pressure.id] : [],
    hazardRefs: [],
    affordanceRefs: [],
    committedEventIds: eventIds,
  });
}

function buildCommittedNarratorContext(
  result: EngineCommandResult,
  context: RequestContext,
  playerText: string,
  projection: ActorSceneProjection,
): Record<string, unknown> {
  const publicResult = projectResolutionForActor(result, context.actorId);
  const publicState = publicResult.state;
  return {
    playerIntent: playerText,
    scene: projection,
    committedResult: {
      tool: publicResult.tool,
      accepted: publicResult.accepted,
      code: publicResult.code,
      message: publicResult.message,
      data: publicResult.data,
      event: publicResult.event,
    },
    experienceProfile: projectExperienceProfile(publicState.experienceProfile),
    recentPublicLog: publicState.log.slice(-8),
    legalActionOffers: deriveActionOffers(publicState).filter((offer) => offer.reasonUnavailable === null),
  };
}

function knownSum(
  events: readonly OpenRouterCompletionTelemetry[],
  select: (event: OpenRouterCompletionTelemetry) => number | null | undefined,
): number | null {
  if (events.length === 0) return null;
  const values = events.map(select);
  return values.some((value) => value === null || value === undefined)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function dmRunUsage(
  events: readonly OpenRouterCompletionTelemetry[],
  options: OpenRouterOptions,
): DmRunUsage {
  const last = events.at(-1);
  const costMicrousd = knownSum(events, (event) => event.costMicrousd);
  return {
    provider: last?.provider ?? "openrouter",
    model: last?.resolvedModel ?? last?.model ?? options.model,
    inputTokens: knownSum(events, (event) => event.inputTokens),
    outputTokens: knownSum(events, (event) => event.outputTokens),
    totalTokens: knownSum(events, (event) => event.totalTokens),
    costUsd: costMicrousd === null ? null : costMicrousd / 1_000_000,
    latencyMs: events.reduce((total, event) => total + event.durationMs, 0),
  };
}

function completedRun(
  input: {
    id: string;
    kind: DmRunKind;
    status: "committed" | "released";
    startedAt: string;
    output: string;
    telemetry: OpenRouterCompletionTelemetry[];
    baseState: LanternCampaignState;
    context: RequestContext;
    eventIds: string[];
  },
  options: OpenRouterOptions,
): DmRun {
  const run = createDmRun({
    id: input.id,
    kind: input.kind,
    accountId: input.context.accountId,
    campaignId: input.context.campaignId,
    actorId: input.context.actorId,
    baseCampaignVersion: input.baseState.version,
    baseSceneRevision: input.baseState.situation?.revision
      ?? input.baseState.orchestration?.activeScene?.revision
      ?? null,
    usage: dmRunUsage(input.telemetry, options),
    createdAt: input.startedAt,
  });
  const completed = completeDmRun(run, input.output, input.status);
  return {
    ...completed,
    committedEventIds: [...input.eventIds],
    publicEventRefs: [...input.eventIds],
  };
}

interface ProvisionalToolResult extends EngineToolResult {
  stagedEffect?: StagedEngineTurnEffect;
  loadedCapabilityFamily?: EngineCapabilityFamilyId;
}

const narrativeCheckKinds = new Set<EngineCommand["kind"]>([
  "roll_check",
  "challenge_attempt",
  "social_check",
  "situation_clue_attempt",
]);

function isNarrativeCheckEffect(effect: StagedEngineTurnEffect): boolean {
  return narrativeCheckKinds.has(effect.command.kind) && Boolean(effect.resolution.event?.check);
}

function stagedCheckOutcome(effect: StagedEngineTurnEffect): "success" | "failure" | null {
  if (!isNarrativeCheckEffect(effect)) return null;
  const data = effect.resolution.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const success = (data as { success?: unknown }).success;
    if (typeof success === "boolean") return success ? "success" : "failure";
    const outcome = (data as { outcome?: unknown }).outcome;
    if (outcome === "success" || outcome === "automatic-success") return "success";
    if (outcome === "failure" || outcome === "failure-with-complication") return "failure";
  }
  const outcome = effect.resolution.event?.outcome ?? "";
  if (outcome === "success" || outcome.endsWith("_success") || outcome.includes("_found")) return "success";
  if (outcome === "failure" || outcome.includes("failure") || outcome.includes("failed")) return "failure";
  return null;
}

function checkGoal(effect: StagedEngineTurnEffect): string {
  const command = effect.command;
  if ("goal" in command && typeof command.goal === "string") return command.goal;
  if (command.kind === "situation_clue_attempt") return command.approach;
  return command.kind.replaceAll("_", " ");
}

function checkOutcomeEnvelope(effect: StagedEngineTurnEffect, sourceEffectIndex: number): Record<string, unknown> | null {
  const outcome = stagedCheckOutcome(effect);
  if (!outcome) return null;
  return {
    sourceEffectIndex,
    outcome,
    goal: checkGoal(effect),
    allowedSceneMoveCategories: ["reaction", "cost", "pressure", "choice", "closure"],
    hardRealityRule: "Do not invent or move pre-existing actors, objects, exits, hazards, loot, locks, or hidden facts.",
  };
}

function checkHasCommittedConsequence(effect: StagedEngineTurnEffect): boolean {
  return Boolean(effect.resolution.event?.stateChanges.some((change) =>
    change.path.startsWith("/actorKnowledge/")
    || change.path.startsWith("/worldContext/objects/")
  ));
}

function hasConcreteLaterConsequence(
  effects: readonly StagedEngineTurnEffect[],
  sourceEffectIndex: number,
): boolean {
  for (let index = sourceEffectIndex + 1; index < effects.length; index += 1) {
    const effect = effects[index]!;
    if (isNarrativeCheckEffect(effect)) continue;
    if (effect.command.kind === "improvise") {
      const sceneMove = effect.command.sceneMove;
      if (sceneMove?.sourceEffectIndex === sourceEffectIndex) return true;
      if (effect.command.effectType === "fictional") continue;
    }
    if (effect.resolution.event?.stateChanges.some((change) =>
      change.path !== "/lastRoll"
      && !change.path.startsWith("/adjudicationHistory/")
      && !change.path.startsWith("/failurePressures/")
    )) return true;
  }
  return false;
}

function unresolvedNarrativeCheckIndices(effects: readonly StagedEngineTurnEffect[]): number[] {
  const unresolved: number[] = [];
  effects.forEach((effect, index) => {
    if (!isNarrativeCheckEffect(effect)) return;
    if (checkHasCommittedConsequence(effect)) return;
    if (hasConcreteLaterConsequence(effects, index)) return;
    unresolved.push(index);
  });
  return unresolved;
}

function discardUnresolvedChecks(effects: readonly StagedEngineTurnEffect[]): StagedEngineTurnEffect[] {
  const firstUnresolved = unresolvedNarrativeCheckIndices(effects)[0];
  return firstUnresolved === undefined ? [...effects] : effects.slice(0, firstUnresolved);
}

function validateSceneMoveBinding(
  command: EngineCommand,
  priorEffects: readonly StagedEngineTurnEffect[],
  assistantVisibleEffectCount: number,
): { code: string; message: string } | null {
  if (command.kind !== "improvise" || !command.sceneMove) return null;
  const sceneMove = command.sceneMove;
  if (sceneMove.sourceEffectIndex >= assistantVisibleEffectCount) {
    return {
      code: "scene_move_wrong_order",
      message: "A scene move must bind a check result returned in an earlier tool round; it cannot guess the result of a same-round check.",
    };
  }
  const source = priorEffects[sceneMove.sourceEffectIndex];
  const outcome = source ? stagedCheckOutcome(source) : null;
  if (!source || !outcome) {
    return {
      code: "scene_move_source_not_check",
      message: "The selected sourceEffectIndex is not an earlier resolved narrative check.",
    };
  }
  if (sceneMove.outcome !== outcome) {
    return {
      code: "scene_move_outcome_mismatch",
      message: `The scene move says ${sceneMove.outcome}, but source effect ${sceneMove.sourceEffectIndex} resolved as ${outcome}.`,
    };
  }
  return null;
}

function consequenceRepairInstruction(
  effects: readonly StagedEngineTurnEffect[],
  unresolvedIndices: readonly number[],
): string {
  const envelopes = unresolvedIndices
    .map((index) => checkOutcomeEnvelope(effects[index]!, index))
    .filter((value): value is Record<string, unknown> => Boolean(value));
  return [
    "The previous plan ended with an orphaned check. The roll is private and provisional; it is not a completed player turn.",
    `OutcomeEnvelope: ${JSON.stringify(envelopes)}`,
    "Now call an existing authoritative tool for the concrete result, or call improvise with effectType fictional and sceneMove bound to the exact sourceEffectIndex and outcome above.",
    "A fictional sceneMove may only record a caused reaction, cost, pressure, choice, or closure. Use situation clues for revelations, move/world_context for position, and typed tools for mechanics or durable state.",
    "Do not repeat the roll. Do not expose tools, schemas, or this repair to the player.",
  ].join(" ");
}

export class LanternDungeonMaster {
  public constructor(
    private readonly store: LanternEngineStore,
    private readonly options: OpenRouterOptions,
    private readonly contentResolver:
      | Open5eContentResolver
      | ((state: LanternCampaignState) => Open5eContentResolver)
      | null = null
  ) {}

  public async startOpening(
    context: RequestContext,
    state: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number
  ): Promise<EngineCommandResult> {
    const existing = this.store.getStoredCommand(context.accountId, clientCommandId);
    if (existing) {
      let storedRequest: { campaignId?: string; playerText?: string | null } = {};
      try {
        storedRequest = JSON.parse(existing.requestJson) as typeof storedRequest;
      } catch (_error) {
        storedRequest = {};
      }
      if (storedRequest.campaignId !== context.campaignId || storedRequest.playerText) {
        throw new EngineCommandIdReuseError();
      }
      if (existing.result) return { ...existing.result, replayed: true };
    }
    if (existing) throw new EngineCommandInProgressError();

    let committed: EngineCommandResult | null = null;
    try {
      const openingPrompt = [
        "Open this campaign before the player takes their first action.",
        "Use the campaign premise, setting, tone, and the completed character to author a concrete first situation.",
        "The opening must create immediate dramatic motion: a present-tense circumstance, a relevant NPC or threat when appropriate, and a clear thing the player can respond to.",
        "Persist the authored situation with world_context before you finish. You may also create a quest or campaign beat when the opening warrants one.",
        "After world_context establishes the scene evidence, every concrete actionable mundane item must be compiled with content_compile materialization before it appears in final narration. The compiler creates the canonical definition and instance and bridges it into the existing world-object rules.",
        "Do not wait for the player to ask what is in the room; the DM is opening the story now.",
      ].join(" ");
      const toolLoop = await this.runToolLoop(
        context,
        state,
        clientCommandId,
        expectedCampaignVersion,
        openingPrompt,
        "opening"
      );
      if (!toolLoop.stagedEffects.some((effect) => effect.command.kind === "world_context")) {
        throw new Error("The DM opening did not persist a world context.");
      }

      const command = {
        kind: "turn_plan" as const,
        effects: toolLoop.stagedEffects.map((effect) => ({ tool: effect.tool, command: effect.command })),
      };
      committed = this.store.executeCommand({
        context,
        clientCommandId,
        expectedCampaignVersion,
        command,
        tool: "turn_plan",
        resolve: (current) => compileAtomicTurnResolution(
          current,
          context,
          clientCommandId,
          toolLoop.stagedEffects
        ),
      });
      return await this.releaseCommittedNarration(
        context,
        state,
        committed,
        clientCommandId,
        "Open the campaign with a concrete first situation.",
        toolLoop,
      );
    } catch (error) {
      if (committed) {
        const fallback = sanitizeNarrationForProfile(
          rulesNarration(
            committed.message,
            "The opening is committed. The DM prose provider needs a moment, so the table keeps the authored situation."
          ),
          committed.state.experienceProfile,
        );
        return {
          ...committed,
          narration: fallback,
          narrationSource: "rules",
        };
      }
      throw error;
    }
  }

  public async resolveTurn(
    context: RequestContext,
    state: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string
  ): Promise<EngineCommandResult> {
    const reservation = this.store.reservePlayerTurn({
      context,
      clientCommandId,
      expectedCampaignVersion,
      playerText,
    });
    if (reservation) return reservation;

    let committed: EngineCommandResult | null = null;
    try {
      const toolLoop = await this.runToolLoop(
        context,
        state,
        clientCommandId,
        expectedCampaignVersion,
        playerText,
        "player_turn"
      );

      if (toolLoop.stagedEffects.length > 0) {
        const command = {
          kind: "turn_plan" as const,
          effects: toolLoop.stagedEffects.map((effect) => ({ tool: effect.tool, command: effect.command })),
        };
        committed = this.store.executeCommand({
          context,
          clientCommandId,
          expectedCampaignVersion,
          command,
          tool: "turn_plan",
          playerText,
          resolve: (current) => compileAtomicTurnResolution(
            current,
            context,
            clientCommandId,
            toolLoop.stagedEffects
          ),
        });
      } else {
        committed = this.commitDeclaration(
          context,
          clientCommandId,
          expectedCampaignVersion,
          playerText
        );
      }

      return await this.releaseCommittedNarration(
        context,
        state,
        committed,
        clientCommandId,
        playerText,
        toolLoop,
      );
    } catch (error) {
      if (committed) {
        const fallback = sanitizeNarrationForProfile(
          committedRulesNarration(committed),
          committed.state.experienceProfile,
        );
        return this.store.updateCommandNarration(context, clientCommandId, fallback, "rules")
          ?? { ...committed, narration: fallback, narrationSource: "rules" };
      }
      console.warn(error instanceof Error ? "DM tool loop fallback: " + error.message : "DM tool loop fallback.");
      return this.resolveFallback(context, state, clientCommandId, expectedCampaignVersion, playerText);
    }
  }

  private async releaseCommittedNarration(
    context: RequestContext,
    baseState: LanternCampaignState,
    committed: EngineCommandResult,
    clientCommandId: string,
    playerText: string,
    planner: ToolLoopResult,
  ): Promise<EngineCommandResult> {
    try {
      const projection = buildCommittedNarratorProjection(committed, context);
      const narrator = await this.runPublicNarrator(
        context,
        committed,
        clientCommandId,
        playerText,
        projection,
      );
      if (
        projection.committedEventIds.length > 0
        && !narrator.draft.beats.some((beat) =>
          beat.committedEventRefs.some((eventId) => projection.committedEventIds.includes(eventId))
        )
      ) {
        throw new Error("The public narrator did not bind its result to the committed turn event.");
      }

      // Validate every model-proposed reference before applying profile and
      // attribution safeguards to the final public text.
      const validatedDraft = compileNarrationDraft({
        draft: narrator.draft,
        projection,
        sourceRunId: planner.plannerRunId,
        narratorRunId: narrator.runId,
      });
      const preserved = preserveMediatedCheckAttribution(
        committed,
        validatedDraft.narration,
        committed.state.experienceProfile,
      );
      if (preserved.source !== "llm") {
        throw new Error("The public narrator contradicted committed check attribution.");
      }

      const entityRefs = [...new Set(narrator.draft.beats.flatMap((beat) => beat.entityRefs))];
      const publicFactRefs = [...new Set(narrator.draft.beats.flatMap((beat) => beat.publicFactRefs))];
      const committedEventRefs = [...new Set(narrator.draft.beats.flatMap((beat) => beat.committedEventRefs))];
      const finalDraft = narrationDraftSchema.parse({
        beats: [{
          kind: committedEventRefs.length > 0 ? "consequence" : "establishing",
          text: preserved.narration.text,
          entityRefs,
          publicFactRefs,
          committedEventRefs,
          interruptible: true,
        }],
        suggestedActions: preserved.narration.suggestedActions,
      });
      const compiled = compileNarrationDraft({
        draft: finalDraft,
        projection,
        sourceRunId: planner.plannerRunId,
        narratorRunId: narrator.runId,
      });
      const eventIds = [...projection.committedEventIds];
      const plannerRun = completedRun({
        id: planner.plannerRunId,
        kind: "intent_interpretation",
        status: "committed",
        startedAt: planner.plannerStartedAt,
        output: JSON.stringify({
          privateDraft: planner.narration,
          effects: planner.stagedEffects.map((effect) => ({ tool: effect.tool, command: effect.command })),
        }),
        telemetry: planner.telemetry,
        baseState,
        context,
        eventIds,
      }, this.options);
      const narratorRun = completedRun({
        id: narrator.runId,
        kind: "narration",
        status: "released",
        startedAt: narrator.startedAt,
        output: JSON.stringify(narrator.draft),
        telemetry: narrator.telemetry,
        baseState: committed.state,
        context,
        eventIds,
      }, this.options);
      const release: ProductionRoomLiveRelease = {
        plannerRun,
        narratorRun,
        sequence: compiled.sequence,
      };
      return this.store.updateCommandNarration(
        context,
        clientCommandId,
        compiled.narration,
        "llm",
        release,
      ) ?? {
        ...committed,
        narration: compiled.narration,
        narrationSource: "llm",
      };
    } catch (error) {
      console.warn(
        "DM public narration release fallback: "
        + (error instanceof Error ? error.message : "unknown narrator error")
      );
      const fallback = sanitizeNarrationForProfile(
        appendMissingMediatedAttributions(
          committedRulesNarration(committed),
          mediatedCheckAttributions(committed),
          false,
        ),
        committed.state.experienceProfile,
      );
      return this.store.updateCommandNarration(context, clientCommandId, fallback, "rules") ?? {
        ...committed,
        narration: fallback,
        narrationSource: "rules",
      };
    }
  }

  private async runPublicNarrator(
    context: RequestContext,
    committed: EngineCommandResult,
    clientCommandId: string,
    playerText: string,
    projection: ActorSceneProjection,
  ): Promise<NarratorRunResult> {
    const runId = `dm-run:${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const telemetry: OpenRouterCompletionTelemetry[] = [];
    let requestSequence = 0;
    const messages: ChatMessage[] = [
      { role: "system", content: buildPublicNarratorPrompt() },
      {
        role: "user",
        content: JSON.stringify(buildCommittedNarratorContext(
          committed,
          context,
          playerText,
          projection,
        )),
      },
    ];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestTelemetry: OpenRouterCompletionTelemetry[] = [];
      let assistant: CompletionMessage;
      try {
        assistant = await this.requestCompletion(messages, false, {
          accountId: context.accountId,
          campaignId: context.campaignId,
          actorId: context.actorId,
          requestId: context.requestId,
          clientCommandId,
          dmRunId: runId,
          purpose: attempt === 0 ? "narration" : "narration_repair",
          toolsEnabled: false,
          nextRequestSequence: () => ++requestSequence,
          telemetryEvents: requestTelemetry,
        }, undefined, NARRATOR_RESPONSE_CONTRACT);
      } finally {
        telemetry.push(...requestTelemetry);
        this.flushCompletionTelemetry(
          requestTelemetry,
          attempt === 0 ? "narration" : "narration_repair",
        );
      }
      const content = typeof assistant.content === "string" ? assistant.content.trim() : "";
      try {
        if ((assistant.tool_calls?.length ?? 0) > 0) {
          throw new Error("The public narrator attempted to call a tool.");
        }
        const parsed = JSON.parse(stripJsonFence(content)) as unknown;
        const draft = narrationDraftSchema.safeParse(parsed);
        const compatible = draft.success
          ? draft.data
          : narrationDraftFromEnvelope(narrationEnvelopeSchema.parse(parsed), projection);
        return { draft: compatible, runId, startedAt, telemetry };
      } catch (error) {
        if (attempt === 1) throw error;
        messages.push({ role: "assistant", content: content || null });
        messages.push({
          role: "user",
          content: "The narration draft failed its strict public schema or used an invalid reference. Return a corrected object only; do not add facts, tools, commentary, or markdown.",
        });
      }
    }
    throw new Error("The public narrator did not produce a validated draft.");
  }

  private async runToolLoop(
    context: RequestContext,
    initialState: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string,
    mode: DmLoopMode
  ): Promise<ToolLoopResult> {
    if (!this.options.apiKey) throw new Error("OpenRouter is not configured.");

    let currentState = cloneCampaign(initialState);
    const stagedEffects: StagedEngineTurnEffect[] = [];
    const dmRunId = `dm-run:${randomUUID()}`;
    const plannerStartedAt = new Date().toISOString();
    const plannerTelemetry: OpenRouterCompletionTelemetry[] = [];
    const finishPlanner = (
      narration: NarrationEnvelope | null,
      effects: StagedEngineTurnEffect[] = stagedEffects,
    ): ToolLoopResult => ({
      narration,
      stagedEffects: effects,
      plannerRunId: dmRunId,
      plannerStartedAt,
      telemetry: plannerTelemetry,
    });
    let requestSequence = 0;
    const loadedCapabilityFamilies = new Set<EngineCapabilityFamilyId>();
    const availableToolDefinitions = (): readonly EngineToolDefinition[] =>
      engineToolDefinitionsForLoadedCapabilities([...loadedCapabilityFamilies]);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: buildDmSystemPrompt(mode),
      },
      {
        role: "user",
        content: JSON.stringify(buildDmContext(initialState, context, playerText, mode)),
      },
    ];

    let repairPending = false;
    let repairAttempted = false;
    let noticeRepairAttempted = false;
    let intentRepairAttempted = false;
    let safeNarrationCandidate: string | null = null;
    const objectIntent = detectObjectTurnIntent(initialState, playerText);
    let objectRepairAttempted = false;
    const searchIntent = detectSearchTurnIntent(playerText);
    let searchRepairAttempted = false;
    let consequenceRepairAttempted = false;

    let toolLoopTurns = 0;
    while (toolLoopTurns < 8 || repairPending) {
      if (!repairPending) toolLoopTurns += 1;
      const assistantVisibleEffectCount = stagedEffects.length;
      let assistant: CompletionMessage;
      const telemetryEvents: OpenRouterCompletionTelemetry[] = [];
      try {
        assistant = await this.requestCompletion(messages, !repairPending, {
          accountId: context.accountId,
          campaignId: context.campaignId,
          actorId: context.actorId,
          requestId: context.requestId,
          clientCommandId,
          dmRunId,
          purpose: repairPending ? "narration_repair" : mode,
          toolsEnabled: !repairPending,
          nextRequestSequence: () => ++requestSequence,
          telemetryEvents,
        }, availableToolDefinitions());
      } catch (error) {
        plannerTelemetry.push(...telemetryEvents);
        this.flushCompletionTelemetry(telemetryEvents, repairPending ? "narration_repair" : mode);
        if (repairPending) {
          console.warn(
            "DM narration contract repair request failed; using safe text-only fallback: "
              + (error instanceof Error ? error.message : "unknown provider error")
          );
          return finishPlanner(safeNarrationCandidate ? rulesNarration(safeNarrationCandidate) : null);
        }
        if (stagedEffects.length > 0) {
          if (mode === "player_turn" && unresolvedNarrativeCheckIndices(stagedEffects).length > 0) {
            return finishPlanner(null, discardUnresolvedChecks(stagedEffects));
          }
          return finishPlanner(null);
        }
        throw error;
      }
      const toolCalls = assistant.tool_calls ?? [];
      plannerTelemetry.push(...telemetryEvents);
      this.flushCompletionTelemetry(
        telemetryEvents,
        repairPending ? "narration_repair" : mode
      );
      if (!toolCalls.length) {
        const content = typeof assistant.content === "string" ? assistant.content.trim() : "";
        if (objectIntent) {
          const repair = objectTurnRepair(objectIntent, currentState, stagedEffects);
          if (repair) {
            if (!objectRepairAttempted) {
              objectRepairAttempted = true;
              messages.push({ role: "assistant", content: content || null });
              messages.push({ role: "user", content: repair });
              continue;
            }
            return finishPlanner(
              null,
              stagedEffects.filter((effect) => objectIntent.kind !== "held-transfer" || heldContest(effect)?.outcome !== "success"),
            );
          }
        }
        if (mode === "player_turn") {
          const unresolvedChecks = unresolvedNarrativeCheckIndices(stagedEffects);
          if (unresolvedChecks.length > 0) {
            if (!consequenceRepairAttempted) {
              consequenceRepairAttempted = true;
              messages.push({ role: "assistant", content: content || null });
              messages.push({
                role: "user",
                content: consequenceRepairInstruction(stagedEffects, unresolvedChecks),
              });
              continue;
            }
            return finishPlanner(null, discardUnresolvedChecks(stagedEffects));
          }
        }
        const validation = validateNarration(content);
        if (validation.success) {
          if (searchIntent) {
            const searchRepair = searchTurnRepair(searchIntent, initialState, validation.data.text, currentState, stagedEffects);
            if (searchRepair) {
              if (!searchRepairAttempted) {
                searchRepairAttempted = true;
                messages.push({ role: "assistant", content: content || null });
                messages.push({ role: "user", content: searchRepair });
                continue;
              }
              return finishPlanner(null);
            }
          }
          const noticeRepair = proceduralNoticeRepair(playerText, content, currentState, stagedEffects);
          if (noticeRepair) {
            if (!noticeRepairAttempted) {
              noticeRepairAttempted = true;
              messages.push({ role: "assistant", content: content || null });
              messages.push({ role: "user", content: noticeRepair });
              continue;
            }
            return finishPlanner(rulesNarration("The formal procedure is waiting for an authoritative notice record before it can govern your next action."));
          }
          return finishPlanner(validation.data);
        }
        safeNarrationCandidate ??= validation.safeText;

        if (!repairAttempted) {
          repairAttempted = true;
          repairPending = true;
          messages.push({
            role: "assistant",
            content: content || null,
          });
          messages.push({
            role: "user",
            content: narrationRepairInstruction(validation.issues),
          });
          continue;
        }

        console.warn(
          "DM narration contract repair failed; using safe text-only fallback: "
            + validation.issues.join("; ").slice(0, 1_000)
        );
        return finishPlanner(safeNarrationCandidate ? rulesNarration(safeNarrationCandidate) : null);
      }

      repairPending = false;

      messages.push({
        role: "assistant",
        content: typeof assistant.content === "string" ? assistant.content : null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        let toolOutput = this.executeToolCall(
          context,
          currentState,
          clientCommandId,
          toolCall,
          stagedEffects,
          assistantVisibleEffectCount,
          loadedCapabilityFamilies,
        );
        if (
          searchIntent
          && toolOutput.stagedEffect?.command.kind === "content_compile"
          && toolOutput.stagedEffect.command.materialization
          && !searchMaterializationAuthorized(initialState, stagedEffects, toolOutput.stagedEffect.command)
        ) {
          const { stagedEffect: _discarded, ...base } = toolOutput;
          toolOutput = {
            ...base,
            accepted: false,
            code: "search_materialization_not_authorized",
            message: "A broad search cannot materialize an item without evidence that predated the search or a typed committed discovery.",
            data: null,
            provisional: false,
          };
        }
        if (toolOutput.loadedCapabilityFamily) loadedCapabilityFamilies.add(toolOutput.loadedCapabilityFamily);
        const provisionalEffectIndex = toolOutput.stagedEffect ? stagedEffects.length : null;
        const outcomeEnvelope = toolOutput.stagedEffect && provisionalEffectIndex !== null
          ? checkOutcomeEnvelope(toolOutput.stagedEffect, provisionalEffectIndex)
          : null;
        if (toolOutput.stagedEffect) {
          stagedEffects.push(toolOutput.stagedEffect);
          currentState = provisionalState(toolOutput.stagedEffect.resolution, expectedCampaignVersion);
        }
        messages.push({
          role: "tool",
          content: JSON.stringify({
            tool: toolOutput.tool,
            accepted: toolOutput.accepted,
            readOnly: toolOutput.readOnly,
            code: toolOutput.code,
            message: toolOutput.message,
            data: toolOutput.data,
            campaignVersion: toolOutput.campaignVersion,
            provisional: toolOutput.provisional ?? false,
            provisionalEffectIndex,
            outcomeEnvelope,
          }),
          tool_call_id: toolCall.id,
        });
      }
      if (
        !repairPending
        && movementOnlyPlanMissesIntent(playerText, stagedEffects)
      ) {
        stagedEffects.length = 0;
        currentState = cloneCampaign(initialState);
        if (intentRepairAttempted) return finishPlanner(null);
        intentRepairAttempted = true;
        messages.push({
          role: "user",
          content: intentRepairInstruction(playerText),
        });
        continue;
      }
      // Loading a reviewed schema family is orchestration, not a gameplay
      // action. It should not consume one of the eight authoritative tool
      // rounds; otherwise a late family load could force an unnecessary
      // fallback before the requested tool is even visible.
      if (!repairPending && toolCalls.length > 0 && toolCalls.every((toolCall) => toolCall.function.name === "capability_load")) {
        toolLoopTurns -= 1;
      }
    }

    if (stagedEffects.length > 0) {
      if (mode === "player_turn" && unresolvedNarrativeCheckIndices(stagedEffects).length > 0) {
        return finishPlanner(null, discardUnresolvedChecks(stagedEffects));
      }
      return finishPlanner(null);
    }
    throw new Error("The DM exceeded the tool-call turn budget.");
  }

  private executeToolCall(
    context: RequestContext,
    currentState: LanternCampaignState,
    clientCommandId: string,
    toolCall: ToolCall,
    stagedEffects: readonly StagedEngineTurnEffect[],
    assistantVisibleEffectCount: number,
    loadedCapabilityFamilies: Set<EngineCapabilityFamilyId>,
  ): ProvisionalToolResult {
    const stagedEffectCount = stagedEffects.length;
    const toolName = toolCall.function.name;
    if (!isEngineToolName(toolName)) {
      return {
        tool: "campaign_context",
        readOnly: true,
        accepted: false,
        code: "unknown_tool",
        message: "That tool is not available in Lantern.",
        data: { requestedTool: toolName },
        campaignVersion: currentState.version,
      };
    }

    if (!isToolVisibleForLoadedCapabilities(toolName, [...loadedCapabilityFamilies])) {
      const familyId = capabilityFamilyForToolName(toolName);
      if (!familyId || !isCapabilityFamilyAllowed(familyId, currentState, context.capabilities)) {
        return {
          tool: toolName,
          readOnly: true,
          accepted: false,
          code: "capability_not_authorized",
          message: "That capability family is not authorized for the current server-assigned phase and role.",
          data: { availableFamilies: engineCapabilityDescriptors().map((descriptor) => descriptor.id) },
          campaignVersion: currentState.version,
        };
      }
      // A provider can still name a reviewed tool from a prior prompt. Treat
      // that as a deterministic server-side load, then keep the family loaded
      // for subsequent requests. No authority is granted by this fallback.
      loadedCapabilityFamilies.add(familyId);
    }

    if (
      toolName === "experience_profile_update"
      || toolName === "experience_feedback_add"
      || toolName === "experience_boundary"
    ) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: "profile_player_only",
        message: "Experience preferences can only be changed by an explicit player command.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    let rawArguments: unknown;
    try {
      rawArguments = JSON.parse(toolCall.function.arguments || "{}");
    } catch (_error) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "invalid_tool_arguments",
        message: "The tool arguments were not valid JSON.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    let args: Record<string, unknown>;
    try {
      args = parseToolArguments(toolName, rawArguments);
    } catch (error) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "invalid_tool_arguments",
        message: error instanceof Error ? error.message : "The tool arguments were invalid.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    if (toolName === "capability_load") {
      const familyId = parseCapabilityFamilyId(args.familyId);
      if (!familyId) {
        return {
          tool: toolName,
          readOnly: true,
          accepted: false,
          code: "invalid_capability_family",
          message: "That capability family is not recognized.",
          data: null,
          campaignVersion: currentState.version,
        };
      }
      if (!isCapabilityFamilyAllowed(familyId, currentState, context.capabilities)) {
        return {
          tool: toolName,
          readOnly: true,
          accepted: false,
          code: "capability_not_authorized",
          message: "That capability family is not authorized for the current server-assigned phase and role.",
          data: { familyId },
          campaignVersion: currentState.version,
        };
      }
      return {
        tool: toolName,
        readOnly: true,
        accepted: true,
        code: null,
        message: `Loaded the ${familyId} capability family.`,
        data: capabilityLoadResult(familyId),
        campaignVersion: currentState.version,
        loadedCapabilityFamily: familyId,
      };
    }

    const command = commandForTool(
      toolName,
      toolName === "player_note_add" ? { ...args, source: "dm" } : args
    );
    if (!command) return executeReadTool(currentState, toolName, args, this.resolverFor(currentState));

    const bindingError = validateSceneMoveBinding(command, stagedEffects, assistantVisibleEffectCount);
    if (bindingError) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: bindingError.code,
        message: bindingError.message,
        data: null,
        campaignVersion: currentState.version,
        provisional: false,
      };
    }

    if (stagedEffectCount >= 16) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: "turn_plan_effect_limit",
        message: "This turn plan already contains the maximum of 16 ordered effects.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    try {
      const resolution = resolveEngineCommand(
        currentState,
        context,
        `${clientCommandId}:${stagedEffectCount}`,
        command,
        toolName,
        undefined,
        { sceneMoveBindingValidated: command.kind === "improvise" && Boolean(command.sceneMove) },
      );
      const publicResolution = projectResolutionForActor(resolution, context.actorId);
      return {
        tool: toolName,
        readOnly: publicResolution.readOnly,
        accepted: publicResolution.accepted,
        code: publicResolution.code,
        message: publicResolution.message,
        data: publicResolution.data,
        campaignVersion: currentState.version,
        provisional: resolution.accepted,
        ...(resolution.accepted && !resolution.readOnly
          ? { stagedEffect: { tool: toolName, command, resolution } }
          : {}),
      };
    } catch (error) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: "tool_execution_failed",
        message: error instanceof Error ? error.message : "The tool could not execute.",
        data: null,
        campaignVersion: currentState.version,
      };
    }
  }

  private resolverFor(state: LanternCampaignState): Open5eContentResolver | null {
    return typeof this.contentResolver === "function"
      ? this.contentResolver(state)
      : this.contentResolver;
  }

  private commitDeclaration(
    context: RequestContext,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string
  ): EngineCommandResult {
    const command: EngineCommand = { kind: "declare", goal: playerText };
    return this.store.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion,
      command,
      tool: "declare",
      playerText,
      resolve: (state) => resolveEngineCommand(state, context, clientCommandId, command, "declare", playerText),
    });
  }

  private resolveFallback(
    context: RequestContext,
    state: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string
  ): EngineCommandResult {
    const selected = fallbackCommand(state, playerText);
    const result = this.store.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion,
      command: selected.command,
      tool: selected.tool,
      playerText,
      resolve: (current) =>
        resolveEngineCommand(current, context, clientCommandId, selected.command, selected.tool, playerText),
    });
    const fallback = sanitizeNarrationForProfile(
      committedRulesNarration(result),
      result.state.experienceProfile,
    );
    return this.store.updateCommandNarration(context, clientCommandId, fallback, "rules") ?? {
      ...result,
      narration: fallback,
      narrationSource: "rules",
    };
  }

  private async requestCompletion(
    messages: ChatMessage[],
    allowTools: boolean,
    telemetryContext?: CompletionTelemetryContext,
    tools?: readonly EngineToolDefinition[],
    responseContract: CompletionResponseContract = PLANNER_RESPONSE_CONTRACT,
  ): Promise<CompletionMessage> {
    try {
      return await this.requestStreamingCompletion(
        messages,
        allowTools,
        this.options.baseUrl,
        this.options.model,
        "primary",
        telemetryContext ? {
          ...telemetryContext,
          requestSequence: telemetryContext.nextRequestSequence(),
        } : undefined,
        tools,
        responseContract,
      );
    } catch (error) {
      if (!(error instanceof FirstTokenTimeoutError) || !this.options.fallbackModel) throw error;
      console.warn(`Primary model produced no first output; retrying once with ${this.options.fallbackModel}.`);
      return this.requestStreamingCompletion(
        messages,
        allowTools,
        this.options.fallbackBaseUrl || this.options.baseUrl,
        this.options.fallbackModel,
        "fallback",
        telemetryContext ? {
          ...telemetryContext,
          requestSequence: telemetryContext.nextRequestSequence(),
        } : undefined,
        tools,
        responseContract,
      );
    }
  }

  private flushCompletionTelemetry(
    events: OpenRouterCompletionTelemetry[],
    purpose: ModelUsagePurpose
  ): void {
    for (const event of events) {
      event.purpose = purpose;
      this.emitCompletionTelemetry(event);
    }
    events.length = 0;
  }

  private emitCompletionTelemetry(event: OpenRouterCompletionTelemetry): void {
    try {
      this.options.onCompletionTelemetry?.(event);
    } catch (error) {
      console.error(
        "lantern.model_usage_callback_failed "
        + (error instanceof Error ? error.message : "unknown error")
      );
    }
  }

  private async requestStreamingCompletion(
    messages: ChatMessage[],
    allowTools: boolean,
    baseUrl: string,
    model: string,
    selection: "primary" | "fallback",
    telemetryContext?: Omit<CompletionTelemetryContext, "nextRequestSequence"> & { requestSequence: number },
    tools?: readonly EngineToolDefinition[],
    responseContract: CompletionResponseContract = PLANNER_RESPONSE_CONTRACT,
  ): Promise<CompletionMessage> {
    const startedAt = Date.now();
    let firstOutputAt: number | null = null;
    let failureReason: OpenRouterCompletionTelemetry["failureReason"] = null;
    let completionUsage: NormalizedCompletionUsage | undefined;
    let providerRequestId: string | null = null;
    let resolvedModel: string | null = null;
    let finishReason: string | null = null;
    let toolCallCount: number | null = null;
    const client = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: baseUrl,
      maxRetries: 0,
      defaultHeaders: {
        ...(this.options.siteUrl ? { "HTTP-Referer": this.options.siteUrl } : {}),
        "X-OpenRouter-Title": this.options.appName,
      },
    });
    let firstOutput = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: ReturnType<typeof client.chat.completions.stream> | undefined;
    const markFirstOutput = (): void => {
      if (firstOutput) return;
      firstOutput = true;
      firstOutputAt = Date.now() - startedAt;
      if (timer) clearTimeout(timer);
    };

    try {
      stream = client.chat.completions.stream({
        model,
        reasoning_effort: this.options.reasoningEffort,
        max_tokens: this.options.maxTokens,
        stream_options: { include_usage: true },
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: responseContract.name,
            strict: true,
            schema: responseContract.schema,
          },
        },
        ...(allowTools
          ? {
              tool_choice: "auto",
              tools,
            }
          : { tool_choice: "none" }),
        messages,
      } as never);
      stream.on("chunk", (chunk) => {
        const chunkRecord = chunk as unknown as Record<string, unknown>;
        if (typeof chunkRecord.id === "string") providerRequestId ??= chunkRecord.id;
        if (typeof chunkRecord.model === "string") resolvedModel ??= chunkRecord.model;
        if (chunkRecord.usage) completionUsage = normalizeCompletionUsage(chunkRecord.usage);
        const delta = chunk.choices[0]?.delta;
        if (delta?.content || delta?.tool_calls?.length) markFirstOutput();
        if (delta?.tool_calls?.length) toolCallCount = Math.max(toolCallCount ?? 0, delta.tool_calls.length);
        const chunkFinishReason = chunk.choices[0]?.finish_reason;
        if (typeof chunkFinishReason === "string") finishReason = chunkFinishReason;
      });
      stream.on("content", (delta) => {
        if (delta) markFirstOutput();
      });
      stream.on("tool_calls.function.arguments.delta", (delta) => {
        if (delta.arguments_delta || delta.name) markFirstOutput();
      });
      const timeoutMs = Math.max(0, Math.trunc(this.options.firstTokenTimeoutMs ?? 8_000));
      timer = timeoutMs > 0
        ? setTimeout(() => {
            if (firstOutput || !stream) return;
            timedOut = true;
            stream.abort();
          }, timeoutMs)
        : undefined;

      const completion = await stream.finalChatCompletion();
      const completionRecord = completion as unknown as Record<string, unknown>;
      if (typeof completionRecord.id === "string") providerRequestId = completionRecord.id;
      if (typeof completionRecord.model === "string") resolvedModel = completionRecord.model;
      if (completionRecord.usage) completionUsage = normalizeCompletionUsage(completionRecord.usage);
      const message = completion.choices[0]?.message;
      if (!message) {
        failureReason = "invalid_response";
        throw new Error("OpenRouter returned no message.");
      }
      if (typeof completion.choices[0]?.finish_reason === "string") {
        finishReason = completion.choices[0].finish_reason;
      }
      if (Array.isArray(message.tool_calls)) toolCallCount = message.tool_calls.length;
      return {
        role: "assistant",
        content: typeof message.content === "string" ? message.content : null,
        tool_calls: message.tool_calls
          ?.filter((toolCall) => toolCall.type === "function")
          .map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          })),
      };
    } catch (error) {
      if (timedOut) {
        failureReason = "ttft_timeout";
        throw new FirstTokenTimeoutError(Math.max(0, Math.trunc(this.options.firstTokenTimeoutMs ?? 8_000)));
      }
      failureReason ??= firstOutput ? "stream_error_after_output" : "provider_error_before_output";
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      const telemetry: OpenRouterCompletionTelemetry = {
        provider: "openrouter",
        selection,
        model,
        ttftMs: firstOutputAt,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: failureReason ? "failed" : "completed",
        failureReason,
        inputTokens: completionUsage?.inputTokens ?? null,
        cachedInputTokens: completionUsage?.cachedInputTokens ?? null,
        reasoningTokens: completionUsage?.reasoningTokens ?? null,
        outputTokens: completionUsage?.outputTokens ?? null,
        totalTokens: completionUsage?.totalTokens ?? null,
        providerRequestId,
        resolvedModel,
        providerRoute: providerRouteFor(baseUrl),
        costMicrousd: completionUsage?.costMicrousd ?? null,
        costSource: completionUsage?.costMicrousd === null || completionUsage?.costMicrousd === undefined
          ? "unavailable"
          : "provider_reported",
        status: completionStatus(failureReason),
        finishReason,
        toolCallCount,
        ...(telemetryContext ? {
          accountId: telemetryContext.accountId,
          campaignId: telemetryContext.campaignId,
          actorId: telemetryContext.actorId,
          requestId: telemetryContext.requestId,
          clientCommandId: telemetryContext.clientCommandId,
          dmRunId: telemetryContext.dmRunId,
          requestSequence: telemetryContext.requestSequence,
          purpose: telemetryContext.purpose,
          toolsEnabled: telemetryContext.toolsEnabled,
        } : {}),
        createdAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
      };
      if (telemetryContext?.telemetryEvents) {
        telemetryContext.telemetryEvents.push(telemetry);
      } else {
        this.emitCompletionTelemetry(telemetry);
      }
    }
  }
}

function normalizeCompletionUsage(value: unknown): NormalizedCompletionUsage {
  const usage = asRecord(value);
  const inputTokens = nonnegativeIntegerOrNull(usage?.prompt_tokens);
  const outputTokens = nonnegativeIntegerOrNull(usage?.completion_tokens);
  const totalTokens = nonnegativeIntegerOrNull(usage?.total_tokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const directCostMicrousd = numberOrNull(usage?.cost_microusd ?? usage?.costMicroUsd);
  const costUsd = numberOrNull(usage?.cost);
  return {
    inputTokens,
    cachedInputTokens: nonnegativeIntegerOrNull(promptDetails?.cached_tokens),
    reasoningTokens: nonnegativeIntegerOrNull(completionDetails?.reasoning_tokens),
    outputTokens,
    totalTokens,
    costMicrousd: directCostMicrousd !== null
      ? Math.max(0, Math.trunc(directCostMicrousd))
      : costUsd === null ? null : Math.round(Math.max(0, costUsd) * 1_000_000),
  };
}

function completionStatus(failureReason: OpenRouterCompletionTelemetry["failureReason"]): ModelUsageStatus {
  if (!failureReason) return "success";
  if (failureReason === "ttft_timeout") return "timeout_before_output";
  if (failureReason === "stream_error_after_output") return "interrupted_after_output";
  if (failureReason === "invalid_response") return "invalid_response";
  return "provider_error";
}

function providerRouteFor(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname || null;
  } catch (_error) {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function nonnegativeIntegerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number === null ? null : Math.max(0, Math.trunc(number));
}

type NarrationValidation =
  | { success: true; data: NarrationEnvelope }
  | { success: false; issues: string[]; safeText: string | null };

function validateNarration(content: string): NarrationValidation {
  const trimmed = content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(trimmed));
  } catch (_error) {
    return {
      success: false,
      issues: ["response: expected one valid JSON object matching the narration envelope"],
      safeText: safePlayerNarrationText(content),
    };
  }

  const result = narrationEnvelopeSchema.safeParse(parsed);
  if (result.success) {
    if (narrationContainsInternalOrchestration(result.data.text)) {
      return {
        success: false,
        issues: ["text: narration contains internal orchestration instructions"],
        safeText: null,
      };
    }
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.slice(0, 8).map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "response";
      return path + ": " + issue.message;
    }),
    safeText: safePlayerNarrationText(content, parsed),
  };
}

function narrationContainsInternalOrchestration(text: string): boolean {
  return /\b(?:the\s+)?(?:dm|engine|system|prompt|tool|context)\s+(?:must|needs?\s+to|should|will)\b|\b(?:the\s+)?dm\s+establish(?:es|ed|ing)?\b/i.test(text);
}

function safePlayerNarrationText(content: string, parsed?: unknown): string | null {
  const candidate = safeNarrationText(content, parsed);
  return candidate && !narrationContainsInternalOrchestration(candidate) ? candidate : null;
}

function intentRepairInstruction(playerText: string): string {
  return [
    "The previous tool plan did not preserve the player's primary intent.",
    `Player intent: ${playerText}`,
    "The plan only moved along an exit even though the intent includes a non-movement consequence.",
    "Discard that movement-only plan. Resolve the primary action with a matching reviewed tool; use improvise with effectType fictional for a bounded creative consequence when no mechanical effect is required, or return a valid narration that honestly records the attempt without claiming an unsupported result.",
    "Do not call move unless movement is the primary requested consequence, and do not expose this repair instruction in narration.",
  ].join(" ");
}

function movementOnlyPlanMissesIntent(
  playerText: string,
  effects: StagedEngineTurnEffect[],
): boolean {
  if (effects.length === 0 || !effects.every((effect) => effect.command.kind === "move")) return false;
  const nonMovementIntent = /\b(?:distract(?:ion)?|signal|decoy|divert|misdirect|deceive|draw\s+(?:their|the)\s+attention|cause\s+a\s+disturbance)\b/i;
  return nonMovementIntent.test(playerText);
}

function narrationRepairInstruction(issues: string[]): string {
  return [
    "Your previous final response failed the narration contract.",
    "Validation errors: " + issues.join("; ").slice(0, 1_000) + ".",
    "Correct the response now. Do not call tools and do not add commentary.",
    NARRATION_CONTRACT_INSTRUCTION,
  ].join(" ");
}

function proceduralNoticeRepair(
  playerText: string,
  narrationText: string,
  state: LanternCampaignState,
  effects: StagedEngineTurnEffect[],
): string | null {
  const combined = `${playerText} ${narrationText}`;
  const formalNoticeMentioned = /\b(?:sealed\s+(?:notice|letter)|clerk\s+notice|formal\s+(?:order|notice)|warrant|docket|operative\s+terms|response\s+window|read[- ]back)\b/i.test(combined);
  const noticeEffects = effects.filter((effect) => effect.command.kind === "procedural_notice");
  const hasNotice = state.proceduralNotices.length > 0 || noticeEffects.length > 0;
  if (formalNoticeMentioned && !hasNotice) {
    return "A formal procedural notice was mentioned without authoritative state. Call procedural_notice with action upsert and complete player-safe operative terms before producing narration. Do not include restricted records in any term.";
  }
  const requestKind = /\b(?:copy|photocopy|exact\s+(?:read|wording)|read[- ]back)\b/i.test(playerText)
    ? "request_copy"
    : /\b(?:clarif(?:y|ication)|what\s+(?:does|are)|which\s+facts|what\s+can\s+I\s+respond)\b/i.test(playerText)
      ? "request_clarification"
      : null;
  const delivered = state.proceduralNotices.some((notice) => notice.status === "delivered" || notice.status === "resolved");
  if (requestKind && delivered && !noticeEffects.some((effect) => effect.command.kind === "procedural_notice" && effect.command.action === requestKind)) {
    return `The player requested a ${requestKind === "request_copy" ? "copy/read-back" : "clarification"} of an already delivered notice. Call procedural_notice with ${requestKind} and the existing noticeId before narrating; a denied request must still return the typed operative projection.`;
  }
  return null;
}

type ObjectTurnIntent = {
  kind: "held-transfer" | "object-action";
  objectId?: string;
};

type SearchTurnIntent = {
  kind: "broad-search";
};

function detectSearchTurnIntent(playerText: string): SearchTurnIntent | null {
  if (
    /\b(?:search|scour|rummage|investigate)\b/i.test(playerText)
    || /\blook\s+(?:for|through)\b/i.test(playerText)
    || /\b(?:find|seek)\s+(?:a|any|some|another|something|way)\b/i.test(playerText)
  ) {
    return { kind: "broad-search" };
  }
  return null;
}

const SEARCH_DISCOVERY_VERB = /\b(?:finds?|found|discovers?|uncover(?:s|ed)?|locate(?:s|d)?|spots?|reveals?|turns?\s+up|there\s+(?:is|are)|lies|rests|holds|sits|stands|waits)\b/i;
const SEARCH_NEGATION = /\b(?:no|nothing|none|without|empty|not)\b/i;
const SEARCH_ENTITY_CLAUSE_START = /^(?:(?:with|including|alongside|beside|near|plus)\s+)?(?:a|an|the|some|another|one|two|three|any)\b/i;

function searchNarrationDiscoveryClauses(text: string): string[] {
  const claims: string[] = [];
  for (const sentence of text.split(/[.!?]+/)) {
    let discoveryContext = false;
    const parts = sentence.split(/\s*(?:,|;|:|\b(?:but|however|though|yet|and|or)\b)\s*/i);
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;
      const hasDiscoveryVerb = SEARCH_DISCOVERY_VERB.test(part);
      const negative = SEARCH_NEGATION.test(part);
      if (hasDiscoveryVerb && !negative) {
        claims.push(part);
        discoveryContext = true;
        continue;
      }
      if (hasDiscoveryVerb && negative) {
        discoveryContext = false;
        continue;
      }
      if (discoveryContext && !negative && SEARCH_ENTITY_CLAUSE_START.test(part)) {
        claims.push(part);
      }
    }
  }
  return claims;
}

function searchAliasMatches(value: string, aliases: string[]): boolean {
  const normalized = value.toLocaleLowerCase().replace(/[-_]+/g, " ");
  return aliases.some((alias) => {
    const phrase = alias.toLocaleLowerCase().replace(/[-_]+/g, " ").trim();
    return phrase.length >= 3 && normalized.includes(phrase);
  });
}

function searchTurnAuthorizedAliases(
  initialState: LanternCampaignState,
  state: LanternCampaignState,
  effects: StagedEngineTurnEffect[],
): string[] {
  const initialWorld = initialState.worldContext;
  const currentWorld = state.worldContext;
  const aliases = [
    ...(initialWorld?.features ?? []),
    ...(initialWorld?.exits ?? []).flatMap((exit) => [exit.id, exit.label]),
    ...(initialWorld?.npcs ?? []).flatMap((npc) => [npc.id, npc.name]),
    ...(initialState.worldFacts ?? []).filter((fact) => fact.active && fact.visibility === "public").flatMap((fact) => [fact.id, fact.title]),
    ...(initialWorld?.objects ?? []).flatMap((object) => [object.id, object.definition.name, ...object.definition.tags]),
  ];
  const initialObjectIds = new Set((initialWorld?.objects ?? []).map((object) => object.id));
  for (const object of currentWorld?.objects ?? []) {
    if (initialObjectIds.has(object.id) || effects.some((effect) =>
      effect.command.kind === "world_context" && (effect.command.objects?.upsert ?? []).some((input) => input.id === object.id)
    )) {
      aliases.push(object.id, object.definition.name, ...object.definition.tags);
    }
  }
  for (const effect of effects) {
    if (effect.command.kind === "content_compile" && effect.command.materialization) {
      const data = effect.resolution.data;
      const worldObject = data && typeof data === "object" && !Array.isArray(data)
        ? (data as { worldObject?: unknown }).worldObject
        : null;
      if (worldObject && typeof worldObject === "object" && !Array.isArray(worldObject)) {
        const record = worldObject as { id?: unknown; definition?: { name?: unknown; tags?: unknown } };
        if (typeof record.id === "string") aliases.push(record.id);
        if (typeof record.definition?.name === "string") aliases.push(record.definition.name);
        if (Array.isArray(record.definition?.tags)) {
          aliases.push(...record.definition.tags.filter((tag): tag is string => typeof tag === "string"));
        }
      }
    }
    if (effect.command.kind === "challenge_attempt") {
      const data = effect.resolution.data;
      if (data && typeof data === "object" && !Array.isArray(data) && "discovery" in data) {
        const discovery = (data as { discovery?: Record<string, unknown> }).discovery;
        if (discovery) {
          for (const key of ["factId", "title", "description"]) {
            if (typeof discovery[key] === "string") aliases.push(discovery[key]);
          }
        }
      }
    }
    if (effect.command.kind === "loot") {
      for (const item of effect.command.items) {
        const record = item as unknown as Record<string, unknown>;
        for (const key of ["id", "name"]) {
          if (typeof record[key] === "string") aliases.push(record[key]);
        }
        const definition = record.authoredDefinition;
        if (definition && typeof definition === "object" && !Array.isArray(definition)) {
          if (typeof (definition as Record<string, unknown>).name === "string") aliases.push((definition as Record<string, unknown>).name as string);
        }
      }
    }
  }
  return aliases;
}

function searchMaterializationAuthorized(
  initialState: LanternCampaignState,
  effects: StagedEngineTurnEffect[],
  command: Extract<EngineCommand, { kind: "content_compile" }>,
): boolean {
  if (!command.materialization || command.proposal?.kind !== "item") return true;
  const aliases = [command.proposal.key ?? "", command.proposal.name].filter(Boolean);
  for (const value of [...aliases]) {
    const tokens = value.toLocaleLowerCase("en-US").replace(/[-_]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 1) aliases.push(tokens.slice(-2).join(" "));
    const noun = tokens.at(-1);
    if (noun && noun.length >= 3) aliases.push(noun);
  }
  const evidence = command.materialization.evidence;
  let text: string | null = null;
  if (evidence.kind === "released_narration") {
    text = initialState.log.find((entry) => entry.id === evidence.ref && entry.kind === "narration")?.text ?? null;
  } else if (evidence.kind === "world_context") {
    const world = initialState.worldContext;
    if (world?.id === evidence.ref) text = [world.title, world.description, ...world.features].join(" ");
  } else {
    const initialFact = actorKnowledgeProjection(initialState.actorId, initialState).facts.find((fact) =>
      fact.id === evidence.ref
      && fact.sceneId === initialState.worldContext?.id
    );
    if (initialFact) {
      text = [initialFact.title, initialFact.description].join(" ");
    } else {
      const discoveryEffect = effects.find((effect) => {
        if (effect.command.kind !== "challenge_attempt") return false;
        const data = effect.resolution.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) return false;
        const discovery = (data as { discovery?: { factId?: unknown } }).discovery;
        return discovery?.factId === evidence.ref;
      });
      const discoveredFact = discoveryEffect
        ? actorKnowledgeProjection(initialState.actorId, discoveryEffect.resolution.state).facts.find((fact) =>
            fact.id === evidence.ref
            && fact.sceneId === initialState.worldContext?.id
          )
        : null;
      if (discoveredFact) text = [discoveredFact.title, discoveredFact.description].join(" ");
    }
  }
  return Boolean(text && searchAliasMatches(text, aliases));
}

function searchTurnHasTypedDiscovery(
  initialState: LanternCampaignState,
  state: LanternCampaignState,
  effects: StagedEngineTurnEffect[],
  narration: string,
): boolean {
  const claims = searchNarrationDiscoveryClauses(narration);
  if (claims.length === 0) return true;
  const aliases = searchTurnAuthorizedAliases(initialState, state, effects);
  return claims.every((claim) => searchAliasMatches(claim, aliases));
}

function searchTurnRepair(
  intent: SearchTurnIntent,
  initialState: LanternCampaignState,
  narration: string,
  state: LanternCampaignState,
  effects: StagedEngineTurnEffect[],
): string | null {
  if (intent.kind !== "broad-search" || searchTurnHasTypedDiscovery(initialState, state, effects, narration)) return null;
  return [
    "The previous broad-search narration claimed a specific discovery without an accepted typed discovery.",
    "Do not guarantee an item merely because the player named a category.",
    "If a mundane item was established before this search, call content_compile with its stable definition key, stable instanceKey, and the exact released_narration, world_context, or world_fact materialization evidence ref before narrating it.",
    "Otherwise return valid narration saying that the search did not reveal a specific authorized item. Do not name a new cloak, bundle, weapon, disguise, supplies, hatch, escape route, or other reward.",
  ].join(" ");
}

function objectReferenceMatches(value: string, aliases: string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return aliases.some((alias) => {
    const phrase = alias.toLocaleLowerCase().replace(/[-_]+/g, " ").trim();
    if (phrase.length >= 3 && normalized.includes(phrase)) return true;
    return phrase.split(/\s+/).some((token) => token.length >= 4 && normalized.includes(token));
  });
}

function detectObjectTurnIntent(state: LanternCampaignState, playerText: string): ObjectTurnIntent | null {
  const world = state.worldContext;
  if (!world) return null;
  const transferVerb = /\b(seize|snatch|grab|wrench|steal|take|carry|pick\s+up|pocket|claim|secure)\b/i.test(playerText);
  const actionVerb = /\b(use|unlock|open|close|lock|force|shoulder|ram|lockpick|pick\s+(?:the\s+)?lock|equip|drop|throw|move|ignite|extinguish|break|damage|attach|activate)\b/i.test(playerText);
  if (!transferVerb && !actionVerb) return null;

  for (const object of world.objects) {
    const aliases = [object.id, object.definition.name, ...object.definition.tags];
    if (!objectReferenceMatches(playerText, aliases)) continue;
    const holder = object.locationRef && world.npcs.some((npc) => npc.id === object.locationRef);
    if (transferVerb && holder && object.ownerRef.kind !== "actor") {
      return { kind: "held-transfer", objectId: object.id };
    }
    return { kind: "object-action", objectId: object.id };
  }

  if (!transferVerb) return null;
  const npcMentioned = world.npcs.some((npc) => objectReferenceMatches(playerText, [npc.id, npc.name]));
  const holderLanguage = /\b(from|away|off|grip|belt|hands?|held|loosened|before\s+.+\s+react)\b/i.test(playerText);
  const evidenceTokens = new Set(
    [world.description, ...world.features, ...state.log.slice(-12).map((entry) => entry.text)]
      .join(" ").toLocaleLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4)
  );
  const sharedEvidence = playerText.toLocaleLowerCase().split(/[^a-z0-9]+/).some((token) => token.length >= 4 && evidenceTokens.has(token));
  return npcMentioned && holderLanguage && sharedEvidence ? { kind: "held-transfer" } : null;
}

function heldContest(effect: StagedEngineTurnEffect): { outcome: string; targetId: string | null } | null {
  if (effect.command.kind !== "challenge_attempt" || effect.command.challengeId !== "seize-held-object-v1") return null;
  const latest = effect.resolution.state.adjudicationHistory.at(-1);
  return latest ? { outcome: latest.outcome, targetId: effect.command.sceneId?.split(":").at(-1) ?? null } : null;
}

function objectTurnResolved(intent: ObjectTurnIntent, effects: StagedEngineTurnEffect[]): boolean {
  if (intent.kind === "object-action") {
    return effects.some((effect) =>
      (
        effect.command.kind === "interact"
        && (!intent.objectId || effect.command.targetId === intent.objectId || effect.command.sourceId === intent.objectId)
      )
      || (
        effect.command.kind === "challenge_attempt"
        && (effect.command.challengeId === "barred-door-v1" || effect.command.challengeId === "pick-lock-v1")
        && (!intent.objectId || effect.command.targetId === intent.objectId)
      )
    );
  }

  const contest = effects.map(heldContest).find((value) => value !== null);
  if (!contest) return false;
  if (contest.outcome === "failure-with-complication") return true;
  if (contest.outcome !== "success") return false;
  const targetId = intent.objectId ?? contest.targetId;
  return effects.some((effect) =>
    effect.command.kind === "interact"
    && (effect.command.affordance === "take" || effect.command.affordance === "steal")
    && (!targetId || effect.command.targetId === targetId)
  );
}

function objectTurnRepair(intent: ObjectTurnIntent, state: LanternCampaignState, effects: StagedEngineTurnEffect[]): string | null {
  if (objectTurnResolved(intent, effects)) return null;
  if (intent.kind === "held-transfer") {
    return [
      "The previous plan did not complete the player's attempted transfer of an established NPC-held object.",
      "Continue with tools before narration; do not claim possession in prose.",
      "If the item is present in recentLog, the current context, or an actor-safe fact but absent from worldContext.objects, call content_compile with a strict mundane item proposal, stable key and instanceKey, the exact materialization evidence ref, and the established holder as holderRef. Use the returned worldObject id for every later call.",
      "Then call challenge_attempt with challengeId seize-held-object-v1, the established holder as opponentId, and sceneId exactly worldContext.id + ':' + targetId.",
      "If the contest succeeds, immediately call interact with that same targetId and affordance take or steal. If it fails, do not call interact; preserve the holder's ownership and narrate that outcome.",
      `Current authoritative context: ${state.worldContext?.id ?? "none"}.`,
    ].join(" ");
  }
  return [
    "The previous response did not resolve the player's use of an authoritative object.",
    "Continue with tools before narration; do not substitute a generic no-check or prose-only consequence.",
    "Use the exact object id from worldContext.objects. For a locked object, call challenge_attempt with barred-door-v1 and targetId to force it, or pick-lock-v1 and targetId to use Thieves' Tools; a generic roll_check cannot change the object. For an automatic affordance, call interact. If a mundane target is publicly established but missing, materialize it with content_compile first.",
  ].join(" ");
}

function safeNarrationText(content: string, parsed?: unknown): string | null {
  const trimmed = stripJsonFence(content.trim());
  let candidate = parsed;
  if (candidate === undefined) {
    try {
      candidate = JSON.parse(trimmed);
    } catch (_error) {
      candidate = undefined;
    }
  }
  if (typeof candidate === "string") {
    const decoded = candidate.trim();
    return decoded ? decoded.slice(0, 6_000) : null;
  }
  if (candidate !== undefined && (candidate === null || typeof candidate !== "object")) {
    return null;
  }
  if (candidate && typeof candidate === "object" && "text" in candidate) {
    const text = (candidate as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, 6_000);
    return null;
  }
  if (
    !trimmed
    || /^[\[{]/.test(trimmed)
    || /["']?(?:text|proposedFacts|suggestedActions)["']?\s*:/.test(trimmed)
  ) {
    return null;
  }
  return trimmed.slice(0, 6_000);
}

function rulesNarration(text: string, suffix?: string): NarrationEnvelope {
  return {
    text: suffix ? text + " " + suffix : text,
    proposedFacts: [],
    suggestedActions: [],
  };
}

function committedCheckText(data: unknown, scene?: string): string | null {
  if (data === null || typeof data !== "object" || typeof (data as { success?: unknown }).success !== "boolean") {
    return null;
  }
  const check = data as {
    success: boolean;
    goal?: unknown;
    attribution?: EngineSocialCheckAttribution;
    objectTransition?: {
      objectName?: unknown;
      beforeState?: unknown;
      afterState?: unknown;
    };
  };
  const goal = typeof check.goal === "string" ? check.goal.trim().replace(/[.!?]+$/, "") : "";
  const outcome = check.success ? "The attempt succeeds" : "The attempt falls short";
  const location = scene ? " in " + scene : "";
  const purpose = goal ? ": " + goal : "";
  const attribution = check.attribution?.mode === "npc-mediated"
    ? mediatedCheckAttributionText(check.attribution) + " "
    : "";
  const transition = check.success
    && typeof check.objectTransition?.objectName === "string"
    && typeof check.objectTransition.afterState === "string"
      ? " " + check.objectTransition.objectName + " is now " + check.objectTransition.afterState + "."
      : "";
  return attribution + outcome + location + purpose + "." + transition;
}

function mediatedCheckAttributionText(attribution: EngineSocialCheckAttribution): string {
  return `${attribution.actingActorName} acts for ${attribution.rollingActorName} toward ${attribution.targetName}; the check uses ${attribution.modifierSourceActorName}'s modifiers.`;
}

function mediatedCheckAttributions(result: EngineCommandResult): EngineSocialCheckAttribution[] {
  const effectAttributions = result.event?.effects
    ?.map((effect) => effect.check?.attribution)
    .filter((attribution): attribution is EngineSocialCheckAttribution => attribution?.mode === "npc-mediated")
    ?? [];
  if (effectAttributions.length > 0) return effectAttributions;
  return result.event?.check?.attribution?.mode === "npc-mediated"
    ? [result.event.check.attribution]
    : [];
}

function narrationContradictsMediatedCheck(text: string, attribution: EngineSocialCheckAttribution): boolean {
  const actor = attribution.actingActorName.trim().toLocaleLowerCase("en-US").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const actorBoundary = `(?<![\\p{L}\\p{N}_])${actor}(?![\\p{L}\\p{N}_])`;
  const normalized = text.toLocaleLowerCase("en-US");
  const actorClaim = new RegExp(`${actorBoundary}[^.!?]{0,80}\\b(?:rolled|rolls|rolling|made|makes|attempted|attempts|performed|performs|got|gets|scored|scores|achieved|achieves|totaled|totals)\\b[^.!?]{0,60}\\b(?:check|roll|score|result|total)\\b`, "iu");
  const numericScoreClaim = new RegExp(`${actorBoundary}[^.!?]{0,40}\\b(?:got|gets|scored|scores|achieved|achieves|totaled|totals)\\b[^.!?]{0,20}\\b\\d+(?:\\.\\d+)?\\b`, "iu");
  const possessiveClaim = new RegExp(`${actorBoundary}(?:['’]s)(?![\\p{L}\\p{N}_])[^.!?]{0,80}\\b(?:check|roll|modifier)\\b`, "iu");
  const pronounModifierClaim = new RegExp(`${actorBoundary}[^.!?]{0,80}\\b(?:uses?|used|using|has|gets?|takes?)\\b[^.!?]{0,40}\\b(?:his|her|their)\\b[^.!?]{0,20}\\bmodifiers?\\b`, "iu");
  return actorClaim.test(normalized)
    || numericScoreClaim.test(normalized)
    || possessiveClaim.test(normalized)
    || pronounModifierClaim.test(normalized);
}

function appendMissingMediatedAttributions(
  narration: NarrationEnvelope,
  attributions: EngineSocialCheckAttribution[],
  requireAuthoritativeLabel: boolean,
): NarrationEnvelope {
  const missing = attributions
    .map((attribution) => {
      const text = mediatedCheckAttributionText(attribution);
      const marker = "Authoritative check record: " + text;
      const present = requireAuthoritativeLabel ? narration.text.includes(marker) : narration.text.includes(text);
      return present ? null : attribution;
    })
    .filter((attribution): attribution is EngineSocialCheckAttribution => attribution !== null);
  if (missing.length === 0) return narration;
  const fullSuffix = missing
    .map((attribution) => "Authoritative check record: " + mediatedCheckAttributionText(attribution))
    .join("\n\n");
  const compactSuffix = missing
    .map((attribution, index) => `Authoritative mediated check ${index + 1}: ${compactActorName(attribution.actingActorName)} acts for ${compactActorName(attribution.rollingActorName)} toward ${compactActorName(attribution.targetName)}; modifiers: ${compactActorName(attribution.modifierSourceActorName)}.`)
    .join("\n");
  const suffix = fullSuffix.length <= 6_000 ? fullSuffix : compactSuffix.length <= 6_000
    ? compactSuffix
    : `Authoritative mediated checks: ${missing.length} committed checks; the player remained the roller and modifier source for each.`;
  const prefixSeparator = "\n\n";
  const availablePrefixLength = Math.max(0, 6_000 - prefixSeparator.length - suffix.length);
  const prefix = narration.text.trim().slice(0, availablePrefixLength).trimEnd();
  return {
    ...narration,
    text: prefix ? `${prefix}${prefixSeparator}${suffix}` : suffix,
  };
}

function compactActorName(name: string): string {
  const normalized = name.trim();
  return normalized.length <= 48 ? normalized : normalized.slice(0, 45) + "...";
}

function removeMediatedSuggestedActionClaims(
  narration: NarrationEnvelope,
  attributions: EngineSocialCheckAttribution[],
): NarrationEnvelope {
  return {
    ...narration,
    suggestedActions: narration.suggestedActions.filter((action) =>
      !attributions.some((attribution) => suggestedActionContradictsMediatedCheck(`${action.label} ${action.prompt}`, attribution))
    ),
  };
}

function suggestedActionContradictsMediatedCheck(
  text: string,
  attribution: EngineSocialCheckAttribution,
): boolean {
  if (narrationContradictsMediatedCheck(text, attribution)) return true;
  const normalized = text.toLocaleLowerCase("en-US");
  const rollWords = "(?:roll|rolled|rolling|make|made|attempt|attempted|perform|performed)";
  const pronounDirectedRoll = new RegExp(
    `\\b(?:have|let|ask|tell|make|allow)\\s+(?:him|her|them)\\b[^.!?]{0,100}\\b${rollWords}\\b`,
    "iu",
  );
  const rollForPronoun = new RegExp(
    `\\b${rollWords}\\b[^.!?]{0,100}\\b(?:for|as)\\s+(?:him|her|them)\\b`,
    "iu",
  );
  const pronounModifierOwnership = new RegExp(
    `\\b${rollWords}\\b[^.!?]{0,100}\\b(?:his|her|their)\\b[^.!?]{0,30}\\bmodifiers?\\b`,
    "iu",
  );
  return pronounDirectedRoll.test(normalized)
    || rollForPronoun.test(normalized)
    || pronounModifierOwnership.test(normalized);
}

function preserveMediatedCheckAttribution(
  result: EngineCommandResult,
  narration: NarrationEnvelope,
  experienceProfile: LanternCampaignState["experienceProfile"],
): { narration: NarrationEnvelope; source: "llm" | "rules" } {
  const attributions = mediatedCheckAttributions(result);
  const sanitized = sanitizeNarrationForProfile(narration, experienceProfile);
  if (attributions.length === 0) return { narration: sanitized, source: "llm" };
  if (attributions.some((attribution) => narrationContradictsMediatedCheck(sanitized.text, attribution))) {
    const fallback = appendMissingMediatedAttributions(committedRulesNarration(result), attributions, false);
    return {
      narration: sanitizeNarrationForProfile(fallback, experienceProfile),
      source: "rules",
    };
  }
  const completed = appendMissingMediatedAttributions(sanitized, attributions, true);
  return {
    narration: removeMediatedSuggestedActionClaims(
      sanitizeNarrationForProfile(completed, experienceProfile),
      attributions,
    ),
    source: "llm",
  };
}

function committedMoveText(data: unknown): string {
  const exit = data !== null && typeof data === "object"
    ? (data as { exit?: unknown }).exit
    : null;
  const label = exit !== null && typeof exit === "object" && typeof (exit as { label?: unknown }).label === "string"
    ? (exit as { label: string }).label.trim().replace(/[.!?]+$/, "")
    : "";
  return label ? `You continue along the chosen path: ${label}.` : "You continue along the chosen path.";
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return trimmed && !/[.!?]$/.test(trimmed) ? `${trimmed}.` : trimmed;
}

function committedSceneMoveText(effect: EngineTurnEffectEvidence | undefined): string | null {
  if (!effect || effect.command.kind !== "improvise" || !effect.command.sceneMove) return null;
  return [sentence(effect.command.description), sentence(effect.command.sceneMove.nextDecision)]
    .filter(Boolean)
    .join(" ");
}

function committedSituationClueText(effect: EngineTurnEffectEvidence | undefined): string | null {
  if (!effect || effect.command.kind !== "situation_clue_attempt") return null;
  const data = effect.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as { success?: unknown; clueId?: unknown; situation?: unknown };
  if (record.success !== true || typeof record.clueId !== "string" || !record.situation || typeof record.situation !== "object") return null;
  const clues = (record.situation as { clues?: unknown }).clues;
  if (!Array.isArray(clues)) return null;
  const clue = clues.find((candidate) =>
    candidate && typeof candidate === "object" && (candidate as { id?: unknown }).id === record.clueId
  ) as { title?: unknown; finding?: unknown } | undefined;
  if (!clue || typeof clue.finding !== "string" || !clue.finding.trim()) return null;
  const title = typeof clue.title === "string" && clue.title.trim() ? `${clue.title.trim()}: ` : "";
  return `${title}${sentence(clue.finding)} What do you do with that discovery?`;
}

function committedDeclarationText(result: EngineCommandResult): string {
  const worldContext = result.state.worldContext;
  if (!worldContext) return "You put your plan into motion. What do you do next?";
  const title = worldContext.title.trim().replace(/[.!?]+$/, "");
  const description = worldContext.description.trim();
  const detail = description ? `${description}${/[.!?]$/.test(description) ? "" : "."}` : "";
  const paths = worldContext.exits
    .slice(0, 3)
    .map((exit) => exit.label.trim().replace(/[.!?]+$/, ""));
  const nextChoice = paths.length > 0 ? `Paths onward: ${paths.join("; ")}.` : "What do you do next?";
  return [`You put your plan into motion in ${title}.`, detail, nextChoice].filter(Boolean).join(" ");
}

function committedRulesNarration(result: EngineCommandResult): NarrationEnvelope {
  const effects = result.event?.effects ?? [];
  if (effects.length === 0 && result.event?.command.kind === "declare") {
    return rulesNarration(committedDeclarationText(result));
  }
  const worldContext = effects.some((effect) => effect.command.kind === "world_context")
    ? result.state.worldContext
    : null;
  if (worldContext) {
    const title = worldContext.title.trim().replace(/[.!?]+$/, "");
    const description = worldContext.description.trim();
    const entersContext = effects.some((effect) =>
      effect.command.kind === "world_context"
      && effect.stateChanges.some((change) => change.path === "/worldContext/id" || change.path === "/worldContext/title")
    );
    const scene = `${entersContext ? `You reach ${title}.` : `${title}:`} ${description}${/[.!?]$/.test(description) ? "" : "."}`;
    const paths = worldContext.exits
      .slice(0, 3)
      .map((exit) => exit.label.trim().replace(/[.!?]+$/, ""));
    const lastWorldContextIndex = effects.reduce(
      (last, effect, index) => effect.command.kind === "world_context" ? index : last,
      -1
    );
    const hasTrailingMove = effects.some(
      (effect, index) => effect.command.kind === "move" && index > lastWorldContextIndex
    );
    const otherOutcomes = effects
      .map((effect, index) => {
        if (effect.command.kind === "world_context") return "";
        if (effect.command.kind === "move") {
          return index < lastWorldContextIndex ? "" : committedMoveText(effect.data);
        }
        const sceneMove = committedSceneMoveText(effect);
        if (sceneMove) return sceneMove;
        const clue = committedSituationClueText(effect);
        if (clue) return clue;
        return committedCheckText(effect.check ? effect.data : null) ?? effect.outcome.trim();
      })
      .filter(Boolean);
    const nextChoice = !hasTrailingMove && paths.length > 0
      ? `Paths onward: ${paths.join("; ")}.`
      : "What do you do next?";
    return rulesNarration(
      scene,
      [...otherOutcomes, nextChoice].join(" ")
    );
  }
  const sceneMove = [...effects].reverse().map(committedSceneMoveText).find(Boolean);
  if (sceneMove) return rulesNarration(sceneMove);
  const clue = effects.map(committedSituationClueText).find(Boolean);
  if (clue) return rulesNarration(clue);
  const moves = effects.filter((effect) => effect.command.kind === "move");
  if (moves.length > 0) {
    return rulesNarration(committedMoveText(moves.at(-1)?.data));
  }
  const checkData = effects.length === 1 && effects[0]?.check
    ? effects[0].data
    : effects.length === 0 && result.event?.check
      ? result.data
      : null;
  const scene = result.state.worldContext?.title.trim();
  const checkText = committedCheckText(checkData, scene);
  if (checkText) return rulesNarration(checkText);

  const authoritative = result.message.trim() || "The action changes the situation.";
  return rulesNarration(scene ? `${authoritative} The situation in ${scene} now reflects that result.` : authoritative);
}

function stripJsonFence(content: string): string {
  const fence = String.fromCharCode(96).repeat(3);
  if (!content.startsWith(fence)) return content;
  return content
    .replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp("\\s*" + fence + "$"), "")
    .trim();
}

function fallbackCommand(
  state: LanternCampaignState,
  playerText: string
): { command: EngineCommand; tool: EngineToolName | "listen" | "declare" } {
  const text = playerText.toLowerCase();
  if (state.combat.status === "active") {
    if (hasActiveCondition(state.effects, state.character.id, "unconscious")) return { command: { kind: "death_save" }, tool: "death_save" };
    if (/\b(advance|end turn|wait|pass)\b/.test(text)) return { command: { kind: "advance_turn" }, tool: "advance_turn" };
    if (/\b(dodge|defend|guard)\b/.test(text)) return { command: { kind: "combat_action", action: "dodge" }, tool: "combat_action" };
    if (/\b(dash|run)\b/.test(text)) return { command: { kind: "combat_action", action: "dash" }, tool: "combat_action" };
    return { command: { kind: "combat_action", action: "attack" }, tool: "combat_action" };
  }
  if (/\b(rest|sleep|camp)\b/.test(text)) return { command: { kind: "rest", restType: "long" }, tool: "rest" };
  if (/\b(search|scour|rummage|investigate)\b/.test(text) || /\blook\s+(?:for|through)\b/.test(text)) {
    return { command: { kind: "declare", goal: playerText }, tool: "declare" };
  }
  if (/\b(loot|take|claim)\b/.test(text)) return { command: { kind: "loot", items: [], rewardXp: 0, rewardCopper: 0 }, tool: "loot" };
  if (/\b(use|drink|consume)\b.*\b(potion|draught|ration)\b/.test(text)) {
    const itemId = state.character.inventory.find((item) => {
      const view = materializeInventoryItem(item);
      return view.kind === "consumable" && Boolean(view.healing);
    })?.id ?? "healing-draught";
    return { command: { kind: "use_item", itemId }, tool: "use_item" };
  }
  if (state.worldContext && /\b(follow|continue|head|travel|move|go|leave|enter)\b/.test(text)) {
    const exit = state.worldContext.exits[0];
    if (exit) return { command: { kind: "move", destinationId: exit.id }, tool: "move" };
  }
  if (/\b(listen|hear)\b/.test(text)) return { command: { kind: "listen" }, tool: "listen" };
  if (/\b(look|observe|describe|room|surroundings|see)\b/.test(text)) return { command: { kind: "observe" }, tool: "observe" };
  if (/\b(inspect|study|check)\b/.test(text)) {
    return { command: { kind: "declare", goal: playerText }, tool: "declare" };
  }
  return { command: { kind: "declare", goal: playerText }, tool: "declare" };
}
