import { createHash, randomInt, randomUUID } from "node:crypto";
import type { NarrationEnvelope } from "./ai-contracts.js";
import {
  engineFailurePressureSchema,
  engineExperienceProfileInputSchema,
  engineExperienceProfileSchema,
  engineProceduralNoticeSchema,
  engineQuestGraphInputSchema,
  engineWorldObjectInputSchema,
  engineWorldObjectMaterializationSchema,
} from "./engine-contracts.js";
import type {
  CompiledCreatureAttack,
  CompiledEffectProgram,
  CompiledSpellEffect,
  NormalizedSpell,
} from "./content/schema.js";
import { loadRulesKernelForPackHash } from "./content/rules-kernel.js";
import type {
  EngineAbility,
  EngineAdjudicationAttempt,
  EngineAdjudicationCosts,
  EngineAdjudicationDecision,
  EngineAdjudicationDifficultyBand,
  EngineAdjudicationOutcome,
  EngineAdjudicationStake,
  EngineAdvancementPolicy,
  EngineAdvancementPreview,
  EngineCampaignProfile,
  EngineCampaignPhase,
  EngineCharacterCreationState,
  EngineCharacterDetails,
  EngineCharacter,
  EngineCharacterFeatureView,
  EngineCharacterSourceDetailsView,
  EngineCharacterView,
  EngineCustodyStatus,
  EngineActionOffer,
  EngineActionOfferCost,
  EngineActionOfferTiming,
  EngineCorpse,
  EngineDeathRecord,
  EngineLifecycleState,
  EngineCampaignBeat,
  EngineCommand,
  EngineChallengeAttemptCommand,
  EngineCombatant,
  EngineCombatantProgression,
  EngineCombatantView,
  EngineCurrencyBreakdown,
  EngineCombat,
  EngineCombatView,
  EngineCheckEvidence,
  EngineSocialCheckAttribution,
  EngineKnowledgeRecord,
  EngineProceduralNotice,
  EngineProceduralNoticeAttempt,
  EngineProceduralNoticeCommand,
  EngineProceduralNoticeStatus,
  EngineSenseCapabilities,
  EngineWorldFact,
  EngineWorldFactPatchOperations,
  EngineWorldObjectAffordance,
  EngineWorldObjectInstance,
  EngineWorldObjectPatchOperations,
  EngineWorldObjectState,
  EngineGameTime,
  EngineTimeState,
  EngineTravelPace,
  EngineTravelPlan,
  EngineScheduledEvent,
  EngineRandomEventResolution,
  EngineProjectClock,
  EngineWorldClock,
  EngineRestState,
  EngineSurvivalState,
  InformationTier,
  PublicProjection,
  EnginePendingReaction,
  EnginePendingAdvancement,
  EngineTurnBudget,
  EngineTurnBudgetSlot,
  EngineMovementBudget,
  EngineTacticalBounds,
  EngineTacticalAreaSnapshot,
  EngineTacticalCover,
  EngineTacticalFootprint,
  EngineTacticalGeometry,
  EngineTacticalGeometryInput,
  EngineTacticalObstacle,
  EngineTacticalPosition,
  EngineTacticalTerrain,
  EngineTacticalZone,
  EngineTacticalZoneDefinitionKey,
  EngineTacticalZoneEndReason,
  EngineTacticalZoneIntegrityIssue,
  EngineCombatTacticalState,
  EngineControlledActor,
  EngineControlledActorAttack,
  EngineControlledActorCommandAction,
  EngineControlledActorCommandOffer,
  EngineControlledActorProfile,
  EngineControlledActorView,
  EnginePartyState,
  EnginePartyMember,
  EnginePartySharedState,
  EngineEncounterApproachEvidence,
  EngineEncounterInitiative,
  EngineEncounterInitiativeEntry,
  EngineEncounterLifecycle,
  EngineEncounterOutcome,
  EngineEncounterSurrenderOffer,
  EngineMovementPlan,
  EnginePathTrigger,
  EngineContentPolicy,
  EngineExperienceFeedback,
  EngineExperienceProfile,
  EngineExperienceProfileInput,
  EngineExperienceProfileProjection,
  EngineContentReference,
  EngineEvent,
  EngineFeatureReference,
  EngineEffectInstance,
  EngineFailurePressure,
  EngineEffectDuration,
  EngineEffectOperation,
  EngineEquipmentSlot,
  EngineImprovEffect,
  EngineInventoryItem,
  EngineInventoryItemView,
  EngineItemDefinition,
  EngineItemProvenance,
  EngineItemTheftProvenance,
  EngineWeaponAttack,
  EngineMerchant,
  EngineMerchantPatch,
  EngineMerchantPatchOperations,
  EngineMerchantView,
  EngineNpc,
  EngineNpcActionOffer,
  EngineNpcAgencyAction,
  EngineNpcAgencyState,
  EngineNpcProviderSelection,
  EngineNpcGoal,
  EngineNpcInvocation,
  EngineNpcPendingAction,
  EngineNpcResourceState,
  EngineNpcScheduleEntry,
  EngineNpcTickCommand,
  EngineOrchestrationCommand,
  EngineNpcPatch,
  EngineNpcPatchOperations,
  EngineMessage,
  EngineQuest,
  EngineQuestConsequenceRecord,
  EngineQuestGraph,
  EngineQuestObjective,
  EngineQuestPredicate,
  EngineQuestProgressClock,
  EngineQuestStatus,
  EngineQuestTerminalOutcome,
  EngineQuestTransition,
  EnginePersistedCommand,
  EngineResolution,
  EngineResolutionTool,
  EngineSessionView,
  EngineSpellReference,
  EngineSpellScrollDefinition,
  EngineSpellcastingView,
  EngineToolName,
  EngineWorldContextView,
  EngineSocialActionCommand,
  EngineSocialCrimeEvidence,
  EngineSocialFaction,
  EngineSocialHeat,
  EngineSocialObligation,
  EngineSocialProjection,
  EngineSocialRelationship,
  EngineSocialReputation,
  EngineSocialRumor,
  EngineSocialState,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";
import {
  activateScene,
  applyOrchestrationDecision,
  authorizePacingRefs,
  authorizedRandomEventRefs,
  buildResumeProjection,
  emptyOrchestrationState,
  hooksForScene,
  normalizeOrchestrationState,
  refreshSceneFromEvents,
  sceneStateFromProjection,
  validateOrchestrationDecision,
} from "./engine-orchestration.js";
import {
  advanceSituationPressure,
  compileSituationDefinition,
  normalizeSituation,
  projectSituationForActor,
  reconcileSituation,
  situationChoiceAllowed,
  situationClueFactIds,
} from "./engine-situations.js";
import {
  buildRuinedGatehouseBlueprint,
  commitSceneSnapshot,
  completeDmRun,
  createDmRun,
  emptyProductionRoomState,
  initialPlayback,
  openSceneInput,
  parseProductionRoomState,
  projectNarrationSequenceForActor,
  projectSceneForActor,
  proposeSceneBlueprint,
  releaseNarrationSequence,
} from "./engine-production-room.js";
import type { DmRun, NarrationSequenceIR, ProductionRoomState } from "./engine-production-room.js";
import type { EffectApplyInput } from "./engine-effects.js";
import {
  compileRuntimeContent,
  emptyRuntimeContentState,
  normalizeRuntimeContentState,
  projectRuntimeContentForActor,
  runtimeSpellDefinitionSchema,
  runtimeSpellExecutionSchema,
  type RuntimeContentInstance,
  type RuntimeContentState,
  type RuntimeItemDefinition,
  type RuntimeSpellDefinition,
} from "./content/runtime-compiler.js";
import {
  activeConditionNames,
  applyEffect,
  clearEffectsByPolicy,
  expireEffectsAtBoundary,
  expireSourceLifetimeEffects,
  hasActiveCondition,
  isAdmittedEffectOperation,
  normalizeCondition,
  queryModifiers,
  queryStatModifier,
  removeConditionEffects,
  removeEffectsBySource,
} from "./engine-effects.js";
import {
  ENGINE_ABILITIES,
  OPEN5E_CLASS_PRESETS,
  OPEN5E_DEFAULT_ABILITY_SCORES,
  OPEN5E_DEFAULT_TOOL_CHOICES,
  OPEN5E_RULES_PACK_HASH,
  OPEN5E_RULES_VERSION,
  OPEN5E_SPECIES_PRESETS,
  abilityModifier as open5eAbilityModifier,
  buildSavingThrows,
  buildSkillSheet,
  carryCapacity,
  createOpen5eInventoryItem,
  createOpen5eStarterInventory,
  currencyFromCopper,
  defaultOpen5eLanguages,
  materializeInventory,
  materializeInventoryItem,
  getOpen5eEquipment,
  materializeCombatant,
  materializeCombatants,
  createOpen5eCombatant,
  getOpen5eCreature,
  getOpen5eSpell,
  getOpen5eSpellList,
  getOpen5eSpellProgression,
  getOpen5eClass,
  getOpen5eAlignment,
  getOpen5eBackground,
  getOpen5eFeat,
  getOpen5eLanguage,
  getOpen5eSkill,
  getOpen5eSpecies,
  normalizeInventoryItem,
  open5eSpellSlots,
  open5eItemContentKey,
  open5eCharacterContentKey,
  open5eCharacterOptions,
  open5eToolChoiceOptions,
  proficiencyBonus as open5eProficiencyBonus,
  requireOpen5eAlignment,
  requireOpen5eBackground,
  requireOpen5eClass,
  requireOpen5eLanguage,
  requireOpen5eSkill,
  requireOpen5eSpecies,
  REVIEWED_CURE_WOUNDS_CONTENT_KEY,
  REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY,
  REVIEWED_FIRST_LEVEL_SCROLL_CONTENT_KEY,
} from "./open5e-rules.js";

export function defaultCampaignProfile(): EngineCampaignProfile {
  return {
    name: "Unnamed Campaign",
    premise: "A new world is waiting for you to decide what matters.",
    setting: "Open fantasy",
    tone: "Adventurous",
  };
}

export const REVIEWED_DIFFICULTY_POLICY_KEYS = {
  gentle: "lantern-difficulty-gentle-v1",
  standard: "lantern-difficulty-standard-v1",
  challenging: "lantern-difficulty-challenging-v1",
} as const;

export function reviewedDifficultyPolicyKey(
  difficulty: EngineExperienceProfileInput["difficulty"]
): string {
  return REVIEWED_DIFFICULTY_POLICY_KEYS[difficulty];
}

export function defaultExperienceProfile(now = new Date().toISOString()): EngineExperienceProfile {
  return {
    version: 1,
    revision: 0,
    source: "player",
    pillarWeights: { combat: 25, exploration: 25, social: 25, mystery: 25 },
    difficulty: "standard",
    difficultyPolicyKey: reviewedDifficultyPolicyKey("standard"),
    narrationStyle: "compact",
    verbosity: "compact",
    guidance: "balanced",
    rulesTransparency: "summary",
    excludedThemes: [],
    fadeToBlackThemes: [],
    feedback: [],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeExperienceThemes(themes: readonly string[] | undefined): string[] {
  return [...new Set((themes ?? []).map((theme) => theme.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }) || a.localeCompare(b)
  );
}

export function normalizeExperienceProfileInput(value: unknown): EngineExperienceProfileInput | null {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const parsed = engineExperienceProfileInputSchema.safeParse({
    pillarWeights: candidate.pillarWeights,
    difficulty: candidate.difficulty,
    narrationStyle: candidate.narrationStyle,
    verbosity: candidate.verbosity,
    guidance: candidate.guidance,
    rulesTransparency: candidate.rulesTransparency,
    excludedThemes: candidate.excludedThemes,
    fadeToBlackThemes: candidate.fadeToBlackThemes,
  });
  if (!parsed.success) return null;
  const profile = parsed.data;
  const total = Object.values(profile.pillarWeights).reduce((sum, weight) => sum + weight, 0);
  const excludedThemes = normalizeExperienceThemes(profile.excludedThemes);
  const fadeToBlackThemes = normalizeExperienceThemes(profile.fadeToBlackThemes);
  const excluded = new Set(excludedThemes.map((theme) => theme.toLocaleLowerCase()));
  if (total !== 100 || fadeToBlackThemes.some((theme) => excluded.has(theme.toLocaleLowerCase()))) return null;
  return {
    ...profile,
    pillarWeights: { ...profile.pillarWeights },
    excludedThemes,
    fadeToBlackThemes,
  };
}

export function experienceProfileInput(profile: EngineExperienceProfile): EngineExperienceProfileInput {
  return {
    pillarWeights: { ...profile.pillarWeights },
    difficulty: profile.difficulty,
    narrationStyle: profile.narrationStyle,
    verbosity: profile.verbosity,
    guidance: profile.guidance,
    rulesTransparency: profile.rulesTransparency,
    excludedThemes: [...profile.excludedThemes],
    fadeToBlackThemes: [...profile.fadeToBlackThemes],
  };
}

export function projectExperienceProfile(profile: EngineExperienceProfile): EngineExperienceProfileProjection {
  return {
    version: 1,
    revision: profile.revision,
    pillarWeights: { ...profile.pillarWeights },
    difficulty: profile.difficulty,
    difficultyPolicyKey: profile.difficultyPolicyKey,
    narrationStyle: profile.narrationStyle,
    verbosity: profile.verbosity,
    guidance: profile.guidance,
    rulesTransparency: profile.rulesTransparency,
    excludedThemes: [...profile.excludedThemes],
    fadeToBlackThemes: [...profile.fadeToBlackThemes],
  };
}

function buildExperienceProfile(
  input: EngineExperienceProfileInput,
  now: string,
  previous?: EngineExperienceProfile
): EngineExperienceProfile {
  return {
    ...input,
    version: 1,
    revision: previous ? previous.revision + 1 : 0,
    source: "player",
    difficultyPolicyKey: reviewedDifficultyPolicyKey(input.difficulty),
    feedback: previous?.feedback.map((entry) => ({ ...entry })) ?? [],
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function normalizeExperienceProfile(value: unknown, fallbackAt = new Date().toISOString()): EngineExperienceProfile {
  const parsed = engineExperienceProfileSchema.safeParse(value);
  if (!parsed.success) return defaultExperienceProfile(fallbackAt);
  const input = normalizeExperienceProfileInput(parsed.data);
  if (!input) return defaultExperienceProfile(fallbackAt);
  const feedback = parsed.data.feedback.slice(-8).map((entry) => ({ ...entry }));
  return {
    ...buildExperienceProfile(input, parsed.data.updatedAt, {
      ...parsed.data,
      feedback,
    }),
    revision: parsed.data.revision,
    createdAt: parsed.data.createdAt,
    updatedAt: parsed.data.updatedAt,
    feedback,
  };
}

function redactedExperienceProfileEvidence(profile: EngineExperienceProfile): Record<string, unknown> {
  return {
    revision: profile.revision,
    pillarWeights: { ...profile.pillarWeights },
    difficulty: profile.difficulty,
    difficultyPolicyKey: profile.difficultyPolicyKey,
    narrationStyle: profile.narrationStyle,
    verbosity: profile.verbosity,
    guidance: profile.guidance,
    rulesTransparency: profile.rulesTransparency,
    excludedThemeCount: profile.excludedThemes.length,
    fadeToBlackThemeCount: profile.fadeToBlackThemes.length,
    feedbackCount: profile.feedback.length,
  };
}

const ADJUDICATION_POLICY_REVISION = "lantern-adjudication-v1";

type ChallengeDefinition = {
  id: string;
  aliases: string[];
  feasibility: EngineAdjudicationDecision["feasibility"];
  selectedRuleFamily: string;
  dcSource: EngineAdjudicationDecision["dcSource"];
  dcByDifficulty?: Record<EngineAdjudicationDifficultyBand, number>;
  dcProvenance: string;
  stakes: EngineAdjudicationStake[];
  allowedOutcomes: EngineAdjudicationOutcome[];
  retryPolicy: EngineAdjudicationDecision["retryPolicy"];
  costs: EngineAdjudicationCosts;
  actorCheck?: { ability: EngineAbility; skill: string | null };
  opposed?: { ability: EngineAbility; skill: string };
  requiredTool?: string;
  forbidProposedTool?: boolean;
  objectTransition?: {
    requiredState: EngineWorldObjectState;
    requiredAffordance: EngineWorldObjectAffordance;
    successState: EngineWorldObjectState;
    kind: "force-open" | "pick-lock";
    alwaysRequiresTarget: boolean;
  };
  reason?: string;
  alternatives?: string[];
};

const REVIEWED_CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
  {
    id: "ordinary-unlocked-door-v1",
    aliases: ["ordinary-door", "unlocked-door", "ordinary-unlocked-door"],
    feasibility: "automatic",
    selectedRuleFamily: "world-truth-automatic",
    dcSource: "none",
    dcProvenance: "reviewed-challenge:ordinary-unlocked-door-v1",
    stakes: [],
    allowedOutcomes: ["automatic-success"],
    retryPolicy: "not_applicable",
    costs: { timeMinutes: 0, noise: 0, exposure: 0 },
  },
  {
    id: "multi-ton-stone-gate-v1",
    aliases: ["multi-ton-stone-gate", "stone-gate", "impossible-stone-gate"],
    feasibility: "impossible",
    selectedRuleFamily: "world-truth-impossible",
    dcSource: "none",
    dcProvenance: "reviewed-challenge:multi-ton-stone-gate-v1",
    stakes: ["opportunity"],
    allowedOutcomes: ["impossible"],
    retryPolicy: "not_applicable",
    costs: { timeMinutes: 0, noise: 0, exposure: 0 },
    reason: "The gate is a multi-ton stone slab; one person cannot move it by hand with the available leverage.",
    alternatives: ["find a lever or mechanism", "seek a different route", "use a reviewed effect that can move stone"],
  },
  {
    id: "barred-door-v1",
    aliases: ["barred-door", "force-barred-door", "barred-door-under-pressure"],
    feasibility: "uncertain",
    selectedRuleFamily: "athletics",
    dcSource: "reviewed_challenge",
    dcByDifficulty: { gentle: 10, standard: 14, challenging: 18 },
    dcProvenance: "reviewed-challenge:barred-door-v1:dc-band-v1",
    stakes: ["time", "noise", "exposure"],
    allowedOutcomes: ["success", "failure-with-complication"],
    retryPolicy: "new_approach_or_state_change",
    costs: { timeMinutes: 5, noise: 2, exposure: 1 },
    forbidProposedTool: true,
    objectTransition: {
      requiredState: "locked",
      requiredAffordance: "open",
      successState: "open",
      kind: "force-open",
      alwaysRequiresTarget: false,
    },
  },
  {
    id: "pick-lock-v1",
    aliases: ["pick-lock", "lockpick", "thieves-tools-lock"],
    feasibility: "uncertain",
    selectedRuleFamily: "thieves-tools",
    dcSource: "reviewed_challenge",
    dcByDifficulty: { gentle: 10, standard: 14, challenging: 18 },
    dcProvenance: "reviewed-challenge:pick-lock-v1:dc-band-v1",
    stakes: ["time", "noise", "exposure"],
    allowedOutcomes: ["success", "failure-with-complication"],
    retryPolicy: "new_approach_or_state_change",
    costs: { timeMinutes: 5, noise: 1, exposure: 1 },
    actorCheck: { ability: "dex", skill: null },
    requiredTool: "Thieves' Tools",
    objectTransition: {
      requiredState: "locked",
      requiredAffordance: "unlock",
      successState: "unlocked",
      kind: "pick-lock",
      alwaysRequiresTarget: true,
    },
  },
  {
    id: "seize-held-object-v1",
    aliases: ["seize-held-object", "snatch-held-object", "grab-held-object"],
    feasibility: "uncertain",
    selectedRuleFamily: "sleight-of-hand",
    dcSource: "reviewed_challenge",
    dcByDifficulty: { gentle: 10, standard: 14, challenging: 18 },
    dcProvenance: "reviewed-challenge:seize-held-object-v1:dc-band-v1",
    stakes: ["exposure", "opportunity"],
    allowedOutcomes: ["success", "failure-with-complication"],
    retryPolicy: "new_approach_or_state_change",
    costs: { timeMinutes: 0, noise: 0, exposure: 1 },
    actorCheck: { ability: "dex", skill: "sleightOfHand" },
  },
  {
    id: "stealth-perception-v1",
    aliases: ["stealth-v-perception", "opposed-stealth-perception"],
    feasibility: "uncertain",
    selectedRuleFamily: "stealth-vs-perception",
    dcSource: "opposed_actor",
    dcProvenance: "reviewed-challenge:stealth-perception-v1:opposed-v1",
    stakes: [],
    allowedOutcomes: ["success", "failure-with-complication"],
    retryPolicy: "new_approach_or_state_change",
    costs: { timeMinutes: 0, noise: 0, exposure: 0 },
    actorCheck: { ability: "dex", skill: "stealth" },
    opposed: { ability: "wis", skill: "perception" },
  },
  {
    id: "search-hidden-fact-v1",
    aliases: ["active-search", "search-hidden-fact"],
    feasibility: "uncertain",
    selectedRuleFamily: "perception-search",
    dcSource: "reviewed_challenge",
    dcByDifficulty: { gentle: 10, standard: 14, challenging: 18 },
    dcProvenance: "reviewed-challenge:search-hidden-fact-v1:dc-band-v1",
    stakes: ["opportunity"],
    allowedOutcomes: ["success", "failure-with-complication"],
    retryPolicy: "new_approach_or_state_change",
    costs: { timeMinutes: 0, noise: 0, exposure: 0 },
    actorCheck: { ability: "wis", skill: "perception" },
  },
  {
    id: "situation-clue-v1",
    aliases: ["situation-clue", "investigate-situation-clue"],
    feasibility: "uncertain",
    selectedRuleFamily: "situation-investigation",
    dcSource: "reviewed_challenge",
    dcByDifficulty: { gentle: 10, standard: 14, challenging: 18 },
    dcProvenance: "reviewed-challenge:situation-clue-v1:dc-band-v1",
    stakes: ["time", "opportunity"],
    allowedOutcomes: ["success", "failure-with-complication"],
    retryPolicy: "new_approach_or_state_change",
    costs: { timeMinutes: 5, noise: 0, exposure: 0 },
    actorCheck: { ability: "wis", skill: "perception" },
  },
];

function normalizeChallengeId(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[ _]+/g, "-");
}

function reviewedChallengeDefinition(value: string): ChallengeDefinition | null {
  const normalized = normalizeChallengeId(value);
  return REVIEWED_CHALLENGE_DEFINITIONS.find((definition) =>
    definition.id === normalized || definition.aliases.includes(normalized)
  ) ?? null;
}

function normalizeApproach(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function challengeApproachHash(
  actorId: string,
  challengeId: string,
  sceneId: string,
  approach: string,
  targetId = ""
): string {
  return createHash("sha256")
    .update([actorId, challengeId, sceneId, targetId, normalizeApproach(approach).toLocaleLowerCase()].join("\n"))
    .digest("hex");
}

const FAILURE_PRESSURE_THRESHOLD = 3;

function failurePressureId(actorId: string, challengeId: string, sceneId: string): string {
  return "failure-pressure:" + createHash("sha256")
    .update([actorId, challengeId, sceneId].join("\n"))
    .digest("hex")
    .slice(0, 32);
}

function failurePressureFor(
  state: LanternCampaignState,
  actorId: string,
  challengeId: string,
  sceneId: string,
): EngineFailurePressure | null {
  return (state.failurePressures ?? []).find((pressure) =>
    pressure.actorId === actorId
    && pressure.challengeId === challengeId
    && pressure.sceneId === sceneId
  ) ?? null;
}

function applyFailurePressure(
  next: LanternCampaignState,
  state: LanternCampaignState,
  actorId: string,
  challengeId: string,
  sceneId: string,
  failed: boolean,
): { pressure: EngineFailurePressure | null; changes: Array<{ path: string; before: unknown; after: unknown }> } {
  const existing = failurePressureFor(state, actorId, challengeId, sceneId);
  if (!failed) {
    if (!existing) return { pressure: null, changes: [] };
    next.failurePressures = (state.failurePressures ?? []).filter((pressure) => pressure.id !== existing.id);
    return {
      pressure: null,
      changes: [{ path: `/failurePressures/${existing.id}`, before: existing, after: null }],
    };
  }
  const failureCount = Math.min(FAILURE_PRESSURE_THRESHOLD, (existing?.failureCount ?? 0) + 1);
  const pressure: EngineFailurePressure = {
    id: existing?.id ?? failurePressureId(actorId, challengeId, sceneId),
    actorId,
    challengeId,
    sceneId,
    failureCount,
    threshold: FAILURE_PRESSURE_THRESHOLD,
    status: failureCount >= FAILURE_PRESSURE_THRESHOLD ? "compromised" : "rising",
    lastFailureVersion: state.version + 1,
  };
  const superseded = (state.failurePressures ?? []).filter((candidate) =>
    candidate.id !== pressure.id
    && candidate.actorId === actorId
    && candidate.challengeId === challengeId
  );
  next.failurePressures = [
    ...(state.failurePressures ?? []).filter((candidate) => !superseded.some((old) => old.id === candidate.id) && candidate.id !== pressure.id),
    pressure,
  ].slice(-40);
  return {
    pressure,
    changes: [
      ...superseded.map((old) => ({ path: `/failurePressures/${old.id}`, before: old, after: null })),
      { path: `/failurePressures/${pressure.id}`, before: existing, after: pressure },
    ],
  };
}

function failurePressureRejection(
  state: LanternCampaignState,
  tool: EngineToolName | "declare" | "listen",
  pressure: EngineFailurePressure,
  decision?: EngineAdjudicationDecision,
): EngineResolution {
  return rejection(
    state,
    tool,
    "challenge_pressure_compromised",
    "Repeated failures have compromised this approach; change the situation before attempting it again.",
    {
      ...(decision ? { adjudication: decision } : {}),
      failurePressure: pressure,
    },
  );
}

function failurePressureMessage(pressure: EngineFailurePressure | null): string | null {
  if (!pressure) return null;
  return pressure.status === "compromised"
    ? " The repeated failures have compromised this approach; the situation now requires a materially different response."
    : ` Pressure is rising (${pressure.failureCount}/${pressure.threshold}); another failure will compromise this approach.`;
}

function buildAdjudicationDecision(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineChallengeAttemptCommand,
  definition: ChallengeDefinition
): EngineAdjudicationDecision {
  const sceneId = command.targetId && state.worldContext
    ? state.worldContext.id + ":" + command.targetId
    : command.sceneId?.trim() || state.worldContext?.id || "campaign-scene";
  const selectedDifficultyBand = state.experienceProfile.difficulty;
  const requestedStakes = [...new Set(command.requestedStakes ?? [])];
  const selectedTool = definition.requiredTool ?? command.tool;
  return {
    id: clientCommandId,
    actorId: context.actorId,
    challengeId: definition.id,
    sceneId,
    ...(command.targetId ? { targetId: command.targetId } : {}),
    goal: command.goal.trim(),
    approach: normalizeApproach(command.approach),
    approachHash: challengeApproachHash(context.actorId, definition.id, sceneId, command.approach, command.targetId ?? command.factId),
    clarificationStatus: "not_needed",
    feasibility: definition.feasibility,
    selectedRuleFamily: definition.selectedRuleFamily,
    dcSource: definition.dcSource,
    dc: definition.dcByDifficulty?.[selectedDifficultyBand] ?? null,
    dcProvenance: definition.dcProvenance,
    requestedDifficultyBand: command.difficultyBand ?? null,
    selectedDifficultyBand,
    difficultyPolicyKey: state.experienceProfile.difficultyPolicyKey,
    requestedStakes,
    stakes: [...definition.stakes],
    allowedOutcomes: [...definition.allowedOutcomes],
    retryPolicy: definition.retryPolicy,
    costs: { ...definition.costs },
    informationPolicy: definition.id === "search-hidden-fact-v1" ? "withheld" : command.informationPolicy ?? "public",
    ...(command.helperId ? { helperId: command.helperId } : {}),
    ...(command.opponentId ? { opponentId: command.opponentId } : {}),
    ...(selectedTool ? { tool: selectedTool } : {}),
    policyRevision: ADJUDICATION_POLICY_REVISION,
    rulesVersion: state.rulesVersion,
  };
}

function appendAdjudicationAttempt(
  next: LanternCampaignState,
  state: LanternCampaignState,
  decision: EngineAdjudicationDecision,
  outcome: EngineAdjudicationOutcome,
  roll?: number,
  total?: number
): { attempt: EngineAdjudicationAttempt; change: { path: string; before: unknown; after: unknown } } {
  const attempt: EngineAdjudicationAttempt = {
    ...decision,
    outcome,
    attemptVersion: state.version + 1,
    ...(roll === undefined ? {} : { roll }),
    ...(total === undefined ? {} : { total }),
  };
  next.adjudicationHistory = [...state.adjudicationHistory, attempt].slice(-100);
  return {
    attempt,
    change: {
      path: "/adjudicationHistory/" + attempt.id,
      before: null,
      after: attempt,
    },
  };
}

function hasIdenticalRetry(state: LanternCampaignState, decision: EngineAdjudicationDecision): boolean {
  return decision.retryPolicy === "new_approach_or_state_change"
    && state.adjudicationHistory.some((attempt) =>
      attempt.actorId === decision.actorId
      && attempt.challengeId === decision.challengeId
      && attempt.sceneId === decision.sceneId
      && attempt.approachHash === decision.approachHash
      && (attempt.attemptVersion === state.version || attempt.attemptVersion === state.version + 1)
    );
}

function adjudicationRejection(
  state: LanternCampaignState,
  tool: EngineToolName | "declare" | "listen",
  code: string,
  message: string,
  decision: EngineAdjudicationDecision,
  extraData: Record<string, unknown> = {}
): EngineResolution {
  return rejection(state, tool, code, message, { adjudication: decision, ...extraData });
}

function validateChallengeHelper(
  state: LanternCampaignState,
  context: RequestContext,
  helperId: string | undefined,
  tool: EngineToolName | "declare" | "listen",
  decision: EngineAdjudicationDecision
): EngineResolution | null {
  if (!helperId) return null;
  if (helperId === context.actorId || helperId === state.character.id) {
    return adjudicationRejection(state, tool, "helper_not_eligible", "The acting character cannot help itself.", decision);
  }
  const helper = state.worldContext?.npcs.find((candidate) => candidate.id === helperId);
  if (!helper) return adjudicationRejection(state, tool, "helper_not_found", "That helper is not established in the current context.", decision);
  if (helper.disposition !== "friendly" && helper.disposition !== "helpful") {
    return adjudicationRejection(state, tool, "helper_unavailable", "That NPC is not willing to help with this check.", decision);
  }
  return null;
}

function resolveOpposedCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineChallengeAttemptCommand,
  tool: EngineToolName | "declare" | "listen",
  decision: EngineAdjudicationDecision,
  definition: ChallengeDefinition
): EngineResolution {
  const opponentId = decision.opponentId;
  if (!opponentId) return adjudicationRejection(state, tool, "opponent_required", "This opposed challenge needs an established opponent.", decision);
  if (state.combat.status !== "active") return adjudicationRejection(state, tool, "opponent_not_supported", "An opposed challenge requires an active established opponent.", decision);
  const opponent = state.combat.enemies.find((candidate) => candidate.id === opponentId && candidate.alive);
  if (!opponent) return adjudicationRejection(state, tool, "opponent_not_found", "That opponent is not a living combatant in the current encounter.", decision);
  const actorCheck = definition.actorCheck ?? { ability: "dex" as const, skill: "stealth" };
  const derived = deriveCheck(state, actorCheck.ability, actorCheck.skill, decision.tool ?? null, tool);
  if ("accepted" in derived) return derived;
  const opponentView = materializeCombatant(opponent);
  const modifierQuery = queryModifiers(state.effects, state.character.id, "ability-check");
  const advantageSources = [...modifierQuery.effectIds];
  if (decision.helperId) advantageSources.push("helper:" + decision.helperId);
  const disadvantageSources = modifierQuery.disadvantage > 0 ? [...modifierQuery.effectIds] : [];
  const advantageCount = modifierQuery.advantage + (decision.helperId ? 1 : 0);
  const disadvantageCount = modifierQuery.disadvantage;
  const mode: EngineCheckEvidence["mode"] = advantageCount > 0 && disadvantageCount > 0 ? "cancelled" : advantageCount > 0 ? "advantage" : disadvantageCount > 0 ? "disadvantage" : "normal";
  const firstRoll = randomInt(1, 21);
  const secondRoll = mode !== "normal" && mode !== "cancelled" ? randomInt(1, 21) : null;
  const roll = secondRoll === null ? firstRoll : mode === "advantage" ? Math.max(firstRoll, secondRoll) : Math.min(firstRoll, secondRoll);
  const opponentRoll = randomInt(1, 21);
  const opponentModifier = opponentView.skillBonusesAll[definition.opposed?.skill ?? "perception"] ?? opponentView.abilityModifiers[definition.opposed?.ability ?? "wis"];
  const opponentTotal = opponentRoll + opponentModifier;
  const total = roll + derived.modifier;
  const success = total > opponentTotal;
  const outcome: EngineAdjudicationOutcome = success ? "success" : "failure-with-complication";
  const withheld = decision.informationPolicy === "withheld";
  const publicText = `You make a ${actorCheck.ability.toUpperCase()} (${actorCheck.skill}) check against ${opponentView.name}: ${total} versus ${opponentTotal}. ${success ? "Success." : "Failure."}`;
  const text = withheld ? "The opposed check resolves, but its details are withheld." : publicText;
  const check: EngineCheckEvidence = {
    kind: "opposed-check",
    actorId: context.actorId,
    ability: actorCheck.ability,
    skill: actorCheck.skill,
    tool: derived.tool,
    proficiency: derived.proficiency,
    expertise: derived.expertise,
    modifier: derived.modifier,
    modifierSources: [...derived.modifierSources],
    advantageSources,
    disadvantageSources,
    mode,
    ...(decision.helperId ? { helperId: decision.helperId } : {}),
    opponentId,
    opponentAbility: definition.opposed?.ability,
    opponentSkill: definition.opposed?.skill,
    opponentModifier,
    opponentTotal,
    informationPolicy: decision.informationPolicy,
    formulaRevision: "checks-v1",
  };
  const next = cloneCampaign(state);
  next.lastRoll = roll;
  const attemptChange = appendAdjudicationAttempt(next, state, decision, outcome, roll, total).change;
  const pressureResult = applyFailurePressure(next, state, context.actorId, decision.challengeId, decision.sceneId, !success);
  const fullData = { ability: actorCheck.ability, skill: actorCheck.skill, goal: command.goal, roll, modifier: derived.modifier, total, opponentId, opponentRoll, opponentModifier, opponentTotal, success, adjudication: decision, costs: decision.costs, outcome, failurePressure: pressureResult.pressure };
  const resolvedText = text + (success ? "" : (failurePressureMessage(pressureResult.pressure) ?? ""));
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    resolvedText,
    withheld ? { informationPolicy: "withheld", outcome } : fullData,
    outcome,
    [
      { kind: "d20", value: roll, sides: 20 },
      ...(secondRoll === null ? [] : [{ kind: `d20_${mode}`, value: secondRoll, sides: 20 }]),
      { kind: "opposed_d20", value: opponentRoll, sides: 20 },
    ],
    [
      { name: actorCheck.ability + "_modifier", value: derived.modifier },
      { name: "opponent_modifier", value: opponentModifier },
      { name: "opponent_total", value: opponentTotal },
    ],
    [{ path: "/lastRoll", before: state.lastRoll, after: roll }, attemptChange, ...pressureResult.changes],
    [],
    decision,
    check
  );
}

type ChallengeObjectTarget = {
  object: EngineWorldObjectInstance;
  transition: NonNullable<ChallengeDefinition["objectTransition"]>;
};

function validateChallengeObjectTarget(
  state: LanternCampaignState,
  command: EngineChallengeAttemptCommand,
  definition: ChallengeDefinition,
  decision: EngineAdjudicationDecision,
  tool: EngineToolName | "declare" | "listen",
): ChallengeObjectTarget | EngineResolution | null {
  const transition = definition.objectTransition;
  if (!transition) {
    return command.targetId
      ? adjudicationRejection(state, tool, "challenge_target_not_supported", "That reviewed challenge does not accept a world-object target.", decision)
      : null;
  }

  const world = state.worldContext;
  const eligibleTargets = world?.objects.filter((object) =>
    object.state === transition.requiredState
    && object.definition.affordances.includes(transition.requiredAffordance)
  ) ?? [];
  if (!command.targetId) {
    if (transition.alwaysRequiresTarget || eligibleTargets.length > 0) {
      return adjudicationRejection(
        state,
        tool,
        "challenge_target_required",
        "That reviewed object challenge needs the exact established targetId before any roll.",
        decision,
      );
    }
    // Preserve abstract barred-door adjudication when no typed object exists.
    // Once a qualifying object is authoritative, the target becomes mandatory.
    return null;
  }
  if (!world) {
    return adjudicationRejection(state, tool, "world_context_required", "There is no authoritative world context for that object challenge.", decision);
  }
  const topology = worldObjectTopologyValidation(world.objects, world.id, state.actorId);
  if (topology) return adjudicationRejection(state, tool, topology.code, topology.message, decision);
  const object = world.objects.find((candidate) => candidate.id === command.targetId);
  if (!object) {
    return adjudicationRejection(state, tool, "challenge_target_not_found", "That challenge target is not an established world object in the current context.", decision);
  }
  if (object.state !== transition.requiredState) {
    return adjudicationRejection(
      state,
      tool,
      "challenge_target_state_invalid",
      "That object is not in the required " + transition.requiredState + " state.",
      decision,
      { objectId: object.id, state: object.state, requiredState: transition.requiredState },
    );
  }
  if (!object.definition.affordances.includes(transition.requiredAffordance)) {
    return adjudicationRejection(
      state,
      tool,
      "challenge_target_affordance_unavailable",
      "That object does not declare the required " + transition.requiredAffordance + " affordance.",
      decision,
      { objectId: object.id, requiredAffordance: transition.requiredAffordance },
    );
  }
  return { object, transition };
}

function applyObjectChallengeResolution(
  resolution: EngineResolution,
  context: RequestContext,
  clientCommandId: string,
  target: ChallengeObjectTarget,
): EngineResolution {
  if (!resolution.accepted || !resolution.event || resolution.event.outcome !== "success") return resolution;
  const next = cloneCampaign(resolution.state);
  const world = next.worldContext;
  const objectIndex = world?.objects.findIndex((object) => object.id === target.object.id) ?? -1;
  if (!world || objectIndex < 0) {
    throw new Error("A validated object challenge lost its target before the atomic transition.");
  }
  const before = world.objects[objectIndex]!;
  if (before.state !== target.transition.requiredState) {
    throw new Error("A validated object challenge target changed state before the atomic transition.");
  }
  const after: EngineWorldObjectInstance = {
    ...before,
    state: target.transition.successState,
    revision: before.revision + 1,
    provenance: {
      sourceCommandId: clientCommandId,
      sourceVersion: resolution.state.version,
      occurredAt: resolution.event.createdAt,
    },
  };
  world.objects[objectIndex] = after;
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [{
    path: "/worldContext/objects/" + escapeJsonPointerSegment(after.id),
    before,
    after,
  }];
  if (next.situation) {
    const beforeSituation = next.situation;
    next.situation = reconcileSituation(next.situation, next);
    if (JSON.stringify(beforeSituation) !== JSON.stringify(next.situation)) {
      next.situation.revision += 1;
      stateChanges.push({
        path: "/situation",
        before: projectSituationForActor(beforeSituation, resolution.state, context.actorId),
        after: projectSituationForActor(next.situation, next, context.actorId),
      });
    }
  }
  const message = target.transition.kind === "force-open"
    ? "You force " + after.definition.name + " open."
    : "You pick the lock on " + after.definition.name + "; it is now unlocked.";
  const lastLogIndex = next.log.length - 1;
  if (lastLogIndex >= 0) next.log[lastLogIndex] = { ...next.log[lastLogIndex]!, text: message };
  const objectTransition = {
    objectId: after.id,
    objectName: after.definition.name,
    beforeState: before.state,
    afterState: after.state,
    affordance: target.transition.requiredAffordance,
  };
  const baseData = resolution.data && typeof resolution.data === "object"
    ? resolution.data as Record<string, unknown>
    : {};
  return {
    ...resolution,
    state: next,
    message,
    data: { ...baseData, objectTransition },
    event: {
      ...resolution.event,
      stateChanges: [...resolution.event.stateChanges, ...stateChanges],
    },
    narration: rulesNarration(message),
  };
}

function resolveChallengeAttempt(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineChallengeAttemptCommand,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const definition = reviewedChallengeDefinition(command.challengeId);
  if (!definition) return rejection(state, tool, "unknown_challenge_definition", "That challenge has no reviewed adjudication definition.");
  const decision = buildAdjudicationDecision(state, context, clientCommandId, command, definition);
  if (definition.forbidProposedTool && command.tool) {
    return adjudicationRejection(
      state,
      tool,
      "challenge_tool_not_applicable",
      "That reviewed challenge does not accept a caller-selected tool; use the matching reviewed challenge instead.",
      decision,
    );
  }
  if (
    definition.requiredTool
    && command.tool
    && command.tool.trim().toLocaleLowerCase("en-US") !== definition.requiredTool.toLocaleLowerCase("en-US")
  ) {
    return adjudicationRejection(
      state,
      tool,
      "challenge_tool_mismatch",
      "That reviewed challenge uses " + definition.requiredTool + ", not a caller-selected substitute.",
      decision,
    );
  }
  const targetValidation = validateChallengeObjectTarget(state, command, definition, decision, tool);
  if (targetValidation && "accepted" in targetValidation) return targetValidation;
  const objectTarget = targetValidation;
  if (definition.id === "seize-held-object-v1") {
    if (!command.opponentId) return adjudicationRejection(state, tool, "opponent_required", "Seizing a held object needs its established holder.", decision);
    if (!state.worldContext?.npcs.some((npc) => npc.id === command.opponentId)) {
      return adjudicationRejection(state, tool, "opponent_not_found", "The object's claimed holder is not established in the current context.", decision);
    }
  }
  if (definition.feasibility === "impossible") {
    return adjudicationRejection(
      state,
      tool,
      "impossible_action",
      definition.reason ?? "The established world makes that approach impossible.",
      decision,
      { alternatives: definition.alternatives ?? [] }
    );
  }
  const existingPressure = failurePressureFor(state, decision.actorId, decision.challengeId, decision.sceneId);
  if (existingPressure?.status === "compromised") {
    return failurePressureRejection(state, tool, existingPressure, decision);
  }
  if (hasIdenticalRetry(state, decision)) {
    return adjudicationRejection(
      state,
      tool,
      "retry_blocked",
      "That identical approach cannot be retried until the approach or situation changes.",
      decision
    );
  }
  const searchFact = definition.id === "search-hidden-fact-v1"
    ? state.worldFacts.find((fact) => fact.active && fact.visibility === "hidden" && fact.id === command.factId && fact.sceneId === (state.worldContext?.id ?? ""))
    : null;
  if (definition.id === "search-hidden-fact-v1") {
    if (!searchFact) return adjudicationRejection(state, tool, "search_unavailable", "No searchable fact is authorized in the current scene.", decision);
    if (state.actorKnowledge.some((record) => record.actorId === context.actorId && record.factId === searchFact.id && !record.stale && record.factRevision === searchFact.revision && record.tier === "known")) {
      return adjudicationRejection(state, tool, "discovery_already_known", "That search has already revealed all currently authorized information.", decision);
    }
  }
  const helperRejection = validateChallengeHelper(state, context, decision.helperId, tool, decision);
  if (helperRejection) return helperRejection;
  if (definition.feasibility === "automatic") {
    const next = cloneCampaign(state);
    const { change } = appendAdjudicationAttempt(next, state, decision, "automatic-success");
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "The unlocked door opens without a roll; there is no meaningful pressure.",
      { adjudication: decision, outcome: "automatic-success" },
      "automatic-success",
      [],
      [],
      [change],
      [],
      decision
    );
  }

  if (definition.opposed) {
    return resolveOpposedCheck(state, context, clientCommandId, command, tool, decision, definition);
  }

  const actorCheckAbility = definition.actorCheck?.ability ?? "str";
  const actorCheckSkill = definition.actorCheck ? definition.actorCheck.skill : "athletics";
  const checkCommand: Extract<EngineCommand, { kind: "roll_check" }> = {
    kind: "roll_check" as const,
    ability: actorCheckAbility,
    ...(actorCheckSkill ? { skill: actorCheckSkill } : {}),
    goal: command.goal,
  };
  const result = resolveCheck(
    state,
    context,
    clientCommandId,
    checkCommand,
    tool,
    actorCheckAbility,
    actorCheckSkill,
    command.goal,
    decision,
    command
  );
  if (definition.id === "search-hidden-fact-v1" && searchFact) {
    return applySearchDiscoveryResolution(result, context.actorId, searchFact);
  }
  return objectTarget
    ? applyObjectChallengeResolution(result, context, clientCommandId, objectTarget)
    : result;
}

function applySearchDiscoveryResolution(
  resolution: EngineResolution,
  actorId: string,
  fact: EngineWorldFact
): EngineResolution {
  if (!resolution.accepted || resolution.event?.adjudication?.challengeId !== "search-hidden-fact-v1" || resolution.event.adjudication.allowedOutcomes.length === 0) return resolution;
  const outcome = resolution.state.adjudicationHistory.at(-1)?.outcome;
  if (outcome !== "success") return resolution;
  const next = cloneCampaign(resolution.state);
  const record = appendKnowledgeRecord(next, actorId, fact, "known", "active-search", `active-search:${fact.id}`, next.version);
  const change = { path: "/actorKnowledge/" + record.id, before: null, after: record };
  const event = resolution.event ? {
    ...resolution.event,
    stateChanges: [...resolution.event.stateChanges, change],
  } : null;
  return {
    ...resolution,
    state: next,
    message: "You discover: " + fact.title + ".",
    data: { discovery: { factId: fact.id, title: fact.title, description: fact.description, tier: "known" }, informationPolicy: "public" },
    event,
    narration: rulesNarration("You discover: " + fact.title + "."),
  };
}

export function defaultContentPolicy(): EngineContentPolicy {
  return {
    gamesystem: "5e-2014",
    baseDocumentKey: "srd-2014",
    allowedDocumentKeys: ["core", "elderberry-inn-icons", "srd-2014"],
    allowedLicenseKeys: ["cc-by-40", "cc0"],
  };
}

export const PROGRESSION_FORMULA_REVISION = "progression-v1" as const;

export function defaultAdvancementPolicy(): EngineAdvancementPolicy {
  return {
    version: 1,
    mode: "milestone",
    maxLevel: 2,
    hpPolicy: "fixed-average",
    formulaRevision: PROGRESSION_FORMULA_REVISION,
  };
}

const GAME_CALENDAR_ID = "lantern-standard-v1";
const ONE_DAY_MINUTES = 24 * 60;
const SHORT_REST_MINUTES = 60;
const LONG_REST_MINUTES = 8 * 60;

function gameTimeAt(totalMinutes: number): EngineGameTime {
  const total = Math.max(0, Math.trunc(totalMinutes));
  const dayIndex = Math.floor(total / ONE_DAY_MINUTES);
  const minuteOfDay = total % ONE_DAY_MINUTES;
  return {
    calendarId: GAME_CALENDAR_ID,
    year: 1 + Math.floor(dayIndex / 365),
    day: 1 + (dayIndex % 365),
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    totalMinutes: total,
  };
}

function defaultTimeState(): EngineTimeState {
  return {
    gameTime: gameTimeAt(0),
    scheduledEvents: [],
    travel: null,
    rest: {
      status: "idle",
      restType: null,
      startedAtMinutes: null,
      completedAtMinutes: null,
      requiredMinutes: 0,
      interruptionEventId: null,
      lastCompletedAtMinutes: null,
    },
    survival: {
      exhaustionLevel: 0,
      exposure: 0,
      forcedMarches: 0,
      weather: "clear",
    },
    worldClocks: [],
    randomEvents: [],
    projects: [],
  };
}

function normalizeTimeState(value: unknown): EngineTimeState {
  const defaults = defaultTimeState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Partial<EngineTimeState> & { gameTime?: Partial<EngineGameTime> };
  const totalMinutes = Math.max(0, Math.trunc(raw.gameTime?.totalMinutes ?? 0));
  const gameTime = gameTimeAt(totalMinutes);
  const scheduledEvents = Array.isArray(raw.scheduledEvents)
    ? raw.scheduledEvents.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const event = candidate as Partial<EngineScheduledEvent>;
        if (typeof event.id !== "string" || typeof event.kind !== "string" || typeof event.dueAtMinutes !== "number") return [];
        if (!["rest-interruption", "effect-expiry", "world-clock", "quest-deadline", "social-propagation", "controlled-actor-expiry"].includes(event.kind)) return [];
        return [{
          id: event.id,
          kind: event.kind as EngineScheduledEvent["kind"],
          dueAtMinutes: Math.max(0, Math.trunc(event.dueAtMinutes)),
          status: event.status === "processed" ? "processed" as const : "pending" as const,
          ...(typeof event.sourceRef === "string" ? { sourceRef: event.sourceRef } : {}),
          ...(typeof event.targetRef === "string" ? { targetRef: event.targetRef } : {}),
          ...(typeof event.processedAtMinutes === "number" ? { processedAtMinutes: Math.max(0, Math.trunc(event.processedAtMinutes)) } : {}),
          provenance: {
            sourceCommandId: event.provenance?.sourceCommandId ?? "legacy-time",
            sourceVersion: Math.max(0, Math.trunc(event.provenance?.sourceVersion ?? 0)),
          },
        }];
      })
    : [];
  const rawRest = raw.rest && typeof raw.rest === "object" ? raw.rest as Partial<EngineRestState> : {};
  const rest: EngineRestState = {
    status: rawRest.status === "interrupted" || rawRest.status === "completed" || rawRest.status === "in_progress" ? rawRest.status : "idle",
    restType: rawRest.restType === "short" || rawRest.restType === "long" ? rawRest.restType : null,
    startedAtMinutes: typeof rawRest.startedAtMinutes === "number" ? Math.max(0, Math.trunc(rawRest.startedAtMinutes)) : null,
    completedAtMinutes: typeof rawRest.completedAtMinutes === "number" ? Math.max(0, Math.trunc(rawRest.completedAtMinutes)) : null,
    requiredMinutes: Math.max(0, Math.trunc(rawRest.requiredMinutes ?? 0)),
    interruptionEventId: typeof rawRest.interruptionEventId === "string" ? rawRest.interruptionEventId : null,
    lastCompletedAtMinutes: typeof rawRest.lastCompletedAtMinutes === "number" ? Math.max(0, Math.trunc(rawRest.lastCompletedAtMinutes)) : null,
  };
  const rawSurvival = raw.survival && typeof raw.survival === "object" ? raw.survival as Partial<EngineSurvivalState> : {};
  const survival: EngineSurvivalState = {
    exhaustionLevel: Math.max(0, Math.trunc(rawSurvival.exhaustionLevel ?? 0)),
    exposure: Math.max(0, Math.trunc(rawSurvival.exposure ?? 0)),
    forcedMarches: Math.max(0, Math.trunc(rawSurvival.forcedMarches ?? 0)),
    weather: rawSurvival.weather === "rain" || rawSurvival.weather === "storm" ? rawSurvival.weather : "clear",
  };
  const worldClocks = Array.isArray(raw.worldClocks)
    ? raw.worldClocks.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const clock = candidate as Partial<EngineWorldClock>;
        if (typeof clock.id !== "string" || typeof clock.name !== "string") return [];
        return [{
          id: clock.id,
          name: clock.name,
          elapsedMinutes: Math.max(0, Math.trunc(clock.elapsedMinutes ?? 0)),
          provenance: {
            sourceCommandId: clock.provenance?.sourceCommandId ?? "legacy-time",
            sourceVersion: Math.max(0, Math.trunc(clock.provenance?.sourceVersion ?? 0)),
          },
        }];
      })
    : [];
  const projects = Array.isArray(raw.projects)
    ? raw.projects.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const project = candidate as Partial<EngineProjectClock>;
        if (typeof project.id !== "string" || project.definitionId !== "research-v1") return [];
        return [{
          id: project.id,
          definitionId: "research-v1" as const,
          title: project.title ?? "Research project",
          workRequiredMinutes: Math.max(1, Math.trunc(project.workRequiredMinutes ?? 480)),
          workCompletedMinutes: Math.max(0, Math.trunc(project.workCompletedMinutes ?? 0)),
          materialProperty: "project-material" as const,
          materialQuantity: Math.max(0, Math.trunc(project.materialQuantity ?? 1)),
          status: project.status === "completed" ? "completed" as const : "active" as const,
          startedAtMinutes: Math.max(0, Math.trunc(project.startedAtMinutes ?? totalMinutes)),
          completedAtMinutes: typeof project.completedAtMinutes === "number" ? Math.max(0, Math.trunc(project.completedAtMinutes)) : null,
          provenance: {
            sourceCommandId: project.provenance?.sourceCommandId ?? "legacy-time",
            sourceVersion: Math.max(0, Math.trunc(project.provenance?.sourceVersion ?? 0)),
          },
        }];
      })
    : [];
  return {
    ...defaults,
    gameTime,
    scheduledEvents,
    travel: raw.travel ?? null,
    rest,
    survival,
    worldClocks,
    randomEvents: Array.isArray(raw.randomEvents) ? raw.randomEvents as EngineRandomEventResolution[] : [],
    projects,
  };
}

const SOCIAL_MIN = -100;
const SOCIAL_MAX = 100;
const SOCIAL_COMMUNITY_ID = "local-community";
const SOCIAL_RUMOR_DELAY_MINUTES = 60;
const SOCIAL_CHECK_DC = 12;
const WITNESSED_THEFT_HEAT = 20;
const FENCE_TRADE_HEAT = 5;
const FENCE_PRICE_MULTIPLIER = 0.5;

export const NPC_AGENCY_CONFIG = Object.freeze({
  maxInputTokens: 8_000,
  maxOutputTokens: 1_000,
  timeoutMs: 10_000,
  maxConsecutiveFailures: 3,
  maxInvocationsPerDay: 50,
});

const NPC_AGENCY_ACTIONS: readonly EngineNpcAgencyAction[] = [
  "move_to_schedule",
  "report_crime",
  "rest",
  "trade_resource",
  "no_op",
];

function npcAgencyAction(value: unknown): EngineNpcAgencyAction | null {
  return NPC_AGENCY_ACTIONS.includes(value as EngineNpcAgencyAction) ? value as EngineNpcAgencyAction : null;
}

function normalizeNpcSchedule(value: unknown): EngineNpcScheduleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<EngineNpcScheduleEntry>;
    if (typeof raw.id !== "string" || typeof raw.locationRef !== "string") return [];
    if (typeof raw.startMinute !== "number" || typeof raw.endMinute !== "number") return [];
    return [{
      id: raw.id,
      locationRef: raw.locationRef,
      startMinute: Math.max(0, Math.min(1_439, Math.trunc(raw.startMinute))),
      endMinute: Math.max(0, Math.min(1_439, Math.trunc(raw.endMinute))),
    }];
  }).slice(0, 12);
}

function normalizeNpcGoals(value: unknown): EngineNpcGoal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<EngineNpcGoal>;
    if (typeof raw.id !== "string" || typeof raw.title !== "string") return [];
    return [{
      id: raw.id,
      title: raw.title,
      priority: typeof raw.priority === "number" ? Math.max(0, Math.min(100, Math.trunc(raw.priority))) : 0,
      status: raw.status === "blocked" || raw.status === "complete" ? raw.status : "active" as const,
    }];
  }).slice(0, 12);
}

function normalizeNpcResources(value: unknown, npcId: string): EngineNpcResourceState {
  const raw = value && typeof value === "object" ? value as Partial<EngineNpcResourceState> : {};
  const inventory = Array.isArray(raw.inventory)
    ? raw.inventory.flatMap((item) => {
        try {
          return [{
            ...normalizeInventoryItem(item),
            equipped: false,
            ownerRef: { kind: "actor" as const, id: npcId },
          }];
        } catch {
          return [];
        }
      }).slice(0, 40)
    : [];
  return {
    inventory,
    copper: typeof raw.copper === "number" ? Math.max(0, Math.min(100_000_000, Math.trunc(raw.copper))) : 0,
    actionPoints: typeof raw.actionPoints === "number" ? Math.max(0, Math.min(50, Math.trunc(raw.actionPoints))) : 1,
  };
}

function normalizeNpcOffers(value: unknown): EngineNpcActionOffer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<EngineNpcActionOffer>;
    const id = npcAgencyAction(raw.id);
    if (!id || raw.legal !== true || typeof raw.label !== "string") return [];
    return [{
      id,
      label: raw.label,
      legal: true as const,
      prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
      costs: {
        actionPoints: typeof raw.costs?.actionPoints === "number" ? Math.max(0, Math.trunc(raw.costs.actionPoints)) : 0,
        copper: typeof raw.costs?.copper === "number" ? Math.max(0, Math.trunc(raw.costs.copper)) : 0,
        itemIds: Array.isArray(raw.costs?.itemIds) ? raw.costs!.itemIds!.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
      },
    }];
  }).slice(0, NPC_AGENCY_ACTIONS.length);
}

function normalizeNpcInvocation(value: unknown): EngineNpcInvocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<EngineNpcInvocation>;
    const action = raw.selectedOfferId === null ? null : npcAgencyAction(raw.selectedOfferId);
    if (typeof raw.id !== "string" || typeof raw.triggerId !== "string" || typeof raw.npcId !== "string") return [];
    return [{
      id: raw.id,
      triggerId: raw.triggerId,
      trigger: ["time_advance", "scene_enter", "scene_exit", "witnessed_event", "quest_clock", "combat_turn", "operator_batch"].includes(raw.trigger as string)
        ? raw.trigger as EngineNpcTickCommand["trigger"] : "operator_batch",
      npcId: raw.npcId,
      provider: raw.provider === "openrouter" ? "openrouter" as const : "deterministic" as const,
      model: typeof raw.model === "string" ? raw.model : "npc-policy-v1",
      providerRequestId: typeof raw.providerRequestId === "string" ? raw.providerRequestId : null,
      status: raw.status === "success"
        || raw.status === "timeout_before_output"
        || raw.status === "interrupted_after_output"
        || raw.status === "invalid_response"
        ? raw.status
        : raw.provider === "openrouter" ? "provider_error" as const : "success" as const,
      inputTokens: typeof raw.inputTokens === "number" ? Math.max(0, Math.trunc(raw.inputTokens)) : 0,
      cacheTokens: typeof raw.cacheTokens === "number" ? Math.max(0, Math.trunc(raw.cacheTokens)) : 0,
      reasoningTokens: typeof raw.reasoningTokens === "number" ? Math.max(0, Math.trunc(raw.reasoningTokens)) : 0,
      outputTokens: typeof raw.outputTokens === "number" ? Math.max(0, Math.trunc(raw.outputTokens)) : 0,
      costUsd: typeof raw.costUsd === "number" ? Math.max(0, raw.costUsd) : 0,
      latencyMs: typeof raw.latencyMs === "number" ? Math.max(0, Math.trunc(raw.latencyMs)) : 0,
      outcome: raw.outcome === "selected" || raw.outcome === "circuit_open" || raw.outcome === "rejected" ? raw.outcome : "fallback" as const,
      fallback: raw.fallback !== false,
      selectedOfferId: action,
      rationale: typeof raw.rationale === "string" ? raw.rationale.slice(0, 240) : null,
      budget: {
        maxInputTokens: typeof raw.budget?.maxInputTokens === "number" ? Math.max(0, Math.trunc(raw.budget.maxInputTokens)) : NPC_AGENCY_CONFIG.maxInputTokens,
        maxOutputTokens: typeof raw.budget?.maxOutputTokens === "number" ? Math.max(0, Math.trunc(raw.budget.maxOutputTokens)) : NPC_AGENCY_CONFIG.maxOutputTokens,
        timeoutMs: typeof raw.budget?.timeoutMs === "number" ? Math.max(0, Math.trunc(raw.budget.timeoutMs)) : NPC_AGENCY_CONFIG.timeoutMs,
        maxConsecutiveFailures: typeof raw.budget?.maxConsecutiveFailures === "number" ? Math.max(0, Math.trunc(raw.budget.maxConsecutiveFailures)) : NPC_AGENCY_CONFIG.maxConsecutiveFailures,
        maxInvocationsPerDay: typeof raw.budget?.maxInvocationsPerDay === "number" ? Math.max(0, Math.trunc(raw.budget.maxInvocationsPerDay)) : NPC_AGENCY_CONFIG.maxInvocationsPerDay,
      },
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    }];
  }).slice(-100);
}

function normalizeNpcAgency(value: unknown, npcId: string): EngineNpcAgencyState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Partial<EngineNpcAgencyState>;
  if (raw.actorType !== "merchant" && raw.actorType !== "guard" && raw.actorType !== "traveler") return undefined;
  const maxHp = typeof raw.maxHp === "number" ? Math.max(1, Math.min(10_000, Math.trunc(raw.maxHp))) : 1;
  const hp = typeof raw.hp === "number" ? Math.max(0, Math.min(maxHp, Math.trunc(raw.hp))) : maxHp;
  const lifecycleState = raw.lifecycleState === "dead" || raw.lifecycleState === "dying" || raw.lifecycleState === "stable"
    ? raw.lifecycleState : hp <= 0 ? "dead" as const : "conscious" as const;
  const pendingRaw = raw.pendingAction && typeof raw.pendingAction === "object" ? raw.pendingAction as Partial<EngineNpcPendingAction> : null;
  const selectedOfferId = pendingRaw ? npcAgencyAction(pendingRaw.selectedOfferId) : null;
  const pendingAction = pendingRaw && typeof pendingRaw.triggerId === "string" && selectedOfferId
    ? {
        triggerId: pendingRaw.triggerId,
        trigger: ["time_advance", "scene_enter", "scene_exit", "witnessed_event", "quest_clock", "combat_turn", "operator_batch"].includes(pendingRaw.trigger as string)
          ? pendingRaw.trigger as EngineNpcTickCommand["trigger"] : "operator_batch",
        offers: normalizeNpcOffers(pendingRaw.offers),
        selectedOfferId,
        createdAt: typeof pendingRaw.createdAt === "string" ? pendingRaw.createdAt : new Date(0).toISOString(),
      }
    : null;
  return {
    actorType: raw.actorType,
    locationRef: typeof raw.locationRef === "string" ? raw.locationRef : "world",
    schedule: normalizeNpcSchedule(raw.schedule),
    goals: normalizeNpcGoals(raw.goals),
    resources: normalizeNpcResources(raw.resources, npcId),
    hp,
    maxHp,
    lifecycleState,
    pendingAction,
    completedTriggerIds: Array.isArray(raw.completedTriggerIds) ? raw.completedTriggerIds.filter((id): id is string => typeof id === "string").slice(-100) : [],
    reportedCrimeIds: Array.isArray(raw.reportedCrimeIds) ? raw.reportedCrimeIds.filter((id): id is string => typeof id === "string").slice(-100) : [],
    invocations: normalizeNpcInvocation(raw.invocations),
    consecutiveFailures: typeof raw.consecutiveFailures === "number" ? Math.max(0, Math.min(NPC_AGENCY_CONFIG.maxConsecutiveFailures, Math.trunc(raw.consecutiveFailures))) : 0,
    circuitState: raw.circuitState === "open" ? "open" : "closed",
    invocationDay: typeof raw.invocationDay === "number" ? Math.max(0, Math.trunc(raw.invocationDay)) : 1,
    invocationsToday: typeof raw.invocationsToday === "number" ? Math.max(0, Math.min(NPC_AGENCY_CONFIG.maxInvocationsPerDay, Math.trunc(raw.invocationsToday))) : 0,
  };
}

function mergeNpcAgency(
  existing: EngineNpcAgencyState | undefined,
  input: NonNullable<EngineNpcPatch["agency"]>,
  npcId: string,
): EngineNpcAgencyState {
  if (!existing) return normalizeNpcAgency(input, npcId)!;
  return normalizeNpcAgency({
    ...existing,
    actorType: input.actorType,
    locationRef: input.locationRef,
    schedule: input.schedule,
    goals: input.goals,
  }, npcId)!;
}

function clampSocial(value: unknown, fallback = 0): number {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(SOCIAL_MIN, Math.min(SOCIAL_MAX, number));
}

function socialProvenance(value: unknown, fallbackCommandId = "legacy-social", fallbackVersion = 0): { sourceCommandId: string; sourceVersion: number; occurredAt: string } {
  const raw = value && typeof value === "object" ? value as { sourceCommandId?: unknown; sourceVersion?: unknown; occurredAt?: unknown } : {};
  return {
    sourceCommandId: typeof raw.sourceCommandId === "string" ? raw.sourceCommandId : fallbackCommandId,
    sourceVersion: typeof raw.sourceVersion === "number" ? Math.max(0, Math.trunc(raw.sourceVersion)) : fallbackVersion,
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : new Date(0).toISOString(),
  };
}

function defaultSocialState(): EngineSocialState {
  return { relationships: [], factions: [], reputations: [], heat: [], obligations: [], crimes: [], rumors: [] };
}

function normalizeSocialState(value: unknown): EngineSocialState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultSocialState();
  const raw = value as Partial<EngineSocialState>;
  const relationships = Array.isArray(raw.relationships)
    ? raw.relationships.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const relation = candidate as Partial<EngineSocialRelationship>;
        if (typeof relation.id !== "string" || typeof relation.actorA !== "string" || typeof relation.actorB !== "string") return [];
        return [{
          id: relation.id,
          actorA: relation.actorA,
          actorB: relation.actorB,
          trust: clampSocial(relation.trust),
          fear: clampSocial(relation.fear),
          loyalty: clampSocial(relation.loyalty),
          hostility: clampSocial(relation.hostility),
          updatedAt: typeof relation.updatedAt === "string" ? relation.updatedAt : new Date(0).toISOString(),
          provenance: socialProvenance(relation.provenance),
        }];
      })
    : [];
  const factions = Array.isArray(raw.factions)
    ? raw.factions.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const faction = candidate as Partial<EngineSocialFaction>;
        if (typeof faction.id !== "string" || typeof faction.name !== "string") return [];
        const members = Array.isArray(faction.members)
          ? faction.members.flatMap((member) => {
              if (!member || typeof member !== "object" || typeof (member as { actorId?: unknown }).actorId !== "string") return [];
              const entry = member as { actorId: string; role?: unknown; standing?: unknown };
              return [{ actorId: entry.actorId, role: typeof entry.role === "string" ? entry.role : null, standing: clampSocial(entry.standing) }];
            }).slice(0, 100)
          : [];
        return [{
          id: faction.id,
          name: faction.name,
          communityId: typeof faction.communityId === "string" ? faction.communityId : SOCIAL_COMMUNITY_ID,
          members,
          provenance: socialProvenance(faction.provenance),
        }];
      })
    : [];
  const reputations = Array.isArray(raw.reputations)
    ? raw.reputations.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const reputation = candidate as Partial<EngineSocialReputation>;
        if (typeof reputation.id !== "string" || typeof reputation.actorId !== "string") return [];
        return [{
          id: reputation.id,
          actorId: reputation.actorId,
          communityId: typeof reputation.communityId === "string" ? reputation.communityId : SOCIAL_COMMUNITY_ID,
          score: clampSocial(reputation.score),
          provenance: socialProvenance(reputation.provenance),
        }];
      })
    : [];
  const heat = Array.isArray(raw.heat)
    ? raw.heat.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const record = candidate as Partial<EngineSocialHeat>;
        if (typeof record.id !== "string" || typeof record.actorId !== "string") return [];
        return [{
          id: record.id,
          actorId: record.actorId,
          communityId: typeof record.communityId === "string" ? record.communityId : SOCIAL_COMMUNITY_ID,
          score: Math.max(0, Math.min(100, typeof record.score === "number" && Number.isFinite(record.score) ? Math.trunc(record.score) : 0)),
          provenance: socialProvenance(record.provenance),
        }];
      }).slice(-200)
    : [];
  const obligations = Array.isArray(raw.obligations)
    ? raw.obligations.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const obligation = candidate as Partial<EngineSocialObligation>;
        if (typeof obligation.id !== "string" || typeof obligation.actorId !== "string" || typeof obligation.counterpartyId !== "string" || typeof obligation.terms !== "string") return [];
        return [{
          id: obligation.id,
          kind: obligation.kind === "debt" || obligation.kind === "favor" ? obligation.kind : "promise" as const,
          actorId: obligation.actorId,
          counterpartyId: obligation.counterpartyId,
          terms: obligation.terms,
          status: obligation.status === "fulfilled" || obligation.status === "breached" ? obligation.status : "open" as const,
          deadlineAtMinutes: typeof obligation.deadlineAtMinutes === "number" ? Math.max(0, Math.trunc(obligation.deadlineAtMinutes)) : null,
          consequenceApplied: obligation.consequenceApplied === true,
          createdAt: typeof obligation.createdAt === "string" ? obligation.createdAt : new Date(0).toISOString(),
          resolvedAt: typeof obligation.resolvedAt === "string" ? obligation.resolvedAt : null,
          provenance: socialProvenance(obligation.provenance),
        }];
      }).slice(-200)
    : [];
  const crimes = Array.isArray(raw.crimes)
    ? raw.crimes.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const crime = candidate as Partial<EngineSocialCrimeEvidence>;
        if (typeof crime.id !== "string" || typeof crime.actorId !== "string" || typeof crime.victimId !== "string") return [];
        return [{
          id: crime.id,
          kind: crime.kind === "promise-breach" ? "promise-breach" as const : "theft" as const,
          actorId: crime.actorId,
          victimId: crime.victimId,
          itemId: typeof crime.itemId === "string" ? crime.itemId : null,
          status: crime.status === "proven" ? "proven" as const : "allegation" as const,
          witnessIds: Array.isArray(crime.witnessIds) ? crime.witnessIds.filter((id): id is string => typeof id === "string").slice(0, 10) : [],
          evidenceIds: Array.isArray(crime.evidenceIds) ? crime.evidenceIds.filter((id): id is string => typeof id === "string").slice(0, 20) : [],
          createdAt: typeof crime.createdAt === "string" ? crime.createdAt : new Date(0).toISOString(),
          provenance: socialProvenance(crime.provenance),
        }];
      }).slice(-200)
    : [];
  const rumors = Array.isArray(raw.rumors)
    ? raw.rumors.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const rumor = candidate as Partial<EngineSocialRumor>;
        if (typeof rumor.id !== "string" || typeof rumor.sourceRef !== "string" || typeof rumor.sourceActorId !== "string" || typeof rumor.targetId !== "string" || typeof rumor.text !== "string") return [];
        return [{
          id: rumor.id,
          sourceRef: rumor.sourceRef,
          sourceActorId: rumor.sourceActorId,
          targetId: rumor.targetId,
          text: rumor.text,
          confidence: Math.max(0, Math.min(1, typeof rumor.confidence === "number" ? rumor.confidence : 0.5)),
          truthRelation: rumor.truthRelation === "true" || rumor.truthRelation === "false" ? rumor.truthRelation : "unknown" as const,
          status: rumor.status === "propagated" || rumor.status === "corroborated" ? rumor.status : "pending" as const,
          createdAt: typeof rumor.createdAt === "string" ? rumor.createdAt : new Date(0).toISOString(),
          propagateAtMinutes: typeof rumor.propagateAtMinutes === "number" ? Math.max(0, Math.trunc(rumor.propagateAtMinutes)) : 0,
          propagatedAtMinutes: typeof rumor.propagatedAtMinutes === "number" ? Math.max(0, Math.trunc(rumor.propagatedAtMinutes)) : null,
          provenance: socialProvenance(rumor.provenance),
        }];
      }).slice(-200)
    : [];
  return { relationships: relationships.slice(-200), factions: factions.slice(-100), reputations: reputations.slice(-200), heat, obligations, crimes, rumors };
}

function ensureSocialState(state: LanternCampaignState): EngineSocialState {
  state.social = normalizeSocialState(state.social);
  return state.social;
}

function socialTargetExists(state: LanternCampaignState, targetId: string): boolean {
  return targetId === state.actorId
    || Boolean(state.worldContext?.npcs.some((npc) => npc.id === targetId))
    || Boolean(state.worldContext?.merchants.some((merchant) => merchant.id === targetId));
}

function socialRelationshipId(actorA: string, actorB: string): string {
  return `relationship:${actorA}:${actorB}`;
}

function socialRelationship(
  state: LanternCampaignState,
  actorA: string,
  actorB: string,
  sourceCommandId = "legacy-social",
  sourceVersion = state.version,
): EngineSocialRelationship {
  const social = ensureSocialState(state);
  const existing = social.relationships.find((candidate) =>
    (candidate.actorA === actorA && candidate.actorB === actorB)
    || (candidate.actorA === actorB && candidate.actorB === actorA)
  );
  if (existing) return existing;
  const npc = state.worldContext?.npcs.find((candidate) => candidate.id === actorB || candidate.id === actorA);
  const relation: EngineSocialRelationship = {
    id: socialRelationshipId(actorA, actorB),
    actorA,
    actorB,
    trust: clampSocial(npc?.relationshipScore ?? 0),
    fear: 0,
    loyalty: 0,
    hostility: 0,
    updatedAt: new Date().toISOString(),
    provenance: { sourceCommandId, sourceVersion, occurredAt: new Date().toISOString() },
  };
  social.relationships.push(relation);
  return relation;
}

function adjustSocialRelationship(
  state: LanternCampaignState,
  actorA: string,
  actorB: string,
  delta: number,
  sourceCommandId: string,
  sourceVersion: number,
): { before: EngineSocialRelationship; after: EngineSocialRelationship } {
  const relation = socialRelationship(state, actorA, actorB, sourceCommandId, sourceVersion);
  const before = { ...relation, provenance: { ...relation.provenance } };
  relation.trust = clampSocial(relation.trust + delta);
  relation.hostility = clampSocial(relation.hostility + (delta < 0 ? Math.min(10, Math.abs(delta)) : -Math.min(5, delta)));
  relation.loyalty = clampSocial(relation.loyalty + (delta > 0 ? Math.min(5, delta) : 0));
  relation.updatedAt = new Date().toISOString();
  relation.provenance = { sourceCommandId, sourceVersion, occurredAt: relation.updatedAt };
  const npc = state.worldContext?.npcs.find((candidate) => candidate.id === actorB || candidate.id === actorA);
  if (npc && npc.id === actorB) npc.relationshipScore = relation.trust;
  return { before, after: { ...relation, provenance: { ...relation.provenance } } };
}

function adjustSocialReputation(
  state: LanternCampaignState,
  actorId: string,
  communityId: string,
  delta: number,
  sourceCommandId: string,
  sourceVersion: number,
): { before: EngineSocialReputation | null; after: EngineSocialReputation } {
  const social = ensureSocialState(state);
  const existing = social.reputations.find((candidate) => candidate.actorId === actorId && candidate.communityId === communityId);
  const now = new Date().toISOString();
  const before = existing ? { ...existing, provenance: { ...existing.provenance } } : null;
  const reputation = existing ?? {
    id: `reputation:${actorId}:${communityId}`,
    actorId,
    communityId,
    score: 0,
    provenance: { sourceCommandId, sourceVersion, occurredAt: now },
  };
  if (!existing) social.reputations.push(reputation);
  reputation.score = clampSocial(reputation.score + delta);
  reputation.provenance = { sourceCommandId, sourceVersion, occurredAt: now };
  for (const faction of social.factions) {
    if (faction.communityId !== communityId) continue;
    const member = faction.members.find((candidate) => candidate.actorId === actorId);
    if (member) member.standing = clampSocial(member.standing + delta);
  }
  return { before, after: { ...reputation, provenance: { ...reputation.provenance } } };
}

function adjustSocialHeat(
  state: LanternCampaignState,
  actorId: string,
  communityId: string,
  delta: number,
  sourceCommandId: string,
  sourceVersion: number,
): EngineSocialHeat {
  const social = ensureSocialState(state);
  const now = new Date().toISOString();
  const existing = social.heat!.find((candidate) => candidate.actorId === actorId && candidate.communityId === communityId);
  const record = existing ?? {
    id: `heat:${actorId}:${communityId}`,
    actorId,
    communityId,
    score: 0,
    provenance: { sourceCommandId, sourceVersion, occurredAt: now },
  };
  if (!existing) social.heat!.push(record);
  record.score = Math.max(0, Math.min(100, record.score + Math.trunc(delta)));
  record.provenance = { sourceCommandId, sourceVersion, occurredAt: now };
  return record;
}

function projectSocialForActor(actorId: string, state: LanternCampaignState): EngineSocialProjection {
  const social = normalizeSocialState(state.social);
  return {
    relationships: social.relationships
      .filter((relation) => relation.actorA === actorId || relation.actorB === actorId)
      .map(({ id, actorA, actorB, trust, fear, loyalty, hostility, updatedAt }) => ({ id, actorA, actorB, trust, fear, loyalty, hostility, updatedAt })),
    factions: social.factions.flatMap((faction) => {
      const member = faction.members.find((candidate) => candidate.actorId === actorId);
      return member ? [{ id: faction.id, name: faction.name, communityId: faction.communityId, standing: member.standing }] : [];
    }),
    reputations: social.reputations.filter((reputation) => reputation.actorId === actorId).map((reputation) => ({ ...reputation, provenance: { ...reputation.provenance } })),
    heat: social.heat!.filter((record) => record.actorId === actorId).map((record) => ({ ...record, provenance: { ...record.provenance } })),
    obligations: social.obligations
      .filter((obligation) => obligation.status === "open" && (obligation.actorId === actorId || obligation.counterpartyId === actorId))
      .map((obligation) => ({ ...obligation, provenance: { ...obligation.provenance } })),
    rumors: social.rumors
      .filter((rumor) => rumor.status !== "pending")
      .map((rumor) => ({ ...rumor, provenance: { ...rumor.provenance } })),
  };
}

export function normalizeContentPolicy(policy: EngineContentPolicy): EngineContentPolicy {
  const gamesystem = policy.gamesystem?.trim();
  const baseDocumentKey = policy.baseDocumentKey?.trim();
  const allowedDocumentKeys = [...new Set(
    (policy.allowedDocumentKeys ?? []).map((key) => key.trim()).filter(Boolean)
  )].sort();
  const allowedLicenseKeys = [...new Set(
    (policy.allowedLicenseKeys ?? []).map((key) => key.trim()).filter(Boolean)
  )].sort();
  if (!gamesystem || !baseDocumentKey || allowedLicenseKeys.length === 0) {
    return defaultContentPolicy();
  }
  if (!allowedDocumentKeys.includes(baseDocumentKey)) allowedDocumentKeys.push(baseDocumentKey);
  allowedDocumentKeys.sort();
  return { gamesystem, baseDocumentKey, allowedDocumentKeys, allowedLicenseKeys };
}

export function createInitialCampaign(
  accountId: string,
  actorId: string,
  campaignId = randomUUID(),
  campaign: EngineCampaignProfile = defaultCampaignProfile(),
  rulesVersion = OPEN5E_RULES_VERSION,
  contentPolicy: EngineContentPolicy = defaultContentPolicy(),
  experienceProfile?: EngineExperienceProfileInput
): LanternCampaignState {
  const now = new Date().toISOString();
  const character = createUnconfiguredCharacter(randomUUID());
  const normalizedExperienceProfile = normalizeExperienceProfileInput(experienceProfile)
    ?? experienceProfileInput(defaultExperienceProfile(now));
  return {
    id: campaignId,
    accountId,
    actorId,
    version: 0,
    rulesVersion,
    contentPolicy: normalizeContentPolicy(contentPolicy),
    campaign,
    experienceProfile: buildExperienceProfile(normalizedExperienceProfile, now),
    adjudicationHistory: [],
    failurePressures: [],
    phase: "character_creation",
    tutorialStep: 0,
    characterCreation: { abilityScoreDraft: null },
    advancementPolicy: defaultAdvancementPolicy(),
    pendingAdvancement: null,
    claimedRewards: [],
    controlledActors: [],
    party: null,
    time: defaultTimeState(),
    social: defaultSocialState(),
    worldContext: null,
    runtimeContent: emptyRuntimeContentState(),
    proceduralNotices: [],
    worldFacts: [],
    actorKnowledge: [],
    playerNotes: [],
    character,
    combat: emptyCombat(),
    quest: {
      id: "first-light",
      title: "The first chapter",
      objective: "Create a character and discover what your world is about.",
      status: "active",
      reward: { xp: 50, copper: 1_200 },
      rewardClaimed: false,
      progress: 0,
    },
    quests: [
      {
        id: "first-light",
        title: "The first chapter",
        objective: "Create a character and discover what your world is about.",
        status: "active",
        reward: { xp: 50, copper: 1_200 },
        rewardClaimed: false,
        progress: 0,
      },
    ],
    corpses: [],
    effects: [],
    improvEffects: [],
    currentBeat: null,
    situation: null,
    productionRoom: null,
    orchestration: emptyOrchestrationState(),
    suggestedActions: [],
    log: [
      makeMessage(
        "system",
        "Campaign created. The world is yours to shape; begin by creating the character who will enter it."
      ),
    ],
    lastRoll: null,
    updatedAt: now,
  };
}

export function normalizeCampaignState(state: LanternCampaignState): LanternCampaignState {
  const next = cloneCampaign(state) as LanternCampaignState & {
    campaign?: EngineCampaignProfile;
    phase?: EngineCampaignPhase;
    tutorialStep?: number;
    characterCreation?: EngineCharacterCreationState;
    scene?: unknown;
    playerNotes?: unknown;
    contentPolicy?: EngineContentPolicy;
    experienceProfile?: unknown;
    adjudicationHistory?: unknown;
    failurePressures?: unknown;
    worldFacts?: unknown;
    worldObjects?: unknown;
    actorKnowledge?: unknown;
    proceduralNotices?: unknown;
    productionRoom?: unknown;
    orchestration?: unknown;
    runtimeContent?: unknown;
    time?: unknown;
  };
  next.time = normalizeTimeState(next.time);
  next.social = normalizeSocialState(next.social);
  next.claimedRewards = Array.isArray((next as LanternCampaignState & { claimedRewards?: unknown }).claimedRewards)
    ? [...new Set((next as LanternCampaignState & { claimedRewards?: unknown }).claimedRewards!.filter((key): key is string => typeof key === "string"))]
    : [];
  next.controlledActors = normalizeControlledActors((next as LanternCampaignState & { controlledActors?: unknown }).controlledActors, next);
  next.party = normalizePartyState((next as LanternCampaignState & { party?: unknown }).party, next);
  const terminalControlledActorIds = new Set(next.controlledActors.filter((actor) => actor.status !== "active").map((actor) => actor.id));
  for (const actor of next.controlledActors) {
    if (actor.status !== "active" && actor.sourceRef) removeRuntimeSource(next, actor.sourceRef);
  }
  if (terminalControlledActorIds.size > 0) {
    next.time.scheduledEvents = next.time.scheduledEvents.filter((event) => !(event.status === "pending" && event.targetRef && terminalControlledActorIds.has(event.targetRef)));
  }
  if (!next.campaign) next.campaign = defaultCampaignProfile();
  next.contentPolicy = normalizeContentPolicy(next.contentPolicy ?? defaultContentPolicy());
  next.experienceProfile = normalizeExperienceProfile(next.experienceProfile, next.updatedAt);
  next.adjudicationHistory = Array.isArray(next.adjudicationHistory)
    ? next.adjudicationHistory.slice(-100) as EngineAdjudicationAttempt[]
    : [];
  next.failurePressures = Array.isArray(next.failurePressures)
    ? next.failurePressures.flatMap((pressure) => {
      const parsed = engineFailurePressureSchema.safeParse(pressure);
      return parsed.success ? [parsed.data] : [];
    }).slice(-40)
    : [];
  next.worldFacts = normalizeWorldFacts(next.worldFacts);
  next.runtimeContent = normalizeRuntimeContentState(next.runtimeContent);
  next.proceduralNotices = normalizeProceduralNotices((next as LanternCampaignState & { proceduralNotices?: unknown }).proceduralNotices);
  next.actorKnowledge = normalizeKnowledgeRecords(next.actorKnowledge);
  next.productionRoom = next.productionRoom ? parseProductionRoomState(next.productionRoom) : null;
  next.orchestration = normalizeOrchestrationState(next.orchestration, next.updatedAt);
  const normalizedOrchestration = (next as LanternCampaignState).orchestration ?? emptyOrchestrationState();
  const productionScene = (next as LanternCampaignState).productionRoom?.activeScene;
  if (!normalizedOrchestration.activeScene && productionScene) {
    const projection = projectSceneForActor(productionScene, next.actorId);
    const migratedScene = sceneStateFromProjection({
      sceneId: projection.sceneId,
      revision: projection.revision,
      campaignVersion: projection.campaignVersion,
      mode: projection.mode,
      immediateQuestion: projection.immediateQuestion,
      pressureRefs: projection.pressureRefs,
      committedEventRefs: projection.committedEventIds,
      actorId: next.actorId,
      situationRefs: next.situation ? [next.situation.id] : [],
      now: next.updatedAt,
    });
    const migratedHooks = hooksForScene(migratedScene);
    normalizedOrchestration.activeScene = {
      ...activateScene(migratedScene, next.updatedAt),
      hookRefs: migratedHooks.map((hook) => hook.id),
    };
    normalizedOrchestration.hooks = migratedHooks;
    (next as LanternCampaignState).orchestration = normalizedOrchestration;
  }
  next.corpses = normalizeCorpses((next as LanternCampaignState & { corpses?: unknown }).corpses);
  next.advancementPolicy = normalizeAdvancementPolicy((next as LanternCampaignState & { advancementPolicy?: unknown }).advancementPolicy);
  next.pendingAdvancement = normalizePendingAdvancement((next as LanternCampaignState & { pendingAdvancement?: unknown }).pendingAdvancement);
  if (!next.tutorialStep && next.tutorialStep !== 0) next.tutorialStep = 0;
  if (!next.characterCreation) next.characterCreation = { abilityScoreDraft: null };
  if (!next.characterCreation.abilityScoreDraft) next.characterCreation.abilityScoreDraft = null;
  if (!next.phase) next.phase = next.version === 0 ? "character_creation" : "sandbox";
  if (next.character.created === undefined) {
    next.character.created = Boolean(next.character.name && next.character.name !== "Lantern Seeker");
  }
  if (next.character.name === "Lantern Seeker") {
    next.character = createUnconfiguredCharacter(next.character.id);
    next.phase = "character_creation";
    next.tutorialStep = 0;
    next.worldContext = null;
    next.proceduralNotices = [];
    next.worldFacts = [];
    next.actorKnowledge = [];
    next.playerNotes = [];
    next.advancementPolicy = defaultAdvancementPolicy();
    next.pendingAdvancement = null;
    next.claimedRewards = [];
    next.controlledActors = [];
    next.party = null;
    next.situation = null;
    next.orchestration = emptyOrchestrationState();
    next.quest = {
      id: "first-light",
      title: "The first chapter",
      objective: "Create a character and discover what your world is about.",
      status: "active",
      reward: { xp: 50, copper: 1_200 },
      rewardClaimed: false,
      progress: 0,
    };
    next.quests = [next.quest];
  }
  if (!Array.isArray(next.playerNotes)) next.playerNotes = [];
  if (!next.worldContext) next.worldContext = null;
  else {
    next.worldContext.npcs = Array.isArray(next.worldContext.npcs) ? next.worldContext.npcs : [];
    next.worldContext.merchants = Array.isArray(next.worldContext.merchants) ? next.worldContext.merchants : [];
    next.worldContext.objects = normalizeWorldObjects(next.worldContext.objects, next.worldContext.id);
    next.worldContext.merchants = next.worldContext.merchants.map(normalizeMerchant);
    next.worldContext.npcs = next.worldContext.npcs.map(normalizeNpc);
  }
  next.situation = normalizeSituation((next as LanternCampaignState & { situation?: unknown }).situation, next);
  next.character = recalculateProgressionOnLoad(normalizeCharacter(next.character));
  reconcileWorldObjectInventory(next);
  next.combat = normalizeCombat(next.combat, next.actorId, next.character.speed, next.version);
  next.quest = normalizeQuest(next.quest ?? ({} as EngineQuest));
  if (!Array.isArray(next.quests) || !next.quests.length) next.quests = [next.quest];
  next.quests = next.quests.map(normalizeQuest);
  const currentQuest = next.quests.find((quest) => quest.id === next.quest.id);
  if (currentQuest) next.quest = currentQuest;
  if (!Array.isArray(next.improvEffects)) next.improvEffects = [];
  next.effects = normalizeEffects((next as LanternCampaignState & { effects?: unknown }).effects, next);
  normalizeLifecycleConsistency(next);
  // Persisted timed stat effects (for example Shield) are authoritative for
  // the derived AC projection after a save/load or process restart.
  next.character.ac = deriveArmorClass(next.character, next.effects);
  syncConditionProjections(next);
  if (next.currentBeat === undefined) next.currentBeat = null;
  if (!Array.isArray(next.suggestedActions)) next.suggestedActions = [];
  // Discard the former fixed scene graph. A campaign earns its current context
  // from play; old scene data must not leak back into the player experience.
  delete next.scene;
  return next;
}

const CONTROLLED_ACTOR_PROFILE_REVISION = "controlled-actors-v1";

function controlledActorProfile(profileId: EngineControlledActorProfile): {
  profileId: EngineControlledActorProfile;
  kind: "companion" | "summon";
  name: string;
  maxHp: number;
  armorClass: number;
  savingThrows: Record<EngineAbility, number>;
  attack: EngineControlledActorAttack;
  expiresAfterMinutes: number | null;
} {
  if (profileId === "summon-scout-v1") {
    return {
      profileId,
      kind: "summon",
      name: "Arcane scout",
      maxHp: 8,
      armorClass: 10,
      savingThrows: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      attack: { attackBonus: 3, damageDice: "1d4", damageBonus: 1, damageType: "force", rangeFeet: 30 },
      expiresAfterMinutes: 60,
    };
  }
  return {
    profileId: "familiar-scout-v1",
    kind: "companion",
    name: "Scout familiar",
    maxHp: 5,
    armorClass: 10,
    savingThrows: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    attack: { attackBonus: 4, damageDice: "1d4", damageBonus: 2, damageType: "piercing", rangeFeet: 5 },
    expiresAfterMinutes: null,
  };
}

function isControlledActorProfile(value: unknown): value is EngineControlledActorProfile {
  return value === "familiar-scout-v1" || value === "summon-scout-v1";
}

function controlledActorPosition(state: LanternCampaignState): EngineTacticalPosition {
  if (state.combat?.status === "active" && state.combat.tactical && isTacticalPosition(state.combat.tactical.actorPosition)) {
    return { ...state.combat.tactical.actorPosition };
  }
  return { frameId: `campaign:${state.id}`, x: 0, y: 0, z: 0 };
}

function normalizeControlledActors(value: unknown, state: LanternCampaignState): EngineControlledActor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Partial<EngineControlledActor>;
    if (typeof raw.id !== "string" || !raw.id || !isControlledActorProfile(raw.profileId)) return [];
    const profile = controlledActorProfile(raw.profileId);
    const createdAtMinutes = typeof raw.createdAtMinutes === "number" && Number.isFinite(raw.createdAtMinutes)
      ? Math.max(0, Math.trunc(raw.createdAtMinutes))
      : state.time.gameTime.totalMinutes;
    const position = isTacticalPosition(raw.position) ? { ...raw.position } : controlledActorPosition(state);
    const hp = Math.max(0, Math.min(profile.maxHp, Math.trunc(typeof raw.hp === "number" ? raw.hp : profile.maxHp)));
    const requestedStatus = raw.status === "incapacitated" || raw.status === "dead" || raw.status === "dismissed" || raw.status === "expired" ? raw.status : "active";
    const status = requestedStatus === "active" && hp <= 0 ? "dead" : requestedStatus;
    const expiresAtMinutes = profile.expiresAfterMinutes === null
      ? null
      : Math.max(createdAtMinutes, Math.trunc(typeof raw.expiresAtMinutes === "number" ? raw.expiresAtMinutes : createdAtMinutes + profile.expiresAfterMinutes));
    const lastBehavior = raw.lastBehavior === "attack" || raw.lastBehavior === "guard" || raw.lastBehavior === "follow" ? raw.lastBehavior : "idle";
    const terminalAtMinutes = typeof raw.terminalAtMinutes === "number" ? Math.max(0, Math.trunc(raw.terminalAtMinutes)) : null;
    return [{
      id: raw.id,
      profileId: profile.profileId,
      kind: profile.kind,
      name: profile.name,
      ownerActorId: typeof raw.ownerActorId === "string" && raw.ownerActorId ? raw.ownerActorId : state.actorId,
      controllerActorId: typeof raw.controllerActorId === "string" && raw.controllerActorId ? raw.controllerActorId : state.actorId,
      summonerActorId: profile.kind === "summon"
        ? (typeof raw.summonerActorId === "string" && raw.summonerActorId ? raw.summonerActorId : state.actorId)
        : null,
      riderActorId: typeof raw.riderActorId === "string" && raw.riderActorId ? raw.riderActorId : null,
      passengerOfActorId: typeof raw.passengerOfActorId === "string" && raw.passengerOfActorId ? raw.passengerOfActorId : null,
      employerActorId: typeof raw.employerActorId === "string" && raw.employerActorId ? raw.employerActorId : null,
      charmControllerActorId: typeof raw.charmControllerActorId === "string" && raw.charmControllerActorId ? raw.charmControllerActorId : null,
      factionId: typeof raw.factionId === "string" && raw.factionId ? raw.factionId : null,
      sourceRef: typeof raw.sourceRef === "string" && raw.sourceRef ? raw.sourceRef : profile.kind === "summon" ? `controlled-actor-source:${raw.id}` : null,
      status,
      hp,
      maxHp: profile.maxHp,
      position,
      footprint: normalizeFootprint(raw.footprint),
      senses: {
        normalVision: raw.senses?.normalVision !== false,
        darkvisionFeet: typeof raw.senses?.darkvisionFeet === "number" ? Math.max(0, Math.trunc(raw.senses.darkvisionFeet)) : 30,
        blindsightFeet: typeof raw.senses?.blindsightFeet === "number" ? Math.max(0, Math.trunc(raw.senses.blindsightFeet)) : 0,
        tremorsenseFeet: typeof raw.senses?.tremorsenseFeet === "number" ? Math.max(0, Math.trunc(raw.senses.tremorsenseFeet)) : 0,
        hearing: raw.senses?.hearing !== false,
      },
      turnPolicy: "controller-turn",
      defaultBehavior: "guard",
      progressionPolicy: "none",
      lootPolicy: "none",
      inventoryPolicy: "independent",
      turnBudget: normalizeTurnBudget(raw.turnBudget, 30),
      commandedThisTurn: Boolean(raw.commandedThisTurn) && status === "active",
      lastCommandId: typeof raw.lastCommandId === "string" ? raw.lastCommandId : null,
      lastBehavior,
      guardedUntilRound: typeof raw.guardedUntilRound === "number" ? Math.max(0, Math.trunc(raw.guardedUntilRound)) : null,
      attack: { ...profile.attack },
      effects: Array.isArray(raw.effects) ? raw.effects.map((effect) => ({ ...effect })) : [],
      custody: normalizeCustodyStatus(raw.custody, raw.id),
      inventory: Array.isArray(raw.inventory) ? raw.inventory.map((item) => normalizeInventoryItem(item)) : [],
      createdAtMinutes,
      expiresAtMinutes,
      terminalAtMinutes,
      provenance: {
        sourceCommandId: typeof raw.provenance?.sourceCommandId === "string" ? raw.provenance.sourceCommandId : "legacy-controlled-actor",
        sourceVersion: Math.max(0, Math.trunc(raw.provenance?.sourceVersion ?? 0)),
        profileRevision: CONTROLLED_ACTOR_PROFILE_REVISION,
      },
    } satisfies EngineControlledActor];
  });
}

function normalizePartyState(value: unknown, state: LanternCampaignState): EnginePartyState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<EnginePartyState>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const scene = state.worldContext?.id ?? `campaign:${state.id}`;
  const validActorIds = new Set([state.actorId, ...state.controlledActors.map((actor) => actor.id)]);
  const rawMembers = Array.isArray(raw.members) ? raw.members : [];
  const members: EnginePartyMember[] = [];
  const seen = new Set<string>();
  for (const entry of rawMembers) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Partial<EnginePartyMember>;
    if (typeof candidate.actorId !== "string" || !validActorIds.has(candidate.actorId) || seen.has(candidate.actorId)) continue;
    const role = candidate.actorId === state.actorId ? "leader" : "companion";
    members.push({
      actorId: candidate.actorId,
      role,
      controllerActorId: typeof candidate.controllerActorId === "string" && candidate.controllerActorId ? candidate.controllerActorId : state.actorId,
      sceneId: typeof candidate.sceneId === "string" && candidate.sceneId ? candidate.sceneId : scene,
      locationRef: typeof candidate.locationRef === "string" && candidate.locationRef ? candidate.locationRef : scene,
      joinedAtVersion: typeof candidate.joinedAtVersion === "number" ? Math.max(0, Math.trunc(candidate.joinedAtVersion)) : 0,
    });
    seen.add(candidate.actorId);
  }
  if (!seen.has(state.actorId)) {
    members.unshift({ actorId: state.actorId, role: "leader", controllerActorId: state.actorId, sceneId: scene, locationRef: scene, joinedAtVersion: 0 });
  }
  const memberIds = new Set(members.map((member) => member.actorId));
  for (const actor of state.controlledActors) {
    if (actor.status !== "active" || memberIds.has(actor.id)) continue;
    members.push({ actorId: actor.id, role: "companion", controllerActorId: actor.controllerActorId, sceneId: scene, locationRef: scene, joinedAtVersion: state.version });
  }
  const sharedRaw = raw.shared && typeof raw.shared === "object" && !Array.isArray(raw.shared) ? raw.shared as Partial<EnginePartySharedState> : {};
  const containerRaw = sharedRaw.container && typeof sharedRaw.container === "object" && !Array.isArray(sharedRaw.container) ? sharedRaw.container as Partial<EnginePartySharedState["container"]> : {};
  const containerId = typeof containerRaw.id === "string" && containerRaw.id ? containerRaw.id : `party-shared:${state.id}`;
  const currencyRaw = sharedRaw.currency && typeof sharedRaw.currency === "object" ? sharedRaw.currency as Partial<{ copper: unknown }> : {};
  const shared: EnginePartySharedState = {
    questIds: Array.isArray(sharedRaw.questIds) ? [...new Set(sharedRaw.questIds.filter((id): id is string => typeof id === "string" && id.length > 0))] : state.quests.map((quest) => quest.id),
    currency: { copper: typeof currencyRaw.copper === "number" ? Math.max(0, Math.trunc(currencyRaw.copper)) : 0 },
    container: {
      id: containerId,
      name: typeof containerRaw.name === "string" && containerRaw.name ? containerRaw.name : "Party shared container",
      inventory: Array.isArray(containerRaw.inventory) ? containerRaw.inventory.map((item) => ({ ...normalizeInventoryItem(item), ownerRef: { kind: "world", id: containerId }, equipped: false, slot: undefined, containerRef: undefined })) : [],
    },
  };
  const leaderActorId = members.some((member) => member.actorId === raw.leaderActorId) ? raw.leaderActorId! : state.actorId;
  const activeViewpointActorId = members.some((member) => member.actorId === raw.activeViewpointActorId) ? raw.activeViewpointActorId! : leaderActorId;
  const mode = raw.mode === "split" ? "split" : "together";
  return {
    id: raw.id,
    leaderActorId,
    activeViewpointActorId,
    mode,
    members,
    shared,
    rewardAllocation: "leader-only",
    consent: { mode: "single-controller-future-member-seam", permanentChoiceRequires: "leader-confirmation" },
    revision: typeof raw.revision === "number" ? Math.max(1, Math.trunc(raw.revision)) : 1,
  };
}

function normalizeCorpses(value: unknown): EngineCorpse[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Partial<EngineCorpse>;
    if (
      typeof raw.id !== "string"
      || typeof raw.formerActorId !== "string"
      || typeof raw.formerActorName !== "string"
      || !["lootable", "looted"].includes(raw.status ?? "")
      || !raw.provenance
      || typeof raw.provenance.sourceCommandId !== "string"
      || typeof raw.provenance.sourceVersion !== "number"
      || typeof raw.provenance.occurredAt !== "string"
    ) return [];
    const corpseId = raw.id;
    const formerActorId = raw.formerActorId;
    const formerActorName = raw.formerActorName;
    return [{
      id: corpseId,
      formerActorId,
      formerActorName,
      locationRef: typeof raw.locationRef === "string" ? raw.locationRef : null,
      inventory: Array.isArray(raw.inventory)
        ? raw.inventory.map((item) => ({
            ...normalizeInventoryItem(item),
            equipped: false,
            ownerRef: { kind: "world" as const, id: corpseId },
          }))
        : [],
      status: raw.status as EngineCorpse["status"],
      provenance: {
        sourceCommandId: raw.provenance.sourceCommandId,
        sourceVersion: Math.max(0, Math.trunc(raw.provenance.sourceVersion)),
        occurredAt: raw.provenance.occurredAt,
      },
      ...(typeof raw.lootedAt === "string" ? { lootedAt: raw.lootedAt } : {}),
    }];
  });
}

function normalizeLifecycleConsistency(state: LanternCampaignState): void {
  const character = state.character;
  if (character.lifecycleState === "dead" || hasRuntimeCondition(state, character.id, "dead")) {
    character.lifecycleState = "dead";
    character.hp = 0;
    removeRuntimeCondition(state, character.id, "unconscious");
    removeRuntimeCondition(state, character.id, "stable");
    syncConditionProjections(state);
    return;
  }
  if (character.hp > 0) {
    character.lifecycleState = "conscious";
    character.deathRecord = null;
    character.deathSaveSuccesses = 0;
    character.deathSaveFailures = 0;
    removeRuntimeCondition(state, character.id, "unconscious");
    removeRuntimeCondition(state, character.id, "stable");
    syncConditionProjections(state);
    return;
  }
  if (hasRuntimeCondition(state, character.id, "stable") || character.deathSaveSuccesses >= 3) {
    character.lifecycleState = "stable";
    return;
  }
  character.lifecycleState = "dying";
}

export function cloneCampaign(state: LanternCampaignState): LanternCampaignState {
  return JSON.parse(JSON.stringify(state)) as LanternCampaignState;
}

function normalizeWorldFacts(value: unknown): EngineWorldFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Partial<EngineWorldFact>;
    if (
      typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.description !== "string"
      || !["object", "secret", "trap", "area"].includes(raw.kind ?? "")
      || !["public", "hidden"].includes(raw.visibility ?? "")
    ) return [];
    return [{
      id: raw.id,
      kind: raw.kind as EngineWorldFact["kind"],
      title: raw.title,
      description: raw.description,
      visibility: raw.visibility as EngineWorldFact["visibility"],
      obscurity: raw.obscurity === "dark" ? "dark" : "clear",
      requiredSense: ["normal", "darkvision", "blindsight", "tremorsense", "hearing"].includes(raw.requiredSense ?? "")
        ? raw.requiredSense as EngineWorldFact["requiredSense"]
        : "normal",
      passiveDc: typeof raw.passiveDc === "number" ? Math.max(1, Math.min(30, Math.trunc(raw.passiveDc))) : null,
      sceneId: typeof raw.sceneId === "string" ? raw.sceneId : "campaign-scene",
      revision: typeof raw.revision === "number" ? Math.max(1, Math.trunc(raw.revision)) : 1,
      active: raw.active !== false,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    }];
  });
}

function normalizeWorldObjects(value: unknown, sceneId: string): EngineWorldObjectInstance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Partial<EngineWorldObjectInstance>;
    const parsed = engineWorldObjectInputSchema.safeParse({
      id: raw.id,
      definition: raw.definition,
      state: raw.state,
      locationRef: raw.locationRef ?? null,
      ownerRef: raw.ownerRef,
      containerRef: raw.containerRef ?? null,
    });
    if (!parsed.success) return [];
    const now = new Date(0).toISOString();
    const materialization = engineWorldObjectMaterializationSchema.safeParse(raw.materialization);
    return [{
      ...parsed.data,
      sceneId,
      locationRef: parsed.data.locationRef ?? null,
      ownerRef: parsed.data.ownerRef ?? { kind: "world" as const, id: sceneId },
      containerRef: parsed.data.containerRef ?? null,
      revision: typeof raw.revision === "number" ? Math.max(1, Math.trunc(raw.revision)) : 1,
      provenance: {
        sourceCommandId: typeof raw.provenance?.sourceCommandId === "string" ? raw.provenance.sourceCommandId : "legacy",
        sourceVersion: typeof raw.provenance?.sourceVersion === "number" ? Math.max(0, Math.trunc(raw.provenance.sourceVersion)) : 0,
        occurredAt: typeof raw.provenance?.occurredAt === "string" ? raw.provenance.occurredAt : now,
      },
      ...(materialization.success ? { materialization: materialization.data } : {}),
    }];
  });
}

function normalizeProceduralNotices(value: unknown): EngineProceduralNotice[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const parsed = engineProceduralNoticeSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) return [];
    seen.add(parsed.data.id);
    return [parsed.data];
  }).slice(-20);
}

function normalizeKnowledgeRecords(value: unknown): EngineKnowledgeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Partial<EngineKnowledgeRecord>;
    if (typeof raw.id !== "string" || typeof raw.actorId !== "string" || typeof raw.factId !== "string") return [];
    const tiers: InformationTier[] = ["public", "perceived", "known", "rumor", "false-belief", "stale", "withheld"];
    const sources: EngineKnowledgeRecord["source"][] = ["passive-observation", "active-search", "rumor", "false-belief", "dm"];
    return [{
      id: raw.id,
      actorId: raw.actorId,
      factId: raw.factId,
      tier: tiers.includes(raw.tier as InformationTier) ? raw.tier as InformationTier : "stale",
      source: sources.includes(raw.source as EngineKnowledgeRecord["source"]) ? raw.source as EngineKnowledgeRecord["source"] : "dm",
      provenance: typeof raw.provenance === "string" ? raw.provenance : "legacy",
      confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0,
      campaignVersion: typeof raw.campaignVersion === "number" ? Math.max(0, Math.trunc(raw.campaignVersion)) : 0,
      factRevision: typeof raw.factRevision === "number" ? Math.max(1, Math.trunc(raw.factRevision)) : 1,
      stale: raw.stale === true,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    }];
  }).slice(-500);
}

function normalizeAdvancementPolicy(value: unknown): EngineAdvancementPolicy {
  if (
    value
    && typeof value === "object"
    && (value as Record<string, unknown>).version === 1
    && (value as Record<string, unknown>).mode === "milestone"
    && (value as Record<string, unknown>).maxLevel === 2
    && (value as Record<string, unknown>).hpPolicy === "fixed-average"
    && (value as Record<string, unknown>).formulaRevision === PROGRESSION_FORMULA_REVISION
  ) {
    return defaultAdvancementPolicy();
  }
  return defaultAdvancementPolicy();
}

function normalizePendingAdvancement(value: unknown): EnginePendingAdvancement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EnginePendingAdvancement>;
  const legalChoices = candidate.legalChoices as Partial<EnginePendingAdvancement["legalChoices"]> | undefined;
  const preview = candidate.preview as Partial<EngineAdvancementPreview> | undefined;
  if (
    candidate.version !== 1
    || typeof candidate.id !== "string"
    || candidate.sourceKind !== "quest-milestone"
    || typeof candidate.sourceId !== "string"
    || typeof candidate.sourceCommandId !== "string"
    || typeof candidate.sourceVersion !== "number"
    || typeof candidate.ownerActorId !== "string"
    || candidate.fromLevel !== 1
    || candidate.toLevel !== 2
    || typeof candidate.className !== "string"
    || (candidate.classRef !== null && candidate.classRef !== undefined && !normalizeContentReference(candidate.classRef))
    || typeof candidate.rulesVersion !== "string"
    || candidate.formulaRevision !== PROGRESSION_FORMULA_REVISION
    || !legalChoices
    || typeof legalChoices.className !== "string"
    || (legalChoices.classRef !== null && legalChoices.classRef !== undefined && !normalizeContentReference(legalChoices.classRef))
    || !preview
    || typeof preview.fromLevel !== "number"
    || typeof preview.toLevel !== "number"
    || typeof preview.hpGain !== "number"
    || typeof preview.maxHpBefore !== "number"
    || typeof preview.maxHpAfter !== "number"
    || typeof preview.currentHpBefore !== "number"
    || typeof preview.currentHpAfter !== "number"
    || typeof preview.hitDieBefore !== "number"
    || typeof preview.hitDieAfter !== "number"
    || typeof preview.hitDiceRemainingBefore !== "number"
    || typeof preview.hitDiceRemainingAfter !== "number"
    || typeof preview.proficiencyBonusBefore !== "number"
    || typeof preview.proficiencyBonusAfter !== "number"
    || !preview.savingThrowsBefore
    || !preview.savingThrowsAfter
    || !preview.skillsBefore
    || !preview.skillsAfter
    || !Array.isArray(preview.featureRefsAdded)
    || !Array.isArray(preview.featuresAdded)
    || !["pending", "consumed"].includes(candidate.status ?? "")
  ) return null;
  const classRef = candidate.classRef === null || candidate.classRef === undefined
    ? null
    : normalizeContentReference(candidate.classRef);
  if (!classRef && candidate.classRef !== null && candidate.classRef !== undefined) return null;
  return {
    version: 1,
    id: candidate.id,
    sourceKind: "quest-milestone",
    sourceId: candidate.sourceId,
    sourceCommandId: candidate.sourceCommandId,
    sourceVersion: Math.max(0, Math.trunc(candidate.sourceVersion)),
    ownerActorId: candidate.ownerActorId,
    fromLevel: 1,
    toLevel: 2,
    className: candidate.className,
    classRef,
    rulesVersion: candidate.rulesVersion,
    formulaRevision: PROGRESSION_FORMULA_REVISION,
    legalChoices: {
      className: legalChoices.className,
      classRef: legalChoices.classRef === null || legalChoices.classRef === undefined
        ? null
        : normalizeContentReference(legalChoices.classRef),
    },
    preview: candidate.preview as EngineAdvancementPreview,
    status: candidate.status as "pending" | "consumed",
    ...(typeof candidate.consumedCommandId === "string" ? { consumedCommandId: candidate.consumedCommandId } : {}),
    ...(typeof candidate.consumedAt === "string" ? { consumedAt: candidate.consumedAt } : {}),
  };
}

function progressionFeatureAdditions(character: EngineCharacter): {
  refs: EngineFeatureReference[];
  names: string[];
} {
  const explicitClassRef = character.classRef;
  const source = explicitClassRef
    ? getOpen5eClass(explicitClassRef.contentKey, explicitClassRef.packHash)
    : getOpen5eClass(open5eCharacterContentKey("class", `srd_${character.className.trim().toLocaleLowerCase("en-US")}`));
  if (!source) return { refs: [], names: [] };
  const classRef = explicitClassRef ?? { contentKey: source.contentKey, packHash: source.packHash };
  const features = source?.definition.features ?? [];
  const levelTwo = features.filter((feature) => feature.featureType === "CLASS_LEVEL_FEATURE"
    && feature.gainedAt.some((entry) => entry.level === 2));
  const existingRefs = new Set(character.featureRefs.map((feature) => feature.featureSourceKey));
  const existingNames = new Set(character.features);
  return {
    refs: levelTwo
      .filter((feature) => !existingRefs.has(feature.sourceKey))
      .map((feature) => ({ ...classRef, featureSourceKey: feature.sourceKey })),
    names: levelTwo
      .map((feature) => feature.name)
      .filter((name) => !existingNames.has(name)),
  };
}

function buildAdvancementPreview(character: EngineCharacter): EngineAdvancementPreview {
  const fromLevel = Math.max(1, Math.trunc(character.level || 1));
  const toLevel = fromLevel + 1;
  const hpGain = Math.max(1, Math.ceil(character.hitDie / 2) + open5eAbilityModifier(character.abilities.con));
  const maxHpAfter = Math.max(1, character.maxHp + hpGain);
  const additions = progressionFeatureAdditions(character);
  const projected = hydrateCharacter({
    ...(JSON.parse(JSON.stringify(character)) as EngineCharacter),
    level: toLevel,
    maxHp: maxHpAfter,
    hp: Math.min(maxHpAfter, Math.max(0, character.hp + hpGain)),
    hitDiceRemaining: Math.min(toLevel, character.hitDiceRemaining + 1),
    progressionFormulaRevision: PROGRESSION_FORMULA_REVISION,
  });
  projected.features = [...projected.features, ...additions.names];
  projected.featureRefs = [...projected.featureRefs, ...additions.refs];
  if (projected.spellcasting) projected.spellcasting.slots = { ...projected.spellcasting.slotMaximums };
  return {
    fromLevel,
    toLevel,
    hpGain,
    maxHpBefore: character.maxHp,
    maxHpAfter: projected.maxHp,
    currentHpBefore: character.hp,
    currentHpAfter: projected.hp,
    hitDieBefore: character.hitDie,
    hitDieAfter: projected.hitDie,
    hitDiceRemainingBefore: character.hitDiceRemaining,
    hitDiceRemainingAfter: projected.hitDiceRemaining,
    proficiencyBonusBefore: character.proficiencyBonus,
    proficiencyBonusAfter: projected.proficiencyBonus,
    savingThrowsBefore: { ...character.savingThrows },
    savingThrowsAfter: { ...projected.savingThrows },
    skillsBefore: JSON.parse(JSON.stringify(character.skills)),
    skillsAfter: JSON.parse(JSON.stringify(projected.skills)),
    spellSlotsBefore: character.spellcasting ? { ...character.spellcasting.slots } : null,
    spellSlotsAfter: projected.spellcasting ? { ...projected.spellcasting.slots } : null,
    featureRefsAdded: additions.refs,
    featuresAdded: additions.names,
  };
}

function recalculateProgressionOnLoad(character: EngineCharacter): EngineCharacter {
  if (character.progressionFormulaRevision !== PROGRESSION_FORMULA_REVISION || character.level < 2) return character;
  const canonicalMaxHp = typeof character.progressionMaxHp === "number"
    ? Math.max(1, Math.trunc(character.progressionMaxHp))
    : Math.max(1, character.hitDie * character.level + open5eAbilityModifier(character.abilities.con) * character.level);
  character.maxHp = canonicalMaxHp;
  character.hp = Math.max(0, Math.min(character.maxHp, character.hp));
  return character;
}

function actionOffer(
  state: LanternCampaignState,
  actionId: string,
  label: string,
  timing: EngineActionOfferTiming,
  cost: EngineActionOfferCost,
  validTargets: string[] = [],
  reasonUnavailable: string | null = null,
): EngineActionOffer {
  return {
    actionId,
    label,
    timing,
    validTargets: [...validTargets],
    cost: { ...cost },
    stateVersion: state.version,
    reasonUnavailable,
  };
}

function actionBudgetReason(state: LanternCampaignState): string | null {
  return state.combat.turnBudget.action.spent ? "Action already spent this turn." : null;
}

function bonusActionBudgetReason(state: LanternCampaignState): string | null {
  return state.combat.turnBudget.bonusAction.spent ? "Bonus Action already spent this turn." : null;
}

function reactionBudgetReason(state: LanternCampaignState): string | null {
  return state.combat.turnBudget.reaction.spent ? "Reaction already spent this round." : null;
}

/**
 * Derive the finite action menu from authoritative state.  This is a
 * presentation contract only: command resolvers still re-check every offer
 * against the expected campaign version and current state before committing.
 */
export function deriveActionOffers(state: LanternCampaignState): EngineActionOffer[] {
  const pending = state.combat.pendingReaction;
  if (state.combat.status === "active" && pending) {
    const resolvedReason = pending.status !== "offered" ? "This reaction offer is already resolved." : null;
    const acceptReason = resolvedReason
      ?? (pending.eligibleReactionIds.length ? reactionBudgetReason(state) : "No eligible reaction is available.");
    return [
      actionOffer(state, "reaction_response:accept", "Use an offered reaction.", "reaction", { reaction: 1 }, [pending.id], acceptReason),
      actionOffer(state, "reaction_response:decline", "Decline the offered reaction.", "free", {}, [pending.id], resolvedReason),
    ];
  }
  if (state.phase === "character_creation") {
    return [actionOffer(state, "create_character", "Create a character.", "free", {})];
  }
  if (state.phase === "tutorial") {
    return [actionOffer(state, "continue", "Continue the tutorial.", "free", {})];
  }

  const offers: EngineActionOffer[] = [
    actionOffer(state, "observe", "Observe the current situation.", "free", {}),
    actionOffer(state, "listen", "Listen for useful information.", "free", {}),
    actionOffer(state, "roll", "Make a sandbox roll.", "free", {}),
  ];
  if (state.pendingAdvancement?.status === "pending") {
    offers.push(actionOffer(state, "advancement_confirm", "Confirm the pending advancement.", "free", {}));
  }

  const controlledActors = projectControlledActors(state);
  if (state.character.created) {
    offers.push(actionOffer(state, "controlled_actor_create", "Create a reviewed controlled actor.", "free", {}));
    if (controlledActors.some((actor) => actor.status === "active")) {
      offers.push(actionOffer(state, "controlled_actor_dismiss", "Dismiss an active controlled actor.", "free", {}));
    }
  }

  if (state.character.custody) {
    offers.push(actionOffer(state, "custody_action:escape", "Attempt to escape your guard custody.", "free", {}, [state.character.custody.sourceGuardId]));
  }

  if (state.combat.status !== "active") return offers;

  const enemyTargets = state.combat.enemies.filter((enemy) => enemy.alive && enemy.hp > 0).map((enemy) => enemy.id);
  const encounterTarget = state.combat.encounterId ? [state.combat.encounterId] : [];
  if (state.combat.lifecycle?.phase === "resolving" && state.combat.activeActorId === state.actorId) {
    for (const decision of [
      ["encounter_decision:accept_surrender", "Accept the surrender."],
      ["encounter_decision:reject_surrender", "Reject the surrender."],
      ["encounter_decision:capture", "Capture the surrendering creatures."],
      ["encounter_decision:retreat", "Retreat from the encounter."],
      ["encounter_decision:pursue", "Pursue the retreating creatures."],
      ["encounter_decision:continue_attack", "Continue the attack."],
    ] as const) {
      offers.push(actionOffer(state, decision[0], decision[1], "free", {}, encounterTarget));
    }
    return offers;
  }

  if (state.combat.activeActorId !== state.actorId) {
    const activeTarget = state.combat.activeActorId ? [state.combat.activeActorId] : [];
    offers.push(actionOffer(
      state,
      "advance_turn",
      "Resolve the active creature's turn.",
      "free",
      {},
      activeTarget,
      activeTarget.length ? null : "There is no active combatant to advance.",
    ));
    return offers;
  }

  const actionReason = actionBudgetReason(state);
  const targetReason = enemyTargets.length ? null : "No living enemy target is available.";
  const remainingMovement = Math.max(0, state.combat.turnBudget.movementFeet.available - state.combat.turnBudget.movementFeet.spent);
  offers.push(actionOffer(
    state,
    "combat_move",
    `Move up to ${remainingMovement} feet (the path determines the final cost).`,
    "movement",
    { movementFeet: remainingMovement },
    [],
    remainingMovement > 0 ? null : "No movement remains this turn.",
  ));
  const availableZoneDefinitions = Object.keys(REVIEWED_TACTICAL_ZONE_DEFINITIONS).filter((definitionKey) =>
    !state.combat.tactical.zones.some((zone) => zone.status === "active" && zone.definitionKey === definitionKey)
  );
  offers.push(actionOffer(
    state,
    "tactical_zone_create",
    "Create one reviewed persistent circle or source-following aura.",
    "action",
    { action: 1 },
    availableZoneDefinitions,
    actionReason ?? (availableZoneDefinitions.length ? null : "Both reviewed tactical zone definitions are already active."),
  ));
  offers.push(actionOffer(state, "combat_action:attack", "Attack a living enemy with the equipped weapon.", "action", { action: 1 }, enemyTargets, actionReason ?? targetReason));
  offers.push(actionOffer(
    state,
    "combat_action:attack_nonlethal",
    "Make a nonlethal attack with the equipped weapon.",
    "action",
    { action: 1 },
    enemyTargets,
    actionReason ?? (state.combat.lifecycle ? targetReason : "Nonlethal attacks require an active encounter lifecycle."),
  ));
  offers.push(actionOffer(state, "combat_action:dodge", "Dodge until the next turn.", "action", { action: 1 }, [], actionReason));

  const secondWindReason = state.character.className.trim().toLocaleLowerCase("en-US") !== "fighter"
    ? "Second Wind is not available to this character."
    : (state.character.featureUses.secondWind ?? 0) < 1
      ? "Second Wind has no uses remaining."
      : bonusActionBudgetReason(state);
  offers.push(actionOffer(state, "combat_action:second_wind", "Recover hit points with Second Wind.", "bonus_action", { bonusAction: 1 }, [], secondWindReason));

  const controlledCommandOffers = controlledActors.flatMap((actor) => actor.legalCommands);
  if (controlledActors.length) {
    const legalControlledCommand = controlledCommandOffers.some((offer) => offer.legal);
    const controlledReason = legalControlledCommand ? null : controlledCommandOffers.find((offer) => offer.reason)?.reason ?? "No controlled actor command is legal this turn.";
    offers.push(actionOffer(state, "controlled_actor_command", "Command a controlled actor.", "action", { action: 1 }, enemyTargets, controlledReason));
  }
  offers.push(actionOffer(state, "end_turn", "End the player's combat turn.", "free", {}));
  return offers;
}

export const deriveLegalActionOffers = deriveActionOffers;

export function toSessionView(state: LanternCampaignState): EngineSessionView {
  const projection = actorKnowledgeProjection(activePartyViewpointId(state), state);
  const controlledActors = projectControlledActors(state);
  const actionOffers = deriveActionOffers(state);
  return {
    id: state.id,
    userId: state.accountId,
    version: state.version,
    rulesVersion: state.rulesVersion,
    contentPolicy: state.contentPolicy,
    campaign: state.campaign,
    experienceProfile: normalizeExperienceProfile(state.experienceProfile, state.updatedAt),
    failurePressures: state.failurePressures ?? [],
    phase: state.phase,
    tutorialStep: state.tutorialStep,
    characterCreation: state.characterCreation,
    advancementPolicy: state.advancementPolicy,
    pendingAdvancement: state.pendingAdvancement,
    time: state.time,
    social: projection.social,
    characterCreated: state.character.created,
    worldContext: projection.worldContext,
    runtimeContent: projectRuntimeContentForActor(state.runtimeContent),
    proceduralNotices: projection.proceduralNotices,
    playerNotes: state.playerNotes,
    quests: projectQuestsForActor(state, state.actorId),
    corpses: state.corpses,
    effects: state.effects.filter((effect) => effect.status === "active"),
    improvEffects: state.improvEffects,
    currentBeat: state.currentBeat,
    situation: state.situation ? projectSituationForActor(state.situation, state, activePartyViewpointId(state)) : null,
    scene: state.orchestration?.activeScene ?? null,
    suggestedActions: sanitizeProceduralNoticeActions(state.suggestedActions, state.proceduralNotices),
    log: state.log.slice(-40),
    availableActions: actionOffers.filter((offer) => offer.reasonUnavailable === null).map((offer) => offer.actionId),
    actionOffers,
    lastRoll: state.lastRoll,
    character: characterData(state.character, state.runtimeContent) as EngineSessionView["character"],
    combat: combatData(state.combat),
    controlledActors,
    party: partyProjection(state),
    updatedAt: state.updatedAt,
  };
}

function controlledActorLegalCommands(state: LanternCampaignState, actor: EngineControlledActor, viewerActorId = state.actorId): EngineControlledActorCommandOffer[] {
  const actions: Array<{ action: EngineControlledActorCommandAction; cost: "action" | "bonus-action"; targetRequired: boolean }> = [
    { action: "attack", cost: "action", targetRequired: true },
    { action: "guard", cost: "action", targetRequired: false },
    { action: "follow", cost: "bonus-action", targetRequired: false },
  ];
  return actions.map(({ action, cost, targetRequired }) => {
    let reason: string | null = null;
    if (actor.status !== "active") reason = `Actor is ${actor.status}.`;
    else if (actor.custody) reason = "Actor is under guard custody.";
    else if (actor.controllerActorId !== viewerActorId) reason = "This actor has a different controller.";
    else if (state.combat.status !== "active") reason = "A controller-turn command requires an active encounter.";
    else if (state.combat.pendingReaction) reason = "Resolve the pending reaction first.";
    else if (state.combat.activeActorId !== viewerActorId) reason = "The controller's turn is not active.";
    else if (state.combat.turnBudget[cost === "action" ? "action" : "bonusAction"].spent) reason = `The controller's ${cost} is already spent.`;
    else if (actor.turnBudget[cost === "action" ? "action" : "bonusAction"].spent) reason = `The actor's ${cost} is already spent.`;
    else if (action === "attack" && !state.combat.enemies.some((enemy) => enemy.alive && fiveESimpleDistanceFeet(actor.position, enemy.position) <= controlledActorRangeFeet(actor))) reason = "No living target is within the actor's fixed attack range.";
    return { action, cost, targetRequired, legal: reason === null, reason };
  });
}

function controlledActorView(state: LanternCampaignState, actor: EngineControlledActor, viewerActorId = state.actorId): EngineControlledActorView {
  return {
    id: actor.id,
    profileId: actor.profileId,
    kind: actor.kind,
    name: actor.name,
    status: actor.status,
    hp: actor.hp,
    maxHp: actor.maxHp,
    position: actor.position,
    footprint: actor.footprint,
    senses: actor.senses,
    turnPolicy: actor.turnPolicy,
    defaultBehavior: actor.defaultBehavior,
    progressionPolicy: actor.progressionPolicy,
    lootPolicy: actor.lootPolicy,
    inventoryPolicy: actor.inventoryPolicy,
    turnBudget: actor.turnBudget,
    commandedThisTurn: actor.commandedThisTurn,
    lastCommandId: actor.lastCommandId,
    lastBehavior: actor.lastBehavior,
    guardedUntilRound: actor.guardedUntilRound,
    attack: actor.attack,
    effects: actor.effects.filter((effect) => effect.status === "active"),
    custody: actor.custody ?? null,
    createdAtMinutes: actor.createdAtMinutes,
    expiresAtMinutes: actor.expiresAtMinutes,
    terminalAtMinutes: actor.terminalAtMinutes,
    inventory: materializeInventory(actor.inventory),
    knowledge: activePartyViewpointId(state) === actor.id
      ? state.actorKnowledge.filter((record) => record.actorId === actor.id)
      : [],
    legalCommands: controlledActorLegalCommands(state, actor, viewerActorId),
  };
}

function projectControlledActors(state: LanternCampaignState): EngineControlledActorView[] {
  return state.controlledActors
    .filter((actor) => actor.ownerActorId === state.actorId || actor.controllerActorId === state.actorId)
    .map((actor) => controlledActorView(state, actor));
}

export function readToolData(
  state: LanternCampaignState,
  tool:
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
): unknown {
  const viewpointActorId = activePartyViewpointId(state);
  const projection = actorKnowledgeProjection(viewpointActorId, state);
  switch (tool) {
    case "campaign_context":
      return {
        campaignId: state.id,
        campaignVersion: state.version,
        rulesVersion: state.rulesVersion,
        campaign: state.campaign,
        experienceProfile: projectExperienceProfile(state.experienceProfile),
        phase: state.phase,
        tutorialStep: state.tutorialStep,
        advancementPolicy: state.advancementPolicy,
        pendingAdvancement: state.pendingAdvancement,
        time: state.time,
        social: projection.social,
        worldContext: projection.worldContext,
        runtimeContent: projectRuntimeContentForActor(state.runtimeContent),
        proceduralNotices: projection.proceduralNotices,
        knowledge: projection.knowledge,
        playerNotes: state.playerNotes,
        quests: projectQuestsForActor(state, state.actorId),
        corpses: state.corpses,
        effects: state.effects.filter((effect) => effect.status === "active"),
        improvEffects: state.improvEffects,
        currentBeat: state.currentBeat,
        situation: state.situation ? projectSituationForActor(state.situation, state, viewpointActorId) : null,
        scene: state.orchestration?.activeScene ?? null,
        resume: buildResumeProjection(state.orchestration ?? emptyOrchestrationState(), projectExperienceProfile(state.experienceProfile)),
        character: characterData(state.character, state.runtimeContent),
        combat: combatData(state.combat),
        controlledActors: projectControlledActors(state),
        party: partyStateData(state),
        quest: projectQuestForActor(state.quest, state, state.actorId),
        recentLog: state.log.slice(-8),
      };
    case "observe":
      return {
        worldContext: projection.worldContext,
        proceduralNotices: projection.proceduralNotices,
        campaignVersion: state.version,
        time: state.time,
        social: projection.social,
        combat: combatData(state.combat),
      };
    case "world_context":
      return projection.worldContext;
    case "player_notes":
      return state.playerNotes;
    case "npc_context":
      return projection.worldContext?.npcs ?? [];
    case "merchant_catalog":
      return projectMerchants(state.worldContext?.merchants ?? []);
    case "character_sheet":
      return characterData(state.character, state.runtimeContent);
    case "inventory":
      return {
        items: materializeInventory(state.character.inventory),
        currency: state.character.currency,
        currencyBreakdown: currencyBreakdown(state.character.currency.copper),
        gold: state.character.gold,
        carryWeight: inventoryWeight(state.character.inventory),
        carryCapacity: carryCapacity(state.character.abilities.str),
        encumbered: inventoryWeight(state.character.inventory) > carryCapacity(state.character.abilities.str),
      };
    case "quest_progress":
      return projectQuestForActor(state.quest, state, state.actorId);
    case "combat_state":
      return combatData(state.combat);
    case "controlled_actor_context":
      return { controlledActors: projectControlledActors(state), campaignVersion: state.version };
    case "party_context":
      return { ...partyStateData(state), worldContext: projection.worldContext, campaignVersion: state.version };
    case "situation_context":
      return state.situation
        ? projectSituationForActor(state.situation, state, viewpointActorId)
        : null;
  }
}

function escapedThemePattern(theme: string): RegExp {
  const escaped = theme.trim().toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i");
}

function containsExperienceTheme(value: unknown, themes: readonly string[]): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return false;
  return themes.some((theme) => Boolean(theme) && escapedThemePattern(theme).test(text));
}

export function commandContainsBlockedTheme(
  profile: EngineExperienceProfile,
  command: EngineCommand
): boolean {
  return containsExperienceTheme(command, [...profile.excludedThemes, ...profile.fadeToBlackThemes]);
}

export function sanitizeNarrationForProfile(
  narration: NarrationEnvelope,
  profile: EngineExperienceProfile
): NarrationEnvelope {
  const themes = [...profile.excludedThemes, ...profile.fadeToBlackThemes];
  if (containsExperienceTheme(narration.text, themes) || containsExperienceTheme(narration.proposedFacts, themes)) {
    return {
      text: "Let's fade to black and continue with a safer thread.",
      proposedFacts: [],
      suggestedActions: [],
    };
  }
  return {
    ...narration,
    proposedFacts: narration.proposedFacts.filter((fact) => !containsExperienceTheme(fact, themes)),
    suggestedActions: narration.suggestedActions.filter((action) => !containsExperienceTheme(action, themes)),
  };
}

function redactExperienceCommand(command: EnginePersistedCommand): EnginePersistedCommand {
  // Quest graph creation is an authored command, but its hidden predicates
  // must not survive in persisted event evidence or replay payloads.
  if (command.kind === "quest_create") return redactCommand(command);
  if (command.kind === "turn_plan" || command.kind === "content_repin" || command.kind === "production_room_enter") return command;
  switch (command.kind) {
    case "experience_profile_update":
      return {
        ...command,
        profile: {
          ...command.profile,
          excludedThemes: [],
          fadeToBlackThemes: [],
        },
      };
    case "experience_feedback_add":
      return { kind: command.kind, rating: command.rating };
    case "experience_boundary":
      return { ...command, theme: "[redacted]" };
    default:
      return command;
  }
}

function experiencePlayerOnlyRejection(
  state: LanternCampaignState,
  context: RequestContext,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution | null {
  return context.capabilities.includes("player")
    ? null
    : rejection(state, tool, "profile_player_only", "Experience preferences can only be changed by an explicit player command.");
}

function resolveExperienceProfileUpdate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "experience_profile_update" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const capabilityRejection = experiencePlayerOnlyRejection(state, context, tool);
  if (capabilityRejection) return capabilityRejection;
  const input = normalizeExperienceProfileInput(command.profile);
  if (!input) return rejection(state, tool, "invalid_experience_profile", "That experience profile is not a valid normalized player preference set.");
  const currentInput = experienceProfileInput(state.experienceProfile);
  if (JSON.stringify(input) === JSON.stringify(currentInput)) {
    return rejection(state, tool, "experience_profile_unchanged", "Those experience preferences are already active.");
  }
  const next = cloneCampaign(state);
  next.experienceProfile = buildExperienceProfile(input, new Date().toISOString(), state.experienceProfile);
  const before = redactedExperienceProfileEvidence(state.experienceProfile);
  const after = redactedExperienceProfileEvidence(next.experienceProfile);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Experience preferences updated for future presentation and situation selection.",
    { experienceProfile: next.experienceProfile },
    "experience_profile_updated",
    [],
    [],
    [
      { path: "/experienceProfile/revision", before: state.experienceProfile.revision, after: next.experienceProfile.revision },
      { path: "/experienceProfile/preferences", before, after },
    ]
  );
}

function resolveExperienceFeedbackAdd(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "experience_feedback_add" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const capabilityRejection = experiencePlayerOnlyRejection(state, context, tool);
  if (capabilityRejection) return capabilityRejection;
  const next = cloneCampaign(state);
  const now = new Date().toISOString();
  const feedback: EngineExperienceFeedback = {
    id: clientCommandId,
    rating: command.rating,
    ...(command.note ? { note: command.note } : {}),
    createdAt: now,
  };
  next.experienceProfile = buildExperienceProfile(
    experienceProfileInput(state.experienceProfile),
    now,
    state.experienceProfile
  );
  next.experienceProfile.feedback = [...next.experienceProfile.feedback, feedback].slice(-8);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Feedback recorded for future experience tuning.",
    { feedbackId: clientCommandId, rating: command.rating, feedbackCount: next.experienceProfile.feedback.length },
    "experience_feedback_added",
    [],
    [],
    [
      { path: "/experienceProfile/revision", before: state.experienceProfile.revision, after: next.experienceProfile.revision },
      { path: "/experienceProfile/feedbackCount", before: state.experienceProfile.feedback.length, after: next.experienceProfile.feedback.length },
    ]
  );
}

function resolveExperienceBoundary(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "experience_boundary" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const capabilityRejection = experiencePlayerOnlyRejection(state, context, tool);
  if (capabilityRejection) return capabilityRejection;
  const normalizedTheme = command.theme.trim().toLocaleLowerCase();
  const configured = [...state.experienceProfile.excludedThemes, ...state.experienceProfile.fadeToBlackThemes]
    .some((theme) => theme.toLocaleLowerCase() === normalizedTheme);
  if (!configured) return rejection(state, tool, "experience_boundary_not_configured", "That boundary is not active in the player profile.");
  const messages = {
    redirect: "That thread is redirected before any sensitive detail is established. Choose a safer direction.",
    fade_to_black: "The sensitive moment fades to black before detail is established. The story continues on a safer thread.",
    skip: "That thread is skipped before any sensitive detail is established. Choose what happens next.",
  } as const;
  const next = cloneCampaign(state);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    messages[command.action],
    { action: command.action, blocked: true },
    "experience_boundary_applied",
    [],
    [],
    [{ path: "/experienceBoundary/lastAction", before: null, after: command.action }]
  );
}

export function resolveProductionRoomEnter(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string
): EngineResolution {
  const existingRoom = state.productionRoom ? parseProductionRoomState(state.productionRoom) : emptyProductionRoomState();
  if (existingRoom.activeScene) {
    return rejection(
      state,
      "declare",
      "production_room_active",
      "The campaign already has an active production-room scene. Replay its released sequence or resolve the current scene first."
    );
  }

  const now = new Date().toISOString();
  const run = createDmRun({
    kind: "scene_build",
    accountId: context.accountId,
    campaignId: context.campaignId,
    actorId: context.actorId,
    baseCampaignVersion: state.version,
    baseSceneRevision: null,
    usage: {
      provider: "deterministic",
      model: "ruined-gatehouse-fixture-v1",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    },
    createdAt: now,
  });
  const blueprint = buildRuinedGatehouseBlueprint(state.version, run.id);
  const draft = proposeSceneBlueprint(run, blueprint, now);
  let snapshot = commitSceneSnapshot({
    blueprint: draft.blueprint,
    sourceRunId: run.id,
    currentCampaignVersion: state.version,
    now,
  });
  const committedCampaignVersion = state.version + 1;
  snapshot = openSceneInput(
    { ...snapshot, campaignVersion: committedCampaignVersion },
    new Date(Date.parse(now) + 1).toISOString()
  );
  const committedRun: DmRun = completeDmRun(run, JSON.stringify(blueprint), "committed", now);
  const sceneProjection = projectSceneForActor(snapshot, context.actorId);
  const openedScene = activateScene(sceneStateFromProjection({
    sceneId: sceneProjection.sceneId,
    revision: sceneProjection.revision,
    campaignVersion: committedCampaignVersion,
    mode: sceneProjection.mode,
    immediateQuestion: sceneProjection.immediateQuestion,
    pressureRefs: sceneProjection.pressureRefs,
    committedEventRefs: [],
    actorId: context.actorId,
    situationRefs: state.situation ? [state.situation.id] : [],
    now,
  }), new Date(Date.parse(now) + 1).toISOString());
  const openedSceneWithHooks = {
    ...openedScene,
    hookRefs: hooksForScene(openedScene).map((hook) => hook.id),
  };
  const nextRoom: ProductionRoomState = {
    ...existingRoom,
    activeScene: snapshot,
    runs: [...existingRoom.runs, committedRun],
    processedOperationIds: [...new Set([...existingRoom.processedOperationIds, clientCommandId])],
  };
  const next = cloneCampaign(state);
  next.productionRoom = nextRoom;
  next.orchestration = {
    ...(next.orchestration ?? emptyOrchestrationState()),
    activeScene: openedSceneWithHooks,
    hooks: hooksForScene(openedScene),
  };
  const resolution = commit(
    next,
    context,
    clientCommandId,
    { kind: "production_room_enter" },
    "production_room",
    "The ruined gatehouse is committed before player input opens.",
    {
      scene: projectSceneForActor(snapshot, context.actorId),
      runId: run.id,
      phase: "scene_snapshot_committed",
    },
    "scene_snapshot_committed",
    [],
    [],
    [
      { path: "/productionRoom/activeScene", before: null, after: snapshot },
      { path: "/orchestration/activeScene", before: null, after: openedSceneWithHooks },
    ]
  );
  const eventId = resolution.event?.id;
  const committedState = cloneCampaign(resolution.state);
  const committedRoom = parseProductionRoomState(committedState.productionRoom);
  if (committedRoom.activeScene && eventId) {
    committedRoom.activeScene = {
      ...committedRoom.activeScene,
      committedEventIds: [eventId],
    };
    committedRoom.runs = committedRoom.runs.map((candidate) => candidate.id === run.id
      ? { ...candidate, committedEventIds: [eventId], publicEventRefs: [eventId] }
      : candidate);
    committedState.productionRoom = committedRoom;
    const committedOrchestration = committedState.orchestration ?? emptyOrchestrationState();
    if (committedOrchestration.activeScene) {
      committedOrchestration.activeScene = {
        ...committedOrchestration.activeScene,
        committedEventRefs: [...new Set([...committedOrchestration.activeScene.committedEventRefs, eventId])],
      };
      committedState.orchestration = committedOrchestration;
    }
  }
  return {
    ...resolution,
    state: committedState,
    event: resolution.event && eventId
      ? {
          ...resolution.event,
          stateChanges: [
            ...resolution.event.stateChanges,
            { path: "/productionRoom/activeScene/committedEventIds", before: [], after: [eventId] },
            { path: "/orchestration/activeScene/committedEventRefs", before: [], after: [eventId] },
          ],
        }
      : resolution.event,
    data: {
      scene: committedRoom.activeScene ? projectSceneForActor(committedRoom.activeScene, context.actorId) : null,
      runId: run.id,
      phase: "scene_snapshot_committed",
    },
  };
}

export function resolveProductionRoomNarrationRelease(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  candidate: NarrationSequenceIR
): EngineResolution {
  const room = state.productionRoom ? parseProductionRoomState(state.productionRoom) : emptyProductionRoomState();
  const scene = room.activeScene;
  if (!scene) return rejection(state, "declare", "production_room_missing", "There is no committed production-room scene to narrate.");
  if (room.releasedSequences.some((sequence) => sequence.id === candidate.id)) {
    return rejection(state, "declare", "narration_already_released", "That narration sequence has already been released.");
  }
  if (candidate.sourceRunId !== scene.sourceRunId || candidate.sceneId !== scene.sceneId || candidate.sceneRevision !== scene.revision) {
    return rejection(state, "declare", "narration_scene_mismatch", "The narration sequence does not belong to the committed scene revision.");
  }
  if (scene.campaignVersion !== state.version || candidate.campaignVersion !== scene.campaignVersion) {
    return rejection(state, "declare", "narration_stale", "The narration candidate is based on a stale campaign revision.");
  }
  const projection = projectSceneForActor(scene, context.actorId);
  let released: NarrationSequenceIR;
  try {
    released = releaseNarrationSequence(candidate, projection);
  } catch (_error) {
    return rejection(state, "declare", "narration_invalid", "The narration candidate failed the public release gate.");
  }
  const narratorRun = completeDmRun(
    createDmRun({
      id: candidate.narratorRunId,
      kind: "narration",
      accountId: context.accountId,
      campaignId: context.campaignId,
      actorId: context.actorId,
      baseCampaignVersion: state.version,
      baseSceneRevision: scene.revision,
      usage: {
        provider: "deterministic",
        model: "narration-ir-compatibility-v1",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        latencyMs: 0,
      },
      createdAt: new Date().toISOString(),
    }),
    JSON.stringify(candidate),
    "released"
  );
  const next = cloneCampaign(state);
  next.productionRoom = {
    ...room,
    runs: [...room.runs, { ...narratorRun, committedEventIds: [...scene.committedEventIds], publicEventRefs: [...scene.committedEventIds] }],
    releasedSequences: [...room.releasedSequences, released],
    playback: [...room.playback, initialPlayback(released)],
    processedOperationIds: [...new Set([...room.processedOperationIds, clientCommandId])],
  };
  const orchestration = next.orchestration ?? emptyOrchestrationState();
  if (orchestration.activeScene?.sceneId === scene.sceneId) {
    orchestration.activeScene = {
      ...orchestration.activeScene,
      releasedNarrationRefs: [...new Set([...orchestration.activeScene.releasedNarrationRefs, released.id])],
      updatedAt: new Date().toISOString(),
    };
    next.orchestration = orchestration;
  }
  const resolution = commit(
    next,
    context,
    clientCommandId,
    { kind: "declare", goal: `production_room_narration:${candidate.id}` },
    "declare",
    "The validated narration sequence is released for sequential playback.",
    { sequence: projectNarrationSequenceForActor(released), phase: "narration_released" },
    "narration_released",
    [],
    [],
    [
      { path: `/productionRoom/releasedSequences/${released.id}`, before: null, after: released },
      ...(orchestration.activeScene?.sceneId === scene.sceneId
        ? [{ path: "/orchestration/activeScene/releasedNarrationRefs", before: state.orchestration?.activeScene?.releasedNarrationRefs ?? [], after: orchestration.activeScene.releasedNarrationRefs }]
        : []),
    ]
  );
  return resolution;
}

function uniquePublicFactRefs(state: LanternCampaignState, actorId: string): string[] {
  const known = new Set(state.actorKnowledge
    .filter((record) => record.actorId === actorId && !record.stale && (record.tier === "known" || record.tier === "perceived"))
    .map((record) => record.factId));
  return [...new Set(state.worldFacts
    .filter((fact) => fact.active && (fact.visibility === "public" || known.has(fact.id)))
    .map((fact) => fact.id))];
}

export function resolveOrchestrationDecision(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineOrchestrationCommand,
  events: EngineEvent[],
): EngineResolution {
  const orchestration = state.orchestration ?? emptyOrchestrationState();
  const scene = orchestration.activeScene;
  if (!scene) return rejection(state, "orchestration", "scene_missing", "There is no committed scene to orchestrate.");

  const refreshedScene = refreshSceneFromEvents(scene, events);
  const publicFactRefs = uniquePublicFactRefs(state, context.actorId);
  const hiddenFactRefs = state.worldFacts
    .filter((fact) => fact.active && fact.visibility === "hidden" && !publicFactRefs.includes(fact.id))
    .map((fact) => fact.id);
  const situationProjection = state.situation
    ? projectSituationForActor(state.situation, state, context.actorId)
    : null;
  const foundClueRefs = situationProjection?.clues
    .filter((clue) => clue.foundBy.includes(context.actorId))
    .map((clue) => clue.id) ?? [];
  const revealedRefs = situationProjection?.revelations
    .filter((revelation) => revelation.status === "revealed")
    .map((revelation) => revelation.id) ?? [];
  const consequenceRefs = situationProjection?.outcome
    ? [`situation-outcome:${situationProjection.id}`]
    : [];
  const authorized = authorizePacingRefs({
    pressureRefs: [...refreshedScene.pressureRefs, ...(situationProjection ? [situationProjection.pressure.id] : [])],
    clueRefs: [...foundClueRefs, ...revealedRefs],
    consequenceRefs,
    committedEventRefs: refreshedScene.committedEventRefs,
    randomEventRefs: authorizedRandomEventRefs(state.time.randomEvents, refreshedScene.committedEventRefs, publicFactRefs),
    hiddenRefs: hiddenFactRefs,
    surfacedRefs: refreshedScene.surfacedRefs,
  });
  const validation = validateOrchestrationDecision(
    refreshedScene,
    command.decision,
    authorized,
    refreshedScene.noChangeTurns,
    state.version,
  );
  if (!validation.valid) return rejection(state, "orchestration", "orchestration_rejected", validation.errors.join(" "), { errors: validation.errors, noChangeTurns: refreshedScene.noChangeTurns });

  const sceneEvents = events.filter((event) => refreshedScene.committedEventRefs.includes(event.id));
  const sceneWithFacts = { ...refreshedScene, discoveredFactRefs: [...new Set([...refreshedScene.discoveredFactRefs, ...publicFactRefs])] };
  let applied: ReturnType<typeof applyOrchestrationDecision>;
  try {
    applied = applyOrchestrationDecision(
      { ...orchestration, activeScene: sceneWithFacts },
      command.decision,
      authorized,
      refreshedScene.noChangeTurns,
      state.version + 1,
      sceneEvents,
      publicFactRefs,
    );
  } catch (error) {
    return rejection(state, "orchestration", "orchestration_rejected", error instanceof Error ? error.message : "The orchestration decision was rejected.");
  }
  const next = cloneCampaign(state);
  next.orchestration = {
    ...applied.state,
    processedOperationIds: [...new Set([...applied.state.processedOperationIds, clientCommandId])],
  };
  const stateChanges = [
    { path: "/orchestration/activeScene", before: scene, after: next.orchestration.activeScene },
    { path: "/orchestration/decisions", before: orchestration.decisions, after: next.orchestration.decisions },
    ...(applied.recap ? [{ path: `/orchestration/recaps/${applied.recap.id}`, before: null, after: applied.recap }] : []),
  ];
  return commit(
    next,
    context,
    clientCommandId,
    command,
    "orchestration",
    command.decision.action === "transition"
      ? "The scene transition is recorded without changing campaign mechanics."
      : command.decision.action === "clarify"
        ? "The scene is clarified with a neutral question."
        : command.decision.action === "surface_existing"
          ? "An existing authorized scene reference is surfaced."
          : "The scene is reframed around an existing authorized reference.",
    {
      scene: next.orchestration.activeScene,
      decision: applied.decision,
      recap: applied.recap,
      resume: buildResumeProjection(next.orchestration, projectExperienceProfile(next.experienceProfile)),
      noChangeTurns: refreshedScene.noChangeTurns,
      authorizedRefs: authorized.allRefs,
    },
    "orchestration_recorded",
    [],
    [],
    stateChanges,
  );
}

export interface EngineInternalAuthority {
  sceneMoveBindingValidated?: boolean;
  npcAgencySelection?: EngineNpcProviderSelection;
}

export function resolveEngineCommand(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineCommand,
  tool: EngineToolName | "declare" | "listen",
  playerText?: string,
  internalAuthority?: EngineInternalAuthority,
): EngineResolution {
  const beforeZoneRejection = rejectInvalidTacticalZonePersistence(state, tool);
  if (beforeZoneRejection) return beforeZoneRejection;
  const resolution = resolveEngineCommandCore(state, context, clientCommandId, command, tool, playerText, internalAuthority);
  if (resolution.accepted && !resolution.readOnly) {
    // Movement and other accepted mutations are reconciled immediately below,
    // so only structural zone authority is checked in this intermediate state.
    const afterZoneIssue = tacticalZoneStateIssue(resolution.state, false);
    if (afterZoneIssue) return rejection(state, tool, afterZoneIssue.code, afterZoneIssue.message);
  }
  return reconcileZonesInResolution(
    resolution,
    clientCommandId,
  );
}

function resolveEngineCommandCore(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineCommand,
  tool: EngineToolName | "declare" | "listen",
  playerText?: string,
  internalAuthority?: EngineInternalAuthority,
): EngineResolution {
  if (
    state.character.lifecycleState === "dead"
    && command.kind !== "observe"
    && command.kind !== "world_context"
    && command.kind !== "content_compile"
    && command.kind !== "procedural_notice"
    && command.kind !== "player_note_add"
    && command.kind !== "experience_profile_update"
    && command.kind !== "experience_feedback_add"
    && command.kind !== "experience_boundary"
    && command.kind !== "campaign_beat"
    && command.kind !== "quest_create"
    && command.kind !== "quest_transition"
    && command.kind !== "quest_update"
  ) {
    return rejection(state, tool, "actor_dead", "A dead character cannot act, rest, cast, or receive ordinary healing.");
  }
  if (
    state.character.lifecycleState === "stable"
    && ["combat_action", "combat_move", "tactical_zone_create", "cast_spell", "move", "travel", "interact", "social_check", "social_action", "npc_tick", "merchant_trade", "equip_item", "unequip_item", "drop_item", "inventory_transfer", "improvise", "loot", "project"].includes(command.kind)
  ) {
    return rejection(state, tool, "actor_stable", "A stable character remains unconscious until healed.");
  }
  const experienceCommand = command.kind === "experience_profile_update"
    || command.kind === "experience_feedback_add"
    || command.kind === "experience_boundary";
  if (commandContainsBlockedTheme(state.experienceProfile, command) && !experienceCommand) {
    return rejection(state, tool, "experience_boundary_blocked", "That content crosses an active boundary; choose a safer direction.");
  }
  if (
    state.combat.pendingReaction
    && command.kind !== "observe"
    && command.kind !== "reaction_response"
    && !experienceCommand
    && !(command.kind === "cast_spell" && state.combat.pendingReaction.eligibleReactionIds.includes(command.spellKey))
  ) {
    return rejection(state, tool, "reaction_pending", "Resolve the offered incoming-hit reaction before taking another action.");
  }
  const custodyTarget = command.kind === "npc_tick"
    ? (state.worldContext?.npcs.find((npc) => npc.id === command.npcId)
      ?? (command.npcId ? null : state.worldContext?.npcs.find((npc) => Boolean(npc.agency)))
      ?? null)
    : command.kind === "controlled_actor_command" || command.kind === "controlled_actor_dismiss"
      ? state.controlledActors.find((actor) => actor.id === command.actorId) ?? null
      : null;
  if (custodyTarget?.custody) {
    return rejection(state, tool, "custody_restricted", "That actor is under guard custody and cannot move, fight, or receive commands until released.");
  }
  if (
    state.character.custody
    && [
      "move",
      "travel",
      "combat_start",
      "combat_action",
      "combat_move",
      "tactical_zone_create",
      "cast_spell",
      "spawn_creature",
      "encounter_decision",
      "end_turn",
      "advance_turn",
      "npc_advance",
      "controlled_actor_command",
    ].includes(command.kind)
  ) {
    return rejection(state, tool, "custody_restricted", "You are under guard and cannot move or start or resolve combat until released or escaped.");
  }
  switch (command.kind) {
    case "observe":
      return readOnlyResolution(state, tool, "The DM's current world context is available to you.", readToolData(state, "observe"));
    case "listen":
      return resolveCheck(state, context, clientCommandId, command, tool, "wis", "perception", playerText ?? "Listen carefully.");
    case "world_context":
      return resolveWorldContext(state, context, clientCommandId, command, tool);
    case "content_compile":
      return resolveContentCompile(state, context, clientCommandId, command, tool);
    case "procedural_notice":
      return resolveProceduralNotice(state, context, clientCommandId, command, tool);
    case "player_note_add":
      return resolvePlayerNoteAdd(state, context, clientCommandId, command, tool);
    case "experience_profile_update":
      return resolveExperienceProfileUpdate(state, context, clientCommandId, command, tool);
    case "experience_feedback_add":
      return resolveExperienceFeedbackAdd(state, context, clientCommandId, command, tool);
    case "experience_boundary":
      return resolveExperienceBoundary(state, context, clientCommandId, command, tool);
    case "challenge_attempt":
      return resolveChallengeAttempt(state, context, clientCommandId, command, tool);
    case "character_update":
      return resolveCharacterUpdate(state, context, clientCommandId, command, tool);
    case "move":
      return resolveMove(state, context, clientCommandId, command, tool);
    case "travel":
      return resolveTravel(state, context, clientCommandId, command, tool);
    case "interact":
      return resolveInteract(state, context, clientCommandId, command, tool);
    case "social_check":
      return resolveSocialCheck(state, context, clientCommandId, command, tool);
    case "social_action":
      return resolveSocialAction(state, context, clientCommandId, command, tool);
    case "npc_tick":
      return resolveNpcTick(state, context, clientCommandId, command, tool, internalAuthority?.npcAgencySelection);
    case "merchant_trade":
      return resolveMerchantTrade(state, context, clientCommandId, command, tool);
    case "quest_create":
      return resolveQuestCreate(state, context, clientCommandId, command, tool);
    case "quest_transition":
      return resolveQuestTransition(state, context, clientCommandId, command, tool);
    case "quest_update":
      return resolveQuestUpdate(state, context, clientCommandId, command, tool);
    case "improvise":
      return resolveImprovise(
        state,
        context,
        clientCommandId,
        command,
        tool,
        internalAuthority?.sceneMoveBindingValidated === true,
      );
    case "campaign_beat":
      return resolveCampaignBeat(state, context, clientCommandId, command, tool);
    case "character_roll_stats":
      return resolveCharacterRollStats(state, context, clientCommandId, command, tool);
    case "character_create":
      return resolveCharacterCreate(state, context, clientCommandId, command, tool);
    case "equip_item":
      return resolveEquipItem(state, context, clientCommandId, command, tool);
    case "inventory_transfer":
      return resolveInventoryTransfer(state, context, clientCommandId, command, tool);
    case "unequip_item":
      return resolveUnequipItem(state, context, clientCommandId, command, tool);
    case "drop_item":
      return resolveDropItem(state, context, clientCommandId, command, tool);
    case "tutorial_advance":
      return resolveTutorialAdvance(state, context, clientCommandId, command, tool);
    case "roll_check":
      return resolveCheck(state, context, clientCommandId, command, tool, command.ability, command.skill ?? null, command.goal);
    case "combat_action":
      return resolveCombatAction(state, context, clientCommandId, command, tool);
    case "combat_move":
      return resolveCombatMove(state, context, clientCommandId, command, tool);
    case "tactical_zone_create":
      return resolveTacticalZoneCreate(state, context, clientCommandId, command, tool);
    case "end_turn":
      return resolvePlayerEndTurn(state, context, clientCommandId, command, tool);
    case "controlled_actor_create":
      return resolveControlledActorCreate(state, context, clientCommandId, command, tool);
    case "controlled_actor_command":
      return resolveControlledActorCommand(state, context, clientCommandId, command, tool);
    case "controlled_actor_dismiss":
      return resolveControlledActorDismiss(state, context, clientCommandId, command, tool);
    case "party_create":
      return resolvePartyCreate(state, context, clientCommandId, command, tool);
    case "party_set_viewpoint":
      return resolvePartySetViewpoint(state, context, clientCommandId, command, tool);
    case "party_split":
      return resolvePartySplit(state, context, clientCommandId, command, tool);
    case "party_rejoin":
      return resolvePartyRejoin(state, context, clientCommandId, command, tool);
    case "party_shared_transfer":
      return resolvePartySharedTransfer(state, context, clientCommandId, command, tool);
    case "party_group_check":
      return resolvePartyGroupCheck(state, context, clientCommandId, command, tool);
    case "situation_create":
      return resolveSituationCreate(state, context, clientCommandId, command, tool);
    case "situation_visit":
      return resolveSituationVisit(state, context, clientCommandId, command, tool);
    case "situation_clue_attempt":
      return resolveSituationClueAttempt(state, context, clientCommandId, command, tool);
    case "situation_ignore":
      return resolveSituationIgnore(state, context, clientCommandId, command, tool);
    case "situation_choose":
      return resolveSituationChoice(state, context, clientCommandId, command, tool);
    case "combat_start":
      return resolveCombatStart(state, context, clientCommandId, command, tool);
    case "encounter_decision":
      return resolveEncounterDecision(state, context, clientCommandId, command, tool);
    case "custody_action":
      return resolveCustodyAction(state, context, clientCommandId, command, tool);
    case "spawn_creature":
      return resolveSpawnCreature(state, context, clientCommandId, command, tool);
    case "learn_spell":
      return resolveLearnSpell(state, context, clientCommandId, command, tool);
    case "prepare_spell":
      return resolvePrepareSpell(state, context, clientCommandId, command, tool);
    case "cast_spell":
      return resolveCastSpell(state, context, clientCommandId, command, tool);
    case "reaction_response":
      return resolveReactionResponse(state, context, clientCommandId, command, tool);
    case "advance_turn":
      return resolveAdvanceTurn(state, context, clientCommandId, command, tool);
    case "advancement_confirm":
      return resolveAdvancementConfirm(state, context, clientCommandId, command, tool);
    case "npc_advance":
      return resolveNpcAdvance(state, context, clientCommandId, command, tool);
    case "death_save":
      return resolveDeathSave(state, context, clientCommandId, command, tool);
    case "loot":
      return resolveLoot(state, context, clientCommandId, command, tool);
    case "rest":
      return resolveRest(state, context, clientCommandId, command, tool);
    case "project":
      return resolveProject(state, context, clientCommandId, command, tool);
    case "use_item":
      return resolveUseItem(state, context, clientCommandId, command, tool);
    case "declare":
      return commit(
        state,
        context,
        clientCommandId,
        command,
        tool,
        "You put your plan into motion.",
        { goal: command.goal },
        "declared",
        [],
        [],
        []
      );
  }
}

function resolveMove(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "move" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") {
    return rejection(state, tool, "combat_active", "You cannot leave while the encounter is active.");
  }

  const actorLocationRelationships = state.runtimeContent.relationships.filter((relationship) =>
    relationship.relation === "located_in"
    && relationship.fromKind === "actor"
    && relationship.fromId === state.actorId
    && relationship.toKind === "content_instance"
  );
  if (actorLocationRelationships.length > 0) {
    if (actorLocationRelationships.length > 1) {
      return rejection(state, tool, "location_ambiguous", "The actor has more than one canonical location; movement is paused until that contradiction is reconciled.");
    }
    const currentLocationId = actorLocationRelationships[0].toId;
    const exitRelationship = state.runtimeContent.relationships.find((relationship) =>
      relationship.relation === "connects_to"
      && relationship.fromId === currentLocationId
      && relationship.exit
      && (relationship.exit.key === command.destinationId || relationship.toId === command.destinationId)
    );
    if (!exitRelationship || !exitRelationship.exit) {
      return rejection(state, tool, "invalid_move", "That destination is not an established exit from the actor's canonical location.");
    }
    if (exitRelationship.exit.hidden && !exitRelationship.exit.discovered) {
      return rejection(state, tool, "location_exit_undiscovered", "That exit has not been discovered by the actor.");
    }
    if (!exitRelationship.exit.open || exitRelationship.exit.locked || exitRelationship.exit.blocked) {
      return rejection(state, tool, "location_exit_unavailable", "That canonical exit is closed, locked, or blocked.", { exit: exitRelationship.exit });
    }
    if (exitRelationship.exit.requirements.length > 0) {
      return rejection(state, tool, "location_exit_requirements_unresolved", "That exit has traversal requirements that are not resolved by the current movement command.", { requirements: exitRelationship.exit.requirements });
    }
    const targetLocation = state.runtimeContent.instances.find((instance) => instance.id === exitRelationship.toId && instance.kind === "location");
    if (!targetLocation) {
      return rejection(state, tool, "location_exit_target_missing", "That exit points to a location instance that is not present in canonical state.");
    }
    const next = cloneCampaign(state);
    next.runtimeContent.relationships = next.runtimeContent.relationships.map((relationship) =>
      relationship.id === actorLocationRelationships[0].id
        ? { ...relationship, toId: targetLocation.id }
        : relationship
    );
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "You move through " + exitRelationship.exit.key + ".",
      {
        exit: exitRelationship.exit,
        fromLocationId: currentLocationId,
        toLocationId: targetLocation.id,
        runtimeContent: projectRuntimeContentForActor(next.runtimeContent),
      },
      "location_moved",
      [],
      [],
      [{
        path: `/runtimeContent/relationships/${escapeJsonPointerSegment(actorLocationRelationships[0].id)}/toId`,
        before: currentLocationId,
        after: targetLocation.id,
      }]
    );
  }

  const exit = state.worldContext?.exits.find((candidate) => candidate.id === command.destinationId);
  if (!exit) {
    return rejection(
      state,
      tool,
      "invalid_move",
      state.worldContext
        ? "That destination is not one of the exits the DM has established in the current context."
        : "There is no established world context to move through yet."
    );
  }
  const next = cloneCampaign(state);
  if (next.situation?.status === "active" && next.situation.nodes.some((node) => node.id === exit.id)) {
    next.situation.currentLocationId = exit.id;
    next.situation.visitedLocationIds = [...new Set([...next.situation.visitedLocationIds, exit.id])];
    next.situation.revision += 1;
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You follow the established route: " + exit.label + ".",
    { exit, worldContext: state.worldContext, situation: next.situation ? projectSituationForActor(next.situation, next, context.actorId) : null },
    "moved",
    [],
    [],
    next.situation && JSON.stringify(state.situation) !== JSON.stringify(next.situation)
      ? [{ path: "/situation", before: projectSituationForActor(state.situation!, state, context.actorId), after: projectSituationForActor(next.situation, next, context.actorId) }]
      : []
  );
}

function proceduralNoticeView(notice: EngineProceduralNotice): PublicProjection["proceduralNotices"][number] {
  return {
    ...notice,
    terms: notice.status === "delivered" || notice.status === "resolved" ? { ...notice.terms } : null,
    attempts: notice.attempts.map((attempt) => ({ ...attempt })),
  };
}

function sanitizeProceduralNoticeActions(
  actions: NarrationEnvelope["suggestedActions"],
  notices: EngineProceduralNotice[],
): NarrationEnvelope["suggestedActions"] {
  const hasSealed = notices.some((notice) => notice.status === "sealed");
  const hasAuthorized = notices.some((notice) => notice.status === "authorized");
  const authorizeUnavailable = notices.length > 0 && !hasSealed;
  const deliverUnavailable = notices.length > 0 && !hasAuthorized;
  if (!notices.length) return actions;
  return actions.filter((action) => {
    const text = `${action.id} ${action.label} ${action.prompt}`.toLocaleLowerCase();
    if ((text.includes("open") || text.includes("read-back") || text.includes("read back")) && (text.includes("notice") || text.includes("letter") || text.includes("clerk") || text.includes("order"))) return false;
    if (authorizeUnavailable && (text.includes("authorize") || text.includes("authorise"))) return false;
    if (deliverUnavailable && (text.includes("deliver") || text.includes("clerk delivery"))) return false;
    return true;
  });
}

function resolveProceduralNotice(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineProceduralNoticeCommand,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  const notices = state.proceduralNotices ?? [];
  const now = new Date().toISOString();
  if (command.action === "upsert") {
    const input = command.notice!;
    const existing = notices.find((notice) => notice.id === input.id);
    if (existing && existing.status !== "sealed") {
      return rejection(state, tool, "notice_locked", "Operative notice terms cannot change after authorization or delivery.", { notice: proceduralNoticeView(existing) });
    }
    const notice: EngineProceduralNotice = existing
      ? {
          ...existing,
          title: input.title,
          terms: input.terms,
          revision: existing.revision + 1,
          updatedAt: now,
          provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version + 1 },
        }
      : {
          ...input,
          status: "sealed",
          attempts: [],
          revision: 1,
          authorizedAtVersion: null,
          deliveredAtVersion: null,
          createdAt: now,
          updatedAt: now,
          provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version + 1 },
        };
    const next = cloneCampaign(state);
    next.proceduralNotices = existing
      ? notices.map((candidate) => candidate.id === notice.id ? notice : candidate)
      : [...notices, notice].slice(-20);
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "A sealed procedural notice is recorded. Its operative terms remain closed until the prescribed delivery step.",
      { notice: proceduralNoticeView(notice) },
      "procedural_notice_sealed",
      [],
      [],
      [{ path: `/proceduralNotices/${notice.id}`, before: existing ?? null, after: notice }],
    );
  }

  const noticeId = command.noticeId!;
  const existing = notices.find((candidate) => candidate.id === noticeId);
  if (!existing) return rejection(state, tool, "notice_not_found", "That procedural notice is not established in the campaign.");
  const expectedStatus: Partial<Record<Exclude<EngineProceduralNoticeCommand["action"], "upsert">, EngineProceduralNoticeStatus>> = {
    authorize: "sealed",
    deliver: "authorized",
    request_copy: "delivered",
    request_clarification: "delivered",
    resolve: "delivered",
    withdraw: "sealed",
  };
  if (existing.status !== expectedStatus[command.action]) {
    if (command.action === "deliver" && existing.status === "delivered") {
      return rejection(state, tool, "notice_already_delivered", "This notice has already been delivered; its operative projection is available below.", { notice: proceduralNoticeView(existing) });
    }
    return rejection(state, tool, "notice_action_unavailable", `The ${command.action.replaceAll("_", " ")} step is unavailable while this notice is ${existing.status}.`, { notice: proceduralNoticeView(existing) });
  }

  const nextNotice: EngineProceduralNotice = {
    ...existing,
    attempts: existing.attempts.map((attempt) => ({ ...attempt })),
    revision: existing.revision + 1,
    updatedAt: now,
    provenance: { ...existing.provenance },
  };
  let message = "The procedural notice is updated.";
  let outcome = "procedural_notice_updated";
  let request: { kind: "copy" | "clarification"; outcome: "granted" | "denied"; reason: string } | undefined;
  if (command.action === "authorize") {
    nextNotice.status = "authorized";
    nextNotice.authorizedAtVersion = state.version + 1;
    message = "The notice is authorized for the prescribed clerk-delivery step. Its operative terms remain closed until delivery.";
    outcome = "procedural_notice_authorized";
  } else if (command.action === "deliver") {
    nextNotice.status = "delivered";
    nextNotice.deliveredAtVersion = state.version + 1;
    message = "The authorized clerk-delivery step is complete. The player-safe operative terms are now available.";
    outcome = "procedural_notice_delivered";
  } else if (command.action === "resolve") {
    nextNotice.status = "resolved";
    message = "The procedural notice is resolved; its delivered terms remain available for replay.";
    outcome = "procedural_notice_resolved";
  } else if (command.action === "withdraw") {
    nextNotice.status = "withdrawn";
    message = "The sealed procedural notice is withdrawn before delivery.";
    outcome = "procedural_notice_withdrawn";
  } else {
    const kind = command.action === "request_copy" ? "copy" : "clarification";
    const policy = nextNotice.terms[kind];
    const requestOutcome = policy.allowed ? "granted" : "denied";
    const reason = policy.allowed
      ? kind === "copy"
        ? "The player-safe operative terms are copied; restricted records remain closed."
        : "The player-safe clarification is delivered from the operative terms; restricted records remain closed."
      : policy.denialReason!;
    const attempt: EngineProceduralNoticeAttempt = {
      id: randomUUID(),
      kind,
      outcome: requestOutcome,
      requestText: command.requestText ?? null,
      reason,
      sourceCommandId: clientCommandId,
      sourceVersion: state.version + 1,
      occurredAt: now,
    };
    nextNotice.attempts = [...nextNotice.attempts, attempt].slice(-20);
    request = { kind, outcome: requestOutcome, reason };
    message = requestOutcome === "granted"
      ? reason
      : `${reason} The operative terms remain available so the procedure does not become a dead end.`;
    outcome = `procedural_notice_${kind}_${requestOutcome}`;
  }

  const next = cloneCampaign(state);
  next.proceduralNotices = notices.map((candidate) => candidate.id === nextNotice.id ? nextNotice : candidate);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      notice: proceduralNoticeView(nextNotice),
      ...(request ? { request } : {}),
    },
    outcome,
    [],
    [],
    [{ path: `/proceduralNotices/${nextNotice.id}`, before: existing, after: nextNotice }],
  );
}

function resolveWorldContext(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "world_context" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const validation = validateWorldContextPatch(state, command);
  if (validation) return rejection(state, tool, validation.code, validation.message);

  const currentWorldContext = state.worldContext;
  const npcPatch = applyNpcPatch(currentWorldContext?.npcs ?? [], command.npcs);
  const merchantPatch = applyMerchantPatch(currentWorldContext?.merchants ?? [], command.merchants);
  const sceneId = currentWorldContext?.id ?? randomUUID();
  const factPatch = applyWorldFactPatch(state.worldFacts, command.facts, sceneId);
  const objectPatch = applyWorldObjectPatch(
    currentWorldContext?.objects ?? [],
    command.objects,
    sceneId,
    clientCommandId,
    state.version + 1,
  );
  if (objectPatch.error) return rejection(state, tool, objectPatch.error.code, objectPatch.error.message);
  const objectTopology = worldObjectTopologyValidation(objectPatch.entities, sceneId, state.actorId);
  if (objectTopology) return rejection(state, tool, objectTopology.code, objectTopology.message);
  const worldContext = {
    id: sceneId,
    title: command.title,
    description: command.description,
    features: command.features,
    exits: command.exits,
    npcs: npcPatch.entities,
    merchants: merchantPatch.entities,
    objects: objectPatch.entities,
  };
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (!currentWorldContext) {
    stateChanges.push({ path: "/worldContext/id", before: null, after: worldContext.id });
  }
  appendWorldContextChange(stateChanges, "/worldContext/title", currentWorldContext?.title ?? null, worldContext.title);
  appendWorldContextChange(stateChanges, "/worldContext/description", currentWorldContext?.description ?? null, worldContext.description);
  appendWorldContextChange(stateChanges, "/worldContext/features", currentWorldContext?.features ?? null, worldContext.features);
  appendWorldContextChange(stateChanges, "/worldContext/exits", currentWorldContext?.exits ?? null, worldContext.exits);
  stateChanges.push(...npcPatch.stateChanges, ...merchantPatch.stateChanges);
  stateChanges.push(...objectPatch.stateChanges);
  stateChanges.push(...factPatch.stateChanges);

  const next = cloneCampaign(state);
  next.worldContext = worldContext;
  next.worldFacts = factPatch.entities;
  if (next.situation) {
    const beforeSituation = next.situation;
    next.situation = reconcileSituation(next.situation, next);
    if (JSON.stringify(beforeSituation) !== JSON.stringify(next.situation)) {
      next.situation.revision += 1;
      stateChanges.push({
        path: "/situation",
        before: projectSituationForActor(state.situation!, state, context.actorId),
        after: projectSituationForActor(next.situation, next, context.actorId),
      });
    }
  }
  markKnowledgeStale(next, factPatch.changedFactIds);
  evaluatePassiveKnowledge(next, context.actorId, state.version + 1);
  if (JSON.stringify(state.actorKnowledge) !== JSON.stringify(next.actorKnowledge)) {
    stateChanges.push({ path: "/actorKnowledge", before: state.actorKnowledge, after: next.actorKnowledge });
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The current context is now " + worldContext.title + ".",
    { worldContext: actorKnowledgeProjection(context.actorId, next).worldContext, situation: next.situation ? projectSituationForActor(next.situation, next, context.actorId) : null },
    "world_context_updated",
    [],
    [],
    stateChanges
  );
}

function runtimeItemKind(category: RuntimeItemDefinition["category"]): EngineItemDefinition["kind"] {
  switch (category) {
    case "tool": return "tool";
    case "consumable": return "consumable";
    case "quest": return "quest";
    case "treasure": return "treasure";
    default: return "misc";
  }
}

const RUNTIME_ARCANE_SYNTHESIS_POLICY_REVISION = "runtime-arcane-synthesis-v2" as const;
type EngineSpellRecord = NonNullable<ReturnType<typeof getOpen5eSpell>>;
type RuntimeSpellDamageEffect = Extract<CompiledSpellEffect, { effectKind: "damage" }>;
type RuntimeSpellHealingEffect = Extract<CompiledSpellEffect, { effectKind: "healing" }>;

interface ReviewedSpellScrollUse {
  command: Extract<EngineCommand, { kind: "use_item" }>;
  item: EngineInventoryItem;
  itemView: EngineInventoryItemView;
  definition: EngineSpellScrollDefinition;
}

function titleCaseRuntimeSpellSchool(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLocaleUpperCase("en-US")}${value.slice(1)}`;
}

/**
 * Runtime spells are reconstructed from their persisted typed execution
 * record. They deliberately use the same record shape as the Open5e kernel so
 * ordinary learn/prepare/cast resolution remains the only spell engine.
 */
function runtimeSpellRecord(
  state: LanternCampaignState,
  contentKey: string,
  packHash?: string,
): EngineSpellRecord | null {
  return runtimeSpellRecordFromContent(state.runtimeContent, contentKey, packHash);
}

function runtimeSpellRecordFromContent(
  runtimeContent: RuntimeContentState,
  contentKey: string,
  packHash?: string,
): EngineSpellRecord | null {
  const definition = runtimeContent.definitions.find((candidate): candidate is RuntimeSpellDefinition =>
    candidate.kind === "spell" && candidate.id === contentKey
  );
  const execution = definition?.execution;
  if (!definition || !execution) return null;
  if (packHash !== undefined && packHash !== execution.policyRevision) return null;
  const effect = execution.effect;
  const legacy = execution.policyRevision === "runtime-arcane-synthesis-v1";
  const rangeKind = legacy ? "distance" : execution.rangeKind;
  const rangeText = rangeKind === "self"
    ? "Self"
    : rangeKind === "touch"
      ? "Touch"
      : `${execution.rangeFeet} feet`;
  const school = definition.school;
  const normalized: NormalizedSpell = {
    kind: "spell",
    fidelityTier: 1,
    key: definition.key ?? definition.id,
    contentKey: definition.id,
    sourceKey: definition.id,
    documentKey: "lantern-runtime",
    gamesystem: "5e-2014",
    publisher: { key: "lantern", name: "Lantern" },
    licenseKeys: ["lantern-runtime"],
    permalink: "https://github.com/Mnehmos/rpg-mcp-live/issues/134",
    sourceApiVersion: "v1",
    sourceFetchedAt: definition.provenance.createdAt,
    name: definition.name,
    description: definition.description,
    level: definition.level,
    school: {
      sourceKey: school,
      contentKey: `runtime:spell-school:${school}`,
      name: titleCaseRuntimeSpellSchool(school),
    },
    higherLevel: "",
    targetType: execution.targetType,
    targetCount: execution.targetCount,
    range: { text: rangeText, distance: execution.rangeFeet, unit: "feet" },
    ritual: false,
    castingTime: execution.castingTime,
    reactionCondition: legacy ? null : execution.reactionCondition,
    components: {
      verbal: true,
      somatic: true,
      material: false,
      materialSpecified: "",
      materialCostGp: null,
      materialConsumed: false,
    },
    savingThrowAbility: legacy ? null : execution.savingThrowAbility,
    attackRoll: effect.effectKind === "damage" && effect.resolution === "spell-attack",
    damageRoll: null,
    damageTypes: effect.effectKind === "damage" ? [effect.damageType] : [],
    duration: legacy ? "instantaneous" : execution.duration,
    area: { shape: null, size: null, unit: "feet" },
    concentration: false,
    classes: [],
    castingOptions: [],
  };
  return {
    contentKey: definition.id,
    sourceKey: definition.id,
    packHash: execution.policyRevision,
    definition: normalized,
    effect,
    effects: [],
  };
}

function resolveSpellRecord(
  state: LanternCampaignState,
  contentKey: string,
  packHash?: string,
): EngineSpellRecord | null {
  return getOpen5eSpell(contentKey, packHash) ?? runtimeSpellRecord(state, contentKey, packHash);
}

function runtimeSpellPrimitiveEvidence(state: LanternCampaignState, contentKey: string): string[] {
  const definition = state.runtimeContent.definitions.find((candidate): candidate is RuntimeSpellDefinition =>
    candidate.kind === "spell" && candidate.id === contentKey
  );
  return definition?.execution ? [definition.execution.primitiveContentKey] : [];
}

function damageExpressionAverage(
  expression: RuntimeSpellDamageEffect["baseDamage"] | RuntimeSpellHealingEffect["baseHealing"]
): number {
  return expression.kind === "flat"
    ? expression.amount
    : Math.floor(expression.diceCount * (expression.dieSides + 1) / 2) + expression.bonus;
}

function runtimeSpellSynthesisError(
  code: string,
  message: string,
  data?: Record<string, unknown>,
): { code: string; message: string; data?: Record<string, unknown> } {
  return { code, message, ...(data ? { data } : {}) };
}

function runtimeSpellRangeKind(spell: NormalizedSpell): "self" | "touch" | "distance" {
  const range = spell.range.text.trim().toLocaleLowerCase("en-US");
  if (range === "self") return "self";
  if (range === "touch") return "touch";
  return "distance";
}

function runtimeSpellExpectedEffectKind(
  modification: "damage-only" | "healing-only" | "bounded-modifier-only",
): CompiledSpellEffect["effectKind"] {
  if (modification === "damage-only") return "damage";
  if (modification === "healing-only") return "healing";
  return "stat-modifier";
}

/**
 * Admit the complete first synthesis slice by copying one reviewed #2/#4
 * primitive into a persisted runtime spell. The proposal selects an effect
 * family; every mechanical value remains server-derived and budget-checked.
 */
function compileRuntimeArcaneSpell(
  state: LanternCampaignState,
  proposal: Extract<EngineCommand, { kind: "content_compile" }> ["proposal"],
  definition: Extract<ReturnType<typeof compileRuntimeContent>, { ok: true }>["definition"],
): { ok: true; definition: Extract<ReturnType<typeof compileRuntimeContent>, { ok: true }>["definition"] }
  | { ok: false; error: { code: string; message: string; data?: Record<string, unknown> } } {
  if (definition.kind !== "spell" || proposal?.kind !== "spell" || !proposal.synthesis) {
    return { ok: true, definition };
  }
  const campaignPackHash = state.rulesVersion.startsWith("open5e-pack@")
    ? state.rulesVersion.slice("open5e-pack@".length)
    : undefined;
  const primitive = getOpen5eSpell(proposal.synthesis.primitiveContentKey, campaignPackHash);
  if (!primitive) {
    return {
      ok: false,
      error: runtimeSpellSynthesisError(
        "synthesis_primitive_not_found",
        "Arcane synthesis must reference an installed reviewed spell primitive.",
        { primitiveContentKey: proposal.synthesis.primitiveContentKey },
      ),
    };
  }
  const effect = primitive.effect;
  if (!effect) {
    return {
      ok: false,
      error: runtimeSpellSynthesisError(
        "synthesis_primitive_not_executable",
        "That primitive has no reviewed executable spell effect.",
        { primitiveContentKey: primitive.contentKey },
      ),
    };
  }
  const expectedEffectKind = runtimeSpellExpectedEffectKind(proposal.synthesis.modification);
  if (effect.effectKind !== expectedEffectKind) {
    return {
      ok: false,
      error: runtimeSpellSynthesisError(
        "synthesis_modification_mismatch",
        "The requested synthesis category does not match the reviewed primitive effect.",
        {
          primitiveContentKey: primitive.contentKey,
          requestedModification: proposal.synthesis.modification,
          reviewedEffectKind: effect.effectKind,
        },
      ),
    };
  }
  const rangeKind = runtimeSpellRangeKind(primitive.definition);
  const validDelivery = effect.effectKind !== "damage"
    || effect.resolution !== "saving-throw"
    || primitive.definition.savingThrowAbility !== null;
  const validCastingTime = effect.effectKind === "stat-modifier"
    ? primitive.definition.castingTime === "reaction"
      && effect.modifier.trigger === "incoming-attack-would-hit"
      && primitive.definition.reactionCondition !== null
    : primitive.definition.castingTime === "action" || primitive.definition.castingTime === "bonus-action";
  if (
    primitive.definition.targetType !== "creature"
    || primitive.definition.targetCount !== 1
    || primitive.definition.area.shape !== null
    || !validCastingTime
    || !validDelivery
    || primitive.definition.concentration
    || primitive.definition.ritual
    || primitive.definition.range.distance < 0
    || primitive.definition.range.distance > 120
  ) {
    return {
      ok: false,
      error: runtimeSpellSynthesisError(
        "synthesis_primitive_out_of_scope",
        "Arcane synthesis admits one non-area, non-concentration creature target within 120 feet, using a reviewed action, bonus action, save, attack, or incoming-hit reaction delivery.",
        { primitiveContentKey: primitive.contentKey },
      ),
    };
  }
  const damageOverBudget = effect.effectKind === "damage" && [
    effect.baseDamage,
    ...Object.values(effect.slotLevelVariants),
    ...Object.values(effect.playerLevelVariants),
  ].some((expression) =>
    (expression.kind === "dice" && (expression.diceCount > 4 || expression.dieSides > 10))
    || damageExpressionAverage(expression) > 20
  );
  const healingOverBudget = effect.effectKind === "healing" && (
    (effect.baseHealing.kind === "dice" && (
      effect.baseHealing.diceCount > 1
      || effect.baseHealing.dieSides > 8
      || effect.baseHealing.bonus > 0
    ))
    || damageExpressionAverage(effect.baseHealing) > 10
    || Object.values(effect.slotLevelVariants).some((expression) =>
      (expression.kind === "dice" && (expression.diceCount > 9 || expression.dieSides > 8))
      || damageExpressionAverage(expression) > 45
    )
  );
  const modifierOverBudget = effect.effectKind === "stat-modifier" && (
    effect.modifier.stat !== "armor-class"
    || effect.modifier.amount <= 0
    || effect.modifier.amount > 5
    || effect.modifier.duration.kind !== "turn-boundary"
    || effect.modifier.duration.offsetTurns > 1
  );
  if (damageOverBudget || healingOverBudget || modifierOverBudget || primitive.definition.level > 1) {
    return {
      ok: false,
      error: runtimeSpellSynthesisError(
        "synthesis_power_budget_exceeded",
        "The reviewed primitive exceeds the first arcane-synthesis power budget.",
        {
          primitiveContentKey: primitive.contentKey,
          maxSpellLevel: 1,
          maxAverageDamage: 20,
          maxBaseHealing: 10,
          maxArmorClassModifier: 5,
        },
      ),
    };
  }
  const execution = runtimeSpellExecutionSchema.parse({
    primitiveContentKey: primitive.contentKey,
    policyRevision: RUNTIME_ARCANE_SYNTHESIS_POLICY_REVISION,
    castingTime: primitive.definition.castingTime,
    rangeKind,
    rangeFeet: primitive.definition.range.distance,
    targetType: "creature",
    targetCount: 1,
    savingThrowAbility: primitive.definition.savingThrowAbility,
    reactionCondition: primitive.definition.reactionCondition,
    duration: effect.effectKind === "stat-modifier" ? primitive.definition.duration : "instantaneous",
    effect,
  });
  const authoritativeSchool = primitive.definition.school.sourceKey;
  if (!runtimeSpellDefinitionSchema.shape.school.safeParse(authoritativeSchool).success) {
    return {
      ok: false,
      error: runtimeSpellSynthesisError(
        "synthesis_school_unsupported",
        "The reviewed primitive uses a school outside the runtime spell vocabulary.",
        { primitiveContentKey: primitive.contentKey, school: authoritativeSchool },
      ),
    };
  }
  return {
    ok: true,
    definition: runtimeSpellDefinitionSchema.parse({
      ...definition,
      school: authoritativeSchool,
      level: primitive.definition.level,
      executionTier: 2,
      capabilities: [
        "spell",
        effect.effectKind === "stat-modifier" ? "modifier" : effect.effectKind,
        "runtime-synthesis",
      ],
      execution,
    }),
  };
}

/**
 * Runtime item instances enter the ordinary inventory kernel. The runtime
 * content record remains the canonical definition/identity; owner and
 * container changes are handled by the existing inventory commands.
 */
function runtimeItemInventoryItem(
  definition: RuntimeItemDefinition,
  instance: RuntimeContentInstance,
  actorId: string,
): EngineInventoryItem {
  return normalizeInventoryItem({
    id: instance.id,
    runtimeContentInstanceId: instance.id,
    quantity: instance.state.quantity ?? 1,
    authoredDefinition: {
      name: definition.name,
      kind: runtimeItemKind(definition.category),
      weight: definition.weight,
      description: definition.description,
      valueCopper: definition.valueCopper ?? undefined,
      properties: [definition.material, ...definition.tags].filter((value, index, values) => values.indexOf(value) === index),
      mechanicsTier: 0,
    },
    ownerRef: { kind: "actor", id: actorId },
    provenance: { kind: "authored", sourceId: definition.id },
  });
}

function validateRuntimeItemDerivation(
  state: LanternCampaignState,
  proposal: Extract<EngineCommand, { kind: "content_compile" }>["proposal"],
  definition: RuntimeItemDefinition,
): { code: string; message: string; data?: Record<string, unknown> } | null {
  if (!proposal || proposal.kind !== "item" || !proposal.derivation) return null;
  const sourceDefinitions = new Map(state.runtimeContent.definitions.map((candidate) => [candidate.id, candidate]));
  const missingDefinitions = proposal.derivation.sourceDefinitionIds.filter((id) => {
    const candidate = sourceDefinitions.get(id);
    return !candidate || candidate.kind !== "item";
  });
  if (missingDefinitions.length > 0) {
    return {
      code: "derived_source_definition_not_found",
      message: "A derived item must reference existing canonical item definitions.",
      data: { sourceDefinitionIds: missingDefinitions },
    };
  }
  const sourceInstances = new Map(state.runtimeContent.instances.map((candidate) => [candidate.id, candidate]));
  const missingInstances = proposal.derivation.sourceInstanceIds.filter((id) => {
    const candidate = sourceInstances.get(id);
    return !candidate || candidate.kind !== "item" || !proposal.derivation!.sourceDefinitionIds.includes(candidate.definitionId);
  });
  if (missingInstances.length > 0) {
    return {
      code: "derived_source_instance_not_found",
      message: "A derived item must reference existing instances of its source definitions.",
      data: { sourceInstanceIds: missingInstances },
    };
  }
  if (!definition.derivation) {
    return { code: "derived_provenance_missing", message: "A derived item must retain its recipe provenance." };
  }
  return null;
}

type ResolvedContentMaterializationEvidence = {
  kind: "released_narration" | "world_context" | "world_fact";
  ref: string;
  textHash: string;
  aliases: string[];
};

function normalizedEvidenceText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[-_]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function contentMaterializationAliases(
  proposal: Extract<EngineCommand, { kind: "content_compile" }>["proposal"],
): string[] {
  if (!proposal || proposal.kind !== "item") return [];
  return [...new Set([proposal.key ?? "", proposal.name, ...proposal.tags]
    .map((value) => value.trim())
    .filter(Boolean))].slice(0, 20);
}

function contentMaterializationIdentityAliases(
  proposal: Extract<EngineCommand, { kind: "content_compile" }>["proposal"],
): string[] {
  if (!proposal || proposal.kind !== "item") return [];
  const aliases = [proposal.key ?? "", proposal.name].filter(Boolean);
  for (const value of [...aliases]) {
    const tokens = normalizedEvidenceText(value).split(/\s+/).filter(Boolean);
    if (tokens.length > 1) aliases.push(tokens.slice(-2).join(" "));
    const noun = tokens.at(-1);
    if (noun && noun.length >= 3) aliases.push(noun);
  }
  return [...new Set(aliases)];
}

function evidenceMentionsAlias(text: string, aliases: string[]): boolean {
  const normalized = ` ${normalizedEvidenceText(text)} `;
  return aliases.some((alias) => {
    const phrase = normalizedEvidenceText(alias);
    return phrase.length >= 3 && normalized.includes(` ${phrase} `);
  });
}

function resolveContentMaterializationEvidence(
  state: LanternCampaignState,
  context: RequestContext,
  command: Extract<EngineCommand, { kind: "content_compile" }>,
): { ok: true; evidence: ResolvedContentMaterializationEvidence }
  | { ok: false; code: string; message: string } {
  const request = command.materialization;
  const proposal = command.proposal;
  if (!request || !proposal || proposal.kind !== "item") {
    return { ok: false, code: "materialization_contract_invalid", message: "World materialization requires one strict item proposal and one evidence reference." };
  }
  if (proposal.category === "quest" || proposal.derivation) {
    return { ok: false, code: "materialization_out_of_scope", message: "This materialization slice admits only ordinary non-derived mundane items." };
  }

  let evidenceText: string | null = null;
  if (request.evidence.kind === "released_narration") {
    const message = state.log.find((entry) => entry.id === request.evidence.ref && entry.kind === "narration");
    evidenceText = message?.text ?? null;
  } else if (request.evidence.kind === "world_context") {
    const world = state.worldContext;
    if (world?.id === request.evidence.ref) {
      evidenceText = [world.title, world.description, ...world.features].join(" ");
    }
  } else {
    const fact = actorKnowledgeProjection(context.actorId, state).facts.find((candidate) =>
      candidate.id === request.evidence.ref
      && candidate.sceneId === state.worldContext?.id
    );
    if (fact) evidenceText = [fact.title, fact.description].join(" ");
  }
  if (!evidenceText) {
    return { ok: false, code: "materialization_evidence_unavailable", message: "The requested item is not supported by actor-safe committed evidence." };
  }

  const aliases = contentMaterializationAliases(proposal);
  if (!evidenceMentionsAlias(evidenceText, contentMaterializationIdentityAliases(proposal))) {
    return { ok: false, code: "materialization_evidence_mismatch", message: "The committed evidence does not establish the proposed item." };
  }
  if (request.holderRef) {
    const holder = state.worldContext?.npcs.find((npc) => npc.id === request.holderRef);
    if (!holder || !evidenceMentionsAlias(evidenceText, [holder.id, holder.name])) {
      return { ok: false, code: "materialization_holder_unproven", message: "The committed evidence does not establish that NPC as the item's holder." };
    }
  }

  return {
    ok: true,
    evidence: {
      kind: request.evidence.kind,
      ref: request.evidence.ref,
      textHash: createHash("sha256").update(evidenceText).digest("hex"),
      aliases,
    },
  };
}

function sameRuntimeDefinition(
  left: RuntimeContentState["definitions"][number],
  right: RuntimeContentState["definitions"][number],
): boolean {
  const { provenance: _leftProvenance, ...leftValue } = left;
  const { provenance: _rightProvenance, ...rightValue } = right;
  return JSON.stringify(leftValue) === JSON.stringify(rightValue);
}

function sameRuntimeItemSemantics(
  left: RuntimeContentState["definitions"][number],
  right: RuntimeContentState["definitions"][number],
): boolean {
  if (left.kind !== "item" || right.kind !== "item") return false;
  const { id: _leftId, key: _leftKey, provenance: _leftProvenance, ...leftValue } = left;
  const { id: _rightId, key: _rightKey, provenance: _rightProvenance, ...rightValue } = right;
  return JSON.stringify(leftValue) === JSON.stringify(rightValue);
}

function runtimeWorldObjectMaterial(value: string): EngineWorldObjectInstance["definition"]["material"] {
  const material = value.toLocaleLowerCase("en-US");
  if (/iron|steel|bronze|copper|silver|gold|metal/.test(material)) return "metal";
  if (/wood|timber/.test(material)) return "wood";
  if (/stone|rock/.test(material)) return "stone";
  if (/rope|cord|hemp/.test(material)) return "rope";
  if (/oil/.test(material)) return "oil";
  if (/fire|flame/.test(material)) return "fire";
  if (/cloth|linen|wool|silk|leather/.test(material)) return "cloth";
  if (/paper|parchment/.test(material)) return "paper";
  if (/glass|crystal/.test(material)) return "glass";
  return "mixed";
}

function runtimeWorldObject(
  definition: RuntimeItemDefinition,
  instance: RuntimeContentInstance,
  state: LanternCampaignState,
  clientCommandId: string,
  materialization: NonNullable<Extract<EngineCommand, { kind: "content_compile" }>["materialization"]>,
  evidence: ResolvedContentMaterializationEvidence,
): EngineWorldObjectInstance {
  const world = state.worldContext;
  if (!world) throw new Error("World materialization requires an established context.");
  const declaredAffordances = new Set<EngineWorldObjectAffordance>(["inspect", ...definition.affordances]);
  if (declaredAffordances.has("take")) {
    declaredAffordances.add("carry");
    declaredAffordances.add("drop");
    if (materialization.holderRef) declaredAffordances.add("steal");
  }
  const tags = [...new Set([definition.category, definition.material, ...definition.tags]
    .map((value) => value.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean))].slice(0, 20);
  return {
    id: instance.id,
    definition: {
      key: definition.id,
      sourceRef: `runtime-content:${definition.id}`,
      name: definition.name,
      description: definition.description,
      material: runtimeWorldObjectMaterial(definition.material),
      tags,
      affordances: [...declaredAffordances].slice(0, 20),
      prerequisites: [],
      effectInteractions: [],
      weight: definition.weight,
      criticalPolicy: {
        kind: "ordinary_consequence",
        canDestroy: true,
        canLose: true,
        canSell: definition.valueCopper !== null,
        canConsume: false,
        canHide: true,
      },
    },
    state: "intact",
    sceneId: world.id,
    locationRef: materialization.holderRef ?? null,
    ownerRef: { kind: "world", id: world.id },
    containerRef: null,
    revision: 1,
    provenance: {
      sourceCommandId: clientCommandId,
      sourceVersion: state.version + 1,
      occurredAt: instance.provenance.createdAt,
    },
    materialization: {
      runtimeDefinitionId: definition.id,
      runtimeInstanceId: instance.id,
      evidence: {
        kind: evidence.kind,
        ref: evidence.ref,
        textHash: evidence.textHash,
      },
      aliases: evidence.aliases,
      compilerRevision: "runtime-world-object-bridge-v1",
    },
  };
}

function resolveContentCompile(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "content_compile" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (command.exitPatch) {
    return resolveRuntimeLocationExitPatch(state, context, clientCommandId, command.exitPatch, tool);
  }
  if (!command.proposal) {
    return rejection(state, tool, "content_proposal_required", "A content compile command needs a strict proposal.");
  }
  if (
    command.proposal.kind === "location"
    && command.createInstance === false
    && Boolean(command.proposal.parentKey || command.proposal.exits.length || command.proposal.occupants.length || command.proposal.objects.length)
  ) {
    return rejection(state, tool, "location_instance_required", "A location with canonical topology references must persist an instance.");
  }
  const resolvedMaterialization = command.materialization
    ? resolveContentMaterializationEvidence(state, context, command)
    : null;
  if (resolvedMaterialization && !resolvedMaterialization.ok) {
    return rejection(state, tool, resolvedMaterialization.code, resolvedMaterialization.message);
  }
  if (command.materialization && !state.worldContext) {
    return rejection(state, tool, "world_context_required", "A persistent world item needs an established current context.");
  }
  const compiled = compileRuntimeContent(
    command.proposal,
    {
      campaignId: state.id,
      authorId: context.actorId,
      source: command.proposal.kind === "item" && command.proposal.derivation ? "derived" : "dm",
      sourceRefs: [
        clientCommandId,
        ...(resolvedMaterialization?.ok
          ? [
              `${resolvedMaterialization.evidence.kind}:${resolvedMaterialization.evidence.ref}`,
              `sha256:${resolvedMaterialization.evidence.textHash}`,
            ]
          : []),
        ...(command.proposal.kind === "item" && command.proposal.derivation
          ? [
              ...command.proposal.derivation.sourceDefinitionIds,
              ...command.proposal.derivation.sourceInstanceIds,
            ]
          : []),
        ...(command.proposal.kind === "spell" && command.proposal.synthesis
          ? [command.proposal.synthesis.primitiveContentKey]
          : []),
      ],
      createdAt: new Date().toISOString(),
    },
    command.createInstance,
    command.instanceKey ?? "default",
  );
  if (!compiled.ok) return rejection(state, tool, compiled.code, compiled.message, { proposalKind: command.proposal.kind });

  if (compiled.definition.kind === "item") {
    const derivationError = validateRuntimeItemDerivation(state, command.proposal, compiled.definition);
    if (derivationError) return rejection(state, tool, derivationError.code, derivationError.message, derivationError.data);
  }

  const resolvedTopology = resolveCompiledLocationTargets(state, command.proposal, compiled);
  if (!resolvedTopology.ok) {
    return rejection(state, tool, resolvedTopology.code, resolvedTopology.message, resolvedTopology.data);
  }
  let compiledForCommit = resolvedTopology.compiled;
  const runtimeSpell = compileRuntimeArcaneSpell(state, command.proposal, compiledForCommit.definition);
  if (!runtimeSpell.ok) {
    return rejection(state, tool, runtimeSpell.error.code, runtimeSpell.error.message, runtimeSpell.error.data);
  }
  compiledForCommit = { ...compiledForCommit, definition: runtimeSpell.definition };
  const topologyValidation = validateCompiledLocationTopology(state, command.proposal, compiledForCommit);
  if (topologyValidation) return rejection(state, tool, topologyValidation.code, topologyValidation.message, topologyValidation.data);

  const existingDefinitions = state.runtimeContent.definitions;
  let existingDefinition = existingDefinitions.find((definition) => definition.id === compiledForCommit.definition.id);
  if (existingDefinition) {
    if (!command.materialization) {
      return rejection(
        state,
        tool,
        "content_already_exists",
        "That stable runtime content definition already exists in this campaign; no duplicate was created.",
        { definitionId: existingDefinition.id, kind: existingDefinition.kind },
      );
    }
    if (existingDefinition.kind !== "item" || compiledForCommit.definition.kind !== "item" || !sameRuntimeDefinition(existingDefinition, compiledForCommit.definition)) {
      return rejection(
        state,
        tool,
        "content_definition_conflict",
        "That stable definition key already names different canonical content.",
        { definitionId: existingDefinition.id },
      );
    }
  } else if (command.materialization && compiledForCommit.definition.kind === "item") {
    existingDefinition = existingDefinitions.find((definition) => sameRuntimeItemSemantics(definition, compiledForCommit.definition));
  }
  if (existingDefinition) {
    compiledForCommit = {
      ...compiledForCommit,
      definition: existingDefinition,
      instance: compiledForCommit.instance
        ? { ...compiledForCommit.instance, definitionId: existingDefinition.id }
        : null,
    };
  }
  const existingInstance = compiledForCommit.instance
    ? state.runtimeContent.instances.find((instance) => instance.id === compiledForCommit.instance!.id)
    : null;
  if (existingInstance) {
    return rejection(
      state,
      tool,
      "content_instance_already_exists",
      "That stable runtime content instance already exists in this campaign; no duplicate was created.",
      { instanceId: existingInstance.id, definitionId: existingInstance.definitionId },
    );
  }
  const conflictingRelationship = compiledForCommit.relationships.find((relationship) =>
    state.runtimeContent.relationships.some((existing) => existing.id === relationship.id)
  );
  if (conflictingRelationship) {
    return rejection(
      state,
      tool,
      "content_relationship_already_exists",
      "That stable runtime content relationship already exists in this campaign; no duplicate was created.",
      { relationshipId: conflictingRelationship.id },
    );
  }

  const next = cloneCampaign(state);
  let runtimeInventoryItem: EngineInventoryItem | null = null;
  let materializedWorldObject: EngineWorldObjectInstance | null = null;
  if (
    command.materialization
    && resolvedMaterialization?.ok
    && compiledForCommit.definition.kind === "item"
    && compiledForCommit.instance
    && next.worldContext
  ) {
    if (next.worldContext.objects.length >= 40) {
      return rejection(state, tool, "object_limit_exceeded", "A world context can contain at most 40 world objects.");
    }
    if (next.worldContext.objects.some((object) => object.id === compiledForCommit.instance!.id)) {
      return rejection(state, tool, "content_world_object_conflict", "That canonical content instance already has a world-object identity.");
    }
    materializedWorldObject = runtimeWorldObject(
      compiledForCommit.definition,
      compiledForCommit.instance,
      state,
      clientCommandId,
      command.materialization,
      resolvedMaterialization.evidence,
    );
    const topologyIssue = worldObjectTopologyValidation(
      [...next.worldContext.objects, materializedWorldObject],
      next.worldContext.id,
      state.actorId,
    );
    if (topologyIssue) return rejection(state, tool, topologyIssue.code, topologyIssue.message);
    next.worldContext.objects = [...next.worldContext.objects, materializedWorldObject];
  } else if (compiledForCommit.definition.kind === "item" && compiledForCommit.instance) {
    runtimeInventoryItem = runtimeItemInventoryItem(compiledForCommit.definition, compiledForCommit.instance, next.character.id);
    const inventoryConflict = next.character.inventory.some((item) => item.id === runtimeInventoryItem!.id);
    if (inventoryConflict) {
      return rejection(state, tool, "content_inventory_instance_conflict", "That runtime item instance already exists in the normal inventory.");
    }
    next.character.inventory = [...next.character.inventory, runtimeInventoryItem];
    const topologyIssue = inventoryTopologyIssue(next.character.inventory, next.character.id);
    if (topologyIssue) return rejection(state, tool, topologyIssue.code, topologyIssue.message);
    const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
    if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
  }
  next.runtimeContent = {
    definitions: existingDefinition
      ? [...state.runtimeContent.definitions]
      : [...state.runtimeContent.definitions, compiledForCommit.definition],
    instances: compiledForCommit.instance
      ? [...state.runtimeContent.instances, compiledForCommit.instance]
      : [...state.runtimeContent.instances],
    relationships: [...state.runtimeContent.relationships, ...compiledForCommit.relationships],
  };
  const stateChanges = [
    ...(!existingDefinition ? [{
      path: `/runtimeContent/definitions/${escapeJsonPointerSegment(compiledForCommit.definition.id)}`,
      before: null,
      after: compiledForCommit.definition,
    }] : []),
    ...(compiledForCommit.instance ? [{
      path: `/runtimeContent/instances/${escapeJsonPointerSegment(compiledForCommit.instance.id)}`,
      before: null,
      after: compiledForCommit.instance,
    }] : []),
    ...(runtimeInventoryItem ? [{
      path: "/character/inventory",
      before: state.character.inventory,
      after: next.character.inventory,
    }] : []),
    ...(materializedWorldObject ? [{
      path: `/worldContext/objects/${escapeJsonPointerSegment(materializedWorldObject.id)}`,
      before: null,
      after: materializedWorldObject,
    }] : []),
    ...compiledForCommit.relationships.map((relationship) => ({
      path: `/runtimeContent/relationships/${escapeJsonPointerSegment(relationship.id)}`,
      before: null,
      after: relationship,
    })),
  ];
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    materializedWorldObject
      ? `Compiled and materialized canonical item content: ${compiledForCommit.definition.name}.`
      : `Compiled canonical ${compiledForCommit.definition.kind} content: ${compiledForCommit.definition.name}.`,
    {
      definition: compiledForCommit.definition,
      instance: compiledForCommit.instance,
      relationships: compiledForCommit.relationships,
      inventoryItem: runtimeInventoryItem ? materializeInventoryItem(runtimeInventoryItem) : null,
      worldObject: materializedWorldObject,
      definitionReused: Boolean(existingDefinition),
    },
    materializedWorldObject ? "content_materialized" : "content_compiled",
    [],
    [],
    stateChanges,
  );
}

function validateCompiledLocationTopology(
  state: LanternCampaignState,
  proposal: Extract<EngineCommand, { kind: "content_compile" }> ["proposal"],
  compiled: Extract<ReturnType<typeof compileRuntimeContent>, { ok: true }>,
): { code: string; message: string; data?: Record<string, unknown> } | null {
  if (compiled.definition.kind !== "location") return null;
  const locationProposal = proposal?.kind === "location" ? proposal : null;
  if (!compiled.instance && (
    compiled.relationships.length > 0
    || Boolean(locationProposal?.parentKey || locationProposal?.exits.length || locationProposal?.occupants.length || locationProposal?.objects.length)
  )) {
    return { code: "location_instance_required", message: "A location with topology references must persist an instance." };
  }
  const definitions = state.runtimeContent.definitions;
  const instances = state.runtimeContent.instances;
  const instanceIds = new Set([
    ...instances.filter((instance) => instance.kind === "location").map((instance) => instance.id),
    ...(compiled.instance?.kind === "location" ? [compiled.instance.id] : []),
  ]);
  const relationships = compiled.relationships;
  if (new Set(relationships.map((relationship) => relationship.id)).size !== relationships.length) {
    return { code: "location_relationship_duplicate", message: "A location proposal cannot repeat the same canonical containment or exit relationship." };
  }
  for (const relationship of relationships) {
    if (compiled.instance && relationship.relation === "located_in" && relationship.fromId === compiled.instance.id && relationship.toId === compiled.instance.id) {
      return { code: "location_parent_cycle", message: "A location cannot contain itself." };
    }
    if (compiled.instance && relationship.relation === "connects_to" && relationship.fromId === compiled.instance.id && relationship.toId === compiled.instance.id) {
      return { code: "location_exit_cycle", message: "A location exit must target a different canonical location instance." };
    }
    if (relationship.relation === "connects_to" || relationship.relation === "located_in" && relationship.toKind === "content_instance") {
      if (!instanceIds.has(relationship.toId)) {
        const relationLabel = relationship.relation === "connects_to" ? "exit target" : "parent location";
        return {
          code: relationship.relation === "connects_to" ? "location_exit_target_not_found" : "location_parent_not_found",
          message: `The ${relationLabel} must already be a canonical location instance before this topology can be committed.`,
          data: { targetId: relationship.toId },
        };
      }
    }
    if (relationship.relation === "located_in" && relationship.fromKind === "actor") {
      if (state.runtimeContent.relationships.some((existing) =>
        existing.relation === "located_in" && existing.fromKind === "actor" && existing.fromId === relationship.fromId
      )) {
        return { code: "location_actor_already_located", message: "An actor may have only one canonical location relationship at a time.", data: { actorId: relationship.fromId } };
      }
      const actorExists = relationship.fromId === state.actorId
        || state.controlledActors.some((actor) => actor.id === relationship.fromId && actor.status === "active")
        || state.worldContext?.npcs.some((npc) => npc.id === relationship.fromId);
      if (!actorExists) return { code: "location_actor_not_found", message: "A location occupant must be an established actor.", data: { actorId: relationship.fromId } };
    }
    if (relationship.relation === "located_in" && relationship.fromKind === "merchant") {
      if (!state.worldContext?.merchants.some((merchant) => merchant.id === relationship.fromId)) {
        return { code: "location_merchant_not_found", message: "A location occupant must be an established merchant.", data: { merchantId: relationship.fromId } };
      }
    }
    if (relationship.relation === "located_in" && relationship.fromKind === "world_object") {
      if (!state.worldContext?.objects.some((object) => object.id === relationship.fromId)) {
        return { code: "location_object_not_found", message: "A location object must be an established world object.", data: { objectId: relationship.fromId } };
      }
    }
  }
  const targetDefinitionIds = new Set(definitions.map((definition) => definition.id));
  for (const relationship of relationships.filter((candidate) => candidate.relation === "connects_to")) {
    const targetInstance = instances.find((instance) => instance.id === relationship.toId);
    if (!targetInstance || !targetDefinitionIds.has(targetInstance.definitionId)) {
      return { code: "location_exit_target_not_found", message: "A typed exit must target a loaded canonical location definition.", data: { targetId: relationship.toId } };
    }
  }
  return null;
}

function resolveCompiledLocationTargets(
  state: LanternCampaignState,
  proposal: Extract<EngineCommand, { kind: "content_compile" }> ["proposal"],
  compiled: Extract<ReturnType<typeof compileRuntimeContent>, { ok: true }>,
):
  | { ok: true; compiled: Extract<ReturnType<typeof compileRuntimeContent>, { ok: true }> }
  | { ok: false; code: string; message: string; data?: Record<string, unknown> } {
  if (!proposal || proposal.kind !== "location" || !compiled.instance) return { ok: true, compiled };

  const instancesForKey = (key: string) => {
    const definitionIds = new Set(
      state.runtimeContent.definitions
        .filter((definition) => definition.kind === "location" && definition.key === key)
        .map((definition) => definition.id),
    );
    return state.runtimeContent.instances.filter((instance) =>
      instance.kind === "location" && definitionIds.has(instance.definitionId)
    );
  };
  const resolveTarget = (key: string, relation: "parent" | "exit") => {
    if (proposal.key === key) {
      return {
        ok: false as const,
        code: relation === "exit" ? "location_exit_cycle" : "location_parent_cycle",
        message: relation === "exit" ? "A location exit must target a different canonical location instance." : "A location cannot contain itself.",
      };
    }
    const candidates = instancesForKey(key);
    if (candidates.length === 0) {
      return {
        ok: false as const,
        code: relation === "exit" ? "location_exit_target_not_found" : "location_parent_not_found",
        message: `The ${relation === "exit" ? "exit target" : "parent location"} must already be a canonical location instance before this topology can be committed.`,
        data: { targetKey: key },
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false as const,
        code: relation === "exit" ? "location_exit_target_ambiguous" : "location_parent_ambiguous",
        message: `The ${relation === "exit" ? "exit target" : "parent location"} resolves to more than one canonical location instance.`,
        data: { targetKey: key, instanceIds: candidates.map((candidate) => candidate.id) },
      };
    }
    return { ok: true as const, instance: candidates[0] };
  };

  const relationships: typeof compiled.relationships = [];
  for (const relationship of compiled.relationships) {
    if (relationship.relation === "located_in" && relationship.fromId === compiled.instance!.id && proposal.parentKey) {
      const target = resolveTarget(proposal.parentKey, "parent");
      if (!target.ok) return target;
      relationships.push({ ...relationship, toId: target.instance.id });
      continue;
    }
    if (relationship.relation === "connects_to" && relationship.exit?.targetKey) {
      const target = resolveTarget(relationship.exit.targetKey, "exit");
      if (!target.ok) return target;
      relationships.push({ ...relationship, toId: target.instance.id });
      continue;
    }
    relationships.push(relationship);
  }
  return { ok: true, compiled: { ...compiled, relationships } };
}

function resolveRuntimeLocationExitPatch(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  patch: Extract<EngineCommand, { kind: "content_compile" }> ["exitPatch"],
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!patch) return rejection(state, tool, "location_exit_patch_required", "A location exit patch is required.");
  const location = state.runtimeContent.instances.find((instance) => instance.id === patch.locationInstanceId && instance.kind === "location");
  if (!location) return rejection(state, tool, "location_not_found", "The requested location instance is not canonical in this campaign.");
  const relationship = state.runtimeContent.relationships.find((candidate) =>
    candidate.relation === "connects_to"
    && candidate.fromId === location.id
    && candidate.exit?.key === patch.exitKey
  );
  if (!relationship?.exit) return rejection(state, tool, "location_exit_not_found", "The requested exit is not established on that location instance.");
  const afterExit = { ...relationship.exit, ...patch.patch };
  if (JSON.stringify(afterExit) === JSON.stringify(relationship.exit)) {
    return rejection(state, tool, "location_exit_unchanged", "The canonical exit already has the requested state.");
  }
  const next = cloneCampaign(state);
  next.runtimeContent.relationships = next.runtimeContent.relationships.map((candidate) =>
    candidate.id === relationship.id ? { ...candidate, exit: afterExit } : candidate
  );
  return commit(
    next,
    context,
    clientCommandId,
    { kind: "content_compile", createInstance: true, exitPatch: patch },
    tool,
    `Updated the canonical ${patch.exitKey} exit on ${location.id}.`,
    { locationInstanceId: location.id, exit: afterExit, runtimeContent: projectRuntimeContentForActor(next.runtimeContent) },
    "location_exit_updated",
    [],
    [],
    [{
      path: `/runtimeContent/relationships/${escapeJsonPointerSegment(relationship.id)}/exit`,
      before: relationship.exit,
      after: afterExit,
    }]
  );
}

type WorldContextPatchValidation = { code: string; message: string };
type WorldContextStateChange = { path: string; before: unknown; after: unknown };

function validateWorldFactPatch(
  existing: EngineWorldFact[],
  operations: EngineWorldFactPatchOperations | undefined
): WorldContextPatchValidation | null {
  if (!operations) return null;
  const upserts = operations.upsert ?? [];
  const removals = operations.remove ?? [];
  if (hasDuplicateEntityId(existing) || hasDuplicateEntityId(upserts) || hasDuplicateEntityId(removals)) {
    return { code: "duplicate_fact_id", message: "Fact identifiers must be unique before a world context can be patched." };
  }
  const upsertIds = new Set(upserts.map((fact) => fact.id));
  if (removals.some((id) => upsertIds.has(id))) {
    return { code: "conflicting_fact_operation", message: "A fact cannot be upserted and removed in the same world_context command." };
  }
  const existingIds = new Set(existing.map((fact) => fact.id));
  if (removals.some((id) => !existingIds.has(id))) {
    return { code: "fact_not_found", message: "The requested fact removal is not established in the current context." };
  }
  if (existing.filter((fact) => fact.active).length - removals.filter((id) => existing.find((fact) => fact.id === id)?.active).length + upserts.filter((fact) => !existingIds.has(fact.id)).length > 40) {
    return { code: "fact_limit_exceeded", message: "A world context can contain at most 40 active facts." };
  }
  return null;
}

function applyWorldFactPatch(
  existing: EngineWorldFact[],
  operations: EngineWorldFactPatchOperations | undefined,
  sceneId: string
): { entities: EngineWorldFact[]; changedFactIds: string[]; stateChanges: WorldContextStateChange[] } {
  if (!operations) return { entities: existing, changedFactIds: [], stateChanges: [] };
  const now = new Date().toISOString();
  const byId = new Map(existing.map((fact) => [fact.id, fact]));
  const changedFactIds: string[] = [];
  const stateChanges: WorldContextStateChange[] = [];
  for (const input of operations.upsert ?? []) {
    const previous = byId.get(input.id);
    const fact: EngineWorldFact = {
      ...input,
      passiveDc: input.passiveDc ?? null,
      sceneId,
      revision: (previous?.revision ?? 0) + 1,
      active: true,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    byId.set(input.id, fact);
    changedFactIds.push(input.id);
    stateChanges.push({ path: "/worldFacts/" + escapeJsonPointerSegment(input.id), before: previous ?? null, after: fact });
  }
  for (const id of operations.remove ?? []) {
    const previous = byId.get(id);
    if (!previous) continue;
    const fact = { ...previous, active: false, revision: previous.revision + 1, updatedAt: now };
    byId.set(id, fact);
    changedFactIds.push(id);
    stateChanges.push({ path: "/worldFacts/" + escapeJsonPointerSegment(id), before: previous, after: fact });
  }
  return { entities: [...byId.values()], changedFactIds: [...new Set(changedFactIds)], stateChanges };
}

function validateWorldObjectPatch(
  existing: EngineWorldObjectInstance[],
  operations: EngineWorldObjectPatchOperations | undefined
): WorldContextPatchValidation | null {
  if (!operations) return null;
  if (hasDuplicateEntityId(existing)) {
    return { code: "ambiguous_object_id", message: "Existing world-object identifiers are ambiguous and cannot be patched safely." };
  }
  const upserts = operations.upsert ?? [];
  const removals = operations.remove ?? [];
  if (hasDuplicateEntityId(upserts) || hasDuplicateEntityId(removals)) {
    return { code: "duplicate_object_id", message: "World-object identifiers must be unique within a patch." };
  }
  const upsertIds = new Set(upserts.map((object) => object.id));
  if (removals.some((id) => upsertIds.has(id))) {
    return { code: "conflicting_object_operation", message: "A world object cannot be upserted and removed in the same world_context command." };
  }
  const existingById = new Map(existing.map((object) => [object.id, object]));
  if (removals.some((id) => !existingById.has(id))) {
    return { code: "object_not_found", message: "The requested world-object removal does not exist in the current context." };
  }
  for (const input of upserts) {
    if (input.ownerRef) {
      return { code: "field_not_authorable", message: "World-object ownership is engine-owned and cannot be authored through world_context." };
    }
    const previous = existingById.get(input.id);
    if (!previous) {
      if (["damaged", "destroyed", "open", "attached", "carried", "equipped"].includes(input.state)) {
        return { code: "object_state_not_authorable", message: "A new world object may only enter an authored baseline state; resolve later outcomes through a typed affordance." };
      }
      if (input.state === "lit" && input.definition.material !== "fire") {
        return { code: "object_state_not_authorable", message: "Only a fire-material object may enter the lit baseline state." };
      }
      continue;
    }
    if (input.definition.key !== previous.definition.key || input.definition.sourceRef !== previous.definition.sourceRef) {
      return { code: "object_definition_conflict", message: "An existing world-object definition cannot be replaced in place." };
    }
    if (!sameWorldContextValue(input.definition, previous.definition)) {
      return { code: "object_definition_conflict", message: "An existing world-object definition cannot be changed in place." };
    }
    if (
      input.state !== previous.state
      || (input.locationRef ?? null) !== previous.locationRef
      || (input.containerRef ?? null) !== previous.containerRef
    ) {
      return { code: "object_state_not_authorable", message: "Existing world-object state and location are engine-owned; use a typed affordance." };
    }
  }
  const additions = upserts.filter((input) => !existingById.has(input.id)).length;
  if (existing.length - removals.length + additions > 40) {
    return { code: "object_limit_exceeded", message: "A world context can contain at most 40 world objects." };
  }
  for (const id of removals) {
    const object = existingById.get(id);
    if (object && !object.definition.criticalPolicy.canLose) {
      return { code: "critical_object_protected", message: "This critical object cannot be removed; resolve its declared loss policy through a typed interaction." };
    }
  }
  return null;
}

function applyWorldObjectPatch(
  existing: EngineWorldObjectInstance[],
  operations: EngineWorldObjectPatchOperations | undefined,
  sceneId: string,
  sourceCommandId: string,
  sourceVersion: number,
): { entities: EngineWorldObjectInstance[]; stateChanges: WorldContextStateChange[]; error: WorldContextPatchValidation | null } {
  const validation = validateWorldObjectPatch(existing, operations);
  if (validation) return { entities: existing, stateChanges: [], error: validation };
  if (!operations) return { entities: existing, stateChanges: [], error: null };
  const now = new Date().toISOString();
  const byId = new Map(existing.map((object) => [object.id, object]));
  const stateChanges: WorldContextStateChange[] = [];
  for (const input of operations.upsert ?? []) {
    const previous = byId.get(input.id);
    const object: EngineWorldObjectInstance = previous
      ? {
          ...previous,
          definition: input.definition,
        }
      : {
          ...input,
          sceneId,
          locationRef: input.locationRef ?? null,
          ownerRef: { kind: "world", id: sceneId },
          containerRef: input.containerRef ?? null,
          revision: 1,
          provenance: { sourceCommandId, sourceVersion, occurredAt: now },
        };
    byId.set(input.id, object);
    if (!sameWorldContextValue(previous ?? null, object)) {
      stateChanges.push({ path: "/worldContext/objects/" + escapeJsonPointerSegment(input.id), before: previous ?? null, after: object });
    }
  }
  for (const id of operations.remove ?? []) {
    const previous = byId.get(id);
    if (!previous) continue;
    byId.delete(id);
    stateChanges.push({ path: "/worldContext/objects/" + escapeJsonPointerSegment(id), before: previous, after: null });
  }
  return { entities: [...byId.values()], stateChanges, error: null };
}

function validateWorldContextPatch(
  state: LanternCampaignState,
  command: Extract<EngineCommand, { kind: "world_context" }>
): WorldContextPatchValidation | null {
  for (const patch of command.npcs?.upsert ?? []) {
    if (Object.hasOwn(patch, "relationshipScore")) {
      return {
        code: "field_not_authorable",
        message: "relationshipScore is authoritative and cannot be authored through world_context.",
      };
    }
    if (Object.hasOwn(patch, "socialDc")) {
      return {
        code: "field_not_authorable",
        message: "socialDc is not a reviewed challenge definition and cannot be authored through world_context.",
      };
    }
  }

  const npcValidation = validateEntityPatchOperations(
    command.npcs,
    state.worldContext?.npcs ?? [],
    "npc",
    (patch) => patch.name === undefined
  );
  if (npcValidation) return npcValidation;

  const factValidation = validateWorldFactPatch(state.worldFacts, command.facts);
  if (factValidation) return factValidation;

  const objectValidation = validateWorldObjectPatch(state.worldContext?.objects ?? [], command.objects);
  if (objectValidation) return objectValidation;
  const existingObjectTopology = worldObjectTopologyValidation(state.worldContext?.objects ?? [], state.worldContext?.id ?? "campaign-scene", state.actorId);
  if (existingObjectTopology) return existingObjectTopology;

  return validateEntityPatchOperations(
    command.merchants,
    state.worldContext?.merchants ?? [],
    "merchant",
    (patch) => patch.name === undefined
  );
}

function validateEntityPatchOperations<T extends { id: string }>(
  operations: { upsert?: T[]; remove?: string[] } | undefined,
  existing: Array<{ id: string }>,
  entity: "npc" | "merchant",
  missingName: (patch: T) => boolean
): WorldContextPatchValidation | null {
  if (!operations) return null;

  const upserts = operations.upsert ?? [];
  const removals = operations.remove ?? [];
  if (hasDuplicateEntityId(existing)) {
    return {
      code: "ambiguous_entity_id",
      message: "Existing " + entity + " identifiers are ambiguous and cannot be patched safely.",
    };
  }
  if (hasDuplicateEntityId(upserts)) {
    return {
      code: "duplicate_entity_id",
      message: "Each " + entity + " upsert identifier must appear only once.",
    };
  }
  if (hasDuplicateEntityId(removals)) {
    return {
      code: "duplicate_entity_id",
      message: "Each " + entity + " removal identifier must appear only once.",
    };
  }

  const upsertIds = new Set(upserts.map((patch) => patch.id));
  if (removals.some((id) => upsertIds.has(id))) {
    return {
      code: "conflicting_entity_operation",
      message: "A " + entity + " cannot be upserted and removed in the same world_context command.",
    };
  }

  const existingIds = new Set(existing.map((candidate) => candidate.id));
  if (removals.some((id) => !existingIds.has(id))) {
    return {
      code: entity + "_not_found",
      message: "The requested " + entity + " removal does not exist in the current context.",
    };
  }
  if (upserts.some((patch) => !existingIds.has(patch.id) && missingName(patch))) {
    return {
      code: entity + "_name_required",
      message: "A new " + entity + " requires a name.",
    };
  }

  const additions = upserts.filter((patch) => !existingIds.has(patch.id)).length;
  if (existing.length - removals.length + additions > 20) {
    return {
      code: entity + "_limit_exceeded",
      message: "A world context can contain at most 20 " + entity + "s.",
    };
  }
  return null;
}

function hasDuplicateEntityId(values: Array<{ id: string }> | string[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const id = typeof value === "string" ? value : value.id;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function applyNpcPatch(
  existing: EngineNpc[],
  operations: EngineNpcPatchOperations | undefined
): { entities: EngineNpc[]; stateChanges: WorldContextStateChange[] } {
  if (!operations) return { entities: existing, stateChanges: [] };

  const existingById = new Map(existing.map((npc) => [npc.id, npc]));
  const updates = new Map<string, EngineNpc>();
  const inserts: EngineNpc[] = [];
  const stateChanges: WorldContextStateChange[] = [];
  for (const patch of operations.upsert ?? []) {
    const before = existingById.get(patch.id);
    const after = mergeNpcPatch(before, patch);
    updates.set(patch.id, after);
    if (!sameWorldContextValue(before ?? null, after)) {
      stateChanges.push({
        path: "/worldContext/npcs/" + escapeJsonPointerSegment(patch.id),
        before: before ?? null,
        after,
      });
    }
    if (!before) inserts.push(after);
  }

  const removals = new Set(operations.remove ?? []);
  const entities = [
    ...existing.filter((npc) => !removals.has(npc.id)).map((npc) => updates.get(npc.id) ?? npc),
    ...inserts,
  ];
  for (const id of operations.remove ?? []) {
    stateChanges.push({
      path: "/worldContext/npcs/" + escapeJsonPointerSegment(id),
      before: existingById.get(id) ?? null,
      after: null,
    });
  }
  return { entities, stateChanges };
}

function applyMerchantPatch(
  existing: EngineMerchant[],
  operations: EngineMerchantPatchOperations | undefined
): { entities: EngineMerchant[]; stateChanges: WorldContextStateChange[] } {
  if (!operations) return { entities: existing, stateChanges: [] };

  const existingById = new Map(existing.map((merchant) => [merchant.id, merchant]));
  const updates = new Map<string, EngineMerchant>();
  const inserts: EngineMerchant[] = [];
  const stateChanges: WorldContextStateChange[] = [];
  for (const patch of operations.upsert ?? []) {
    const before = existingById.get(patch.id);
    const after = mergeMerchantPatch(before, patch);
    updates.set(patch.id, after);
    if (!sameWorldContextValue(before ?? null, after)) {
      stateChanges.push({
        path: "/worldContext/merchants/" + escapeJsonPointerSegment(patch.id),
        before: before ?? null,
        after,
      });
    }
    if (!before) inserts.push(after);
  }

  const removals = new Set(operations.remove ?? []);
  const entities = [
    ...existing.filter((merchant) => !removals.has(merchant.id)).map((merchant) => updates.get(merchant.id) ?? merchant),
    ...inserts,
  ];
  for (const id of operations.remove ?? []) {
    stateChanges.push({
      path: "/worldContext/merchants/" + escapeJsonPointerSegment(id),
      before: existingById.get(id) ?? null,
      after: null,
    });
  }
  return { entities, stateChanges };
}

function mergeNpcPatch(existing: EngineNpc | undefined, patch: EngineNpcPatch): EngineNpc {
  return normalizeNpc({
    id: patch.id,
    name: patch.name ?? existing?.name ?? "",
    description: patch.description ?? existing?.description ?? "",
    disposition: patch.disposition ?? existing?.disposition ?? "neutral",
    goals: patch.goals ?? existing?.goals ?? [],
    // TODO(#21): social DC authoring remains temporary until challenge-tier ownership is migrated.
    socialDc: patch.socialDc ?? existing?.socialDc ?? 12,
    relationshipScore: existing?.relationshipScore ?? 0,
    memories: patch.memories ?? existing?.memories ?? [],
    custody: existing?.custody ?? null,
    ...(patch.agency
      ? { agency: mergeNpcAgency(existing?.agency, patch.agency, patch.id) }
      : existing?.agency ? { agency: existing.agency } : {}),
  });
}

function mergeMerchantPatch(existing: EngineMerchant | undefined, patch: EngineMerchantPatch): EngineMerchant {
  return normalizeMerchant({
    id: patch.id,
    name: patch.name ?? existing?.name ?? "",
    description: patch.description ?? existing?.description ?? "",
    disposition: patch.disposition ?? existing?.disposition ?? "neutral",
    stolenGoodsPolicy: patch.stolenGoodsPolicy ?? existing?.stolenGoodsPolicy ?? "refuse-known",
    acquiredItems: existing?.acquiredItems ?? [],
    items: patch.items === undefined ? (existing?.items ?? []) : patch.items.map((listing) => ({
      item: normalizeInventoryItem(listing.item),
      stock: listing.stock,
      buyPriceCopper: listing.buyPriceCopper,
      sellPriceCopper: listing.sellPriceCopper,
    })),
  });
}

function appendWorldContextChange(
  stateChanges: WorldContextStateChange[],
  path: string,
  before: unknown,
  after: unknown
): void {
  if (!sameWorldContextValue(before, after)) stateChanges.push({ path, before, after });
}

function sameWorldContextValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function resolvePlayerNoteAdd(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "player_note_add" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const note = {
    id: randomUUID(),
    text: command.text,
    source: command.source,
    createdAt: new Date().toISOString(),
  };
  const next = cloneCampaign(state);
  next.playerNotes = [...state.playerNotes, note].slice(-100);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    command.source === "player" ? "Player note saved." : "The DM records a durable player note.",
    { note, playerNotes: next.playerNotes },
    "note_added",
    [],
    [],
    [{ path: "/playerNotes", before: state.playerNotes, after: next.playerNotes }]
  );
}

function resolveCharacterUpdate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "character_update" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (!state.character.created) return rejection(state, tool, "character_required", "Create your character before editing the sheet.");
  if (!command.name && !command.background && !command.alignment && !command.description && !command.abilityScores && !command.details) {
    return rejection(state, tool, "no_character_changes", "Provide at least one character field to change.");
  }
  if (
    (state.character.backgroundRef && command.background)
    || (state.character.alignmentRef && command.alignment)
    || (state.character.classRef && command.abilityScores)
  ) {
    return rejection(
      state,
      tool,
      "source_field_locked",
      "Source-backed background, alignment, and ability scores cannot be overwritten after character creation."
    );
  }
  const next = cloneCampaign(state);
  const before = cloneCampaign(state).character;
  if (command.name) next.character.name = command.name;
  if (command.background) next.character.background = command.background;
  if (command.alignment) next.character.alignment = command.alignment;
  if (command.description) next.character.description = command.description;
  if (command.details) next.character.details = { ...next.character.details, ...command.details };
  if (command.abilityScores) next.character.abilities = { ...next.character.abilities, ...command.abilityScores };
  next.character = hydrateCharacter(next.character);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Character sheet updated.",
    { character: characterData(next.character) },
    "character_updated",
    [],
    [],
    [{ path: "/character", before, after: next.character }]
  );
}

function socialStateChanges(before: EngineSocialState, after: EngineSocialState): Array<{ path: string; before: unknown; after: unknown }> {
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const collections: Array<[keyof EngineSocialState, string]> = [
    ["relationships", "relationships"],
    ["factions", "factions"],
    ["reputations", "reputations"],
    ["heat", "heat"],
    ["obligations", "obligations"],
    ["crimes", "crimes"],
    ["rumors", "rumors"],
  ];
  for (const [key, pathKey] of collections) {
    const beforeValues = before[key] as Array<{ id: string }>;
    const afterValues = after[key] as Array<{ id: string }>;
    const ids = new Set([...beforeValues, ...afterValues].map((value) => value.id));
    for (const id of ids) {
      const previous = beforeValues.find((value) => value.id === id) ?? null;
      const current = afterValues.find((value) => value.id === id) ?? null;
      if (JSON.stringify(previous) !== JSON.stringify(current)) {
        changes.push({ path: `/social/${pathKey}/${escapeJsonPointerSegment(id)}`, before: previous, after: current });
      }
    }
  }
  return changes;
}

function socialGuardId(state: LanternCampaignState): string | null {
  return state.worldContext?.npcs.find((npc) => npc.id.toLocaleLowerCase().includes("guard") || npc.name.toLocaleLowerCase().includes("guard") || npc.name.toLocaleLowerCase().includes("watch"))?.id ?? null;
}

function scheduleSocialRumor(
  next: LanternCampaignState,
  rumor: EngineSocialRumor,
  sourceCommandId: string,
  sourceVersion: number,
): void {
  const social = ensureSocialState(next);
  social.rumors.push(rumor);
  next.time.scheduledEvents.push({
    id: `social-propagation:${rumor.id}`,
    kind: "social-propagation",
    dueAtMinutes: rumor.propagateAtMinutes,
    status: "pending",
    sourceRef: rumor.id,
    targetRef: rumor.targetId,
    provenance: { sourceCommandId, sourceVersion },
  });
}

function resolveSocialAction(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineSocialActionCommand,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const beforeSocial = normalizeSocialState(state.social);
  const now = new Date().toISOString();
  const next = cloneCampaign(state);
  const social = ensureSocialState(next);
  const target = command.targetId && state.worldContext
    ? state.worldContext.npcs.find((npc) => npc.id === command.targetId)
      ?? state.worldContext.merchants.find((merchant) => merchant.id === command.targetId)
    : null;

  if (command.action === "promise") {
    if (!command.targetId || !socialTargetExists(state, command.targetId) || command.targetId === context.actorId) {
      return rejection(state, tool, "social_target_not_found", "A promise needs one established NPC or merchant counterparty.");
    }
    if (!command.terms) return rejection(state, tool, "promise_terms_required", "A promise needs concrete terms.");
    const obligation: EngineSocialObligation = {
      id: `promise:${clientCommandId}`,
      kind: "promise",
      actorId: context.actorId,
      counterpartyId: command.targetId,
      terms: command.terms,
      status: "open",
      deadlineAtMinutes: state.time.gameTime.totalMinutes + (command.deadlineMinutes ?? 24 * 60),
      consequenceApplied: false,
      createdAt: now,
      resolvedAt: null,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, occurredAt: now },
    };
    social.obligations.push(obligation);
    adjustSocialRelationship(next, context.actorId, command.targetId, 5, clientCommandId, state.version);
    const afterSocial = ensureSocialState(next);
    const targetNpc = target && "relationshipScore" in target ? target.id : null;
    const changes = [
      ...socialStateChanges(beforeSocial, afterSocial),
      ...(targetNpc ? [{ path: `/worldContext/npcs/${escapeJsonPointerSegment(targetNpc)}/relationshipScore`, before: state.worldContext?.npcs.find((npc) => npc.id === targetNpc)?.relationshipScore ?? 0, after: next.worldContext?.npcs.find((npc) => npc.id === targetNpc)?.relationshipScore ?? 0 }] : []),
    ];
    return commit(next, context, clientCommandId, command, tool, `You make a promise to ${target && "name" in target ? target.name : command.targetId}; trust rises by a bounded amount.`, { social: projectSocialForActor(context.actorId, next), obligation }, "promise_created", [], [], changes);
  }

  if (command.action === "fulfill_promise" || command.action === "breach_promise") {
    if (!command.promiseId) return rejection(state, tool, "promise_id_required", "Resolve an existing promise by id.");
    const obligation = social.obligations.find((candidate) => candidate.id === command.promiseId);
    if (!obligation) return rejection(state, tool, "promise_not_found", "That promise is not established.");
    if (obligation.status !== "open" || obligation.actorId !== context.actorId) return rejection(state, tool, "promise_already_resolved", "That promise is already resolved or belongs to another actor.");
    if (command.witnessId && !socialTargetExists(state, command.witnessId)) return rejection(state, tool, "witness_not_found", "The claimed witness is not established in the current context.");
    obligation.status = command.action === "fulfill_promise" ? "fulfilled" : "breached";
    obligation.resolvedAt = now;
    obligation.consequenceApplied = true;
    const delta = obligation.status === "fulfilled" ? 8 : -20;
    adjustSocialRelationship(next, context.actorId, obligation.counterpartyId, delta, clientCommandId, state.version);
    if (obligation.status === "fulfilled" || command.witnessId) {
      adjustSocialReputation(next, context.actorId, SOCIAL_COMMUNITY_ID, obligation.status === "fulfilled" ? 5 : -15, clientCommandId, state.version);
    }
    if (obligation.status === "breached") {
      const evidenceId = `evidence:${clientCommandId}`;
      const crime: EngineSocialCrimeEvidence = {
        id: `crime:${clientCommandId}`,
        kind: "promise-breach",
        actorId: context.actorId,
        victimId: obligation.counterpartyId,
        itemId: null,
        status: command.witnessId ? "proven" : "allegation",
        witnessIds: command.witnessId ? [command.witnessId] : [],
        evidenceIds: [evidenceId],
        createdAt: now,
        provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, occurredAt: now },
      };
      social.crimes.push(crime);
      const guardId = command.witnessId ? socialGuardId(state) : null;
      if (guardId) {
        const rumor: EngineSocialRumor = {
          id: `rumor:${clientCommandId}`,
          sourceRef: crime.id,
          sourceActorId: context.actorId,
          targetId: guardId,
          text: `Witnessed promise breach by ${context.actorId}.`,
          confidence: 1,
          truthRelation: "true",
          status: "pending",
          createdAt: now,
          propagateAtMinutes: state.time.gameTime.totalMinutes + SOCIAL_RUMOR_DELAY_MINUTES,
          propagatedAtMinutes: null,
          provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, occurredAt: now },
        };
        scheduleSocialRumor(next, rumor, clientCommandId, state.version);
      }
    }
    const afterSocial = ensureSocialState(next);
    return commit(next, context, clientCommandId, command, tool, obligation.status === "fulfilled" ? "The promise is fulfilled; trust and reputation improve." : "The promise is breached; evidence and bounded social consequences are recorded.", { social: projectSocialForActor(context.actorId, next), obligation, crime: afterSocial.crimes.at(-1) ?? null }, obligation.status === "fulfilled" ? "promise_fulfilled" : "promise_breached", [], [], [
      ...socialStateChanges(beforeSocial, afterSocial),
      ...(JSON.stringify(state.time.scheduledEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: state.time.scheduledEvents, after: next.time.scheduledEvents }] : []),
    ]);
  }

  if (command.action === "theft") {
    if (!command.targetId || !socialTargetExists(state, command.targetId) || command.targetId === context.actorId) return rejection(state, tool, "victim_not_found", "A theft record needs an established victim.");
    if (!command.itemId) return rejection(state, tool, "item_id_required", "A theft record needs an item identifier.");
    if (command.witnessId && !socialTargetExists(state, command.witnessId)) return rejection(state, tool, "witness_not_found", "The claimed witness is not established in the current context.");
    const sourceMerchant = state.worldContext?.merchants.find((merchant) => merchant.id === command.targetId);
    const sourceListing = sourceMerchant?.items.find((listing) => listing.item.id === command.itemId);
    const sourceNpc = state.worldContext?.npcs.find((npc) => npc.id === command.targetId);
    const sourceNpcItem = sourceNpc?.agency?.resources.inventory.find((item) => item.id === command.itemId);
    if (sourceListing && sourceListing.stock !== 1) return rejection(state, tool, "theft_item_not_unique", "The first stolen-property slice requires one finite marked merchant item.");
    if (sourceNpcItem && sourceNpcItem.quantity !== 1) return rejection(state, tool, "theft_item_not_unique", "The first stolen-property slice requires one marked NPC item instance.");
    const markedItem = sourceListing?.item ?? sourceNpcItem ?? null;
    if (markedItem && state.character.inventory.some((item) => item.id === markedItem.id)) {
      return rejection(state, tool, "item_instance_conflict", "That item instance already exists in your inventory.");
    }
    const evidenceIds = [`evidence:${clientCommandId}`];
    const crime: EngineSocialCrimeEvidence = {
      id: `crime:${clientCommandId}`,
      kind: "theft",
      actorId: context.actorId,
      victimId: command.targetId,
      itemId: command.itemId,
      status: command.witnessId ? "proven" : "allegation",
      witnessIds: command.witnessId ? [command.witnessId] : [],
      evidenceIds,
      createdAt: now,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, occurredAt: now },
    };
    social.crimes.push(crime);
    let stolenItem: EngineInventoryItem | null = null;
    const sourceStateChanges: Array<{ path: string; before: unknown; after: unknown }> = [];
    if (markedItem) {
      const sourceOwnerRef = sourceListing
        ? { kind: "merchant" as const, id: command.targetId }
        : { kind: "actor" as const, id: command.targetId };
      const theftRecord: EngineItemTheftProvenance = {
        theftEventId: crime.id,
        sourceCommandId: clientCommandId,
        sourceOwnerRef,
        locationRef: state.worldContext?.id ?? null,
        gameTimeMinutes: state.time.gameTime.totalMinutes,
        campaignRevision: state.version,
        occurredAt: now,
        witnessIds: command.witnessId ? [command.witnessId] : [],
        evidenceIds,
      };
      const normalized = normalizeInventoryItem(markedItem);
      stolenItem = {
        ...normalized,
        quantity: 1,
        ownerRef: { kind: "actor", id: next.character.id },
        containerRef: undefined,
        equipped: false,
        slot: undefined,
        theftProvenance: [...(normalized.theftProvenance ?? []), theftRecord],
      };
      next.character.inventory.push(stolenItem);
      const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
      if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
      if (sourceListing) {
        const nextSourceMerchant = next.worldContext?.merchants.find((merchant) => merchant.id === command.targetId);
        const nextSourceListing = nextSourceMerchant?.items.find((listing) => listing.item.id === command.itemId);
        if (!nextSourceListing) return rejection(state, tool, "theft_item_unavailable", "That marked item changed before the theft could commit.");
        if (nextSourceListing.stock >= 0) nextSourceListing.stock -= 1;
        sourceStateChanges.push({
          path: `/worldContext/merchants/${escapeJsonPointerSegment(command.targetId)}/items/${escapeJsonPointerSegment(command.itemId)}`,
          before: sourceListing,
          after: nextSourceListing,
        });
      } else if (sourceNpcItem) {
        const nextSourceNpc = next.worldContext?.npcs.find((npc) => npc.id === command.targetId);
        const nextSourceItem = nextSourceNpc?.agency?.resources.inventory.find((item) => item.id === command.itemId);
        if (!nextSourceNpc?.agency || !nextSourceItem) return rejection(state, tool, "theft_item_unavailable", "That marked item changed before the theft could commit.");
        nextSourceItem.quantity -= 1;
        if (nextSourceItem.quantity <= 0) {
          nextSourceNpc.agency.resources.inventory = nextSourceNpc.agency.resources.inventory.filter((item) => item.id !== command.itemId);
        }
        sourceStateChanges.push({
          path: `/worldContext/npcs/${escapeJsonPointerSegment(command.targetId)}/agency/resources/inventory/${escapeJsonPointerSegment(command.itemId)}`,
          before: sourceNpcItem,
          after: nextSourceNpc.agency.resources.inventory.find((item) => item.id === command.itemId) ?? null,
        });
      }
      sourceStateChanges.push({ path: "/character/inventory", before: state.character.inventory, after: next.character.inventory });
    }
    adjustSocialRelationship(next, context.actorId, command.targetId, command.witnessId ? -25 : -10, clientCommandId, state.version);
    if (command.witnessId) {
      adjustSocialReputation(next, context.actorId, SOCIAL_COMMUNITY_ID, -20, clientCommandId, state.version);
      adjustSocialHeat(next, context.actorId, SOCIAL_COMMUNITY_ID, WITNESSED_THEFT_HEAT, clientCommandId, state.version);
    }
    const guardId = command.witnessId ? socialGuardId(state) : null;
    if (guardId) {
      scheduleSocialRumor(next, {
        id: `rumor:${clientCommandId}`,
        sourceRef: crime.id,
        sourceActorId: context.actorId,
        targetId: guardId,
        text: `Witnessed theft of ${command.itemId} by ${context.actorId}.`,
        confidence: 1,
        truthRelation: "true",
        status: "pending",
        createdAt: now,
        propagateAtMinutes: state.time.gameTime.totalMinutes + SOCIAL_RUMOR_DELAY_MINUTES,
        propagatedAtMinutes: null,
        provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, occurredAt: now },
      }, clientCommandId, state.version);
    }
    const afterSocial = ensureSocialState(next);
    return commit(next, context, clientCommandId, command, tool, command.witnessId ? "Witnessed theft evidence, bounded local heat, and durable item provenance are recorded." : "The alleged theft is recorded privately; any marked item keeps durable provenance without becoming proven reputation.", { social: projectSocialForActor(context.actorId, next), crime, stolenItem }, command.witnessId ? "theft_proven" : "theft_alleged", [], [], [
      ...socialStateChanges(beforeSocial, afterSocial),
      ...(JSON.stringify(state.time.scheduledEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: state.time.scheduledEvents, after: next.time.scheduledEvents }] : []),
      ...sourceStateChanges,
    ]);
  }

  if (command.action === "rumor") {
    if (!context.capabilities.includes("dm")) return rejection(state, tool, "dm_required", "Only the DM may introduce an authoritative rumor source.");
    if (!command.targetId || !socialTargetExists(state, command.targetId)) return rejection(state, tool, "rumor_target_not_found", "A rumor needs an established recipient.");
    if (!command.rumorText || !command.truthRelation) return rejection(state, tool, "rumor_fields_required", "A rumor needs text and an explicit source truth relation.");
    const rumor: EngineSocialRumor = {
      id: `rumor:${clientCommandId}`,
      sourceRef: `source:${clientCommandId}`,
      sourceActorId: context.actorId,
      targetId: command.targetId,
      text: command.rumorText,
      confidence: 0.5,
      truthRelation: command.truthRelation,
      status: "pending",
      createdAt: now,
      propagateAtMinutes: state.time.gameTime.totalMinutes + SOCIAL_RUMOR_DELAY_MINUTES,
      propagatedAtMinutes: null,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, occurredAt: now },
    };
    scheduleSocialRumor(next, rumor, clientCommandId, state.version);
    const afterSocial = ensureSocialState(next);
    return commit(next, context, clientCommandId, command, tool, "The rumor is recorded as pending; repetition cannot change its truth relation.", { recorded: true, social: projectSocialForActor(context.actorId, next) }, "rumor_recorded", [], [], [
      ...socialStateChanges(beforeSocial, afterSocial),
      { path: "/time/scheduledEvents", before: state.time.scheduledEvents, after: next.time.scheduledEvents },
    ]);
  }

  return rejection(state, tool, "social_action_invalid", "That social action is not supported by the reviewed first slice.");
}

function npcScheduleEntryAt(npc: EngineNpc, totalMinutes: number): EngineNpcScheduleEntry | null {
  const agency = npc.agency;
  if (!agency) return null;
  const minuteOfDay = ((Math.trunc(totalMinutes) % ONE_DAY_MINUTES) + ONE_DAY_MINUTES) % ONE_DAY_MINUTES;
  return agency.schedule.find((entry) => entry.startMinute <= entry.endMinute
    ? minuteOfDay >= entry.startMinute && minuteOfDay <= entry.endMinute
    : minuteOfDay >= entry.startMinute || minuteOfDay <= entry.endMinute) ?? null;
}

function npcLocationReachable(state: LanternCampaignState, locationRef: string): boolean {
  return locationRef === state.worldContext?.id
    || Boolean(state.worldContext?.exits.some((exit) => exit.id === locationRef));
}

function npcLegalOffers(
  state: LanternCampaignState,
  npc: EngineNpc,
): EngineNpcActionOffer[] {
  const agency = npc.agency;
  if (!agency || agency.lifecycleState !== "conscious" || agency.hp <= 0) return [];
  if (npc.custody) {
    return [{
      id: "no_op",
      label: "Remain under guard custody.",
      legal: true,
      prerequisites: [`custody:${npc.custody.groupId}`],
      costs: { actionPoints: 0, copper: 0, itemIds: [] },
    }];
  }
  const offers: EngineNpcActionOffer[] = [];
  const scheduled = npcScheduleEntryAt(npc, state.time.gameTime.totalMinutes);
  if (scheduled && scheduled.locationRef !== agency.locationRef && npcLocationReachable(state, scheduled.locationRef)) {
    offers.push({
      id: "move_to_schedule",
      label: `Move to scheduled location ${scheduled.locationRef}.`,
      legal: true,
      prerequisites: [`schedule:${scheduled.id}`, `route:${agency.locationRef}->${scheduled.locationRef}`],
      costs: { actionPoints: 1, copper: 0, itemIds: [] },
    });
  }
  const social = normalizeSocialState(state.social);
  const reportableCrime = social.crimes.find((crime) =>
    crime.status === "proven"
    && crime.witnessIds.includes(npc.id)
    && !agency.reportedCrimeIds.includes(crime.id)
  );
  if (reportableCrime) {
    offers.push({
      id: "report_crime",
      label: `Report witnessed crime ${reportableCrime.id}.`,
      legal: true,
      prerequisites: [`witness:${reportableCrime.id}`, "social:report-crime"],
      costs: { actionPoints: 1, copper: 0, itemIds: [] },
    });
  }
  if (agency.hp < agency.maxHp && agency.resources.actionPoints > 0) {
    offers.push({
      id: "rest",
      label: "Rest and recover one bounded hit point.",
      legal: true,
      prerequisites: ["lifecycle:conscious", "resource:action-point"],
      costs: { actionPoints: 1, copper: 0, itemIds: [] },
    });
  }
  const tradeItem = agency.resources.inventory.find((item) => item.quantity > 0);
  if (agency.actorType === "merchant" && tradeItem && agency.resources.actionPoints > 0) {
    offers.push({
      id: "trade_resource",
      label: `Trade one ${materializeInventoryItem(tradeItem).name} for its reviewed value.`,
      legal: true,
      prerequisites: ["actor:merchant", "resource:inventory-item", "resource:action-point"],
      costs: { actionPoints: 1, copper: 0, itemIds: [tradeItem.id] },
    });
  }
  offers.push({
    id: "no_op",
    label: "Take no major action.",
    legal: true,
    prerequisites: ["policy:bounded-no-op"],
    costs: { actionPoints: 0, copper: 0, itemIds: [] },
  });
  return offers;
}

export interface NpcAgencyChoicePreparation {
  npcId: string;
  npcName: string;
  trigger: EngineNpcTickCommand["trigger"];
  triggerId: string;
  offers: EngineNpcActionOffer[];
  fallbackOfferId: EngineNpcAgencyAction;
  promptContext: {
    actorId: string;
    actorType: EngineNpcAgencyState["actorType"];
    locationRef: string;
    schedule: EngineNpcScheduleEntry[];
    goals: EngineNpcGoal[];
    resources: { actionPoints: number; copper: number; itemIds: string[] };
    health: { hp: number; maxHp: number; lifecycleState: EngineNpcAgencyState["lifecycleState"] };
    facts: EngineWorldFact[];
    knowledge: EngineKnowledgeRecord[];
    social: EngineSocialProjection;
  };
}

export type NpcAgencyChoicePreparationResult =
  | { ok: true; value: NpcAgencyChoicePreparation }
  | { ok: false; code: string; message: string };

/**
 * Derive the complete actor-safe, finite provider request without mutating
 * campaign state. The commit path calls the same function again, so a model
 * response can never make a stale or newly-illegal offer authoritative.
 */
export function prepareNpcAgencyChoice(
  state: LanternCampaignState,
  command: EngineNpcTickCommand,
): NpcAgencyChoicePreparationResult {
  const candidates = state.worldContext?.npcs ?? [];
  const npc = command.npcId
    ? candidates.find((candidate) => candidate.id === command.npcId)
    : candidates.find((candidate) => Boolean(candidate.agency));
  if (!npc) {
    return {
      ok: false,
      code: command.npcId ? "npc_not_found" : "npc_agency_unavailable",
      message: "The requested NPC does not have a persisted agency state.",
    };
  }
  const agency = npc.agency;
  if (!agency) return { ok: false, code: "npc_agency_unavailable", message: "NPC agency must be explicitly configured before a tick can run." };
  if (npc.custody) return { ok: false, code: "custody_restricted", message: "That actor is under guard custody and cannot take an autonomous action." };
  if (agency.completedTriggerIds.includes(command.triggerId)) {
    return { ok: false, code: "npc_trigger_replayed", message: "That authoritative NPC trigger has already been processed." };
  }
  const currentDay = Math.floor(state.time.gameTime.totalMinutes / ONE_DAY_MINUTES);
  if (agency.circuitState === "open") {
    return { ok: false, code: "npc_circuit_open", message: "NPC agency is open-circuited for this session; deterministic fallback is not retried." };
  }
  if ((agency.invocationDay === currentDay ? agency.invocationsToday : 0) >= NPC_AGENCY_CONFIG.maxInvocationsPerDay) {
    return { ok: false, code: "npc_invocation_budget_exhausted", message: "The NPC invocation budget for this campaign day is exhausted." };
  }
  if (agency.lifecycleState !== "conscious" || agency.hp <= 0) {
    return { ok: false, code: "npc_incapacitated", message: "A dead or incapacitated NPC cannot take an agency action." };
  }

  const offers = npcLegalOffers(state, npc);
  const fallbackOfferId = command.offerId ?? offers[0]?.id ?? "no_op";
  const promptProjection = actorKnowledgeProjection(npc.id, state);
  const promptSocial = {
    ...promptProjection.social,
    rumors: promptProjection.social.rumors.filter((rumor) => rumor.targetId === npc.id),
  };
  const promptKnowledge = promptProjection.knowledge.filter((record) =>
    !record.stale && record.tier !== "withheld" && record.tier !== "stale"
  );
  return {
    ok: true,
    value: {
      npcId: npc.id,
      npcName: npc.name,
      trigger: command.trigger,
      triggerId: command.triggerId,
      offers,
      fallbackOfferId,
      promptContext: {
        actorId: npc.id,
        actorType: agency.actorType,
        locationRef: agency.locationRef,
        schedule: agency.schedule,
        goals: agency.goals,
        resources: {
          actionPoints: agency.resources.actionPoints,
          copper: agency.resources.copper,
          itemIds: agency.resources.inventory.filter((item) => item.quantity > 0).map((item) => item.id),
        },
        health: { hp: agency.hp, maxHp: agency.maxHp, lifecycleState: agency.lifecycleState },
        facts: promptProjection.facts,
        knowledge: promptKnowledge,
        social: promptSocial,
      },
    },
  };
}

function resolveNpcTick(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineNpcTickCommand,
  tool: EngineToolName | "declare" | "listen",
  providerSelection?: EngineNpcProviderSelection,
): EngineResolution {
  const preparation = prepareNpcAgencyChoice(state, command);
  if (!preparation.ok) return rejection(state, tool, preparation.code, preparation.message);
  const prepared = preparation.value;
  const npc = state.worldContext!.npcs.find((candidate) => candidate.id === prepared.npcId)!;
  const agency = npc.agency!;
  const currentDay = Math.floor(state.time.gameTime.totalMinutes / ONE_DAY_MINUTES);
  const offers = prepared.offers;
  const providerSelectionBound = command.provider === "openrouter"
    && providerSelection?.triggerId === command.triggerId
    && providerSelection.npcId === npc.id
    ? providerSelection
    : null;
  const providerSelectedOffer = providerSelectionBound?.selectedOfferId
    ? offers.find((offer) => offer.id === providerSelectionBound.selectedOfferId) ?? null
    : null;
  const providerSucceeded = providerSelectionBound?.status === "success" && Boolean(providerSelectedOffer);
  const selectedOfferId = providerSucceeded
    ? providerSelectedOffer!.id
    : providerSelectionBound
      ? offers[0]?.id ?? "no_op"
      : prepared.fallbackOfferId;
  const selected = offers.find((offer) => offer.id === selectedOfferId);
  if (!selected) return rejection(state, tool, "npc_offer_illegal", "The selected NPC offer is not legal in the current authoritative state.");
  const provider = command.provider ?? "deterministic";
  const now = new Date().toISOString();
  const beforeAgency = JSON.parse(JSON.stringify(agency)) as EngineNpcAgencyState;
  const beforeSocial = normalizeSocialState(state.social);
  const next = cloneCampaign(state);
  const nextNpc = next.worldContext?.npcs.find((candidate) => candidate.id === npc.id);
  if (!nextNpc?.agency) return rejection(state, tool, "npc_agency_unavailable", "The NPC agency state disappeared before the tick could commit.");
  const nextAgency = nextNpc.agency;
  if (nextAgency.invocationDay !== currentDay) {
    nextAgency.invocationDay = currentDay;
    nextAgency.invocationsToday = 0;
  }
  const selectedCrime = selectedOfferId === "report_crime"
    ? ensureSocialState(next).crimes.find((crime) => crime.status === "proven" && crime.witnessIds.includes(npc.id) && !nextAgency.reportedCrimeIds.includes(crime.id))
    : null;
  if (selectedOfferId === "move_to_schedule") {
    const scheduled = npcScheduleEntryAt(nextNpc, next.time.gameTime.totalMinutes);
    if (!scheduled || scheduled.locationRef === nextAgency.locationRef || !npcLocationReachable(next, scheduled.locationRef)) {
      return rejection(state, tool, "npc_route_invalid", "The NPC cannot reach the selected scheduled location from its current authoritative location.");
    }
    nextAgency.locationRef = scheduled.locationRef;
    nextAgency.resources.actionPoints = Math.max(0, nextAgency.resources.actionPoints - 1);
  } else if (selectedOfferId === "report_crime") {
    if (!selectedCrime) return rejection(state, tool, "npc_report_unavailable", "No witnessed proven crime is available for this NPC to report.");
    nextAgency.reportedCrimeIds = [...nextAgency.reportedCrimeIds, selectedCrime.id].slice(-100);
    nextNpc.memories = [...nextNpc.memories, `Reported ${selectedCrime.id} at ${next.time.gameTime.totalMinutes} minutes.`].slice(-20);
    nextAgency.resources.actionPoints = Math.max(0, nextAgency.resources.actionPoints - 1);
  } else if (selectedOfferId === "rest") {
    if (nextAgency.resources.actionPoints <= 0 || nextAgency.hp >= nextAgency.maxHp) return rejection(state, tool, "npc_resource_unavailable", "The NPC lacks the action-point resource or does not need rest.");
    nextAgency.resources.actionPoints -= 1;
    nextAgency.hp = Math.min(nextAgency.maxHp, nextAgency.hp + 1);
  } else if (selectedOfferId === "trade_resource") {
    const item = nextAgency.resources.inventory.find((candidate) => candidate.quantity > 0);
    if (nextAgency.resources.actionPoints <= 0 || !item) return rejection(state, tool, "npc_resource_unavailable", "The NPC cannot trade without an action point and an owned item.");
    const itemValue = Math.max(0, materializeInventoryItem(item).valueCopper ?? 0);
    item.quantity -= 1;
    if (item.quantity <= 0) nextAgency.resources.inventory = nextAgency.resources.inventory.filter((candidate) => candidate.id !== item.id);
    nextAgency.resources.copper = Math.min(100_000_000, nextAgency.resources.copper + itemValue);
    nextAgency.resources.actionPoints -= 1;
  }
  const fallback = provider === "openrouter" ? !providerSucceeded : command.offerId === undefined;
  const invocation: EngineNpcInvocation = {
    id: `npc-invocation:${clientCommandId}`,
    triggerId: command.triggerId,
    trigger: command.trigger,
    npcId: npc.id,
    provider,
    model: providerSelectionBound?.model ?? (provider === "openrouter" ? "guarded-unavailable" : "npc-policy-v1"),
    providerRequestId: providerSelectionBound?.providerRequestId ?? null,
    status: providerSelectionBound?.status ?? (provider === "openrouter" ? "provider_error" : "success"),
    inputTokens: providerSelectionBound?.inputTokens ?? 0,
    cacheTokens: providerSelectionBound?.cacheTokens ?? 0,
    reasoningTokens: providerSelectionBound?.reasoningTokens ?? 0,
    outputTokens: providerSelectionBound?.outputTokens ?? 0,
    costUsd: providerSelectionBound?.costUsd ?? 0,
    latencyMs: providerSelectionBound?.latencyMs ?? 0,
    outcome: fallback ? "fallback" : "selected",
    fallback,
    selectedOfferId,
    rationale: providerSucceeded ? providerSelectionBound?.rationale ?? null : null,
    budget: { ...NPC_AGENCY_CONFIG },
    createdAt: now,
  };
  const pendingAction: EngineNpcPendingAction = {
    triggerId: command.triggerId,
    trigger: command.trigger,
    offers,
    selectedOfferId,
    createdAt: now,
  };
  nextAgency.pendingAction = pendingAction;
  nextAgency.completedTriggerIds = [...nextAgency.completedTriggerIds, command.triggerId].slice(-100);
  nextAgency.invocations = [...nextAgency.invocations, invocation].slice(-100);
  nextAgency.invocationsToday += 1;
  nextAgency.consecutiveFailures = provider === "openrouter" && fallback
    ? Math.min(NPC_AGENCY_CONFIG.maxConsecutiveFailures, nextAgency.consecutiveFailures + 1)
    : 0;
  nextAgency.circuitState = nextAgency.consecutiveFailures >= NPC_AGENCY_CONFIG.maxConsecutiveFailures ? "open" : "closed";
  const afterSocial = ensureSocialState(next);
  const stateChanges = [
    { path: `/worldContext/npcs/${escapeJsonPointerSegment(npc.id)}/agency`, before: beforeAgency, after: nextAgency },
    ...(JSON.stringify(npc.memories) !== JSON.stringify(nextNpc.memories)
      ? [{ path: `/worldContext/npcs/${escapeJsonPointerSegment(npc.id)}/memories`, before: npc.memories, after: nextNpc.memories }]
      : []),
    ...socialStateChanges(beforeSocial, afterSocial),
  ];
  const actionMessage = selectedOfferId === "move_to_schedule"
    ? `${npc.name} moves according to the reviewed schedule.`
    : selectedOfferId === "report_crime"
      ? `${npc.name} reports witnessed crime ${selectedCrime?.id ?? ""}.`
      : selectedOfferId === "rest"
        ? `${npc.name} takes a bounded rest and recovers one hit point.`
        : selectedOfferId === "trade_resource"
          ? `${npc.name} completes one bounded resource trade.`
          : `${npc.name} takes no major off-screen action.`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    actionMessage,
    {
      npcId: npc.id,
      trigger: command.trigger,
      triggerId: command.triggerId,
      offers,
      selectedOfferId,
      promptContext: prepared.promptContext,
      invocation,
      action: selectedOfferId,
    },
    "npc_action_committed",
    [],
    [],
    stateChanges,
  );
}

function applyNpcTimeBoundary(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
): { stateChanges: Array<{ path: string; before: unknown; after: unknown }>; data: unknown } | null {
  const boundaryCommand: EngineNpcTickCommand = {
    kind: "npc_tick",
    trigger: "time_advance",
    triggerId: `time:${clientCommandId}`,
  };
  const resolution = resolveNpcTick(state, context, clientCommandId, boundaryCommand, "npc_tick");
  if (!resolution.accepted || !resolution.event) return null;
  state.worldContext = resolution.state.worldContext;
  state.social = resolution.state.social;
  return { stateChanges: resolution.event.stateChanges, data: resolution.data };
}

function resolveSocialCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "social_check" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const npc = state.worldContext?.npcs.find((candidate) => candidate.id === command.npcId);
  if (!npc) return rejection(state, tool, "npc_not_found", "That NPC is not established in the current context.");
  const actingNpc = command.actingNpcId
    ? state.worldContext?.npcs.find((candidate) => candidate.id === command.actingNpcId)
    : null;
  if (command.actingNpcId && !actingNpc) {
    return rejection(state, tool, "acting_npc_not_found", "The speaking or acting NPC is not established in the current context.");
  }
  if (actingNpc?.id === npc.id) {
    return rejection(state, tool, "acting_npc_is_target", "The speaking or acting NPC must be distinct from the social-check target.");
  }
  const derived = deriveCheck(state, command.ability, command.skill ?? null, null, tool);
  if ("accepted" in derived) return derived;
  const modifierQuery = queryModifiers(state.effects, state.character.id, "ability-check");
  const firstRoll = randomInt(1, 21);
  const secondRoll = modifierQuery.mode === "advantage" || modifierQuery.mode === "disadvantage"
    ? randomInt(1, 21)
    : null;
  const roll = secondRoll === null
    ? firstRoll
    : modifierQuery.mode === "advantage"
      ? Math.max(firstRoll, secondRoll)
      : Math.min(firstRoll, secondRoll);
  const modifier = derived.modifier;
  const total = roll + modifier;
  const success = total >= SOCIAL_CHECK_DC;
  const rollingActorName = state.character.name.trim() || context.actorId;
  const attribution: EngineSocialCheckAttribution = {
    actionOwnerActorId: context.actorId,
    rollingActorId: context.actorId,
    rollingActorName,
    actingActorId: actingNpc?.id ?? context.actorId,
    actingActorName: actingNpc?.name ?? rollingActorName,
    targetId: npc.id,
    targetName: npc.name,
    modifierSourceActorId: context.actorId,
    modifierSourceActorName: rollingActorName,
    mode: actingNpc ? "npc-mediated" : "direct",
  };
  const beforeSocial = normalizeSocialState(state.social);
  const next = cloneCampaign(state);
  const nextNpc = next.worldContext?.npcs.find((candidate) => candidate.id === command.npcId);
  adjustSocialRelationship(next, context.actorId, command.npcId, success ? 5 : -2, clientCommandId, state.version);
  const afterSocial = ensureSocialState(next);
  const message = actingNpc
    ? actingNpc.name + " acts for you toward " + npc.name + "; the check uses " + rollingActorName + "'s modifiers: d20 " + roll + " " + signed(modifier) + " = " + total +
      " against reviewed social challenge DC " + SOCIAL_CHECK_DC + ". " + (success ? "Success." : "Failure.")
    : "You make a social check with " + npc.name + ": d20 " + roll + " " + signed(modifier) + " = " + total +
      " against reviewed social challenge DC " + SOCIAL_CHECK_DC + ". " + (success ? "Success." : "Failure.");
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { npc: nextNpc ?? npc, goal: command.goal, roll, modifier, dc: SOCIAL_CHECK_DC, dcProvenance: "reviewed-challenge:social-check-v1:dc-band-v1", total, success, attribution, social: projectSocialForActor(context.actorId, next) },
    success ? "social_success" : "social_failure",
    [
      { kind: "social_d20", value: roll, sides: 20 },
      ...(secondRoll === null ? [] : [{ kind: `social_${modifierQuery.mode}_d20`, value: secondRoll, sides: 20 }]),
    ],
    [{ name: command.ability + "_modifier", value: modifier }, { name: "social_dc", value: SOCIAL_CHECK_DC }],
    [
      ...socialStateChanges(beforeSocial, afterSocial),
      ...(nextNpc ? [{ path: "/worldContext/npcs/" + escapeJsonPointerSegment(npc.id) + "/relationshipScore", before: npc.relationshipScore, after: nextNpc.relationshipScore }] : []),
    ],
    [],
    undefined,
    {
      kind: "ability-check",
      actorId: context.actorId,
      ability: command.ability,
      skill: derived.skill,
      tool: null,
      proficiency: derived.proficiency,
      expertise: derived.expertise,
      modifier,
      modifierSources: [...derived.modifierSources],
      advantageSources: [...modifierQuery.effectIds],
      disadvantageSources: modifierQuery.disadvantage > 0 ? [...modifierQuery.effectIds] : [],
      mode: modifierQuery.mode,
      attribution,
      informationPolicy: "public",
      formulaRevision: "checks-v1",
    }
  );
}

function latestTheftProvenance(item: EngineInventoryItem): EngineItemTheftProvenance | null {
  return item.theftProvenance?.at(-1) ?? null;
}

function merchantTheftRecognition(
  state: LanternCampaignState,
  merchantId: string,
  provenance: EngineItemTheftProvenance,
): { recognized: boolean; knowledgeSource: "victim" | "witness" | "rumor" | null } {
  if (provenance.sourceOwnerRef.kind === "merchant" && provenance.sourceOwnerRef.id === merchantId) {
    return { recognized: true, knowledgeSource: "victim" };
  }
  if (provenance.witnessIds.includes(merchantId)) return { recognized: true, knowledgeSource: "witness" };
  const social = normalizeSocialState(state.social);
  const crime = social.crimes.find((candidate) =>
    candidate.id === provenance.theftEventId
    || candidate.provenance.sourceCommandId === provenance.sourceCommandId
    || candidate.evidenceIds.some((evidenceId) => provenance.evidenceIds.includes(evidenceId))
  );
  if (crime?.witnessIds.includes(merchantId)) return { recognized: true, knowledgeSource: "witness" };
  const informed = social.rumors.some((rumor) =>
    rumor.targetId === merchantId
    && rumor.status !== "pending"
    && rumor.truthRelation === "true"
    && (rumor.sourceRef === crime?.id || rumor.sourceRef === provenance.theftEventId)
  );
  return informed ? { recognized: true, knowledgeSource: "rumor" } : { recognized: false, knowledgeSource: null };
}

function localLawHeat(state: LanternCampaignState, actorId: string): number {
  return normalizeSocialState(state.social).heat!
    .find((record) => record.actorId === actorId && record.communityId === SOCIAL_COMMUNITY_ID)?.score ?? 0;
}

function resolveMerchantTrade(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "merchant_trade" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const merchant = state.worldContext?.merchants.find((candidate) => candidate.id === command.merchantId);
  if (!merchant) return rejection(state, tool, "merchant_not_found", "That merchant is not established in the current context.");
  const listing = merchant.items.find((candidate) => candidate.item.id === command.itemId);
  if (!listing) return rejection(state, tool, "item_not_for_sale", "That merchant has not established that item for trade.");
  const isBuying = command.side === "buy" || command.side === "offer";
  const heldForSale = isBuying ? null : state.character.inventory.find((candidate) => candidate.id === command.itemId) ?? null;
  if (!isBuying) {
    if (!heldForSale || heldForSale.quantity < command.quantity) return rejection(state, tool, "item_not_owned", "You do not have that quantity to sell.");
    if (!isActorOwnedItem(heldForSale, state.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
    if (heldForSale.equipped) return rejection(state, tool, "item_equipped", "Unequip the item before selling it.");
    const heldView = materializeInventoryItem(heldForSale);
    if (isContainerItem(heldView) && inventoryHasChildren(state.character.inventory, heldForSale.id)) {
      return rejection(state, tool, "container_not_empty", "Empty a container before selling it.");
    }
  }
  const theftProvenance = heldForSale ? latestTheftProvenance(heldForSale) : null;
  if (theftProvenance && heldForSale!.quantity !== command.quantity) {
    return rejection(state, tool, "stolen_property_stack_split_unsupported", "Transfer this stolen-property stack as one preserved instance.");
  }
  const stolenGoodsPolicy = merchant.stolenGoodsPolicy === "fence" ? "fence" : "refuse-known";
  const recognition = theftProvenance
    ? merchantTheftRecognition(state, merchant.id, theftProvenance)
    : { recognized: false, knowledgeSource: null };
  if (theftProvenance && stolenGoodsPolicy === "refuse-known" && recognition.recognized) {
    return rejection(state, tool, "stolen_property_recognized", "The merchant recognizes the stolen property and refuses the sale.", {
      merchantId: merchant.id,
      itemId: command.itemId,
      policyKey: "stolen-recognition-v1",
      knowledgeSource: recognition.knowledgeSource,
    });
  }
  if (theftProvenance && (merchant.acquiredItems ?? []).some((item) => item.id === command.itemId)) {
    return rejection(state, tool, "item_instance_conflict", "That merchant already holds this item instance.");
  }
  if (theftProvenance && (merchant.acquiredItems?.length ?? 0) >= 100) {
    return rejection(state, tool, "merchant_inventory_full", "That merchant cannot accept another preserved item instance.");
  }
  const fenceSale = Boolean(theftProvenance && stolenGoodsPolicy === "fence");
  const unitPrice = command.side === "offer" ? command.offerUnitPriceCopper : isBuying ? listing.buyPriceCopper : listing.sellPriceCopper;
  if (unitPrice === undefined) return rejection(state, tool, "offer_price_required", "An offer needs an explicit unit price.");
  const social = normalizeSocialState(state.social);
  const relationship = social.relationships.find((candidate) =>
    (candidate.actorA === context.actorId && candidate.actorB === merchant.id)
    || (candidate.actorA === merchant.id && candidate.actorB === context.actorId)
  );
  const reputation = social.reputations.find((candidate) => candidate.actorId === context.actorId && candidate.communityId === SOCIAL_COMMUNITY_ID);
  const socialScore = clampSocial((relationship?.trust ?? 0) + Math.trunc((reputation?.score ?? 0) / 2));
  if (socialScore <= -75) return rejection(state, tool, "merchant_access_denied", "The merchant refuses service while your local reputation remains severely negative.");
  const adjustment = Math.max(-10, Math.min(10, Math.trunc(socialScore / 10)));
  const socialPriceMultiplier = isBuying ? 1 - adjustment / 100 : 1 + adjustment / 100;
  const stolenGoodsPriceMultiplier = fenceSale ? FENCE_PRICE_MULTIPLIER : 1;
  const priceMultiplier = socialPriceMultiplier * stolenGoodsPriceMultiplier;
  const finalUnitPrice = Math.max(0, Math.round(unitPrice * priceMultiplier));
  const total = finalUnitPrice * command.quantity;
  if (!Number.isSafeInteger(total)) return rejection(state, tool, "price_out_of_range", "That transaction is too large to resolve safely.");
  if (listing.stock >= 0 && isBuying && listing.stock < command.quantity) {
    return rejection(state, tool, "insufficient_stock", "The merchant does not have that quantity available.");
  }

  const next = cloneCampaign(state);
  const nextMerchant = next.worldContext?.merchants.find((candidate) => candidate.id === command.merchantId);
  const nextListing = nextMerchant?.items.find((candidate) => candidate.item.id === command.itemId);
  if (!nextMerchant || !nextListing) return rejection(state, tool, "merchant_not_found", "That merchant is no longer available.");
  const beforeCharacter = cloneCampaign(state).character;
  const beforeSocial = normalizeSocialState(state.social);
  const beforeAcquiredItems = cloneCampaign(state).worldContext?.merchants.find((candidate) => candidate.id === command.merchantId)?.acquiredItems ?? [];
  nextMerchant.acquiredItems ??= [];
  if (isBuying) {
    if (state.character.currency.copper < total) return rejection(state, tool, "insufficient_funds", "You cannot afford that purchase.");
    if (state.character.inventory.some((candidate) => candidate.id === nextListing.item.id)) {
      return rejection(state, tool, "item_instance_conflict", "That merchant instance already exists in your inventory.");
    }
    const acquiredIndex = nextMerchant.acquiredItems.findIndex((item) => item.id === command.itemId);
    const acquiredItem = acquiredIndex >= 0 ? nextMerchant.acquiredItems[acquiredIndex]! : null;
    if (acquiredItem && acquiredItem.quantity !== command.quantity) {
      return rejection(state, tool, "acquired_item_quantity_mismatch", "Buy that preserved merchant instance as one stack.");
    }
    next.character.currency.copper -= total;
    syncCurrencyProjection(next.character);
    addInventory(next.character.inventory, withActorOwnership(
      { ...normalizeInventoryItem(acquiredItem ?? nextListing.item), quantity: command.quantity, equipped: false },
      next.character.id,
      { kind: "merchant", sourceId: merchant.id },
    ));
    const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
    if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
    if (acquiredIndex >= 0) nextMerchant.acquiredItems.splice(acquiredIndex, 1);
    if (nextListing.stock >= 0) nextListing.stock -= command.quantity;
  } else {
    const held = next.character.inventory.find((candidate) => candidate.id === command.itemId);
    if (!held) return rejection(state, tool, "item_not_owned", "That item changed before the sale could commit.");
    if (theftProvenance) {
      nextMerchant.acquiredItems.push({
        ...normalizeInventoryItem(held),
        quantity: command.quantity,
        ownerRef: { kind: "merchant", id: nextMerchant.id },
        containerRef: undefined,
        equipped: false,
        slot: undefined,
      });
    }
    held.quantity -= command.quantity;
    if (held.quantity <= 0) next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== held.id);
    next.character.currency.copper += total;
    syncCurrencyProjection(next.character);
    if (nextListing.stock >= 0) nextListing.stock += command.quantity;
    if (fenceSale) adjustSocialHeat(next, context.actorId, SOCIAL_COMMUNITY_ID, FENCE_TRADE_HEAT, clientCommandId, state.version);
  }

  const verb = isBuying ? (command.side === "offer" ? "offer accepted" : "purchase complete") : "sale complete";
  const listingView = materializeInventoryItem(listing.item);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The " + verb + ": " + command.quantity + " × " + listingView.name + " for " + formatCurrency(total) + ".",
    {
      merchant: nextMerchant,
      item: listingView,
      side: command.side,
      quantity: command.quantity,
      baseUnitPriceCopper: unitPrice,
      unitPriceCopper: finalUnitPrice,
      totalCopper: total,
      socialScore,
      priceMultiplier,
      socialPriceMultiplier,
      stolenGoodsPriceMultiplier,
      ruleKey: fenceSale ? "merchant-fence-v1" : "merchant-social-v1",
      recognitionPolicyKey: theftProvenance ? "stolen-recognition-v1" : null,
      recognition,
      fenceRiskPolicyKey: fenceSale ? "fence-heat-v1" : null,
      localHeat: localLawHeat(next, context.actorId),
      currency: next.character.currency,
      currencyBreakdown: currencyBreakdown(next.character.currency.copper),
      inventory: materializeInventory(next.character.inventory),
    },
    isBuying ? "merchant_purchase" : "merchant_sale",
    [],
    [],
    [
      { path: "/character", before: beforeCharacter, after: next.character },
      { path: "/worldContext/merchants/" + merchant.id + "/items/" + listing.item.id, before: listing, after: nextListing },
      ...(JSON.stringify(beforeAcquiredItems) !== JSON.stringify(nextMerchant.acquiredItems)
        ? [{ path: "/worldContext/merchants/" + merchant.id + "/acquiredItems", before: beforeAcquiredItems, after: nextMerchant.acquiredItems }]
        : []),
      ...socialStateChanges(beforeSocial, normalizeSocialState(next.social)),
    ]
  );
}

function resolveQuestCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "quest_create" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const graph = command.graph ? normalizeQuestGraph(command.graph) : undefined;
  if (command.graph && !graph) return rejection(state, tool, "invalid_quest_graph", "That quest graph does not match the reviewed typed predicate contract.");
  const deadlineAtMinutes = graph?.deadlineAtMinutes ?? command.deadlineAtMinutes;
  const quest: EngineQuest = {
    id: randomUUID(),
    title: command.title,
    objective: command.objective,
    status: "active",
    reward: { xp: command.rewardXp, copper: command.rewardCopper },
    rewardClaimed: false,
    progress: 0,
    giverNpcId: command.giverNpcId,
    deadline: command.deadline,
    ...(deadlineAtMinutes === undefined ? {} : { deadlineAtMinutes }),
    ...(graph ? { graph: { ...graph, deadlineAtMinutes: deadlineAtMinutes ?? null } } : {}),
  };
  const next = cloneCampaign(state);
  next.quests = [...state.quests, quest].slice(-50);
  next.quest = quest;
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/quests", before: projectQuestsForActor(state, context.actorId), after: projectQuestsForActor(next, context.actorId) },
    { path: "/quest", before: projectQuestForActor(state.quest, state, context.actorId), after: projectQuestForActor(next.quest, next, context.actorId) },
  ];
  if (deadlineAtMinutes !== undefined) {
    const scheduledEvent: EngineScheduledEvent = {
      id: `quest-deadline:${quest.id}`,
      kind: "quest-deadline",
      dueAtMinutes: deadlineAtMinutes,
      status: "pending",
      targetRef: quest.id,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version },
    };
    next.time.scheduledEvents = [...state.time.scheduledEvents, scheduledEvent];
    stateChanges.push({ path: "/time/scheduledEvents", before: state.time.scheduledEvents, after: next.time.scheduledEvents });
  }
  return commit(next, context, clientCommandId, command, tool, "Quest added: " + quest.title + ".", { quest: projectQuestForActor(quest, state, context.actorId), quests: projectQuestsForActor(next, context.actorId) }, "quest_created", [], [], stateChanges);
}

function projectQuestsForActor(state: LanternCampaignState, actorId: string): EngineQuest[] {
  return state.quests.map((quest) => projectQuestForActor(quest, state, actorId));
}

function projectQuestForActor(quest: EngineQuest, state: LanternCampaignState, actorId: string): EngineQuest {
  if (!quest.graph) return quest;
  const projected = JSON.parse(JSON.stringify(quest)) as EngineQuest;
  const knownFactIds = new Set(
    state.actorKnowledge
      .filter((record) => record.actorId === actorId && !record.stale && (record.tier === "known" || record.tier === "perceived"))
      .map((record) => record.factId)
  );
  const visibleObjectiveIds = new Set<string>();
  projected.graph!.objectives = projected.graph!.objectives.flatMap((objective) => {
    const discoveredForActor = objective.discovered
      || (objective.hidden && objective.predicate.kind === "fact_discovered" && knownFactIds.has(objective.predicate.factId));
    if (objective.hidden && !discoveredForActor) {
      return [{
        id: objective.id,
        title: "Hidden objective",
        mode: objective.mode,
        optional: objective.optional,
        hidden: true,
        discovered: false,
        status: "pending" as const,
        predicate: { kind: "player_choice", choiceId: "__hidden__" } as EngineQuestPredicate,
        completedAtMinutes: null,
        evidence: null,
      }];
    }
    visibleObjectiveIds.add(objective.id);
    return [{ ...objective, discovered: discoveredForActor }];
  });
  projected.graph!.transitions = projected.graph!.transitions.filter((transition) => {
    if (transition.requiresObjectiveIds.some((objectiveId) => !visibleObjectiveIds.has(objectiveId))) return false;
    return !transition.predicates.some((predicate) => predicate.kind === "fact_discovered" && !knownFactIds.has(predicate.factId));
  }).map((transition) => ({ ...transition, predicates: [] }));
  return projected;
}

function resolveQuestTransition(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "quest_transition" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const existing = state.quests.find((candidate) => candidate.id === command.questId);
  if (!existing) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  if (!existing.graph) return rejection(state, tool, "quest_graph_unavailable", "That legacy quest has no typed transition graph.");
  if (existing.status !== "active") return rejection(state, tool, "quest_terminal", "A terminal quest cannot transition again.");
  const transition = existing.graph.transitions.find((candidate) => candidate.id === command.transitionId);
  if (!transition) return rejection(state, tool, "quest_transition_not_found", "That transition is not declared by the quest graph.");
  if (transition.choiceId && transition.choiceId !== command.choiceId) return rejection(state, tool, "quest_choice_required", "That branch requires its declared player choice.");
  if (transition.outcome === "expiration" && existing.graph.deadlineAtMinutes !== null && state.time.gameTime.totalMinutes < existing.graph.deadlineAtMinutes) {
    return rejection(state, tool, "quest_deadline_not_reached", "The expiration branch is not available before the committed deadline.");
  }
  const predicateError = validateQuestTransitionPredicates(state, existing, transition, command.choiceId);
  if (predicateError) return rejection(state, tool, predicateError.code, predicateError.message);
  const next = cloneCampaign(state);
  const target = next.quests.find((candidate) => candidate.id === command.questId);
  if (!target?.graph) return rejection(state, tool, "quest_graph_unavailable", "That quest graph is no longer available.");
  const applied = applyQuestTransitionState(next, state, target, transition, context, clientCommandId, command.choiceId);
  if (applied.error) return rejection(state, tool, applied.error.code, applied.error.message);
  next.quest = target;
  const stateChanges = applied.stateChanges;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `Quest branch resolved: ${transition.label}.`,
    {
      quest: projectQuestForActor(target, next, context.actorId),
      transitionId: transition.id,
      outcome: transition.outcome,
      rewardKeys: applied.rewardKeys,
      followUpEligible: target.graph.followUpEligible,
      clock: target.graph.clock,
    },
    `quest_${transition.outcome}`,
    [],
    [],
    stateChanges,
  );
}

type QuestTransitionValidation = { code: string; message: string };

function validateQuestTransitionPredicates(
  state: LanternCampaignState,
  quest: EngineQuest,
  transition: EngineQuestTransition,
  choiceId?: string,
): QuestTransitionValidation | null {
  for (const predicate of transition.predicates) {
    if (!evaluateQuestPredicate(state, predicate, choiceId)) {
      return { code: "quest_predicate_unsatisfied", message: `The committed state does not satisfy branch ${transition.id}.` };
    }
  }
  for (const objectiveId of transition.requiresObjectiveIds) {
    const objective = quest.graph?.objectives.find((candidate) => candidate.id === objectiveId);
    if (!objective || !evaluateQuestObjective(state, quest.graph, objective, choiceId)) {
      return { code: "quest_objective_unsatisfied", message: `Objective ${objectiveId} is not complete from committed state.` };
    }
  }
  return null;
}

function evaluateQuestPredicate(state: LanternCampaignState, predicate: EngineQuestPredicate, choiceId?: string): boolean {
  switch (predicate.kind) {
    case "inventory_owned":
      return state.character.inventory.some((item) => item.id === predicate.itemId && item.quantity >= predicate.quantity);
    case "encounter_outcome":
      return state.combat.lifecycle?.outcomeId === predicate.outcomeId && state.combat.lifecycle.outcome === predicate.outcome;
    case "social_reputation": {
      const actorId = predicate.actorId ?? state.actorId;
      return (state.social?.reputations ?? []).some((reputation) => reputation.actorId === actorId && reputation.communityId === predicate.communityId && reputation.score >= predicate.minScore);
    }
    case "actor_at_location": {
      if (predicate.actorId === state.actorId) return state.worldContext?.id === predicate.locationRef;
      return state.worldContext?.npcs.some((npc) => npc.id === predicate.actorId && npc.agency?.locationRef === predicate.locationRef) ?? false;
    }
    case "fact_discovered":
      return state.actorKnowledge.some((record) => record.actorId === state.actorId && record.factId === predicate.factId && !record.stale && (record.tier === "known" || record.tier === "perceived"));
    case "game_time_before":
      return state.time.gameTime.totalMinutes <= predicate.deadlineAtMinutes;
    case "player_choice":
      return predicate.choiceId === choiceId;
  }
}

function evaluateQuestObjective(
  state: LanternCampaignState,
  graph: EngineQuestGraph | undefined,
  objective: EngineQuestObjective,
  choiceId?: string,
): boolean {
  if (objective.status === "completed") return true;
  if (objective.hidden && !objective.discovered && objective.predicate.kind !== "fact_discovered") return false;
  if (objective.hidden && !objective.discovered && !evaluateQuestPredicate(state, objective.predicate, choiceId)) return false;
  if (objective.mode === "ordered" && graph) {
    const index = graph.objectives.findIndex((candidate) => candidate.id === objective.id);
    const blocked = graph.objectives.slice(0, index).some((candidate) => candidate.mode === "ordered" && !candidate.optional && candidate.status !== "completed");
    if (blocked) return false;
  }
  return evaluateQuestPredicate(state, objective.predicate, choiceId);
}

function applyQuestTransitionState(
  next: LanternCampaignState,
  sourceState: LanternCampaignState,
  quest: EngineQuest,
  transition: EngineQuestTransition,
  context: RequestContext,
  sourceCommandId: string,
  choiceId?: string,
): { error: QuestTransitionValidation | null; rewardKeys: string[]; stateChanges: Array<{ path: string; before: unknown; after: unknown }> } {
  const graph = quest.graph;
  if (!graph) return { error: { code: "quest_graph_unavailable", message: "That quest has no typed transition graph." }, rewardKeys: [], stateChanges: [] };
  const consequence = transition.consequence;
  if (consequence.worldFact && !next.worldFacts.some((fact) => fact.id === consequence.worldFact!.factId)) {
    return { error: { code: "quest_world_fact_missing", message: "A quest consequence may change only an established world fact." }, rewardKeys: [], stateChanges: [] };
  }
  const beforeCharacter = sourceState.character;
  const beforeInventory = sourceState.character.inventory;
  const beforeSocial = sourceState.social;
  const beforeFacts = sourceState.worldFacts;
  const beforeClaimedRewards = sourceState.claimedRewards;
  const outcomeId = `${quest.id}:${transition.id}`;
  const rewardKeys: string[] = [];
  const rewardItems = (consequence.items ?? []).map((item) => normalizeInventoryItem({ ...item, equipped: false }));
  const rewardItemIds = new Set<string>();
  for (const item of rewardItems) {
    if (rewardItemIds.has(item.id) || next.character.inventory.some((candidate) => candidate.id === item.id)) {
      return { error: { code: "duplicate_item_instance", message: "A quest consequence cannot create a duplicate item instance." }, rewardKeys: [], stateChanges: [] };
    }
    rewardItemIds.add(item.id);
  }
  const claim = (rewardType: string): boolean => {
    const key = `${outcomeId}:${rewardType}`;
    if (next.claimedRewards.includes(key)) return false;
    next.claimedRewards.push(key);
    rewardKeys.push(key);
    return true;
  };
  if (consequence.xp > 0 && claim("xp")) next.character.xp += consequence.xp;
  if (consequence.copper > 0 && claim("copper")) {
    next.character.currency.copper += consequence.copper;
    syncCurrencyProjection(next.character);
  }
  for (const item of rewardItems) {
    if (claim(`item:${item.id}`)) addInventory(next.character.inventory, withActorOwnership(item, next.character.id, { kind: "quest", sourceId: sourceCommandId }));
  }
  const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
  if (capacityIssue) return { error: { code: capacityIssue.code, message: capacityIssue.message }, rewardKeys: [], stateChanges: [] };
  let reputationApplied = false;
  if (consequence.reputation && claim("reputation")) {
    const actorId = consequence.reputation.actorId ?? next.actorId;
    const social = ensureSocialState(next);
    const existing = social.reputations.find((candidate) => candidate.actorId === actorId && candidate.communityId === consequence.reputation!.communityId);
    if (existing) {
      existing.score = Math.max(SOCIAL_MIN, Math.min(SOCIAL_MAX, existing.score + consequence.reputation.delta));
      existing.provenance = { sourceCommandId, sourceVersion: sourceState.version, occurredAt: new Date().toISOString() };
    } else {
      social.reputations.push({
        id: `${outcomeId}:reputation:${consequence.reputation.communityId}`,
        actorId,
        communityId: consequence.reputation.communityId,
        score: Math.max(SOCIAL_MIN, Math.min(SOCIAL_MAX, consequence.reputation.delta)),
        provenance: { sourceCommandId, sourceVersion: sourceState.version, occurredAt: new Date().toISOString() },
      });
    }
    reputationApplied = true;
  }
  let worldChangeApplied = false;
  if (consequence.worldFact && claim("world")) {
    const fact = next.worldFacts.find((candidate) => candidate.id === consequence.worldFact!.factId);
    if (fact) {
      fact.active = consequence.worldFact.active;
      fact.revision += 1;
      fact.updatedAt = new Date().toISOString();
      markKnowledgeStale(next, [fact.id]);
      worldChangeApplied = true;
    }
  }
  const followUpQuestId = consequence.followUpQuestId ?? graph.followUpQuestId;
  const followUpEligible = Boolean(followUpQuestId);
  if (followUpEligible) graph.followUpEligible = true;
  const nowMinutes = next.time.gameTime.totalMinutes;
  const completedObjectiveIds: string[] = [];
  graph.objectives = graph.objectives.map((objective) => {
    if (objective.status === "completed") return objective;
    const discovered = objective.hidden
      ? objective.discovered || (objective.predicate.kind === "fact_discovered" && evaluateQuestPredicate(next, objective.predicate, choiceId))
      : true;
    const completed = discovered && evaluateQuestObjective(next, graph, { ...objective, discovered }, choiceId);
    if (!completed) return { ...objective, discovered };
    completedObjectiveIds.push(objective.id);
    return { ...objective, discovered, status: "completed" as const, completedAtMinutes: nowMinutes, evidence: `state:${sourceCommandId}` };
  });
  const statusByOutcome: Record<EngineQuestTerminalOutcome, EngineQuestStatus> = {
    success: "completed",
    failure: "failed",
    abandonment: "abandoned",
    expiration: "expired",
  };
  quest.status = statusByOutcome[transition.outcome];
  quest.progress = Math.round((graph.objectives.filter((objective) => objective.status === "completed").length / Math.max(1, graph.objectives.length)) * 100);
  quest.rewardClaimed = rewardKeys.length > 0 || quest.rewardClaimed;
  graph.terminalTransitionId = transition.id;
  if (graph.clock) {
    if (graph.clock.source === "objective") graph.clock.current = Math.min(graph.clock.max, graph.objectives.filter((objective) => objective.status === "completed").length);
    if (graph.clock.source === "choice") graph.clock.current = Math.min(graph.clock.max, graph.clock.current + (choiceId ? 1 : 0));
    if (graph.clock.current >= graph.clock.max || transition.outcome !== "success") {
      graph.clock.resolvedAtMinutes = nowMinutes;
      graph.clock.resolvedByTransitionId = transition.id;
    }
  }
  graph.consequenceRecords.push({
    transitionId: transition.id,
    outcomeId,
    rewardKeys,
    reputationApplied,
    worldChangeApplied,
    followUpEligible,
    appliedAtMinutes: nowMinutes,
    sourceCommandId,
  });
  const targetIndex = next.quests.findIndex((candidate) => candidate.id === quest.id);
  if (targetIndex >= 0) next.quests[targetIndex] = quest;
  if (next.quest.id === quest.id) next.quest = quest;
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: `/quests/${quest.id}`, before: projectQuestForActor(sourceState.quests.find((candidate) => candidate.id === quest.id) ?? quest, sourceState, context.actorId), after: projectQuestForActor(quest, next, context.actorId) },
    ...(JSON.stringify(beforeClaimedRewards) === JSON.stringify(next.claimedRewards) ? [] : [{ path: "/claimedRewards", before: beforeClaimedRewards, after: next.claimedRewards }]),
    ...(beforeCharacter.xp === next.character.xp ? [] : [{ path: "/character/xp", before: beforeCharacter.xp, after: next.character.xp }]),
    ...(JSON.stringify(beforeCharacter.currency) === JSON.stringify(next.character.currency) ? [] : [{ path: "/character/currency", before: beforeCharacter.currency, after: next.character.currency }]),
    ...(JSON.stringify(beforeInventory) === JSON.stringify(next.character.inventory) ? [] : [{ path: "/character/inventory", before: beforeInventory, after: next.character.inventory }]),
    ...(JSON.stringify(beforeSocial) === JSON.stringify(next.social) ? [] : [{ path: "/social", before: beforeSocial, after: next.social }]),
    ...(JSON.stringify(beforeFacts) === JSON.stringify(next.worldFacts) ? [] : [{ path: "/worldFacts", before: beforeFacts, after: next.worldFacts }]),
  ];
  void context;
  void completedObjectiveIds;
  return { error: null, rewardKeys, stateChanges };
}

function resolveQuestUpdate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "quest_update" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const existing = state.quests.find((candidate) => candidate.id === command.questId);
  if (!existing) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  if (existing.graph) {
    return rejection(state, tool, "quest_transition_required", "Graph quest objectives and terminal state can change only through a declared quest_transition.");
  }
  const next = cloneCampaign(state);
  const updated = next.quests.find((candidate) => candidate.id === command.questId);
  if (!updated) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  if (command.status) updated.status = command.status;
  if (command.objective) updated.objective = command.objective;
  if (command.progress !== undefined) updated.progress = command.progress;
  if (updated.status === "completed") updated.progress = 100;
  const rewardClaimedNow = updated.status === "completed" && !updated.rewardClaimed;
  if (rewardClaimedNow) {
    updated.rewardClaimed = true;
    const rewardKey = `${updated.id}:legacy:reward`;
    if (!next.claimedRewards.includes(rewardKey)) next.claimedRewards.push(rewardKey);
    next.character.currency.copper += updated.reward.copper;
    syncCurrencyProjection(next.character);
    next.character.xp += updated.reward.xp;
  }
  const pendingAdvancement = rewardClaimedNow
    ? openPendingAdvancement(next, state, updated.id, clientCommandId)
    : null;
  next.quest = updated;
  const rewardText = rewardClaimedNow
    ? " Reward claimed: " + formatCurrency(updated.reward.copper) + " and " + updated.reward.xp + " XP."
    : "";
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/quests/" + updated.id, before: existing, after: updated },
  ];
  if (rewardClaimedNow) {
    stateChanges.push(
      { path: "/character/currency", before: state.character.currency, after: next.character.currency },
      { path: "/character/xp", before: state.character.xp, after: next.character.xp },
      { path: "/claimedRewards", before: state.claimedRewards, after: next.claimedRewards },
    );
  }
  if (pendingAdvancement) {
    stateChanges.push({ path: "/pendingAdvancement", before: state.pendingAdvancement, after: pendingAdvancement });
  }
  const advancementText = pendingAdvancement ? " A level-up preview is ready for your confirmation." : "";
  return commit(next, context, clientCommandId, command, tool, "Quest updated: " + updated.title + "." + rewardText + advancementText, { quest: updated, quests: next.quests, reward: rewardClaimedNow ? updated.reward : null, pendingAdvancement, character: characterData(next.character) }, "quest_updated", [], [], stateChanges);
}

function openPendingAdvancement(
  next: LanternCampaignState,
  sourceState: LanternCampaignState,
  sourceId: string,
  sourceCommandId: string,
): EnginePendingAdvancement | null {
  const policy = next.advancementPolicy;
  if (policy.mode !== "milestone" || !next.character.created || next.character.level >= policy.maxLevel) return null;
  if (next.pendingAdvancement?.status === "pending") return null;
  if (next.pendingAdvancement?.sourceId === sourceId) return null;
  const preview = buildAdvancementPreview(next.character);
  if (preview.fromLevel !== 1 || preview.toLevel > policy.maxLevel) return null;
  const pending: EnginePendingAdvancement = {
    version: 1,
    id: randomUUID(),
    sourceKind: "quest-milestone",
    sourceId,
    sourceCommandId,
    sourceVersion: sourceState.version + 1,
    ownerActorId: next.actorId,
    fromLevel: 1,
    toLevel: 2,
    className: next.character.className,
    classRef: next.character.classRef ? { ...next.character.classRef } : null,
    rulesVersion: next.rulesVersion,
    formulaRevision: policy.formulaRevision,
    legalChoices: {
      className: next.character.className,
      classRef: next.character.classRef ? { ...next.character.classRef } : null,
    },
    preview,
    status: "pending",
  };
  next.pendingAdvancement = pending;
  return pending;
}

function resolveAdvancementConfirm(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advancement_confirm" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const pending = state.pendingAdvancement;
  if (!pending) return rejection(state, tool, "advancement_not_pending", "There is no pending advancement to confirm.");
  if (pending.id !== command.pendingId) return rejection(state, tool, "advancement_stale", "That advancement preview is stale.");
  if (pending.status !== "pending") return rejection(state, tool, "advancement_consumed", "That advancement has already been consumed.");
  if (pending.ownerActorId !== state.actorId || state.character.level !== pending.fromLevel) {
    return rejection(state, tool, "advancement_stale", "The pending advancement no longer matches this character.");
  }
  if (state.advancementPolicy.formulaRevision !== pending.formulaRevision || state.rulesVersion !== pending.rulesVersion) {
    return rejection(state, tool, "advancement_rules_mismatch", "The pinned advancement rules no longer match this preview.");
  }
  const preview = buildAdvancementPreview(state.character);
  if (preview.fromLevel !== pending.fromLevel || preview.toLevel !== pending.toLevel) {
    return rejection(state, tool, "advancement_stale", "The character changed after this advancement was previewed.");
  }
  if (JSON.stringify(preview) !== JSON.stringify(pending.preview)) {
    return rejection(state, tool, "advancement_stale", "The character changed after this advancement was previewed.");
  }

  const next = cloneCampaign(state);
  const upgraded = hydrateCharacter({
    ...next.character,
    level: preview.toLevel,
    maxHp: preview.maxHpAfter,
    hp: preview.currentHpAfter,
    hitDiceRemaining: preview.hitDiceRemainingAfter,
    progressionFormulaRevision: PROGRESSION_FORMULA_REVISION,
    progressionMaxHp: preview.maxHpAfter,
  });
  upgraded.features = [...upgraded.features, ...preview.featuresAdded];
  upgraded.featureRefs = [...upgraded.featureRefs, ...preview.featureRefsAdded];
  if (upgraded.spellcasting && preview.spellSlotsAfter) upgraded.spellcasting.slots = { ...preview.spellSlotsAfter };
  next.character = upgraded;
  next.pendingAdvancement = {
    ...pending,
    preview,
    status: "consumed",
    consumedCommandId: clientCommandId,
    consumedAt: new Date().toISOString(),
  };
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/character/level", before: state.character.level, after: next.character.level },
    { path: "/character/hp", before: state.character.hp, after: next.character.hp },
    { path: "/character/maxHp", before: state.character.maxHp, after: next.character.maxHp },
    { path: "/character/hitDiceRemaining", before: state.character.hitDiceRemaining, after: next.character.hitDiceRemaining },
    { path: "/character/proficiencyBonus", before: state.character.proficiencyBonus, after: next.character.proficiencyBonus },
    { path: "/character/savingThrows", before: state.character.savingThrows, after: next.character.savingThrows },
    { path: "/character/skills", before: state.character.skills, after: next.character.skills },
    { path: "/character/features", before: state.character.features, after: next.character.features },
    { path: "/character/featureRefs", before: state.character.featureRefs, after: next.character.featureRefs },
    { path: "/character/spellcasting", before: state.character.spellcasting, after: next.character.spellcasting },
    { path: "/pendingAdvancement", before: state.pendingAdvancement, after: next.pendingAdvancement },
  ];
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `Advancement confirmed: ${next.character.name} reaches level ${next.character.level}.`,
    { pendingAdvancement: next.pendingAdvancement, preview, character: characterData(next.character) },
    "advancement_confirmed",
    [],
    [],
    stateChanges,
  );
}

function resolveNpcAdvance(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "npc_advance" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "NPC progression requires an active encounter.");
  const target = state.combat.enemies.find((enemy) => enemy.id === command.combatantId);
  if (!target) return rejection(state, tool, "combatant_not_found", "That combatant is not in the active encounter.");
  if (!target.alive) return rejection(state, tool, "combatant_not_live", "A defeated combatant cannot be progressed.");
  if (target.progression) return rejection(state, tool, "npc_progression_already_applied", "That combatant already has a progression template.");

  const baseView = materializeCombatant(target);
  const modifications = { maxHp: 5, armorClass: 1, attackBonus: 1, damageBonus: 1 };
  const revisedExperiencePoints = baseView.experiencePoints === null
    ? null
    : baseView.experiencePoints * 2;
  const progression: EngineCombatantProgression = {
    templateId: "veteran",
    templateVersion: "v1",
    sourceCommandId: clientCommandId,
    sourceVersion: state.version + 1,
    base: {
      maxHp: baseView.maxHp,
      armorClass: baseView.armorClass,
      challengeRating: baseView.challengeRating,
      experiencePoints: baseView.experiencePoints,
    },
    revised: {
      maxHp: baseView.maxHp + modifications.maxHp,
      armorClass: baseView.armorClass + modifications.armorClass,
      challengeRating: Number((baseView.challengeRating + 0.5).toFixed(1)),
      experiencePoints: revisedExperiencePoints,
    },
    modifications,
  };
  const next = cloneCampaign(state);
  const nextTarget = next.combat.enemies.find((enemy) => enemy.id === command.combatantId);
  if (!nextTarget) return rejection(state, tool, "combatant_not_found", "That combatant is not in the active encounter.");
  nextTarget.progression = progression;
  nextTarget.hp = Math.min(progression.revised.maxHp, nextTarget.hp + modifications.maxHp);
  nextTarget.alive = nextTarget.hp > 0;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `The ${baseView.name} becomes a veteran of this encounter.`,
    { combatant: materializeCombatant(nextTarget), progression },
    "npc_progression_applied",
    [],
    [],
    [{ path: `/combat/enemies/${target.id}`, before: target, after: nextTarget }],
  );
}

function resolveImprovise(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "improvise" }>,
  tool: EngineToolName | "declare" | "listen",
  sceneMoveBindingValidated = false,
): EngineResolution {
  if (command.sceneMove && command.effectType !== "fictional") {
    return rejection(
      state,
      tool,
      "scene_move_must_be_fictional",
      "A post-check scene move is a non-mechanical fictional consequence; use an authoritative typed tool for mechanics.",
    );
  }
  if (command.sceneMove && !sceneMoveBindingValidated) {
    return rejection(
      state,
      tool,
      "scene_move_binding_required",
      "A post-check scene move must be validated against an earlier provisional check in the private DM turn plan.",
    );
  }
  if (command.effectType === "movement" || command.effectType === "summoning") {
    return rejection(
      state,
      tool,
      "unsupported_effect",
      `${command.effectType} is not admitted by the effects kernel; use a reviewed producer slice first.`
    );
  }
  const targetIsPlayer = !command.targetId || command.targetId === state.actorId || command.targetId === state.character.id;
  const targetEnemy = command.targetId ? state.combat.enemies.find((enemy) => enemy.id === command.targetId && enemy.alive) : null;
  if (command.targetId && !targetIsPlayer && !targetEnemy) {
    return rejection(state, tool, "target_not_found", "That effect target is not a living player or creature.");
  }
  const targetRef = targetEnemy?.id ?? state.character.id;
  if (command.effectType === "condition" && !command.condition) {
    return rejection(state, tool, "condition_required", "A condition effect must name its reviewed condition marker.");
  }
  if (command.effectType === "damage" && !(command.amount && command.amount > 0)) {
    return rejection(state, tool, "damage_amount_required", "Damage must provide a positive amount.");
  }
  if ((command.effectType === "damage" || command.effectType === "healing") && !targetIsPlayer) {
    return rejection(state, tool, "unsupported_effect_target", `${command.effectType} currently has no creature resolver.`);
  }
  const next = cloneCampaign(state);
  const effect: EngineImprovEffect = {
    id: randomUUID(),
    title: command.title,
    description: command.description,
    effectType: command.effectType,
    targetId: command.targetId,
    amount: command.amount,
    condition: command.condition,
    checkCategory: command.checkCategory,
    createdAt: new Date().toISOString(),
  };
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (
    command.sceneMove?.outcome === "failure"
    && next.situation?.lastComplication === "pending-dm-consequence"
  ) {
    const beforeSituation = projectSituationForActor(state.situation!, state, context.actorId);
    const concreteComplication = `${command.sceneMove.category}: ${command.description}`;
    next.situation.lastComplication = concreteComplication;
    const pendingClue = [...next.situation.clues]
      .reverse()
      .find((clue) => clue.lastComplication === "pending-dm-consequence");
    if (pendingClue) pendingClue.lastComplication = concreteComplication;
    next.situation.revision += 1;
    changes.push({
      path: "/situation",
      before: beforeSituation,
      after: projectSituationForActor(next.situation, next, context.actorId),
    });
  }
  if (command.effectType === "advantage" || command.effectType === "disadvantage") {
    const operation: EngineEffectOperation = { kind: command.effectType, category: command.checkCategory ?? "attack-roll" };
    applyRuntimeEffect(
      next,
      effectInput(
        next,
        `improvise:${command.effectType}`,
        `actor:${state.actorId}`,
        [targetRef],
        [operation],
        command.durationRounds
          ? { kind: "fixed", amount: command.durationRounds, unit: "round" }
          : { kind: "persistent" },
        `improvise:${command.effectType}`,
        "ignore",
        command.durationRounds ? ["duration"] : ["never"],
        clientCommandId,
      ),
      changes,
    );
  }
  if (command.effectType === "condition" && command.condition) {
    applyConditionRuntimeEffect(
      next,
      command.condition,
      `actor:${state.actorId}`,
      targetRef,
      command.durationRounds
        ? { kind: "fixed", amount: command.durationRounds, unit: "round" }
        : { kind: "persistent" },
      `condition:${normalizeCondition(command.condition)}`,
      command.durationRounds ? ["duration"] : ["never"],
      clientCommandId,
      changes,
    );
  }
  if (command.effectType === "damage" || command.effectType === "healing") {
    if (targetIsPlayer) {
      const amount = command.amount ?? 0;
      if (command.effectType === "damage") applyCharacterDamage(next, amount, "improvise", clientCommandId, changes, [], [], false);
      else {
        if (amount <= 0) return rejection(state, tool, "healing_amount_required", "Healing must provide a positive amount.");
        if (state.character.hp >= state.character.maxHp) return rejection(state, tool, "already_full_health", "The target is already at full hit points.");
        applyHealing(next, amount, "improvise", changes);
      }
    }
  }
  next.improvEffects = [...state.improvEffects, effect].slice(-100);
  const fictional = command.effectType === "fictional";
  return commit(next, context, clientCommandId, command, tool, fictional
    ? command.sceneMove
      ? "The caused consequence is committed: " + command.title + ". Next decision: " + command.sceneMove.nextDecision
      : "The fiction advances; no mechanical effect was applied: " + command.title + "."
    : "Improv effect applied: " + command.title + ".", { effect, mechanical: !fictional, effects: next.effects.filter((candidate) => candidate.status === "active"), character: characterData(next.character) }, fictional ? "improvise_fictional" : "improv_effect_applied", [], [], [
    { path: "/improvEffects", before: state.improvEffects, after: next.improvEffects },
    { path: "/character", before: state.character, after: next.character },
    ...changes,
  ]);
}

function resolveCampaignBeat(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "campaign_beat" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const beat: EngineCampaignBeat = { id: randomUUID(), title: command.title, description: command.description, pressure: command.pressure, choices: command.choices, createdAt: new Date().toISOString() };
  const next = cloneCampaign(state);
  next.currentBeat = beat;
  return commit(next, context, clientCommandId, command, tool, "The campaign moves: " + beat.title + ".", { beat }, "campaign_beat", [], [], [
    { path: "/currentBeat", before: state.currentBeat, after: beat },
  ]);
}

function resolveInteract(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "interact" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (command.affordance) {
    return resolveWorldObjectAffordance(
      state,
      context,
      clientCommandId,
      command as Extract<EngineCommand, { kind: "interact" }> & { affordance: EngineWorldObjectAffordance },
      tool,
    );
  }
  return commit(
    state,
    context,
    clientCommandId,
    command,
    tool,
    "You act on " + command.targetId + ". No mechanical check was required; the DM narrates the immediate consequence.",
    { targetId: command.targetId, goal: command.goal },
    "interacted",
    [],
    [],
    []
  );
}

function resolveSituationCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "situation_create" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!context.capabilities.includes("dm")) return rejection(state, tool, "dm_required", "Only the DM may submit a situation definition.");
  if (state.situation) return rejection(state, tool, "situation_exists", "A campaign can hold one active situation in this first slice.");
  if (!command.definition) {
    return rejection(state, tool, "legacy_situation_template_retired", "Legacy watchtower template creation is retained only for persisted replay; submit an authored situation definition.");
  }
  const sourceRandomEvent = command.sourceRandomEventId
    ? state.time.randomEvents.find((event) => event.id === command.sourceRandomEventId) ?? null
    : null;
  if (command.sourceRandomEventId) {
    if (!sourceRandomEvent) return rejection(state, tool, "random_event_not_found", "The situation source random event is not committed in this campaign.");
    if (sourceRandomEvent.createdSituationIds.length > 0) return rejection(state, tool, "random_event_replayed", "That random event has already seeded a situation.");
    if (!sourceRandomEvent.triggered || !sourceRandomEvent.selectedEntryId) {
      return rejection(state, tool, "random_event_not_eligible", "Only a triggered, selected random event can provide situation provenance.");
    }
  }
  const built = compileSituationDefinition(state, command.definition, clientCommandId, state.version, command.sourceRandomEventId ?? null, sourceRandomEvent);
  if (!built.ok) return rejection(state, tool, built.code, built.message);
  const next = cloneCampaign(state);
  next.situation = reconcileSituation(built.situation, next);
  const newlyCreatedFactIds = built.worldFacts.filter((fact) => !state.worldFacts.some((candidate) => candidate.id === fact.id)).map((fact) => fact.id);
  const existingFacts = new Map(state.worldFacts.map((fact) => [fact.id, fact]));
  for (const fact of built.worldFacts) {
    const previous = existingFacts.get(fact.id);
    if (!previous) existingFacts.set(fact.id, fact);
  }
  next.worldFacts = [...existingFacts.values()];
  const knowledgeBefore = next.actorKnowledge.length;
  for (const seed of built.actorKnowledge) {
    const fact = next.worldFacts.find((candidate) => candidate.id === seed.factId && candidate.active);
    if (fact) appendKnowledgeRecord(next, seed.actorId, fact, "known", "dm", `situation:${next.situation.id}:authored`, next.version + 1);
  }
  const source = sourceRandomEvent ? next.time.randomEvents.find((event) => event.id === sourceRandomEvent.id) : null;
  const sourceBeforeSituationIds = source ? [...source.createdSituationIds] : null;
  const sourceBeforeFactIds = source ? [...source.createdFactIds] : null;
  if (source) {
    source.createdSituationIds = [...source.createdSituationIds, built.situation.id];
    source.createdFactIds = [...new Set([...source.createdFactIds, ...newlyCreatedFactIds])];
  }
  const situationEvidence = projectSituationForActor(next.situation, next, context.actorId);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/situation", before: null, after: situationEvidence },
    { path: "/worldFacts", before: { activeCount: state.worldFacts.filter((fact) => fact.active).length }, after: { activeCount: next.worldFacts.filter((fact) => fact.active).length } },
    { path: "/actorKnowledge", before: { count: knowledgeBefore }, after: { count: next.actorKnowledge.length } },
  ];
  if (source) changes.push(
    { path: `/time/randomEvents/${source.id}/createdSituationIds`, before: sourceBeforeSituationIds, after: source.createdSituationIds },
    { path: `/time/randomEvents/${source.id}/createdFactIds`, before: sourceBeforeFactIds, after: source.createdFactIds },
  );
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The authored situation definition is committed and in motion.",
    { situation: situationEvidence },
    "situation_created",
    [],
    [],
    changes,
  );
}

function resolveSituationVisit(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "situation_visit" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  const situation = state.situation;
  if (!situation) return rejection(state, tool, "situation_not_found", "There is no committed situation to visit.");
  if (situation.status !== "active") return rejection(state, tool, "situation_terminal", "The situation has already reached a terminal outcome.");
  const node = situation.nodes.find((candidate) => candidate.id === command.locationId);
  if (!node) return rejection(state, tool, "location_not_found", "That location is not part of the reviewed situation.");
  if (situation.currentLocationId !== command.locationId && !situation.visitedLocationIds.includes(command.locationId)) {
    const current = situation.nodes.find((candidate) => candidate.id === situation.currentLocationId);
    if (!current?.exitIds.includes(command.locationId)) return rejection(state, tool, "location_not_reachable", "That situation location is not connected to the current node.");
  }
  const next = cloneCampaign(state);
  const nextSituation = next.situation!;
  nextSituation.currentLocationId = node.id;
  nextSituation.visitedLocationIds = [...new Set([...nextSituation.visitedLocationIds, node.id])];
  nextSituation.revision += 1;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `You reach ${node.title}.`,
    { situation: projectSituationForActor(nextSituation, next, context.actorId), node },
    "situation_visited",
    [],
    [],
    [{ path: "/situation", before: projectSituationForActor(situation, state, context.actorId), after: projectSituationForActor(nextSituation, next, context.actorId) }],
  );
}

function resolveSituationClueAttempt(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "situation_clue_attempt" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  const situation = state.situation;
  if (!situation) return rejection(state, tool, "situation_not_found", "There is no committed situation to investigate.");
  if (situation.status !== "active") return rejection(state, tool, "situation_terminal", "The situation has already reached a terminal outcome.");
  const clue = situation.clues.find((candidate) => candidate.id === command.clueId);
  if (!clue) return rejection(state, tool, "clue_not_found", "That clue is not part of the reviewed situation.");
  if (!situation.visitedLocationIds.includes(clue.locationId)) return rejection(state, tool, "clue_location_unvisited", "Visit the clue's location before attempting to investigate it.");
  if (clue.foundBy.includes(context.actorId)) return rejection(state, tool, "clue_already_found", "That clue has already been found by this actor.");
  const revelation = situation.revelations.find((candidate) => candidate.id === clue.revelationId);
  const sourceActor = command.sourceActorId
    ? state.worldContext?.npcs.find((candidate) => candidate.id === command.sourceActorId)
    : null;
  if (command.sourceActorId && (!sourceActor || !situation.actors.some((actor) => actor.actorRef === sourceActor.id))) {
    return rejection(state, tool, "clue_source_actor_not_found", "That source is not an established present actor in this situation.");
  }
  if (sourceActor && (!revelation || !state.actorKnowledge.some((record) =>
    record.actorId === sourceActor.id
    && record.factId === revelation.truthId
    && !record.stale
    && record.tier === "known"
  ))) {
    return rejection(state, tool, "clue_source_actor_uninformed", "That actor does not canonically know the linked truth and cannot supply this answer.");
  }
  const challenge: EngineChallengeAttemptCommand = {
    kind: "challenge_attempt",
    challengeId: clue.challengeId,
    goal: `Investigate ${clue.title}.`,
    approach: command.approach,
    sceneId: state.worldContext?.id,
    difficultyBand: clue.difficultyBand,
    informationPolicy: "public",
  };
  const checked = sourceActor
    ? commit(
        cloneCampaign(state),
        context,
        clientCommandId,
        command,
        tool,
        `${sourceActor.name} can answer from canonical knowledge; no uncertain social check is required.`,
        { sourceActorId: sourceActor.id, automatic: true },
        "automatic-success",
        [],
        [],
        [],
      )
    : resolveChallengeAttempt(state, context, clientCommandId, challenge, tool);
  if (!checked.accepted || !checked.event) return rejection(state, tool, checked.code ?? "clue_attempt_rejected", checked.message);
  const next = checked.state;
  const nextSituation = next.situation!;
  const nextClue = nextSituation.clues.find((candidate) => candidate.id === clue.id)!;
  const success = Boolean(sourceActor) || checked.event.outcome === "success";
  if (!sourceActor) nextClue.attempts += 1;
  if (success) {
    nextClue.foundBy = [...new Set([...nextClue.foundBy, context.actorId])];
    nextClue.lastComplication = null;
    const revelation = nextSituation.revelations.find((candidate) => candidate.id === nextClue.revelationId);
    if (revelation) revelation.status = "revealed";
    for (const factId of situationClueFactIds(nextSituation, nextClue.id)) {
      const fact = next.worldFacts.find((candidate) => candidate.id === factId && candidate.active);
      if (!fact) continue;
      if (!fact.id || next.actorKnowledge.some((record) => record.actorId === context.actorId && record.factId === fact.id && !record.stale && record.factRevision === fact.revision)) continue;
      const record = appendKnowledgeRecord(
        next,
        context.actorId,
        fact,
        "known",
        sourceActor ? "dm" : "active-search",
        sourceActor ? `situation:${nextSituation.id}:actor:${sourceActor.id}` : `situation:${nextSituation.id}:${nextClue.id}`,
        next.version,
      );
      nextSituation.truths = nextSituation.truths.map((truth) => truth.id === fact.id ? { ...truth, discoveredBy: [...new Set([...truth.discoveredBy, context.actorId])] } : truth);
      checked.event.stateChanges.push({ path: `/actorKnowledge/${record.id}`, before: null, after: { actorId: record.actorId, tier: record.tier, source: record.source, confidence: record.confidence } });
    }
  } else {
    nextClue.failedAttempts += 1;
    nextClue.lastComplication = "pending-dm-consequence";
    nextSituation.complicationCount += 1;
    nextSituation.lastComplication = nextClue.lastComplication;
  }
  nextSituation.revision += 1;
  const beforeProjection = projectSituationForActor(situation, state, context.actorId);
  const afterProjection = projectSituationForActor(nextSituation, next, context.actorId);
  const message = sourceActor
    ? `${sourceActor.name}'s authorized answer and the linked revelation are committed without a roll.`
    : success
      ? "The authorized clue and linked revelation are committed as a concrete discovery."
      : "The clue attempt failed without revealing the hidden truth; a concrete caused consequence is required before this turn can commit.";
  checked.event.tool = tool;
  checked.event.command = command;
  checked.event.outcome = sourceActor ? "situation_clue_shared" : success ? "situation_clue_found" : "situation_clue_failed_forward";
  checked.event.stateChanges.push({ path: "/situation", before: beforeProjection, after: afterProjection });
  checked.tool = tool;
  checked.message = message;
  checked.data = {
    situation: afterProjection,
    clueId: nextClue.id,
    success,
    sourceActorId: sourceActor?.id ?? null,
    complication: success ? null : nextClue.lastComplication,
    check: checked.event.check,
  };
  checked.narration = rulesNarration(message);
  return checked;
}

function resolveSituationIgnore(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "situation_ignore" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.situation) return rejection(state, tool, "situation_not_found", "There is no committed situation to ignore.");
  if (state.situation.status !== "active") return rejection(state, tool, "situation_terminal", "The situation has already reached a terminal outcome.");
  const next = cloneCampaign(state);
  const advance = advanceGameTime(next, next.situation!.pressure.intervalMinutes, "situation-ignore", clientCommandId);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You leave the situation unattended for one reviewed time boundary; its pressure advances if due.",
    { situation: next.situation ? projectSituationForActor(next.situation, next, context.actorId) : null, timeAdvance: advance },
    "situation_ignored",
    [],
    [],
    [
      { path: "/time/gameTime", before: advance.before, after: advance.after },
      ...(advance.questStateChanges),
    ],
  );
}

function resolveSituationChoice(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "situation_choose" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.situation) return rejection(state, tool, "situation_not_found", "There is no committed situation to resolve.");
  const reconciled = reconcileSituation(state.situation, state);
  const requestedOutcomeId = command.outcomeId ?? command.choice!;
  const allowed = situationChoiceAllowed(reconciled, state, requestedOutcomeId);
  if (!allowed.allowed) return rejection(state, tool, "situation_choice_unavailable", allowed.reason);
  const next = cloneCampaign(state);
  next.situation = reconciled;
  next.situation.status = allowed.outcome.terminalStatus;
  next.situation.outcome = {
    outcomeId: allowed.outcome.id,
    title: allowed.outcome.title,
    committedAtMinutes: next.time.gameTime.totalMinutes,
    sourceCommandId: clientCommandId,
    reactivityTier: allowed.outcome.reactivityTier,
  };
  next.situation.revision += 1;
  const beforeProjection = projectSituationForActor(state.situation, state, context.actorId);
  const afterProjection = projectSituationForActor(next.situation, next, context.actorId);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The situation reaches its selected outcome: " + allowed.outcome.title + ".",
    { situation: afterProjection, outcome: next.situation.outcome },
    "situation_outcome_committed",
    [],
    [],
    [{ path: "/situation", before: beforeProjection, after: afterProjection }],
  );
}

function resolveWorldObjectAffordance(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "interact" }> & { affordance: EngineWorldObjectAffordance },
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const world = state.worldContext;
  const object = world?.objects.find((candidate) => candidate.id === command.targetId);
  if (!world) return rejection(state, tool, "world_context_required", "There is no authoritative world context for that object interaction.");
  if (!object) return rejection(state, tool, "object_not_found", "That world object is not established in the current context.");
  const topology = worldObjectTopologyValidation(world.objects, world.id, state.actorId);
  if (topology) return rejection(state, tool, topology.code, topology.message);
  if (!object.definition.affordances.includes(command.affordance)) {
    return rejection(state, tool, "affordance_unavailable", "The established object does not declare that affordance.", { objectId: object.id, affordance: command.affordance });
  }
  if (command.affordance === "inspect") {
    return readOnlyResolution(state, tool, "The engine confirms the current state of " + object.definition.name + ".", { object });
  }
  if (object.state === "destroyed") {
    return rejection(state, tool, "object_destroyed", "That object has been destroyed and cannot accept another mechanical interaction.", { objectId: object.id });
  }
  const prerequisite = object.definition.prerequisites.find((candidate) => candidate.affordance === command.affordance);
  const source = command.sourceId ? world.objects.find((candidate) => candidate.id === command.sourceId) : undefined;
  if (prerequisite) {
    if (!source || !prerequisite.requiredTags.every((tag) => source.definition.tags.includes(tag))) {
      return rejection(state, tool, "prerequisite_missing", "The referenced prerequisite does not provide the required material or tag.", { objectId: object.id, affordance: command.affordance });
    }
    if (prerequisite.requiredState && source.state !== prerequisite.requiredState) {
      return rejection(state, tool, "prerequisite_state_invalid", "The referenced prerequisite is not in the required state.", { objectId: source.id, requiredState: prerequisite.requiredState });
    }
  }

  const next = cloneCampaign(state);
  const nextWorld = next.worldContext;
  if (!nextWorld) return rejection(state, tool, "world_context_required", "There is no authoritative world context for that object interaction.");
  const beforeInventory = JSON.parse(JSON.stringify(next.character.inventory)) as EngineInventoryItem[];
  const changes: WorldContextStateChange[] = [];
  const now = new Date().toISOString();
  const setObject = (objectId: string, patch: Partial<EngineWorldObjectInstance>): EngineWorldObjectInstance | null => {
    const index = nextWorld.objects.findIndex((candidate) => candidate.id === objectId);
    if (index < 0) return null;
    const before = nextWorld.objects[index]!;
    const after: EngineWorldObjectInstance = {
      ...before,
      ...patch,
      revision: before.revision + 1,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version + 1, occurredAt: now },
    };
    nextWorld.objects[index] = after;
    if (!sameWorldContextValue(before, after)) {
      changes.push({ path: "/worldContext/objects/" + escapeJsonPointerSegment(objectId), before, after });
    }
    return after;
  };
  const requireState = (states: EngineWorldObjectState[], code: string, message: string): EngineResolution | null => {
    if (states.includes(object.state)) return null;
    return rejection(state, tool, code, message, { objectId: object.id, state: object.state });
  };
  const establishedHolder = world.npcs.find((npc) => npc.id === object.locationRef);
  const heldObjectTransferRejection = (): EngineResolution | null => {
    if (!establishedHolder) return null;
    if (!object.definition.criticalPolicy.canLose) {
      return rejection(state, tool, "critical_object_protected", "This critical object cannot be lost through that interaction.", { objectId: object.id });
    }
    const contest = state.adjudicationHistory.at(-1);
    if (
      !contest
      || contest.challengeId !== "seize-held-object-v1"
      || contest.opponentId !== establishedHolder.id
      || contest.sceneId !== `${world.id}:${object.id}`
      || contest.attemptVersion !== state.version + 1
    ) {
      return rejection(state, tool, "contest_required", "Seizing an object from its established holder requires a current target-bound contest.", { objectId: object.id, holderId: establishedHolder.id });
    }
    if (contest.outcome !== "success") {
      return rejection(state, tool, "contest_failed", "The current contest did not transfer the held object.", { objectId: object.id, holderId: establishedHolder.id });
    }
    return null;
  };
  let message = "";
  let outcome = "world_object_interacted";
  switch (command.affordance) {
    case "open": {
      if (object.state === "locked") return rejection(state, tool, "object_locked", "The object is locked; unlock it before opening.", { objectId: object.id });
      const invalid = requireState(["closed", "unlocked"], "object_not_closed", "Only a closed or unlocked object can be opened.");
      if (invalid) return invalid;
      setObject(object.id, { state: "open" });
      message = "The engine opens " + object.definition.name + ".";
      outcome = "world_object_opened";
      break;
    }
    case "close": {
      const invalid = requireState(["open"], "object_not_open", "Only an open object can be closed.");
      if (invalid) return invalid;
      setObject(object.id, { state: "closed" });
      message = "The engine closes " + object.definition.name + ".";
      outcome = "world_object_closed";
      break;
    }
    case "lock": {
      const invalid = requireState(["closed", "unlocked"], "object_not_closed", "Only a closed or unlocked object can be locked.");
      if (invalid) return invalid;
      setObject(object.id, { state: "locked" });
      message = "The engine locks " + object.definition.name + ".";
      outcome = "world_object_locked";
      break;
    }
    case "unlock": {
      const invalid = requireState(["locked"], "object_not_locked", "Only a locked object can be unlocked.");
      if (invalid) return invalid;
      setObject(object.id, { state: "unlocked" });
      message = "The engine unlocks " + object.definition.name + ".";
      outcome = "world_object_unlocked";
      break;
    }
    case "move":
    case "carry":
    case "throw": {
      if (!command.destinationId) return rejection(state, tool, "destination_required", "That movement affordance needs a reviewed destination reference.");
      if (!worldObjectDestinationAllowed(world, command.destinationId)) return rejection(state, tool, "destination_not_found", "That object destination is not established in the current scene.", { destinationId: command.destinationId });
      if ((command.affordance === "carry" || command.affordance === "throw") && object.ownerRef.kind === "actor" && object.ownerRef.id !== context.actorId) {
        return rejection(state, tool, "ownership_required", "Only the owning actor can carry or throw this object.", { objectId: object.id });
      }
      const heldObjectRejection = heldObjectTransferRejection();
      if (heldObjectRejection) return heldObjectRejection;
      setObject(object.id, {
        locationRef: command.destinationId,
        ...(command.affordance === "carry" ? { ownerRef: { kind: "actor", id: context.actorId }, state: "carried" as const } : {}),
      });
      message = "The engine moves " + object.definition.name + " to " + command.destinationId + ".";
      outcome = "world_object_moved";
      break;
    }
    case "take":
    case "steal": {
      if (object.ownerRef.kind === "actor" && object.ownerRef.id === context.actorId) {
        return rejection(state, tool, "already_owned", "The acting character already owns that object.", { objectId: object.id });
      }
      if (!object.definition.criticalPolicy.canLose && command.affordance === "steal" && !establishedHolder) {
        return rejection(state, tool, "critical_object_protected", "This critical object cannot be lost through that interaction.", { objectId: object.id });
      }
      const heldObjectRejection = heldObjectTransferRejection();
      if (heldObjectRejection) return heldObjectRejection;
      setObject(object.id, { ownerRef: { kind: "actor", id: context.actorId }, locationRef: null, state: "carried" });
      message = "The engine records " + object.definition.name + " as carried by the acting character.";
      outcome = command.affordance === "take" ? "world_object_taken" : "world_object_stolen";
      break;
    }
    case "drop": {
      if (object.ownerRef.kind !== "actor" || object.ownerRef.id !== context.actorId) {
        return rejection(state, tool, "ownership_required", "Only the owning actor can drop this object.", { objectId: object.id });
      }
      if (!command.destinationId) return rejection(state, tool, "destination_required", "Dropping an object needs a reviewed destination reference.");
      if (!worldObjectDestinationAllowed(world, command.destinationId)) return rejection(state, tool, "destination_not_found", "That object destination is not established in the current scene.", { destinationId: command.destinationId });
      setObject(object.id, { ownerRef: { kind: "world", id: world.id }, locationRef: command.destinationId, state: "intact" });
      message = "The engine drops " + object.definition.name + " at " + command.destinationId + ".";
      outcome = "world_object_dropped";
      break;
    }
    case "equip": {
      if (object.ownerRef.kind !== "actor" || object.ownerRef.id !== context.actorId) return rejection(state, tool, "ownership_required", "Only the owning actor can equip this object.", { objectId: object.id });
      if (!object.definition.tags.includes("weapon") && !object.definition.tags.includes("armor")) return rejection(state, tool, "wrong_material", "Only an established weapon or armor object can be equipped.", { objectId: object.id });
      setObject(object.id, { state: "equipped" });
      message = "The engine equips " + object.definition.name + ".";
      outcome = "world_object_equipped";
      break;
    }
    case "ignite": {
      if (object.state === "lit") return rejection(state, tool, "already_lit", "That object is already lit.", { objectId: object.id });
      if (object.definition.material !== "fire" && (!source || source.state !== "lit" || (source.definition.material !== "fire" && !source.definition.tags.includes("fire-source")))) {
        return rejection(state, tool, "fire_source_required", "Ignition requires a lit fire source.", { objectId: object.id });
      }
      if (object.definition.material !== "oil" && !object.definition.tags.includes("flammable") && object.definition.material !== "fire") return rejection(state, tool, "wrong_material", "That material is not eligible for the reviewed ignition rule.", { objectId: object.id });
      setObject(object.id, { state: "lit" });
      message = "The engine ignites " + object.definition.name + ".";
      outcome = "world_object_ignited";
      break;
    }
    case "extinguish": {
      const invalid = requireState(["lit"], "object_not_lit", "Only a lit object can be extinguished.");
      if (invalid) return invalid;
      setObject(object.id, { state: "unlit" });
      message = "The engine extinguishes " + object.definition.name + ".";
      outcome = "world_object_extinguished";
      break;
    }
    case "damage":
    case "break": {
      if (!object.definition.criticalPolicy.canDestroy) return rejection(state, tool, "critical_object_protected", "This critical object cannot be destroyed under its declared policy.", { objectId: object.id });
      if (command.affordance === "break" && !object.definition.tags.includes("breakable")) return rejection(state, tool, "wrong_material", "That object is not declared breakable.", { objectId: object.id });
      const nextState = command.affordance === "break" || object.state === "damaged" ? "destroyed" : "damaged";
      setObject(object.id, { state: nextState });
      message = "The engine records " + object.definition.name + " as " + nextState + ".";
      outcome = nextState === "destroyed" ? "world_object_destroyed" : "world_object_damaged";
      break;
    }
    case "attach": {
      if (!source || source.id === object.id) return rejection(state, tool, "attachment_source_required", "Attaching requires a distinct referenced rope or tether object.");
      if (source.definition.material !== "rope" && !source.definition.tags.includes("rope")) return rejection(state, tool, "wrong_material", "Only a rope-tagged object can satisfy the attachment rule.", { objectId: source.id });
      if (source.state === "destroyed") return rejection(state, tool, "object_destroyed", "The referenced rope is destroyed.", { objectId: source.id });
      setObject(source.id, { state: "attached", ownerRef: object.ownerRef, locationRef: object.locationRef });
      setObject(object.id, { state: "attached" });
      message = "The engine attaches " + source.definition.name + " to " + object.definition.name + ".";
      outcome = "world_object_attached";
      break;
    }
    case "activate":
    case "use": {
      if (command.affordance === "use" && !object.definition.effectInteractions.some((interaction) => interaction.affordance === "use")) {
        return rejection(state, tool, "unsupported_affordance", "This object does not declare a reviewed use effect.", { objectId: object.id });
      }
      if (command.affordance === "activate" && object.state === "active") return rejection(state, tool, "already_active", "That object is already active.", { objectId: object.id });
      if (command.affordance === "activate" && !object.definition.tags.includes("lever") && !object.definition.tags.includes("switch")) return rejection(state, tool, "wrong_material", "Only a declared lever or switch can be activated.", { objectId: object.id });
      setObject(object.id, { state: command.affordance === "activate" ? "active" : object.state });
      for (const interaction of object.definition.effectInteractions.filter((candidate) => candidate.affordance === command.affordance)) {
        const target = nextWorld.objects.find((candidate) => candidate.id === interaction.targetId);
        if (!target) return rejection(state, tool, "effect_target_not_found", "The declared object effect target is not established in the current scene.", { targetId: interaction.targetId });
        if (target.state === "destroyed") return rejection(state, tool, "effect_target_destroyed", "The declared object effect target is destroyed.", { targetId: target.id });
        setObject(target.id, { state: interaction.targetState });
      }
      message = "The engine resolves " + command.affordance + " on " + object.definition.name + ".";
      outcome = "world_object_" + command.affordance;
      break;
    }
    case "give":
      return rejection(state, tool, "unsupported_affordance", "Giving a world object requires an actor or merchant inventory transfer; this first slice does not invent a second transfer path.");
  }
  const transitionedObject = nextWorld.objects.find((candidate) => candidate.id === object.id);
  if (transitionedObject && transitionedObject.ownerRef.kind === "actor" && transitionedObject.ownerRef.id === context.actorId) {
    const inventoryIssue = syncWorldObjectInventory(next, transitionedObject);
    if (inventoryIssue) return rejection(state, tool, inventoryIssue.code, inventoryIssue.message, { objectId: object.id });
  }
  if (command.affordance === "drop" || transitionedObject?.state === "destroyed") {
    next.character.inventory = next.character.inventory.filter((item) => item.id !== object.id);
  }
  if (JSON.stringify(beforeInventory) !== JSON.stringify(next.character.inventory)) {
    changes.push({ path: "/character/inventory", before: beforeInventory, after: next.character.inventory });
  }
  if (next.situation) {
    const beforeSituation = next.situation;
    next.situation = reconcileSituation(next.situation, next);
    if (JSON.stringify(beforeSituation) !== JSON.stringify(next.situation)) {
      next.situation.revision += 1;
      changes.push({
        path: "/situation",
        before: projectSituationForActor(state.situation!, state, context.actorId),
        after: projectSituationForActor(next.situation, next, context.actorId),
      });
    }
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { object: nextWorld.objects.find((candidate) => candidate.id === object.id), affordance: command.affordance, sourceId: command.sourceId ?? null, destinationId: command.destinationId ?? null, situation: next.situation ? projectSituationForActor(next.situation, next, context.actorId) : null },
    outcome,
    [],
    [],
    changes,
  );
}

function worldObjectTopologyValidation(
  objects: EngineWorldObjectInstance[],
  sceneId: string,
  actorId: string,
): WorldContextPatchValidation | null {
  if (hasDuplicateEntityId(objects)) return { code: "ambiguous_object_id", message: "World-object identifiers must remain unique." };
  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    if (object.sceneId !== sceneId) return { code: "object_scene_mismatch", message: "A world object references a different scene frame." };
    if (object.ownerRef.kind === "world" && object.ownerRef.id !== sceneId) {
      return { code: "object_owner_mismatch", message: "A world-owned object must reference its current scene." };
    }
    if (object.ownerRef.kind === "actor" && object.ownerRef.id !== actorId) {
      return { code: "object_owner_mismatch", message: "A world object cannot be owned by a different actor." };
    }
    if ((object.state === "carried" || object.state === "equipped") && object.ownerRef.kind !== "actor") {
      return { code: "object_owner_mismatch", message: "Carried or equipped objects must be actor-owned." };
    }
    if (object.containerRef) {
      const container = byId.get(object.containerRef);
      if (!container || !container.definition.tags.includes("container")) {
        return { code: "object_container_invalid", message: "A world object can only be contained by an established container object." };
      }
      if (container.id === object.id) return { code: "object_container_cycle", message: "A world object cannot contain itself." };
      if (object.locationRef !== null && object.locationRef !== container.id) {
        return { code: "object_location_mismatch", message: "An object's location and container references must agree." };
      }
    }
    if (object.state === "destroyed" && !object.definition.criticalPolicy.canDestroy) {
      return { code: "critical_object_protected", message: "A protected critical object cannot persist as destroyed." };
    }
  }
  return null;
}

function worldObjectDestinationAllowed(world: NonNullable<LanternCampaignState["worldContext"]>, destinationId: string): boolean {
  return destinationId === world.id
    || world.features.includes(destinationId)
    || world.objects.some((object) => object.id === destinationId && object.definition.tags.includes("container"));
}

function resolveCharacterCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "character_create" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.phase !== "character_creation" || state.character.created) {
    return rejection(state, tool, "character_locked", "Character creation is only available at the beginning of a campaign.");
  }

  const usesCanonicalOptions = Boolean(
    command.speciesKey
    || command.classKey
    || command.backgroundKey
    || command.alignmentKey
    || command.abilityScoreMethod
    || command.abilityScoreDraftId
    || command.abilityBonusChoices
    || command.skillKeys
    || command.languageKeys
    || command.toolProficiencies
  );
  if (usesCanonicalOptions && state.rulesVersion !== OPEN5E_RULES_VERSION) {
    return rejection(
      state,
      tool,
      "rules_version_mismatch",
      "This campaign is pinned to a different rules pack and must be migrated before using canonical character options."
    );
  }

  let nextCharacter: EngineCharacter;
  try {
    if (usesCanonicalOptions) {
      nextCharacter = createCanonicalCharacter(command, state.character.id, state.contentPolicy, state.characterCreation);
    } else {
      if (!command.species || !command.className) {
        return rejection(
          state,
          tool,
          "character_options_required",
          "Choose exact Open5e species and class keys, or provide both legacy preset fields."
        );
      }
      nextCharacter = createCharacter(
        command.name,
        command.species,
        command.className,
        state.character.id,
        true,
        command.background,
        command.alignment,
        command.abilityScores
      );
    }
  } catch (error) {
    if (error instanceof CharacterCreationError) {
      return rejection(state, tool, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "The character options could not be resolved.";
    return rejection(state, tool, "invalid_character_options", message);
  }
  const next = cloneCampaign(state);
  next.character = nextCharacter;
  next.characterCreation = { abilityScoreDraft: null };
  next.phase = "tutorial";
  next.tutorialStep = 0;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    nextCharacter.name + " is ready. The tutorial will teach the table, then the world is yours.",
    { character: characterData(nextCharacter) },
    "character_created",
    [],
    [],
    [{ path: "/character", before: state.character, after: nextCharacter }]
  );
}

function resolveInventoryTransfer(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "inventory_transfer" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const quantity = Number.isInteger(command.quantity) ? command.quantity : 1;
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (!isActorOwnedItem(item, state.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
  if (item.equipped) return rejection(state, tool, "item_equipped", "Unequip the item before moving it.");
  if (item.quantity < quantity) return rejection(state, tool, "quantity_unavailable", "You do not have that quantity.");
  if (item.runtimeContentInstanceId && quantity < item.quantity) {
    return rejection(state, tool, "runtime_item_stack_split_unsupported", "Move a runtime-created item stack as one canonical instance; partial splitting is not supported yet.");
  }

  const target = command.targetContainerId
    ? state.character.inventory.find((candidate) => candidate.id === command.targetContainerId)
    : null;
  if (command.targetContainerId && !target) return rejection(state, tool, "container_not_found", "That container is not in your inventory.");
  if (target && !isActorOwnedItem(target, state.character.id)) return rejection(state, tool, "container_not_owned", "You do not own that container.");
  if (target && target.id === item.id) return rejection(state, tool, "container_cycle", "An item cannot contain itself.");
  if (target) {
    const targetView = materializeInventoryItem(target);
    if (!isContainerItem(targetView)) return rejection(state, tool, "not_a_container", "That item is not a bounded container.");
    if (target.equipped) return rejection(state, tool, "container_equipped", "Unequip the container before moving items into it.");
    if (isDescendantOf(state.character.inventory, target.id, item.id)) {
      return rejection(state, tool, "container_cycle", "A container cannot be moved inside its own contents.");
    }
  }
  if (item.containerRef === (target?.id ?? undefined)) {
    return rejection(state, tool, "already_at_location", "That item is already at the requested location.");
  }
  if (quantity < item.quantity && isContainerItem(materializeInventoryItem(item)) && inventoryHasChildren(state.character.inventory, item.id)) {
    return rejection(state, tool, "container_stack_split", "A non-empty container stack cannot be split.");
  }

  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => ({
    ...candidate,
    ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
  }));
  const source = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!source) return rejection(state, tool, "item_not_found", "That item is no longer in your inventory.");
  const movedQuantity = quantity;
  let moved: EngineInventoryItem;
  if (movedQuantity === source.quantity) {
    source.containerRef = target?.id;
    moved = source;
  } else {
    source.quantity -= movedQuantity;
    moved = {
      ...source,
      id: randomUUID(),
      quantity: movedQuantity,
      containerRef: target?.id,
      equipped: false,
      slot: undefined,
    };
    next.character.inventory.push(moved);
  }
  const topologyIssue = inventoryTopologyIssue(next.character.inventory, next.character.id);
  if (topologyIssue) return rejection(state, tool, topologyIssue.code, topologyIssue.message);
  const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
  if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    target ? `You place ${movedQuantity} × ${materializeInventoryItem(item).name} in the ${materializeInventoryItem(target).name}.` : `You move ${movedQuantity} × ${materializeInventoryItem(item).name} to your carried inventory.`,
    { item: materializeInventoryItem(moved), inventory: materializeInventory(next.character.inventory), character: characterData(next.character) },
    "inventory_transferred",
    [],
    [],
    [{ path: "/character/inventory", before: state.character.inventory, after: next.character.inventory }],
  );
}

function resolveEquipItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "equip_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (!isActorOwnedItem(item, state.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
  if (item.containerRef) return rejection(state, tool, "item_in_container", "Remove the item from its container before equipping it.");
  const itemView = materializeInventoryItem(item);
  if (itemView.kind !== "weapon" && itemView.kind !== "armor" && itemView.effectKey !== "lantern-ward-v1") {
    return rejection(state, tool, "not_equipment", "Only weapons, armor, and reviewed magic items can be equipped.");
  }
  if (!itemExecutionAllowed(itemView, "equip")) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      "That item's supplied or catalog mechanics are not reviewed for equipment execution."
    );
  }
  if (itemView.attunementRequired && !item.attuned) return rejection(state, tool, "attunement_required", "Attune to that item before equipping it.");
  if (itemView.effectKey === "lantern-ward-v1" && (itemView.charges?.current ?? item.charges?.current ?? 0) <= 0) {
    return rejection(state, tool, "charges_depleted", "That magic item's charges are depleted.");
  }
  const slotIssue = equipmentSlotIssue(itemView, command.slot);
  if (slotIssue) return rejection(state, tool, slotIssue.code, slotIssue.message);
  const conflict = equipmentConflict(state.character.inventory, itemView, command.slot, item.id);
  if (conflict) return rejection(state, tool, conflict.code, conflict.message);
  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => ({
    ...candidate,
    ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
  }));
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  for (const displaced of state.character.inventory.filter((candidate) => candidate.equipped && candidate.slot === command.slot && candidate.id !== item.id)) {
    const displacedView = materializeInventoryItem(displaced);
    if (displacedView.effectKey) removeRuntimeSource(next, `item:${displaced.id}`, changes);
  }
  next.character.inventory = next.character.inventory.map((candidate) => {
    if (candidate.slot !== command.slot) return candidate;
    return { ...candidate, equipped: false };
  });
  const equipped = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!equipped) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  equipped.slot = command.slot;
  equipped.equipped = true;
  if (itemView.effectKey === "lantern-ward-v1") {
    applyRuntimeEffect(
      next,
      effectInput(
        next,
        itemView.effectKey,
        `item:${item.id}`,
        [next.character.id],
        [{ kind: "stat-modifier", stat: "armor-class", value: 1, stackingKey: "magic:lantern-ward-v1" }],
        { kind: "persistent" },
        "magic:lantern-ward-v1",
        "ignore",
        ["source-removal"],
        clientCommandId,
      ),
      changes,
    );
  }
  next.character.ac = deriveArmorClass(next.character, next.effects);
  return commit(next, context, clientCommandId, command, tool, "You equip the " + itemView.name + ".", { item: materializeInventoryItem(equipped), character: characterData(next.character) }, "item_equipped", [], [], [
    { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
    { path: "/character/ac", before: state.character.ac, after: next.character.ac },
    ...changes,
  ]);
}

function resolveUnequipItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "unequip_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (!isActorOwnedItem(item, state.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
  if (!item.equipped) return rejection(state, tool, "item_not_equipped", "That item is not equipped.");
  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => ({
    ...candidate,
    ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
  }));
  const target = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (target) target.equipped = false;
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const itemView = materializeInventoryItem(item);
  if (itemView.effectKey) removeRuntimeSource(next, `item:${item.id}`, changes);
  next.character.ac = deriveArmorClass(next.character, next.effects);
  return commit(next, context, clientCommandId, command, tool, "You unequip the " + materializeInventoryItem(item).name + ".", { item: target ? materializeInventoryItem(target) : null, character: characterData(next.character) }, "item_unequipped", [], [], [
    { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
    { path: "/character/ac", before: state.character.ac, after: next.character.ac },
    ...changes,
  ]);
}

function resolveDropItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "drop_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (!isActorOwnedItem(item, state.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
  if (item.quantity < command.quantity) return rejection(state, tool, "quantity_unavailable", "You do not have that quantity.");
  if (item.equipped && command.quantity >= item.quantity) return rejection(state, tool, "item_equipped", "Unequip the item before dropping it.");
  if (isContainerItem(materializeInventoryItem(item)) && inventoryHasChildren(state.character.inventory, item.id)) {
    return rejection(state, tool, "container_not_empty", "Empty a container before dropping it.");
  }
  const next = cloneCampaign(state);
  const target = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (target) target.quantity -= command.quantity;
  next.character.inventory = next.character.inventory.filter((candidate) => candidate.quantity > 0);
  return commit(next, context, clientCommandId, command, tool, "You drop " + command.quantity + " × " + materializeInventoryItem(item).name + ".", { itemId: item.id, quantity: command.quantity, inventory: materializeInventory(next.character.inventory) }, "item_dropped", [], [], [
    { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
  ]);
}

function resolveTutorialAdvance(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "tutorial_advance" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (!state.character.created) return rejection(state, tool, "character_required", "Create your character before entering the tutorial.");
  if (state.phase !== "tutorial") return rejection(state, tool, "tutorial_not_active", "The tutorial is not the current chapter of this campaign.");

  const next = cloneCampaign(state);
  if (state.tutorialStep < 1) {
    next.tutorialStep = 1;
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "The first rule is simple: describe what you try, and the world will answer.",
      { phase: next.phase, tutorialStep: next.tutorialStep },
      "tutorial_advanced",
      [],
      [],
      [{ path: "/tutorialStep", before: state.tutorialStep, after: next.tutorialStep }]
    );
  }

  next.phase = "sandbox";
  next.tutorialStep = 2;
  next.quest = {
    id: "first-light",
    title: "The first chapter",
    objective: "Follow the consequences of your choices and decide what your world becomes.",
    status: "active",
    reward: { xp: 50, copper: 1_200 },
    rewardClaimed: false,
    progress: 0,
  };
  next.quests = next.quests.map((quest) => quest.id === next.quest.id ? next.quest : quest);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The tutorial ends here. The world is open now; choose a direction and make it yours.",
    { phase: next.phase, tutorialStep: next.tutorialStep },
    "tutorial_completed",
    [],
    [],
    [
      { path: "/phase", before: state.phase, after: next.phase },
      { path: "/tutorialStep", before: state.tutorialStep, after: next.tutorialStep },
    ]
  );
}

type DerivedCheck = {
  modifier: number;
  skill: string | null;
  tool: string | null;
  proficiency: boolean;
  expertise: boolean;
  modifierSources: string[];
};

function deriveCheck(
  state: LanternCampaignState,
  ability: EngineAbility,
  skill: string | null,
  tool: string | null,
  rejectionTool: EngineToolName | "declare" | "listen"
): DerivedCheck | EngineResolution {
  const skillEntry = skill ? state.character.skills[skill] : undefined;
  if (skill && !skillEntry) return rejection(state, rejectionTool, "unknown_skill", `No reviewed skill is established for ${skill}.`);
  if (skillEntry && skillEntry.ability !== ability) {
    return rejection(state, rejectionTool, "skill_ability_mismatch", `${skill} is resolved from ${skillEntry.ability}, not ${ability}.`);
  }
  const normalizedTool = tool?.trim().toLocaleLowerCase("en-US") || null;
  const hasToolProficiency = normalizedTool !== null && state.character.proficiencies.tools.some((candidate) => candidate.trim().toLocaleLowerCase("en-US") === normalizedTool);
  if (normalizedTool && !hasToolProficiency) return rejection(state, rejectionTool, "tool_proficiency_required", `The character is not proficient with ${tool}.`);
  const base = abilityModifier(state.character.abilities[ability]);
  const modifierSources = [ability + "_modifier"];
  let modifier = base;
  const proficiency = Boolean(skillEntry?.proficient);
  const expertise = Boolean(skillEntry?.expertise);
  if (proficiency) {
    modifier += state.character.proficiencyBonus;
    modifierSources.push("proficiency");
  }
  if (expertise) {
    modifier += state.character.proficiencyBonus;
    modifierSources.push("expertise");
  }
  if (hasToolProficiency) {
    modifier += state.character.proficiencyBonus;
    modifierSources.push("tool_proficiency");
  }
  return { modifier, skill, tool, proficiency, expertise, modifierSources };
}

function resolveCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "roll_check" }> | Extract<EngineCommand, { kind: "listen" }>,
  tool: EngineToolName | "declare" | "listen",
  ability: EngineAbility,
  skill: string | null,
  goal: string,
  adjudication?: EngineAdjudicationDecision,
  persistedCommand?: EngineCommand
): EngineResolution {
  const derived = deriveCheck(state, ability, skill, adjudication?.tool ?? null, tool);
  if ("accepted" in derived) return derived;
  const pressureChallengeId = adjudication?.challengeId
    ?? (command.kind === "roll_check" && skill?.toLocaleLowerCase("en-US") === "stealth" ? "ability-check:stealth" : null);
  const pressureSceneId = adjudication?.sceneId ?? state.worldContext?.id ?? "campaign-scene";
  const existingPressure = pressureChallengeId
    ? failurePressureFor(state, context.actorId, pressureChallengeId, pressureSceneId)
    : null;
  if (existingPressure?.status === "compromised") {
    return failurePressureRejection(state, tool, existingPressure, adjudication);
  }
  const modifierQuery = queryModifiers(state.effects, state.character.id, "ability-check");
  const advantageSources = [...modifierQuery.effectIds];
  if (adjudication?.helperId) advantageSources.push("helper:" + adjudication.helperId);
  const disadvantageSources = modifierQuery.disadvantage > 0 ? [...modifierQuery.effectIds] : [];
  const advantageCount = modifierQuery.advantage + (adjudication?.helperId ? 1 : 0);
  const disadvantageCount = modifierQuery.disadvantage;
  const mode: EngineCheckEvidence["mode"] = advantageCount > 0 && disadvantageCount > 0
    ? "cancelled"
    : advantageCount > 0 ? "advantage" : disadvantageCount > 0 ? "disadvantage" : "normal";
  const passive = command.kind === "roll_check" && command.passive === true;
  const firstRoll = passive ? 10 : randomInt(1, 21);
  const secondRoll = !passive && mode !== "normal" && mode !== "cancelled" ? randomInt(1, 21) : null;
  const roll = secondRoll === null
    ? firstRoll
    : mode === "advantage" ? Math.max(firstRoll, secondRoll) : Math.min(firstRoll, secondRoll);
  const dc = adjudication?.dc ?? (state.combat.status === "active" ? 14 : 12);
  const total = roll + derived.modifier;
  const success = total >= dc;
  const adjudicationOutcome: EngineAdjudicationOutcome | null = adjudication
    ? success ? "success" : "failure-with-complication"
    : null;
  const outcome = adjudicationOutcome ?? (success ? "success" : "failure");
  const label = ability.toUpperCase() + (skill ? " (" + skill + ")" : "");
  const publicText = passive
    ? "You make a passive " + label + " check: " + total + " against DC " + dc + ". " + (success ? "Success." : "Failure.")
    : "You make a " + label + " check: d20 " + roll + " " + signed(derived.modifier) + " = " + total + " against DC " + dc + ". " + (success ? "Success." : "Failure.");
  const withheld = adjudication?.informationPolicy === "withheld";
  const text = withheld ? "The check resolves, but its details are withheld." : publicText;
  const check: EngineCheckEvidence = {
    kind: "ability-check",
    actorId: context.actorId,
    ability,
    skill: derived.skill,
    tool: derived.tool,
    proficiency: derived.proficiency,
    expertise: derived.expertise,
    modifier: derived.modifier,
    modifierSources: [...derived.modifierSources],
    advantageSources,
    disadvantageSources,
    mode,
    ...(adjudication?.helperId ? { helperId: adjudication.helperId } : {}),
    informationPolicy: adjudication?.informationPolicy ?? "public",
    formulaRevision: "checks-v1",
  };
  const next = cloneCampaign(state);
  next.lastRoll = roll;
  const attemptChange = adjudication && adjudicationOutcome
    ? appendAdjudicationAttempt(next, state, adjudication, adjudicationOutcome, roll, total).change
    : null;
  const pressureResult = pressureChallengeId
    ? applyFailurePressure(next, state, context.actorId, pressureChallengeId, pressureSceneId, !success)
    : { pressure: null, changes: [] };
  const fullData = { ability, skill, goal, dc, roll, modifier: derived.modifier, total, success, ...(adjudication ? { adjudication, costs: adjudication.costs, outcome } : {}), failurePressure: pressureResult.pressure };
  const data = withheld ? { informationPolicy: "withheld", outcome } : fullData;
  const resolvedText = text + (success ? "" : (failurePressureMessage(pressureResult.pressure) ?? ""));
  return commit(
    next,
    context,
    clientCommandId,
    persistedCommand ?? command,
    tool,
    resolvedText,
    data,
    outcome,
    [
      { kind: passive ? "passive_score" : "d20", value: roll, sides: passive ? undefined : 20 },
      ...(secondRoll === null ? [] : [{ kind: `d20_${mode}`, value: secondRoll, sides: 20 }]),
    ],
    [{ name: ability + "_modifier", value: derived.modifier }, { name: "dc", value: dc }],
    [
      { path: "/lastRoll", before: state.lastRoll, after: roll },
      ...(attemptChange ? [attemptChange] : []),
      ...pressureResult.changes,
    ],
    [],
    adjudication,
    check
  );
}

const TACTICAL_CELL_FEET = 5;
const TACTICAL_REACH_FEET = 5;
const MAX_TACTICAL_CELLS = 40_000;

type TacticalCell = { x: number; y: number };
type TacticalIssue = { code: string; message: string };

interface ReviewedTacticalZoneDefinition {
  key: EngineTacticalZoneDefinitionKey;
  name: string;
  anchorKind: "stationary" | "actor";
  radiusFeet: 10;
  durationRounds: 3;
  operations: EngineEffectOperation[];
  stackingKey: string;
}

const REVIEWED_TACTICAL_ZONE_DEFINITIONS: Record<EngineTacticalZoneDefinitionKey, ReviewedTacticalZoneDefinition> = {
  "hindering-circle-v1": {
    key: "hindering-circle-v1",
    name: "Hindering circle",
    anchorKind: "stationary",
    radiusFeet: 10,
    durationRounds: 3,
    operations: [{ kind: "disadvantage", category: "ability-check" }],
    stackingKey: "tactical-zone:hindering-circle:ability-check",
  },
  "guiding-aura-v1": {
    key: "guiding-aura-v1",
    name: "Guiding aura",
    anchorKind: "actor",
    radiusFeet: 10,
    durationRounds: 3,
    operations: [{ kind: "advantage", category: "ability-check" }],
    stackingKey: "tactical-zone:guiding-aura:ability-check",
  },
};

function reviewedTacticalZoneDefinition(value: string): ReviewedTacticalZoneDefinition | null {
  return value === "hindering-circle-v1" || value === "guiding-aura-v1"
    ? REVIEWED_TACTICAL_ZONE_DEFINITIONS[value]
    : null;
}

export function fiveESimpleDistanceFeet(
  from: EngineTacticalPosition,
  to: EngineTacticalPosition,
): number {
  if (from.frameId !== to.frameId || from.z !== 0 || to.z !== 0) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) * TACTICAL_CELL_FEET;
}

function defaultTacticalBounds(maxDistanceCells: number): EngineTacticalBounds {
  return {
    minX: -20,
    maxX: Math.max(20, maxDistanceCells + 4),
    minY: -20,
    maxY: 20,
  };
}

function buildCombatTacticalState(
  input: EngineTacticalGeometryInput | undefined,
  encounterId: string,
  _actorId: string,
  maxDistanceCells: number,
): { tactical: EngineCombatTacticalState } | TacticalIssue {
  const frameId = input?.frameId ?? encounterId;
  const actorPosition = input?.playerPosition ?? { frameId, x: 0, y: 0, z: 0 };
  const geometry: EngineTacticalGeometry = {
    frameId,
    revision: 1,
    metric: "five_e_simple",
    bounds: input?.bounds ?? defaultTacticalBounds(maxDistanceCells),
    obstacles: (input?.obstacles ?? []).map((obstacle) => ({
      ...obstacle,
      width: obstacle.width ?? 1,
      height: obstacle.height ?? 1,
    })),
    difficultTerrain: (input?.difficultTerrain ?? []).map((terrain) => ({
      ...terrain,
      width: terrain.width ?? 1,
      height: terrain.height ?? 1,
      costFeet: terrain.costFeet ?? 10,
    })),
  };
  const geometryIssue = validateTacticalGeometry(geometry);
  if (geometryIssue) return geometryIssue;
  const positionIssue = validatePositionFrame(actorPosition, frameId);
  if (positionIssue) return positionIssue;
  const footprint: EngineTacticalFootprint = { width: 1, height: 1 };
  const fitIssue = positionFitsGeometry(actorPosition, footprint, geometry, []);
  if (fitIssue) return fitIssue;
  return {
    tactical: {
      geometry,
      movementMode: "walking",
      actorPosition: { ...actorPosition },
      actorFootprint: footprint,
      lastPlan: null,
      zones: [],
      zoneIntegrityIssue: null,
    },
  };
}

function validateTacticalGeometry(geometry: EngineTacticalGeometry): TacticalIssue | null {
  const { minX, maxX, minY, maxY } = geometry.bounds;
  if (![minX, maxX, minY, maxY].every(Number.isInteger) || minX > maxX || minY > maxY) {
    return { code: "invalid_tactical_bounds", message: "Tactical bounds must be ordered integer cell coordinates." };
  }
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isSafeInteger(area) || area > MAX_TACTICAL_CELLS) {
    return { code: "tactical_geometry_too_large", message: "The first tactical slice supports at most 40,000 bounded cells." };
  }
  const ids = new Set<string>();
  for (const obstacle of geometry.obstacles) {
    const issue = validateRectangle(obstacle, geometry.bounds, ids, "obstacle");
    if (issue) return issue;
  }
  const terrainIds = new Set<string>();
  for (const terrain of geometry.difficultTerrain) {
    const issue = validateRectangle(terrain, geometry.bounds, terrainIds, "terrain");
    if (issue) return issue;
    if (!Number.isInteger(terrain.costFeet) || terrain.costFeet < TACTICAL_CELL_FEET || terrain.costFeet % TACTICAL_CELL_FEET !== 0) {
      return { code: "invalid_difficult_terrain", message: "Difficult-terrain cost must be a positive multiple of 5 feet." };
    }
  }
  return null;
}

function validateRectangle(
  rectangle: { id: string; x: number; y: number; width: number; height: number },
  bounds: EngineTacticalBounds,
  ids: Set<string>,
  kind: "obstacle" | "terrain",
): TacticalIssue | null {
  if (ids.has(rectangle.id)) return { code: "duplicate_tactical_geometry_id", message: `${kind} ids must be unique.` };
  ids.add(rectangle.id);
  if (![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isInteger) || rectangle.width < 1 || rectangle.height < 1) {
    return { code: "invalid_tactical_geometry", message: `${kind} dimensions must be positive integer cells.` };
  }
  if (
    rectangle.x < bounds.minX
    || rectangle.y < bounds.minY
    || rectangle.x + rectangle.width - 1 > bounds.maxX
    || rectangle.y + rectangle.height - 1 > bounds.maxY
  ) {
    return { code: "tactical_geometry_out_of_bounds", message: `${kind} must be contained by tactical bounds.` };
  }
  return null;
}

function validatePositionFrame(position: EngineTacticalPosition, frameId: string): TacticalIssue | null {
  if (position.frameId !== frameId) return { code: "tactical_frame_mismatch", message: "The position belongs to a different tactical frame." };
  if (![position.x, position.y, position.z].every(Number.isInteger)) {
    return { code: "invalid_tactical_position", message: "Tactical positions must use integer cell coordinates." };
  }
  if (position.z !== 0) return { code: "tactical_z_unsupported", message: "Walking movement is limited to z=0 in this tactical slice." };
  return null;
}

function positionCells(position: EngineTacticalPosition, footprint: EngineTacticalFootprint): TacticalCell[] {
  const cells: TacticalCell[] = [];
  for (let dx = 0; dx < footprint.width; dx += 1) {
    for (let dy = 0; dy < footprint.height; dy += 1) cells.push({ x: position.x + dx, y: position.y + dy });
  }
  return cells;
}

function cellKey(cell: TacticalCell): string {
  return `${cell.x},${cell.y}`;
}

function rectangleCells(rectangle: { x: number; y: number; width: number; height: number }): Set<string> {
  const cells = new Set<string>();
  for (let dx = 0; dx < rectangle.width; dx += 1) {
    for (let dy = 0; dy < rectangle.height; dy += 1) cells.add(cellKey({ x: rectangle.x + dx, y: rectangle.y + dy }));
  }
  return cells;
}

type TacticalPoint = { x: number; y: number };

function footprintCorners(position: EngineTacticalPosition, footprint: EngineTacticalFootprint): TacticalPoint[] {
  return [
    { x: position.x, y: position.y },
    { x: position.x + footprint.width, y: position.y },
    { x: position.x, y: position.y + footprint.height },
    { x: position.x + footprint.width, y: position.y + footprint.height },
  ];
}

function segmentIntersectsObstacleInterior(
  from: TacticalPoint,
  to: TacticalPoint,
  obstacle: EngineTacticalObstacle,
): boolean {
  const epsilon = 1e-9;
  const minimum = { x: obstacle.x + epsilon, y: obstacle.y + epsilon };
  const maximum = { x: obstacle.x + obstacle.width - epsilon, y: obstacle.y + obstacle.height - epsilon };
  const delta = { x: to.x - from.x, y: to.y - from.y };
  let entry = 0;
  let exit = 1;
  for (const axis of ["x", "y"] as const) {
    if (Math.abs(delta[axis]) < epsilon) {
      if (from[axis] <= minimum[axis] || from[axis] >= maximum[axis]) return false;
      continue;
    }
    const first = (minimum[axis] - from[axis]) / delta[axis];
    const second = (maximum[axis] - from[axis]) / delta[axis];
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return false;
  }
  return exit > epsilon && entry < 1 - epsilon;
}

export function deriveTacticalCover(
  geometry: EngineTacticalGeometry,
  attackerPosition: EngineTacticalPosition,
  attackerFootprint: EngineTacticalFootprint,
  targetPosition: EngineTacticalPosition,
  targetFootprint: EngineTacticalFootprint,
): EngineTacticalCover {
  const attackerCorners = footprintCorners(attackerPosition, attackerFootprint);
  const targetCorners = footprintCorners(targetPosition, targetFootprint);
  const candidates = attackerCorners.map((attackerCorner) => ({
    attackerCorner,
    blockedTargetCorners: targetCorners.filter((targetCorner) =>
      geometry.obstacles.some((obstacle) => segmentIntersectsObstacleInterior(attackerCorner, targetCorner, obstacle))
    ).length,
  }));
  const best = candidates.reduce((selected, candidate) =>
    candidate.blockedTargetCorners < selected.blockedTargetCorners ? candidate : selected
  );
  const level = best.blockedTargetCorners === 0
    ? "none"
    : best.blockedTargetCorners <= 2
      ? "half"
      : best.blockedTargetCorners === 3
        ? "three_quarters"
        : "total";
  return {
    geometryRevision: geometry.revision,
    level,
    armorClassBonus: level === "none" ? 0 : level === "half" ? 2 : level === "three_quarters" ? 5 : null,
    blockedTargetCorners: best.blockedTargetCorners,
    attackerCorner: best.attackerCorner,
  };
}

function incomingCharacterCover(
  state: LanternCampaignState,
  attacker: EngineCombatant,
  targetPosition: EngineTacticalPosition = state.combat.tactical.actorPosition,
): EngineTacticalCover {
  return deriveTacticalCover(
    state.combat.tactical.geometry,
    attacker.position,
    attacker.footprint,
    targetPosition,
    state.combat.tactical.actorFootprint,
  );
}

function characterArmorClassWithCover(state: LanternCampaignState, cover: EngineTacticalCover): number {
  return state.character.ac + (cover.armorClassBonus ?? 0);
}

type CompiledAreaOperation = Extract<CompiledEffectProgram["operations"][number], { kind: "area" }>;

function reviewedTacticalSpellArea(
  spell: NonNullable<ReturnType<typeof getOpen5eSpell>>,
): CompiledEffectProgram | TacticalIssue | null {
  const candidates = spell.effects.filter((program) => program.executionMode === "spell-area");
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) {
    return { code: "ambiguous_tactical_area", message: `${spell.definition.name} has more than one compiled area program.` };
  }
  const program = candidates[0]!;
  const operations = program.operations.filter((operation): operation is CompiledAreaOperation => operation.kind === "area");
  if (operations.length !== 1) {
    return { code: "invalid_tactical_area_program", message: `${spell.definition.name} does not have one exact compiled area operation.` };
  }
  return program;
}

function tacticalAimIssue(position: EngineTacticalPosition, geometry: EngineTacticalGeometry): TacticalIssue | null {
  const frameIssue = validatePositionFrame(position, geometry.frameId);
  if (frameIssue) return frameIssue;
  if (
    position.x < geometry.bounds.minX
    || position.x > geometry.bounds.maxX
    || position.y < geometry.bounds.minY
    || position.y > geometry.bounds.maxY
  ) {
    return { code: "tactical_area_aim_out_of_bounds", message: "The tactical area aim must remain within the encounter bounds." };
  }
  return null;
}

export function deriveTacticalCircleCells(
  geometry: EngineTacticalGeometry,
  center: EngineTacticalPosition,
  radiusFeet: number,
): EngineTacticalPosition[] | TacticalIssue {
  const centerIssue = tacticalAimIssue(center, geometry);
  if (centerIssue) return centerIssue;
  if (!Number.isInteger(radiusFeet) || radiusFeet < TACTICAL_CELL_FEET || radiusFeet % TACTICAL_CELL_FEET !== 0) {
    return { code: "unsupported_tactical_area", message: "Tactical circles require a reviewed whole-cell radius measured in feet." };
  }
  const cells: EngineTacticalPosition[] = [];
  for (let y = geometry.bounds.minY; y <= geometry.bounds.maxY; y += 1) {
    for (let x = geometry.bounds.minX; x <= geometry.bounds.maxX; x += 1) {
      const cell = { frameId: geometry.frameId, x, y, z: 0 };
      if (fiveESimpleDistanceFeet(center, cell) <= radiusFeet) cells.push(cell);
    }
  }
  return cells;
}

function tacticalActorIdsInCells(
  geometry: EngineTacticalGeometry,
  primaryActor: { id: string; position: EngineTacticalPosition; footprint: EngineTacticalFootprint; eligible: boolean },
  enemies: EngineCombatant[],
  controlledActors: EngineControlledActor[],
  cells: EngineTacticalPosition[],
): string[] {
  const includedCells = new Set(cells.map(cellKey));
  return [
    ...(primaryActor.eligible && positionCells(primaryActor.position, primaryActor.footprint).some((cell) => includedCells.has(cellKey(cell)))
      ? [primaryActor.id]
      : []),
    ...enemies
      .filter((enemy) => enemy.alive && positionCells(enemy.position, enemy.footprint).some((cell) => includedCells.has(cellKey(cell))))
      .map((enemy) => enemy.id),
    ...controlledActors
      .filter((actor) => actor.status === "active"
        && actor.hp > 0
        && actor.position.frameId === geometry.frameId
        && positionCells(actor.position, actor.footprint).some((cell) => includedCells.has(cellKey(cell))))
      .map((actor) => actor.id),
  ];
}

export function deriveTacticalAreaSnapshot(
  geometry: EngineTacticalGeometry,
  casterId: string,
  casterPosition: EngineTacticalPosition,
  casterFootprint: EngineTacticalFootprint,
  enemies: EngineCombatant[],
  controlledActors: EngineControlledActor[],
  aim: EngineTacticalPosition,
  program: CompiledEffectProgram,
  aimRangeFeet: number,
): EngineTacticalAreaSnapshot | TacticalIssue {
  const aimIssue = tacticalAimIssue(aim, geometry);
  if (aimIssue) return aimIssue;
  const operations = program.operations.filter((operation): operation is CompiledAreaOperation => operation.kind === "area");
  if (operations.length !== 1) {
    return { code: "invalid_tactical_area_program", message: "Tactical resolution requires one exact compiled area operation." };
  }
  const operation = operations[0]!;
  if (!Number.isInteger(operation.size) || operation.size < TACTICAL_CELL_FEET || operation.size % TACTICAL_CELL_FEET !== 0 || operation.unit.toLocaleLowerCase("en-US") !== "feet") {
    return { code: "unsupported_tactical_area", message: "Tactical areas require a reviewed whole-cell size measured in feet." };
  }
  if (operation.shape !== "sphere" && operation.shape !== "cone" && operation.shape !== "line") {
    return { code: "unsupported_tactical_area", message: `The ${operation.shape} area shape is not part of the reviewed #139 slice.` };
  }
  if (operation.shape === "line" && operation.width !== TACTICAL_CELL_FEET) {
    return { code: "unsupported_tactical_area", message: "The reviewed tactical line must be exactly 5 feet wide." };
  }

  const origin = { ...casterPosition };
  const deltaX = aim.x - casterPosition.x;
  const deltaY = aim.y - casterPosition.y;
  if (operation.shape === "sphere") {
    if (fiveESimpleDistanceFeet(casterPosition, aim) > aimRangeFeet) {
      return { code: "spell_area_out_of_range", message: `The chosen area origin is beyond the spell's ${aimRangeFeet}-foot range.` };
    }
  } else if (
    (deltaX === 0 && deltaY === 0)
    || !(deltaX === 0 || deltaY === 0 || Math.abs(deltaX) === Math.abs(deltaY))
  ) {
    return { code: "invalid_tactical_area_direction", message: "Cone and line aims must choose one cardinal or diagonal grid direction." };
  }

  const circleCells = operation.shape === "sphere"
    ? deriveTacticalCircleCells(geometry, aim, operation.size)
    : null;
  if (circleCells && "code" in circleCells) return circleCells;
  const cells: EngineTacticalPosition[] = circleCells ?? [];
  if (operation.shape !== "sphere") {
    const directionX = Math.sign(deltaX);
    const directionY = Math.sign(deltaY);
    const directionLength = Math.hypot(directionX, directionY) || 1;
    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    for (let y = geometry.bounds.minY; y <= geometry.bounds.maxY; y += 1) {
      for (let x = geometry.bounds.minX; x <= geometry.bounds.maxX; x += 1) {
        const cell = { frameId: geometry.frameId, x, y, z: 0 };
        const relativeX = x - casterPosition.x;
        const relativeY = y - casterPosition.y;
        const forward = relativeX * unitX + relativeY * unitY;
        const lateral = Math.abs(relativeX * unitY - relativeY * unitX);
        const withinLength = forward > 0
          && fiveESimpleDistanceFeet(casterPosition, cell) <= operation.size;
        const included = operation.shape === "line"
          ? withinLength && lateral <= 0.5
          : withinLength && lateral <= forward / 2 + 0.5;
        if (included) cells.push(cell);
      }
    }
  }
  const targetIds = tacticalActorIdsInCells(
    geometry,
    { id: casterId, position: casterPosition, footprint: casterFootprint, eligible: true },
    enemies,
    controlledActors,
    cells,
  );
  return {
    geometryRevision: geometry.revision,
    frameId: geometry.frameId,
    sourceShape: operation.shape,
    shape: operation.shape === "sphere" ? "circle" : operation.shape,
    sizeFeet: operation.size,
    widthFeet: operation.width,
    origin,
    aim: { ...aim },
    cells,
    targetIds,
    programContentKey: program.contentKey,
  };
}

interface TacticalZoneTransition {
  zoneId: string;
  definitionKey: EngineTacticalZoneDefinitionKey;
  revision: number;
  center: EngineTacticalPosition;
  enteredActorIds: string[];
  leftActorIds: string[];
  affectedActorIds: string[];
  status: EngineTacticalZone["status"];
  endedReason: EngineTacticalZoneEndReason | null;
}

interface TacticalZoneReconcileResult {
  beforeZones: EngineTacticalZone[];
  beforeEffects: EngineEffectInstance[];
  transitions: TacticalZoneTransition[];
}

function tacticalZoneStateIssue(
  state: LanternCampaignState,
  validateEffectProjection: boolean,
): TacticalIssue | null {
  if (state.combat.tactical.zoneIntegrityIssue) return state.combat.tactical.zoneIntegrityIssue;
  if (validateEffectProjection && state.combat.status !== "active" && state.combat.tactical.zones.some((zone) => zone.status === "active")) {
    return tacticalZoneIntegrityIssue("invalid_tactical_zone_shape");
  }
  const activeZoneIds = new Set<string>();
  const activeDefinitionKeys = new Set<EngineTacticalZoneDefinitionKey>();
  for (const zone of state.combat.tactical.zones) {
    if (zone.status !== "active") continue;
    const definition = reviewedTacticalZoneDefinition(zone.definitionKey);
    if (
      activeZoneIds.has(zone.id)
      || activeDefinitionKeys.has(zone.definitionKey)
    ) return tacticalZoneIntegrityIssue("invalid_tactical_zone_shape");
    activeZoneIds.add(zone.id);
    activeDefinitionKeys.add(zone.definitionKey);
    if (zone.geometryRevision !== state.combat.tactical.geometry.revision) {
      return { code: "stale_tactical_geometry", message: "An active tactical zone references stale geometry; the command cannot mutate state." };
    }
    if (zone.source.actorId !== state.actorId || zone.source.ref !== `actor:${state.actorId}`) {
      return { code: "invalid_tactical_zone_source", message: "An active tactical zone has an invalid source; the command cannot mutate state." };
    }
    if (
      !zone.provenance.sourceCommandId.trim()
      || !Number.isInteger(zone.provenance.sourceVersion)
      || zone.provenance.sourceVersion < 0
      || zone.provenance.sourceVersion > state.version
      || !installedTacticalZoneRulesVersion(zone.provenance.rulesVersion)
      || zone.provenance.definitionRevision !== "tactical-zones-v1"
    ) {
      return { code: "invalid_tactical_zone_source", message: "An active tactical zone has impossible creation provenance; the command cannot mutate state." };
    }
    if (
      !definition
      || zone.shape.kind !== "circle"
      || zone.shape.radiusFeet !== definition.radiusFeet
      || zone.duration.kind !== "rounds"
      || zone.duration.amount !== definition.durationRounds
      || zone.duration.startedRound > state.combat.round
      || zone.duration.expiresAtRound !== zone.duration.startedRound + definition.durationRounds
      || (definition.anchorKind === "stationary" && (zone.anchor.kind !== "stationary" || Boolean(tacticalAimIssue(zone.anchor.position, state.combat.tactical.geometry))))
      || (definition.anchorKind === "actor" && (zone.anchor.kind !== "actor" || zone.anchor.actorId !== state.actorId))
      || Boolean(tacticalAimIssue(zone.currentCenter, state.combat.tactical.geometry))
    ) {
      return { code: "invalid_tactical_zone_shape", message: "An active tactical zone has an invalid reviewed shape or anchor; the command cannot mutate state." };
    }
  }
  return validateEffectProjection ? tacticalZoneEffectStateIssue(state) : null;
}

function installedTacticalZoneRulesVersion(rulesVersion: unknown): rulesVersion is string {
  if (typeof rulesVersion !== "string" || !rulesVersion.startsWith("open5e-pack@")) return false;
  const packHash = rulesVersion.slice("open5e-pack@".length);
  if (!/^[a-f0-9]{64}$/.test(packHash)) return false;
  return loadRulesKernelForPackHash(packHash) !== null;
}

export function rejectInvalidTacticalZonePersistence(
  current: LanternCampaignState,
  tool: EngineResolutionTool,
  candidate: LanternCampaignState = current,
): EngineResolution | null {
  const issue = tacticalZoneStateIssue(candidate, true);
  return issue ? rejection(current, tool, issue.code, issue.message) : null;
}

function tacticalZoneEffectSourceRef(zoneId: string): string {
  return `tactical-zone:${zoneId}`;
}

function sameSortedStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function sameReviewedZoneOperations(
  actual: readonly EngineEffectOperation[],
  expected: readonly EngineEffectOperation[],
): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((operation, index) => {
    const reviewed = expected[index];
    if (!reviewed || operation.kind !== reviewed.kind) return false;
    if (
      (operation.kind !== "advantage" && operation.kind !== "disadvantage")
      || (reviewed.kind !== "advantage" && reviewed.kind !== "disadvantage")
    ) return false;
    return operation.category === reviewed.category && Object.keys(operation).length === 2;
  });
}

function tacticalZoneEffectStateIssue(state: LanternCampaignState): TacticalIssue | null {
  const activeZones = state.combat.tactical.zones.filter((zone) => zone.status === "active");
  if (activeZones.some((zone) => state.combat.round >= zone.duration.expiresAtRound)) {
    return tacticalZoneIntegrityIssue("invalid_tactical_zone_shape");
  }
  const zonesBySource = new Map(activeZones.map((zone) => [tacticalZoneEffectSourceRef(zone.id), zone]));
  const activeZoneEffects = state.effects.filter((effect) =>
    effect.status === "active" && effect.sourceRef.startsWith("tactical-zone:")
  );
  if (activeZoneEffects.some((effect) => !zonesBySource.has(effect.sourceRef))) {
    return tacticalZoneIntegrityIssue("invalid_tactical_zone_effect");
  }

  for (const zone of activeZones) {
    const definition = reviewedTacticalZoneDefinition(zone.definitionKey);
    if (!definition) return tacticalZoneIntegrityIssue("invalid_tactical_zone_shape");
    const expectedCenter = zone.anchor.kind === "actor"
      ? state.combat.tactical.actorPosition
      : zone.anchor.position;
    if (!positionEquals(zone.currentCenter, expectedCenter)) {
      return tacticalZoneIntegrityIssue("invalid_tactical_zone_effect");
    }
    const cells = deriveTacticalCircleCells(
      state.combat.tactical.geometry,
      expectedCenter,
      definition.radiusFeet,
    );
    if ("code" in cells) return tacticalZoneIntegrityIssue("invalid_tactical_zone_shape");
    const expectedTargets = tacticalActorIdsInCells(
      state.combat.tactical.geometry,
      {
        id: state.character.id,
        position: state.combat.tactical.actorPosition,
        footprint: state.combat.tactical.actorFootprint,
        eligible: state.character.lifecycleState !== "dead",
      },
      state.combat.enemies,
      state.controlledActors,
      cells,
    ).sort();
    if (!sameSortedStrings(zone.affectedActorIds, expectedTargets)) {
      return tacticalZoneIntegrityIssue("invalid_tactical_zone_effect");
    }

    const sourceRef = tacticalZoneEffectSourceRef(zone.id);
    const effects = activeZoneEffects.filter((effect) => effect.sourceRef === sourceRef);
    if (
      effects.length !== expectedTargets.length
      || !sameSortedStrings(zone.activeEffectIds, effects.map((effect) => effect.id))
    ) return tacticalZoneIntegrityIssue("invalid_tactical_zone_effect");

    const seenTargets = new Set<string>();
    for (const effect of effects) {
      const target = effect.targetRefs.length === 1 ? effect.targetRefs[0] : null;
      if (
        !target
        || seenTargets.has(target)
        || !expectedTargets.includes(target)
        || effect.definitionKey !== definition.key
        || !sameReviewedZoneOperations(effect.operations, definition.operations)
        || effect.duration.kind !== "persistent"
        || Object.keys(effect.duration).length !== 1
        || effect.stackingKey !== definition.stackingKey
        || effect.stackingRule !== "ignore"
        || !sameSortedStrings(effect.clearedBy, ["source-removal"])
        || effect.startAnchor.kind !== "campaign-round"
        || !Number.isInteger(effect.startAnchor.round)
        || effect.startAnchor.round < 0
        || effect.startAnchor.round < zone.duration.startedRound
        || effect.startAnchor.round > state.combat.round
        || effect.startAnchor.actorId !== undefined
        || effect.startTimeMinutes !== undefined
        || effect.provenance.sourceContentKey !== null
        || typeof effect.provenance.sourceCommandId !== "string"
        || !effect.provenance.sourceCommandId.trim()
        || effect.provenance.rulesVersion !== zone.provenance.rulesVersion
        || effect.provenance.formulaRevision !== "tactical-zone-effects-v1"
      ) return tacticalZoneIntegrityIssue("invalid_tactical_zone_effect");
      seenTargets.add(target);
    }
  }
  return null;
}

function removeActiveTacticalZoneEffects(state: LanternCampaignState, zoneId: string): void {
  const sourceRef = tacticalZoneEffectSourceRef(zoneId);
  state.effects = state.effects.map((effect) => effect.status === "active" && effect.sourceRef === sourceRef
    ? { ...effect, status: "removed" as const }
    : effect);
}

function reconcileTacticalZones(
  state: LanternCampaignState,
  sourceCommandId: string,
): TacticalZoneReconcileResult {
  const beforeZones = state.combat.tactical.zones.map((zone) => structuredClone(zone));
  const beforeEffects = state.effects.map((effect) => structuredClone(effect));
  const transitions: TacticalZoneTransition[] = [];
  if (state.combat.tactical.zones.length === 0) return { beforeZones, beforeEffects, transitions };

  state.combat.tactical.zones = state.combat.tactical.zones.map((zone) => {
    if (zone.status !== "active") return zone;
    const definition = reviewedTacticalZoneDefinition(zone.definitionKey);
    let endedReason: EngineTacticalZoneEndReason | null = null;
    if (zone.source.actorId !== state.actorId || state.character.lifecycleState === "dead") endedReason = "source-dead";
    else if (state.combat.status !== "active") endedReason = "encounter-ended";
    else if (state.combat.round >= zone.duration.expiresAtRound) endedReason = "expired";

    if (endedReason) {
      removeActiveTacticalZoneEffects(state, zone.id);
      const terminal: EngineTacticalZone = {
        ...zone,
        affectedActorIds: [],
        activeEffectIds: [],
        status: endedReason === "expired" ? "expired" : "removed",
        endedReason,
        revision: zone.revision + 1,
      };
      transitions.push({
        zoneId: terminal.id,
        definitionKey: terminal.definitionKey,
        revision: terminal.revision,
        center: { ...terminal.currentCenter },
        enteredActorIds: [],
        leftActorIds: [...zone.affectedActorIds].sort(),
        affectedActorIds: [],
        status: terminal.status,
        endedReason,
      });
      return terminal;
    }

    const center = zone.anchor.kind === "actor"
      ? { ...state.combat.tactical.actorPosition }
      : { ...zone.anchor.position };
    const circleCells = deriveTacticalCircleCells(state.combat.tactical.geometry, center, definition!.radiusFeet);
    if ("code" in circleCells) {
      return zone;
    }

    const affectedActorIds = tacticalActorIdsInCells(
      state.combat.tactical.geometry,
      {
        id: state.character.id,
        position: state.combat.tactical.actorPosition,
        footprint: state.combat.tactical.actorFootprint,
        eligible: state.character.lifecycleState !== "dead",
      },
      state.combat.enemies,
      state.controlledActors,
      circleCells,
    ).sort();
    const previousTargets = new Set(zone.affectedActorIds);
    const nextTargets = new Set(affectedActorIds);
    const enteredActorIds = affectedActorIds.filter((actorId) => !previousTargets.has(actorId));
    const leftActorIds = zone.affectedActorIds.filter((actorId) => !nextTargets.has(actorId)).sort();
    const sourceRef = tacticalZoneEffectSourceRef(zone.id);
    const missingEffectActorIds = affectedActorIds.filter((actorId) => !state.effects.some((effect) =>
      effect.status === "active"
      && effect.sourceRef === sourceRef
      && effect.targetRefs.includes(actorId)
    ));
    const orphanedEffectIds = state.effects
      .filter((effect) => effect.status === "active"
        && effect.sourceRef === sourceRef
        && (effect.targetRefs.length !== 1 || !nextTargets.has(effect.targetRefs[0]!)))
      .map((effect) => effect.id);
    const centerChanged = !positionEquals(zone.currentCenter, center);
    const changed = centerChanged
      || !sameSortedStrings(zone.affectedActorIds, affectedActorIds)
      || missingEffectActorIds.length > 0
      || orphanedEffectIds.length > 0
      || zone.revision === 0;
    const revision = changed ? zone.revision + 1 : zone.revision;

    if (orphanedEffectIds.length > 0) {
      state.effects = state.effects.map((effect) => effect.status === "active"
        && effect.sourceRef === sourceRef
        && orphanedEffectIds.includes(effect.id)
        ? { ...effect, status: "removed" as const }
        : effect);
    }
    for (const actorId of missingEffectActorIds) {
      const applied = applyEffect(state.effects, {
        id: `tactical-zone-effect:${zone.id}:${revision}:${actorId}`,
        definitionKey: zone.definitionKey,
        sourceRef,
        targetRefs: [actorId],
        operations: definition!.operations.map((operation) => ({ ...operation })),
        startAnchor: { kind: "campaign-round", round: state.combat.round },
        duration: { kind: "persistent" },
        stackingKey: definition!.stackingKey,
        stackingRule: "ignore",
        clearedBy: ["source-removal"],
        provenance: {
          sourceContentKey: null,
          sourceCommandId,
          rulesVersion: zone.provenance.rulesVersion,
          formulaRevision: "tactical-zone-effects-v1",
        },
      });
      state.effects = applied.effects;
    }
    const activeEffectIds = state.effects
      .filter((effect) => effect.status === "active" && effect.sourceRef === sourceRef)
      .map((effect) => effect.id)
      .sort();
    const nextZone: EngineTacticalZone = {
      ...zone,
      currentCenter: center,
      affectedActorIds,
      activeEffectIds,
      revision,
    };
    if (changed || leftActorIds.length > 0) {
      transitions.push({
        zoneId: nextZone.id,
        definitionKey: nextZone.definitionKey,
        revision,
        center: { ...center },
        enteredActorIds,
        leftActorIds,
        affectedActorIds,
        status: nextZone.status,
        endedReason: null,
      });
    }
    return nextZone;
  });
  return { beforeZones, beforeEffects, transitions };
}

function zoneTransitionMessage(transitions: TacticalZoneTransition[]): string {
  return transitions.map((transition) => {
    const definition = reviewedTacticalZoneDefinition(transition.definitionKey);
    const name = definition?.name ?? transition.definitionKey;
    if (transition.endedReason) return `${name} ends (${transition.endedReason}).`;
    return transition.enteredActorIds.length || transition.leftActorIds.length
      ? `${name} updates its affected actors from canonical positions.`
      : `${name} follows its source.`;
  }).join(" ");
}

function extendEventStateChange(
  event: EngineEvent,
  path: string,
  before: unknown,
  after: unknown,
): void {
  const existing = event.stateChanges.find((change) => change.path === path);
  if (existing) existing.after = after;
  else event.stateChanges.push({ path, before, after });
}

function reconcileZonesInResolution(resolution: EngineResolution, sourceCommandId: string): EngineResolution {
  if (!resolution.accepted || resolution.readOnly || !resolution.event) return resolution;
  const reconciled = reconcileTacticalZones(resolution.state, sourceCommandId);
  const zonesChanged = JSON.stringify(reconciled.beforeZones) !== JSON.stringify(resolution.state.combat.tactical.zones);
  const effectsChanged = JSON.stringify(reconciled.beforeEffects) !== JSON.stringify(resolution.state.effects);
  if (!zonesChanged && !effectsChanged) return resolution;
  if (zonesChanged) {
    extendEventStateChange(
      resolution.event,
      "/combat/tactical/zones",
      reconciled.beforeZones,
      resolution.state.combat.tactical.zones,
    );
  }
  if (effectsChanged) {
    extendEventStateChange(resolution.event, "/effects", reconciled.beforeEffects, resolution.state.effects);
  }
  const sourceData = resolution.data && typeof resolution.data === "object" && !Array.isArray(resolution.data)
    ? resolution.data as Record<string, unknown>
    : {};
  const sourceZoneId = sourceData.tacticalZone
    && typeof sourceData.tacticalZone === "object"
    && !Array.isArray(sourceData.tacticalZone)
    && typeof (sourceData.tacticalZone as { id?: unknown }).id === "string"
      ? (sourceData.tacticalZone as { id: string }).id
      : null;
  const canonicalSourceZone = sourceZoneId
    ? resolution.state.combat.tactical.zones.find((zone) => zone.id === sourceZoneId) ?? null
    : null;
  resolution.data = {
    ...sourceData,
    ...(canonicalSourceZone ? { tacticalZone: canonicalSourceZone } : {}),
    combat: combatData(resolution.state.combat),
    tacticalZones: resolution.state.combat.tactical.zones,
    zoneTransitions: reconciled.transitions,
  };
  if (reconciled.transitions.length > 0) {
    const message = `${resolution.message} ${zoneTransitionMessage(reconciled.transitions)}`;
    resolution.message = message;
    resolution.narration = { ...resolution.narration, text: message };
    const latest = resolution.state.log.at(-1);
    if (latest) latest.text = message;
  }
  return resolution;
}

function positionFitsGeometry(
  position: EngineTacticalPosition,
  footprint: EngineTacticalFootprint,
  geometry: EngineTacticalGeometry,
  enemies: EngineCombatant[],
  ignoredEnemyIds: Set<string> = new Set(),
): TacticalIssue | null {
  const frameIssue = validatePositionFrame(position, geometry.frameId);
  if (frameIssue) return frameIssue;
  if (!Number.isInteger(footprint.width) || !Number.isInteger(footprint.height) || footprint.width < 1 || footprint.height < 1 || footprint.width > 2 || footprint.height > 2) {
    return { code: "unsupported_tactical_footprint", message: "The first slice supports Tiny through Large footprints only." };
  }
  const cells = positionCells(position, footprint);
  for (const cell of cells) {
    if (cell.x < geometry.bounds.minX || cell.x > geometry.bounds.maxX || cell.y < geometry.bounds.minY || cell.y > geometry.bounds.maxY) {
      return { code: "tactical_destination_out_of_bounds", message: "The complete combatant footprint must remain within tactical bounds." };
    }
  }
  const blocked = new Set<string>();
  for (const obstacle of geometry.obstacles) {
    for (const cell of rectangleCells(obstacle)) blocked.add(cell);
  }
  if (cells.some((cell) => blocked.has(cellKey(cell)))) {
    return { code: "tactical_obstacle_collision", message: "The path intersects a blocking tactical obstacle." };
  }
  for (const enemy of enemies) {
    if (ignoredEnemyIds.has(enemy.id)) continue;
    const enemyCells = new Set(positionCells(enemy.position, enemy.footprint).map(cellKey));
    if (cells.some((cell) => enemyCells.has(cellKey(cell)))) {
      return { code: "tactical_creature_collision", message: "The path intersects another combatant's footprint." };
    }
  }
  return null;
}

function validateCombatantSetup(tactical: EngineCombatTacticalState, enemies: EngineCombatant[]): TacticalIssue | null {
  const actorIssue = positionFitsGeometry(tactical.actorPosition, tactical.actorFootprint, tactical.geometry, []);
  if (actorIssue) return actorIssue;
  const placed: EngineCombatant[] = [];
  for (const enemy of enemies) {
    const issue = positionFitsGeometry(enemy.position, enemy.footprint, tactical.geometry, placed);
    if (issue) return issue;
    placed.push(enemy);
  }
  return null;
}

function diagonalCornerIssue(
  from: EngineTacticalPosition,
  to: EngineTacticalPosition,
  footprint: EngineTacticalFootprint,
  geometry: EngineTacticalGeometry,
  enemies: EngineCombatant[],
): TacticalIssue | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return null;
  const horizontal = { ...from, x: from.x + dx };
  const vertical = { ...from, y: from.y + dy };
  return positionFitsGeometry(horizontal, footprint, geometry, enemies)
    ?? positionFitsGeometry(vertical, footprint, geometry, enemies);
}

const tacticalNeighbors: readonly [number, number][] = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function terrainCostFeet(position: EngineTacticalPosition, footprint: EngineTacticalFootprint, geometry: EngineTacticalGeometry): number {
  const cells = new Set(positionCells(position, footprint).map(cellKey));
  return geometry.difficultTerrain
    .filter((terrain) => [...rectangleCells(terrain)].some((cell) => cells.has(cell)))
    .reduce((cost, terrain) => Math.max(cost, terrain.costFeet), TACTICAL_CELL_FEET);
}

function findTacticalPath(
  from: EngineTacticalPosition,
  destination: EngineTacticalPosition,
  footprint: EngineTacticalFootprint,
  geometry: EngineTacticalGeometry,
  enemies: EngineCombatant[],
): { path: EngineTacticalPosition[]; costFeet: number } | TacticalIssue {
  interface Candidate {
    position: EngineTacticalPosition;
    path: EngineTacticalPosition[];
    costFeet: number;
    sequence: number;
  }
  const frontier: Candidate[] = [{ position: from, path: [], costFeet: 0, sequence: 0 }];
  const best = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  let sequence = 1;
  while (frontier.length > 0) {
    frontier.sort((left, right) => left.costFeet - right.costFeet || left.sequence - right.sequence);
    const current = frontier.shift()!;
    if (current.position.x === destination.x && current.position.y === destination.y) {
      return { path: current.path, costFeet: current.costFeet };
    }
    for (const [dx, dy] of tacticalNeighbors) {
      const next = { ...current.position, x: current.position.x + dx, y: current.position.y + dy };
      const fitIssue = positionFitsGeometry(next, footprint, geometry, enemies);
      if (fitIssue) continue;
      const cornerIssue = diagonalCornerIssue(current.position, next, footprint, geometry, enemies);
      if (cornerIssue) continue;
      const nextCost = current.costFeet + terrainCostFeet(next, footprint, geometry);
      const key = `${next.x},${next.y}`;
      if (nextCost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(key, nextCost);
      frontier.push({ position: next, path: [...current.path, next], costFeet: nextCost, sequence: sequence++ });
    }
  }
  return { code: "tactical_path_unavailable", message: "No valid bounded path reaches that tactical destination." };
}

function validateProvidedTacticalPath(
  from: EngineTacticalPosition,
  destination: EngineTacticalPosition,
  providedPath: EngineTacticalPosition[],
  footprint: EngineTacticalFootprint,
  geometry: EngineTacticalGeometry,
  enemies: EngineCombatant[],
): { path: EngineTacticalPosition[]; costFeet: number } | TacticalIssue {
  if (providedPath.length === 0) return { code: "tactical_path_invalid", message: "A supplied movement path must contain at least one destination cell." };
  const path = positionEquals(providedPath[0]!, from) ? providedPath.slice(1) : [...providedPath];
  if (path.length === 0 || !positionEquals(path[path.length - 1]!, destination)) {
    return { code: "tactical_path_invalid", message: "The supplied path must end at the requested destination." };
  }
  let previous = from;
  let costFeet = 0;
  for (const next of path) {
    const frameIssue = validatePositionFrame(next, geometry.frameId);
    if (frameIssue) return frameIssue;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
      return { code: "tactical_path_invalid", message: "Movement paths must use adjacent horizontal or diagonal cells." };
    }
    const fitIssue = positionFitsGeometry(next, footprint, geometry, enemies);
    if (fitIssue) return fitIssue;
    const cornerIssue = diagonalCornerIssue(previous, next, footprint, geometry, enemies);
    if (cornerIssue) return { code: "tactical_corner_blocked", message: "Diagonal movement cannot cut through a blocked corner." };
    costFeet += terrainCostFeet(next, footprint, geometry);
    previous = next;
  }
  return { path, costFeet };
}

function positionEquals(left: EngineTacticalPosition, right: EngineTacticalPosition): boolean {
  return left.frameId === right.frameId && left.x === right.x && left.y === right.y && left.z === right.z;
}

function footprintDistanceFeet(
  leftPosition: EngineTacticalPosition,
  leftFootprint: EngineTacticalFootprint,
  rightPosition: EngineTacticalPosition,
  rightFootprint: EngineTacticalFootprint,
): number {
  let distance = Number.POSITIVE_INFINITY;
  for (const left of positionCells(leftPosition, leftFootprint)) {
    for (const right of positionCells(rightPosition, rightFootprint)) {
      distance = Math.min(distance, Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) * TACTICAL_CELL_FEET);
    }
  }
  return distance;
}

function tacticalDistanceFeet(combat: EngineCombat, enemy: EngineCombatant): number {
  const derived = footprintDistanceFeet(
    combat.tactical.actorPosition,
    combat.tactical.actorFootprint,
    enemy.position,
    enemy.footprint,
  );
  return Number.isFinite(derived) ? derived : Math.max(0, enemy.distanceFeet);
}

function opportunityAttackFor(enemy: EngineCombatant): CompiledCreatureAttack | null {
  return materializeCombatant(enemy).attacks
    .filter((attack) => attack.attackMode !== "ranged" && (attack.distance.reach ?? 0) > 0)
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey))[0] ?? null;
}

function movementTriggers(
  from: EngineTacticalPosition,
  actorFootprint: EngineTacticalFootprint,
  path: EngineTacticalPosition[],
  enemies: EngineCombatant[],
  sourceCommandId: string,
): EnginePathTrigger[] {
  const triggers: EnginePathTrigger[] = [];
  let previous = from;
  path.forEach((next, index) => {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const attack = opportunityAttackFor(enemy);
      const reachFeet = attack?.distance.reach ?? TACTICAL_REACH_FEET;
      const distanceBeforeFeet = footprintDistanceFeet(previous, actorFootprint, enemy.position, enemy.footprint);
      const distanceAfterFeet = footprintDistanceFeet(next, actorFootprint, enemy.position, enemy.footprint);
      const enters = distanceBeforeFeet > reachFeet && distanceAfterFeet <= reachFeet;
      const leaves = distanceBeforeFeet <= reachFeet && distanceAfterFeet > reachFeet;
      if (enters || leaves) {
        triggers.push({
          id: `${sourceCommandId}:${enemy.id}:${index + 1}:${enters ? "entering-reach" : "leaving-reach"}`,
          kind: "reach-boundary",
          enemyId: enemy.id,
          segmentIndex: index + 1,
          boundary: enters ? "entering-reach" : "leaving-reach",
          reachFeet,
          distanceBeforeFeet,
          distanceAfterFeet,
          resolution: null,
        });
      }
    }
    previous = next;
  });
  return triggers;
}

function syncDerivedCombatDistances(tactical: EngineCombatTacticalState, enemies: EngineCombatant[]): void {
  for (const enemy of enemies) {
    const distance = fiveESimpleDistanceFeet(tactical.actorPosition, enemy.position);
    enemy.distanceFeet = Number.isFinite(distance) ? distance : Math.max(0, enemy.distanceFeet);
  }
}

function resolveTacticalZoneCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "tactical_zone_create" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "Persistent tactical zones require an active encounter.");
  if (state.combat.activeActorId !== state.actorId) return rejection(state, tool, "off_turn", "It is not your turn.");
  if (state.combat.lifecycle?.phase === "resolving") {
    return rejection(state, tool, "surrender_decision_required", "Resolve the server-owned surrender offer before creating a tactical zone.");
  }
  if (hasRuntimeCondition(state, state.character.id, "unconscious")) return rejection(state, tool, "unconscious", "You are unconscious and cannot create a tactical zone.");
  const preventingCondition = ["incapacitated", "paralyzed", "petrified", "stunned"]
    .find((condition) => hasRuntimeCondition(state, state.character.id, condition));
  if (preventingCondition) {
    return rejection(state, tool, "condition_prevents_action", `You are ${preventingCondition} and cannot take an action. End the turn to resolve the skipped turn.`);
  }
  if (!state.combat.turnBudget.action.available || state.combat.turnBudget.action.spent) {
    return rejection(state, tool, "action_spent", "Your Action is already spent this turn.");
  }
  const definition = reviewedTacticalZoneDefinition(command.definitionKey);
  if (!definition) return rejection(state, tool, "unsupported_tactical_zone_definition", "That tactical zone definition is not reviewed for execution.");
  if (command.geometryRevision !== state.combat.tactical.geometry.revision) {
    return rejection(state, tool, "stale_tactical_geometry", "The tactical geometry changed; recreate the zone from the current revision.");
  }
  if (state.combat.tactical.zones.some((zone) => zone.status === "active" && zone.definitionKey === definition.key)) {
    return rejection(state, tool, "tactical_zone_already_active", `${definition.name} is already active.`);
  }
  if (definition.anchorKind === "stationary" && !command.center) {
    return rejection(state, tool, "tactical_zone_center_required", `${definition.name} requires one center cell.`);
  }
  if (definition.anchorKind === "actor" && command.center) {
    return rejection(state, tool, "tactical_zone_center_server_owned", `${definition.name} follows the player and cannot accept a caller-authored center.`);
  }
  const center = definition.anchorKind === "stationary"
    ? { ...command.center! }
    : { ...state.combat.tactical.actorPosition };
  const centerIssue = tacticalAimIssue(center, state.combat.tactical.geometry);
  if (centerIssue) return rejection(state, tool, centerIssue.code, centerIssue.message);

  const next = cloneCampaign(state);
  const beforeAction = { ...state.combat.turnBudget.action };
  spendTurnSlot(next.combat.turnBudget, "action");
  const zone: EngineTacticalZone = {
    version: 1,
    id: randomUUID(),
    definitionKey: definition.key,
    source: {
      actorId: state.actorId,
      ref: `actor:${state.actorId}`,
    },
    anchor: definition.anchorKind === "stationary"
      ? { kind: "stationary", position: center }
      : { kind: "actor", actorId: state.actorId },
    shape: { kind: "circle", radiusFeet: definition.radiusFeet },
    geometryRevision: state.combat.tactical.geometry.revision,
    duration: {
      kind: "rounds",
      amount: definition.durationRounds,
      startedRound: state.combat.round,
      expiresAtRound: state.combat.round + definition.durationRounds,
    },
    currentCenter: center,
    affectedActorIds: [],
    activeEffectIds: [],
    status: "active",
    endedReason: null,
    revision: 0,
    provenance: {
      sourceCommandId: clientCommandId,
      sourceVersion: state.version,
      rulesVersion: state.rulesVersion,
      definitionRevision: "tactical-zones-v1",
    },
  };
  next.combat.tactical.zones.push(zone);
  next.combat.lastAction = `tactical_zone:${definition.key}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${definition.name} is established from reviewed tactical geometry.`,
    { tacticalZone: zone, combat: combatData(next.combat) },
    "tactical_zone_created",
    [],
    [],
    [
      { path: "/combat/turnBudget/action", before: beforeAction, after: next.combat.turnBudget.action },
      { path: "/combat/tactical/zones", before: state.combat.tactical.zones, after: next.combat.tactical.zones },
    ],
  );
}

function resolveCombatMove(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "combat_move" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter.");
  if (state.combat.activeActorId !== state.actorId) return rejection(state, tool, "off_turn", "It is not your turn.");
  if (hasRuntimeCondition(state, state.character.id, "unconscious")) return rejection(state, tool, "unconscious", "You are unconscious and cannot move.");
  const preventingCondition = ["incapacitated", "paralyzed", "petrified", "stunned"]
    .find((condition) => hasRuntimeCondition(state, state.character.id, condition));
  if (preventingCondition) return rejection(state, tool, "condition_prevents_movement", `You are ${preventingCondition} and cannot move.`);
  const tactical = state.combat.tactical;
  if (command.geometryRevision !== tactical.geometry.revision) {
    return rejection(state, tool, "stale_tactical_geometry", "The tactical geometry changed; replan movement from the current revision.");
  }
  const destinationFrameIssue = validatePositionFrame(command.destination, tactical.geometry.frameId);
  if (destinationFrameIssue) return rejection(state, tool, destinationFrameIssue.code, destinationFrameIssue.message);
  if (positionEquals(tactical.actorPosition, command.destination)) {
    return rejection(state, tool, "tactical_no_movement", "The requested destination is your current tactical cell.");
  }
  const pathResult = command.path
    ? validateProvidedTacticalPath(tactical.actorPosition, command.destination, command.path, tactical.actorFootprint, tactical.geometry, state.combat.enemies)
    : findTacticalPath(tactical.actorPosition, command.destination, tactical.actorFootprint, tactical.geometry, state.combat.enemies);
  if ("code" in pathResult) return rejection(state, tool, pathResult.code, pathResult.message);
  const remainingFeet = Math.max(0, tacticalMovementRemaining(state.combat.turnBudget));
  if (pathResult.costFeet > remainingFeet) {
    return rejection(state, tool, "insufficient_movement", `That path costs ${pathResult.costFeet} feet, but only ${remainingFeet} feet remain.`);
  }
  const plan: EngineMovementPlan = {
    actorId: state.actorId,
    geometryRevision: tactical.geometry.revision,
    metric: tactical.geometry.metric,
    from: { ...tactical.actorPosition },
    to: { ...command.destination },
    path: pathResult.path.map((position) => ({ ...position })),
    costFeet: pathResult.costFeet,
    triggers: movementTriggers(tactical.actorPosition, tactical.actorFootprint, pathResult.path, state.combat.enemies, clientCommandId),
  };
  const next = cloneCampaign(state);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const reactionMessages: string[] = [];
  const opportunityReactionContentKeys: string[] = [];
  let interruptedAtTriggerIndex: number | null = null;
  let opportunityReactionOffered = false;
  for (const [index, trigger] of plan.triggers.entries()) {
    if (trigger.boundary !== "leaving-reach") continue;
    const enemy = next.combat.enemies.find((candidate) => candidate.id === trigger.enemyId && candidate.alive);
    const hpBefore = next.character.hp;
    const attack = enemy ? opportunityAttackFor(enemy) : null;
    if (!enemy || !attack) {
      trigger.resolution = {
        status: "no_melee_attack",
        actionKey: null,
        attackContentKey: null,
        reactionSpent: false,
        hit: null,
        critical: null,
        damageApplied: 0,
        hpBefore,
        hpAfter: hpBefore,
      };
      continue;
    }
    if (enemy.reaction.spent) {
      trigger.resolution = {
        status: "reaction_spent",
        actionKey: attack.actionKey,
        attackContentKey: attack.contentKey,
        reactionSpent: false,
        hit: null,
        critical: null,
        damageApplied: 0,
        hpBefore,
        hpAfter: hpBefore,
      };
      continue;
    }
    const boundaryPosition = trigger.segmentIndex <= 1
      ? plan.from
      : plan.path[trigger.segmentIndex - 2] ?? plan.from;
    const cover = incomingCharacterCover(next, enemy, boundaryPosition);
    if (cover.level === "total") {
      trigger.resolution = {
        status: "total_cover",
        actionKey: attack.actionKey,
        attackContentKey: attack.contentKey,
        reactionSpent: false,
        hit: null,
        critical: null,
        damageApplied: 0,
        hpBefore,
        hpAfter: hpBefore,
      };
      reactionMessages.push(`${materializeCombatant(enemy).name}'s opportunity attack is blocked by total cover.`);
      continue;
    }
    const beforeReaction = { ...enemy.reaction };
    enemy.reaction = { available: false, spent: true };
    changes.push({ path: `/combat/enemies/${enemy.id}/reaction`, before: beforeReaction, after: enemy.reaction });
    const reactions = eligibleIncomingHitReactions(next);
    const result = resolveOneCreatureAttack(
      next,
      attack,
      index + 1,
      rolls,
      modifiers,
      changes,
      clientCommandId,
      enemy,
      {
        damageSource: "opportunity-attack",
        targetPosition: boundaryPosition,
        deferDamage: reactions.length > 0,
      },
    );
    if (result.hit && reactions.length > 0) {
      const pending: EnginePendingReaction = {
        version: 1,
        id: randomUUID(),
        kind: "incoming-hit",
        trigger: "incoming-attack-would-hit",
        sourceCommandId: clientCommandId,
        sourceVersion: state.version,
        actorId: state.actorId,
        attackerId: enemy.id,
        targetId: state.character.id,
        sourceActionKey: attack.actionKey,
        attackName: attack.name,
        attackRoll: result.attackRoll,
        attackTotal: result.attackTotal,
        attackBonus: attack.toHit,
        critical: result.critical,
        originalArmorClass: result.armorClass,
        damageDiceCount: attack.damage.diceCount * (result.critical ? 2 : 1),
        damageDieSides: attack.damage.dieSides,
        damageBonus: attack.damage.bonus,
        damageType: attack.damage.typeName,
        eligibleReactionIds: reactions.map((spell) => spell.contentKey),
        status: "offered",
        resumeMode: "continue-character-turn",
        movementTriggerId: trigger.id,
        resumeToken: randomUUID(),
      };
      next.combat.pendingReaction = pending;
      changes.push({ path: "/combat/pendingReaction", before: state.combat.pendingReaction, after: pending });
      trigger.resolution = {
        status: "reaction_pending",
        actionKey: attack.actionKey,
        attackContentKey: attack.contentKey,
        reactionSpent: true,
        hit: true,
        critical: result.critical,
        damageApplied: 0,
        hpBefore: result.hpBefore,
        hpAfter: result.hpAfter,
      };
      opportunityReactionContentKeys.push(
        ...reactions.flatMap((spell) => [spell.contentKey, ...runtimeSpellPrimitiveEvidence(next, spell.contentKey)]),
      );
      reactionMessages.push(`${materializeCombatant(enemy).name}'s ${attack.name} would hit; resolve the offered reaction before continuing movement.`);
      opportunityReactionOffered = true;
      interruptedAtTriggerIndex = index;
      break;
    }
    trigger.resolution = {
      status: "resolved",
      actionKey: attack.actionKey,
      attackContentKey: attack.contentKey,
      reactionSpent: true,
      hit: result.hit,
      critical: result.critical,
      damageApplied: result.damageApplied,
      hpBefore: result.hpBefore,
      hpAfter: result.hpAfter,
    };
    reactionMessages.push(`${materializeCombatant(enemy).name}'s opportunity ${result.message.toLocaleLowerCase("en-US")}`);
    if (next.character.hp === 0) {
      interruptedAtTriggerIndex = index;
      break;
    }
  }
  if (interruptedAtTriggerIndex !== null) {
    const stoppingSegment = plan.triggers[interruptedAtTriggerIndex]!.segmentIndex;
    plan.triggers = plan.triggers.slice(0, interruptedAtTriggerIndex + 1);
    plan.path = plan.path.slice(0, Math.max(0, stoppingSegment - 1));
    plan.to = plan.path.at(-1) ?? { ...plan.from };
    plan.costFeet = plan.path.reduce(
      (total, position) => total + terrainCostFeet(position, tactical.actorFootprint, tactical.geometry),
      0,
    );
  }
  next.combat.tactical.actorPosition = { ...plan.to };
  next.combat.tactical.lastPlan = plan;
  next.combat.turnBudget.movementFeet.spent += plan.costFeet;
  next.combat.lastAction = opportunityReactionOffered
    ? `reaction:${next.combat.pendingReaction!.id}:offered`
    : "combat_move";
  syncDerivedCombatDistances(next.combat.tactical, next.combat.enemies);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${plan.path.length > 0
      ? `You move ${plan.costFeet} feet through ${plan.path.length} tactical cell${plan.path.length === 1 ? "" : "s"}.`
      : "You do not leave your starting tactical cell."}`
      + (reactionMessages.length > 0 ? ` ${reactionMessages.join(" ")}` : ""),
    { movement: plan, pendingReaction: next.combat.pendingReaction, combat: combatData(next.combat) },
    opportunityReactionOffered
      ? "combat_move_reaction_offered"
      : interruptedAtTriggerIndex === null
        ? "combat_moved"
        : "combat_move_interrupted",
    rolls,
    modifiers,
    [
      ...changes,
      ...(!positionEquals(state.combat.tactical.actorPosition, next.combat.tactical.actorPosition)
        ? [{ path: "/combat/tactical/actorPosition", before: state.combat.tactical.actorPosition, after: next.combat.tactical.actorPosition }]
        : []),
      ...(state.combat.turnBudget.movementFeet.spent !== next.combat.turnBudget.movementFeet.spent
        ? [{ path: "/combat/turnBudget/movementFeet/spent", before: state.combat.turnBudget.movementFeet.spent, after: next.combat.turnBudget.movementFeet.spent }]
        : []),
      { path: "/combat/tactical/lastPlan", before: state.combat.tactical.lastPlan, after: next.combat.tactical.lastPlan },
    ],
    [...new Set([
      ...plan.triggers.flatMap((trigger) => trigger.resolution?.attackContentKey ? [trigger.resolution.attackContentKey] : []),
      ...opportunityReactionContentKeys,
    ])],
  );
}

function tacticalMovementRemaining(budget: EngineTurnBudget): number {
  return Math.max(0, budget.movementFeet.available - budget.movementFeet.spent);
}

function encounterLifecycleForProfile(
  state: LanternCampaignState,
  enemies: EngineCombatant[],
  profile: "guards-surrender-v1",
  approach: Extract<EngineCommand, { kind: "combat_start" }>["approach"],
  groupTargets: string[],
): EngineEncounterLifecycle | EngineResolution {
  if (!approach) {
    return rejection(state, "combat_start", "approach_required", "The reviewed encounter profile requires an authoritative stealth-perception approach.");
  }
  const targetId = groupTargets[approach.groupIndex];
  if (!targetId) {
    return rejection(state, "combat_start", "approach_target_not_found", "The approach must select an established guard group.");
  }
  const target = enemies.find((enemy) => enemy.id === targetId);
  if (!target) {
    return rejection(state, "combat_start", "approach_target_not_found", "The approach target is not a living guard instance.");
  }
  const derived = deriveCheck(state, "dex", "stealth", null, "combat_start");
  if ("accepted" in derived) return derived;
  const targetView = materializeCombatant(target);
  const actorRoll = randomInt(1, 21);
  const opponentRoll = randomInt(1, 21);
  const actorTotal = actorRoll + derived.modifier;
  const opponentModifier = targetView.skillBonusesAll.perception ?? targetView.abilityModifiers.wis;
  const opponentTotal = opponentRoll + opponentModifier;
  const success = actorTotal > opponentTotal;
  const evidence: EngineEncounterApproachEvidence = {
    challengeId: "stealth-perception-v1",
    approach: approach.approach,
    targetId,
    actorRoll,
    actorModifier: derived.modifier,
    actorTotal,
    opponentRoll,
    opponentModifier,
    opponentTotal,
    outcome: success ? "success" : "failure-with-complication",
    consumed: true,
  };
  const actorEntry: EngineEncounterInitiativeEntry = {
    actorId: state.actorId,
    roll: randomInt(1, 21),
    modifier: state.character.abilityModifiers.dex,
    total: 0,
    tieBreaker: state.actorId,
    surprised: false,
  };
  actorEntry.total = actorEntry.roll + actorEntry.modifier;
  const entries: EngineEncounterInitiativeEntry[] = [actorEntry];
  for (const enemy of enemies) {
    const view = materializeCombatant(enemy);
    const roll = randomInt(1, 21);
    entries.push({
      actorId: enemy.id,
      roll,
      modifier: view.abilityModifiers.dex,
      total: roll + view.abilityModifiers.dex,
      tieBreaker: enemy.id,
      surprised: success,
    });
  }
  entries.sort((left, right) => right.total - left.total || right.roll - left.roll || left.tieBreaker.localeCompare(right.tieBreaker));
  let order = entries.map((entry) => entry.actorId);
  if (success) {
    order = [state.actorId, ...order.filter((actorId) => actorId !== state.actorId)];
  }
  const initiative: EngineEncounterInitiative = {
    formulaRevision: "initiative-v1",
    entries,
    order,
    activeIndex: 0,
    rolledAtVersion: state.version + 1,
  };
  return {
    profile,
    phase: "active",
    surprise: {
      eligible: success,
      consumed: true,
      source: "stealth-perception-v1",
      evidence,
    },
    initiative,
    morale: {
      policy: "guards-surrender-v1",
      thresholdRatio: 0.5,
      offers: [],
      lastTriggerId: null,
    },
    objective: { id: "resolve-without-killing", status: "pending" },
    outcome: null,
    outcomeId: null,
    claimedRewards: [],
    nonlethalDefeatIds: [],
    retreatPlanRevision: null,
  };
}

function lifecycleNextActorId(combat: EngineCombat, currentId: string, actorId: string): string | null {
  const lifecycle = combat.lifecycle;
  if (!lifecycle) return null;
  const liveIds = new Set([actorId, ...combat.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id)]);
  const currentIndex = lifecycle.initiative.order.indexOf(currentId);
  if (currentIndex < 0) return null;
  for (let offset = 1; offset <= lifecycle.initiative.order.length; offset += 1) {
    const candidate = lifecycle.initiative.order[(currentIndex + offset) % lifecycle.initiative.order.length];
    if (candidate && liveIds.has(candidate)) return candidate;
  }
  return null;
}

function resolveCombatStart(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "combat_start" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") return rejection(state, tool, "combat_active", "An encounter is already active.");
  const totalCount = command.creatures.reduce((total, group) => total + group.count, 0);
  if (totalCount > 20) {
    return rejection(state, tool, "encounter_too_large", "An encounter can contain at most 20 creature instances.");
  }
  for (const group of command.creatures) {
    if (!getOpen5eCreature(group.creatureKey)) {
      return rejection(state, tool, "content_not_installed", `Creature content is not installed: ${group.creatureKey}.`);
    }
  }
  const maxDistanceCells = Math.max(
    1,
    ...command.creatures.map((group) => Math.max(1, Math.ceil((group.distanceFeet ?? 5) / TACTICAL_CELL_FEET)))
  );
  const tacticalResult = buildCombatTacticalState(command.tactical, command.encounterId, state.actorId, maxDistanceCells);
  if ("code" in tacticalResult) return rejection(state, tool, tacticalResult.code, tacticalResult.message);
  const tactical = tacticalResult.tactical;
  for (const group of command.creatures) {
    if (group.position && group.position.frameId !== tactical.geometry.frameId) {
      return rejection(state, tool, "tactical_frame_mismatch", "Every combatant position must use the encounter's tactical frame.");
    }
    if (group.position?.z !== undefined && group.position.z !== 0) {
      return rejection(state, tool, "tactical_z_unsupported", "Walking combatants must remain on z=0 in this tactical slice.");
    }
  }
  const enemies = command.creatures.flatMap((group, groupIndex) => createCombatants(
    group.creatureKey,
    group.count,
    group.distanceFeet ?? 5,
    tactical.geometry.frameId,
    group.position ?? {
      ...tactical.actorPosition,
      x: tactical.actorPosition.x + Math.max(1, Math.ceil((group.distanceFeet ?? 5) / TACTICAL_CELL_FEET)) + groupIndex,
    },
  ));
  const setupIssue = validateCombatantSetup(tactical, enemies);
  if (setupIssue) return rejection(state, tool, setupIssue.code, setupIssue.message);
  syncDerivedCombatDistances(tactical, enemies);
  const groupTargets: string[] = [];
  let groupOffset = 0;
  for (const group of command.creatures) {
    groupTargets.push(enemies[groupOffset]?.id ?? "");
    groupOffset += group.count;
  }
  let lifecycle: EngineEncounterLifecycle | null = null;
  if (command.lifecycleProfile) {
    const lifecycleResult = encounterLifecycleForProfile(state, enemies, command.lifecycleProfile, command.approach, groupTargets);
    if ("accepted" in lifecycleResult) return lifecycleResult;
    lifecycle = lifecycleResult;
  }
  const activeActorId = lifecycle?.initiative.order[0] ?? state.actorId;
  const next = cloneCampaign(state);
  next.combat = {
    status: "active",
    encounterId: command.encounterId,
    encounterName: command.encounterName,
    lifecycle,
    round: 1,
    activeActorId,
    turnBudget: emptyTurnBudget(state.character.speed),
    tactical,
    pendingReaction: null,
    enemies,
    lootClaimed: false,
    lastAction: null,
  };
  const controlledActorChanges: Array<{ path: string; before: unknown; after: unknown }> = [];
  for (const actor of next.controlledActors) {
    if (actor.status !== "active") continue;
    const beforePosition = actor.position;
    const afterPosition = { ...tactical.actorPosition };
    if (JSON.stringify(beforePosition) === JSON.stringify(afterPosition)) continue;
    actor.position = afterPosition;
    controlledActorChanges.push({ path: `/controlledActors/${actor.id}/position`, before: beforePosition, after: afterPosition });
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Encounter started: " + command.encounterName + ". " + describeCombatants(enemies) + (activeActorId === state.actorId ? " Your turn." : " The opposition acts first."),
    { combat: combatData(next.combat), controlledActors: projectControlledActors(next) },
    "encounter_started",
    [],
    [],
    [{ path: "/combat", before: state.combat, after: next.combat }, ...controlledActorChanges]
  );
}

type CustodyActorRef = { kind: "player" | "npc" | "controlled"; id: string };

function custodyGuard(state: LanternCampaignState, guardId: string | undefined): { id: string; name: string } | null {
  if (!guardId) return null;
  const npc = state.worldContext?.npcs.find((candidate) => candidate.id === guardId);
  if (npc) {
    const name = `${npc.id} ${npc.name}`.toLocaleLowerCase("en-US");
    const isGuard = npc.agency?.actorType === "guard" || /guard|patrol|watch|warden|jailer|constable|soldier/.test(name);
    return isGuard ? { id: npc.id, name: npc.name } : null;
  }
  const enemy = state.combat.enemies.find((candidate) => candidate.id === guardId && candidate.alive);
  if (enemy && state.combat.lifecycle?.profile === "guards-surrender-v1") {
    return { id: enemy.id, name: materializeCombatant(enemy).name };
  }
  return null;
}

function establishedCustodyActor(state: LanternCampaignState, actorId: string): CustodyActorRef | null {
  if (actorId === state.actorId || actorId === state.character.id) return { kind: "player", id: state.actorId };
  if (state.worldContext?.npcs.some((npc) => npc.id === actorId)) return { kind: "npc", id: actorId };
  if (state.controlledActors.some((actor) => actor.id === actorId)) return { kind: "controlled", id: actorId };
  return null;
}

function custodyStatusForActor(state: LanternCampaignState, actor: CustodyActorRef): EngineCustodyStatus | null {
  if (actor.kind === "player") return state.character.custody ?? null;
  if (actor.kind === "npc") return state.worldContext?.npcs.find((npc) => npc.id === actor.id)?.custody ?? null;
  return state.controlledActors.find((candidate) => candidate.id === actor.id)?.custody ?? null;
}

function resolveCustodyAction(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "custody_action" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (command.action === "surrender") {
    if (state.character.custody) return rejection(state, tool, "custody_already_active", "You are already under guard custody.");
    const guard = custodyGuard(state, command.guardId);
    if (!guard) return rejection(state, tool, "custody_guard_not_found", "Surrender requires an established guard or patrol authority.");
    if (state.combat.status === "active" && state.combat.activeActorId !== state.actorId) {
      return rejection(state, tool, "off_turn", "You may surrender only on your turn.");
    }
    const requestedIds = command.affectedActorIds ?? [state.actorId];
    if (new Set(requestedIds).size !== requestedIds.length) return rejection(state, tool, "custody_duplicate_actor", "Each restrained actor must be listed once.");
    const affected = requestedIds.map((actorId) => establishedCustodyActor(state, actorId));
    if (affected.some((actor) => !actor)) return rejection(state, tool, "custody_actor_not_found", "Every restrained actor must already be established in the current campaign.");
    const actorRefs = affected as CustodyActorRef[];
    if (!actorRefs.some((actor) => actor.kind === "player")) return rejection(state, tool, "custody_player_required", "Surrender must include the player actor.");
    if (actorRefs.some((actor) => actor.id === guard.id)) return rejection(state, tool, "custody_guard_targeted", "The guard receiving surrender cannot also be restrained.");

    const next = cloneCampaign(state);
    const groupId = randomUUID();
    const locationRef = state.worldContext?.id ?? state.combat.encounterId ?? `campaign:${state.id}`;
    const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
    for (const actor of actorRefs) {
      const custody: EngineCustodyStatus = {
        actorId: actor.id,
        groupId,
        status: actor.kind === "player" ? "restrained" : "under_guard",
        sourceGuardId: guard.id,
        reason: "surrender",
        locationRef,
        startedVersion: state.version + 1,
        releasePolicy: "guard-release-or-escape",
      };
      if (actor.kind === "player") {
        const before = next.character.custody ?? null;
        next.character.custody = custody;
        changes.push({ path: "/character/custody", before, after: custody });
      } else if (actor.kind === "npc") {
        const target = next.worldContext?.npcs.find((npc) => npc.id === actor.id);
        if (target) {
          const before = target.custody ?? null;
          target.custody = custody;
          changes.push({ path: `/worldContext/npcs/${actor.id}/custody`, before, after: custody });
        }
      } else {
        const target = next.controlledActors.find((candidate) => candidate.id === actor.id);
        if (target) {
          const before = target.custody ?? null;
          target.custody = custody;
          changes.push({ path: `/controlledActors/${actor.id}/custody`, before, after: custody });
        }
      }
    }
    if (next.combat.status === "active") {
      const beforeCombat = state.combat;
      next.combat.status = "ended";
      next.combat.activeActorId = null;
      next.combat.pendingReaction = null;
      next.combat.lastAction = "custody_surrender";
      if (next.combat.lifecycle) {
        next.combat.lifecycle.phase = "terminal";
        next.combat.lifecycle.outcome = "player_surrendered";
        next.combat.lifecycle.outcomeId = `${next.combat.encounterId ?? "encounter"}:player_surrendered`;
        next.combat.lifecycle.objective.status = "succeeded";
      }
      changes.push({ path: "/combat", before: beforeCombat, after: next.combat });
    }
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `You surrender to ${guard.name}. The established actors are restrained under guard custody.`,
      { guard, affectedActors: actorRefs.map((actor) => actor.id), custody: next.character.custody ?? null, combat: combatData(next.combat) },
      "custody_surrendered",
      [],
      [],
      changes,
    );
  }

  let current = state.character.custody;
  if (command.action === "release" && command.affectedActorIds?.length) {
    const requestedIds = command.affectedActorIds;
    if (new Set(requestedIds).size !== requestedIds.length) return rejection(state, tool, "custody_duplicate_actor", "Each release target must be listed once.");
    const targetRefs = requestedIds.map((actorId) => establishedCustodyActor(state, actorId));
    if (targetRefs.some((actor) => !actor)) return rejection(state, tool, "custody_actor_not_found", "Every release target must already be established in the current campaign.");
    const targetCustody = (targetRefs as CustodyActorRef[]).map((actor) => custodyStatusForActor(state, actor));
    if (targetCustody.some((custody) => !custody)) return rejection(state, tool, "custody_release_target_invalid", "Every release target must still be under an active custody group.");
    const first = targetCustody[0] as EngineCustodyStatus;
    if (targetCustody.some((custody) => custody!.groupId !== first.groupId || custody!.sourceGuardId !== first.sourceGuardId)) {
      return rejection(state, tool, "custody_release_target_invalid", "Release targets must belong to one custody group and source guard.");
    }
    if (current && current.groupId !== first.groupId) {
      return rejection(state, tool, "custody_release_target_invalid", "The requested release targets are not part of your custody group.");
    }
    current = first;
  }
  if (!current) return rejection(state, tool, "custody_not_active", "You are not under guard custody; specify an outstanding captive actor to release.");
  if (command.action !== "release" && command.affectedActorIds?.length) {
    return rejection(state, tool, "custody_actor_ids_not_allowed", "Affected actor ids are only supplied when surrendering or releasing companions.");
  }
  if (command.action === "release" && !command.guardId) return rejection(state, tool, "custody_guard_required", "A release must name the established source guard.");
  const guard = command.action === "release"
    ? custodyGuard(state, command.guardId)
    : { id: current.sourceGuardId, name: current.sourceGuardId };
  if (command.action === "release" && (!guard || guard.id !== current.sourceGuardId)) {
    return rejection(state, tool, "custody_release_not_authorized", "Only the established source guard can release this custody.");
  }
  const guardName = guard?.name ?? current.sourceGuardId;
  if (command.action === "escape" && state.combat.status === "active") return rejection(state, tool, "combat_active", "Escape must resolve outside an active encounter.");

  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const clear = (actor: CustodyActorRef): void => {
    if (actor.kind === "player") {
      if (next.character.custody?.groupId === current.groupId) {
        const before = next.character.custody;
        next.character.custody = null;
        changes.push({ path: "/character/custody", before, after: null });
      }
    } else if (actor.kind === "npc") {
      const target = next.worldContext?.npcs.find((npc) => npc.id === actor.id);
      if (target?.custody?.groupId === current.groupId) {
        const before = target.custody;
        target.custody = null;
        changes.push({ path: `/worldContext/npcs/${actor.id}/custody`, before, after: null });
      }
    } else {
      const target = next.controlledActors.find((candidate) => candidate.id === actor.id);
      if (target?.custody?.groupId === current.groupId) {
        const before = target.custody;
        target.custody = null;
        changes.push({ path: `/controlledActors/${actor.id}/custody`, before, after: null });
      }
    }
  };
  if (command.action === "release") {
    clear({ kind: "player", id: state.actorId });
    for (const npc of next.worldContext?.npcs ?? []) if (npc.custody?.groupId === current.groupId) clear({ kind: "npc", id: npc.id });
    for (const actor of next.controlledActors) if (actor.custody?.groupId === current.groupId) clear({ kind: "controlled", id: actor.id });
  } else {
    clear({ kind: "player", id: state.actorId });
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    command.action === "release" ? `${guardName} releases the custody group.` : "You escape the guard custody.",
    { action: command.action, guard, releasedGroupId: current.groupId, custody: next.character.custody ?? null },
    command.action === "release" ? "custody_released" : "custody_escaped",
    [],
    [],
    changes,
  );
}

function resolveEncounterDecision(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "encounter_decision" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "encounter_terminal", "This encounter is already terminal.");
  const lifecycle = state.combat.lifecycle;
  if (!lifecycle) return rejection(state, tool, "encounter_profile_required", "This command is available only for the reviewed encounter lifecycle profile.");
  if (state.combat.activeActorId !== state.actorId) return rejection(state, tool, "off_turn", "Only the player may choose the encounter response on the player's turn.");
  if (lifecycle.phase === "terminal" || lifecycle.outcome) return rejection(state, tool, "encounter_terminal", "The encounter already has a terminal outcome.");
  if (command.decision === "retreat") {
    const plan = state.combat.tactical.lastPlan;
    if (!plan || !plan.triggers.some((trigger) => trigger.boundary === "leaving-reach")) {
      return rejection(state, tool, "retreat_path_required", "Retreat requires a committed #10 movement plan that leaves an enemy's reach.");
    }
    const next = cloneCampaign(state);
    next.combat.lifecycle!.phase = "terminal";
    next.combat.lifecycle!.outcome = "escaped";
    next.combat.lifecycle!.outcomeId = `${next.combat.encounterId ?? "encounter"}:escaped`;
    next.combat.lifecycle!.objective.status = "succeeded";
    next.combat.lifecycle!.retreatPlanRevision = plan.geometryRevision;
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    next.combat.lastAction = "encounter_retreat";
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "You retreat beyond the guards' reach. The encounter ends with an escape.",
      { outcome: "escaped", retreat: plan, combat: combatData(next.combat) },
      "encounter_escaped",
      [],
      [],
      [
        { path: "/combat/status", before: state.combat.status, after: next.combat.status },
        { path: "/combat/lifecycle", before: state.combat.lifecycle, after: next.combat.lifecycle },
      ],
    );
  }
  if (!command.targetId) return rejection(state, tool, "encounter_target_required", "Choose the guard who made the response offer.");
  const offer = lifecycle.morale.offers.find((candidate) => candidate.targetId === command.targetId && candidate.status === "offered");
  if (!offer) return rejection(state, tool, "surrender_not_offered", "That guard has no active surrender offer.");
  const next = cloneCampaign(state);
  const nextOffer = next.combat.lifecycle!.morale.offers.find((candidate) => candidate.id === offer.id);
  if (!nextOffer) return rejection(state, tool, "surrender_not_offered", "That surrender offer is no longer active.");
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  let outcome: EngineEncounterOutcome | null = null;
  let eventKind = "encounter_response";
  let message = "The guard remains ready to answer.";
  if (command.decision === "accept_surrender") {
    nextOffer.status = "accepted";
    outcome = "surrendered";
    eventKind = "encounter_surrendered";
    message = "You accept the guard's surrender. The encounter ends without killing the remaining guard.";
  } else if (command.decision === "capture") {
    nextOffer.status = "captured";
    outcome = "captured";
    eventKind = "encounter_captured";
    const target = next.combat.enemies.find((enemy) => enemy.id === command.targetId);
    if (target) {
      const beforeConditions = [...target.conditions];
      target.conditions = [...new Set([...target.conditions, "captured"])];
      target.alive = false;
      changes.push(
        { path: `/combat/enemies/${target.id}/conditions`, before: beforeConditions, after: target.conditions },
        { path: `/combat/enemies/${target.id}/alive`, before: true, after: false },
      );
    }
    message = "You secure the guard as a captive. The encounter ends with a capture.";
  } else {
    nextOffer.status = command.decision === "pursue" ? "pursued" : "rejected";
    message = command.decision === "pursue"
      ? "You refuse surrender and pursue the retreating guard; the encounter remains active."
      : "You refuse the surrender offer; the encounter remains active.";
  }
  if (outcome) {
    next.combat.lifecycle!.phase = "terminal";
    next.combat.lifecycle!.outcome = outcome;
    next.combat.lifecycle!.outcomeId = `${next.combat.encounterId ?? "encounter"}:${outcome}`;
    next.combat.lifecycle!.objective.status = outcome === "surrendered" || outcome === "captured" ? "succeeded" : "failed";
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    next.combat.lastAction = eventKind;
  } else {
    next.combat.lifecycle!.phase = "active";
    next.combat.lastAction = "encounter_response";
  }
  changes.push(
    { path: "/combat/lifecycle", before: state.combat.lifecycle, after: next.combat.lifecycle },
    ...(outcome ? [{ path: "/combat/status", before: state.combat.status, after: next.combat.status }] : []),
  );
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { decision: command.decision, targetId: command.targetId, outcome, combat: combatData(next.combat) },
    eventKind,
    [],
    [],
    changes,
  );
}

function maybeOfferSurrender(
  next: LanternCampaignState,
  defeatedTargetId: string,
): boolean {
  const lifecycle = next.combat.lifecycle;
  if (!lifecycle || lifecycle.outcome || lifecycle.phase === "terminal") return false;
  if (!next.combat.enemies.some((enemy) => enemy.id === defeatedTargetId && !enemy.alive)) return false;
  const alreadyOffered = new Set(lifecycle.morale.offers.map((offer) => offer.targetId));
  const candidate = next.combat.enemies.find((enemy) => {
    if (!enemy.alive || alreadyOffered.has(enemy.id)) return false;
    const view = materializeCombatant(enemy);
    return enemy.hp <= Math.floor(view.maxHp * lifecycle.morale.thresholdRatio);
  });
  if (!candidate) return false;
  const offer: EngineEncounterSurrenderOffer = {
    id: randomUUID(),
    targetId: candidate.id,
    reason: "ally-fallen",
    thresholdRatio: lifecycle.morale.thresholdRatio,
    status: "offered",
    sourceVersion: next.version + 1,
  };
  lifecycle.morale.offers.push(offer);
  lifecycle.morale.lastTriggerId = offer.id;
  lifecycle.phase = "resolving";
  next.combat.lastAction = "surrender_offer";
  return true;
}

function resolveProfileDefeatOutcome(
  next: LanternCampaignState,
  targetId: string,
): "killed" | "surrender_offer" | null {
  const lifecycle = next.combat.lifecycle;
  if (!lifecycle) return null;
  if (next.combat.enemies.some((enemy) => enemy.alive)) {
    return maybeOfferSurrender(next, targetId) ? "surrender_offer" : null;
  }
  lifecycle.phase = "terminal";
  lifecycle.outcome = "killed";
  lifecycle.outcomeId = `${next.combat.encounterId ?? "encounter"}:killed`;
  lifecycle.objective.status = "failed";
  next.combat.status = "ended";
  next.combat.activeActorId = null;
  return "killed";
}

function resolveSpawnCreature(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "spawn_creature" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") {
    return rejection(state, tool, "no_active_combat", "Start an encounter before spawning additional combatants.");
  }
  if (state.combat.enemies.length + command.count > 20) {
    return rejection(state, tool, "encounter_too_large", "An encounter can contain at most 20 creature instances.");
  }
  if (!getOpen5eCreature(command.creatureKey)) {
    return rejection(state, tool, "content_not_installed", `Creature content is not installed: ${command.creatureKey}.`);
  }
  if (command.position?.frameId !== undefined && command.position.frameId !== state.combat.tactical.geometry.frameId) {
    return rejection(state, tool, "tactical_frame_mismatch", "Every combatant position must use the encounter's tactical frame.");
  }
  if (command.position?.z !== undefined && command.position.z !== 0) {
    return rejection(state, tool, "tactical_z_unsupported", "Walking combatants must remain on z=0 in this tactical slice.");
  }
  const distanceFeet = command.distanceFeet ?? 5;
  const spawned = createCombatants(
    command.creatureKey,
    command.count,
    distanceFeet,
    state.combat.tactical.geometry.frameId,
    command.position ?? {
      ...state.combat.tactical.actorPosition,
      x: state.combat.tactical.actorPosition.x + Math.max(1, Math.ceil(distanceFeet / TACTICAL_CELL_FEET)) + state.combat.enemies.length,
    },
  );
  const setupIssue = validateCombatantSetup(state.combat.tactical, [...state.combat.enemies, ...spawned]);
  if (setupIssue) return rejection(state, tool, setupIssue.code, setupIssue.message);
  const next = cloneCampaign(state);
  next.combat.enemies.push(...spawned);
  syncDerivedCombatDistances(next.combat.tactical, next.combat.enemies);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    describeCombatants(spawned) + " join the encounter.",
    { spawned: materializeCombatants(spawned), combat: combatData(next.combat) },
    "creatures_spawned",
    [],
    [],
    [{ path: "/combat/enemies", before: state.combat.enemies, after: next.combat.enemies }]
  );
}

function resolveLearnSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "learn_spell" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  const spell = resolveSpellRecord(state, command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  const runtime = command.spellKey.startsWith("runtime:spell:");
  const classList = runtime ? null : getOpen5eSpellList(state.character.className);
  if (!runtime && !classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!runtime && !classList!.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList!.className} spell list.`);
  }
  const existing = spellcasting.knownSpells.find((candidate) => candidate.contentKey === spell.contentKey);
  if (existing) {
    if (existing.packHash !== spell.packHash) {
      return rejection(state, tool, "content_pack_mismatch", `${spell.definition.name} is pinned to a different content pack and requires an explicit repin.`);
    }
    return rejection(state, tool, "spell_already_known", `${spell.definition.name} is already known.`);
  }

  const levelIndex = Math.max(0, Math.min(19, state.character.level - 1));
  if (spell.definition.level === 0) {
    const limit = progression.cantripsKnown[levelIndex];
    if (limit === null || limit <= 0) {
      return rejection(state, tool, "cantrips_unavailable", `${progression.className} does not learn cantrips at this level.`);
    }
    const knownCantrips = spellcasting.knownSpells.filter((reference) =>
      resolveSpellRecord(state, reference.contentKey, reference.packHash)?.definition.level === 0
    ).length;
    if (knownCantrips >= limit) {
      return rejection(state, tool, "cantrip_limit_reached", `This character already knows the level-${state.character.level} limit of ${limit} cantrips.`);
    }
  } else {
    const highestSpellLevel = highestAvailableSlotLevel(spellcasting.slotMaximums);
    if (spell.definition.level > highestSpellLevel) {
      return rejection(state, tool, "spell_level_unavailable", `${spell.definition.name} requires a level-${spell.definition.level} slot; this character can cast through level ${highestSpellLevel}.`);
    }
    let limit: number | null = null;
    if (progression.selectionMode === "known") limit = progression.knownSpellLimits[levelIndex];
    else if (progression.selectionMode === "spellbook" && progression.spellbook) {
      limit = progression.spellbook.initialSpellCount
        + progression.spellbook.spellsGainedPerLevel * Math.max(0, state.character.level - 1);
    } else {
      return rejection(
        state,
        tool,
        "spell_learning_not_required",
        `${progression.className} prepares leveled spells directly from its class list; use prepare_spell.`
      );
    }
    const knownLeveled = spellcasting.knownSpells.filter((reference) =>
      (resolveSpellRecord(state, reference.contentKey, reference.packHash)?.definition.level ?? 0) > 0
    ).length;
    if (limit === null || knownLeveled >= limit) {
      return rejection(state, tool, "known_spell_limit_reached", `This character already has the level-${state.character.level} limit of ${limit ?? 0} leveled spells.`);
    }
  }

  const next = cloneCampaign(state);
  const reference = spellReference(spell.contentKey, spell.packHash);
  next.character.spellcasting!.knownSpells.push(reference);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${spell.definition.name} is added to ${progression.selectionMode === "spellbook" ? "the spellbook" : "the known spell repertoire"}.`,
    { spell: spell.definition, spellcasting: next.character.spellcasting },
    "spell_learned",
    [],
    [],
    [{ path: "/character/spellcasting/knownSpells", before: spellcasting.knownSpells, after: next.character.spellcasting!.knownSpells }]
  );
}

function resolvePrepareSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "prepare_spell" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  if (progression.selectionMode === "known") {
    return rejection(state, tool, "preparation_not_used", `${progression.className} casts known spells and does not prepare them.`);
  }
  const spell = resolveSpellRecord(state, command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  if (spell.definition.level === 0) {
    return rejection(state, tool, "cantrip_preparation_not_used", "Cantrips are cast from known cantrips and are not prepared.");
  }
  const runtime = command.spellKey.startsWith("runtime:spell:");
  const classList = runtime ? null : getOpen5eSpellList(state.character.className);
  if (!runtime && !classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!runtime && !classList!.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList!.className} spell list.`);
  }
  if (spell.definition.level > highestAvailableSlotLevel(spellcasting.slotMaximums)) {
    return rejection(state, tool, "spell_level_unavailable", `${spell.definition.name} is above this character's available spell levels.`);
  }
  if (progression.selectionMode === "spellbook" && !hasPinnedSpell(spellcasting.knownSpells, spell.contentKey, spell.packHash)) {
    return rejection(state, tool, "spell_not_in_spellbook", `${spell.definition.name} must be learned into the spellbook before it can be prepared.`);
  }

  const existingIndex = spellcasting.preparedSpells.findIndex((candidate) => candidate.contentKey === spell.contentKey);
  if (!command.prepared) {
    if (existingIndex < 0) return rejection(state, tool, "spell_not_prepared", `${spell.definition.name} is not prepared.`);
    const next = cloneCampaign(state);
    next.character.spellcasting!.preparedSpells.splice(existingIndex, 1);
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${spell.definition.name} is no longer prepared.`,
      { spell: spell.definition, spellcasting: next.character.spellcasting },
      "spell_unprepared",
      [],
      [],
      [{ path: "/character/spellcasting/preparedSpells", before: spellcasting.preparedSpells, after: next.character.spellcasting!.preparedSpells }]
    );
  }
  if (existingIndex >= 0) {
    const existing = spellcasting.preparedSpells[existingIndex];
    if (existing?.packHash !== spell.packHash) {
      return rejection(state, tool, "content_pack_mismatch", `${spell.definition.name} is pinned to a different content pack and requires an explicit repin.`);
    }
    return rejection(state, tool, "spell_already_prepared", `${spell.definition.name} is already prepared.`);
  }
  const capacity = preparedSpellCapacity(state.character, progression.preparedFormula);
  if (spellcasting.preparedSpells.length >= capacity) {
    return rejection(state, tool, "prepared_spell_limit_reached", `This character can prepare ${capacity} leveled spells.`);
  }
  const next = cloneCampaign(state);
  next.character.spellcasting!.preparedSpells.push(spellReference(spell.contentKey, spell.packHash));
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${spell.definition.name} is prepared.`,
    { spell: spell.definition, preparedCapacity: capacity, spellcasting: next.character.spellcasting },
    "spell_prepared",
    [],
    [],
    [{ path: "/character/spellcasting/preparedSpells", before: spellcasting.preparedSpells, after: next.character.spellcasting!.preparedSpells }]
  );
}

function resolveCastSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "cast_spell" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  const spell = resolveSpellRecord(state, command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  const runtimeDefinition = command.spellKey.startsWith("runtime:spell:")
    ? state.runtimeContent.definitions.find((candidate): candidate is RuntimeSpellDefinition =>
      candidate.kind === "spell" && candidate.id === command.spellKey
    )
    : null;
  const synthesisEvidenceContentKeys = runtimeDefinition?.execution?.primitiveContentKey
    ? [runtimeDefinition.execution.primitiveContentKey]
    : [];
  const availableReferences = spell.definition.level === 0 || progression.selectionMode === "known"
    ? spellcasting.knownSpells
    : spellcasting.preparedSpells;
  if (!hasPinnedSpell(availableReferences, spell.contentKey, spell.packHash)) {
    const mismatched = availableReferences.some((candidate) => candidate.contentKey === spell.contentKey);
    return rejection(
      state,
      tool,
      mismatched ? "content_pack_mismatch" : "spell_not_available",
      mismatched
        ? `${spell.definition.name} is pinned to a different content pack and requires an explicit repin.`
        : `${spell.definition.name} is not currently ${spell.definition.level === 0 || progression.selectionMode === "known" ? "known" : "prepared"}.`
    );
  }
  if (!spell.effect) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${spell.definition.name} is preserved as Open5e prose but has no reviewed S4 executable primary effect.`
    );
  }
  if (state.combat.status !== "active") {
    return rejection(state, tool, "no_active_combat", "S4 executable spell effects currently resolve against combatants in an active encounter.");
  }
  if (hasRuntimeCondition(state, state.character.id, "unconscious")) {
    return rejection(state, tool, "unconscious", "You cannot cast while unconscious.");
  }

  const castingTime = spell.definition.castingTime;
  if (castingTime !== "action" && castingTime !== "bonus-action" && castingTime !== "reaction") {
    return rejection(state, tool, "content_tier_insufficient", `${spell.definition.name}'s ${castingTime} casting time is not executable in an encounter turn.`);
  }
  if (castingTime !== "reaction" && state.combat.activeActorId !== state.actorId) {
    return rejection(state, tool, "off_turn", "It is not your turn; only a reaction spell can be cast now.");
  }
  if (castingTime === "action" && state.combat.turnBudget.action.spent) {
    return rejection(state, tool, "action_already_used", "Your action is already spent this turn.");
  }
  if (castingTime === "bonus-action" && state.combat.turnBudget.bonusAction.spent) {
    return rejection(state, tool, "bonus_action_already_used", "Your bonus action is already spent this turn.");
  }
  if (castingTime === "reaction" && state.combat.turnBudget.reaction.spent) {
    return rejection(state, tool, "reaction_already_used", "Your reaction is already spent this round.");
  }

  if (spell.effect.effectKind === "healing") {
    if (command.area) return rejection(state, tool, "unexpected_tactical_area", "A healing spell in this slice does not accept tactical area aim data.");
    return resolveHealingSpell(
      state,
      context,
      clientCommandId,
      command,
      tool,
      spell,
      spellcasting,
      synthesisEvidenceContentKeys,
    );
  }
  if (spell.effect.effectKind === "stat-modifier") {
    if (command.area) return rejection(state, tool, "unexpected_tactical_area", "This reaction spell does not accept tactical area aim data.");
    return resolveShieldCast(state, context, clientCommandId, command, tool, spell, spellcasting);
  }

  const reviewedArea = reviewedTacticalSpellArea(spell);
  if (reviewedArea && "code" in reviewedArea) return rejection(state, tool, reviewedArea.code, reviewedArea.message);
  if (reviewedArea && command.targetIds.length > 0) {
    return rejection(state, tool, "area_targets_server_owned", "Do not supply target ids for a reviewed area spell; the engine derives affected actors from canonical geometry.");
  }
  if (reviewedArea && !command.area) {
    return rejection(state, tool, "tactical_area_required", `${spell.definition.name} requires the current geometry revision and one aim cell.`);
  }
  if (!reviewedArea && command.area) {
    return rejection(state, tool, "unexpected_tactical_area", `${spell.definition.name} is not a reviewed tactical area spell.`);
  }
  if (reviewedArea && command.area!.geometryRevision !== state.combat.tactical.geometry.revision) {
    return rejection(state, tool, "stale_tactical_geometry", "The tactical geometry changed; re-aim the spell from the current revision.");
  }

  const slotSelection = selectSpellSlot(spell.definition.level, command.slotLevel, spellcasting.slots);
  if ("code" in slotSelection) return rejection(state, tool, slotSelection.code, slotSelection.message);
  const selectedSlotLevel = slotSelection.slotLevel;
  const slotOption = selectedSlotLevel === null
    ? null
    : spell.definition.castingOptions.find((option) => option.type === `slot_level_${selectedSlotLevel}`) ?? null;
  if (
    selectedSlotLevel !== null
    && selectedSlotLevel > spell.definition.level
    && spell.definition.higherLevel.trim()
    && !slotOption
    && !spell.effect.slotLevelVariants[String(selectedSlotLevel)]
  ) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${spell.definition.name}'s level-${selectedSlotLevel} upcast is described only in prose and is not executable in S4.`
    );
  }
  const damageExpression = selectSpellDamage(spell.effect, spell.definition.level, selectedSlotLevel, state.character.level);
  const targetLimit = slotOption?.targetCount ?? spell.definition.targetCount;
  const tacticalAreaResult = reviewedArea
    ? deriveTacticalAreaSnapshot(
        state.combat.tactical.geometry,
        state.character.id,
        state.combat.tactical.actorPosition,
        state.combat.tactical.actorFootprint,
        state.combat.enemies,
        state.controlledActors,
        command.area!.aim,
        reviewedArea,
        spellAreaAimRangeFeet(spell.definition),
      )
    : null;
  if (tacticalAreaResult && "code" in tacticalAreaResult) {
    return rejection(state, tool, tacticalAreaResult.code, tacticalAreaResult.message);
  }
  const tacticalArea = tacticalAreaResult as EngineTacticalAreaSnapshot | null;
  const selectedIds = tacticalArea ? tacticalArea.targetIds : [...new Set(command.targetIds)];
  if (!tacticalArea && selectedIds.length === 0) {
    return rejection(state, tool, "target_required", `Choose at least one living target for ${spell.definition.name}.`);
  }
  if (
    !tacticalArea
    && (spell.definition.targetType === "creature" || spell.definition.targetType === "object")
    && targetLimit !== null
    && selectedIds.length !== targetLimit
  ) {
    return rejection(state, tool, "invalid_target_count", `${spell.definition.name} requires ${targetLimit} target selection${targetLimit === 1 ? "" : "s"} at this casting level.`);
  }
  const targets = selectedIds.map((targetId) => {
    if (tacticalArea && targetId === state.character.id) return { kind: "character" as const, targetId };
    const controlledActor = tacticalArea
      ? state.controlledActors.find((actor) => actor.id === targetId && actor.status === "active" && actor.hp > 0) ?? null
      : null;
    return controlledActor
      ? { kind: "controlled" as const, targetId, controlledActor }
      : { kind: "enemy" as const, targetId, combatant: findLiveCombatant(state.combat, targetId) };
  });
  if (targets.some((target) => target.kind === "enemy" && target.combatant === null)) {
    return rejection(state, tool, "invalid_spell_target", "Every spell target must be a living combatant in the active encounter.");
  }
  const rangeFeet = executableSpellRangeFeet(spell.definition);
  const outOfRange = tacticalArea
    ? undefined
    : targets.find((target) => target.kind === "enemy" && target.combatant !== null && tacticalDistanceFeet(state.combat, target.combatant) > rangeFeet);
  if (outOfRange) {
    const distanceFeet = tacticalDistanceFeet(state.combat, outOfRange.combatant!);
    return rejection(
      state,
      tool,
      "spell_target_out_of_range",
      `${spell.definition.name} can currently resolve through ${rangeFeet} feet; target ${outOfRange.targetId} is ${distanceFeet} feet away.`
    );
  }
  if (spell.effect.resolution === "spell-attack") {
    const coveredTarget = targets.find((target) => target.kind === "enemy" && target.combatant && deriveTacticalCover(
      state.combat.tactical.geometry,
      state.combat.tactical.actorPosition,
      state.combat.tactical.actorFootprint,
      target.combatant.position,
      target.combatant.footprint,
    ).level === "total");
    if (coveredTarget) {
      return rejection(state, tool, "target_has_total_cover", "Canonical blocking geometry gives that spell target total cover from your position.");
    }
  }

  const next = cloneCampaign(state);
  if (selectedSlotLevel !== null) next.character.spellcasting!.slots[String(selectedSlotLevel)] -= 1;
  if (castingTime === "action") spendTurnSlot(next.combat.turnBudget, "action");
  else if (castingTime === "bonus-action") spendTurnSlot(next.combat.turnBudget, "bonusAction");
  else spendTurnSlot(next.combat.turnBudget, "reaction");
  if (spell.definition.concentration) {
    next.character.spellcasting!.concentration = {
      contentKey: spell.contentKey,
      packHash: spell.packHash,
      startedRound: next.combat.round,
    };
  }

  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (selectedSlotLevel !== null) {
    changes.push({
      path: `/character/spellcasting/slots/${selectedSlotLevel}`,
      before: spellcasting.slots[String(selectedSlotLevel)],
      after: next.character.spellcasting!.slots[String(selectedSlotLevel)],
    });
  }
  if (spell.definition.concentration) {
    changes.push({
      path: "/character/spellcasting/concentration",
      before: spellcasting.concentration,
      after: next.character.spellcasting!.concentration,
    });
  }
  changes.push({
    path: `/combat/turnBudget/${castingTime === "bonus-action" ? "bonusAction" : castingTime === "reaction" ? "reaction" : "action"}/spent`,
    before: false,
    after: true,
  });

  const targetResults: Array<Record<string, unknown>> = [];
  for (const [index, sourceTarget] of targets.entries()) {
    const isCharacter = sourceTarget.kind === "character";
    const sourceEnemy = sourceTarget.kind === "enemy" ? sourceTarget.combatant : null;
    const sourceControlled = sourceTarget.kind === "controlled" ? sourceTarget.controlledActor : null;
    const target = sourceEnemy
      ? next.combat.enemies.find((candidate) => candidate.id === sourceEnemy.id && candidate.alive) ?? null
      : null;
    const controlledTarget = sourceControlled
      ? next.controlledActors.find((candidate) => candidate.id === sourceControlled.id && candidate.status === "active" && candidate.hp > 0) ?? null
      : null;
    if (!isCharacter && !target && !controlledTarget) continue;
    const targetView = target ? materializeCombatant(target) : null;
    const controlledDefenses = controlledTarget ? controlledActorProfile(controlledTarget.profileId) : null;
    const targetId = isCharacter ? next.character.id : controlledTarget?.id ?? target!.id;
    const targetName = isCharacter ? next.character.name : controlledTarget?.name ?? targetView!.name;
    let successfulSave: boolean | null = null;
    let hit = true;
    let critical = false;
    let attackTotal: number | null = null;
    let saveTotal: number | null = null;
    const cover = spell.effect.resolution === "spell-attack" && sourceEnemy
      ? deriveTacticalCover(
          state.combat.tactical.geometry,
          state.combat.tactical.actorPosition,
          state.combat.tactical.actorFootprint,
          sourceEnemy.position,
          sourceEnemy.footprint,
        )
      : null;

    if (spell.effect.resolution === "spell-attack") {
      const die = randomInt(1, 21);
      attackTotal = die + spellcasting.spellAttackBonus;
      critical = die === 20;
      const targetArmorClass = isCharacter
        ? next.character.ac
        : controlledDefenses
          ? controlledDefenses.armorClass
          : targetView!.armorClass + (cover?.armorClassBonus ?? 0);
      hit = die !== 1 && (critical || attackTotal >= targetArmorClass);
      rolls.push({ kind: `spell_attack_${index + 1}`, value: die, sides: 20 });
      modifiers.push(
        { name: `spell_attack_bonus_${index + 1}`, value: spellcasting.spellAttackBonus },
        { name: `spell_target_ac_${index + 1}`, value: targetArmorClass },
        ...(cover && cover.armorClassBonus
          ? [{ name: `spell_${cover.level}_cover_ac_${index + 1}`, value: cover.armorClassBonus }]
          : []),
      );
    } else if (spell.effect.resolution === "saving-throw") {
      const ability = spell.definition.savingThrowAbility;
      if (!ability) return rejection(state, tool, "content_tier_insufficient", `${spell.definition.name} has no structured saving throw ability.`);
      const die = randomInt(1, 21);
      const saveModifier = isCharacter
        ? next.character.savingThrows[ability]
        : controlledDefenses
          ? controlledDefenses.savingThrows[ability]
          : targetView!.savingThrowsAll[ability];
      saveTotal = die + saveModifier;
      successfulSave = saveTotal >= spellcasting.spellSaveDc;
      rolls.push({ kind: `spell_save_${ability}_${index + 1}`, value: die, sides: 20 });
      modifiers.push({ name: `target_${ability}_save_${index + 1}`, value: saveModifier });
    }

    const rolled = hit ? rollSpellDamage(damageExpression, critical, rolls, index + 1) : 0;
    const afterSave = successfulSave
      ? spell.effect.saveOnSuccess === "half" ? Math.floor(rolled / 2) : 0
      : rolled;
    const damage = isCharacter || controlledTarget
      ? afterSave
      : applyCreatureDamageAffinity(targetView!, spell.effect.damageType.contentKey, afterSave);
    const beforeHp = isCharacter ? next.character.hp : controlledTarget?.hp ?? target!.hp;
    if (isCharacter) {
      applyCharacterDamage(next, damage, "spell-area-self", clientCommandId, changes, rolls, modifiers, critical);
    } else if (controlledTarget) {
      applyControlledActorDamage(next, controlledTarget, damage, changes);
    } else {
      target!.hp = Math.max(0, target!.hp - damage);
      target!.alive = target!.hp > 0;
      changes.push({ path: `/combat/enemies/${target!.id}/hp`, before: beforeHp, after: target!.hp });
    }
    const hpAfter = isCharacter ? next.character.hp : controlledTarget?.hp ?? target!.hp;
    targetResults.push({
      targetId,
      targetName,
      hit,
      critical,
      attackTotal,
      cover,
      successfulSave,
      saveTotal,
      damageRolled: rolled,
      damageApplied: damage,
      damageType: spell.effect.damageType.name,
      hpBefore: beforeHp,
      hpAfter,
      defeated: hpAfter === 0,
    });
  }

  const defeatedAll = !next.combat.enemies.some((combatant) => combatant.alive);
  if (defeatedAll) {
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    changes.push({ path: "/combat/status", before: "active", after: "ended" });
  } else if (castingTime === "action") {
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
  }
  next.combat.lastAction = `cast:${spell.contentKey}`;

  const totalDamage = targetResults.reduce((sum, result) => sum + Number(result.damageApplied ?? 0), 0);
  const slotText = selectedSlotLevel === null ? " as a cantrip" : ` with a level-${selectedSlotLevel} slot`;
  const message = `${spell.definition.name} resolves${slotText}: ${totalDamage} total ${spell.effect.damageType.name.toLowerCase()} damage across ${targetResults.length} engine-derived target${targetResults.length === 1 ? "" : "s"}.`
    + (spell.effect.hasDeferredProseEffects ? " Only the reviewed primary damage is applied; additional source-prose effects remain deferred." : "")
    + (defeatedAll ? " The encounter ends." : castingTime === "action" ? " The opposition now has the turn." : "");
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      spell: spell.definition,
      slotLevel: selectedSlotLevel,
      area: tacticalArea,
      targetResults,
      deferredProseEffects: spell.effect.hasDeferredProseEffects,
      range: { source: spell.definition.range, executableFeet: rangeFeet },
      combat: combatData(next.combat),
      character: characterData(next.character, next.runtimeContent),
    },
    defeatedAll ? "spell_encounter_ended" : "spell_cast",
    rolls,
    modifiers,
    changes,
    [
      ...synthesisEvidenceContentKeys,
      ...(reviewedArea ? [reviewedArea.contentKey] : []),
    ],
  );
}

function resolveHealingSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "cast_spell" }>,
  tool: EngineToolName | "declare" | "listen",
  spell: NonNullable<ReturnType<typeof getOpen5eSpell>>,
  spellcasting: NonNullable<EngineCharacter["spellcasting"]>,
  synthesisEvidenceContentKeys: string[] = [],
  scrollUse?: ReviewedSpellScrollUse,
): EngineResolution {
  const effect = spell.effect;
  if (!effect || effect.effectKind !== "healing") {
    return rejection(state, tool, "unsupported_effect", "That spell does not contain a reviewed healing effect.");
  }
  const selectedIds = command.targetIds.length > 0 ? [...new Set(command.targetIds)] : [state.character.id];
  if (selectedIds.length !== 1 || selectedIds[0] !== state.character.id) {
    return rejection(state, tool, "invalid_spell_target", "This healing slice currently resolves one touch target: the player character.");
  }
  if (state.character.hp >= state.character.maxHp) {
    return rejection(state, tool, "already_full_health", "The target is already at full hit points.");
  }
  const slotSelection = scrollUse
    ? { slotLevel: null }
    : selectSpellSlot(spell.definition.level, command.slotLevel, spellcasting.slots);
  if ("code" in slotSelection) return rejection(state, tool, slotSelection.code, slotSelection.message);
  const selectedSlotLevel = slotSelection.slotLevel;
  if (selectedSlotLevel !== null && selectedSlotLevel > spell.definition.level && !effect.slotLevelVariants[String(selectedSlotLevel)]) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${spell.definition.name}'s level-${selectedSlotLevel} upcast is not executable from reviewed structured data.`
    );
  }
  const expression = selectSpellHealing(effect, spell.definition.level, selectedSlotLevel);
  const ability = effect.healingAbility === "spellcasting" ? spellcasting.ability : effect.healingAbility;
  const abilityBonus = open5eAbilityModifier(state.character.abilities[ability]);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const amount = rollHealing(expression, abilityBonus, rolls);
  modifiers.push({ name: `${ability}_modifier`, value: abilityBonus });
  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (!scrollUse && selectedSlotLevel !== null) {
    next.character.spellcasting!.slots[String(selectedSlotLevel)] -= 1;
    changes.push({
      path: `/character/spellcasting/slots/${selectedSlotLevel}`,
      before: spellcasting.slots[String(selectedSlotLevel)],
      after: next.character.spellcasting!.slots[String(selectedSlotLevel)],
    });
  }
  const castingTime = spell.definition.castingTime;
  if (castingTime === "action") spendTurnSlot(next.combat.turnBudget, "action");
  else if (castingTime === "bonus-action") spendTurnSlot(next.combat.turnBudget, "bonusAction");
  else spendTurnSlot(next.combat.turnBudget, "reaction");
  changes.push({
    path: `/combat/turnBudget/${castingTime === "bonus-action" ? "bonusAction" : castingTime === "reaction" ? "reaction" : "action"}/spent`,
    before: false,
    after: true,
  });
  const healing = applyHealing(next, amount, `spell:${spell.contentKey}`, changes);
  if (healing.healed <= 0) {
    return rejection(state, tool, "already_full_health", "The target is already at full hit points.");
  }
  if (scrollUse) {
    const consumed = next.character.inventory.find((candidate) => candidate.id === scrollUse.item.id);
    if (!consumed || consumed.quantity <= 0) {
      return rejection(state, tool, "item_not_found", "That scroll is no longer in your inventory.");
    }
    consumed.quantity -= 1;
    if (consumed.quantity <= 0) {
      next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== scrollUse.item.id);
    }
    changes.push({ path: "/character/inventory", before: state.character.inventory, after: next.character.inventory });
  }
  if (castingTime === "action") next.combat.activeActorId = firstLiveCombatantId(next.combat);
  next.combat.lastAction = scrollUse
    ? `use:${scrollUse.item.id}:${spell.contentKey}`
    : `cast:${spell.contentKey}`;
  const slotText = selectedSlotLevel === null ? " as a cantrip" : ` with a level-${selectedSlotLevel} slot`;
  const turnText = castingTime === "action" ? " The opposition now has the turn." : "";
  const message = scrollUse
    ? `${scrollUse.itemView.name} casts ${spell.definition.name}: ${healing.healed} hit points restored. The scroll crumbles to dust.${turnText}`
    : `${spell.definition.name} resolves${slotText}: ${healing.healed} hit points restored.${turnText}`;
  return commit(
    next,
    context,
    clientCommandId,
    scrollUse?.command ?? command,
    tool,
    message,
    {
      ...(scrollUse ? {
        resource: {
          kind: "spell-scroll",
          policyRevision: scrollUse.definition.policyRevision,
          activationPolicy: scrollUse.definition.activationPolicy,
        },
        item: scrollUse.itemView,
        sourceItem: {
          contentKey: scrollUse.definition.sourceItemContentKey,
          packHash: scrollUse.definition.packHash,
        },
      } : {}),
      spell: spell.definition,
      spellReference: { contentKey: spell.contentKey, packHash: spell.packHash },
      effectKind: "healing",
      slotLevel: scrollUse ? null : selectedSlotLevel,
      targetId: state.character.id,
      healing,
      range: { source: spell.definition.range, executableFeet: executableSpellRangeFeet(spell.definition) },
      combat: combatData(next.combat),
      character: characterData(next.character, next.runtimeContent),
      deferredProseEffects: effect.hasDeferredProseEffects,
    },
    scrollUse ? "spell_scroll_used" : "spell_healing",
    rolls,
    modifiers,
    changes,
    scrollUse
      ? [scrollUse.definition.sourceItemContentKey, scrollUse.definition.spellContentKey]
      : synthesisEvidenceContentKeys,
  );
}

function resolveShieldCast(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "cast_spell" }>,
  tool: EngineToolName | "declare" | "listen",
  spell: NonNullable<ReturnType<typeof getOpen5eSpell>>,
  _spellcasting: NonNullable<EngineCharacter["spellcasting"]>
): EngineResolution {
  if (!state.combat.pendingReaction) {
    return rejection(state, tool, "reaction_trigger_required", `${spell.definition.name} can only be cast in response to a server-offered incoming hit.`);
  }
  return resolveReactionResponse(
    state,
    context,
    clientCommandId,
    {
      kind: "reaction_response",
      reactionId: command.reactionId ?? state.combat.pendingReaction.id,
      decision: "accept",
      spellKey: spell.contentKey,
      slotLevel: command.slotLevel,
    },
    tool
  );
}

function completePendingMovementTrigger(
  state: LanternCampaignState,
  pending: EnginePendingReaction,
  hit: boolean,
  damageApplied: number,
  hpBefore: number,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
): void {
  if (pending.resumeMode !== "continue-character-turn" || !pending.movementTriggerId) return;
  const trigger = state.combat.tactical.lastPlan?.triggers.find((candidate) => candidate.id === pending.movementTriggerId);
  if (!trigger?.resolution || trigger.resolution.status !== "reaction_pending") return;
  const before = { ...trigger.resolution };
  trigger.resolution = {
    status: "resolved",
    actionKey: before.actionKey,
    attackContentKey: before.attackContentKey,
    reactionSpent: true,
    hit,
    critical: pending.critical,
    damageApplied,
    hpBefore,
    hpAfter: state.character.hp,
  };
  changes.push({
    path: `/combat/tactical/lastPlan/triggers/${trigger.id}/resolution`,
    before,
    after: trigger.resolution,
  });
}

function pendingReactionTurnSuffix(
  state: LanternCampaignState,
  pending: EnginePendingReaction,
  enemyId: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
): string {
  if (pending.resumeMode === "finish-creature-turn") return finishCreatureTurn(state, enemyId, changes);
  return state.character.hp === 0
    ? " Your movement ends here because you are unconscious."
    : " You may continue your turn from this position.";
}

function resolveReactionResponse(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "reaction_response" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter.");
  const pending = state.combat.pendingReaction;
  if (!pending) return rejection(state, tool, "reaction_not_found", "There is no pending reaction to resolve.");
  if (pending.status !== "offered") return rejection(state, tool, "reaction_already_resolved", "That reaction offer has already been resolved.");
  if (pending.id !== command.reactionId) return rejection(state, tool, "reaction_mismatch", "That reaction id does not match the pending incoming hit.");
  if (pending.actorId !== context.actorId || pending.targetId !== state.character.id) {
    return rejection(state, tool, "reaction_not_authorized", "Only the targeted character may resolve this reaction.");
  }
  const enemy = findLiveCombatant(state.combat, pending.attackerId);
  if (!enemy) return rejection(state, tool, "combatant_not_found", "The attacker for this reaction is no longer in the encounter.");
  const cover = incomingCharacterCover(state, enemy);

  if (command.decision === "decline") {
    const next = cloneCampaign(state);
    const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
    const modifiers: Array<{ name: string; value: number }> = [{ name: "armor_class", value: pending.originalArmorClass }];
    const changes: Array<{ path: string; before: unknown; after: unknown }> = [
      { path: "/combat/pendingReaction", before: pending, after: null },
    ];
    next.combat.pendingReaction = null;
    const damage = rollStoredReactionDamage(pending, rolls);
    const hpBefore = next.character.hp;
    const applied = applyCharacterDamage(next, damage, "reaction", clientCommandId, changes, rolls, modifiers, pending.critical);
    completePendingMovementTrigger(next, pending, true, applied.applied, hpBefore, changes);
    next.combat.lastAction = `reaction:${pending.id}:declined`;
    const turnSuffix = pendingReactionTurnSuffix(next, pending, enemy.id, changes);
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `You decline the offered reaction. ${pending.attackName} hits for ${damage} ${pending.damageType.toLocaleLowerCase("en-US")} damage.${turnSuffix}`,
      {
        reactionId: pending.id,
        decision: "decline",
        resumeMode: pending.resumeMode,
        attackTotal: pending.attackTotal,
        armorClass: pending.originalArmorClass,
        cover,
        damage: { rolled: damage, applied: damage, type: pending.damageType },
        combat: combatData(next.combat),
        character: characterData(next.character, next.runtimeContent),
      },
      next.character.hp === 0 ? "downed" : "reaction_declined",
      rolls,
      modifiers,
      changes,
      [pending.sourceActionKey]
    );
  }

  const spellKey = command.spellKey ?? pending.eligibleReactionIds[0];
  if (!spellKey || !pending.eligibleReactionIds.includes(spellKey)) {
    return rejection(state, tool, "reaction_not_eligible", "The selected reaction spell was not offered for this incoming hit.");
  }
  const spell = eligibleIncomingHitReactions(state).find((candidate) => candidate.contentKey === spellKey) ?? null;
  const spellcasting = state.character.spellcasting;
  if (!spell || !spell.effect || spell.effect.effectKind !== "stat-modifier") {
    return rejection(state, tool, "unsupported_effect", "Only a reviewed incoming-hit stat modifier can resolve this reaction.");
  }
  if (spell.effect.modifier.trigger !== pending.trigger || spell.definition.castingTime !== "reaction") {
    return rejection(state, tool, "reaction_not_eligible", "That spell is not a reviewed incoming-hit reaction.");
  }
  if (!spellcasting) return rejection(state, tool, "spellcasting_unavailable", "This character cannot cast a reaction spell.");
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!progression) return rejection(state, tool, "spellcasting_unavailable", "This character has no installed spellcasting progression.");
  const references = spell.definition.level === 0 || progression.selectionMode === "known"
    ? spellcasting.knownSpells
    : spellcasting.preparedSpells;
  if (!hasPinnedSpell(references, spell.contentKey, spell.packHash)) {
    return rejection(state, tool, "spell_not_available", `${spell.definition.name} is not currently available to cast.`);
  }
  if (state.combat.turnBudget.reaction.spent) return rejection(state, tool, "reaction_already_used", "Your reaction is already spent this round.");
  const slotSelection = selectSpellSlot(spell.definition.level, command.slotLevel, spellcasting.slots);
  if ("code" in slotSelection) return rejection(state, tool, slotSelection.code, slotSelection.message);
  const selectedSlotLevel = slotSelection.slotLevel;
  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/combat/pendingReaction", before: pending, after: null },
  ];
  next.combat.pendingReaction = null;
  if (selectedSlotLevel !== null) {
    next.character.spellcasting!.slots[String(selectedSlotLevel)] -= 1;
    changes.push({
      path: `/character/spellcasting/slots/${selectedSlotLevel}`,
      before: spellcasting.slots[String(selectedSlotLevel)],
      after: next.character.spellcasting!.slots[String(selectedSlotLevel)],
    });
  }
  spendTurnSlot(next.combat.turnBudget, "reaction");
  changes.push({ path: "/combat/turnBudget/reaction/spent", before: false, after: true });
  applyRuntimeEffect(
    next,
    effectInput(
      next,
      `spell:${spell.contentKey}`,
      `spell:${spell.contentKey}`,
      [next.character.id],
      [{ kind: "stat-modifier", stat: "armor-class", value: spell.effect.modifier.amount, stackingKey: spell.effect.modifier.stackingKey }],
      spell.effect.modifier.duration,
      spell.effect.modifier.stackingKey,
      "replace",
      ["duration"],
      clientCommandId,
    ),
    changes,
  );
  const baseAcBefore = state.character.ac;
  const acBefore = pending.originalArmorClass;
  const baseAcAfter = deriveArmorClass(next.character, next.effects);
  next.character.ac = baseAcAfter;
  changes.push({ path: "/character/ac", before: baseAcBefore, after: baseAcAfter });
  const acAfter = baseAcAfter + (cover.armorClassBonus ?? 0);
  const hitAfter = cover.level !== "total" && pending.attackRoll !== 1 && (pending.critical || pending.attackTotal >= acAfter);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [
    { name: "attack_total", value: pending.attackTotal },
    { name: "armor_class_before", value: acBefore },
    { name: "armor_class_after", value: acAfter },
  ];
  let damage = 0;
  const hpBefore = next.character.hp;
  if (hitAfter) {
    damage = rollStoredReactionDamage(pending, rolls);
    applyCharacterDamage(next, damage, "reaction", clientCommandId, changes, rolls, modifiers, pending.critical);
  }
  completePendingMovementTrigger(next, pending, hitAfter, damage, hpBefore, changes);
  next.combat.lastAction = `reaction:${pending.id}:spell`;
  const turnSuffix = pendingReactionTurnSuffix(next, pending, enemy.id, changes);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${spell.definition.name} resolves: AC rises from ${acBefore} to ${acAfter}; the stored attack ${hitAfter ? "still hits" : "misses"}${hitAfter ? ` for ${damage} ${pending.damageType.toLocaleLowerCase("en-US")} damage` : ""}.${turnSuffix}`,
    {
      reactionId: pending.id,
      decision: "accept",
      resumeMode: pending.resumeMode,
      spell: spell.definition,
      slotLevel: selectedSlotLevel,
      attackTotal: pending.attackTotal,
      acBefore,
      acAfter,
      cover,
      armorClassComponents: queryStatModifier(next.effects, next.character.id, "armor-class").components,
      hitAfter,
      damage: { rolled: damage, applied: damage, type: pending.damageType },
      combat: combatData(next.combat),
      character: characterData(next.character, next.runtimeContent),
    },
    next.character.hp === 0 ? "downed" : hitAfter ? "reaction_resolved_hit" : "reaction_resolved_miss",
    rolls,
    modifiers,
    changes,
    [spell.contentKey, ...runtimeSpellPrimitiveEvidence(state, spell.contentKey), pending.sourceActionKey]
  );
}

function selectSpellHealing(
  effect: Extract<CompiledSpellEffect, { effectKind: "healing" }>,
  spellLevel: number,
  slotLevel: number | null
): Extract<CompiledSpellEffect, { effectKind: "healing" }>["baseHealing"] {
  if (spellLevel > 0 && slotLevel !== null) return effect.slotLevelVariants[String(slotLevel)] ?? effect.baseHealing;
  return effect.baseHealing;
}

function rollHealing(
  expression: Extract<CompiledSpellEffect, { effectKind: "healing" }>["baseHealing"],
  abilityBonus: number,
  rolls: Array<{ kind: string; value: number; sides?: number }>
): number {
  if (expression.kind === "flat") return Math.max(0, expression.amount + abilityBonus);
  let total = expression.bonus + abilityBonus;
  for (let index = 0; index < expression.diceCount; index += 1) {
    const die = randomInt(1, expression.dieSides + 1);
    total += die;
    rolls.push({ kind: "healing_dice", value: die, sides: expression.dieSides });
  }
  return Math.max(0, total);
}

function rollStoredReactionDamage(
  pending: EnginePendingReaction,
  rolls: Array<{ kind: string; value: number; sides?: number }>
): number {
  let total = pending.damageBonus;
  for (let index = 0; index < pending.damageDiceCount; index += 1) {
    const die = randomInt(1, pending.damageDieSides + 1);
    total += die;
    rolls.push({ kind: "reaction_damage", value: die, sides: pending.damageDieSides });
  }
  return Math.max(0, total);
}

function spellReference(contentKey: string, packHash: string): EngineSpellReference {
  return { contentKey, packHash };
}

function hasPinnedSpell(references: EngineSpellReference[], contentKey: string, packHash: string): boolean {
  return references.some((reference) => reference.contentKey === contentKey && reference.packHash === packHash);
}

function eligibleIncomingHitReactions(state: LanternCampaignState): EngineSpellRecord[] {
  const spellcasting = state.character.spellcasting;
  if (!spellcasting || state.combat.turnBudget.reaction.spent) return [];
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!progression) return [];
  const references = [...spellcasting.knownSpells, ...spellcasting.preparedSpells]
    .filter((reference, index, all) =>
      all.findIndex((candidate) => candidate.contentKey === reference.contentKey && candidate.packHash === reference.packHash) === index
    );
  return references
    .map((reference) => resolveSpellRecord(state, reference.contentKey, reference.packHash))
    .filter((spell): spell is EngineSpellRecord => {
      if (!spell?.effect || spell.effect.effectKind !== "stat-modifier") return false;
      const availableReferences = spell.definition.level === 0 || progression.selectionMode === "known"
        ? spellcasting.knownSpells
        : spellcasting.preparedSpells;
      const slotSelection = selectSpellSlot(spell.definition.level, undefined, spellcasting.slots);
      return spell.definition.castingTime === "reaction"
        && spell.effect.modifier.trigger === "incoming-attack-would-hit"
        && hasPinnedSpell(availableReferences, spell.contentKey, spell.packHash)
        && !("code" in slotSelection);
    })
    .sort((left, right) => left.contentKey.localeCompare(right.contentKey));
}

function highestAvailableSlotLevel(slotMaximums: Record<string, number>): number {
  return Object.entries(slotMaximums).reduce(
    (highest, [slotLevel, count]) => count > 0 ? Math.max(highest, Number(slotLevel)) : highest,
    0
  );
}

function preparedSpellCapacity(
  character: EngineCharacter,
  formula: { classLevelMultiplier: number; abilityModifierMultiplier: number; minimum: number } | null
): number {
  if (!character.spellcasting || !formula) return 0;
  return Math.max(
    formula.minimum,
    Math.floor(
      character.level * formula.classLevelMultiplier
      + character.abilityModifiers[character.spellcasting.ability] * formula.abilityModifierMultiplier
    )
  );
}

function selectSpellSlot(
  spellLevel: number,
  requestedSlotLevel: number | undefined,
  slots: Record<string, number>
): { slotLevel: number | null } | { code: string; message: string } {
  if (spellLevel === 0) {
    if (requestedSlotLevel !== undefined) return { code: "cantrip_no_slot", message: "Cantrips do not consume spell slots." };
    return { slotLevel: null };
  }
  if (requestedSlotLevel !== undefined && requestedSlotLevel < spellLevel) {
    return { code: "slot_level_too_low", message: `This spell requires a level-${spellLevel} slot or higher.` };
  }
  const slotLevel = requestedSlotLevel ?? Object.entries(slots)
    .filter(([candidate, remaining]) => Number(candidate) >= spellLevel && remaining > 0)
    .map(([candidate]) => Number(candidate))
    .sort((left, right) => left - right)[0];
  if (slotLevel === undefined || (slots[String(slotLevel)] ?? 0) <= 0) {
    return { code: "no_spell_slot", message: requestedSlotLevel === undefined ? "No legal spell slot remains." : `No level-${requestedSlotLevel} spell slot remains.` };
  }
  return { slotLevel };
}

function selectSpellDamage(
  effect: Extract<CompiledSpellEffect, { effectKind: "damage" }>,
  spellLevel: number,
  slotLevel: number | null,
  playerLevel: number
): Extract<CompiledSpellEffect, { effectKind: "damage" }>["baseDamage"] {
  if (spellLevel === 0) {
    const applicableLevel = Object.keys(effect.playerLevelVariants)
      .map(Number)
      .filter((candidate) => candidate <= playerLevel)
      .sort((left, right) => right - left)[0];
    return applicableLevel === undefined ? effect.baseDamage : effect.playerLevelVariants[String(applicableLevel)] ?? effect.baseDamage;
  }
  if (slotLevel !== null) return effect.slotLevelVariants[String(slotLevel)] ?? effect.baseDamage;
  return effect.baseDamage;
}

function rollSpellDamage(
  expression: Extract<CompiledSpellEffect, { effectKind: "damage" }>["baseDamage"],
  critical: boolean,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  targetIndex: number
): number {
  if (expression.kind === "flat") return expression.amount;
  const diceCount = expression.diceCount * (critical ? 2 : 1);
  let total = expression.bonus;
  for (let index = 0; index < diceCount; index += 1) {
    const die = randomInt(1, expression.dieSides + 1);
    total += die;
    rolls.push({ kind: `spell_damage_${targetIndex}`, value: die, sides: expression.dieSides });
  }
  return Math.max(0, total);
}

function applyCreatureDamageAffinity(
  target: EngineCombatantView,
  damageTypeContentKey: string,
  damage: number
): number {
  const immune = target.defenses.damageImmunities.some((reference) => reference.contentKey === damageTypeContentKey);
  if (immune) return 0;
  const resistant = target.defenses.damageResistances.some((reference) => reference.contentKey === damageTypeContentKey);
  const vulnerable = target.defenses.damageVulnerabilities.some((reference) => reference.contentKey === damageTypeContentKey);
  if (resistant && !vulnerable) return Math.floor(damage / 2);
  if (vulnerable && !resistant) return damage * 2;
  return damage;
}

function executableSpellRangeFeet(definition: NormalizedSpell): number {
  const sourceDistance = definition.range.unit.toLocaleLowerCase("en-US") === "miles"
    ? definition.range.distance * 5_280
    : definition.range.distance;
  const rangeText = definition.range.text.trim().toLocaleLowerCase("en-US");
  if (rangeText === "touch") return 5;
  if (rangeText === "self") return definition.area.size ?? 5;
  return sourceDistance + (definition.area.size ?? 0);
}

function spellAreaAimRangeFeet(definition: NormalizedSpell): number {
  const sourceDistance = definition.range.unit.toLocaleLowerCase("en-US") === "miles"
    ? definition.range.distance * 5_280
    : definition.range.distance;
  const rangeText = definition.range.text.trim().toLocaleLowerCase("en-US");
  if (rangeText === "touch") return 5;
  if (rangeText === "self") return 0;
  return sourceDistance;
}

export function deriveWeaponAttack(character: EngineCharacter, weaponId?: string): EngineWeaponAttack | null {
  const equippedWeapons = character.inventory
    .filter((item) => item.equipped && (item.slot === "mainhand" || item.slot === "offhand"))
    .map((item) => {
      try {
        const view = materializeInventoryItem(item);
        return view.kind === "weapon" ? { item, view } : null;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const selected = weaponId
    ? equippedWeapons.find((entry) => entry.item.id === weaponId)
    : equippedWeapons.find((entry) => entry.item.slot === "mainhand") ?? equippedWeapons[0];
  if (!selected) return null;
  const source = selected.item.contentKey
    ? getOpen5eEquipment(selected.item.contentKey, selected.item.packHash)
    : null;
  const properties = [...new Set((selected.view.properties ?? []).map((property) => property.trim().toLocaleLowerCase("en-US").replaceAll(" ", "-")))];
  const weaponRecord = source?.weapon ?? null;
  if (weaponRecord) {
    for (const property of weaponRecord.properties) {
      const key = (property.type ?? property.name).trim().toLocaleLowerCase("en-US").replaceAll(" ", "-");
      if (key && !properties.includes(key)) properties.push(key);
    }
  }
  const damageDice = weaponRecord?.damageDice ?? selected.view.damage?.match(/\d+d\d+/i)?.[0] ?? null;
  if (!damageDice) return null;
  const normalRangeFeet = weaponRecord?.range.normal ?? null;
  const longRangeFeet = weaponRecord?.range.long ?? null;
  const ranged = properties.includes("ranged") || (normalRangeFeet !== null && normalRangeFeet > 0);
  const finesse = properties.includes("finesse");
  const ability: EngineAbility = finesse
    ? (character.abilities.dex >= character.abilities.str ? "dex" : "str")
    : ranged ? "dex" : "str";
  const weaponName = selected.view.name;
  const proficiencies = character.proficiencies.weapons.map((entry) => entry.trim().toLocaleLowerCase("en-US"));
  const normalizedWeaponName = weaponName.toLocaleLowerCase("en-US");
  const pluralName = normalizedWeaponName.endsWith("s") ? normalizedWeaponName : normalizedWeaponName + "s";
  const proficient = Boolean(
    weaponRecord && (
      (weaponRecord.isSimple && proficiencies.includes("simple weapons"))
      || (weaponRecord.isMartial && proficiencies.includes("martial weapons"))
    )
  ) || proficiencies.some((entry) => entry === normalizedWeaponName || entry === pluralName);
  const abilityModifierValue = abilityModifier(character.abilities[ability]);
  const proficiencyBonus = character.proficiencyBonus;
  const attackBonus = abilityModifierValue + (proficient ? proficiencyBonus : 0);
  const ammunitionId = selected.view.ammunitionId
    ?? (properties.includes("ammunition") ? defaultAmmunitionId(weaponName) : undefined);
  const explanation = `${weaponName} uses ${ability.toUpperCase()} ${abilityModifierValue >= 0 ? "+" : ""}${abilityModifierValue}; `
    + `${proficient ? "proficiency applies" : "the character is not proficient"}; `
    + `damage is ${damageDice}${selected.view.damage?.match(/\s+([a-zA-Z][a-zA-Z -]*)$/)?.[1] ? ` ${selected.view.damage.match(/\s+([a-zA-Z][a-zA-Z -]*)$/)?.[1]}` : ""}.`;
  return {
    weaponId: selected.item.id,
    weaponName,
    ability,
    abilityModifier: abilityModifierValue,
    proficient,
    proficiencyBonus,
    attackBonus,
    damageDice,
    damageType: source?.weapon?.damageTypeName ?? selected.view.damage?.replace(/^\d+d\d+\s*/i, "") ?? "unknown",
    properties,
    reachFeet: weaponRecord?.range.normal === 0 ? 5 : (ranged ? null : 5),
    normalRangeFeet: normalRangeFeet && normalRangeFeet > 0 ? normalRangeFeet : null,
    longRangeFeet: longRangeFeet && longRangeFeet > 0 ? longRangeFeet : null,
    ammunitionId,
    explanation,
  };
}

function resolveCombatAction(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "combat_action" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter.");
  if (state.combat.activeActorId !== state.actorId) {
    return rejection(state, tool, "off_turn", "It is not your turn. End the enemy turn before acting again.");
  }
  if (state.combat.lifecycle?.phase === "resolving") {
    return rejection(state, tool, "surrender_decision_required", "Resolve the server-owned surrender offer before taking another combat action.");
  }
  const isAttackAction = command.action === "attack" || command.action === "attack_nonlethal";
  if (command.action === "attack_nonlethal" && !state.combat.lifecycle) {
    return rejection(state, tool, "unsupported_action", "Nonlethal defeat is available only in the reviewed encounter lifecycle profile.");
  }
  if (["dash", "disengage", "help", "ready"].includes(command.action)) {
    return rejection(state, tool, "unsupported_action", `${command.action} has no mechanical implementation in this combat profile yet.`);
  }
  if (hasRuntimeCondition(state, state.character.id, "unconscious")) {
    return rejection(state, tool, "unconscious", "You are unconscious and must make a death save.");
  }
  const preventingCondition = ["incapacitated", "paralyzed", "petrified", "stunned"]
    .find((condition) => hasRuntimeCondition(state, state.character.id, condition));
  if (preventingCondition) {
    return rejection(state, tool, "condition_prevents_action", `You are ${preventingCondition} and cannot take an action. End the turn to resolve the skipped turn.`);
  }
  const requiredSlot = command.action === "second_wind" ? "bonusAction" : "action";
  if (state.combat.turnBudget[requiredSlot].spent) {
    return rejection(
      state,
      tool,
      requiredSlot === "bonusAction" ? "bonus_action_already_used" : "action_already_used",
      requiredSlot === "bonusAction" ? "Your bonus action is already spent this turn." : "Your action is already spent this turn."
    );
  }
  const sourceTarget = findLiveCombatant(state.combat, command.targetId);
  if (isAttackAction && !sourceTarget) {
    return rejection(state, tool, "target_required", "Choose a living target for the attack.");
  }
  const derivedAttack = isAttackAction ? deriveWeaponAttack(state.character, command.weaponId) : null;
  if (isAttackAction && !derivedAttack) {
    return rejection(state, tool, command.weaponId ? "weapon_not_equipped" : "weapon_required", command.weaponId ? "The selected weapon must be an equipped weapon." : "Equip a weapon before attacking.");
  }
  if (isAttackAction && sourceTarget && derivedAttack) {
    const maximumRange = derivedAttack.longRangeFeet ?? derivedAttack.normalRangeFeet ?? derivedAttack.reachFeet;
    const distanceFeet = tacticalDistanceFeet(state.combat, sourceTarget);
    if (maximumRange !== null && distanceFeet > maximumRange) {
      return rejection(
        state,
        tool,
        "target_out_of_range",
        `${derivedAttack.weaponName} can currently reach ${maximumRange} feet; target ${sourceTarget.id} is ${distanceFeet} feet away.`
      );
    }
  }
  const targetCover = isAttackAction && sourceTarget
    ? deriveTacticalCover(
        state.combat.tactical.geometry,
        state.combat.tactical.actorPosition,
        state.combat.tactical.actorFootprint,
        sourceTarget.position,
        sourceTarget.footprint,
      )
    : null;
  if (targetCover?.level === "total") {
    return rejection(state, tool, "target_has_total_cover", "Canonical blocking geometry gives that target total cover from your position.");
  }
  const ammunition = isAttackAction && derivedAttack?.ammunitionId
    ? findAmmunition(state.character.inventory, derivedAttack.ammunitionId)
    : null;
  if (ammunition && !isActorOwnedItem(ammunition, state.character.id)) {
    return rejection(state, tool, "ammunition_unavailable", "That ammunition is not owned by the character.");
  }
  if (isAttackAction && derivedAttack?.ammunitionId && !ammunition) {
    return rejection(state, tool, "ammunition_unavailable", "That ranged weapon has no available ammunition.");
  }
  if (command.action === "second_wind" && (state.character.featureUses.secondWind ?? 0) < 1) {
    return rejection(state, tool, "feature_unavailable", "Second Wind is unavailable until your next rest.");
  }
  if (command.action === "second_wind" && state.character.hp >= state.character.maxHp) {
    return rejection(state, tool, "feature_not_needed", "Second Wind cannot be used while you are at full hit points.");
  }

  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => ({
    ...candidate,
    ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
  }));
  const target = sourceTarget ? findLiveCombatant(next.combat, sourceTarget.id) : null;
  const targetView = target ? materializeCombatant(target) : null;
  spendTurnSlot(next.combat.turnBudget, requiredSlot);
  next.combat.lastAction = command.action;
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: `/combat/turnBudget/${requiredSlot}/spent`, before: false, after: true },
  ];
  let message = "You " + command.action + ".";
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  let outcome = "action_used";

  if (command.action === "second_wind") {
    const die = randomInt(1, 11);
    const beforeHp = next.character.hp;
    const healed = die + next.character.level;
    applyHealing(next, healed, "second-wind", changes);
    next.character.featureUses.secondWind = 0;
    rolls.push({ kind: "second_wind_d10", value: die, sides: 10 });
    modifiers.push({ name: "level", value: next.character.level });
    changes.push(
      { path: "/character/featureUses/secondWind", before: 1, after: 0 },
    );
    message = `You recover ${next.character.hp - beforeHp} hit points with Second Wind.`;
    outcome = "second_wind";
  } else if (isAttackAction && target && targetView && derivedAttack) {
    const attackRoll = randomInt(1, 21);
    const attackModifierQuery = queryModifiers(next.effects, next.character.id, "attack-roll");
    const secondRoll = attackModifierQuery.mode === "advantage" || attackModifierQuery.mode === "disadvantage"
      ? randomInt(1, 21)
      : null;
    const effectiveRoll = secondRoll === null
      ? attackRoll
      : attackModifierQuery.mode === "advantage" ? Math.max(attackRoll, secondRoll) : Math.min(attackRoll, secondRoll);
    const total = effectiveRoll + derivedAttack.attackBonus;
    const critical = effectiveRoll === 20;
    const targetArmorClass = targetView.armorClass + (targetCover?.armorClassBonus ?? 0);
    const hit = effectiveRoll !== 1 && (critical || total >= targetArmorClass);
    rolls.push({ kind: "attack_d20", value: effectiveRoll, sides: 20 });
    if (secondRoll !== null) rolls.push({ kind: `attack_${attackModifierQuery.mode}_d20`, value: secondRoll, sides: 20 });
    modifiers.push(
      { name: "attack_bonus", value: derivedAttack.attackBonus },
      { name: "target_ac", value: targetArmorClass },
      ...(targetCover && targetCover.armorClassBonus
        ? [{ name: `${targetCover.level}_cover_ac`, value: targetCover.armorClassBonus }]
        : []),
    );
    if (hit) {
      const diceMatch = derivedAttack.damageDice.match(/^(\d+)d(\d+)$/i);
      const diceCount = diceMatch ? Number(diceMatch[1]) * (critical ? 2 : 1) : 1;
      const dieSides = diceMatch ? Number(diceMatch[2]) : 8;
      const damageDice = Array.from({ length: diceCount }, () => randomInt(1, dieSides + 1));
      const damage = Math.max(1, damageDice.reduce((sum, die) => sum + die, 0) + derivedAttack.abilityModifier);
      const beforeHp = target.hp;
      const nonlethal = command.action === "attack_nonlethal";
      target.hp = Math.max(0, target.hp - damage);
      target.alive = target.hp > 0;
      if (nonlethal && !target.alive) {
        const beforeConditions = [...target.conditions];
        target.conditions = [...new Set([...target.conditions, "unconscious"])];
        next.combat.lifecycle!.nonlethalDefeatIds.push(target.id);
        changes.push({ path: `/combat/enemies/${target.id}/conditions`, before: beforeConditions, after: target.conditions });
      }
      damageDice.forEach((die) => rolls.push({ kind: `damage_${derivedAttack.damageDice}`, value: die, sides: dieSides }));
      modifiers.push({ name: "damage_modifier", value: derivedAttack.abilityModifier });
      changes.push({ path: `/combat/enemies/${target.id}/hp`, before: beforeHp, after: target.hp });
      message = `Your ${derivedAttack.weaponName} ${nonlethal ? "nonlethal " : ""}attack ${critical ? "critically " : ""}hits ${targetView.name} for ${damage} ${derivedAttack.damageType.toLowerCase()} damage.`;
      outcome = target.alive ? "hit" : nonlethal ? "nonlethal_defeated" : "defeated";
      const lifecycleDefeat = next.combat.lifecycle && !target.alive
        ? resolveProfileDefeatOutcome(next, target.id)
        : null;
      if (lifecycleDefeat === "surrender_offer") {
        message += " A surviving guard reaches its reviewed morale threshold and offers surrender.";
        changes.push({ path: "/combat/lifecycle", before: state.combat.lifecycle, after: next.combat.lifecycle });
      } else if (lifecycleDefeat === "killed" || (!next.combat.lifecycle && !next.combat.enemies.some((combatant) => combatant.alive))) {
        next.combat.status = "ended";
        next.combat.activeActorId = null;
        message += " The encounter ground falls silent.";
        changes.push(
          { path: "/combat/status", before: "active", after: "ended" },
          ...(lifecycleDefeat === "killed" ? [{ path: "/combat/lifecycle", before: state.combat.lifecycle, after: next.combat.lifecycle }] : []),
        );
      } else {
        message += " Your turn remains open; end it when you are ready.";
      }
    } else {
      message = `Your ${derivedAttack.weaponName} attack misses ${targetView.name}. Your turn remains open; end it when you are ready.`;
      outcome = "miss";
    }
    if (ammunition) {
      const consumed = next.character.inventory.find((candidate) => candidate.id === ammunition.id);
      if (!consumed || consumed.quantity < 1) return rejection(state, tool, "ammunition_unavailable", "That ranged weapon has no available ammunition.");
      const beforeQuantity = consumed.quantity;
      consumed.quantity -= 1;
      if (consumed.quantity <= 0) next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== consumed.id);
      changes.push({ path: `/character/inventory/${consumed.id}/quantity`, before: beforeQuantity, after: Math.max(0, beforeQuantity - 1) });
    }
  } else if (command.action === "dodge") {
    const beforeConditions = [...next.character.conditions];
    applyRuntimeEffect(
      next,
      effectInput(next, "combat:dodge", next.character.id, [next.character.id], [
        { kind: "condition", condition: "dodging", action: "apply" },
        { kind: "disadvantage", category: "attack-roll" },
      ], { kind: "turn-boundary", boundary: "start", subject: "target", offsetTurns: 1 }, "condition:dodging", "ignore", ["duration"], clientCommandId),
      changes,
    );
    if (JSON.stringify(beforeConditions) !== JSON.stringify(next.character.conditions)) {
      changes.push({ path: "/character/conditions", before: beforeConditions, after: next.character.conditions });
    }
    message = "You take a guarded stance. The next incoming attack is made at disadvantage. End the turn when ready.";
  }

  resolveTargetEndConditionEffects(next, rolls, modifiers, changes);
  return commit(next, context, clientCommandId, command, tool, message, {
    action: command.action,
    targetId: target?.id ?? null,
    derivedAttack,
    cover: targetCover,
    combat: combatData(next.combat),
    effects: next.effects.filter((candidate) => candidate.status === "active"),
    character: characterData(next.character),
  }, outcome, rolls, modifiers, changes);
}

function controlledActorCommandSlot(action: EngineControlledActorCommandAction): "action" | "bonusAction" {
  return action === "follow" ? "bonusAction" : "action";
}

function controlledActorRangeFeet(actor: EngineControlledActor): number {
  return actor.attack.rangeFeet;
}

function resetControlledActorTurns(
  state: LanternCampaignState,
  changes?: Array<{ path: string; before: unknown; after: unknown }>,
): void {
  for (const actor of state.controlledActors) {
    if (actor.status !== "active" || actor.controllerActorId !== state.actorId) continue;
    const beforeBudget = JSON.parse(JSON.stringify(actor.turnBudget)) as EngineControlledActor["turnBudget"];
    const beforeCommanded = actor.commandedThisTurn;
    const beforeLastCommandId = actor.lastCommandId;
    const beforeLastBehavior = actor.lastBehavior;
    resetTurnBudget(actor.turnBudget, 30);
    actor.commandedThisTurn = false;
    actor.lastCommandId = null;
    actor.lastBehavior = "idle";
    if (changes && (JSON.stringify(beforeBudget) !== JSON.stringify(actor.turnBudget) || beforeCommanded || beforeLastCommandId !== null || beforeLastBehavior !== "idle")) {
      if (JSON.stringify(beforeBudget) !== JSON.stringify(actor.turnBudget)) changes.push({ path: `/controlledActors/${actor.id}/turnBudget`, before: beforeBudget, after: actor.turnBudget });
      if (beforeCommanded) changes.push({ path: `/controlledActors/${actor.id}/commandedThisTurn`, before: true, after: false });
      if (beforeLastCommandId !== null) changes.push({ path: `/controlledActors/${actor.id}/lastCommandId`, before: beforeLastCommandId, after: null });
      if (beforeLastBehavior !== "idle") changes.push({ path: `/controlledActors/${actor.id}/lastBehavior`, before: beforeLastBehavior, after: "idle" });
    }
  }
}

function resetEnemyReactions(
  combat: EngineCombat,
  changes?: Array<{ path: string; before: unknown; after: unknown }>,
): void {
  for (const enemy of combat.enemies) {
    const before = { ...enemy.reaction };
    enemy.reaction = { available: true, spent: false };
    if (changes && (before.spent || !before.available)) {
      changes.push({ path: `/combat/enemies/${enemy.id}/reaction`, before, after: enemy.reaction });
    }
  }
}

function applyControlledActorFallback(
  state: LanternCampaignState,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
): void {
  for (const actor of state.controlledActors) {
    if (actor.status !== "active" || actor.controllerActorId !== state.actorId || actor.commandedThisTurn) continue;
    const beforeBudget = JSON.parse(JSON.stringify(actor.turnBudget)) as EngineControlledActor["turnBudget"];
    const beforeBehavior = actor.lastBehavior;
    const beforeGuardedUntilRound = actor.guardedUntilRound;
    if (!actor.turnBudget.action.spent) spendTurnSlot(actor.turnBudget, "action");
    actor.commandedThisTurn = true;
    actor.lastBehavior = "guard";
    actor.guardedUntilRound = state.combat.round + 1;
    changes.push(
      { path: `/controlledActors/${actor.id}/turnBudget/action`, before: beforeBudget.action, after: actor.turnBudget.action },
      { path: `/controlledActors/${actor.id}/commandedThisTurn`, before: false, after: true },
      { path: `/controlledActors/${actor.id}/lastBehavior`, before: beforeBehavior, after: "guard" },
      { path: `/controlledActors/${actor.id}/guardedUntilRound`, before: beforeGuardedUntilRound, after: actor.guardedUntilRound },
    );
  }
}

function resolveControlledActorCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "controlled_actor_create" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.character.created) return rejection(state, tool, "character_required", "Create the controlling character before creating a companion or summon.");
  if (context.actorId !== state.actorId) return rejection(state, tool, "controlled_actor_unauthorized", "Only the owning actor may create a controlled actor in this slice.");
  if (state.controlledActors.some((actor) => actor.profileId === command.profileId && actor.status === "active")) {
    return rejection(state, tool, "controlled_actor_exists", "That fixed controlled-actor profile is already active.");
  }
  const profile = controlledActorProfile(command.profileId);
  const id = `controlled:${randomUUID()}`;
  const createdAtMinutes = state.time.gameTime.totalMinutes;
  const actor: EngineControlledActor = {
    id,
    profileId: profile.profileId,
    kind: profile.kind,
    name: profile.name,
    ownerActorId: state.actorId,
    controllerActorId: state.actorId,
    summonerActorId: profile.kind === "summon" ? state.actorId : null,
    riderActorId: null,
    passengerOfActorId: null,
    employerActorId: null,
    charmControllerActorId: null,
    factionId: null,
    sourceRef: profile.kind === "summon" ? `controlled-actor-source:${id}` : null,
    status: "active",
    hp: profile.maxHp,
    maxHp: profile.maxHp,
    position: controlledActorPosition(state),
    footprint: { width: 1, height: 1 },
    senses: { normalVision: true, darkvisionFeet: 30, blindsightFeet: 0, tremorsenseFeet: 0, hearing: true },
    turnPolicy: "controller-turn",
    defaultBehavior: "guard",
    progressionPolicy: "none",
    lootPolicy: "none",
    inventoryPolicy: "independent",
    turnBudget: emptyTurnBudget(30),
    commandedThisTurn: false,
    lastCommandId: null,
    lastBehavior: "idle",
    guardedUntilRound: null,
    attack: { ...profile.attack },
    effects: [],
    custody: null,
    inventory: [],
    createdAtMinutes,
    expiresAtMinutes: profile.expiresAfterMinutes === null ? null : createdAtMinutes + profile.expiresAfterMinutes,
    terminalAtMinutes: null,
    provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version, profileRevision: CONTROLLED_ACTOR_PROFILE_REVISION },
  };
  const next = cloneCampaign(state);
  next.controlledActors.push(actor);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/controlledActors", before: state.controlledActors, after: next.controlledActors },
  ];
  if (actor.expiresAtMinutes !== null && actor.sourceRef) {
    const scheduledEvent: EngineScheduledEvent = {
      id: `controlled-actor-expiry:${actor.id}`,
      kind: "controlled-actor-expiry",
      dueAtMinutes: actor.expiresAtMinutes,
      status: "pending",
      sourceRef: actor.sourceRef,
      targetRef: actor.id,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version },
    };
    next.time.scheduledEvents.push(scheduledEvent);
    changes.push({ path: "/time/scheduledEvents", before: state.time.scheduledEvents, after: next.time.scheduledEvents });
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${actor.name} joins under the fixed ${actor.profileId} profile.`,
    { controlledActor: controlledActorView(next, actor), controlledActors: projectControlledActors(next) },
    "controlled_actor_created",
    [],
    [],
    changes,
  );
}

function resolveControlledActorCommand(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "controlled_actor_command" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  const actor = state.controlledActors.find((candidate) => candidate.id === command.actorId);
  if (!actor) return rejection(state, tool, "controlled_actor_not_found", "That controlled actor is not present in this campaign.");
  if (actor.controllerActorId !== context.actorId) {
    return rejection(state, tool, "controlled_actor_unauthorized", "You are not the controller of that actor.");
  }
  if (actor.status !== "active") return rejection(state, tool, "controlled_actor_terminal", `That actor is ${actor.status} and cannot receive commands.`);
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "Controlled commands use the controller-turn policy and require an active encounter.");
  if (state.combat.activeActorId !== state.actorId) return rejection(state, tool, "off_turn", "The controller's turn is not active.");
  if (state.combat.pendingReaction) return rejection(state, tool, "reaction_pending", "Resolve the pending reaction before commanding a controlled actor.");
  if (state.combat.lifecycle?.phase === "resolving") return rejection(state, tool, "surrender_decision_required", "Resolve the encounter decision before commanding a controlled actor.");
  const slot = controlledActorCommandSlot(command.action);
  if (state.combat.turnBudget[slot].spent) return rejection(state, tool, slot === "action" ? "action_already_used" : "bonus_action_already_used", `The controller's ${slot === "action" ? "action" : "bonus action"} is already spent this turn.`);
  if (actor.turnBudget[slot].spent) return rejection(state, tool, slot === "action" ? "controlled_actor_action_used" : "controlled_actor_bonus_used", `That actor's ${slot === "action" ? "action" : "bonus action"} is already spent this turn.`);

  const target = command.action === "attack" ? findLiveCombatant(state.combat, command.targetId) : null;
  if (command.action === "attack" && !target) return rejection(state, tool, "target_required", "Choose a living encounter target for the controlled attack.");
  if (target && fiveESimpleDistanceFeet(actor.position, target.position) > controlledActorRangeFeet(actor)) {
    return rejection(state, tool, "target_out_of_range", `That target is outside the ${actor.name}'s fixed ${controlledActorRangeFeet(actor)}-foot range.`);
  }

  const next = cloneCampaign(state);
  const nextActor = next.controlledActors.find((candidate) => candidate.id === actor.id);
  if (!nextActor) return rejection(state, tool, "controlled_actor_not_found", "That controlled actor disappeared before the command could commit.");
  const nextTarget = target ? next.combat.enemies.find((candidate) => candidate.id === target.id && candidate.alive) ?? null : null;
  const beforeControllerSlot = state.combat.turnBudget[slot];
  const beforeActorSlot = actor.turnBudget[slot];
  spendTurnSlot(next.combat.turnBudget, slot);
  spendTurnSlot(nextActor.turnBudget, slot);
  nextActor.commandedThisTurn = true;
  nextActor.lastCommandId = clientCommandId;
  nextActor.lastBehavior = command.action;
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: `/combat/turnBudget/${slot}`, before: beforeControllerSlot, after: next.combat.turnBudget[slot] },
    { path: `/controlledActors/${nextActor.id}/turnBudget/${slot}`, before: beforeActorSlot, after: nextActor.turnBudget[slot] },
    { path: `/controlledActors/${nextActor.id}/commandedThisTurn`, before: actor.commandedThisTurn, after: true },
    { path: `/controlledActors/${nextActor.id}/lastCommandId`, before: actor.lastCommandId, after: clientCommandId },
    { path: `/controlledActors/${nextActor.id}/lastBehavior`, before: actor.lastBehavior, after: command.action },
  ];
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  let message = `${nextActor.name} follows the ${command.action} command.`;
  let outcome = `controlled_actor_${command.action}`;
  if (command.action === "follow") {
    const beforePosition = nextActor.position;
    nextActor.position = { ...next.combat.tactical.actorPosition };
    changes.push({ path: `/controlledActors/${nextActor.id}/position`, before: beforePosition, after: nextActor.position });
    message = `${nextActor.name} follows you to your current position.`;
  } else if (command.action === "guard") {
    const beforeGuardedUntilRound = nextActor.guardedUntilRound;
    nextActor.guardedUntilRound = next.combat.round + 1;
    changes.push({ path: `/controlledActors/${nextActor.id}/guardedUntilRound`, before: beforeGuardedUntilRound, after: nextActor.guardedUntilRound });
    message = `${nextActor.name} takes a guarded stance until the next round.`;
  } else if (nextTarget) {
    const targetView = materializeCombatant(nextTarget);
    const attackRoll = randomInt(1, 21);
    const critical = attackRoll === 20;
    const total = attackRoll + nextActor.attack.attackBonus;
    const hit = attackRoll !== 1 && (critical || total >= targetView.armorClass);
    rolls.push({ kind: "controlled_actor_attack_d20", value: attackRoll, sides: 20 });
    modifiers.push({ name: "controlled_actor_attack_bonus", value: nextActor.attack.attackBonus }, { name: "target_ac", value: targetView.armorClass });
    if (hit) {
      const diceMatch = nextActor.attack.damageDice.match(/^(\d+)d(\d+)$/i);
      const diceCount = (diceMatch ? Number(diceMatch[1]) : 1) * (critical ? 2 : 1);
      const dieSides = diceMatch ? Number(diceMatch[2]) : 4;
      const damageDice = Array.from({ length: diceCount }, () => randomInt(1, dieSides + 1));
      const damage = Math.max(1, damageDice.reduce((sum, die) => sum + die, 0) + nextActor.attack.damageBonus);
      const beforeHp = nextTarget.hp;
      nextTarget.hp = Math.max(0, nextTarget.hp - damage);
      nextTarget.alive = nextTarget.hp > 0;
      damageDice.forEach((die) => rolls.push({ kind: "controlled_actor_damage", value: die, sides: dieSides }));
      modifiers.push({ name: "controlled_actor_damage_bonus", value: nextActor.attack.damageBonus });
      changes.push({ path: `/combat/enemies/${nextTarget.id}/hp`, before: beforeHp, after: nextTarget.hp });
      message = `${nextActor.name} ${critical ? "critically " : ""}hits ${targetView.name} for ${damage} ${nextActor.attack.damageType} damage.`;
      outcome = nextTarget.alive ? "controlled_actor_hit" : "controlled_actor_defeated";
      if (!nextTarget.alive && !next.combat.enemies.some((candidate) => candidate.alive)) {
        next.combat.status = "ended";
        next.combat.activeActorId = null;
        changes.push({ path: "/combat/status", before: "active", after: "ended" });
      }
    } else {
      message = `${nextActor.name} misses ${targetView.name}.`;
      outcome = "controlled_actor_miss";
    }
  }
  next.combat.lastAction = `controlled_actor:${nextActor.id}:${command.action}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { controlledActor: controlledActorView(next, nextActor), targetId: nextTarget?.id ?? null, cost: slot, combat: combatData(next.combat) },
    outcome,
    rolls,
    modifiers,
    changes,
  );
}

function resolveControlledActorDismiss(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "controlled_actor_dismiss" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  const actor = state.controlledActors.find((candidate) => candidate.id === command.actorId);
  if (!actor) return rejection(state, tool, "controlled_actor_not_found", "That controlled actor is not present in this campaign.");
  if (actor.ownerActorId !== context.actorId && actor.controllerActorId !== context.actorId) return rejection(state, tool, "controlled_actor_unauthorized", "You are not the controller or owner of that actor.");
  if (actor.status !== "active") return rejection(state, tool, "controlled_actor_terminal", `That actor is already ${actor.status}.`);
  const next = cloneCampaign(state);
  const nextActor = next.controlledActors.find((candidate) => candidate.id === actor.id);
  if (!nextActor) return rejection(state, tool, "controlled_actor_not_found", "That controlled actor disappeared before dismissal could commit.");
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  nextActor.status = "dismissed";
  nextActor.terminalAtMinutes = next.time.gameTime.totalMinutes;
  nextActor.commandedThisTurn = false;
  if (nextActor.sourceRef) removeRuntimeSource(next, nextActor.sourceRef, changes);
  next.time.scheduledEvents = next.time.scheduledEvents.filter((event) => event.targetRef !== nextActor.id || event.status !== "pending");
  changes.push(
    { path: "/controlledActors", before: state.controlledActors, after: next.controlledActors },
    { path: "/time/scheduledEvents", before: state.time.scheduledEvents, after: next.time.scheduledEvents },
  );
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${nextActor.name} is dismissed and no longer acts.`,
    { controlledActor: controlledActorView(next, nextActor), controlledActors: projectControlledActors(next) },
    "controlled_actor_dismissed",
    [],
    [],
    changes,
  );
}

function activePartyViewpointId(state: LanternCampaignState): string {
  const candidate = state.party?.activeViewpointActorId;
  if (!candidate) return state.actorId;
  return state.party?.members.some((member) => member.actorId === candidate) ? candidate : state.actorId;
}

function partyProjection(state: LanternCampaignState): EnginePartyState | null {
  return state.party ? cloneCampaign({ ...state, party: state.party }).party : null;
}

function partyMember(state: LanternCampaignState, actorId: string): EnginePartyMember | null {
  return state.party?.members.find((member) => member.actorId === actorId) ?? null;
}

function controlledPartyActor(state: LanternCampaignState, actorId: string): EngineControlledActor | null {
  return state.controlledActors.find((actor) => actor.id === actorId && actor.status === "active") ?? null;
}

function partyPersonalInventory(state: LanternCampaignState, actorId: string): EngineInventoryItem[] | null {
  if (actorId === state.actorId) return state.character.inventory;
  return controlledPartyActor(state, actorId)?.inventory ?? null;
}

function partyCreateMembers(state: LanternCampaignState): EnginePartyMember[] {
  const scene = state.worldContext?.id ?? `campaign:${state.id}`;
  return [
    { actorId: state.actorId, role: "leader", controllerActorId: state.actorId, sceneId: scene, locationRef: scene, joinedAtVersion: state.version },
    ...state.controlledActors
      .filter((actor) => actor.status === "active")
      .map((actor) => ({
        actorId: actor.id,
        role: "companion" as const,
        controllerActorId: actor.controllerActorId,
        sceneId: scene,
        locationRef: scene,
        joinedAtVersion: state.version,
      })),
  ];
}

function partyStateData(state: LanternCampaignState): { party: EnginePartyState | null; viewpoint: { actorId: string; knowledge: EngineKnowledgeRecord[] } } {
  const viewpointActorId = activePartyViewpointId(state);
  return {
    party: partyProjection(state),
    viewpoint: {
      actorId: viewpointActorId,
      knowledge: state.actorKnowledge.filter((record) => record.actorId === viewpointActorId).map((record) => ({ ...record })),
    },
  };
}

function resolvePartyCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "party_create" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.character.created) return rejection(state, tool, "character_required", "Create the controlling character before forming a party.");
  if (context.actorId !== state.actorId) return rejection(state, tool, "party_unauthorized", "Only the campaign owner may form this party.");
  if (state.party) return rejection(state, tool, "party_exists", "This campaign already has a party.");
  if (!state.controlledActors.some((actor) => actor.status === "active")) return rejection(state, tool, "controlled_actor_required", "Create one active controlled companion before forming a party.");
  const members = partyCreateMembers(state);
  const party: EnginePartyState = {
    id: `party:${state.id}`,
    leaderActorId: state.actorId,
    activeViewpointActorId: state.actorId,
    mode: "together",
    members,
    shared: {
      questIds: state.quests.map((quest) => quest.id),
      currency: { copper: 0 },
      container: { id: `party-shared:${state.id}`, name: "Party shared container", inventory: [] },
    },
    rewardAllocation: "leader-only",
    consent: { mode: "single-controller-future-member-seam", permanentChoiceRequires: "leader-confirmation" },
    revision: 1,
  };
  const next = cloneCampaign(state);
  next.party = party;
  return commit(next, context, clientCommandId, command, tool, "The party forms around the controlling character and active companion.", partyStateData(next), "party_created", [], [], [
    { path: "/party", before: state.party, after: next.party },
  ]);
}

function resolvePartySetViewpoint(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "party_set_viewpoint" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.party) return rejection(state, tool, "party_required", "Form a party before switching viewpoints.");
  if (context.actorId !== state.party.leaderActorId) return rejection(state, tool, "party_unauthorized", "Only the party leader's controller may switch the active viewpoint.");
  const member = partyMember(state, command.actorId);
  if (!member) return rejection(state, tool, "party_member_not_found", "That actor is not a member of this party.");
  if (command.actorId !== state.actorId && !controlledPartyActor(state, command.actorId)) return rejection(state, tool, "party_member_inactive", "An inactive controlled actor cannot become the active viewpoint.");
  if (state.party.activeViewpointActorId === command.actorId) return rejection(state, tool, "party_viewpoint_unchanged", "That actor is already the active viewpoint.");
  const next = cloneCampaign(state);
  if (!next.party) return rejection(state, tool, "party_required", "Form a party before switching viewpoints.");
  const before = next.party.activeViewpointActorId;
  next.party.activeViewpointActorId = command.actorId;
  next.party.revision += 1;
  return commit(next, context, clientCommandId, command, tool, "The active viewpoint changes without transferring ownership or hidden knowledge.", partyStateData(next), "party_viewpoint_changed", [], [], [
    { path: "/party/activeViewpointActorId", before, after: command.actorId },
    { path: "/party/revision", before: state.party.revision, after: next.party.revision },
  ]);
}

function resolvePartySplit(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "party_split" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.party) return rejection(state, tool, "party_required", "Form a party before splitting scenes.");
  if (context.actorId !== state.party.leaderActorId) return rejection(state, tool, "party_unauthorized", "Only the party leader's controller may split the party.");
  const member = partyMember(state, command.actorId);
  if (!member) return rejection(state, tool, "party_member_not_found", "That actor is not a member of this party.");
  if (command.actorId === state.party.leaderActorId) return rejection(state, tool, "party_leader_anchor", "The leader remains the party's shared-scene anchor in this slice.");
  if (!controlledPartyActor(state, command.actorId)) return rejection(state, tool, "party_member_inactive", "Only an active controlled actor can split from the party.");
  const locationRef = command.locationRef ?? command.sceneId;
  if (member.sceneId === command.sceneId && member.locationRef === locationRef) return rejection(state, tool, "party_split_unchanged", "That actor is already in the requested scene context.");
  const next = cloneCampaign(state);
  if (!next.party) return rejection(state, tool, "party_required", "Form a party before splitting scenes.");
  const nextMember = next.party.members.find((candidate) => candidate.actorId === command.actorId);
  if (!nextMember) return rejection(state, tool, "party_member_not_found", "That actor is not a member of this party.");
  nextMember.sceneId = command.sceneId;
  nextMember.locationRef = locationRef;
  next.party.mode = "split";
  next.party.revision += 1;
  return commit(next, context, clientCommandId, command, tool, `${command.actorId} moves into a separate party scene context.`, partyStateData(next), "party_split", [], [], [
    { path: `/party/members/${command.actorId}/sceneId`, before: member.sceneId, after: command.sceneId },
    { path: `/party/members/${command.actorId}/locationRef`, before: member.locationRef, after: locationRef },
    { path: "/party/mode", before: state.party.mode, after: "split" },
    { path: "/party/revision", before: state.party.revision, after: next.party.revision },
  ]);
}

function resolvePartyRejoin(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "party_rejoin" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.party) return rejection(state, tool, "party_required", "Form a party before rejoining scenes.");
  if (context.actorId !== state.party.leaderActorId) return rejection(state, tool, "party_unauthorized", "Only the party leader's controller may rejoin the party.");
  const scene = state.worldContext?.id ?? `campaign:${state.id}`;
  if (state.party.mode === "together" && state.party.members.every((member) => member.sceneId === scene && member.locationRef === scene)) return rejection(state, tool, "party_already_together", "The party is already together in the current scene.");
  const next = cloneCampaign(state);
  if (!next.party) return rejection(state, tool, "party_required", "Form a party before rejoining scenes.");
  next.party.members = next.party.members.map((member) => ({ ...member, sceneId: scene, locationRef: scene }));
  next.party.mode = "together";
  next.party.revision += 1;
  return commit(next, context, clientCommandId, command, tool, "The party reunites in the current world context.", partyStateData(next), "party_rejoined", [], [], [
    { path: "/party/members", before: state.party.members, after: next.party.members },
    { path: "/party/mode", before: state.party.mode, after: "together" },
    { path: "/party/revision", before: state.party.revision, after: next.party.revision },
  ]);
}

function resolvePartySharedTransfer(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "party_shared_transfer" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.party) return rejection(state, tool, "party_required", "Form a party before using the shared container.");
  if (context.actorId !== state.party.leaderActorId) return rejection(state, tool, "party_unauthorized", "Only the party leader's controller may move shared items in this slice.");
  const member = partyMember(state, command.actorId);
  if (!member) return rejection(state, tool, "party_member_not_found", "That actor is not a member of this party.");
  const personal = partyPersonalInventory(state, command.actorId);
  if (!personal) return rejection(state, tool, "party_member_inactive", "That party member has no active personal inventory.");
  const shared = state.party.shared.container.inventory;
  const source = command.direction === "to_shared" ? personal : shared;
  const item = source.find((candidate) => candidate.id === command.itemId && candidate.quantity >= command.quantity);
  if (!item) return rejection(state, tool, "item_not_found", command.direction === "to_shared" ? "That item is not in the selected member's personal inventory." : "That item is not in the shared container.");
  if (item.equipped) return rejection(state, tool, "item_equipped", "Unequip an item before moving it into a shared container.");
  const next = cloneCampaign(state);
  if (!next.party) return rejection(state, tool, "party_required", "Form a party before using the shared container.");
  const nextPersonal = partyPersonalInventory(next, command.actorId);
  if (!nextPersonal) return rejection(state, tool, "party_member_inactive", "That party member has no active personal inventory.");
  const nextShared = next.party.shared.container.inventory;
  const nextSource = command.direction === "to_shared" ? nextPersonal : nextShared;
  const nextTarget = command.direction === "to_shared" ? nextShared : nextPersonal;
  const sourceIndex = nextSource.findIndex((candidate) => candidate.id === command.itemId);
  if (sourceIndex < 0 || nextSource[sourceIndex]!.quantity < command.quantity) return rejection(state, tool, "item_not_found", "The item changed before the shared transfer could commit.");
  const moved = {
    ...nextSource[sourceIndex]!,
    quantity: command.quantity,
    ownerRef: command.direction === "to_shared" ? { kind: "world" as const, id: next.party.shared.container.id } : { kind: "actor" as const, id: command.actorId },
    containerRef: undefined,
    equipped: false,
    slot: undefined,
  };
  nextSource[sourceIndex]!.quantity -= command.quantity;
  if (nextSource[sourceIndex]!.quantity <= 0) nextSource.splice(sourceIndex, 1);
  addInventory(nextTarget, moved);
  next.party.revision += 1;
  const personalPath = command.actorId === state.actorId ? "/character/inventory" : `/controlledActors/${command.actorId}/inventory`;
  const sharedPath = "/party/shared/container/inventory";
  return commit(next, context, clientCommandId, command, tool, command.direction === "to_shared" ? "The item moves into the explicit party shared container." : "The item moves from the shared container into personal ownership.", {
    party: partyProjection(next),
    actorId: command.actorId,
    personalInventory: materializeInventory(nextPersonal),
    sharedInventory: materializeInventory(next.party.shared.container.inventory),
  }, "party_shared_transfer", [], [], [
    { path: personalPath, before: personal, after: nextPersonal },
    { path: sharedPath, before: shared, after: next.party.shared.container.inventory },
    { path: "/party/revision", before: state.party.revision, after: next.party.revision },
  ]);
}

function resolvePartyGroupCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "party_group_check" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!state.party) return rejection(state, tool, "party_required", "Form a party before attempting a group check.");
  if (context.actorId !== state.party.leaderActorId) return rejection(state, tool, "party_unauthorized", "Only the party leader's controller may resolve a group check.");
  if (command.actorIds[0] !== state.party.leaderActorId) return rejection(state, tool, "party_leader_required", "The group check's first participant must be the party leader.");
  if (new Set(command.actorIds).size !== command.actorIds.length) return rejection(state, tool, "party_duplicate_participant", "A group check cannot count one actor twice.");
  for (const actorId of command.actorIds) {
    if (!partyMember(state, actorId)) return rejection(state, tool, "party_member_not_found", `Actor ${actorId} is not a party member.`);
    if (actorId !== state.actorId && !controlledPartyActor(state, actorId)) return rejection(state, tool, "party_member_inactive", `Actor ${actorId} is not active.`);
  }
  const combatAssistance = state.combat.status === "active";
  if (combatAssistance) {
    if (state.combat.activeActorId !== state.actorId) return rejection(state, tool, "off_turn", "The party leader's turn is not active for this group check.");
    if (state.combat.turnBudget.action.spent) return rejection(state, tool, "action_already_used", "The party leader's action is already spent.");
    for (const actorId of command.actorIds.slice(1)) {
      const actor = controlledPartyActor(state, actorId);
      if (actor?.turnBudget.action.spent) return rejection(state, tool, "party_assistance_action_used", `Actor ${actorId}'s assistance action is already spent.`);
    }
  }
  const derived = deriveCheck(state, command.ability, command.skill ?? null, null, tool);
  if ("accepted" in derived) return derived;
  const assistance = Math.min(2, Math.max(0, command.actorIds.length - 1));
  const modifier = derived.modifier + assistance;
  const roll = randomInt(1, 21);
  const dc = state.combat.status === "active" ? 14 : 12;
  const total = roll + modifier;
  const success = total >= dc;
  const check: EngineCheckEvidence = {
    kind: "ability-check",
    actorId: state.party.leaderActorId,
    ability: command.ability,
    skill: derived.skill,
    tool: null,
    proficiency: derived.proficiency,
    expertise: derived.expertise,
    modifier,
    modifierSources: [...derived.modifierSources, ...command.actorIds.slice(1).map((actorId) => `party-assistance:${actorId}`), "party-group-check-v1"],
    advantageSources: [],
    disadvantageSources: [],
    mode: "normal",
    informationPolicy: "public",
    formulaRevision: "party-group-check-v1",
  };
  const next = cloneCampaign(state);
  next.lastRoll = roll;
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/lastRoll", before: state.lastRoll, after: roll },
  ];
  if (combatAssistance) {
    const beforeLeaderAction = state.combat.turnBudget.action;
    spendTurnSlot(next.combat.turnBudget, "action");
    stateChanges.push({ path: "/combat/turnBudget/action", before: beforeLeaderAction, after: next.combat.turnBudget.action });
    for (const actorId of command.actorIds.slice(1)) {
      const beforeActor = state.controlledActors.find((actor) => actor.id === actorId)!;
      const nextActor = next.controlledActors.find((actor) => actor.id === actorId);
      if (!nextActor) continue;
      const beforeAction = beforeActor.turnBudget.action;
      spendTurnSlot(nextActor.turnBudget, "action");
      stateChanges.push({ path: `/controlledActors/${actorId}/turnBudget/action`, before: beforeAction, after: nextActor.turnBudget.action });
    }
  }
  return commit(next, context, clientCommandId, command, tool, `The party makes a ${command.ability.toUpperCase()} group check: ${total} against DC ${dc}. ${success ? "Success." : "Failure."}`, {
    ability: command.ability,
    skill: derived.skill,
    goal: command.goal,
    participants: command.actorIds,
    dc,
    roll,
    modifier,
    total,
    success,
    policy: "party-group-check-v1",
    assistanceCost: combatAssistance ? "one-action-per-participant" : "none-out-of-combat",
  }, success ? "success" : "failure", [{ kind: "d20", value: roll, sides: 20 }], [{ name: `${command.ability}_modifier`, value: derived.modifier }, { name: "party_assistance", value: assistance }, { name: "dc", value: dc }], [
    ...stateChanges,
  ], [], undefined, check);
}

function resolvePlayerEndTurn(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "end_turn" | "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter to end.");
  if (state.combat.activeActorId !== state.actorId) return rejection(state, tool, "off_turn", "It is not your turn.");
  if (state.combat.lifecycle?.phase === "resolving") return rejection(state, tool, "surrender_decision_required", "Resolve the server-owned surrender offer before ending the turn.");
  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  applyControlledActorFallback(next, changes);
  const nextActor = next.combat.lifecycle
    ? lifecycleNextActorId(next.combat, state.actorId, state.actorId)
    : firstLiveCombatantId(next.combat);
  if (!nextActor) {
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    return commit(next, context, clientCommandId, command, tool, "With no foe left standing, the encounter ends.", { combat: combatData(next.combat), controlledActors: projectControlledActors(next) }, "encounter_ended", [], [], [...changes, { path: "/combat/status", before: "active", after: "ended" }]);
  }
  next.combat.activeActorId = nextActor;
  if (next.combat.lifecycle) {
    next.combat.lifecycle.initiative.activeIndex = next.combat.lifecycle.initiative.order.indexOf(nextActor);
  }
  next.combat.lastAction = "end_turn";
  return commit(next, context, clientCommandId, command, tool, "Your turn ends. The opposition may act.", { combat: combatData(next.combat), controlledActors: projectControlledActors(next) }, "turn_ended", [], [], [...changes, { path: "/combat/activeActorId", before: state.combat.activeActorId, after: nextActor }]);
}

function resolveAdvanceTurn(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter to advance.");
  if (state.combat.activeActorId === state.actorId) {
    if (["incapacitated", "paralyzed", "petrified", "stunned"]
      .some((condition) => hasRuntimeCondition(state, state.character.id, condition))) {
      return resolveSkippedCharacterTurn(state, context, clientCommandId, command, tool);
    }
    // Compatibility alias for callers that used advance_turn as the old player
    // handoff. New clients should send end_turn first; the action resolver
    // itself never auto-advances.
    const handoff = cloneCampaign(state);
    handoff.combat.activeActorId = firstLiveCombatantId(handoff.combat);
    const legacyEnemyResolution = resolveAdvanceTurn(handoff, context, clientCommandId, command, tool);
    if (!legacyEnemyResolution.accepted) {
      return rejection(state, tool, legacyEnemyResolution.code ?? "enemy_turn_unavailable", legacyEnemyResolution.message);
    }
    return legacyEnemyResolution;
  }

  const enemy = state.combat.activeActorId
    ? findLiveCombatant(state.combat, state.combat.activeActorId)
    : null;
  if (!enemy) {
    const next = cloneCampaign(state);
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "With no foe left standing, the encounter ends.",
      { combat: combatData(next.combat) },
      "encounter_ended",
      [],
      [],
      [{ path: "/combat/status", before: "active", after: "ended" }]
    );
  }
  if (command.combatantId && command.combatantId !== enemy.id) {
    return rejection(state, tool, "off_turn", `It is ${enemy.id}'s turn, not ${command.combatantId}'s.`);
  }
  if (state.combat.pendingReaction) {
    return rejection(state, tool, "reaction_pending", "Resolve the offered incoming-hit reaction before advancing the enemy turn.");
  }

  const enemyView = materializeCombatant(enemy);
  if (command.actionKey && command.attackKey && command.actionKey !== command.attackKey) {
    return rejection(state, tool, "conflicting_action_keys", "Choose actionKey or the legacy attackKey alias, not two different actions.");
  }
  const selectedActionKey = command.actionKey ?? command.attackKey;
  const executablePrograms = enemyView.effectPrograms.filter((program) =>
    program.executionMode === "multiattack"
    || program.executionMode === "saving-throw-damage"
    || program.executionMode === "saving-throw-condition"
  );
  if (!selectedActionKey) {
    const choices = new Set([
      ...enemyView.attacks.map((candidate) => candidate.actionKey),
      ...executablePrograms.flatMap((program) => program.sourceActionKey ? [program.sourceActionKey] : []),
    ]);
    if (choices.size > 1) {
      return rejection(
        state,
        tool,
        "enemy_action_required",
        `Choose ${enemyView.name}'s actionKey: ${[...choices].sort().join(", ")}.`
      );
    }
    const onlyProgram = executablePrograms[0];
    if (choices.size === 1 && onlyProgram && onlyProgram.sourceActionKey && choices.has(onlyProgram.sourceActionKey)) {
      return resolveCompiledCreatureProgram(state, context, clientCommandId, command, tool, enemy, enemyView, onlyProgram);
    }
  }
  const selectedProgram = selectedActionKey
    ? enemyView.effectPrograms.find((candidate) =>
        candidate.sourceActionKey === selectedActionKey || candidate.contentKey === selectedActionKey
      )
    : undefined;
  if (selectedProgram) {
    if (selectedProgram.executionMode === "fragments") {
      return rejection(
        state,
        tool,
        "content_tier_insufficient",
        `${enemyView.name}'s ${selectedProgram.sourceName} has typed S7 fragments, but its complete prose is not executable.`
      );
    }
    return resolveCompiledCreatureProgram(
      state,
      context,
      clientCommandId,
      command,
      tool,
      enemy,
      enemyView,
      selectedProgram
    );
  }

  let attack = selectedActionKey
    ? enemyView.attacks.find((candidate) =>
        candidate.actionKey === selectedActionKey || candidate.contentKey === selectedActionKey
      )
    : undefined;
  if (selectedActionKey && !attack) {
    const deferred = enemyView.actions.find((candidate) =>
      candidate.actionKey === selectedActionKey || candidate.name.toLowerCase() === selectedActionKey.toLowerCase()
    );
    if (deferred) {
      return rejection(
        state,
        tool,
        "content_tier_insufficient",
        `${enemyView.name}'s ${deferred.name} is preserved as source prose but is not executable in S3.`
      );
    }
    return rejection(state, tool, "unknown_creature_action", `${enemyView.name} has no action ${selectedActionKey}.`);
  }
  if (!attack) {
    if (enemyView.attacks.length === 0) {
      return rejection(
        state,
        tool,
        "content_tier_insufficient",
        `${enemyView.name} has no exact S3 basic attack. Its source actions are display-only until a later reviewed compiler supports them.`
      );
    }
    if (enemyView.attacks.length > 1) {
      return rejection(
        state,
        tool,
        "enemy_action_required",
        `Choose ${enemyView.name}'s attackKey: ${enemyView.attacks.map((candidate) => candidate.actionKey).join(", ")}.`
      );
    }
    attack = enemyView.attacks[0];
  }
  if (!attack) return rejection(state, tool, "content_tier_insufficient", "No executable attack was selected.");
  const cover = incomingCharacterCover(state, enemy);
  if (cover.level === "total") {
    return rejection(state, tool, "target_has_total_cover", "Canonical blocking geometry gives the character total cover from that attacker.");
  }

  const next = cloneCampaign(state);
  const armorClass = characterArmorClassWithCover(next, cover);
  const attackRoll = randomInt(1, 21);
  const attackModifier = attack.toHit;
  const attackModifiers = queryModifiers(state.effects, state.character.id, "attack-roll");
  const secondRoll = attackModifiers.mode === "advantage" || attackModifiers.mode === "disadvantage"
    ? randomInt(1, 21)
    : null;
  const effectiveRoll = secondRoll === null
    ? attackRoll
    : attackModifiers.mode === "advantage"
      ? Math.max(attackRoll, secondRoll)
      : Math.min(attackRoll, secondRoll);
  const total = effectiveRoll + attackModifier;
  const critical = effectiveRoll === 20;
  const hit = effectiveRoll !== 1 && (critical || total >= armorClass);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [{ kind: "enemy_attack_d20", value: effectiveRoll, sides: 20 }];
  if (secondRoll !== null) rolls.push({ kind: `enemy_attack_${attackModifiers.mode}_d20`, value: secondRoll, sides: 20 });
  const modifiers = [
    { name: "enemy_attack_bonus", value: attackModifier },
    { name: "armor_class", value: armorClass },
    ...(cover.armorClassBonus ? [{ name: `${cover.level}_cover_ac`, value: cover.armorClassBonus }] : []),
  ];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  let message = enemyView.name + " uses " + attack.name + ".";
  let outcome = "enemy_miss";

  if (hit) {
    const reactions = eligibleIncomingHitReactions(state);
    if (reactions.length > 0) {
      const pending: EnginePendingReaction = {
        version: 1,
        id: randomUUID(),
        kind: "incoming-hit",
        trigger: "incoming-attack-would-hit",
        sourceCommandId: clientCommandId,
        sourceVersion: state.version,
        actorId: state.actorId,
        attackerId: enemy.id,
        targetId: state.character.id,
        sourceActionKey: attack.actionKey,
        attackName: attack.name,
        attackRoll: effectiveRoll,
        attackTotal: total,
        attackBonus: attackModifier,
        critical,
        originalArmorClass: armorClass,
        damageDiceCount: attack.damage.diceCount * (critical ? 2 : 1),
        damageDieSides: attack.damage.dieSides,
        damageBonus: attack.damage.bonus,
        damageType: attack.damage.typeName,
        eligibleReactionIds: reactions.map((spell) => spell.contentKey),
        status: "offered",
        resumeMode: "finish-creature-turn",
        movementTriggerId: null,
        resumeToken: randomUUID(),
      };
      next.combat.pendingReaction = pending;
      next.combat.lastAction = `reaction:${pending.id}:offered`;
      changes.push({ path: "/combat/pendingReaction", before: state.combat.pendingReaction, after: pending });
      return commit(
        next,
        context,
        clientCommandId,
        command,
        tool,
        `${enemyView.name} hits with ${attack.name}; an eligible reaction spell may be cast before damage resolves.`,
        {
          reactionId: pending.id,
          pendingReaction: pending,
          attack: { attackRoll: effectiveRoll, attackTotal: total, attackBonus: attackModifier, critical, armorClass, cover },
          combat: combatData(next.combat),
          character: characterData(next.character),
        },
        "reaction_offered",
        rolls,
        modifiers,
        changes,
        [
          attack.contentKey,
          ...reactions.flatMap((spell) => [
            spell.contentKey,
            ...runtimeSpellPrimitiveEvidence(state, spell.contentKey),
          ]),
        ]
      );
    }
    const diceCount = attack.damage.diceCount * (critical ? 2 : 1);
    const damageDice = Array.from(
      { length: diceCount },
      () => randomInt(1, attack.damage.dieSides + 1)
    );
    const damage = Math.max(0, damageDice.reduce((sum, value) => sum + value, 0) + attack.damage.bonus);
    const concentrationBefore = next.character.spellcasting?.concentration;
    applyCharacterDamage(next, damage, "enemy-attack", clientCommandId, changes, rolls, modifiers, critical);
    for (const die of damageDice) {
      rolls.push({ kind: "enemy_damage", value: die, sides: attack.damage.dieSides });
    }
    modifiers.push({ name: "damage_bonus", value: attack.damage.bonus });
    message = enemyView.name + " " + (critical ? "critically " : "") + "hits with " + attack.name + " for " + damage + " " + attack.damage.typeName.toLowerCase() + " damage.";
    outcome = "enemy_hit";
    if (next.character.hp === 0) {
      if (concentrationBefore && !next.character.spellcasting?.concentration) message += " Concentration ends.";
      if (next.character.lifecycleState === "dead") {
        message += " You die; your remains are left behind.";
        outcome = "dead";
      } else {
        message += " You fall unconscious.";
        outcome = "downed";
      }
    } else if (damage > 0 && next.character.spellcasting?.concentration) {
      const concentrationDc = Math.max(10, Math.floor(damage / 2));
      const concentrationRoll = randomInt(1, 21);
      const concentrationModifier = next.character.savingThrows.con;
      const concentrationTotal = concentrationRoll + concentrationModifier;
      const concentrationHeld = concentrationTotal >= concentrationDc;
      rolls.push({ kind: "concentration_save_d20", value: concentrationRoll, sides: 20 });
      modifiers.push({ name: "concentration_save_bonus", value: concentrationModifier }, { name: "concentration_dc", value: concentrationDc });
      message += ` Concentration save ${concentrationTotal} against DC ${concentrationDc}: ${concentrationHeld ? "held" : "lost"}.`;
      if (!concentrationHeld) {
        const beforeConcentration = next.character.spellcasting.concentration;
        next.character.spellcasting.concentration = null;
        changes.push({ path: "/character/spellcasting/concentration", before: beforeConcentration, after: null });
      }
    }
  } else {
    message = enemyView.name + " misses with " + attack.name + ".";
  }

  const nextEnemyId = next.combat.lifecycle
    ? lifecycleNextActorId(next.combat, enemy.id, state.actorId)
    : nextLiveCombatantId(next.combat, enemy.id);
  if (next.character.lifecycleState === "dead") {
    next.combat.status = "ended";
    next.combat.activeActorId = null;
  } else if (nextEnemyId && (!next.combat.lifecycle || nextEnemyId !== state.actorId)) {
    next.combat.activeActorId = nextEnemyId;
    if (next.combat.lifecycle) next.combat.lifecycle.initiative.activeIndex = next.combat.lifecycle.initiative.order.indexOf(nextEnemyId);
    message += " The next foe acts.";
  } else {
    next.combat.round += 1;
    next.combat.activeActorId = next.actorId;
    if (next.combat.lifecycle) next.combat.lifecycle.initiative.activeIndex = next.combat.lifecycle.initiative.order.indexOf(next.actorId);
    resetTurnBudget(next.combat.turnBudget, next.character.speed);
    resetEnemyReactions(next.combat, changes);
    resetControlledActorTurns(next, changes);
    if (next.character.hp === 0) spendTurnSlot(next.combat.turnBudget, "action");
    message += next.character.hp === 0
      ? " Your turn arrives; make a death save."
      : " The initiative returns to you.";
    expireAtCharacterTurnStart(next, changes);
  }

  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      attack: { attackRoll: effectiveRoll, attackTotal: total, attackBonus: attackModifier, critical, armorClass, cover },
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    outcome,
    rolls,
    modifiers,
    changes
  );
}

function resolveSkippedCharacterTurn(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const next = cloneCampaign(state);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  applyControlledActorFallback(next, changes);
  resolveTargetEndConditionEffects(next, rolls, modifiers, changes);
  const beforeActor = next.combat.activeActorId;
  next.combat.activeActorId = firstLiveCombatantId(next.combat);
  spendTurnSlot(next.combat.turnBudget, "action");
  changes.push(
    { path: "/combat/activeActorId", before: beforeActor, after: next.combat.activeActorId },
    { path: "/combat/turnBudget/action/spent", before: state.combat.turnBudget.action.spent, after: true }
  );
  const condition = ["incapacitated", "paralyzed", "petrified", "stunned"]
    .find((candidate) => hasRuntimeCondition(state, state.character.id, candidate)) ?? "incapacitated";
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${next.character.name || "The character"} is ${condition}; the turn passes to the opposition.`,
    { skipped: true, condition, combat: combatData(next.combat), character: characterData(next.character), controlledActors: projectControlledActors(next) },
    "turn_skipped_by_condition",
    rolls,
    modifiers,
    changes,
    next.character.conditionEffects.map((effect) => effect.conditionContentKey)
  );
}

function resolveCompiledCreatureProgram(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  if (
    program.sourceType !== "creature-action"
    || program.sourceContentKey !== enemy.contentKey
    || !program.sourceActionKey
  ) {
    return rejection(state, tool, "effect_program_mismatch", "The selected effect program does not belong to the active combatant.");
  }
  if (program.hasDeferredProse || program.executionMode === "fragments") {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${enemyView.name}'s ${program.sourceName} is not completely executable from the pinned source prose.`
    );
  }
  if (program.executionMode === "multiattack") {
    return resolveCompiledMultiattack(state, context, clientCommandId, command, tool, enemy, enemyView, program);
  }
  if (program.executionMode === "saving-throw-damage") {
    return resolveCompiledSaveDamage(state, context, clientCommandId, command, tool, enemy, enemyView, program);
  }
  if (program.executionMode === "saving-throw-condition") {
    return resolveCompiledSaveCondition(state, context, clientCommandId, command, tool, enemy, enemyView, program);
  }
  return rejection(state, tool, "content_tier_insufficient", "That compiled program is not a creature-turn execution mode.");
}

function resolveCompiledMultiattack(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  const sequence = program.operations.find((operation) => operation.kind === "attack-sequence");
  if (!sequence || program.operations.filter((operation) => operation.kind === "attack-sequence").length !== 1) {
    return rejection(state, tool, "invalid_effect_program", "The compiled multiattack has no unique attack sequence.");
  }
  const attackByContentKey = new Map(enemyView.attacks.map((attack) => [attack.contentKey, attack]));
  const attacks = sequence.steps.flatMap((step) => {
    const attack = attackByContentKey.get(step.attackContentKey);
    return attack ? Array.from({ length: step.count }, () => attack) : [];
  });
  const expectedAttackCount = sequence.steps.reduce((total, step) => total + step.count, 0);
  if (attacks.length !== expectedAttackCount) {
    return rejection(state, tool, "effect_program_mismatch", "A compiled multiattack step is unavailable in the active pack.");
  }
  const cover = incomingCharacterCover(state, enemy);
  if (cover.level === "total") {
    return rejection(state, tool, "target_has_total_cover", "Canonical blocking geometry gives the character total cover from that attacker.");
  }

  const next = cloneCampaign(state);
  const nextEnemy = next.combat.enemies.find((candidate) => candidate.id === enemy.id);
  if (!nextEnemy) return rejection(state, tool, "combatant_not_found", "The active combatant disappeared.");
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const resource = prepareCompiledActionResource(next, nextEnemy, program, rolls, changes);
  if (resource.status === "unavailable") {
    return rejection(state, tool, resource.code, resource.message);
  }
  if (resource.status === "recharge-failed") {
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${enemyView.name}'s ${program.sourceName} does not recharge. The creature still has its turn and must choose another action.`,
      { combatantId: enemy.id, actionKey: program.sourceActionKey, rechargeRoll: resource.roll },
      "recharge_failed",
      rolls,
      modifiers,
      changes,
      [enemy.contentKey, program.contentKey]
    );
  }
  consumeCompiledActionResource(nextEnemy, program, changes);

  const attackMessages: string[] = [];
  let hitCount = 0;
  for (let index = 0; index < attacks.length && next.character.lifecycleState !== "dead"; index += 1) {
    const attack = attacks[index];
    if (!attack) continue;
    const result = resolveOneCreatureAttack(next, attack, index + 1, rolls, modifiers, changes, clientCommandId, nextEnemy);
    attackMessages.push(result.message);
    if (result.hit) hitCount += 1;
  }
  next.combat.lastAction = program.sourceActionKey;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  const message = `${enemyView.name} uses ${program.sourceName}. ${attackMessages.join(" ")}${turnSuffix}`;
  const outcome = next.character.lifecycleState === "dead"
    ? "dead"
    : next.character.hp === 0
      ? "downed"
      : hitCount > 0
        ? "enemy_multiattack_hit"
        : "enemy_multiattack_miss";
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      combatantId: enemy.id,
      actionKey: program.sourceActionKey,
      programKey: program.contentKey,
      attacksResolved: attackMessages.length,
      hits: hitCount,
      cover,
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    outcome,
    rolls,
    modifiers,
    changes,
    [enemy.contentKey, program.contentKey, ...sequence.steps.map((step) => step.attackContentKey)]
  );
}

function resolveCompiledSaveDamage(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  const save = program.operations.find((operation) => operation.kind === "saving-throw");
  const damage = program.operations.find((operation) => operation.kind === "damage");
  if (!save || !damage) {
    return rejection(state, tool, "invalid_effect_program", "The save-damage program is incomplete.");
  }
  const next = cloneCampaign(state);
  const nextEnemy = next.combat.enemies.find((candidate) => candidate.id === enemy.id);
  if (!nextEnemy) return rejection(state, tool, "combatant_not_found", "The active combatant disappeared.");
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const resource = prepareCompiledActionResource(next, nextEnemy, program, rolls, changes);
  if (resource.status === "unavailable") return rejection(state, tool, resource.code, resource.message);
  if (resource.status === "recharge-failed") {
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${enemyView.name}'s ${program.sourceName} does not recharge. The creature still has its turn and must choose another action.`,
      { combatantId: enemy.id, actionKey: program.sourceActionKey, rechargeRoll: resource.roll },
      "recharge_failed",
      rolls,
      modifiers,
      changes,
      [enemy.contentKey, program.contentKey]
    );
  }
  consumeCompiledActionResource(nextEnemy, program, changes);

  const savingRoll = randomInt(1, 21);
  const savingModifier = next.character.savingThrows[save.ability];
  const savingTotal = savingRoll + savingModifier;
  const succeeded = savingTotal >= save.dc;
  rolls.push({ kind: `character_${save.ability}_save_d20`, value: savingRoll, sides: 20 });
  modifiers.push(
    { name: `${save.ability}_saving_throw`, value: savingModifier },
    { name: "effect_save_dc", value: save.dc }
  );
  const rolledDamage = rollCompiledDamage(damage, rolls);
  const appliedDamage = succeeded
    ? damage.saveOnSuccess === "half" ? Math.floor(rolledDamage / 2) : 0
    : rolledDamage;
  applyCharacterDamage(next, appliedDamage, "compiled-effect", clientCommandId, changes, rolls, modifiers, false);
  next.combat.lastAction = program.sourceActionKey;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  const area = program.operations.find((operation) => operation.kind === "area");
  const saveText = `${savingTotal} against DC ${save.dc}`;
  const message = `${enemyView.name} uses ${program.sourceName}${area ? ` in a ${area.size}-foot ${area.shape}` : ""}. `
    + `${next.character.name || "The character"} rolls ${saveText} and ${succeeded ? "succeeds" : "fails"}, taking ${appliedDamage} ${damage.damageType.name.toLocaleLowerCase("en-US")} damage.${turnSuffix}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      combatantId: enemy.id,
      actionKey: program.sourceActionKey,
      programKey: program.contentKey,
      save: { ability: save.ability, dc: save.dc, roll: savingRoll, modifier: savingModifier, total: savingTotal, succeeded },
      damage: { rolled: rolledDamage, applied: appliedDamage, type: damage.damageType },
      area: area ?? null,
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    next.character.hp === 0 ? "downed" : succeeded ? "saving_throw_success" : "saving_throw_failure",
    rolls,
    modifiers,
    changes,
    [enemy.contentKey, program.contentKey, damage.damageType.contentKey]
  );
}

function resolveCompiledSaveCondition(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  const save = program.operations.find((operation) => operation.kind === "saving-throw");
  const condition = program.operations.find((operation) => operation.kind === "apply-condition");
  if (!save || !condition) {
    return rejection(state, tool, "invalid_effect_program", "The save-condition program is incomplete.");
  }
  const next = cloneCampaign(state);
  const nextEnemy = next.combat.enemies.find((candidate) => candidate.id === enemy.id);
  if (!nextEnemy) return rejection(state, tool, "combatant_not_found", "The active combatant disappeared.");
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const resource = prepareCompiledActionResource(next, nextEnemy, program, rolls, changes);
  if (resource.status === "unavailable") return rejection(state, tool, resource.code, resource.message);
  if (resource.status === "recharge-failed") {
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${enemyView.name}'s ${program.sourceName} does not recharge. The creature still has its turn and must choose another action.`,
      { combatantId: enemy.id, actionKey: program.sourceActionKey, rechargeRoll: resource.roll },
      "recharge_failed",
      rolls,
      modifiers,
      changes,
      [enemy.contentKey, program.contentKey]
    );
  }
  consumeCompiledActionResource(nextEnemy, program, changes);

  const savingRoll = randomInt(1, 21);
  const savingModifier = next.character.savingThrows[save.ability];
  const savingTotal = savingRoll + savingModifier;
  const succeeded = savingTotal >= save.dc;
  rolls.push({ kind: `character_${save.ability}_save_d20`, value: savingRoll, sides: 20 });
  modifiers.push(
    { name: `${save.ability}_saving_throw`, value: savingModifier },
    { name: "effect_save_dc", value: save.dc }
  );
  if (!succeeded) {
    const beforeConditions = [...next.character.conditions];
    const beforeEffects = [...next.character.conditionEffects];
    const conditionName = normalizeCondition(condition.condition.name);
    const runtime = applyConditionRuntimeEffect(
      next,
      conditionName,
      `combatant:${enemy.id}`,
      next.character.id,
      condition.duration,
      `condition:${condition.condition.contentKey}`,
      ["duration", "source-removal"],
      clientCommandId,
      changes,
    );
    if (runtime.decision !== "ignored") {
      next.character.conditionEffects = next.character.conditionEffects.filter((effect) =>
        effect.conditionContentKey !== condition.condition.contentKey || effect.sourceCombatantId !== enemy.id
      );
      next.character.conditionEffects.push({
        id: runtime.effect.id,
        conditionContentKey: condition.condition.contentKey,
        packHash: enemy.packHash,
        name: condition.condition.name,
        sourceContentKey: enemy.contentKey,
        sourceCombatantId: enemy.id,
        appliedRound: next.combat.round,
        duration: condition.duration,
        repeatSave: condition.repeatSave,
      });
    }
    syncConditionProjections(next);
    changes.push(
      { path: "/character/conditions", before: beforeConditions, after: next.character.conditions },
      { path: "/character/conditionEffects", before: beforeEffects, after: next.character.conditionEffects }
    );
  }
  next.combat.lastAction = program.sourceActionKey;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  const message = `${enemyView.name} uses ${program.sourceName}. ${next.character.name || "The character"} rolls ${savingTotal} against DC ${save.dc} and `
    + `${succeeded ? "resists the effect" : `becomes ${condition.condition.name.toLocaleLowerCase("en-US")}`}.${turnSuffix}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      combatantId: enemy.id,
      actionKey: program.sourceActionKey,
      programKey: program.contentKey,
      save: { ability: save.ability, dc: save.dc, roll: savingRoll, modifier: savingModifier, total: savingTotal, succeeded },
      condition: succeeded ? null : condition,
      effects: next.effects.filter((candidate) => candidate.status === "active"),
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    succeeded ? "saving_throw_success" : "condition_applied",
    rolls,
    modifiers,
    changes,
    [enemy.contentKey, program.contentKey, condition.condition.contentKey]
  );
}

function prepareCompiledActionResource(
  state: LanternCampaignState,
  enemy: EngineCombatant,
  program: CompiledEffectProgram,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
):
  | { status: "ready" }
  | { status: "recharge-failed"; roll: number }
  | { status: "unavailable"; code: string; message: string } {
  if (!program.usage || !program.sourceActionKey) return { status: "ready" };
  let resource = enemy.actionResources[program.sourceActionKey];
  if (!resource) {
    resource = program.usage.kind === "per-day"
      ? {
          kind: "per-day",
          usesRemaining: program.usage.uses,
          available: program.usage.uses > 0,
          rechargeMinimum: null,
          lastRechargeRound: null,
        }
      : {
          kind: "recharge",
          usesRemaining: null,
          available: true,
          rechargeMinimum: program.usage.minimumRoll,
          lastRechargeRound: null,
        };
    enemy.actionResources[program.sourceActionKey] = resource;
    changes.push({
      path: `/combat/enemies/${enemy.id}/actionResources/${program.sourceActionKey}`,
      before: null,
      after: { ...resource },
    });
  }
  if (resource.kind === "per-day") {
    if ((resource.usesRemaining ?? 0) <= 0) {
      return { status: "unavailable", code: "usage_limit_exhausted", message: `${program.sourceName} has no uses remaining.` };
    }
    return { status: "ready" };
  }
  if (resource.available) return { status: "ready" };
  if (resource.lastRechargeRound === state.combat.round) {
    return {
      status: "unavailable",
      code: "action_not_recharged",
      message: `${program.sourceName} did not recharge this round. Choose another action.`,
    };
  }
  const before = { ...resource };
  const roll = randomInt(1, 7);
  resource.lastRechargeRound = state.combat.round;
  rolls.push({ kind: "recharge_d6", value: roll, sides: 6 });
  if (roll >= (resource.rechargeMinimum ?? 6)) resource.available = true;
  changes.push({
    path: `/combat/enemies/${enemy.id}/actionResources/${program.sourceActionKey}`,
    before,
    after: { ...resource },
  });
  return resource.available ? { status: "ready" } : { status: "recharge-failed", roll };
}

function consumeCompiledActionResource(
  enemy: EngineCombatant,
  program: CompiledEffectProgram,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  if (!program.sourceActionKey) return;
  const resource = enemy.actionResources[program.sourceActionKey];
  if (!resource) return;
  const before = { ...resource };
  if (resource.kind === "per-day") {
    resource.usesRemaining = Math.max(0, (resource.usesRemaining ?? 0) - 1);
    resource.available = (resource.usesRemaining ?? 0) > 0;
  } else {
    resource.available = false;
  }
  changes.push({
    path: `/combat/enemies/${enemy.id}/actionResources/${program.sourceActionKey}`,
    before,
    after: { ...resource },
  });
}

interface CreatureAttackResolution {
  hit: boolean;
  message: string;
  critical: boolean;
  damageApplied: number;
  hpBefore: number;
  hpAfter: number;
  attackRoll: number;
  attackTotal: number;
  armorClass: number;
  cover: EngineTacticalCover;
}

function resolveOneCreatureAttack(
  state: LanternCampaignState,
  attack: CompiledCreatureAttack,
  sequenceNumber: number,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
  sourceCommandId: string,
  attacker: EngineCombatant,
  options: {
    damageSource?: string;
    targetPosition?: EngineTacticalPosition;
    deferDamage?: boolean;
  } = {},
): CreatureAttackResolution {
  const hpBefore = state.character.hp;
  const cover = incomingCharacterCover(state, attacker, options.targetPosition);
  const armorClass = characterArmorClassWithCover(state, cover);
  const attackRoll = randomInt(1, 21);
  const modifierQuery = queryModifiers(state.effects, state.character.id, "attack-roll");
  const secondRoll = modifierQuery.mode === "advantage" || modifierQuery.mode === "disadvantage"
    ? randomInt(1, 21)
    : null;
  const effectiveRoll = secondRoll === null
    ? attackRoll
    : modifierQuery.mode === "advantage"
      ? Math.max(attackRoll, secondRoll)
      : Math.min(attackRoll, secondRoll);
  const total = effectiveRoll + attack.toHit;
  const critical = effectiveRoll === 20;
  const hit = cover.level !== "total" && effectiveRoll !== 1 && (critical || total >= armorClass);
  rolls.push({ kind: `enemy_attack_${sequenceNumber}_d20`, value: effectiveRoll, sides: 20 });
  if (secondRoll !== null) rolls.push({ kind: `enemy_attack_${sequenceNumber}_${modifierQuery.mode}_d20`, value: secondRoll, sides: 20 });
  modifiers.push(
    { name: `enemy_attack_${sequenceNumber}_bonus`, value: attack.toHit },
    { name: `enemy_attack_${sequenceNumber}_armor_class`, value: armorClass },
    ...(cover.armorClassBonus
      ? [{ name: `enemy_attack_${sequenceNumber}_${cover.level}_cover_ac`, value: cover.armorClassBonus }]
      : []),
  );
  if (!hit) {
    return {
      hit: false,
      message: `${attack.name} misses.`,
      critical,
      damageApplied: 0,
      hpBefore,
      hpAfter: hpBefore,
      attackRoll: effectiveRoll,
      attackTotal: total,
      armorClass,
      cover,
    };
  }
  if (options.deferDamage) {
    return {
      hit: true,
      message: `${attack.name} would hit.`,
      critical,
      damageApplied: 0,
      hpBefore,
      hpAfter: hpBefore,
      attackRoll: effectiveRoll,
      attackTotal: total,
      armorClass,
      cover,
    };
  }

  const diceCount = attack.damage.diceCount * (critical ? 2 : 1);
  let damage = attack.damage.bonus;
  for (let index = 0; index < diceCount; index += 1) {
    const die = randomInt(1, attack.damage.dieSides + 1);
    damage += die;
    rolls.push({ kind: `enemy_damage_${sequenceNumber}`, value: die, sides: attack.damage.dieSides });
  }
  damage = Math.max(0, damage);
  modifiers.push({ name: `enemy_damage_${sequenceNumber}_bonus`, value: attack.damage.bonus });
  const applied = applyCharacterDamage(state, damage, options.damageSource ?? "enemy-multiattack", sourceCommandId, changes, rolls, modifiers, critical);
  return {
    hit: true,
    message: `${attack.name} ${critical ? "critically " : ""}hits for ${damage} ${attack.damage.typeName.toLocaleLowerCase("en-US")} damage.`,
    critical,
    damageApplied: applied.applied,
    hpBefore: applied.beforeHp,
    hpAfter: applied.afterHp,
    attackRoll: effectiveRoll,
    attackTotal: total,
    armorClass,
    cover,
  };
}

function rollCompiledDamage(
  damage: Extract<CompiledEffectProgram["operations"][number], { kind: "damage" }>,
  rolls: Array<{ kind: string; value: number; sides?: number }>
): number {
  if (damage.expression.kind === "flat") return damage.expression.amount;
  let total = damage.expression.bonus;
  for (let index = 0; index < damage.expression.diceCount; index += 1) {
    const die = randomInt(1, damage.expression.dieSides + 1);
    total += die;
    rolls.push({ kind: "enemy_effect_damage", value: die, sides: damage.expression.dieSides });
  }
  return Math.max(0, total);
}

function applyCharacterDamage(
  state: LanternCampaignState,
  amount: number,
  source: string,
  sourceCommandId: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  critical = false,
): { beforeHp: number; afterHp: number; applied: number } {
  const beforeHp = state.character.hp;
  if (state.character.lifecycleState === "dead") return { beforeHp, afterHp: beforeHp, applied: 0 };
  const applied = Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0));
  state.character.hp = Math.max(0, beforeHp - applied);
  if (beforeHp !== state.character.hp) changes.push({ path: "/character/hp", before: beforeHp, after: state.character.hp });
  applyConcentrationAndDownedState(state, applied, rolls, modifiers, changes, critical, sourceCommandId, source, beforeHp);
  return { beforeHp, afterHp: state.character.hp, applied };
}

function applyControlledActorDamage(
  state: LanternCampaignState,
  actor: EngineControlledActor,
  amount: number,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
): { beforeHp: number; afterHp: number; applied: number } {
  const beforeHp = actor.hp;
  if (actor.status !== "active") return { beforeHp, afterHp: beforeHp, applied: 0 };
  const applied = Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0));
  actor.hp = Math.max(0, beforeHp - applied);
  if (beforeHp !== actor.hp) {
    changes.push({ path: `/controlledActors/${actor.id}/hp`, before: beforeHp, after: actor.hp });
  }
  if (actor.hp > 0) return { beforeHp, afterHp: actor.hp, applied };

  const beforeStatus = actor.status;
  const beforeTerminalAtMinutes = actor.terminalAtMinutes;
  const beforeCommandedThisTurn = actor.commandedThisTurn;
  actor.status = "dead";
  actor.terminalAtMinutes = state.time.gameTime.totalMinutes;
  actor.commandedThisTurn = false;
  changes.push(
    { path: `/controlledActors/${actor.id}/status`, before: beforeStatus, after: actor.status },
    { path: `/controlledActors/${actor.id}/terminalAtMinutes`, before: beforeTerminalAtMinutes, after: actor.terminalAtMinutes },
  );
  if (beforeCommandedThisTurn) {
    changes.push({ path: `/controlledActors/${actor.id}/commandedThisTurn`, before: true, after: false });
  }
  if (actor.sourceRef) removeRuntimeSource(state, actor.sourceRef, changes);
  const beforeScheduledEvents = state.time.scheduledEvents;
  state.time.scheduledEvents = state.time.scheduledEvents.filter((event) => event.targetRef !== actor.id || event.status !== "pending");
  if (beforeScheduledEvents.length !== state.time.scheduledEvents.length) {
    changes.push({ path: "/time/scheduledEvents", before: beforeScheduledEvents, after: state.time.scheduledEvents });
  }
  return { beforeHp, afterHp: actor.hp, applied };
}

function applyConcentrationAndDownedState(
  state: LanternCampaignState,
  damage: number,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
  critical = false,
  sourceCommandId: string | null = null,
  source = "damage",
  beforeHp = state.character.hp,
): void {
  if (state.character.hp === 0) {
    if (state.character.spellcasting?.concentration) {
      const before = state.character.spellcasting.concentration;
      state.character.spellcasting.concentration = null;
      changes.push({ path: "/character/spellcasting/concentration", before, after: null });
    }
    if (damage > 0 && beforeHp === 0 && state.character.lifecycleState !== "dead") {
      const beforeFailures = state.character.deathSaveFailures;
      const beforeSuccesses = state.character.deathSaveSuccesses;
      const addedFailures = critical ? 2 : 1;
      state.character.deathSaveFailures = Math.min(3, beforeFailures + addedFailures);
      state.character.deathSaveSuccesses = 0;
      if (beforeFailures !== state.character.deathSaveFailures) {
        changes.push({ path: "/character/deathSaveFailures", before: beforeFailures, after: state.character.deathSaveFailures });
      }
      if (beforeSuccesses !== 0) {
        changes.push({ path: "/character/deathSaveSuccesses", before: beforeSuccesses, after: 0 });
      }
      state.character.lifecycleState = "dying";
      removeRuntimeCondition(state, state.character.id, "stable", changes);
      if (state.character.deathSaveFailures >= 3) {
        transitionActorToDead(state, sourceCommandId ?? randomUUID(), source === "death-save" ? "death-save" : "damage", changes);
        return;
      }
    } else if (beforeHp > 0 && state.character.lifecycleState !== "dead") {
      const beforeLifecycle = state.character.lifecycleState;
      state.character.lifecycleState = "dying";
      const beforeDeathRecord = state.character.deathRecord;
      state.character.deathRecord = sourceCommandId
        ? { source: source === "death-save" ? "death-save" : "damage", sourceCommandId, sourceVersion: state.version, occurredAt: new Date().toISOString() }
        : state.character.deathRecord;
      if (beforeLifecycle !== state.character.lifecycleState) changes.push({ path: "/character/lifecycleState", before: beforeLifecycle, after: state.character.lifecycleState });
      if (JSON.stringify(beforeDeathRecord) !== JSON.stringify(state.character.deathRecord)) {
        changes.push({ path: "/character/deathRecord", before: beforeDeathRecord, after: state.character.deathRecord });
      }
    }
    const beforeConditions = [...state.character.conditions];
    applyConditionRuntimeEffect(
      state,
      "unconscious",
      "system:downed",
      state.character.id,
      { kind: "persistent" },
      "condition:unconscious",
      ["never"],
      sourceCommandId,
      changes,
    );
    if (JSON.stringify(beforeConditions) !== JSON.stringify(state.character.conditions)) {
      changes.push({ path: "/character/conditions", before: beforeConditions, after: state.character.conditions });
    }
    return;
  }
  if (damage <= 0 || !state.character.spellcasting?.concentration) return;
  const dc = Math.max(10, Math.floor(damage / 2));
  const roll = randomInt(1, 21);
  const modifier = state.character.savingThrows.con;
  const held = roll + modifier >= dc;
  rolls.push({ kind: "concentration_save_d20", value: roll, sides: 20 });
  modifiers.push({ name: "concentration_save_bonus", value: modifier }, { name: "concentration_dc", value: dc });
  if (!held) {
    const before = state.character.spellcasting.concentration;
    state.character.spellcasting.concentration = null;
    changes.push({ path: "/character/spellcasting/concentration", before, after: null });
  }
}

function applyHealing(
  state: LanternCampaignState,
  amount: number,
  source: string,
  changes?: Array<{ path: string; before: unknown; after: unknown }>
): { source: string; requested: number; healed: number; beforeHp: number; afterHp: number } {
  const requested = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
  const beforeHp = state.character.hp;
  if (state.character.lifecycleState === "dead" || hasRuntimeCondition(state, state.character.id, "dead")) {
    return { source, requested, healed: 0, beforeHp, afterHp: beforeHp };
  }
  const afterHp = Math.min(state.character.maxHp, beforeHp + requested);
  state.character.hp = afterHp;
  if (changes && beforeHp !== afterHp) changes.push({ path: "/character/hp", before: beforeHp, after: afterHp });
  const recoveredFromZero = beforeHp === 0 && afterHp > 0;
  if (afterHp > beforeHp) {
    const hadDownedMarker = hasRuntimeCondition(state, state.character.id, "unconscious")
      || hasRuntimeCondition(state, state.character.id, "stable");
    removeRuntimeCondition(state, state.character.id, "unconscious", changes);
    removeRuntimeCondition(state, state.character.id, "stable", changes);
    if (recoveredFromZero || hadDownedMarker) {
      const beforeSuccesses = state.character.deathSaveSuccesses;
      const beforeFailures = state.character.deathSaveFailures;
      state.character.deathSaveSuccesses = 0;
      state.character.deathSaveFailures = 0;
      if (changes && beforeSuccesses !== 0) changes.push({ path: "/character/deathSaveSuccesses", before: beforeSuccesses, after: 0 });
      if (changes && beforeFailures !== 0) changes.push({ path: "/character/deathSaveFailures", before: beforeFailures, after: 0 });
    }
    const beforeLifecycle = state.character.lifecycleState;
    const beforeDeathRecord = state.character.deathRecord;
    state.character.lifecycleState = "conscious";
    state.character.deathRecord = null;
    if (changes && beforeLifecycle !== "conscious") changes.push({ path: "/character/lifecycleState", before: beforeLifecycle, after: "conscious" });
    if (changes && beforeDeathRecord !== null) changes.push({ path: "/character/deathRecord", before: beforeDeathRecord, after: null });
    syncConditionProjections(state);
  }
  return { source, requested, healed: afterHp - beforeHp, beforeHp, afterHp };
}

function finishCreatureTurn(
  state: LanternCampaignState,
  enemyId: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): string {
  expireSourceEndConditionEffects(state, enemyId, changes);
  const beforeActorId = state.combat.activeActorId;
  const beforeRound = state.combat.round;
  const nextEnemyId = nextLiveCombatantId(state.combat, enemyId);
  if (nextEnemyId) {
    state.combat.activeActorId = nextEnemyId;
    changes.push({ path: "/combat/activeActorId", before: beforeActorId, after: nextEnemyId });
    return " The next foe acts.";
  }
  state.combat.round += 1;
  state.combat.activeActorId = state.actorId;
  resetTurnBudget(state.combat.turnBudget, state.character.speed);
  resetEnemyReactions(state.combat, changes);
  resetControlledActorTurns(state, changes);
  if (state.character.hp === 0) spendTurnSlot(state.combat.turnBudget, "action");
  const beforeConditions = [...state.character.conditions];
  expireAtCharacterTurnStart(state, changes);
  changes.push(
    { path: "/combat/round", before: beforeRound, after: state.combat.round },
    { path: "/combat/activeActorId", before: beforeActorId, after: state.actorId }
  );
  if (beforeConditions.length !== state.character.conditions.length) {
    changes.push({ path: "/character/conditions", before: beforeConditions, after: state.character.conditions });
  }
  return state.character.hp === 0
    ? " Your turn arrives; make a death save."
    : " The initiative returns to you.";
}

function resolveTargetEndConditionEffects(
  state: LanternCampaignState,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const removeIds = new Set<string>();
  for (const effect of state.character.conditionEffects) {
    if (
      effect.duration.kind === "turn-boundary"
      && effect.duration.subject === "target"
      && effect.duration.boundary === "end"
    ) {
      removeIds.add(effect.id);
    }
    if (effect.repeatSave?.timing !== "end-of-turn") continue;
    const roll = randomInt(1, 21);
    const modifier = state.character.savingThrows[effect.repeatSave.ability];
    const total = roll + modifier;
    rolls.push({ kind: `condition_${effect.repeatSave.ability}_repeat_save_d20`, value: roll, sides: 20 });
    modifiers.push(
      { name: `condition_${effect.repeatSave.ability}_repeat_save`, value: modifier },
      { name: "condition_repeat_save_dc", value: effect.repeatSave.dc }
    );
    if (total >= effect.repeatSave.dc) removeIds.add(effect.id);
  }
  removeAppliedConditions(state, removeIds, changes);
  const beforeEffects = state.effects;
  state.effects = expireEffectsAtBoundary(state.effects, state.character.id, "end", state.combat.round);
  syncConditionProjections(state);
  if (JSON.stringify(beforeEffects) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before: beforeEffects, after: state.effects });
  }
}

function expireSourceEndConditionEffects(
  state: LanternCampaignState,
  sourceCombatantId: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const removeIds = new Set(
    state.character.conditionEffects
      .filter((effect) =>
        effect.sourceCombatantId === sourceCombatantId
        && effect.duration.kind === "turn-boundary"
        && effect.duration.subject === "source"
        && effect.duration.boundary === "end"
        && state.combat.round >= effect.appliedRound + effect.duration.offsetTurns
      )
      .map((effect) => effect.id)
  );
  removeAppliedConditions(state, removeIds, changes);
  const beforeEffects = state.effects;
  state.effects = expireEffectsAtBoundary(state.effects, sourceCombatantId, "end", state.combat.round);
  syncConditionProjections(state);
  if (JSON.stringify(beforeEffects) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before: beforeEffects, after: state.effects });
  }
}

function expireAtCharacterTurnStart(
  state: LanternCampaignState,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const liveSourceIds = new Set(state.combat.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id));
  const removeIds = new Set(
    state.character.conditionEffects
      .filter((effect) => {
        if (effect.duration.kind === "source-lifetime") return !liveSourceIds.has(effect.sourceCombatantId);
        if (
          effect.duration.kind === "turn-boundary"
          && effect.duration.subject === "target"
          && effect.duration.boundary === "start"
        ) return true;
        if (effect.duration.kind !== "fixed") return false;
        const durationRounds = effect.duration.unit === "round"
          ? effect.duration.amount
          : effect.duration.unit === "minute"
            ? effect.duration.amount * 10
            : effect.duration.unit === "hour"
              ? effect.duration.amount * 600
              : effect.duration.amount * 14_400;
        return state.combat.round >= effect.appliedRound + durationRounds;
      })
      .map((effect) => effect.id)
  );
  removeAppliedConditions(state, removeIds, changes);
  const beforeEffects = state.effects;
  for (const enemy of state.combat.enemies.filter((candidate) => !candidate.alive)) {
    removeRuntimeSource(state, `combatant:${enemy.id}`, changes);
  }
  state.effects = expireEffectsAtBoundary(state.effects, state.character.id, "start", state.combat.round);
  state.effects = expireSourceLifetimeEffects(
    state.effects,
    new Set([...liveSourceIds].map((id) => `combatant:${id}`)),
  );
  syncConditionProjections(state);
  const beforeAc = state.character.ac;
  state.character.ac = deriveArmorClass(state.character, state.effects);
  if (beforeAc !== state.character.ac) changes.push({ path: "/character/ac", before: beforeAc, after: state.character.ac });
  if (JSON.stringify(beforeEffects) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before: beforeEffects, after: state.effects });
  }
}

function removeAppliedConditions(
  state: LanternCampaignState,
  removeIds: ReadonlySet<string>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  if (removeIds.size === 0) return;
  const beforeEffects = [...state.character.conditionEffects];
  state.character.conditionEffects = beforeEffects.filter((effect) => !removeIds.has(effect.id));
  const beforeCanonicalEffects = state.effects;
  state.effects = state.effects.map((effect) => removeIds.has(effect.id) && effect.status === "active"
    ? { ...effect, status: "expired" as const }
    : effect);
  const beforeConditions = [...state.character.conditions];
  syncConditionProjections(state);
  changes.push({ path: "/character/conditionEffects", before: beforeEffects, after: state.character.conditionEffects });
  if (JSON.stringify(beforeConditions) !== JSON.stringify(state.character.conditions)) {
    changes.push({ path: "/character/conditions", before: beforeConditions, after: state.character.conditions });
  }
  if (JSON.stringify(beforeCanonicalEffects) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before: beforeCanonicalEffects, after: state.effects });
  }
}

function resolveDeathSave(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "death_save" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.character.hp !== 0 || state.character.lifecycleState !== "dying" || !hasRuntimeCondition(state, state.character.id, "unconscious")) {
    return rejection(state, tool, "not_unconscious", "Death saves are only made when your character is unconscious at 0 HP.");
  }
  const roll = randomInt(1, 21);
  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  let success = false;
  let outcome = "death_save_failure";
  let message = "Death save: d20 " + roll + ". ";
  if (roll === 20) {
    success = true;
    applyHealing(next, 1, "death-save-natural-20", changes);
    next.character.lifecycleState = "conscious";
    next.character.deathRecord = null;
    message += "Natural 20; you regain 1 hit point and stand.";
    outcome = "death_save_natural_20";
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
    spendTurnSlot(next.combat.turnBudget, "action");
  } else if (roll === 1) {
    next.character.deathSaveFailures = Math.min(3, next.character.deathSaveFailures + 2);
    message += "Natural 1; two failures.";
    outcome = "death_save_natural_1";
  } else if (roll >= 10) {
    success = true;
    next.character.deathSaveSuccesses += 1;
    message += "A success.";
    outcome = "death_save_success";
  } else {
    next.character.deathSaveFailures += 1;
    message += "A failure.";
  }
  if (next.character.lifecycleState === "conscious") {
    // Natural 20 already recovered the actor and does not enter a terminal branch.
  } else if (next.character.deathSaveSuccesses >= 3) {
    const beforeConditions = [...next.character.conditions];
    removeRuntimeCondition(next, next.character.id, "unconscious", changes);
    applyConditionRuntimeEffect(next, "stable", "system:death-save", next.character.id, { kind: "persistent" }, "condition:stable", ["never"], clientCommandId, changes);
    if (JSON.stringify(beforeConditions) !== JSON.stringify(next.character.conditions)) {
      changes.push({ path: "/character/conditions", before: beforeConditions, after: next.character.conditions });
    }
    const beforeLifecycle = next.character.lifecycleState;
    next.character.lifecycleState = "stable";
    if (beforeLifecycle !== next.character.lifecycleState) changes.push({ path: "/character/lifecycleState", before: beforeLifecycle, after: next.character.lifecycleState });
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
    spendTurnSlot(next.combat.turnBudget, "action");
    message += " You stabilize.";
    outcome = "stable";
  } else if (next.character.deathSaveFailures >= 3) {
    transitionActorToDead(next, clientCommandId, "death-save", changes);
    message += " The character dies.";
    outcome = "dead";
  } else if (outcome !== "death_save_natural_20") {
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
    spendTurnSlot(next.combat.turnBudget, "action");
  }

  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      roll,
      success,
      successes: next.character.deathSaveSuccesses,
      failures: next.character.deathSaveFailures,
      character: characterData(next.character),
    },
    outcome,
    [{ kind: "death_save_d20", value: roll, sides: 20 }],
    [],
    [
      { path: "/character/deathSaveSuccesses", before: state.character.deathSaveSuccesses, after: next.character.deathSaveSuccesses },
      { path: "/character/deathSaveFailures", before: state.character.deathSaveFailures, after: next.character.deathSaveFailures },
      ...changes,
    ]
  );
}

function resolveLoot(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "loot" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (command.corpseId) return resolveCorpseLoot(state, context, clientCommandId, command, tool);
  if (state.combat.status !== "ended") return rejection(state, tool, "encounter_active", "There is no defeated encounter to loot.");
  const lifecycleRewardKey = state.combat.lifecycle?.outcomeId ? `${state.combat.lifecycle.outcomeId}:loot` : null;
  if (lifecycleRewardKey && (state.claimedRewards.includes(lifecycleRewardKey) || state.combat.lifecycle?.claimedRewards.includes(lifecycleRewardKey))) {
    return rejection(state, tool, "reward_claimed", "This encounter outcome's reward has already been claimed.");
  }
  if (state.combat.lootClaimed) return rejection(state, tool, "loot_claimed", "The encounter area has already been searched.");
  const quest = command.questId ? state.quests.find((candidate) => candidate.id === command.questId) : null;
  if (command.questId && !quest) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  if (quest?.graph) return rejection(state, tool, "quest_transition_required", "Graph quest rewards resolve only through a declared quest_transition.");
  const questRewardKey = quest ? `${quest.id}:legacy:reward` : null;
  const questRewardAvailable = Boolean(quest && !quest.rewardClaimed && !(questRewardKey && state.claimedRewards.includes(questRewardKey)));
  const questReward = questRewardAvailable && quest ? quest.reward : { xp: 0, copper: 0 };
  const normalizedRewards = command.items.map((item) => normalizeInventoryItem({ ...item, equipped: false }));
  const rewardIds = new Set<string>();
  for (const item of normalizedRewards) {
    if (rewardIds.has(item.id) || state.character.inventory.some((candidate) => candidate.id === item.id)) {
      return rejection(state, tool, "duplicate_item_instance", "Loot cannot create a second item instance with an existing id.");
    }
    rewardIds.add(item.id);
  }
  const rewardItems = normalizedRewards.map((item) => withActorOwnership(item, state.character.id, { kind: "loot", sourceId: clientCommandId }));
  const totalCopper = command.rewardCopper + questReward.copper;
  const totalXp = command.rewardXp + questReward.xp;
  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => ({
    ...candidate,
    ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
  }));
  for (const item of rewardItems) addInventory(next.character.inventory, item);
  const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
  if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
  next.character.currency.copper += totalCopper;
  syncCurrencyProjection(next.character);
  next.character.xp += totalXp;
  next.combat.lootClaimed = true;
  if (lifecycleRewardKey) {
    next.claimedRewards = [...new Set([...next.claimedRewards, lifecycleRewardKey])];
    if (next.combat.lifecycle && !next.combat.lifecycle.claimedRewards.includes(lifecycleRewardKey)) next.combat.lifecycle.claimedRewards.push(lifecycleRewardKey);
  }
  if (quest) {
    const nextQuest = next.quests.find((candidate) => candidate.id === quest.id);
    if (nextQuest) {
      nextQuest.status = "completed";
      nextQuest.progress = 100;
      nextQuest.rewardClaimed = true;
      if (next.quest.id === nextQuest.id) next.quest = nextQuest;
    }
    if (questRewardKey) next.claimedRewards = [...new Set([...next.claimedRewards, questRewardKey])];
  }
  const pendingAdvancement = questRewardAvailable && quest
    ? openPendingAdvancement(next, state, quest.id, clientCommandId)
    : null;
  const itemText = rewardItems.length
    ? " You recover " + rewardItems.map((item) => {
        const view = materializeInventoryItem(item);
        return item.quantity + " × " + view.name;
      }).join(", ") + "."
    : " No item reward was authored.";
  const moneyText = totalCopper || totalXp ? " The reward is " + formatCurrency(totalCopper) + " and " + totalXp + " XP." : " No currency or XP reward was authored.";
  const advancementText = pendingAdvancement ? " A level-up preview is ready for your confirmation." : "";
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You search the defeated encounter." + itemText + moneyText + advancementText,
    {
      items: materializeInventory(rewardItems),
      reward: { xp: totalXp, copper: totalCopper },
      quest: quest ? next.quests.find((candidate) => candidate.id === quest.id) : null,
      inventory: materializeInventory(next.character.inventory),
      currency: next.character.currency,
      currencyBreakdown: currencyBreakdown(next.character.currency.copper),
      xp: next.character.xp,
      pendingAdvancement,
    },
    quest ? "quest_completed" : "loot_claimed",
    [],
    [],
    [
      { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
      { path: "/character/currency", before: state.character.currency, after: next.character.currency },
      { path: "/character/xp", before: state.character.xp, after: next.character.xp },
      { path: "/claimedRewards", before: state.claimedRewards, after: next.claimedRewards },
      { path: "/combat/lootClaimed", before: state.combat.lootClaimed, after: next.combat.lootClaimed },
      ...(lifecycleRewardKey ? [{ path: "/combat/lifecycle/claimedRewards", before: state.combat.lifecycle?.claimedRewards ?? [], after: next.combat.lifecycle?.claimedRewards ?? [] }] : []),
      ...(quest ? [{ path: "/quests/" + quest.id, before: quest, after: next.quests.find((candidate) => candidate.id === quest.id) }] : []),
      ...(pendingAdvancement ? [{ path: "/pendingAdvancement", before: state.pendingAdvancement, after: pendingAdvancement }] : []),
    ]
  );
}

function resolveCorpseLoot(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "loot" }>,
  tool: EngineToolName | "declare" | "listen",
): EngineResolution {
  if (!context.capabilities.includes("dm")) return rejection(state, tool, "dm_required", "Only the DM may adjudicate corpse recovery in this single-actor slice.");
  if (state.character.lifecycleState === "dead") return rejection(state, tool, "actor_dead", "A dead character cannot receive corpse loot.");
  const corpse = state.corpses.find((candidate) => candidate.id === command.corpseId);
  if (!corpse) return rejection(state, tool, "corpse_not_found", "That corpse is not present in this campaign.");
  if (corpse.status !== "lootable") return rejection(state, tool, "corpse_looted", "That corpse has already been looted.");
  const duplicate = corpse.inventory.some((item) => state.character.inventory.some((candidate) => candidate.id === item.id));
  if (duplicate) return rejection(state, tool, "duplicate_item_instance", "Corpse recovery would duplicate an existing item instance.");
  const next = cloneCampaign(state);
  const nextCorpse = next.corpses.find((candidate) => candidate.id === command.corpseId);
  if (!nextCorpse) return rejection(state, tool, "corpse_not_found", "That corpse is not present in this campaign.");
  const recovered = nextCorpse.inventory.map((item) => withActorOwnership(item, next.character.id, { kind: "loot", sourceId: clientCommandId }));
  for (const item of recovered) addInventory(next.character.inventory, item);
  const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
  if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
  nextCorpse.inventory = [];
  nextCorpse.status = "looted";
  nextCorpse.lootedAt = new Date().toISOString();
  const beforeInventory = state.character.inventory;
  const beforeCorpse = corpse;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `The DM recovers ${recovered.length} item instance${recovered.length === 1 ? "" : "s"} from ${corpse.formerActorName}'s remains.`,
    { corpse: nextCorpse, items: materializeInventory(recovered), inventory: materializeInventory(next.character.inventory) },
    "corpse_looted",
    [],
    [],
    [
      { path: `/corpses/${corpse.id}`, before: beforeCorpse, after: nextCorpse },
      { path: "/character/inventory", before: beforeInventory, after: next.character.inventory },
    ],
  );
}

type ReviewedTravelProfile = {
  distanceMiles: number;
  elapsedMinutes: number;
  navigationDc: number;
  forcedMarch: boolean;
};

function reviewedTravelProfile(routeId: string, pace: EngineTravelPace): ReviewedTravelProfile | null {
  if (routeId !== "one-day-road-v1") return null;
  return pace === "fast"
    ? { distanceMiles: 30, elapsedMinutes: 6 * 60, navigationDc: 12, forcedMarch: true }
    : { distanceMiles: 24, elapsedMinutes: 8 * 60, navigationDc: 10, forcedMarch: false };
}

function normalizedItemProperties(item: EngineInventoryItem): string[] {
  try {
    return (materializeInventoryItem(item).properties ?? [])
      .map((property) => property.trim().toLocaleLowerCase("en-US").replaceAll(" ", "-"));
  } catch {
    return [];
  }
}

function supplyItem(state: LanternCampaignState, property: string): EngineInventoryItem | null {
  return state.character.inventory.find((item) => item.quantity > 0 && isActorOwnedItem(item, state.character.id) && normalizedItemProperties(item).includes(property)) ?? null;
}

function consumeInventoryProperty(
  state: LanternCampaignState,
  property: string,
  quantity: number,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
): boolean {
  const item = supplyItem(state, property);
  if (!item || item.quantity < quantity) return false;
  const before = item.quantity;
  item.quantity -= quantity;
  changes.push({ path: `/character/inventory/${item.id}/quantity`, before, after: item.quantity });
  return true;
}

function minutesForDuration(duration: EngineEffectDuration): number | null {
  if (duration.kind !== "fixed") return null;
  const multiplier = duration.unit === "minute" ? 1 : duration.unit === "hour" ? 60 : duration.unit === "day" ? ONE_DAY_MINUTES : null;
  return multiplier === null ? null : duration.amount * multiplier;
}

function advanceGameTime(
  next: LanternCampaignState,
  minutes: number,
  reason: string,
  sourceCommandId: string,
): { before: EngineGameTime; after: EngineGameTime; processedEventIds: string[]; expiredEffectIds: string[]; interrupted: boolean; questStateChanges: Array<{ path: string; before: unknown; after: unknown }> } {
  void reason;
  const social = ensureSocialState(next);
  const sourceState = cloneCampaign(next);
  const before = next.time.gameTime;
  const after = gameTimeAt(before.totalMinutes + Math.max(0, Math.trunc(minutes)));
  const processedEventIds: string[] = [];
  const expiredEffectIds: string[] = [];
  let interrupted = false;
  const dueEvents = next.time.scheduledEvents
    .filter((event) => event.status === "pending" && event.dueAtMinutes > before.totalMinutes && event.dueAtMinutes <= after.totalMinutes)
    .sort((left, right) => left.dueAtMinutes - right.dueAtMinutes || left.id.localeCompare(right.id));
  for (const event of dueEvents) {
    event.status = "processed";
    event.processedAtMinutes = event.dueAtMinutes;
    processedEventIds.push(event.id);
    if (event.kind === "rest-interruption" && next.time.rest.status === "in_progress") {
      next.time.rest.status = "interrupted";
      next.time.rest.interruptionEventId = event.id;
      interrupted = true;
    }
    if (event.kind === "effect-expiry" && event.targetRef) {
      const effect = next.effects.find((candidate) => candidate.id === event.targetRef && candidate.status === "active");
      if (effect) {
        effect.status = "expired";
        expiredEffectIds.push(effect.id);
      }
    }
    if (event.kind === "quest-deadline" && event.targetRef) {
      // Graph deadlines are applied below against the complete after-time snapshot;
      // legacy flat quests retain their compatibility failure path there as well.
    }
    if (event.kind === "social-propagation" && event.sourceRef) {
      const rumor = social.rumors.find((candidate) => candidate.id === event.sourceRef && candidate.status === "pending");
      if (rumor) {
        rumor.status = "propagated";
        rumor.propagatedAtMinutes = event.dueAtMinutes;
      }
    }
  }
  for (const effect of next.effects) {
    const durationMinutes = minutesForDuration(effect.duration);
    if (effect.status !== "active" || durationMinutes === null || effect.startTimeMinutes === undefined) continue;
    const dueAt = effect.startTimeMinutes + durationMinutes;
    if (dueAt > before.totalMinutes && dueAt <= after.totalMinutes) {
      effect.status = "expired";
      expiredEffectIds.push(effect.id);
    }
  }
  next.time.gameTime = after;
  const beforeControlledActors = sourceState.controlledActors;
  for (const actor of next.controlledActors) {
    if (actor.status !== "active" || actor.expiresAtMinutes === null || actor.expiresAtMinutes > after.totalMinutes) continue;
    actor.status = "expired";
    actor.terminalAtMinutes = actor.expiresAtMinutes;
    actor.commandedThisTurn = false;
    if (actor.sourceRef) removeRuntimeSource(next, actor.sourceRef);
    const expiryEvent = next.time.scheduledEvents.find((event) => event.kind === "controlled-actor-expiry" && event.targetRef === actor.id && event.status === "processed");
    if (!expiryEvent) {
      const matchingEvent = next.time.scheduledEvents.find((event) => event.kind === "controlled-actor-expiry" && event.targetRef === actor.id);
      if (matchingEvent) {
        matchingEvent.status = "processed";
        matchingEvent.processedAtMinutes = actor.expiresAtMinutes;
        processedEventIds.push(matchingEvent.id);
      }
    }
  }
  const questStateChanges = applyQuestDeadlineTransitions(next, sourceState, after, sourceCommandId);
  if (sourceState.situation && next.situation) {
    const beforeSituation = next.situation;
    const advancedSituation = advanceSituationPressure(next.situation, before.totalMinutes, after.totalMinutes);
    if (JSON.stringify(beforeSituation) !== JSON.stringify(advancedSituation)) {
      next.situation = advancedSituation;
      next.situation.revision += 1;
      questStateChanges.push({
        path: "/situation",
        before: projectSituationForActor(sourceState.situation, sourceState, sourceState.actorId),
        after: projectSituationForActor(next.situation, next, next.actorId),
      });
    }
  }
  if (JSON.stringify(beforeControlledActors) !== JSON.stringify(next.controlledActors)) {
    questStateChanges.push({ path: "/controlledActors", before: beforeControlledActors, after: next.controlledActors });
  }
  questStateChanges.push(...advanceQuestTimeClocks(next, sourceState, before, after));
  next.time.worldClocks = next.time.worldClocks.map((clock) => ({
    ...clock,
    elapsedMinutes: clock.elapsedMinutes + after.totalMinutes - before.totalMinutes,
    provenance: { sourceCommandId, sourceVersion: next.version + 1 },
  }));
  return { before, after, processedEventIds, expiredEffectIds: [...new Set(expiredEffectIds)], interrupted, questStateChanges };
}

function advanceQuestTimeClocks(
  next: LanternCampaignState,
  sourceState: LanternCampaignState,
  before: EngineGameTime,
  after: EngineGameTime,
): Array<{ path: string; before: unknown; after: unknown }> {
  const elapsed = Math.max(0, after.totalMinutes - before.totalMinutes);
  if (elapsed === 0) return [];
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [];
  for (const sourceQuest of sourceState.quests) {
    const target = next.quests.find((candidate) => candidate.id === sourceQuest.id);
    const sourceClock = sourceQuest.graph?.clock;
    const targetClock = target?.graph?.clock;
    if (!target || target.status !== "active" || !sourceClock || !targetClock || sourceClock.source !== "time") continue;
    const beforeClock = { ...targetClock };
    targetClock.current = Math.min(targetClock.max, Math.max(0, targetClock.current + elapsed));
    if (targetClock.current !== beforeClock.current) {
      stateChanges.push({ path: `/quests/${target.id}/graph/clock`, before: beforeClock, after: { ...targetClock } });
    }
  }
  return stateChanges;
}

function applyQuestDeadlineTransitions(
  next: LanternCampaignState,
  sourceState: LanternCampaignState,
  after: EngineGameTime,
  sourceCommandId: string,
): Array<{ path: string; before: unknown; after: unknown }> {
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [];
  const context: RequestContext = {
    requestId: sourceCommandId,
    accountId: next.accountId,
    campaignId: next.id,
    actorId: next.actorId,
    capabilities: ["dm"],
  };
  for (const sourceQuest of sourceState.quests) {
    if (sourceQuest.status !== "active" || sourceQuest.deadlineAtMinutes === undefined) continue;
    if (sourceQuest.deadlineAtMinutes > after.totalMinutes) continue;
    const target = next.quests.find((candidate) => candidate.id === sourceQuest.id);
    if (!target || target.status !== "active") continue;
    if (target.graph) {
      const transitionId = target.graph.deadlineTransitionId
        ?? target.graph.transitions.find((candidate) => candidate.outcome === "expiration")?.id;
      const transition = transitionId ? target.graph.transitions.find((candidate) => candidate.id === transitionId) : undefined;
      if (transition) {
        const applied = applyQuestTransitionState(next, sourceState, target, transition, context, sourceCommandId);
        if (!applied.error) stateChanges.push(...applied.stateChanges);
      } else {
        target.status = "expired";
        target.graph.terminalTransitionId = null;
        stateChanges.push({ path: `/quests/${target.id}`, before: projectQuestForActor(sourceQuest, sourceState, context.actorId), after: projectQuestForActor(target, next, context.actorId) });
      }
    } else {
      target.status = "failed";
      stateChanges.push({ path: `/quests/${target.id}/status`, before: sourceQuest.status, after: target.status });
      if (next.quest.id === target.id) next.quest = target;
    }
  }
  return stateChanges;
}

function resolveTravel(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "travel" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") return rejection(state, tool, "combat_active", "You cannot travel during an active encounter.");
  if (state.time.rest.status === "in_progress") return rejection(state, tool, "rest_in_progress", "Finish or interrupt the current rest before travelling.");
  const profile = reviewedTravelProfile(command.routeId, command.pace);
  if (!profile) return rejection(state, tool, "route_unreviewed", "That route is not a reviewed travel profile.");
  const exit = state.worldContext?.exits.find((candidate) => candidate.id === command.destinationId);
  if (!exit) return rejection(state, tool, "invalid_destination", "Travel must target an exit established in the current world context.");
  const navigatorId = command.navigatorId ?? state.actorId;
  const watcherId = command.watcherId ?? state.actorId;
  if (navigatorId !== state.actorId || watcherId !== state.actorId) {
    return rejection(state, tool, "actor_not_available", "This single-PC slice can only assign the current actor as navigator and watch.");
  }
  const ration = supplyItem(state, "ration");
  const water = supplyItem(state, "water");
  if (!ration || !water) return rejection(state, tool, "supplies_shortage", "A one-day journey requires one ration and one water supply.");
  const derived = deriveCheck(state, "wis", state.character.skills.survival ? "survival" : null, null, tool);
  if ("accepted" in derived) return derived;
  const navigationRoll = randomInt(1, 21);
  const navigationTotal = navigationRoll + derived.modifier;
  const navigationSuccess = navigationTotal >= profile.navigationDc;
  const randomEventRoll = randomInt(1, 101);
  const randomThreshold = command.pace === "fast" ? 35 : 25;
  const triggered = randomEventRoll <= randomThreshold;
  const selectionRoll = triggered ? randomInt(1, 4) : undefined;
  const selectedEntryId = triggered
    ? (["roadside-rain", "roadside-cache", "roadside-patrol", "roadside-sign"][Math.max(0, (selectionRoll ?? 1) - 1)] ?? "roadside-rain")
    : undefined;
  const contextHash = createHash("sha256")
    .update(JSON.stringify({ routeId: command.routeId, destinationId: command.destinationId, pace: command.pace, weather: state.time.survival.weather, totalMinutes: state.time.gameTime.totalMinutes }))
    .digest("hex");
  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const beforeQuests = state.quests;
  const beforeEffects = state.effects;
  const beforeEvents = state.time.scheduledEvents;
  const beforeWorldClocks = state.time.worldClocks;
  const beforeSocial = normalizeSocialState(state.social);
  consumeInventoryProperty(next, "ration", 1, changes);
  consumeInventoryProperty(next, "water", 1, changes);
  const beforeSurvival = state.time.survival;
  if (profile.forcedMarch || !navigationSuccess) {
    next.time.survival.exhaustionLevel += 1;
    next.time.survival.forcedMarches += profile.forcedMarch ? 1 : 0;
    next.time.survival.exposure += navigationSuccess ? 0 : 1;
  }
  if (selectedEntryId === "roadside-rain") next.time.survival.weather = "rain";
  if (selectedEntryId === "roadside-cache") next.time.survival.exposure = Math.max(0, next.time.survival.exposure - 1);
  const advance = advanceGameTime(next, profile.elapsedMinutes, navigationSuccess ? "travel-arrival" : "travel-navigation-failure", clientCommandId);
  const npcAgency = applyNpcTimeBoundary(next, context, clientCommandId);
  const randomEvent: EngineRandomEventResolution = {
    id: randomUUID(),
    trigger: "travel-watch",
    triggerId: clientCommandId,
    tableId: "travel-watch-v1",
    tableVersion: "1",
    contextHash,
    occurrenceRoll: randomEventRoll,
    occurrenceThreshold: randomThreshold,
    triggered,
    ...(selectionRoll === undefined ? {} : { selectionRoll }),
    ...(selectedEntryId === undefined ? {} : { selectedEntryId }),
    reusedEntityIds: [],
    instantiatedEntityIds: [],
    createdFactIds: [],
    createdClockIds: [],
    createdSituationIds: [],
    createdEncounterIds: [],
    sourceEventId: randomUUID(),
    campaignVersion: state.version + 1,
  };
  next.time.randomEvents = [...next.time.randomEvents, randomEvent].slice(-100);
  const travel: EngineTravelPlan = {
    id: randomUUID(),
    routeId: command.routeId,
    originRef: state.worldContext?.id ?? "world",
    destinationRef: command.destinationId,
    pace: command.pace,
    navigatorId,
    watcherId,
    distanceMiles: profile.distanceMiles,
    elapsedMinutes: profile.elapsedMinutes,
    startedAtMinutes: state.time.gameTime.totalMinutes,
    arrivalAtMinutes: advance.after.totalMinutes,
    status: navigationSuccess ? "arrived" : "failed",
    navigation: { roll: navigationRoll, modifier: derived.modifier, total: navigationTotal, dc: profile.navigationDc, success: navigationSuccess },
    supplies: { rations: 1, water: 1 },
    weather: next.time.survival.weather,
    randomEventId: randomEvent.id,
    forcedMarch: profile.forcedMarch || !navigationSuccess,
    provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version },
  };
  next.time.travel = travel;
  changes.push(
    { path: "/time/gameTime", before: advance.before, after: advance.after },
    ...advance.questStateChanges,
    { path: "/time/travel", before: state.time.travel, after: travel },
    { path: "/time/randomEvents", before: state.time.randomEvents, after: next.time.randomEvents },
    { path: "/time/survival", before: beforeSurvival, after: next.time.survival },
    ...(JSON.stringify(beforeQuests) !== JSON.stringify(next.quests) ? [{ path: "/quests", before: projectQuestsForActor(state, context.actorId), after: projectQuestsForActor(next, context.actorId) }] : []),
    ...(JSON.stringify(beforeEffects) !== JSON.stringify(next.effects) ? [{ path: "/effects", before: beforeEffects, after: next.effects }] : []),
    ...(JSON.stringify(beforeEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: beforeEvents, after: next.time.scheduledEvents }] : []),
    ...(JSON.stringify(beforeWorldClocks) !== JSON.stringify(next.time.worldClocks) ? [{ path: "/time/worldClocks", before: beforeWorldClocks, after: next.time.worldClocks }] : []),
    ...socialStateChanges(beforeSocial, ensureSocialState(next)).filter((change) => !(npcAgency?.stateChanges ?? []).some((agencyChange) => agencyChange.path === change.path)),
    ...(npcAgency?.stateChanges ?? []),
  );
  const message = navigationSuccess
    ? `You travel ${profile.distanceMiles} miles toward ${exit.label} and arrive after ${profile.elapsedMinutes} minutes.`
    : `Navigation fails on the road toward ${exit.label}; the party loses time and gains a bounded exhaustion consequence.`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      travel,
      randomEvent,
      npcAgency: npcAgency?.data ?? null,
      timeAdvance: { before: advance.before, after: advance.after, minutes: profile.elapsedMinutes, reason: navigationSuccess ? "travel-arrival" : "travel-navigation-failure", processedEventIds: advance.processedEventIds },
    },
    navigationSuccess ? "travel_arrived" : "travel_navigation_failed",
    [
      { kind: "navigation_d20", value: navigationRoll, sides: 20 },
      { kind: "travel_event_d100", value: randomEventRoll, sides: 100 },
      ...(selectionRoll === undefined ? [] : [{ kind: "travel_event_selection", value: selectionRoll, sides: 4 }]),
    ],
    [{ name: "navigation_modifier", value: derived.modifier }, { name: "navigation_dc", value: profile.navigationDc }, { name: "event_threshold", value: randomThreshold }],
    changes,
    [],
    undefined,
    {
      kind: "ability-check",
      actorId: context.actorId,
      ability: "wis",
      skill: derived.skill,
      tool: null,
      proficiency: derived.proficiency,
      expertise: derived.expertise,
      modifier: derived.modifier,
      modifierSources: derived.modifierSources,
      advantageSources: [],
      disadvantageSources: [],
      mode: "normal",
      informationPolicy: "public",
      formulaRevision: "checks-v1",
    },
  );
}

function resolveProject(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "project" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") return rejection(state, tool, "combat_active", "You cannot work on a project during an active encounter.");
  if (command.projectId !== "research-v1") return rejection(state, tool, "project_unreviewed", "That downtime project is not reviewed in this slice.");
  const existing = state.time.projects.find((project) => project.id === command.projectId);
  if (command.action === "start") {
    if (existing) return rejection(state, tool, "project_exists", "That project has already been started.");
    const next = cloneCampaign(state);
    const project: EngineProjectClock = {
      id: command.projectId,
      definitionId: "research-v1",
      title: "Research the road ahead",
      workRequiredMinutes: 8 * 60,
      workCompletedMinutes: 0,
      materialProperty: "project-material",
      materialQuantity: 1,
      status: "active",
      startedAtMinutes: state.time.gameTime.totalMinutes,
      completedAtMinutes: null,
      provenance: { sourceCommandId: clientCommandId, sourceVersion: state.version },
    };
    next.time.projects = [...next.time.projects, project];
    return commit(next, context, clientCommandId, command, tool, "The research project is now tracked by the campaign clock.", { project }, "project_started", [], [], [{ path: "/time/projects", before: state.time.projects, after: next.time.projects }]);
  }
  if (!existing || existing.status !== "active") return rejection(state, tool, "project_not_active", "That project is not active.");
  const material = supplyItem(state, existing.materialProperty);
  if (!material || material.quantity < existing.materialQuantity) return rejection(state, tool, "project_material_shortage", "The project lacks its reviewed material cost.");
  const next = cloneCampaign(state);
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const beforeSocial = normalizeSocialState(state.social);
  if (existing.workCompletedMinutes === 0) consumeInventoryProperty(next, existing.materialProperty, existing.materialQuantity, changes);
  const advance = advanceGameTime(next, existing.workRequiredMinutes - existing.workCompletedMinutes, "downtime-project", clientCommandId);
  const npcAgency = applyNpcTimeBoundary(next, context, clientCommandId);
  const project = next.time.projects.find((candidate) => candidate.id === existing.id);
  if (!project) return rejection(state, tool, "project_not_active", "That project is not active.");
  project.workCompletedMinutes = project.workRequiredMinutes;
  project.status = "completed";
  project.completedAtMinutes = advance.after.totalMinutes;
  project.provenance = { sourceCommandId: clientCommandId, sourceVersion: state.version };
  changes.push(
    { path: "/time/gameTime", before: advance.before, after: advance.after },
    ...advance.questStateChanges,
    { path: "/time/projects", before: state.time.projects, after: next.time.projects },
    ...socialStateChanges(beforeSocial, ensureSocialState(next)).filter((change) => !(npcAgency?.stateChanges ?? []).some((agencyChange) => agencyChange.path === change.path)),
    ...(npcAgency?.stateChanges ?? []),
  );
  return commit(next, context, clientCommandId, command, tool, "The research project completes and its progress is recorded exactly once.", { project, npcAgency: npcAgency?.data ?? null, timeAdvance: { before: advance.before, after: advance.after, minutes: advance.after.totalMinutes - advance.before.totalMinutes, reason: "downtime-project", processedEventIds: advance.processedEventIds } }, "project_completed", [], [], changes);
}

function resolveRest(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "rest" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") return rejection(state, tool, "combat_active", "You cannot rest during an active encounter.");
  if (hasRuntimeCondition(state, state.character.id, "dead")) return rejection(state, tool, "dead", "A dead character cannot rest.");
  const nowMinutes = state.time.gameTime.totalMinutes;
  const lastRest = state.time.rest.lastCompletedAtMinutes;
  if (
    lastRest !== null
    && state.time.rest.restType === "long"
    && command.restType === "long"
    && nowMinutes - lastRest < ONE_DAY_MINUTES
  ) {
    return rejection(state, tool, "rest_too_soon", "A long rest requires a full in-fiction day between completed long rests.");
  }
  if (lastRest !== null && command.restType === "short" && nowMinutes - lastRest < SHORT_REST_MINUTES) {
    return rejection(state, tool, "rest_too_soon", "A short rest requires elapsed in-fiction time before it can recover resources again.");
  }
  const next = cloneCampaign(state);
  const beforeTime = state.time;
  const beforeQuests = state.quests;
  const beforeEvents = state.time.scheduledEvents;
  const beforeSocial = normalizeSocialState(state.social);
  const beforeEffectsForTime = state.effects;
  const requiredMinutes = command.restType === "short" ? SHORT_REST_MINUTES : LONG_REST_MINUTES;
  next.time.rest = {
    status: "in_progress",
    restType: command.restType,
    startedAtMinutes: nowMinutes,
    completedAtMinutes: null,
    requiredMinutes,
    interruptionEventId: null,
    lastCompletedAtMinutes: state.time.rest.lastCompletedAtMinutes,
  };
  const advance = advanceGameTime(next, requiredMinutes, command.restType === "short" ? "short-rest" : "long-rest", clientCommandId);
  const npcAgency = applyNpcTimeBoundary(next, context, clientCommandId);
  const beforeHp = next.character.hp;
  const beforeHitDice = next.character.hitDiceRemaining;
  const beforeSlots = next.character.spellcasting ? { ...next.character.spellcasting.slots } : null;
  const beforeConcentration = next.character.spellcasting?.concentration ?? null;
  const beforeFeatureUses = { ...next.character.featureUses };
  const beforeEffects = next.effects;
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (advance.interrupted) {
    next.time.rest.completedAtMinutes = advance.after.totalMinutes;
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "The rest is interrupted before recovery completes; elapsed time is still recorded.",
      {
        restType: command.restType,
        interrupted: true,
        timeAdvance: { before: advance.before, after: advance.after, minutes: requiredMinutes, reason: command.restType === "short" ? "short-rest" : "long-rest", processedEventIds: advance.processedEventIds },
        npcAgency: npcAgency?.data ?? null,
      },
      "rest_interrupted",
      [],
      [],
      [
        { path: "/time/gameTime", before: beforeTime.gameTime, after: next.time.gameTime },
        ...advance.questStateChanges,
        { path: "/time/rest", before: beforeTime.rest, after: next.time.rest },
        ...(JSON.stringify(beforeQuests) !== JSON.stringify(next.quests) ? [{ path: "/quests", before: projectQuestsForActor(state, context.actorId), after: projectQuestsForActor(next, context.actorId) }] : []),
        ...(JSON.stringify(beforeEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: beforeEvents, after: next.time.scheduledEvents }] : []),
        ...(JSON.stringify(beforeEffectsForTime) !== JSON.stringify(next.effects) ? [{ path: "/effects", before: beforeEffectsForTime, after: next.effects }] : []),
        ...socialStateChanges(beforeSocial, ensureSocialState(next)).filter((change) => !(npcAgency?.stateChanges ?? []).some((agencyChange) => agencyChange.path === change.path)),
        ...(npcAgency?.stateChanges ?? []),
      ],
    );
  }
  let message = "You complete a long rest. Your wounds close and your resources recover.";
  let outcome = "long_rest";
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  if (command.restType === "short") {
    const pactRecovery = next.character.spellcasting?.slotRecovery === "short-or-long-rest"
      && Object.entries(next.character.spellcasting.slotMaximums)
        .some(([slotLevel, maximum]) => (next.character.spellcasting?.slots[slotLevel] ?? 0) < maximum);
    if (next.character.hitDiceRemaining <= 0 && !pactRecovery) {
      return rejection(state, tool, "no_short_rest_resources", "You have no hit dice or short-rest spell slots to recover.");
    }
    if (next.character.hitDiceRemaining > 0) {
      const die = randomInt(1, next.character.hitDie + 1);
      const healing = Math.max(0, die + open5eAbilityModifier(next.character.abilities.con));
      applyHealing(next, healing, "short-rest", changes);
      next.character.hitDiceRemaining -= 1;
      rolls.push({ kind: "hit_die", value: die, sides: next.character.hitDie });
    }
    if (next.character.spellcasting?.slotRecovery === "short-or-long-rest") {
      next.character.spellcasting.slots = { ...next.character.spellcasting.slotMaximums };
    }
    message = "You complete a short rest and recover " + (next.character.hp - beforeHp) + " HP"
      + (pactRecovery ? "; your pact spell slots also return." : ".");
    outcome = "short_rest";
  } else {
    applyHealing(next, next.character.maxHp - next.character.hp, "long-rest", changes);
    next.character.hitDiceRemaining = Math.min(next.character.level, next.character.hitDiceRemaining + Math.max(1, Math.floor(next.character.level / 2)));
    next.character.deathSaveSuccesses = 0;
    next.character.deathSaveFailures = 0;
    if (next.character.spellcasting) {
      next.character.spellcasting.slots = { ...next.character.spellcasting.slotMaximums };
      next.character.spellcasting.concentration = null;
    }
  }
  next.effects = clearEffectsByPolicy(next.effects, command.restType === "short" ? "short-rest" : "long-rest");
  if (next.character.className.trim().toLocaleLowerCase("en-US") === "fighter") next.character.featureUses.secondWind = 1;
  next.time.rest.status = "completed";
  next.time.rest.completedAtMinutes = advance.after.totalMinutes;
  next.time.rest.lastCompletedAtMinutes = advance.after.totalMinutes;
  syncConditionProjections(next);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { restType: command.restType, hpRestored: next.character.hp - beforeHp, hitDiceRemaining: next.character.hitDiceRemaining, character: characterData(next.character), npcAgency: npcAgency?.data ?? null, timeAdvance: { before: advance.before, after: advance.after, minutes: requiredMinutes, reason: command.restType === "short" ? "short-rest" : "long-rest", processedEventIds: advance.processedEventIds } },
    outcome,
    rolls,
    [],
    [
      ...changes,
      { path: "/character/hitDiceRemaining", before: beforeHitDice, after: next.character.hitDiceRemaining },
      ...(beforeSlots ? [{ path: "/character/spellcasting/slots", before: beforeSlots, after: next.character.spellcasting?.slots ?? null }] : []),
      ...(beforeConcentration ? [{ path: "/character/spellcasting/concentration", before: beforeConcentration, after: next.character.spellcasting?.concentration ?? null }] : []),
      ...(JSON.stringify(beforeFeatureUses) !== JSON.stringify(next.character.featureUses)
        ? [{ path: "/character/featureUses", before: beforeFeatureUses, after: next.character.featureUses }]
        : []),
      ...(JSON.stringify(beforeEffects) !== JSON.stringify(next.effects)
        ? [{ path: "/effects", before: beforeEffects, after: next.effects }]
        : []),
      ...(JSON.stringify(beforeEffectsForTime) !== JSON.stringify(next.effects) && JSON.stringify(beforeEffects) === JSON.stringify(next.effects)
        ? [{ path: "/effects", before: beforeEffectsForTime, after: next.effects }]
        : []),
      { path: "/time/gameTime", before: beforeTime.gameTime, after: next.time.gameTime },
      ...advance.questStateChanges,
      { path: "/time/rest", before: beforeTime.rest, after: next.time.rest },
      ...(JSON.stringify(beforeQuests) !== JSON.stringify(next.quests) ? [{ path: "/quests", before: projectQuestsForActor(state, context.actorId), after: projectQuestsForActor(next, context.actorId) }] : []),
      ...(JSON.stringify(beforeEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: beforeEvents, after: next.time.scheduledEvents }] : []),
      ...socialStateChanges(beforeSocial, ensureSocialState(next)).filter((change) => !(npcAgency?.stateChanges ?? []).some((agencyChange) => agencyChange.path === change.path)),
      ...(npcAgency?.stateChanges ?? []),
    ]
  );
}

function resolveUseItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "use_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (!isActorOwnedItem(item, state.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
  const itemView = materializeInventoryItem(item);
  if (!itemExecutionAllowed(itemView, "use")) {
    return rejection(state, tool, "content_tier_insufficient", "That item's supplied or catalog mechanics are not reviewed for use execution.");
  }
  if (itemView.effectKey === REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY) {
    return resolveReviewedSpellScroll(state, context, clientCommandId, command, tool, item, itemView);
  }
  if (itemView.effectKey === "lantern-ward-v1") {
    if (!item.equipped) return rejection(state, tool, "item_not_equipped", "Equip the Lantern Ward before spending its charge.");
    const currentCharges = item.charges?.current ?? 1;
    const maximumCharges = item.charges?.max ?? 1;
    if (currentCharges <= 0) return rejection(state, tool, "charges_depleted", "That magic item's charges are depleted.");
    const next = cloneCampaign(state);
    next.character.inventory = next.character.inventory.map((candidate) => ({
      ...candidate,
      ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
    }));
    const target = next.character.inventory.find((candidate) => candidate.id === item.id);
    if (!target) return rejection(state, tool, "item_not_found", "That item is no longer in your inventory.");
    const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
    target.charges = { current: currentCharges - 1, max: maximumCharges };
    if (target.charges.current === 0) removeRuntimeSource(next, `item:${item.id}`, changes);
    next.character.ac = deriveArmorClass(next.character, next.effects);
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `You spend a Lantern Ward charge; ${target.charges.current} charge${target.charges.current === 1 ? "" : "s"} remains.`,
      { item: materializeInventoryItem(target), character: characterData(next.character) },
      "item_charge_spent",
      [],
      [],
      [
        { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
        { path: "/character/ac", before: state.character.ac, after: next.character.ac },
        ...changes,
      ],
    );
  }
  if (itemView.kind !== "consumable" || !itemView.healing) return rejection(state, tool, "not_consumable", "That item cannot be used as a consumable.");
  if (state.character.hp >= state.character.maxHp) return rejection(state, tool, "already_full_health", "You are already at full health.");

  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => ({
    ...candidate,
    ownerRef: candidate.ownerRef ?? { kind: "actor", id: next.character.id },
  }));
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const healing = applyHealing(next, itemView.healing, "consumable", changes);
  const consumed = next.character.inventory.find((candidate) => candidate.id === item.id);
  if (!consumed) return rejection(state, tool, "item_not_found", "That item is no longer in your inventory.");
  consumed.quantity -= 1;
  if (consumed.quantity <= 0) next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== item.id);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You drink the " + itemView.name + " and recover " + healing.healed + " HP.",
    { itemId: item.id, healing: healing.healed, character: characterData(next.character) },
    "item_used",
    [],
    [],
    [
      ...changes,
      { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
    ]
  );
}

function resolveReviewedSpellScroll(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "use_item" }>,
  tool: EngineToolName | "declare" | "listen",
  item: EngineInventoryItem,
  itemView: EngineInventoryItemView,
): EngineResolution {
  const definition = itemView.spellScroll;
  if (
    !definition
    || itemView.kind !== "consumable"
    || item.quantity <= 0
    || definition.policyRevision !== "spell-scroll-v1"
    || definition.activationPolicy !== "class-list-v1"
    || definition.sourceItemContentKey !== REVIEWED_FIRST_LEVEL_SCROLL_CONTENT_KEY
    || definition.spellContentKey !== REVIEWED_CURE_WOUNDS_CONTENT_KEY
  ) {
    return rejection(state, tool, "content_tier_insufficient", "That scroll does not have the reviewed Cure Wounds execution record.");
  }

  const campaignPackHash = state.rulesVersion.startsWith("open5e-pack@")
    ? state.rulesVersion.slice("open5e-pack@".length)
    : OPEN5E_RULES_PACK_HASH;
  if (definition.packHash !== campaignPackHash) {
    return rejection(state, tool, "content_pack_mismatch", "That scroll is pinned to a different content pack and requires an explicit repin.");
  }
  const sourceItem = getOpen5eEquipment(definition.sourceItemContentKey, definition.packHash);
  const spell = getOpen5eSpell(definition.spellContentKey, definition.packHash);
  if (!sourceItem || !spell) {
    return rejection(state, tool, "content_not_installed", "That scroll's reviewed item or spell content is not installed at its pinned pack hash.");
  }
  const effect = spell.effect;
  if (
    sourceItem.contentKey !== REVIEWED_FIRST_LEVEL_SCROLL_CONTENT_KEY
    || sourceItem.categoryKey !== "scroll"
    || spell.contentKey !== REVIEWED_CURE_WOUNDS_CONTENT_KEY
    || spell.definition.level !== 1
    || spell.definition.castingTime !== "action"
    || spell.definition.targetType !== "creature"
    || spell.definition.targetCount !== 1
    || spell.definition.range.text.trim().toLocaleLowerCase("en-US") !== "touch"
    || !effect
    || effect.effectKind !== "healing"
    || effect.targetPolicy !== "single-creature"
  ) {
    return rejection(state, tool, "content_tier_insufficient", "That scroll's pinned content no longer matches the reviewed first-level Cure Wounds policy.");
  }

  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className, definition.packHash);
  const classList = getOpen5eSpellList(state.character.className, definition.packHash);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  if (!classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!classList.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList.className} spell list.`);
  }
  if (spell.definition.level > highestAvailableSlotLevel(spellcasting.slotMaximums)) {
    return rejection(state, tool, "spell_level_unavailable", `${spell.definition.name} is above the highest spell level this character can normally cast.`);
  }
  if (state.combat.status !== "active") {
    return rejection(state, tool, "no_active_combat", "Reviewed spell-scroll effects currently resolve in an active encounter.");
  }
  if (hasRuntimeCondition(state, state.character.id, "unconscious")) {
    return rejection(state, tool, "unconscious", "You cannot read a spell scroll while unconscious.");
  }
  if (state.combat.activeActorId !== state.actorId) {
    return rejection(state, tool, "off_turn", "It is not your turn.");
  }
  if (state.combat.turnBudget.action.spent) {
    return rejection(state, tool, "action_already_used", "Your action is already spent this turn.");
  }

  return resolveHealingSpell(
    state,
    context,
    clientCommandId,
    { kind: "cast_spell", spellKey: spell.contentKey, targetIds: [] },
    tool,
    spell,
    spellcasting,
    [],
    { command, item, itemView, definition },
  );
}

function syncRuntimeItemInventoryState(
  next: LanternCampaignState,
  stateChanges: Array<{ path: string; before: unknown; after: unknown }>,
): void {
  const linkedInventory = new Map<string, EngineInventoryItem>();
  const previouslyLinked = new Set<string>();
  const inventoryChange = stateChanges.find((change) => change.path === "/character/inventory");
  const previousInventory = Array.isArray(inventoryChange?.before)
    ? inventoryChange.before as EngineInventoryItem[]
    : next.character.inventory;
  for (const item of previousInventory) {
    if (item.runtimeContentInstanceId) previouslyLinked.add(item.runtimeContentInstanceId);
  }
  for (const item of next.character.inventory) {
    if (item.runtimeContentInstanceId && !linkedInventory.has(item.runtimeContentInstanceId)) {
      linkedInventory.set(item.runtimeContentInstanceId, item);
    }
  }
  next.runtimeContent.instances = next.runtimeContent.instances.map((instance) => {
    if (instance.kind !== "item") return instance;
    const inventoryItem = linkedInventory.get(instance.id);
    if (!inventoryItem && !previouslyLinked.has(instance.id)) return instance;
    const afterState = inventoryItem
      ? {
          ...instance.state,
          status: inventoryItem.quantity > 0 ? "available" as const : "known" as const,
          quantity: inventoryItem.quantity,
        }
      : {
          ...instance.state,
          status: "known" as const,
          quantity: 0,
        };
    if (JSON.stringify(instance.state) === JSON.stringify(afterState)) return instance;
    stateChanges.push({
      path: `/runtimeContent/instances/${escapeJsonPointerSegment(instance.id)}/state`,
      before: instance.state,
      after: afterState,
    });
    return { ...instance, state: afterState };
  });
}

function commit(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EnginePersistedCommand,
  tool: EngineResolutionTool,
  message: string,
  data: unknown,
  outcome: string,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  stateChanges: Array<{ path: string; before: unknown; after: unknown }>,
  evidenceContentKeys: string[] = [],
  adjudication?: EngineAdjudicationDecision,
  check?: EngineCheckEvidence
): EngineResolution {
  const next = cloneCampaign(state);
  syncRuntimeItemInventoryState(next, stateChanges);
  const createdAt = new Date().toISOString();
  next.version = state.version + 1;
  next.updatedAt = createdAt;
  next.log = [...state.log, makeMessage(messageKindForOutcome(outcome), message)].slice(-40);
  const persistedCommand = redactExperienceCommand(command);
  const event: EngineEvent = {
    id: randomUUID(),
    kind: "command",
    tool,
    command: persistedCommand,
    ...(adjudication ? { adjudication } : {}),
    ...(check ? { check } : {}),
    accountId: context.accountId,
    campaignId: context.campaignId,
    actorId: context.actorId,
    requestId: context.requestId,
    clientCommandId,
    previousVersion: state.version,
    version: next.version,
    rulesVersion: state.rulesVersion,
    contentKeys: collectContentKeys([command, stateChanges, { contentKeys: evidenceContentKeys }]),
    rolls,
    modifiers,
    outcome,
    stateChanges,
    createdAt,
  };
  return {
    state: next,
    tool,
    readOnly: false,
    accepted: true,
    code: null,
    message,
    data,
    event,
    narration: rulesNarration(message),
  };
}

function collectContentKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate === null || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (
        typeof child === "string"
        && (child.startsWith("open5e:") || child.startsWith("runtime:"))
        && (key === "contentKey" || key.endsWith("Key"))
      ) {
        keys.add(child);
      } else if (Array.isArray(child) && key.endsWith("Keys")) {
        for (const contentKey of child) {
          if (typeof contentKey === "string" && (contentKey.startsWith("open5e:") || contentKey.startsWith("runtime:"))) keys.add(contentKey);
        }
      } else visit(child);
    }
  };
  visit(value);
  return [...keys].sort();
}

function readOnlyResolution(
  state: LanternCampaignState,
  tool: EngineResolutionTool,
  message: string,
  data: unknown
): EngineResolution {
  return {
    state,
    tool,
    readOnly: true,
    accepted: true,
    code: null,
    message,
    data,
    event: null,
    narration: rulesNarration(message),
  };
}

function rejection(
  state: LanternCampaignState,
  tool: EngineResolutionTool,
  code: string,
  message: string,
  extraData?: Record<string, unknown>
): EngineResolution {
  return {
    state,
    tool,
    readOnly: false,
    accepted: false,
    code,
    message,
    data: { code, message, campaignVersion: state.version, ...extraData },
    event: null,
    narration: rulesNarration(message),
  };
}

type CharacterCreateCommand = Extract<EngineCommand, { kind: "character_create" }>;

function rollAbilityScore(): { dice: [number, number, number, number]; dropped: number; total: number } {
  const dice: [number, number, number, number] = [
    randomInt(1, 7),
    randomInt(1, 7),
    randomInt(1, 7),
    randomInt(1, 7),
  ];
  const ordered = [...dice].sort((left, right) => left - right);
  return {
    dice,
    dropped: ordered[0],
    total: ordered[1] + ordered[2] + ordered[3],
  };
}

function resolveCharacterRollStats(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "character_roll_stats" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.phase !== "character_creation" || state.character.created) {
    return rejection(state, tool, "character_locked", "Ability scores can only be rolled before the character enters the world.");
  }
  if (state.characterCreation.abilityScoreDraft) {
    return rejection(state, tool, "ability_scores_already_rolled", "Your ability scores are already rolled. Assign those six values, or start a new campaign to roll again.");
  }

  const rolls = Array.from({ length: 6 }, rollAbilityScore);
  const draft = {
    id: randomUUID(),
    method: command.method,
    scores: rolls.map((roll) => roll.total),
    rolls,
    createdAt: new Date().toISOString(),
  } as const;
  const next = cloneCampaign(state);
  next.characterCreation = { abilityScoreDraft: draft };
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The engine rolled six ability scores using 4d6, dropping the lowest die. Assign each result to an ability before entering the world.",
    { abilityScoreDraft: draft },
    "ability_scores_rolled",
    rolls.flatMap((roll) => roll.dice.map((value) => ({ kind: "ability_score_die", value, sides: 6 }))),
    [],
    [{ path: "/characterCreation/abilityScoreDraft", before: state.characterCreation.abilityScoreDraft, after: draft }]
  );
}

class CharacterCreationError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CharacterCreationError";
  }
}

function createCanonicalCharacter(
  command: CharacterCreateCommand,
  id: string,
  contentPolicy: EngineContentPolicy,
  characterCreation: EngineCharacterCreationState
): EngineCharacter {
  if (!command.speciesKey || !command.classKey) {
    throw new CharacterCreationError(
      "character_options_required",
      "Canonical character creation requires exact speciesKey and classKey values from character_options."
    );
  }

  const species = requireOpen5eSpecies(command.speciesKey);
  const characterClass = requireOpen5eClass(command.classKey);
  const options = open5eCharacterOptions({
    gamesystem: contentPolicy.gamesystem,
    allowedDocuments: contentPolicy.allowedDocumentKeys,
    allowedLicenses: contentPolicy.allowedLicenseKeys,
  });
  const speciesOption = options.species.find((option) => option.contentKey === species.contentKey);
  if (!speciesOption) {
    throw new CharacterCreationError(
      "content_option_forbidden",
      `${species.definition.name} is not enabled by this campaign's content policy.`
    );
  }
  if (!speciesOption.selectable) {
    throw new CharacterCreationError(
      "species_not_selectable",
      speciesOption.requiresSubspecies
        ? `${species.definition.name} requires a specific subrace selection.`
        : `${species.definition.name} is not selectable for a level-one character.`
    );
  }
  const classOption = options.classes.find((option) => option.contentKey === characterClass.contentKey);
  if (!classOption) {
    throw new CharacterCreationError(
      "content_option_forbidden",
      `${characterClass.definition.name} is not enabled by this campaign's content policy.`
    );
  }
  if (characterClass.definition.isSubclass || !characterClass.profile) {
    throw new CharacterCreationError(
      "class_not_selectable",
      `${characterClass.definition.name} is not a selectable level-one base class.`
    );
  }

  const backgroundKey = command.backgroundKey ?? open5eCharacterContentKey("background", "srd_acolyte");
  const alignmentKey = command.alignmentKey ?? open5eCharacterContentKey("alignment", "neutral");
  const background = requireOpen5eBackground(backgroundKey);
  const alignment = requireOpen5eAlignment(alignmentKey);
  const backgroundOption = options.backgrounds.find((option) => option.contentKey === background.contentKey);
  if (!backgroundOption) {
    throw new CharacterCreationError(
      "content_option_forbidden",
      `${background.definition.name} is not enabled by this campaign's content policy.`
    );
  }
  if (!backgroundOption.selectable) {
    throw new CharacterCreationError(
      "background_not_selectable",
      `${background.definition.name} is source-backed but not selectable for a player character.`
    );
  }
  const packHash = species.packHash;
  if (characterClass.packHash !== packHash || background.packHash !== packHash || options.packHash !== packHash) {
    throw new CharacterCreationError("character_pack_mismatch", "Character options must all come from one installed rules pack.");
  }

  const classEngineKey = characterClass.definition.name.trim().toLocaleLowerCase("en-US");
  const baseDefaults = OPEN5E_DEFAULT_ABILITY_SCORES[classEngineKey];
  if (!baseDefaults) {
    throw new CharacterCreationError(
      "class_defaults_missing",
      `No reviewed level-one ability-score policy is installed for ${characterClass.definition.name}.`
    );
  }
  const abilityScoreMethod = command.abilityScoreMethod ?? (command.abilityScores ? "class_default" : "class_default");
  const baseAbilities = command.abilityScores ? { ...command.abilityScores } : { ...baseDefaults };
  for (const ability of ENGINE_ABILITIES) {
    const score = baseAbilities[ability];
    if (!Number.isInteger(score) || score < 3 || score > 20) {
      throw new CharacterCreationError("invalid_ability_scores", "Ability scores must provide all six integer values from 3 through 20.");
    }
  }
  if (abilityScoreMethod === "standard_array" && !sameSortedScores(Object.values(baseAbilities), [8, 10, 12, 13, 14, 15])) {
    throw new CharacterCreationError("invalid_ability_scores", "Standard array scores must be 15, 14, 13, 12, 10, and 8, assigned once each.");
  }
  if (abilityScoreMethod === "rolled") {
    const draft = characterCreation.abilityScoreDraft;
    if (!command.abilityScoreDraftId || !draft || draft.id !== command.abilityScoreDraftId) {
      throw new CharacterCreationError("ability_score_draft_required", "Roll ability scores through the engine before assigning them.");
    }
    if (!sameSortedScores(Object.values(baseAbilities), [...draft.scores].sort((left, right) => left - right))) {
      throw new CharacterCreationError("invalid_ability_scores", "Assigned ability scores must use exactly the six values rolled by the engine.");
    }
  }

  const abilityChoices = resolveAbilityBonusChoices(
    command.abilityBonusChoices,
    species.profile.abilityChoice,
    baseAbilities
  );
  const abilities = Object.fromEntries(
    ENGINE_ABILITIES.map((ability) => [
      ability,
      baseAbilities[ability]
        + species.profile.abilityBonuses[ability]
        + abilityChoices.filter((selected) => selected === ability).length * (species.profile.abilityChoice?.bonus ?? 0),
    ])
  ) as Record<EngineAbility, number>;
  if (ENGINE_ABILITIES.some((ability) => abilities[ability] > 20)) {
    throw new CharacterCreationError(
      "ability_score_cap_exceeded",
      "The selected base scores and species bonuses exceed the level-one ability-score maximum of 20."
    );
  }

  const backgroundSkillKeys = new Set(background.profile.skillProficiencies.map((skill) => skill.contentKey));
  const classSkillOptions = characterClass.profile.skillChoice.options;
  const backgroundSkillOptions = background.profile.skillChoice?.options ?? [];
  const allowedSkillKeys = new Set([
    ...classSkillOptions.map((reference) => reference.contentKey),
    ...backgroundSkillOptions.map((reference) => reference.contentKey),
  ]);
  const skillChoiceCount = characterClass.profile.skillChoice.count + (background.profile.skillChoice?.count ?? 0);
  const selectedSkillKeys = command.skillKeys
    ? [...command.skillKeys]
    : [
        ...classSkillOptions
        .map((reference) => reference.contentKey)
        .filter((contentKey) => !backgroundSkillKeys.has(contentKey))
        .slice(0, characterClass.profile.skillChoice.count),
        ...backgroundSkillOptions
          .map((reference) => reference.contentKey)
          .filter((contentKey) => !backgroundSkillKeys.has(contentKey))
          .slice(0, background.profile.skillChoice?.count ?? 0),
      ];
  assertExactUniqueCount(
    selectedSkillKeys,
    skillChoiceCount,
    "skill",
    "invalid_skill_choices"
  );
  if (selectedSkillKeys.some((skillKey) => !allowedSkillKeys.has(skillKey))) {
    throw new CharacterCreationError("invalid_skill_choices", "Every selected skill must be allowed by the class or background.");
  }
  if (selectedSkillKeys.some((skillKey) => backgroundSkillKeys.has(skillKey))) {
    throw new CharacterCreationError("duplicate_skill_choice", "Skill choices cannot duplicate a fixed background proficiency.");
  }
  if (!canPartitionSkillChoices(
    selectedSkillKeys,
    new Set(classSkillOptions.map((reference) => reference.contentKey)),
    new Set(backgroundSkillOptions.map((reference) => reference.contentKey)),
    characterClass.profile.skillChoice.count,
    background.profile.skillChoice?.count ?? 0
  )) {
    throw new CharacterCreationError("invalid_skill_choices", "The selected skills cannot satisfy both the class and background choices.");
  }
  const skillReferences = [
    ...selectedSkillKeys.map((contentKey) => requireOpen5eSkill(contentKey)),
    ...background.profile.skillProficiencies.map((reference) => requireOpen5eSkill(reference.contentKey)),
  ];
  const proficientSkillKeys = [...new Set(skillReferences.map((skill) => skill.engineKey))];

  const fixedLanguageKeys = [
    ...species.profile.languages.map((language) => language.contentKey),
    ...background.profile.fixedLanguages.map((language) => language.contentKey),
  ];
  const languageChoiceCount = species.profile.languageChoiceCount + background.profile.languageChoiceCount;
  const selectedLanguages = command.languageKeys
    ? command.languageKeys.map((contentKey) => requireOpen5eLanguage(contentKey))
    : defaultOpen5eLanguages(fixedLanguageKeys, languageChoiceCount).slice(fixedLanguageKeys.length);
  assertExactUniqueCount(
    selectedLanguages.map((language) => language.contentKey),
    languageChoiceCount,
    "language",
    "invalid_language_choices"
  );
  const fixedLanguageKeySet = new Set(fixedLanguageKeys);
  for (const language of selectedLanguages) {
    if (language.isSecret) {
      throw new CharacterCreationError("invalid_language_choices", `${language.name} is a class feature, not a general language choice.`);
    }
    if (fixedLanguageKeySet.has(language.contentKey)) {
      throw new CharacterCreationError("duplicate_language_choice", `${language.name} is already granted by the selected species or background.`);
    }
  }
  const languages = [
    ...species.profile.languages.map((reference) => requireOpen5eLanguage(reference.contentKey)),
    ...background.profile.fixedLanguages.map((reference) => requireOpen5eLanguage(reference.contentKey)),
    ...selectedLanguages,
  ];

  const classToolChoiceCount = characterClass.profile.toolChoice?.count ?? 0;
  const backgroundToolChoiceCount = background.profile.toolChoice?.count ?? 0;
  const toolChoiceCount = classToolChoiceCount + backgroundToolChoiceCount;
  const backgroundToolOptions = open5eToolChoiceOptions(background.profile.toolChoice);
  const defaultBackgroundTools = backgroundToolOptions.slice(0, backgroundToolChoiceCount);
  const selectedTools = command.toolProficiencies
    ? [...command.toolProficiencies]
    : [
        ...(OPEN5E_DEFAULT_TOOL_CHOICES[characterClass.sourceKey] ?? []),
        ...defaultBackgroundTools,
      ];
  assertExactUniqueCount(selectedTools, toolChoiceCount, "tool proficiency", "invalid_tool_choices");
  const fixedTools = [
    ...characterClass.profile.proficiencies.tools,
    ...background.profile.toolProficiencies,
  ];
  if (selectedTools.some((toolName) => fixedTools.some((fixed) => fixed.toLocaleLowerCase("en-US") === toolName.toLocaleLowerCase("en-US")))) {
    throw new CharacterCreationError("duplicate_tool_choice", "A chosen tool proficiency cannot duplicate a fixed class or background proficiency.");
  }
  const explicitBackgroundToolOptions = background.profile.toolChoice?.options ?? [];
  if (explicitBackgroundToolOptions.length > 0) {
    const normalizedOptions = new Set(explicitBackgroundToolOptions.map((toolName) => toolName.toLocaleLowerCase("en-US")));
    const matchingBackgroundTools = selectedTools.filter((toolName) => normalizedOptions.has(toolName.toLocaleLowerCase("en-US")));
    if (matchingBackgroundTools.length !== backgroundToolChoiceCount) {
      throw new CharacterCreationError("invalid_tool_choices", "Every selected background tool must come from the allowed background options.");
    }
  }

  const classFeatures = characterClass.profile.levelOneFeatures.map((feature) => ({
    name: feature.name,
    reference: {
      contentKey: characterClass.contentKey,
      packHash,
      featureSourceKey: feature.sourceKey,
    },
  }));
  const speciesFeatures = species.profile.featureNames.map((name) => ({
    name,
    reference: {
      contentKey: species.contentKey,
      packHash,
      featureSourceKey: `${species.sourceKey}/${slugifyFeatureName(name)}`,
    },
  }));
  const backgroundFeatures = background.definition.benefits
    .filter((benefit) => benefit.benefitType === "feature")
    .map((benefit) => ({
      name: benefit.name,
      reference: {
        contentKey: background.contentKey,
        packHash,
        featureSourceKey: `${background.sourceKey}/${slugifyFeatureName(benefit.name)}`,
      },
    }));
  const features = [...classFeatures, ...speciesFeatures, ...backgroundFeatures];
  const level = 1;
  const maxHp = Math.max(1, characterClass.profile.hitDie + open5eAbilityModifier(abilities.con));
  const inventory = createOpen5eStarterInventory(characterClass.sourceKey, background);
  const character: EngineCharacter = {
    id,
    created: true,
    name: command.name,
    species: species.definition.name,
    className: characterClass.definition.name,
    speciesRef: { contentKey: species.contentKey, packHash },
    classRef: { contentKey: characterClass.contentKey, packHash },
    backgroundRef: { contentKey: background.contentKey, packHash },
    alignmentRef: { contentKey: alignment.contentKey, packHash },
    skillRefs: skillReferences.map((skill) => ({ contentKey: skill.contentKey, packHash })),
    languageRefs: languages.map((language) => ({ contentKey: language.contentKey, packHash })),
    featureRefs: features.map((feature) => feature.reference),
    featRefs: [],
    background: background.definition.name,
    alignment: alignment.name,
    description: "",
    details: emptyCharacterDetails(),
    level,
    abilities,
    abilityModifiers: Object.fromEntries(
      ENGINE_ABILITIES.map((ability) => [ability, open5eAbilityModifier(abilities[ability])])
    ) as Record<EngineAbility, number>,
    proficiencyBonus: open5eProficiencyBonus(level),
    savingThrows: buildSavingThrows(abilities, characterClass.profile.savingThrows, level),
    skills: buildSkillSheet(abilities, proficientSkillKeys, level),
    size: species.profile.size,
    speed: species.profile.speedFeet,
    hitDie: characterClass.profile.hitDie,
    hitDiceRemaining: level,
    proficiencies: {
      armor: [...characterClass.profile.proficiencies.armor],
      weapons: [...characterClass.profile.proficiencies.weapons],
      tools: [...fixedTools, ...selectedTools],
      languages: languages.map((language) => language.name),
    },
    senses: defaultSenseCapabilities(),
    features: features.map((feature) => feature.name),
    featureUses: { secondWind: characterClass.sourceKey === "srd_fighter" ? 1 : 0 },
    spellcasting: buildSpellcastingState(characterClass.definition.name, level, abilities),
    hp: maxHp,
    maxHp,
    lifecycleState: "conscious",
    deathRecord: null,
    corpseId: null,
    ac: 10 + open5eAbilityModifier(abilities.dex),
    inventory,
    currency: { copper: background.profile.startingCurrencyCopper },
    gold: 0,
    xp: 0,
    conditions: [],
    conditionEffects: [],
    custody: null,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
  character.ac = deriveArmorClass(character);
  syncCurrencyProjection(character);
  return character;
}

function resolveAbilityBonusChoices(
  requested: EngineAbility[] | undefined,
  choice: { count: number; bonus: number; excluded: EngineAbility[] } | null,
  baseAbilities: Record<EngineAbility, number>
): EngineAbility[] {
  if (!choice) {
    if (requested?.length) {
      throw new CharacterCreationError("invalid_ability_bonus_choices", "The selected species has no floating ability bonuses.");
    }
    return [];
  }
  const selected = requested
    ? [...requested]
    : ENGINE_ABILITIES
        .filter((ability) => !choice.excluded.includes(ability))
        .sort((left, right) => baseAbilities[right] - baseAbilities[left] || ENGINE_ABILITIES.indexOf(left) - ENGINE_ABILITIES.indexOf(right))
        .slice(0, choice.count);
  assertExactUniqueCount(selected, choice.count, "ability bonus", "invalid_ability_bonus_choices");
  if (selected.some((ability) => choice.excluded.includes(ability))) {
    throw new CharacterCreationError("invalid_ability_bonus_choices", "A floating species bonus was assigned to an excluded ability.");
  }
  return selected;
}

function assertExactUniqueCount(
  values: string[],
  expected: number,
  label: string,
  code: string
): void {
  if (values.length !== expected) {
    throw new CharacterCreationError(code, `Choose exactly ${expected} ${label}${expected === 1 ? "" : "s"}.`);
  }
  const normalized = values.map((value) => value.trim().toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) {
    throw new CharacterCreationError(code, `${label[0]?.toLocaleUpperCase("en-US") ?? "C"}${label.slice(1)} choices must be unique.`);
  }
}

function sameSortedScores(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function canPartitionSkillChoices(
  selected: string[],
  classOptions: Set<string>,
  backgroundOptions: Set<string>,
  classCount: number,
  backgroundCount: number
): boolean {
  const visit = (index: number, classUsed: number, backgroundUsed: number): boolean => {
    if (index === selected.length) return classUsed === classCount && backgroundUsed === backgroundCount;
    const skillKey = selected[index];
    if (!skillKey) return false;
    return (classOptions.has(skillKey) && classUsed < classCount && visit(index + 1, classUsed + 1, backgroundUsed))
      || (backgroundOptions.has(skillKey) && backgroundUsed < backgroundCount && visit(index + 1, classUsed, backgroundUsed + 1));
  };
  return visit(0, 0, 0);
}

function slugifyFeatureName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultSenseCapabilities(): EngineSenseCapabilities {
  return { normalVision: true, darkvisionFeet: 0, blindsightFeet: 0, tremorsenseFeet: 0, hearing: true };
}

function createUnconfiguredCharacter(id: string): EngineCharacter {
  return createCharacter("", "", "fighter", id, false);
}

function createCharacter(
  name: string,
  species: string,
  className: string,
  id: string,
  created = true,
  background = "Folk Hero",
  alignment = "Unaligned",
  abilityScores?: Record<EngineAbility, number>
): EngineCharacter {
  const classPreset = OPEN5E_CLASS_PRESETS[className] ?? OPEN5E_CLASS_PRESETS.fighter;
  const speciesPreset = OPEN5E_SPECIES_PRESETS[species] ?? OPEN5E_SPECIES_PRESETS.human;
  const base = abilityScores ?? OPEN5E_DEFAULT_ABILITY_SCORES[className] ?? OPEN5E_DEFAULT_ABILITY_SCORES.fighter;
  const abilities = {
    str: base.str + (speciesPreset.abilityBonuses.str ?? 0),
    dex: base.dex + (speciesPreset.abilityBonuses.dex ?? 0),
    con: base.con + (speciesPreset.abilityBonuses.con ?? 0),
    int: base.int + (speciesPreset.abilityBonuses.int ?? 0),
    wis: base.wis + (speciesPreset.abilityBonuses.wis ?? 0),
    cha: base.cha + (speciesPreset.abilityBonuses.cha ?? 0),
  };
  const level = 1;
  const inventory: EngineInventoryItem[] = [
    createOpen5eInventoryItem("bedroll", open5eItemContentKey("srd_bedroll"), 1),
    createOpen5eInventoryItem("ration", open5eItemContentKey("srd_rations-1-day"), 2),
    ...classPreset.startingEquipment.map((item) => normalizeInventoryItem({ ...item })),
  ];
  const maxHp = Math.max(1, classPreset.hitDie + open5eAbilityModifier(abilities.con));
  const character: EngineCharacter = {
    id,
    created,
    name,
    species,
    className,
    speciesRef: null,
    classRef: null,
    backgroundRef: null,
    alignmentRef: null,
    skillRefs: [],
    languageRefs: [],
    featureRefs: [],
    featRefs: [],
    background,
    alignment,
    description: "",
    details: emptyCharacterDetails(),
    level,
    abilities,
    abilityModifiers: {
      str: open5eAbilityModifier(abilities.str),
      dex: open5eAbilityModifier(abilities.dex),
      con: open5eAbilityModifier(abilities.con),
      int: open5eAbilityModifier(abilities.int),
      wis: open5eAbilityModifier(abilities.wis),
      cha: open5eAbilityModifier(abilities.cha),
    },
    proficiencyBonus: open5eProficiencyBonus(level),
    savingThrows: buildSavingThrows(abilities, classPreset.savingThrows, level),
    skills: buildSkillSheet(abilities, defaultSkillProficiencies(className), level),
    size: speciesPreset.size,
    speed: speciesPreset.speed,
    hitDie: classPreset.hitDie,
    hitDiceRemaining: level,
    proficiencies: {
      armor: classPreset.armorProficiencies,
      weapons: classPreset.weaponProficiencies,
      tools: classPreset.toolProficiencies,
      languages: speciesPreset.languages,
    },
    senses: defaultSenseCapabilities(),
    features: [...classPreset.startingFeatures, ...speciesPreset.features],
    featureUses: { secondWind: className.toLocaleLowerCase("en-US") === "fighter" ? 1 : 0 },
    spellcasting: buildSpellcastingState(className, level, abilities),
    hp: maxHp,
    maxHp,
    lifecycleState: "conscious",
    deathRecord: null,
    corpseId: null,
    ac: 10 + open5eAbilityModifier(abilities.dex),
    inventory,
    currency: { copper: 500 },
    gold: 5,
    xp: 0,
    conditions: [],
    conditionEffects: [],
    custody: null,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
  character.ac = deriveArmorClass(character);
  return character;
}

function normalizeCharacter(character: EngineCharacter): EngineCharacter {
  const raw = character as EngineCharacter & {
    currency?: { copper?: number };
    lifecycleState?: unknown;
    deathRecord?: unknown;
    corpseId?: unknown;
  };
  const currencyCopper = raw.currency?.copper ?? Math.max(0, Math.trunc(raw.gold ?? 0) * 100);
  const hydrated = hydrateCharacter({
    ...raw,
    currency: { copper: Math.max(0, Math.trunc(currencyCopper)) },
    background: raw.background ?? "Folk Hero",
    alignment: raw.alignment ?? "Unaligned",
    speciesRef: normalizeContentReference(raw.speciesRef),
    classRef: normalizeContentReference(raw.classRef),
    backgroundRef: normalizeContentReference(raw.backgroundRef),
    alignmentRef: normalizeContentReference(raw.alignmentRef),
    skillRefs: normalizeContentReferences(raw.skillRefs),
    languageRefs: normalizeContentReferences(raw.languageRefs),
    featureRefs: normalizeFeatureReferences(raw.featureRefs),
    featRefs: normalizeContentReferences(raw.featRefs),
    description: raw.description ?? "",
    details: normalizeCharacterDetails(raw.details),
    inventory: Array.isArray(raw.inventory) ? raw.inventory.map(normalizeInventoryItem) : [],
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    conditionEffects: normalizeAppliedConditions(raw.conditionEffects),
    custody: normalizeCustodyStatus(raw.custody, raw.id),
    featureUses: normalizeFeatureUses(raw.featureUses, raw.className),
    senses: normalizeSenseCapabilities((raw as EngineCharacter & { senses?: unknown }).senses),
    deathSaveSuccesses: raw.deathSaveSuccesses ?? 0,
    deathSaveFailures: raw.deathSaveFailures ?? 0,
    lifecycleState: normalizeLifecycleStateValue(raw.lifecycleState, raw.hp, raw.conditions, raw.deathSaveSuccesses, raw.deathSaveFailures),
    deathRecord: normalizeDeathRecord(raw.deathRecord),
    corpseId: typeof raw.corpseId === "string" && raw.corpseId.trim() ? raw.corpseId.trim() : null,
    xp: raw.xp ?? 0,
  });
  syncCurrencyProjection(hydrated);
  return hydrated;
}

function transitionActorToDead(
  state: LanternCampaignState,
  sourceCommandId: string,
  source: "damage" | "death-save",
  changes: Array<{ path: string; before: unknown; after: unknown }>,
): EngineCorpse {
  const existing = state.corpses.find((corpse) => corpse.formerActorId === state.character.id && corpse.status === "lootable");
  if (existing) {
    const beforeInventory = state.character.inventory;
    const beforeLifecycle = state.character.lifecycleState;
    const beforeDeathRecord = state.character.deathRecord;
    const beforeCorpseId = state.character.corpseId;
    for (const item of beforeInventory) removeRuntimeSource(state, `item:${item.id}`, changes);
    state.character.inventory = [];
    if (beforeInventory.length > 0) changes.push({ path: "/character/inventory", before: beforeInventory, after: [] });
    state.character.lifecycleState = "dead";
    state.character.corpseId = existing.id;
    state.character.hp = 0;
    state.character.deathRecord = {
      source,
      sourceCommandId,
      sourceVersion: state.version,
      occurredAt: new Date().toISOString(),
    };
    if (beforeLifecycle !== "dead") changes.push({ path: "/character/lifecycleState", before: beforeLifecycle, after: "dead" });
    if (JSON.stringify(beforeDeathRecord) !== JSON.stringify(state.character.deathRecord)) {
      changes.push({ path: "/character/deathRecord", before: beforeDeathRecord, after: state.character.deathRecord });
    }
    if (beforeCorpseId !== existing.id) changes.push({ path: "/character/corpseId", before: beforeCorpseId, after: existing.id });
    removeRuntimeCondition(state, state.character.id, "unconscious", changes);
    removeRuntimeCondition(state, state.character.id, "stable", changes);
    applyConditionRuntimeEffect(state, "dead", "system:death", state.character.id, { kind: "persistent" }, "condition:dead", ["never"], sourceCommandId, changes);
    state.combat.status = "ended";
    state.combat.activeActorId = null;
    state.combat.pendingReaction = null;
    return existing;
  }
  const corpseId = randomUUID();
  const occurredAt = new Date().toISOString();
  const inventory = state.character.inventory.map((item) => ({
    ...item,
    ownerRef: { kind: "world" as const, id: corpseId },
    equipped: false,
    slot: undefined,
  }));
  for (const item of state.character.inventory) removeRuntimeSource(state, `item:${item.id}`, changes);
  const corpse: EngineCorpse = {
    id: corpseId,
    formerActorId: state.character.id,
    formerActorName: state.character.name || "The fallen character",
    locationRef: state.worldContext?.id ?? null,
    inventory,
    status: "lootable",
    provenance: { sourceCommandId, sourceVersion: state.version, occurredAt },
  };
  const beforeCorpses = state.corpses;
  state.corpses = [...state.corpses, corpse];
  changes.push({ path: "/corpses", before: beforeCorpses, after: state.corpses });
  const beforeInventory = state.character.inventory;
  state.character.inventory = [];
  changes.push({ path: "/character/inventory", before: beforeInventory, after: [] });
  const beforeLifecycle = state.character.lifecycleState;
  const beforeCorpseId = state.character.corpseId;
  const beforeDeathRecord = state.character.deathRecord;
  state.character.lifecycleState = "dead";
  state.character.deathRecord = {
    source,
    sourceCommandId,
    sourceVersion: state.version,
    occurredAt,
  };
  state.character.corpseId = corpseId;
  state.character.hp = 0;
  if (beforeLifecycle !== "dead") changes.push({ path: "/character/lifecycleState", before: beforeLifecycle, after: "dead" });
  if (JSON.stringify(beforeDeathRecord) !== JSON.stringify(state.character.deathRecord)) {
    changes.push({ path: "/character/deathRecord", before: beforeDeathRecord, after: state.character.deathRecord });
  }
  changes.push({ path: "/character/corpseId", before: beforeCorpseId, after: corpseId });
  removeRuntimeCondition(state, state.character.id, "unconscious", changes);
  removeRuntimeCondition(state, state.character.id, "stable", changes);
  applyConditionRuntimeEffect(state, "dead", "system:death", state.character.id, { kind: "persistent" }, "condition:dead", ["never"], sourceCommandId, changes);
  state.combat.status = "ended";
  state.combat.activeActorId = null;
  state.combat.pendingReaction = null;
  return corpse;
}

function normalizeLifecycleStateValue(
  value: unknown,
  hp: unknown,
  conditions: unknown,
  successes: unknown,
  failures: unknown,
): EngineLifecycleState {
  if (value === "conscious" || value === "dying" || value === "stable" || value === "dead") return value;
  const names = Array.isArray(conditions) ? conditions.map((condition) => String(condition).toLocaleLowerCase("en-US")) : [];
  if (names.includes("dead")) return "dead";
  if (names.includes("stable") || (typeof successes === "number" && successes >= 3)) return "stable";
  if (names.includes("unconscious") || Number(hp ?? 0) <= 0 || (typeof failures === "number" && failures > 0)) return "dying";
  return "conscious";
}

function normalizeDeathRecord(value: unknown): EngineDeathRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EngineDeathRecord>;
  if (candidate.source !== "damage" && candidate.source !== "death-save") return null;
  if (typeof candidate.sourceCommandId !== "string" || typeof candidate.occurredAt !== "string" || typeof candidate.sourceVersion !== "number") return null;
  return {
    source: candidate.source,
    sourceCommandId: candidate.sourceCommandId,
    sourceVersion: Math.max(0, Math.trunc(candidate.sourceVersion)),
    occurredAt: candidate.occurredAt,
  };
}

function normalizeSenseCapabilities(value: unknown): EngineSenseCapabilities {
  const defaults = defaultSenseCapabilities();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Partial<EngineSenseCapabilities>;
  return {
    normalVision: raw.normalVision !== false,
    darkvisionFeet: typeof raw.darkvisionFeet === "number" ? Math.max(0, Math.trunc(raw.darkvisionFeet)) : defaults.darkvisionFeet,
    blindsightFeet: typeof raw.blindsightFeet === "number" ? Math.max(0, Math.trunc(raw.blindsightFeet)) : defaults.blindsightFeet,
    tremorsenseFeet: typeof raw.tremorsenseFeet === "number" ? Math.max(0, Math.trunc(raw.tremorsenseFeet)) : defaults.tremorsenseFeet,
    hearing: raw.hearing !== false,
  };
}

function normalizeFeatureUses(value: unknown, className: unknown): Record<string, number> {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const fighter = typeof className === "string" && className.trim().toLocaleLowerCase("en-US") === "fighter";
  return {
    secondWind: typeof raw.secondWind === "number"
      ? Math.max(0, Math.min(1, Math.trunc(raw.secondWind)))
      : fighter ? 1 : 0,
  };
}

function emptyCharacterDetails(): EngineCharacterDetails {
  return {
    playerName: "",
    age: "",
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    appearance: "",
    backstory: "",
    allies: "",
    factionName: "",
    treasure: "",
    inspiration: false,
    temporaryHp: 0,
  };
}

function normalizeCharacterDetails(value: unknown): EngineCharacterDetails {
  const defaults = emptyCharacterDetails();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Partial<EngineCharacterDetails>;
  return {
    ...defaults,
    playerName: typeof raw.playerName === "string" ? raw.playerName : defaults.playerName,
    age: typeof raw.age === "string" ? raw.age : defaults.age,
    height: typeof raw.height === "string" ? raw.height : defaults.height,
    weight: typeof raw.weight === "string" ? raw.weight : defaults.weight,
    eyes: typeof raw.eyes === "string" ? raw.eyes : defaults.eyes,
    skin: typeof raw.skin === "string" ? raw.skin : defaults.skin,
    hair: typeof raw.hair === "string" ? raw.hair : defaults.hair,
    personalityTraits: typeof raw.personalityTraits === "string" ? raw.personalityTraits : defaults.personalityTraits,
    ideals: typeof raw.ideals === "string" ? raw.ideals : defaults.ideals,
    bonds: typeof raw.bonds === "string" ? raw.bonds : defaults.bonds,
    flaws: typeof raw.flaws === "string" ? raw.flaws : defaults.flaws,
    appearance: typeof raw.appearance === "string" ? raw.appearance : defaults.appearance,
    backstory: typeof raw.backstory === "string" ? raw.backstory : defaults.backstory,
    allies: typeof raw.allies === "string" ? raw.allies : defaults.allies,
    factionName: typeof raw.factionName === "string" ? raw.factionName : defaults.factionName,
    treasure: typeof raw.treasure === "string" ? raw.treasure : defaults.treasure,
    inspiration: typeof raw.inspiration === "boolean" ? raw.inspiration : defaults.inspiration,
    temporaryHp: typeof raw.temporaryHp === "number" && Number.isFinite(raw.temporaryHp)
      ? Math.max(0, Math.trunc(raw.temporaryHp))
      : defaults.temporaryHp,
  };
}

function normalizeAppliedConditions(value: unknown): EngineCharacter["conditionEffects"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<EngineCharacter["conditionEffects"][number]>;
    if (
      typeof candidate.id !== "string"
      || typeof candidate.conditionContentKey !== "string"
      || !candidate.conditionContentKey.startsWith("open5e:condition:")
      || typeof candidate.packHash !== "string"
      || !/^[a-f0-9]{64}$/.test(candidate.packHash)
      || typeof candidate.name !== "string"
      || typeof candidate.sourceContentKey !== "string"
      || !candidate.sourceContentKey.startsWith("open5e:")
      || typeof candidate.sourceCombatantId !== "string"
      || typeof candidate.appliedRound !== "number"
      || !candidate.duration
    ) return [];
    return [{
      id: candidate.id,
      conditionContentKey: candidate.conditionContentKey,
      packHash: candidate.packHash,
      name: candidate.name,
      sourceContentKey: candidate.sourceContentKey,
      sourceCombatantId: candidate.sourceCombatantId,
      appliedRound: Math.max(0, Math.trunc(candidate.appliedRound)),
      duration: candidate.duration,
      repeatSave: candidate.repeatSave ?? null,
    }];
  });
}

function normalizeCustodyStatus(value: unknown, ownerActorId: string): EngineCustodyStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<EngineCustodyStatus>;
  if (
    typeof raw.groupId !== "string" || !raw.groupId.trim()
    || (raw.status !== "restrained" && raw.status !== "under_guard")
    || typeof raw.sourceGuardId !== "string" || !raw.sourceGuardId.trim()
    || (raw.reason !== "surrender" && raw.reason !== "capture")
    || typeof raw.locationRef !== "string" || !raw.locationRef.trim()
    || typeof raw.startedVersion !== "number" || !Number.isInteger(raw.startedVersion) || raw.startedVersion < 0
    || raw.releasePolicy !== "guard-release-or-escape"
  ) return null;
  return {
    actorId: typeof raw.actorId === "string" && raw.actorId.trim() ? raw.actorId : ownerActorId,
    groupId: raw.groupId,
    status: raw.status,
    sourceGuardId: raw.sourceGuardId,
    reason: raw.reason,
    locationRef: raw.locationRef,
    startedVersion: raw.startedVersion,
    releasePolicy: "guard-release-or-escape",
  };
}

function normalizeEffects(value: unknown, state: LanternCampaignState): EngineEffectInstance[] {
  const parsed: EngineEffectInstance[] = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const candidate = entry as Partial<EngineEffectInstance>;
        if (
          typeof candidate.id !== "string"
          || typeof candidate.definitionKey !== "string"
          || typeof candidate.sourceRef !== "string"
          || !Array.isArray(candidate.targetRefs)
          || !Array.isArray(candidate.operations)
          || !candidate.startAnchor
          || !candidate.duration
          || typeof candidate.stackingKey !== "string"
          || !["stack", "replace", "ignore"].includes(candidate.stackingRule ?? "")
          || !Array.isArray(candidate.clearedBy)
          || !["active", "expired", "removed"].includes(candidate.status ?? "")
          || !candidate.provenance
        ) return [];
        const operations = candidate.operations.filter(isAdmittedEffectOperation);
        if (operations.length !== candidate.operations.length) return [];
        return [{
          id: candidate.id,
          definitionKey: candidate.definitionKey,
          sourceRef: candidate.sourceRef,
          targetRefs: candidate.targetRefs.filter((ref): ref is string => typeof ref === "string"),
          operations,
          startAnchor: candidate.startAnchor,
          duration: candidate.duration,
          stackingKey: candidate.stackingKey,
          stackingRule: candidate.stackingRule!,
          clearedBy: candidate.clearedBy.filter((policy): policy is EngineEffectInstance["clearedBy"][number] =>
            ["short-rest", "long-rest", "duration", "source-removal", "never"].includes(policy as string)
          ),
          status: candidate.status!,
          ...(typeof candidate.startTimeMinutes === "number" ? { startTimeMinutes: Math.max(0, Math.trunc(candidate.startTimeMinutes)) } : {}),
          provenance: candidate.provenance,
        }];
      })
    : [];

  for (const conditionEffect of state.character.conditionEffects) {
    if (parsed.some((effect) => effect.id === conditionEffect.id)) continue;
    parsed.push({
      id: conditionEffect.id,
      definitionKey: `condition:${conditionEffect.conditionContentKey}`,
      sourceRef: `combatant:${conditionEffect.sourceCombatantId}`,
      targetRefs: [state.character.id],
      operations: [{ kind: "condition", condition: normalizeCondition(conditionEffect.name), action: "apply" }],
      startAnchor: { kind: "campaign-round", round: conditionEffect.appliedRound },
      duration: conditionEffect.duration,
      stackingKey: `condition:${conditionEffect.conditionContentKey}`,
      stackingRule: "ignore",
      clearedBy: ["duration", "source-removal"],
      status: "active",
      provenance: {
        sourceContentKey: conditionEffect.sourceContentKey,
        sourceCommandId: null,
        rulesVersion: state.rulesVersion,
        formulaRevision: "legacy-condition-v1",
      },
    });
  }
  const seedLegacy = (condition: string, targetRef: string) => {
    const normalized = normalizeCondition(condition);
    if (!normalized || parsed.some((effect) =>
      effect.status === "active"
      && effect.targetRefs.some((ref) => refMatches(ref, targetRef))
      && effect.operations.some((operation) => operation.kind === "condition" && operation.action === "apply" && normalizeCondition(operation.condition) === normalized)
    )) return;
    parsed.push({
      id: `legacy-condition:${targetRef}:${normalized}`,
      definitionKey: `legacy-condition:${normalized}`,
      sourceRef: "legacy",
      targetRefs: [targetRef],
      operations: [{ kind: "condition", condition: normalized, action: "apply" }],
      startAnchor: { kind: "campaign-round", round: state.combat.round },
      duration: { kind: "persistent" },
      stackingKey: `condition:${normalized}`,
      stackingRule: "ignore",
      clearedBy: ["never"],
      status: "active",
      provenance: {
        sourceContentKey: null,
        sourceCommandId: null,
        rulesVersion: state.rulesVersion,
        formulaRevision: "legacy-condition-v1",
      },
    });
  };
  for (const condition of state.character.conditions) seedLegacy(condition, state.character.id);
  for (const enemy of state.combat.enemies) {
    for (const condition of enemy.conditions) seedLegacy(condition, enemy.id);
  }
  return parsed;
}

function syncConditionProjections(state: LanternCampaignState): void {
  const characterNames = activeConditionNames(state.effects, state.character.id);
  state.character.conditions = characterNames;
  const activeIds = new Set(state.effects.filter((effect) => effect.status === "active").map((effect) => effect.id));
  state.character.conditionEffects = state.character.conditionEffects.filter((effect) => activeIds.has(effect.id));
  for (const enemy of state.combat.enemies) {
    enemy.conditions = activeConditionNames(state.effects, enemy.id);
  }
}

function refMatches(ref: string, actorId: string): boolean {
  return ref === actorId || ref === `character:${actorId}` || ref === `combatant:${actorId}`;
}

function normalizeContentReference(value: unknown): EngineContentReference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { contentKey?: unknown; packHash?: unknown };
  if (typeof candidate.contentKey !== "string" || typeof candidate.packHash !== "string") return null;
  if (!candidate.contentKey.startsWith("open5e:") || !/^[a-f0-9]{64}$/.test(candidate.packHash)) return null;
  return { contentKey: candidate.contentKey, packHash: candidate.packHash };
}

function normalizeContentReferences(value: unknown): EngineContentReference[] {
  if (!Array.isArray(value)) return [];
  const references = value
    .map(normalizeContentReference)
    .filter((reference): reference is EngineContentReference => reference !== null);
  return [...new Map(references.map((reference) => [reference.contentKey, reference])).values()];
}

function normalizeFeatureReferences(value: unknown): EngineFeatureReference[] {
  if (!Array.isArray(value)) return [];
  const references: EngineFeatureReference[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const base = normalizeContentReference(raw);
    const featureSourceKey = raw && typeof raw === "object"
      ? (raw as { featureSourceKey?: unknown }).featureSourceKey
      : null;
    if (!base || typeof featureSourceKey !== "string" || !featureSourceKey.trim()) continue;
    const identity = `${base.contentKey}\u0000${featureSourceKey}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    references.push({ ...base, featureSourceKey });
  }
  return references;
}

function hydrateCharacter(character: EngineCharacter): EngineCharacter {
  const classEngineKey = character.className.trim().toLocaleLowerCase("en-US");
  const speciesEngineKey = character.species.trim().toLocaleLowerCase("en-US");
  const classPreset = OPEN5E_CLASS_PRESETS[classEngineKey] ?? OPEN5E_CLASS_PRESETS.fighter;
  const speciesPreset = OPEN5E_SPECIES_PRESETS[speciesEngineKey] ?? OPEN5E_SPECIES_PRESETS.human;
  const referencedClass = character.classRef
    ? getOpen5eClass(character.classRef.contentKey, character.classRef.packHash)
    : null;
  const referencedSpecies = character.speciesRef
    ? getOpen5eSpecies(character.speciesRef.contentKey, character.speciesRef.packHash)
    : null;
  const classProfile = referencedClass?.profile ?? null;
  const speciesProfile = referencedSpecies?.profile ?? null;
  const level = Math.max(1, character.level || 1);
  const abilities = {
    str: character.abilities?.str ?? 10,
    dex: character.abilities?.dex ?? 10,
    con: character.abilities?.con ?? 10,
    int: character.abilities?.int ?? 10,
    wis: character.abilities?.wis ?? 10,
    cha: character.abilities?.cha ?? 10,
  };
  const proficientSkills = Object.entries(character.skills ?? {})
    .filter(([, skill]) => skill.proficient)
    .map(([skill]) => skill);
  const skillNames = proficientSkills.length ? proficientSkills : defaultSkillProficiencies(classEngineKey);
  const hitDie = character.hitDie ?? classProfile?.hitDie ?? classPreset.hitDie;
  const maxHp = Math.max(1, hitDie * level + open5eAbilityModifier(abilities.con) * level);
  character.level = level;
  character.abilities = abilities;
  character.abilityModifiers = {
    str: open5eAbilityModifier(abilities.str),
    dex: open5eAbilityModifier(abilities.dex),
    con: open5eAbilityModifier(abilities.con),
    int: open5eAbilityModifier(abilities.int),
    wis: open5eAbilityModifier(abilities.wis),
    cha: open5eAbilityModifier(abilities.cha),
  };
  character.proficiencyBonus = open5eProficiencyBonus(level);
  character.savingThrows = buildSavingThrows(abilities, classProfile?.savingThrows ?? classPreset.savingThrows, level);
  character.skills = buildSkillSheet(abilities, skillNames, level);
  character.size = character.size ?? speciesProfile?.size ?? speciesPreset.size;
  character.speed = character.speed ?? speciesProfile?.speedFeet ?? speciesPreset.speed;
  character.hitDie = hitDie;
  character.hitDiceRemaining = Math.max(0, Math.min(level, character.hitDiceRemaining ?? level));
  character.proficiencies = character.proficiencies ?? {
    armor: classProfile?.proficiencies.armor ?? classPreset.armorProficiencies,
    weapons: classProfile?.proficiencies.weapons ?? classPreset.weaponProficiencies,
    tools: classProfile?.proficiencies.tools ?? classPreset.toolProficiencies,
    languages: speciesProfile?.languages.map((language) => language.name) ?? speciesPreset.languages,
  };
  character.features = character.features?.length
    ? character.features
    : [
        ...(classProfile?.levelOneFeatures.map((feature) => feature.name) ?? classPreset.startingFeatures),
        ...(speciesProfile?.featureNames ?? speciesPreset.features),
      ];
  character.featureUses = normalizeFeatureUses(character.featureUses, character.className);
  character.spellcasting = buildSpellcastingState(
    character.className,
    level,
    abilities,
    character.spellcasting,
    character.classRef?.packHash
  );
  character.maxHp = character.maxHp ?? maxHp;
  character.hp = Math.max(0, Math.min(character.maxHp, character.hp ?? character.maxHp));
  character.inventory = Array.isArray(character.inventory)
    ? character.inventory.map(normalizeInventoryItem)
    : [];
  character.currency = character.currency ?? { copper: 0 };
  character.ac = deriveArmorClass(character);
  return character;
}

function buildSpellcastingState(
  className: string,
  level: number,
  abilities: Record<EngineAbility, number>,
  current?: EngineCharacter["spellcasting"],
  packHash?: string
): EngineCharacter["spellcasting"] {
  const progression = getOpen5eSpellProgression(className, packHash);
  const classPreset = OPEN5E_CLASS_PRESETS[className] ?? OPEN5E_CLASS_PRESETS.fighter;
  const ability = progression?.spellcastingAbility ?? classPreset.spellcastingAbility;
  if (!ability) return null;

  const slotMaximums = open5eSpellSlots(className, level, packHash);
  const slots = Object.fromEntries(
    Object.entries(slotMaximums).map(([slotLevel, maximum]) => {
      const existing = current?.slots?.[slotLevel];
      return [slotLevel, existing === undefined ? maximum : Math.max(0, Math.min(maximum, Math.trunc(existing)))];
    })
  );
  return {
    ability,
    spellSaveDc: 8 + open5eProficiencyBonus(level) + open5eAbilityModifier(abilities[ability]),
    spellAttackBonus: open5eProficiencyBonus(level) + open5eAbilityModifier(abilities[ability]),
    slots,
    slotMaximums,
    slotRecovery: progression?.slotRecovery ?? "long-rest",
    knownSpells: normalizeSpellReferences(current?.knownSpells),
    preparedSpells: normalizeSpellReferences(current?.preparedSpells),
    concentration: normalizeConcentration(current?.concentration),
  };
}

function normalizeSpellReferences(value: unknown): EngineSpellReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const references: EngineSpellReference[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const reference = candidate as Partial<EngineSpellReference>;
    if (typeof reference.contentKey !== "string" || typeof reference.packHash !== "string") continue;
    if (
      (!reference.contentKey.startsWith("open5e:spell:") && !reference.contentKey.startsWith("runtime:spell:"))
      || seen.has(reference.contentKey)
    ) continue;
    seen.add(reference.contentKey);
    references.push({ contentKey: reference.contentKey, packHash: reference.packHash });
  }
  return references;
}

function normalizeConcentration(value: unknown): NonNullable<EngineCharacter["spellcasting"]>["concentration"] {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { contentKey?: unknown; packHash?: unknown; startedRound?: unknown };
  if (
    typeof candidate.contentKey !== "string"
    || (!candidate.contentKey.startsWith("open5e:spell:") && !candidate.contentKey.startsWith("runtime:spell:"))
    || typeof candidate.packHash !== "string"
  ) return null;
  return {
    contentKey: candidate.contentKey,
    packHash: candidate.packHash,
    startedRound: typeof candidate.startedRound === "number" ? Math.max(0, Math.trunc(candidate.startedRound)) : null,
  };
}

function defaultSkillProficiencies(className: string): string[] {
  switch (className) {
    case "barbarian": return ["athletics", "survival"];
    case "fighter": return ["athletics", "perception"];
    case "rogue": return ["stealth", "sleightOfHand", "investigation", "deception"];
    case "wizard": return ["arcana", "history"];
    default: return [];
  }
}

function deriveArmorClass(character: EngineCharacter, effects: EngineEffectInstance[] = []): number {
  const dexterity = open5eAbilityModifier(character.abilities.dex);
  const equipped = materializeInventory(character.inventory).filter((item) => item.equipped);
  const armor = equipped.find((item) => item.kind === "armor" && item.slot === "armor");
  const shieldBonus = equipped
    .filter((item) => item.kind === "armor" && item.properties?.includes("shield"))
    .reduce((total, item) => total + (item.armorClass ?? 0), 0);
  const base = !armor
    ? 10 + dexterity + shieldBonus
    : armor.armorProfile
      ? armor.armorProfile.base
        + (armor.armorProfile.addDexterityModifier
          ? armor.armorProfile.dexterityModifierCap === null
            ? dexterity
            : Math.min(armor.armorProfile.dexterityModifierCap, dexterity)
          : 0)
        + shieldBonus
      : (armor.armorClass ?? 10)
        + (armor.properties?.includes("heavy") ? 0 : armor.properties?.includes("medium") ? Math.min(2, dexterity) : dexterity)
        + shieldBonus;
  return base + queryStatModifier(effects, character.id, "armor-class").total;
}

function normalizeNpc(npc: EngineNpc): EngineNpc {
  const agency = normalizeNpcAgency(npc.agency, npc.id);
  return {
    id: npc.id,
    name: npc.name,
    description: npc.description ?? "",
    disposition: npc.disposition ?? "neutral",
    goals: npc.goals ?? [],
    socialDc: npc.socialDc ?? 12,
    relationshipScore: npc.relationshipScore ?? 0,
    memories: npc.memories ?? [],
    custody: normalizeCustodyStatus(npc.custody, npc.id),
    ...(agency ? { agency } : {}),
  };
}

function normalizeMerchant(merchant: EngineMerchant): EngineMerchant {
  return {
    id: merchant.id,
    name: merchant.name,
    description: merchant.description ?? "",
    disposition: merchant.disposition ?? "neutral",
    stolenGoodsPolicy: merchant.stolenGoodsPolicy === "fence" ? "fence" : "refuse-known",
    acquiredItems: (merchant.acquiredItems ?? []).map((item) => ({
      ...normalizeInventoryItem(item),
      ownerRef: { kind: "merchant", id: merchant.id },
      containerRef: undefined,
      equipped: false,
      slot: undefined,
    })),
    items: (merchant.items ?? []).map((listing) => {
      const item = normalizeInventoryItem(listing.item);
      const definition = materializeInventoryItem(item);
      return {
        item,
        stock: listing.stock ?? 0,
        buyPriceCopper: Math.max(0, Math.trunc(listing.buyPriceCopper ?? definition.valueCopper ?? 0)),
        sellPriceCopper: Math.max(0, Math.trunc(listing.sellPriceCopper ?? Math.floor((definition.valueCopper ?? 0) / 2))),
      };
    }),
  };
}

function projectMerchants(merchants: EngineMerchant[]): EngineMerchantView[] {
  return merchants.map((merchant) => {
    const { acquiredItems: _privateAcquiredItems, ...publicMerchant } = merchant;
    return {
      ...publicMerchant,
      items: merchant.items.map((listing) => ({
        ...listing,
        item: materializeInventoryItem(listing.item),
      })),
    };
  });
}

function projectWorldContext(world: LanternCampaignState["worldContext"]): EngineWorldContextView | null {
  if (!world) return null;
  return {
    ...world,
    merchants: projectMerchants(world.merchants),
    facts: [],
  };
}

function actorSenseCapabilities(state: LanternCampaignState, actorId: string): EngineSenseCapabilities {
  return actorId === state.actorId ? state.character.senses : defaultSenseCapabilities();
}

function actorCanPerceiveFact(state: LanternCampaignState, actorId: string, fact: EngineWorldFact): boolean {
  const senses = actorSenseCapabilities(state, actorId);
  if (hasActiveCondition(state.effects, actorId, "blinded") || hasActiveCondition(state.effects, "actor:" + actorId, "blinded")) return false;
  if (fact.obscurity === "dark" && fact.requiredSense !== "hearing" && senses.darkvisionFeet <= 0 && senses.blindsightFeet <= 0) return false;
  switch (fact.requiredSense) {
    case "darkvision": return senses.darkvisionFeet > 0 || senses.blindsightFeet > 0;
    case "blindsight": return senses.blindsightFeet > 0;
    case "tremorsense": return senses.tremorsenseFeet > 0;
    case "hearing": return senses.hearing;
    default: return senses.normalVision || senses.darkvisionFeet > 0 || senses.blindsightFeet > 0;
  }
}

function canonicalKnowledgeSkillModifier(state: LanternCampaignState, skill: string): number {
  const entry = state.character.skills[skill];
  if (!entry) return abilityModifier(state.character.abilities.wis);
  return abilityModifier(state.character.abilities[entry.ability])
    + (entry.proficient ? state.character.proficiencyBonus : 0)
    + (entry.expertise ? state.character.proficiencyBonus : 0);
}

function appendKnowledgeRecord(
  state: LanternCampaignState,
  actorId: string,
  fact: EngineWorldFact,
  tier: InformationTier,
  source: EngineKnowledgeRecord["source"],
  provenance: string,
  campaignVersion: number
): EngineKnowledgeRecord {
  const now = new Date().toISOString();
  const existing = state.actorKnowledge.find((record) =>
    record.actorId === actorId && record.factId === fact.id && record.factRevision === fact.revision && !record.stale && record.tier === tier
  );
  if (existing) return existing;
  const record: EngineKnowledgeRecord = {
    id: randomUUID(),
    actorId,
    factId: fact.id,
    tier,
    source,
    provenance,
    confidence: tier === "known" ? 1 : 0.75,
    campaignVersion,
    factRevision: fact.revision,
    stale: false,
    createdAt: now,
    updatedAt: now,
  };
  state.actorKnowledge = [...state.actorKnowledge, record].slice(-500);
  return record;
}

function evaluatePassiveKnowledge(state: LanternCampaignState, actorId: string, campaignVersion: number): void {
  const passive = 10 + canonicalKnowledgeSkillModifier(state, "perception");
  for (const fact of state.worldFacts) {
    if (!fact.active || fact.visibility !== "hidden" || fact.passiveDc == null || fact.passiveDc > passive) continue;
    if (!actorCanPerceiveFact(state, actorId, fact)) continue;
    appendKnowledgeRecord(state, actorId, fact, "perceived", "passive-observation", `passive-perception:${fact.sceneId}`, campaignVersion);
  }
}

function markKnowledgeStale(state: LanternCampaignState, changedFactIds: string[] = []): void {
  const changed = new Set(changedFactIds);
  state.actorKnowledge = state.actorKnowledge.map((record) => {
    const fact = state.worldFacts.find((candidate) => candidate.id === record.factId);
    if (changed.has(record.factId) || !fact || record.factRevision !== fact.revision) {
      return { ...record, tier: "stale", stale: true, updatedAt: new Date().toISOString() };
    }
    return record;
  });
}

export function actorKnowledgeProjection(actorId: string, state: LanternCampaignState): PublicProjection {
  const knowledge = state.actorKnowledge.filter((record) => record.actorId === actorId).map((record) => ({ ...record }));
  const currentKnowledge = new Map(
    knowledge
      .filter((record) => !record.stale && (record.tier === "known" || record.tier === "perceived"))
      .map((record) => [record.factId, record])
  );
  const facts = state.worldFacts
    .filter((fact) => fact.active)
    .filter((fact) => fact.visibility === "public" || currentKnowledge.get(fact.id)?.factRevision === fact.revision)
    .map((fact) => ({ ...fact }));
  const base = projectWorldContext(state.worldContext);
  return {
    actorId,
    informationTiers: ["public", "perceived", "known", "rumor", "false-belief", "stale", "withheld"],
    worldContext: base ? { ...base, facts } : null,
    proceduralNotices: state.proceduralNotices.map(proceduralNoticeView),
    facts,
    knowledge,
    social: projectSocialForActor(actorId, state),
  };
}

export function projectResolutionForActor<T extends EngineResolution>(resolution: T, actorId: string): T {
  const state = projectStateForActor(actorId, resolution.state);
  const event = resolution.event
    ? redactEventForActor(resolution.event)
    : null;
  return { ...resolution, state, event, data: redactResolutionData(resolution.data) } as T;
}

export function projectStateForActor(actorId: string, state: LanternCampaignState): LanternCampaignState {
  const projectionActorId = state.party?.members.some((member) => member.actorId === state.party?.activeViewpointActorId)
    ? state.party.activeViewpointActorId
    : actorId;
  const projection = actorKnowledgeProjection(projectionActorId, state);
  const projected = cloneCampaign(state);
  projected.worldFacts = projection.facts;
  projected.proceduralNotices = state.proceduralNotices.map((notice) => ({
    ...notice,
    terms: notice.status === "delivered" || notice.status === "resolved" ? { ...notice.terms } : null,
  })) as unknown as LanternCampaignState["proceduralNotices"];
  projected.actorKnowledge = projection.knowledge;
  projected.runtimeContent = projectRuntimeContentForActor(projected.runtimeContent);
  projected.controlledActors = projected.controlledActors
    .filter((actor) => actor.ownerActorId === actorId || actor.controllerActorId === actorId)
    .map((actor) => controlledActorView(projected, actor, actorId)) as unknown as EngineControlledActor[];
  delete projected.social;
  // Private planner/narrator runs and unreleased snapshots never cross the
  // ordinary campaign state boundary. Use a dedicated released sequence
  // endpoint when public playback is needed.
  delete projected.productionRoom;
  return projected;
}

export function projectEventForActor(actorId: string, state: LanternCampaignState, event: EngineEvent): EngineEvent {
  void actorId;
  void state;
  return redactEventForActor(event);
}

function redactEventForActor(event: EngineEvent): EngineEvent {
  const command = redactCommand(event.command);
  const withheld = event.check?.informationPolicy === "withheld"
    || event.adjudication?.informationPolicy === "withheld"
    || event.effects?.some((effect) => effect.check?.informationPolicy === "withheld" || effect.adjudication?.informationPolicy === "withheld");
  return {
    ...event,
    command,
    rolls: withheld ? [] : event.rolls,
    modifiers: withheld ? [] : event.modifiers,
    outcome: withheld ? "withheld" : event.outcome,
    ...(withheld && event.check ? { check: redactWithheldCheck(event.check) } : {}),
    ...(withheld && event.adjudication ? { adjudication: redactWithheldAdjudication(event.adjudication) } : {}),
    ...(event.effects ? {
      effects: event.effects.map((effect) => {
        const effectWithheld = effect.check?.informationPolicy === "withheld"
          || effect.adjudication?.informationPolicy === "withheld";
        return {
          ...effect,
          command: redactCommand(effect.command),
          rolls: effectWithheld ? [] : effect.rolls,
          modifiers: effectWithheld ? [] : effect.modifiers,
          ...(effectWithheld && effect.check ? { check: redactWithheldCheck(effect.check) } : {}),
          ...(effectWithheld && effect.adjudication ? { adjudication: redactWithheldAdjudication(effect.adjudication) } : {}),
          data: redactResolutionData(effect.data),
          stateChanges: redactStateChanges(effect.stateChanges),
        };
      }),
    } : {}),
    stateChanges: redactStateChanges(event.stateChanges),
  };
}

const CONTROLLED_ACTOR_PRIVATE_FIELDS = [
  "ownerActorId",
  "controllerActorId",
  "summonerActorId",
  "riderActorId",
  "passengerOfActorId",
  "employerActorId",
  "charmControllerActorId",
  "factionId",
  "sourceRef",
  "provenance",
] as const;

function redactControlledActorValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactControlledActorValue(entry));
  if (!value || typeof value !== "object") return value;
  const projected = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const field of CONTROLLED_ACTOR_PRIVATE_FIELDS) delete projected[field];
  return projected;
}

function isUndiscoveredHiddenExit(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).hidden === true
    && (value as Record<string, unknown>).discovered === false,
  );
}

function containsUndiscoveredHiddenExit(value: unknown): boolean {
  if (isUndiscoveredHiddenExit(value)) return true;
  if (Array.isArray(value)) return value.some(containsUndiscoveredHiddenExit);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(containsUndiscoveredHiddenExit);
}

/**
 * Apply the same hidden-exit boundary to every actor-facing shape, including
 * command proposals, resolution data, and event state-change evidence. This
 * is intentionally structural so older event payloads cannot bypass the
 * typed runtime-content projection.
 */
function redactRuntimeContentValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => !(entry && typeof entry === "object" && !Array.isArray(entry)
        && (entry as Record<string, unknown>).relation === "connects_to"
        && isUndiscoveredHiddenExit((entry as Record<string, unknown>).exit)))
      .map((entry) => redactRuntimeContentValue(entry));
  }
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === "sceneMove" && child && typeof child === "object" && !Array.isArray(child)) {
      const sceneMove = child as Record<string, unknown>;
      projected[key] = {
        category: sceneMove.category,
        outcome: sceneMove.outcome,
        nextDecision: sceneMove.nextDecision,
      };
      continue;
    }
    if (key === "exit" && isUndiscoveredHiddenExit(child)) continue;
    if (key === "exits" && Array.isArray(child)) {
      projected[key] = child
        .filter((exit) => !isUndiscoveredHiddenExit(exit))
        .map((exit) => redactRuntimeContentValue(exit));
      continue;
    }
    if (key === "relationships" && Array.isArray(child)) {
      projected[key] = redactRuntimeContentValue(child);
      continue;
    }
    projected[key] = redactRuntimeContentValue(child);
  }
  return projected;
}

function redactStateChanges(changes: Array<{ path: string; before: unknown; after: unknown }>): Array<{ path: string; before: unknown; after: unknown }> {
  return changes
    .filter((change) => !change.path.startsWith("/worldFacts") && !change.path.startsWith("/actorKnowledge") && !change.path.startsWith("/productionRoom"))
    .filter((change) => !(change.path.startsWith("/runtimeContent") && (containsUndiscoveredHiddenExit(change.before) || containsUndiscoveredHiddenExit(change.after))))
    .map((change) => {
      if (change.path.startsWith("/controlledActors") || change.path.startsWith("/time/scheduledEvents")) {
        return { ...change, before: redactControlledActorValue(change.before), after: redactControlledActorValue(change.after) };
      }
      if (change.path.startsWith("/proceduralNotices/")) {
        const redactNotice = (value: unknown): unknown => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return value;
          const notice = value as EngineProceduralNotice;
          if (typeof notice.id !== "string" || typeof notice.status !== "string") return value;
          return {
            ...notice,
            terms: notice.status === "delivered" || notice.status === "resolved" ? notice.terms : null,
          };
        };
        return { ...change, before: redactNotice(change.before), after: redactNotice(change.after) };
      }
      return {
        ...change,
        before: redactRuntimeContentValue(change.before),
        after: redactRuntimeContentValue(change.after),
      };
    });
}

function redactResolutionData(data: unknown): unknown {
  if (Array.isArray(data)) return data.map((entry) => redactResolutionData(entry));
  if (!data || typeof data !== "object") return data;
  const projected = redactRuntimeContentValue(data) as Record<string, unknown>;
  if (projected.command && typeof projected.command === "object" && !Array.isArray(projected.command)) {
    projected.command = redactCommand(projected.command as Record<string, unknown>);
  }
  if (Object.hasOwn(projected, "data")) projected.data = redactResolutionData(projected.data);
  if (projected.promptContext && typeof projected.promptContext === "object" && !Array.isArray(projected.promptContext)) {
    const promptContext = projected.promptContext as Record<string, unknown>;
    projected.promptContext = {
      actorId: promptContext.actorId,
      locationRef: promptContext.locationRef,
      schedule: promptContext.schedule,
      goals: promptContext.goals,
    };
  }
  if (Array.isArray(projected.effects)) {
    projected.effects = projected.effects.map((effect) => redactResolutionData(effect));
  }
  const adjudication = projected.adjudication;
  if (adjudication && typeof adjudication === "object" && !Array.isArray(adjudication)) {
    projected.adjudication = redactWithheldAdjudication(adjudication);
  }
  const check = projected.check;
  if (check && typeof check === "object" && !Array.isArray(check)) {
    projected.check = redactWithheldCheck(check);
  }
  const withheld = projected.informationPolicy === "withheld"
    || (projected.adjudication && typeof projected.adjudication === "object" && !Array.isArray(projected.adjudication)
      && (projected.adjudication as Record<string, unknown>).informationPolicy === "withheld");
  if (withheld) {
    delete projected.roll;
    delete projected.total;
    delete projected.modifier;
    delete projected.opponentModifier;
    delete projected.opponentTotal;
    delete projected.opponentRoll;
  }
  return projected;
}

function redactCommand<T extends object>(command: T): T {
  const projected = redactRuntimeContentValue(command) as Record<string, unknown>;
  if (projected.kind === "world_context") delete projected.facts;
  if (projected.kind === "procedural_notice" && projected.notice && typeof projected.notice === "object" && !Array.isArray(projected.notice)) {
    const notice = projected.notice as Record<string, unknown>;
    projected.notice = { ...notice, terms: null };
  }
  if (projected.kind === "challenge_attempt") delete projected.factId;
  if (projected.kind === "quest_create" && projected.graph && typeof projected.graph === "object" && !Array.isArray(projected.graph)) {
    const graph = projected.graph as Record<string, unknown>;
    if (Array.isArray(graph.objectives)) {
      graph.objectives = graph.objectives.map((objective) => {
        if (!objective || typeof objective !== "object" || Array.isArray(objective)) return objective;
        const candidate = objective as Record<string, unknown>;
        return candidate.hidden === true
          ? { id: candidate.id, title: "[hidden objective]", mode: candidate.mode, optional: candidate.optional, hidden: true }
          : candidate;
      });
    }
    if (Array.isArray(graph.transitions)) {
      graph.transitions = graph.transitions.map((transition) => {
        if (!transition || typeof transition !== "object" || Array.isArray(transition)) return transition;
        const candidate = transition as Record<string, unknown>;
        return {
          id: candidate.id,
          label: "[quest branch]",
          outcome: "[redacted]",
          predicates: [],
          requiresObjectiveIds: [],
          consequence: { xp: 0, copper: 0 },
        };
      });
    }
  }
  if (projected.kind === "turn_plan" && Array.isArray(projected.effects)) {
    projected.effects = projected.effects.map((effect) => {
      if (!effect || typeof effect !== "object" || Array.isArray(effect)) return effect;
      const entry = effect as Record<string, unknown>;
      return {
        ...entry,
        ...(entry.command && typeof entry.command === "object" && !Array.isArray(entry.command)
          ? { command: redactCommand(entry.command as Record<string, unknown>) }
          : {}),
      };
    });
  }
  return redactRuntimeContentValue(projected) as T;
}

function redactWithheldAdjudication<T>(adjudication: T): T {
  if (!adjudication || typeof adjudication !== "object" || Array.isArray(adjudication)) return adjudication;
  const decision = adjudication as T & Record<string, unknown>;
  if (decision.informationPolicy !== "withheld") return adjudication;
  return {
    ...decision,
    dc: null,
    dcProvenance: "withheld",
    approachHash: undefined,
  } as T;
}

function redactWithheldCheck<T>(check: T): T {
  if (!check || typeof check !== "object" || Array.isArray(check)) return check;
  const evidence = check as T & Record<string, unknown>;
  if (evidence.informationPolicy !== "withheld") return check;
  return {
    ...evidence,
    modifier: 0,
    modifierSources: [],
    advantageSources: [],
    disadvantageSources: [],
    opponentModifier: undefined,
    opponentTotal: undefined,
  } as T;
}

function normalizeQuest(quest: EngineQuest): EngineQuest {
  const legacy = quest as EngineQuest & { reward?: { xp?: number; copper?: number; gold?: number } };
  const graph = normalizeQuestGraph(legacy.graph);
  const status: EngineQuestStatus = ["active", "completed", "failed", "abandoned", "expired"].includes(legacy.status)
    ? legacy.status as EngineQuestStatus
    : "active";
  const deadlineAtMinutes = typeof legacy.deadlineAtMinutes === "number"
    ? Math.max(0, Math.trunc(legacy.deadlineAtMinutes))
    : graph?.deadlineAtMinutes ?? undefined;
  return {
    id: legacy.id ?? randomUUID(),
    title: legacy.title ?? "Untitled quest",
    objective: legacy.objective ?? "Follow the thread.",
    status,
    reward: {
      xp: Math.max(0, Math.trunc(legacy.reward?.xp ?? 0)),
      copper: Math.max(0, Math.trunc(legacy.reward?.copper ?? (legacy.reward?.gold ?? 0) * 100)),
    },
    rewardClaimed: Boolean(legacy.rewardClaimed),
    progress: Math.max(0, Math.min(100, Math.trunc(legacy.progress ?? 0))),
    giverNpcId: legacy.giverNpcId,
    deadline: legacy.deadline,
    ...(deadlineAtMinutes === undefined ? {} : { deadlineAtMinutes }),
    ...(graph ? { graph: { ...graph, deadlineAtMinutes: graph.deadlineAtMinutes ?? deadlineAtMinutes ?? null } } : {}),
  };
}

function normalizeQuestGraph(value: unknown): EngineQuestGraph | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Partial<EngineQuestGraph> & { objectives?: unknown; transitions?: unknown; clock?: unknown };
  if (!Array.isArray(raw.objectives) || !Array.isArray(raw.transitions)) return undefined;
  const objectiveInputs = raw.objectives.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Partial<EngineQuestObjective>;
    return [
      {
        id: item.id,
        title: item.title,
        mode: item.mode,
        optional: item.optional,
        hidden: item.hidden,
        predicate: item.predicate,
      },
    ];
  });
  const transitionInputs = raw.transitions.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const transition = candidate as Partial<EngineQuestTransition>;
    return [{
      id: transition.id,
      label: transition.label,
      outcome: transition.outcome,
      predicates: transition.predicates,
      requiresObjectiveIds: transition.requiresObjectiveIds,
      ...(transition.choiceId ? { choiceId: transition.choiceId } : {}),
      consequence: transition.consequence,
    }];
  });
  const parsed = engineQuestGraphInputSchema.safeParse({
    objectives: objectiveInputs,
    transitions: transitionInputs,
    ...(typeof raw.deadlineAtMinutes === "number" ? { deadlineAtMinutes: raw.deadlineAtMinutes } : {}),
    ...(typeof raw.deadlineTransitionId === "string" ? { deadlineTransitionId: raw.deadlineTransitionId } : {}),
    ...(typeof raw.followUpQuestId === "string" ? { followUpQuestId: raw.followUpQuestId } : {}),
    ...(raw.clock && typeof raw.clock === "object" && !Array.isArray(raw.clock)
      ? {
          clock: {
            id: (raw.clock as Partial<EngineQuestProgressClock>).id,
            title: (raw.clock as Partial<EngineQuestProgressClock>).title,
            max: (raw.clock as Partial<EngineQuestProgressClock>).max,
            source: (raw.clock as Partial<EngineQuestProgressClock>).source,
          },
        }
      : {}),
  });
  if (!parsed.success) return undefined;
  const previousObjectives = new Map(
    raw.objectives.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const objective = candidate as Partial<EngineQuestObjective>;
      return typeof objective.id === "string" ? [[objective.id, objective]] as const : [];
    })
  );
  const objectives: EngineQuestObjective[] = parsed.data.objectives.map((objective) => {
    const previous = previousObjectives.get(objective.id);
    return {
      ...objective,
      discovered: objective.hidden ? Boolean(previous?.discovered) : true,
      status: previous?.status === "completed" ? "completed" : "pending",
      completedAtMinutes: typeof previous?.completedAtMinutes === "number" ? Math.max(0, Math.trunc(previous.completedAtMinutes)) : null,
      evidence: typeof previous?.evidence === "string" ? previous.evidence : null,
    };
  });
  const previousRecords = Array.isArray(raw.consequenceRecords) ? raw.consequenceRecords : [];
  const consequenceRecords: EngineQuestConsequenceRecord[] = previousRecords.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Partial<EngineQuestConsequenceRecord>;
    if (typeof record.transitionId !== "string" || typeof record.outcomeId !== "string") return [];
    return [{
      transitionId: record.transitionId,
      outcomeId: record.outcomeId,
      rewardKeys: Array.isArray(record.rewardKeys) ? record.rewardKeys.filter((key): key is string => typeof key === "string") : [],
      reputationApplied: Boolean(record.reputationApplied),
      worldChangeApplied: Boolean(record.worldChangeApplied),
      followUpEligible: Boolean(record.followUpEligible),
      appliedAtMinutes: typeof record.appliedAtMinutes === "number" ? Math.max(0, Math.trunc(record.appliedAtMinutes)) : 0,
      sourceCommandId: typeof record.sourceCommandId === "string" ? record.sourceCommandId : "legacy-quest",
    }];
  });
  const clock = parsed.data.clock
    ? {
        ...parsed.data.clock,
        current: Math.max(0, Math.min(parsed.data.clock.max, Math.trunc((raw.clock as Partial<EngineQuestProgressClock> | undefined)?.current ?? 0))),
        resolvedAtMinutes: typeof (raw.clock as Partial<EngineQuestProgressClock> | undefined)?.resolvedAtMinutes === "number" ? Math.max(0, Math.trunc((raw.clock as Partial<EngineQuestProgressClock>).resolvedAtMinutes!)) : null,
        resolvedByTransitionId: typeof (raw.clock as Partial<EngineQuestProgressClock> | undefined)?.resolvedByTransitionId === "string" ? (raw.clock as Partial<EngineQuestProgressClock>).resolvedByTransitionId! : null,
      } satisfies EngineQuestProgressClock
    : null;
  return {
    objectives,
    transitions: parsed.data.transitions as EngineQuestTransition[],
    deadlineAtMinutes: typeof parsed.data.deadlineAtMinutes === "number" ? parsed.data.deadlineAtMinutes : null,
    deadlineTransitionId: parsed.data.deadlineTransitionId ?? null,
    followUpQuestId: parsed.data.followUpQuestId ?? null,
    followUpEligible: Boolean(raw.followUpEligible),
    clock,
    terminalTransitionId: typeof raw.terminalTransitionId === "string" ? raw.terminalTransitionId : null,
    consequenceRecords,
  };
}

function currencyBreakdown(copper: number): EngineCurrencyBreakdown {
  return currencyFromCopper(copper);
}

function syncCurrencyProjection(character: EngineCharacter): void {
  character.currency.copper = Math.max(0, Math.trunc(character.currency.copper));
  character.gold = Math.floor(character.currency.copper / 100);
}

const MAX_CONTAINER_DEPTH = 4;

interface InventoryIssue {
  code: string;
  message: string;
}

function isActorOwnedItem(item: EngineInventoryItem, actorId: string): boolean {
  return !item.ownerRef || (item.ownerRef.kind === "actor" && item.ownerRef.id === actorId);
}

function withActorOwnership(
  item: EngineInventoryItem,
  actorId: string,
  provenance: EngineItemProvenance,
): EngineInventoryItem {
  return {
    ...item,
    ownerRef: { kind: "actor", id: actorId },
    containerRef: undefined,
    equipped: false,
    slot: undefined,
    provenance,
  };
}

function worldObjectInventoryKind(object: EngineWorldObjectInstance): EngineItemDefinition["kind"] {
  const tags = new Set(object.definition.tags.map((tag) => tag.toLocaleLowerCase("en-US")));
  if (tags.has("weapon")) return "weapon";
  if (tags.has("armor")) return "armor";
  if (tags.has("consumable") || tags.has("food") || tags.has("potion")) return "consumable";
  if (tags.has("ammunition") || tags.has("ammo")) return "ammunition";
  if (tags.has("tool") || tags.has("tools")) return "tool";
  if (tags.has("treasure") || tags.has("valuable")) return "treasure";
  return "misc";
}

function worldObjectInventoryItem(object: EngineWorldObjectInstance, inventoryOwnerId: string): EngineInventoryItem {
  const authoredDefinition: EngineItemDefinition = {
    name: object.definition.name,
    kind: worldObjectInventoryKind(object),
    weight: object.definition.weight,
    description: object.definition.description,
    properties: [...object.definition.tags],
    mechanicsTier: 0,
  };
  return {
    id: object.id,
    ...(object.materialization ? { runtimeContentInstanceId: object.materialization.runtimeInstanceId } : {}),
    quantity: 1,
    authoredDefinition,
    ownerRef: { kind: "actor", id: inventoryOwnerId },
    provenance: {
      kind: "authored",
      sourceId: object.materialization?.runtimeDefinitionId ?? object.definition.sourceRef,
    },
  };
}

function syncWorldObjectInventory(
  state: LanternCampaignState,
  object: EngineWorldObjectInstance,
): InventoryIssue | null {
  if (object.ownerRef.kind !== "actor") return null;
  const existing = state.character.inventory.find((item) => item.id === object.id);
  if (existing) {
    existing.ownerRef = { kind: "actor", id: state.character.id };
    existing.containerRef = undefined;
    existing.equipped = object.state === "equipped";
    if (!existing.equipped) existing.slot = undefined;
  } else {
    state.character.inventory.push(worldObjectInventoryItem(object, state.character.id));
  }
  return inventoryCapacityIssue(state.character.inventory, state.character);
}

function reconcileWorldObjectInventory(state: LanternCampaignState): void {
  const world = state.worldContext;
  if (!world) return;
  for (const object of world.objects) {
    if (object.ownerRef.kind !== "actor" || object.ownerRef.id !== state.actorId) continue;
    if (object.state !== "carried" && object.state !== "equipped") continue;
    if (state.character.inventory.some((item) => item.id === object.id)) continue;
    state.character.inventory.push(worldObjectInventoryItem(object, state.character.id));
  }
}

function isContainerItem(item: EngineInventoryItemView): boolean {
  return typeof item.containerCapacity === "number";
}

function inventoryHasChildren(inventory: EngineInventoryItem[], containerId: string): boolean {
  return inventory.some((item) => item.containerRef === containerId);
}

function isDescendantOf(inventory: EngineInventoryItem[], candidateId: string, ancestorId: string): boolean {
  const seen = new Set<string>();
  let current = inventory.find((item) => item.id === candidateId);
  while (current?.containerRef) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    if (current.containerRef === ancestorId) return true;
    current = inventory.find((item) => item.id === current!.containerRef);
  }
  return false;
}

function inventoryTopologyIssue(inventory: EngineInventoryItem[], actorId?: string): InventoryIssue | null {
  const ids = new Set<string>();
  for (const item of inventory) {
    if (ids.has(item.id)) return { code: "duplicate_item_instance", message: "Inventory contains duplicate item instance ids." };
    ids.add(item.id);
    if (item.quantity < 0 || !Number.isInteger(item.quantity)) return { code: "invalid_quantity", message: "Inventory quantities must be nonnegative integers." };
    if (actorId && !isActorOwnedItem(item, actorId)) return { code: "item_not_owned", message: "An inventory item is owned by another actor." };
    if (item.equipped && item.containerRef) return { code: "equipped_item_in_container", message: "An equipped item cannot be inside a container." };
    if (!item.containerRef) continue;
    if (item.containerRef === item.id) return { code: "container_cycle", message: "A container cannot contain itself." };
    const parent = inventory.find((candidate) => candidate.id === item.containerRef);
    if (!parent) return { code: "container_not_found", message: "An item refers to a missing container." };
    let depth = 1;
    let current = parent;
    const seen = new Set<string>([item.id]);
    while (current.containerRef) {
      if (seen.has(current.id)) return { code: "container_cycle", message: "Container locations must be acyclic." };
      seen.add(current.id);
      depth += 1;
      if (depth > MAX_CONTAINER_DEPTH) return { code: "container_depth_exceeded", message: `Containers may be nested only ${MAX_CONTAINER_DEPTH} levels deep.` };
      const ancestor = inventory.find((candidate) => candidate.id === current.containerRef);
      if (!ancestor) return { code: "container_not_found", message: "An item refers to a missing ancestor container." };
      current = ancestor;
    }
    try {
      if (!isContainerItem(materializeInventoryItem(parent))) return { code: "not_a_container", message: "An item refers to a non-container location." };
    } catch {
      return { code: "invalid_item", message: "An inventory item could not be materialized." };
    }
  }
  return null;
}

function inventoryCapacityIssue(inventory: EngineInventoryItem[], character: EngineCharacter): InventoryIssue | null {
  const topologyIssue = inventoryTopologyIssue(inventory, character.id);
  if (topologyIssue) return topologyIssue;
  const carryLimit = carryCapacity(character.abilities.str);
  const carryWeight = inventoryWeight(inventory);
  if (carryWeight > carryLimit) return { code: "carry_capacity_exceeded", message: "That change would exceed your carrying capacity." };
  for (const item of inventory) {
    let view: EngineInventoryItemView;
    try {
      view = materializeInventoryItem(item);
    } catch {
      return { code: "invalid_item", message: "An inventory item could not be materialized." };
    }
    if (!isContainerItem(view)) continue;
    const used = containerContentsWeight(inventory, item.id);
    if (used > view.containerCapacity!) {
      return { code: "container_capacity_exceeded", message: `${view.name} cannot hold that weight.` };
    }
  }
  return null;
}

function inventoryWeight(inventory: EngineInventoryItem[]): number {
  const views = new Map(inventory.map((item) => [item.id, materializeInventoryItem(item)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const weightFor = (id: string, depth: number): number => {
    const view = views.get(id);
    if (!view || visiting.has(id) || depth > MAX_CONTAINER_DEPTH + 1) return 0;
    visiting.add(id);
    let total = view.weight * view.quantity;
    for (const child of inventory) {
      if (child.containerRef === id) total += weightFor(child.id, depth + 1);
    }
    visiting.delete(id);
    visited.add(id);
    return total;
  };
  let total = 0;
  for (const item of inventory) {
    if (!item.containerRef || !views.has(item.containerRef)) total += weightFor(item.id, 0);
  }
  for (const item of inventory) {
    if (!visited.has(item.id)) total += weightFor(item.id, 0);
  }
  return total;
}

function containerContentsWeight(inventory: EngineInventoryItem[], containerId: string): number {
  const views = new Map(inventory.map((item) => [item.id, materializeInventoryItem(item)]));
  const visiting = new Set<string>();
  const weightFor = (id: string, depth: number): number => {
    const view = views.get(id);
    if (!view || visiting.has(id) || depth > MAX_CONTAINER_DEPTH + 1) return 0;
    visiting.add(id);
    let total = view.weight * view.quantity;
    for (const child of inventory) {
      if (child.containerRef === id) total += weightFor(child.id, depth + 1);
    }
    visiting.delete(id);
    return total;
  };
  return inventory.filter((item) => item.containerRef === containerId)
    .reduce((total, item) => total + weightFor(item.id, 1), 0);
}

function defaultAmmunitionId(weaponName: string): string {
  const name = weaponName.toLocaleLowerCase("en-US");
  if (name.includes("crossbow")) return "bolt";
  if (name.includes("bow")) return "arrow";
  if (name.includes("sling")) return "sling-bullet";
  return "ammunition";
}

function findAmmunition(inventory: EngineInventoryItem[], ammunitionId: string): EngineInventoryItem | null {
  const exact = inventory.find((item) => item.id === ammunitionId && item.quantity > 0 && materializeInventoryItem(item).kind === "ammunition");
  if (exact) return exact;
  const hint = ammunitionId.toLocaleLowerCase("en-US");
  return inventory.find((item) => {
    if (item.quantity <= 0) return false;
    const view = materializeInventoryItem(item);
    return view.kind === "ammunition"
      && (view.name.toLocaleLowerCase("en-US").includes(hint) || item.contentKey?.toLocaleLowerCase("en-US").includes(hint) === true);
  }) ?? null;
}

function itemExecutionAllowed(item: EngineInventoryItemView, operation: "equip" | "use"): boolean {
  const tier = item.mechanicsTier ?? 0;
  if (operation === "equip") {
    if (item.effectKey || item.isMagic) return tier === 2;
    if (item.definitionSource === "authored") return tier === 2;
    return tier === 2 || (item.definitionSource === "open5e" && (item.kind === "weapon" || item.kind === "armor"));
  }
  return tier === 2 && (
    item.effectKey === "lantern-ward-v1"
    || (item.effectKey === REVIEWED_CURE_WOUNDS_SCROLL_EFFECT_KEY && item.kind === "consumable" && Boolean(item.spellScroll))
    || (item.kind === "consumable" && Boolean(item.healing))
  );
}

function normalizedProperties(item: EngineItemDefinitionLike): string[] {
  return [...new Set((item.properties ?? []).map((property) => property.trim().toLocaleLowerCase("en-US").replaceAll(" ", "-")))];
}

type EngineItemDefinitionLike = Pick<EngineInventoryItemView, "kind" | "properties" | "effectKey">;

function equipmentSlotIssue(item: EngineInventoryItemView, slot: EngineEquipmentSlot): InventoryIssue | null {
  const properties = normalizedProperties(item);
  if (item.effectKey === "lantern-ward-v1") return slot === "accessory" ? null : { code: "invalid_equipment_slot", message: "The Lantern Ward occupies an accessory slot." };
  if (item.kind === "weapon" && slot !== "mainhand" && slot !== "offhand") return { code: "invalid_equipment_slot", message: "Weapons occupy a mainhand or offhand slot." };
  if (item.kind === "armor" && properties.includes("shield") && slot !== "offhand") return { code: "invalid_equipment_slot", message: "A shield occupies the offhand slot." };
  if (item.kind === "armor" && !properties.includes("shield") && !["armor", "head", "feet", "accessory"].includes(slot)) return { code: "invalid_equipment_slot", message: "That armor cannot occupy the requested slot." };
  if (properties.includes("two-handed") && slot !== "mainhand") return { code: "two_handed_conflict", message: "A two-handed weapon must occupy the mainhand slot." };
  return null;
}

function equipmentConflict(inventory: EngineInventoryItem[], item: EngineInventoryItemView, slot: EngineEquipmentSlot, itemId: string): InventoryIssue | null {
  const properties = normalizedProperties(item);
  const equipped = inventory.filter((candidate) => candidate.equipped && candidate.id !== itemId);
  const offhand = equipped.find((candidate) => candidate.slot === "offhand");
  const mainhand = equipped.find((candidate) => candidate.slot === "mainhand");
  if (slot === "mainhand" && properties.includes("two-handed") && offhand) return { code: "two_handed_conflict", message: "Unequip the offhand before wielding a two-handed weapon." };
  if (slot === "offhand" && mainhand) {
    const mainView = materializeInventoryItem(mainhand);
    if (normalizedProperties(mainView).includes("two-handed")) return { code: "two_handed_conflict", message: "A two-handed weapon occupies both hands." };
  }
  return null;
}

function addInventory(inventory: EngineInventoryItem[], item: EngineInventoryItem): void {
  const existing = inventory.find((candidate) => candidate.id === item.id && !candidate.equipped);
  if (existing) existing.quantity += item.quantity;
  else inventory.push(item);
}

function formatCurrency(copper: number): string {
  const parts = currencyFromCopper(copper);
  const labels: string[] = [];
  if (parts.platinum) labels.push(parts.platinum + " pp");
  if (parts.gold) labels.push(parts.gold + " gp");
  if (parts.electrum) labels.push(parts.electrum + " ep");
  if (parts.silver) labels.push(parts.silver + " sp");
  if (parts.copper || !labels.length) labels.push(parts.copper + " cp");
  return labels.join(" ");
}

function emptyTurnBudget(movementFeet = 0): EngineTurnBudget {
  return {
    profile: "srd-2014-single-actor",
    action: { available: true, spent: false },
    bonusAction: { available: true, spent: false },
    reaction: { available: true, spent: false },
    movementFeet: { available: Math.max(0, Math.trunc(movementFeet)), spent: 0 },
  };
}

function normalizeTurnBudget(value: unknown, movementFeet = 0): EngineTurnBudget {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<EngineTurnBudget>
    : {};
  const slot = (candidate: unknown, legacySpent = false): EngineTurnBudgetSlot => {
    const source = candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Partial<EngineTurnBudgetSlot>
      : {};
    const spent = typeof source.spent === "boolean" ? source.spent : legacySpent;
    return { available: !spent, spent };
  };
  const movement = raw.movementFeet && typeof raw.movementFeet === "object" && !Array.isArray(raw.movementFeet)
    ? raw.movementFeet as Partial<EngineMovementBudget>
    : {};
  const available = typeof movement.available === "number"
    ? Math.max(0, Math.trunc(movement.available))
    : Math.max(0, Math.trunc(movementFeet));
  const spent = typeof movement.spent === "number"
    ? Math.max(0, Math.min(available, Math.trunc(movement.spent)))
    : 0;
  return {
    profile: "srd-2014-single-actor",
    action: slot(raw.action, Boolean((value as { actionUsed?: unknown } | null)?.actionUsed)),
    bonusAction: slot(raw.bonusAction, Boolean((value as { bonusActionUsed?: unknown } | null)?.bonusActionUsed)),
    reaction: slot(raw.reaction, Boolean((value as { reactionUsed?: unknown } | null)?.reactionUsed)),
    movementFeet: { available, spent },
  };
}

function spendTurnSlot(budget: EngineTurnBudget, slot: "action" | "bonusAction" | "reaction"): void {
  budget[slot] = { available: false, spent: true };
}

function resetTurnBudget(budget: EngineTurnBudget, movementFeet: number): void {
  budget.action = { available: true, spent: false };
  budget.bonusAction = { available: true, spent: false };
  budget.reaction = { available: true, spent: false };
  budget.movementFeet = { available: Math.max(0, Math.trunc(movementFeet)), spent: 0 };
}

function emptyTacticalState(frameId = "none"): EngineCombatTacticalState {
  return {
    geometry: {
      frameId,
      revision: 1,
      metric: "five_e_simple",
      bounds: defaultTacticalBounds(1),
      obstacles: [],
      difficultTerrain: [],
    },
    movementMode: "walking",
    actorPosition: { frameId, x: 0, y: 0, z: 0 },
    actorFootprint: { width: 1, height: 1 },
    lastPlan: null,
    zones: [],
    zoneIntegrityIssue: null,
  };
}

function emptyCombat(): EngineCombat {
  return {
    status: "none",
    encounterId: null,
    encounterName: null,
    lifecycle: null,
    round: 0,
    activeActorId: null,
    turnBudget: emptyTurnBudget(),
    tactical: emptyTacticalState(),
    pendingReaction: null,
    enemies: [],
    lootClaimed: false,
    lastAction: null,
  };
}

function normalizeCombat(combat: EngineCombat | null | undefined, actorId = "actor", movementFeet = 30, campaignVersion = 0): EngineCombat {
  if (!combat || !Array.isArray(combat.enemies)) return emptyCombat();
  const legacyEnemies = combat.enemies as Array<Partial<EngineCombatant>>;
  if (legacyEnemies.some((enemy) => !enemy.id || !enemy.contentKey || !enemy.packHash)) {
    return {
      ...emptyCombat(),
      status: combat.status === "none" ? "none" : "ended",
      encounterId: combat.encounterId ?? null,
      encounterName: combat.encounterName ?? null,
      lastAction: "legacy_encounter_requires_explicit_repin",
      turnBudget: normalizeTurnBudget(combat.turnBudget, movementFeet),
      pendingReaction: null,
    };
  }
  const maxDistanceCells = Math.max(1, ...legacyEnemies.map((enemy) => Math.max(1, Math.ceil(Number(enemy.distanceFeet ?? 5) / TACTICAL_CELL_FEET))));
  const round = Math.max(0, combat.round ?? 0);
  const status = combat.status ?? "none";
  const tactical = normalizeCombatTactical(combat.tactical, combat.encounterId ?? "legacy", actorId, maxDistanceCells, round, campaignVersion, status);
  const enemies = legacyEnemies.map((enemy, index) => {
    const position = isTacticalPosition(enemy.position) && enemy.position.frameId === tactical.geometry.frameId
      ? { ...enemy.position }
      : {
          frameId: tactical.geometry.frameId,
          x: tactical.actorPosition.x + Math.max(1, Math.ceil(Number(enemy.distanceFeet ?? 5) / TACTICAL_CELL_FEET)) + index,
          y: tactical.actorPosition.y,
          z: 0,
        };
    const footprint = normalizeFootprint(enemy.footprint);
    return {
      id: enemy.id as string,
      contentKey: enemy.contentKey as string,
      packHash: enemy.packHash as string,
      hp: Math.max(0, Math.trunc(enemy.hp ?? 0)),
      alive: Boolean(enemy.alive) && (enemy.hp ?? 0) > 0,
      position,
      footprint,
      distanceFeet: 0,
      conditions: Array.isArray(enemy.conditions) ? enemy.conditions : [],
      reaction: {
        available: !Boolean(enemy.reaction?.spent),
        spent: Boolean(enemy.reaction?.spent),
      },
      actionResources: normalizeActionResources(enemy.actionResources),
      progression: normalizeCombatantProgression(enemy.progression),
    } satisfies EngineCombatant;
  });
  syncDerivedCombatDistances(tactical, enemies);
  return {
    status,
    encounterId: combat.encounterId ?? null,
    encounterName: combat.encounterName ?? null,
    lifecycle: normalizeEncounterLifecycle(combat.lifecycle),
    round,
    activeActorId: combat.activeActorId ?? null,
    turnBudget: normalizeTurnBudget(combat.turnBudget, movementFeet),
    tactical,
    pendingReaction: normalizePendingReaction(combat.pendingReaction),
    enemies,
    lootClaimed: combat.lootClaimed ?? false,
    lastAction: combat.lastAction ?? null,
  };
}

function isTacticalPosition(value: unknown): value is EngineTacticalPosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const position = value as Partial<EngineTacticalPosition>;
  return typeof position.frameId === "string"
    && Number.isInteger(position.x)
    && Number.isInteger(position.y)
    && Number.isInteger(position.z);
}

function normalizeFootprint(value: unknown): EngineTacticalFootprint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { width: 1, height: 1 };
  const footprint = value as Partial<EngineTacticalFootprint>;
  return {
    width: Number.isInteger(footprint.width) && footprint.width! >= 1 && footprint.width! <= 2 ? footprint.width! : 1,
    height: Number.isInteger(footprint.height) && footprint.height! >= 1 && footprint.height! <= 2 ? footprint.height! : 1,
  };
}

function normalizeEncounterLifecycle(value: unknown): EngineEncounterLifecycle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EngineEncounterLifecycle>;
  if (candidate.profile !== "guards-surrender-v1") return null;
  const rawSurprise = (candidate.surprise && typeof candidate.surprise === "object" ? candidate.surprise : {}) as Partial<EngineEncounterLifecycle["surprise"]>;
  const rawInitiative = (candidate.initiative && typeof candidate.initiative === "object" ? candidate.initiative : {}) as Partial<EngineEncounterLifecycle["initiative"]>;
  const rawMorale = (candidate.morale && typeof candidate.morale === "object" ? candidate.morale : {}) as Partial<EngineEncounterLifecycle["morale"]>;
  const entries = Array.isArray(rawInitiative.entries)
    ? rawInitiative.entries.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const raw = entry as Partial<EngineEncounterInitiativeEntry>;
        if (typeof raw.actorId !== "string" || !raw.actorId) return [];
        const roll = typeof raw.roll === "number" && Number.isInteger(raw.roll) ? Math.max(1, Math.min(20, raw.roll)) : 1;
        const modifier = typeof raw.modifier === "number" && Number.isInteger(raw.modifier) ? raw.modifier : 0;
        const total = typeof raw.total === "number" && Number.isInteger(raw.total) ? raw.total : roll + modifier;
        return [{
          actorId: raw.actorId,
          roll,
          modifier,
          total,
          tieBreaker: typeof raw.tieBreaker === "string" ? raw.tieBreaker : raw.actorId,
          surprised: Boolean(raw.surprised),
        } satisfies EngineEncounterInitiativeEntry];
      })
    : [];
  const order = Array.isArray(rawInitiative.order)
    ? rawInitiative.order.filter((actorId): actorId is string => typeof actorId === "string" && actorId.length > 0)
    : entries.map((entry) => entry.actorId);
  const offers = Array.isArray(rawMorale.offers)
    ? rawMorale.offers.flatMap((offer) => {
        if (!offer || typeof offer !== "object") return [];
        const raw = offer as Partial<EngineEncounterSurrenderOffer>;
        if (typeof raw.id !== "string" || typeof raw.targetId !== "string") return [];
        const status = ["offered", "accepted", "rejected", "pursued", "captured"].includes(raw.status ?? "")
          ? raw.status as EngineEncounterSurrenderOffer["status"]
          : "offered";
        return [{
          id: raw.id,
          targetId: raw.targetId,
          reason: "ally-fallen",
          thresholdRatio: 0.5,
          status,
          sourceVersion: typeof raw.sourceVersion === "number" && Number.isInteger(raw.sourceVersion) ? raw.sourceVersion : 0,
        } satisfies EngineEncounterSurrenderOffer];
      })
    : [];
  const phase = ["pre-combat", "active", "resolving", "terminal"].includes(candidate.phase ?? "")
    ? candidate.phase as EngineEncounterLifecycle["phase"]
    : "active";
  const outcome = ["killed", "surrendered", "captured", "escaped", "player_surrendered"].includes(candidate.outcome ?? "")
    ? candidate.outcome as EngineEncounterOutcome
    : null;
  const evidence = rawSurprise.evidence && typeof rawSurprise.evidence === "object"
    ? rawSurprise.evidence as EngineEncounterApproachEvidence
    : null;
  return {
    profile: "guards-surrender-v1",
    phase,
    surprise: {
      eligible: Boolean(rawSurprise.eligible),
      consumed: Boolean(rawSurprise.consumed),
      source: rawSurprise.source === "stealth-perception-v1" ? "stealth-perception-v1" : "compatibility-default",
      evidence,
    },
    initiative: {
      formulaRevision: "initiative-v1",
      entries,
      order,
      activeIndex: typeof rawInitiative.activeIndex === "number" && Number.isInteger(rawInitiative.activeIndex) ? Math.max(0, rawInitiative.activeIndex) : 0,
      rolledAtVersion: typeof rawInitiative.rolledAtVersion === "number" && Number.isInteger(rawInitiative.rolledAtVersion) ? rawInitiative.rolledAtVersion : 0,
    },
    morale: {
      policy: "guards-surrender-v1",
      thresholdRatio: 0.5,
      offers,
      lastTriggerId: typeof rawMorale.lastTriggerId === "string" ? rawMorale.lastTriggerId : null,
    },
    objective: {
      id: "resolve-without-killing",
      status: candidate.objective?.status === "succeeded" || candidate.objective?.status === "failed" ? candidate.objective.status : "pending",
    },
    outcome,
    outcomeId: typeof candidate.outcomeId === "string" ? candidate.outcomeId : null,
    claimedRewards: Array.isArray(candidate.claimedRewards) ? candidate.claimedRewards.filter((key): key is string => typeof key === "string") : [],
    nonlethalDefeatIds: Array.isArray(candidate.nonlethalDefeatIds) ? candidate.nonlethalDefeatIds.filter((id): id is string => typeof id === "string") : [],
    retreatPlanRevision: typeof candidate.retreatPlanRevision === "number" && Number.isInteger(candidate.retreatPlanRevision) ? candidate.retreatPlanRevision : null,
  };
}

function normalizeCombatTactical(
  value: unknown,
  encounterId: string,
  actorId: string,
  maxDistanceCells: number,
  currentRound: number,
  campaignVersion: number,
  combatStatus: EngineCombat["status"],
): EngineCombatTacticalState {
  const fallback = emptyTacticalState(encounterId);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = value as Partial<EngineCombatTacticalState>;
  const fallbackWithIntegrity = (): EngineCombatTacticalState => {
    const persistedIssue = normalizeTacticalZoneIntegrityIssue(candidate.zoneIntegrityIssue);
    const hadZoneState = candidate.zones !== undefined
      && candidate.zones !== null
      && (!Array.isArray(candidate.zones) || candidate.zones.length > 0);
    return {
      ...fallback,
      zoneIntegrityIssue: persistedIssue
        ?? (hadZoneState ? tacticalZoneIntegrityIssue("invalid_tactical_zone_shape") : null),
    };
  };
  const rawGeometry = candidate.geometry && typeof candidate.geometry === "object" && !Array.isArray(candidate.geometry)
    ? candidate.geometry as Partial<EngineTacticalGeometry>
    : {};
  const frameId = typeof rawGeometry.frameId === "string" && rawGeometry.frameId.trim() ? rawGeometry.frameId : encounterId;
  const rawBounds = rawGeometry.bounds && typeof rawGeometry.bounds === "object" && !Array.isArray(rawGeometry.bounds)
    ? rawGeometry.bounds as Partial<EngineTacticalBounds>
    : {};
  const geometry: EngineTacticalGeometry = {
    frameId,
    revision: Number.isInteger(rawGeometry.revision) && rawGeometry.revision! >= 1 ? rawGeometry.revision! : 1,
    metric: "five_e_simple",
    bounds: {
      minX: Number.isInteger(rawBounds.minX) ? rawBounds.minX! : defaultTacticalBounds(maxDistanceCells).minX,
      maxX: Number.isInteger(rawBounds.maxX) ? rawBounds.maxX! : defaultTacticalBounds(maxDistanceCells).maxX,
      minY: Number.isInteger(rawBounds.minY) ? rawBounds.minY! : defaultTacticalBounds(maxDistanceCells).minY,
      maxY: Number.isInteger(rawBounds.maxY) ? rawBounds.maxY! : defaultTacticalBounds(maxDistanceCells).maxY,
    },
    obstacles: Array.isArray(rawGeometry.obstacles) ? rawGeometry.obstacles.flatMap((entry) => normalizeTacticalRectangle(entry)) : [],
    difficultTerrain: Array.isArray(rawGeometry.difficultTerrain)
      ? rawGeometry.difficultTerrain.flatMap((entry) => normalizeTacticalTerrain(entry))
      : [],
  };
  if (validateTacticalGeometry(geometry)) return fallbackWithIntegrity();
  const actorPosition = isTacticalPosition(candidate.actorPosition) && candidate.actorPosition.frameId === frameId && candidate.actorPosition.z === 0
    ? { ...candidate.actorPosition }
    : { frameId, x: 0, y: 0, z: 0 };
  if (positionFitsGeometry(actorPosition, normalizeFootprint(candidate.actorFootprint), geometry, [])) return fallbackWithIntegrity();
  const normalizedZones = normalizeTacticalZones(candidate.zones, actorId, geometry, currentRound, campaignVersion, combatStatus);
  return {
    geometry,
    movementMode: "walking",
    actorPosition,
    actorFootprint: normalizeFootprint(candidate.actorFootprint),
    lastPlan: normalizeMovementPlan(candidate.lastPlan, actorId, geometry.revision, frameId),
    zones: normalizedZones.zones,
    zoneIntegrityIssue: normalizedZones.integrityIssue ?? normalizeTacticalZoneIntegrityIssue(candidate.zoneIntegrityIssue),
  };
}

function normalizeTacticalZones(
  value: unknown,
  actorId: string,
  geometry: EngineTacticalGeometry,
  currentRound: number,
  campaignVersion: number,
  combatStatus: EngineCombat["status"],
): { zones: EngineTacticalZone[]; integrityIssue: EngineTacticalZoneIntegrityIssue | null } {
  if (value === undefined || value === null) return { zones: [], integrityIssue: null };
  if (!Array.isArray(value)) {
    return { zones: [], integrityIssue: tacticalZoneNormalizationIssue({}, actorId, campaignVersion) };
  }
  let integrityIssue: EngineTacticalZoneIntegrityIssue | null = null;
  const zoneIds = new Set<string>();
  const activeDefinitionKeys = new Set<EngineTacticalZoneDefinitionKey>();
  const zones = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      integrityIssue ??= tacticalZoneNormalizationIssue({}, actorId, campaignVersion);
      return [];
    }
    const raw = entry as Partial<EngineTacticalZone>;
    const definition = typeof raw.definitionKey === "string"
      ? reviewedTacticalZoneDefinition(raw.definitionKey)
      : null;
    if (
      raw.version !== 1
      || !definition
      || typeof raw.id !== "string"
      || !raw.id.trim()
      || !raw.source
      || raw.source.actorId !== actorId
      || raw.source.ref !== `actor:${actorId}`
      || !raw.anchor
      || !raw.shape
      || raw.shape.kind !== "circle"
      || raw.shape.radiusFeet !== definition.radiusFeet
      || !Number.isInteger(raw.geometryRevision)
      || raw.geometryRevision! < 1
      || !raw.duration
      || raw.duration.kind !== "rounds"
      || raw.duration.amount !== definition.durationRounds
      || !Number.isInteger(raw.duration.startedRound)
      || raw.duration.startedRound < 0
      || (raw.status === "active" && combatStatus !== "active")
      || (raw.status === "active" && raw.duration.startedRound > currentRound)
      || (raw.status === "active" && raw.duration.expiresAtRound <= currentRound)
      || raw.duration.expiresAtRound !== raw.duration.startedRound + definition.durationRounds
      || !isTacticalPosition(raw.currentCenter)
      || raw.currentCenter.frameId !== geometry.frameId
      || raw.currentCenter.z !== 0
      || Boolean(tacticalAimIssue(raw.currentCenter, geometry))
      || !Array.isArray(raw.affectedActorIds)
      || !Array.isArray(raw.activeEffectIds)
      || !["active", "expired", "removed"].includes(raw.status ?? "")
      || !Number.isInteger(raw.revision)
      || raw.revision! < 0
      || !raw.provenance
      || typeof raw.provenance.sourceCommandId !== "string"
      || !raw.provenance.sourceCommandId.trim()
      || !Number.isInteger(raw.provenance.sourceVersion)
      || raw.provenance.sourceVersion < 0
      || raw.provenance.sourceVersion > campaignVersion
      || !installedTacticalZoneRulesVersion(raw.provenance.rulesVersion)
      || raw.provenance.definitionRevision !== "tactical-zones-v1"
    ) {
      integrityIssue ??= tacticalZoneNormalizationIssue(raw, actorId, campaignVersion);
      return [];
    }
    if (definition.anchorKind === "stationary") {
      if (raw.anchor.kind !== "stationary" || !isTacticalPosition(raw.anchor.position) || tacticalAimIssue(raw.anchor.position, geometry)) {
        integrityIssue ??= tacticalZoneNormalizationIssue(raw, actorId, campaignVersion);
        return [];
      }
    } else if (raw.anchor.kind !== "actor" || raw.anchor.actorId !== actorId) {
      integrityIssue ??= tacticalZoneNormalizationIssue(raw, actorId, campaignVersion);
      return [];
    }
    const endedReason = raw.endedReason === "expired"
      || raw.endedReason === "source-dead"
      || raw.endedReason === "encounter-ended"
      ? raw.endedReason
      : null;
    if (raw.status === "active" && endedReason !== null) {
      integrityIssue ??= tacticalZoneNormalizationIssue(raw, actorId, campaignVersion);
      return [];
    }
    if (raw.status !== "active" && endedReason === null) {
      integrityIssue ??= tacticalZoneNormalizationIssue(raw, actorId, campaignVersion);
      return [];
    }
    if (
      zoneIds.has(raw.id)
      || (raw.status === "active" && activeDefinitionKeys.has(definition.key))
    ) {
      integrityIssue ??= tacticalZoneIntegrityIssue("invalid_tactical_zone_shape");
      return [];
    }
    zoneIds.add(raw.id);
    if (raw.status === "active") activeDefinitionKeys.add(definition.key);
    return [{
      version: 1,
      id: raw.id,
      definitionKey: definition.key,
      source: { actorId, ref: `actor:${actorId}` },
      anchor: raw.anchor.kind === "stationary"
        ? { kind: "stationary", position: { ...raw.anchor.position } }
        : { kind: "actor", actorId },
      shape: { kind: "circle", radiusFeet: definition.radiusFeet },
      geometryRevision: raw.geometryRevision!,
      duration: {
        kind: "rounds",
        amount: definition.durationRounds,
        startedRound: raw.duration.startedRound,
        expiresAtRound: raw.duration.expiresAtRound,
      },
      currentCenter: { ...raw.currentCenter },
      affectedActorIds: [...new Set(raw.affectedActorIds.filter((id): id is string => typeof id === "string"))].sort(),
      activeEffectIds: [...new Set(raw.activeEffectIds.filter((id): id is string => typeof id === "string"))].sort(),
      status: raw.status!,
      endedReason,
      revision: raw.revision!,
      provenance: {
        sourceCommandId: raw.provenance.sourceCommandId,
        sourceVersion: raw.provenance.sourceVersion,
        rulesVersion: raw.provenance.rulesVersion,
        definitionRevision: "tactical-zones-v1",
      },
    } satisfies EngineTacticalZone];
  });
  return { zones, integrityIssue };
}

function tacticalZoneNormalizationIssue(
  zone: Partial<EngineTacticalZone>,
  actorId: string,
  campaignVersion: number,
): EngineTacticalZoneIntegrityIssue {
  const provenance = zone.provenance;
  return tacticalZoneIntegrityIssue(
    !zone.source
      || zone.source.actorId !== actorId
      || zone.source.ref !== `actor:${actorId}`
      || !provenance
      || typeof provenance.sourceCommandId !== "string"
      || !provenance.sourceCommandId.trim()
      || !Number.isInteger(provenance.sourceVersion)
      || provenance.sourceVersion < 0
      || provenance.sourceVersion > campaignVersion
      || !installedTacticalZoneRulesVersion(provenance.rulesVersion)
      ? "invalid_tactical_zone_source"
      : "invalid_tactical_zone_shape",
  );
}

function tacticalZoneIntegrityIssue(
  code: EngineTacticalZoneIntegrityIssue["code"],
): EngineTacticalZoneIntegrityIssue {
  if (code === "invalid_tactical_zone_source") {
    return {
      code,
      message: "A persisted tactical zone has an invalid source; commands are disabled until the state is repaired.",
    };
  }
  if (code === "invalid_tactical_zone_effect") {
    return {
      code,
      message: "A persisted tactical-zone effect does not match its reviewed producer; commands are disabled until the state is repaired.",
    };
  }
  return {
    code,
    message: "A persisted tactical zone has an invalid reviewed shape or anchor; commands are disabled until the state is repaired.",
  };
}

function normalizeTacticalZoneIntegrityIssue(value: unknown): EngineTacticalZoneIntegrityIssue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as { code?: unknown }).code;
  return code === "invalid_tactical_zone_source"
    ? tacticalZoneIntegrityIssue(code)
    : code === "invalid_tactical_zone_shape"
      ? tacticalZoneIntegrityIssue(code)
      : code === "invalid_tactical_zone_effect"
        ? tacticalZoneIntegrityIssue(code)
      : null;
}

function normalizeTacticalRectangle(value: unknown): EngineTacticalObstacle[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = value as Partial<EngineTacticalObstacle>;
  if (typeof candidate.id !== "string" || !Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) return [];
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width = Number.isInteger(candidate.width) && candidate.width! >= 1 ? Number(candidate.width) : 1;
  const height = Number.isInteger(candidate.height) && candidate.height! >= 1 ? Number(candidate.height) : 1;
  return [{
    id: candidate.id,
    x,
    y,
    width,
    height,
  }];
}

function normalizeTacticalTerrain(value: unknown): EngineTacticalTerrain[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidate = value as Partial<EngineTacticalTerrain>;
  if (typeof candidate.id !== "string" || !Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) return [];
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const width = Number.isInteger(candidate.width) && candidate.width! >= 1 ? Number(candidate.width) : 1;
  const height = Number.isInteger(candidate.height) && candidate.height! >= 1 ? Number(candidate.height) : 1;
  const costFeet = Number.isInteger(candidate.costFeet) && candidate.costFeet! >= 5 ? Number(candidate.costFeet) : 10;
  return [{
    id: candidate.id,
    x,
    y,
    width,
    height,
    costFeet,
  }];
}

function normalizeMovementPlan(
  value: unknown,
  actorId: string,
  geometryRevision: number,
  frameId: string,
): EngineMovementPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EngineMovementPlan>;
  if (
    candidate.actorId !== actorId
    || candidate.geometryRevision !== geometryRevision
    || candidate.metric !== "five_e_simple"
    || !isTacticalPosition(candidate.from)
    || !isTacticalPosition(candidate.to)
    || candidate.from.frameId !== frameId
    || candidate.to.frameId !== frameId
    || !Array.isArray(candidate.path)
    || !Array.isArray(candidate.triggers)
    || typeof candidate.costFeet !== "number"
  ) return null;
  return {
    actorId,
    geometryRevision,
    metric: "five_e_simple",
    from: { ...candidate.from },
    to: { ...candidate.to },
    path: candidate.path.filter(isTacticalPosition).map((position) => ({ ...position })),
    costFeet: Math.max(0, Math.trunc(candidate.costFeet)),
    triggers: candidate.triggers.flatMap((trigger, index) => {
      const normalized = normalizePathTrigger(trigger, index);
      return normalized ? [normalized] : [];
    }),
  };
}

function normalizePathTrigger(value: unknown, index: number): EnginePathTrigger | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EnginePathTrigger>;
  if (
    candidate.kind !== "reach-boundary"
    || typeof candidate.enemyId !== "string"
    || !Number.isInteger(candidate.segmentIndex)
    || (candidate.boundary !== "entering-reach" && candidate.boundary !== "leaving-reach")
    || typeof candidate.distanceBeforeFeet !== "number"
    || typeof candidate.distanceAfterFeet !== "number"
  ) return null;
  const rawResolution = candidate.resolution && typeof candidate.resolution === "object"
    ? candidate.resolution
    : null;
  const resolution = rawResolution
    && ["resolved", "reaction_pending", "reaction_spent", "no_melee_attack", "total_cover"].includes(rawResolution.status)
    ? {
        status: rawResolution.status,
        actionKey: typeof rawResolution.actionKey === "string" ? rawResolution.actionKey : null,
        attackContentKey: typeof rawResolution.attackContentKey === "string" ? rawResolution.attackContentKey : null,
        reactionSpent: Boolean(rawResolution.reactionSpent),
        hit: typeof rawResolution.hit === "boolean" ? rawResolution.hit : null,
        critical: typeof rawResolution.critical === "boolean" ? rawResolution.critical : null,
        damageApplied: Math.max(0, Math.trunc(rawResolution.damageApplied ?? 0)),
        hpBefore: Math.max(0, Math.trunc(rawResolution.hpBefore ?? 0)),
        hpAfter: Math.max(0, Math.trunc(rawResolution.hpAfter ?? 0)),
      } satisfies NonNullable<EnginePathTrigger["resolution"]>
    : null;
  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : `legacy:${candidate.enemyId}:${candidate.segmentIndex}:${candidate.boundary}:${index}`,
    kind: "reach-boundary",
    enemyId: candidate.enemyId,
    segmentIndex: Math.max(1, Math.trunc(candidate.segmentIndex!)),
    boundary: candidate.boundary,
    reachFeet: typeof candidate.reachFeet === "number" && candidate.reachFeet > 0 ? candidate.reachFeet : TACTICAL_REACH_FEET,
    distanceBeforeFeet: Math.max(0, candidate.distanceBeforeFeet),
    distanceAfterFeet: Math.max(0, candidate.distanceAfterFeet),
    resolution,
  };
}

function normalizePendingReaction(value: unknown): EnginePendingReaction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EnginePendingReaction>;
  if (
    candidate.version !== 1
    || typeof candidate.id !== "string"
    || typeof candidate.kind !== "string"
    || candidate.trigger !== "incoming-attack-would-hit"
    || typeof candidate.sourceCommandId !== "string"
    || typeof candidate.sourceVersion !== "number"
    || typeof candidate.actorId !== "string"
    || typeof candidate.attackerId !== "string"
    || typeof candidate.targetId !== "string"
    || typeof candidate.sourceActionKey !== "string"
    || typeof candidate.attackName !== "string"
    || typeof candidate.attackRoll !== "number"
    || typeof candidate.attackTotal !== "number"
    || typeof candidate.attackBonus !== "number"
    || typeof candidate.critical !== "boolean"
    || typeof candidate.originalArmorClass !== "number"
    || typeof candidate.damageDiceCount !== "number"
    || typeof candidate.damageDieSides !== "number"
    || typeof candidate.damageBonus !== "number"
    || typeof candidate.damageType !== "string"
    || !Array.isArray(candidate.eligibleReactionIds)
    || !["offered", "accepted", "declined", "resolved"].includes(candidate.status ?? "")
    || typeof candidate.resumeToken !== "string"
  ) return null;
  return {
    version: 1,
    id: candidate.id,
    kind: candidate.kind,
    trigger: "incoming-attack-would-hit",
    sourceCommandId: candidate.sourceCommandId,
    sourceVersion: Math.max(0, Math.trunc(candidate.sourceVersion)),
    actorId: candidate.actorId,
    attackerId: candidate.attackerId,
    targetId: candidate.targetId,
    sourceActionKey: candidate.sourceActionKey,
    attackName: candidate.attackName,
    attackRoll: Math.max(1, Math.min(20, Math.trunc(candidate.attackRoll))),
    attackTotal: Math.trunc(candidate.attackTotal),
    attackBonus: Math.trunc(candidate.attackBonus),
    critical: candidate.critical,
    originalArmorClass: Math.trunc(candidate.originalArmorClass),
    damageDiceCount: Math.max(0, Math.trunc(candidate.damageDiceCount)),
    damageDieSides: Math.max(1, Math.trunc(candidate.damageDieSides)),
    damageBonus: Math.trunc(candidate.damageBonus),
    damageType: candidate.damageType,
    eligibleReactionIds: candidate.eligibleReactionIds.filter((id): id is string => typeof id === "string"),
    status: candidate.status!,
    resumeMode: candidate.resumeMode === "continue-character-turn" ? "continue-character-turn" : "finish-creature-turn",
    movementTriggerId: typeof candidate.movementTriggerId === "string" ? candidate.movementTriggerId : null,
    resumeToken: candidate.resumeToken,
  };
}

function normalizeActionResources(
  resources: Partial<EngineCombatant>["actionResources"]
): EngineCombatant["actionResources"] {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) return {};
  return Object.fromEntries(
    Object.entries(resources).flatMap(([actionKey, resource]) => {
      if (!resource || (resource.kind !== "per-day" && resource.kind !== "recharge")) return [];
      return [[actionKey, {
        kind: resource.kind,
        usesRemaining: resource.kind === "per-day"
          ? Math.max(0, Math.trunc(resource.usesRemaining ?? 0))
          : null,
        available: Boolean(resource.available),
        rechargeMinimum: resource.kind === "recharge"
          ? Math.max(2, Math.min(6, Math.trunc(resource.rechargeMinimum ?? 6)))
          : null,
        lastRechargeRound: resource.lastRechargeRound === null || resource.lastRechargeRound === undefined
          ? null
          : Math.max(0, Math.trunc(resource.lastRechargeRound)),
      }]];
    })
  );
}

function normalizeCombatantProgression(value: unknown): EngineCombatantProgression | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EngineCombatantProgression>;
  if (
    candidate.templateId !== "veteran"
    || candidate.templateVersion !== "v1"
    || typeof candidate.sourceCommandId !== "string"
    || typeof candidate.sourceVersion !== "number"
    || !candidate.base
    || !candidate.revised
    || !candidate.modifications
  ) return null;
  return {
    templateId: "veteran",
    templateVersion: "v1",
    sourceCommandId: candidate.sourceCommandId,
    sourceVersion: Math.max(0, Math.trunc(candidate.sourceVersion)),
    base: {
      maxHp: Math.max(1, Math.trunc(candidate.base.maxHp)),
      armorClass: Math.trunc(candidate.base.armorClass),
      challengeRating: Number(candidate.base.challengeRating),
      experiencePoints: candidate.base.experiencePoints === null ? null : Math.max(0, Math.trunc(candidate.base.experiencePoints ?? 0)),
    },
    revised: {
      maxHp: Math.max(1, Math.trunc(candidate.revised.maxHp)),
      armorClass: Math.trunc(candidate.revised.armorClass),
      challengeRating: Number(candidate.revised.challengeRating),
      experiencePoints: candidate.revised.experiencePoints === null ? null : Math.max(0, Math.trunc(candidate.revised.experiencePoints ?? 0)),
    },
    modifications: {
      maxHp: Math.trunc(candidate.modifications.maxHp),
      armorClass: Math.trunc(candidate.modifications.armorClass),
      attackBonus: Math.trunc(candidate.modifications.attackBonus),
      damageBonus: Math.trunc(candidate.modifications.damageBonus),
    },
  };
}

function createCombatants(
  contentKey: string,
  count: number,
  distanceFeet = 5,
  frameId = "legacy",
  positionBase?: EngineTacticalPosition,
): EngineCombatant[] {
  return Array.from({ length: count }, (_, index) => {
    const position = positionBase
      ? { ...positionBase, y: positionBase.y + index }
      : {
          frameId,
          x: Math.max(1, Math.ceil(Math.max(0, distanceFeet) / TACTICAL_CELL_FEET)) + index,
          y: 0,
          z: 0,
        };
    return createOpen5eCombatant(contentKey, randomUUID(), distanceFeet, position);
  });
}

function describeCombatants(combatants: EngineCombatant[]): string {
  const counts = new Map<string, { name: string; count: number }>();
  for (const combatant of materializeCombatants(combatants)) {
    const current = counts.get(combatant.contentKey) ?? { name: combatant.name, count: 0 };
    current.count += 1;
    counts.set(combatant.contentKey, current);
  }
  return [...counts.values()]
    .map(({ name, count }) => count === 1 ? `One ${name}` : `${count} ${name}`)
    .join(", ");
}

function materializeSpellcasting(
  character: EngineCharacter,
  runtimeContent: RuntimeContentState | null = null,
): EngineSpellcastingView | null {
  const spellcasting = character.spellcasting;
  if (!spellcasting) return null;
  const progression = getOpen5eSpellProgression(character.className, character.classRef?.packHash);
  const levelIndex = Math.max(0, Math.min(19, character.level - 1));
  const knownSpellLimit = progression?.selectionMode === "known"
    ? progression.knownSpellLimits[levelIndex] ?? null
    : progression?.selectionMode === "spellbook" && progression.spellbook
      ? progression.spellbook.initialSpellCount
        + progression.spellbook.spellsGainedPerLevel * Math.max(0, character.level - 1)
      : null;
  const knownSpells = spellcasting.knownSpells.map((reference) => materializeSpellReference(reference, runtimeContent)).sort(compareSpellViews);
  const preparedSpells = spellcasting.preparedSpells.map((reference) => materializeSpellReference(reference, runtimeContent)).sort(compareSpellViews);
  return {
    ability: spellcasting.ability,
    spellSaveDc: spellcasting.spellSaveDc,
    spellAttackBonus: spellcasting.spellAttackBonus,
    slots: { ...spellcasting.slots },
    slotMaximums: { ...spellcasting.slotMaximums },
    slotRecovery: spellcasting.slotRecovery,
    selectionMode: progression?.selectionMode ?? null,
    knownSpellLimit,
    cantripLimit: progression?.cantripsKnown[levelIndex] ?? null,
    preparedCapacity: progression?.preparedFormula ? preparedSpellCapacity(character, progression.preparedFormula) : null,
    knownSpells,
    preparedSpells,
    concentration: spellcasting.concentration
      ? { ...materializeSpellReference(spellcasting.concentration, runtimeContent), startedRound: spellcasting.concentration.startedRound }
      : null,
  };
}

function materializeSpellReference(
  reference: EngineSpellReference,
  runtimeContent: RuntimeContentState | null = null,
): EngineSpellcastingView["knownSpells"][number] {
  const source = getOpen5eSpell(reference.contentKey, reference.packHash)
    ?? (runtimeContent ? runtimeSpellRecordFromContent(runtimeContent, reference.contentKey, reference.packHash) : null);
  if (!source || source.packHash !== reference.packHash) {
    return {
      ...reference,
      name: reference.contentKey,
      level: null,
      school: null,
      castingTime: null,
      range: null,
      concentrationRequired: null,
      mechanicsStatus: "pack-unavailable",
    };
  }
  return {
    ...reference,
    name: source.definition.name,
    level: source.definition.level,
    school: source.definition.school.name,
    castingTime: source.definition.castingTime,
    range: source.definition.range.text,
    concentrationRequired: source.definition.concentration,
    mechanicsStatus: source.effect ? "compiled-primary" : "prose-only",
  };
}

function compareSpellViews(
  left: EngineSpellcastingView["knownSpells"][number],
  right: EngineSpellcastingView["knownSpells"][number]
): number {
  return (left.level ?? 99) - (right.level ?? 99) || left.name.localeCompare(right.name);
}

function materializeCharacterSourceDetails(character: EngineCharacter): EngineCharacterSourceDetailsView {
  const species = character.speciesRef
    ? getOpen5eSpecies(character.speciesRef.contentKey, character.speciesRef.packHash)
    : null;
  const characterClass = character.classRef
    ? getOpen5eClass(character.classRef.contentKey, character.classRef.packHash)
    : null;
  const background = character.backgroundRef
    ? getOpen5eBackground(character.backgroundRef.contentKey, character.backgroundRef.packHash)
    : null;
  const alignment = character.alignmentRef
    ? getOpen5eAlignment(character.alignmentRef.contentKey, character.alignmentRef.packHash)
    : null;
  const skills = character.skillRefs
    .map((reference) => getOpen5eSkill(reference.contentKey, reference.packHash))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== null)
    .map((skill) => ({
      contentKey: skill.contentKey,
      name: skill.name,
      engineKey: skill.engineKey,
      ability: skill.ability,
      description: skill.description,
    }));
  const languages = character.languageRefs
    .map((reference) => getOpen5eLanguage(reference.contentKey, reference.packHash))
    .filter((language): language is NonNullable<typeof language> => language !== null)
    .map((language) => ({
      contentKey: language.contentKey,
      name: language.name,
      description: language.description,
      isExotic: language.isExotic,
    }));
  const features: EngineCharacterFeatureView[] = character.featureRefs.map((reference) => {
    if (characterClass && reference.contentKey === characterClass.contentKey) {
      const feature = characterClass.definition.features.find((candidate) => candidate.sourceKey === reference.featureSourceKey);
      return {
        ...reference,
        name: feature?.name ?? reference.featureSourceKey,
        description: feature?.description ?? "",
        sourceType: "class",
        sourceName: characterClass.definition.name,
      };
    }
    if (species && reference.contentKey === species.contentKey) {
      const trait = species.definition.traits.find(
        (candidate) => `${species.sourceKey}/${slugifyFeatureName(candidate.name)}` === reference.featureSourceKey
      );
      return {
        ...reference,
        name: trait?.name ?? reference.featureSourceKey,
        description: trait?.description ?? "",
        sourceType: "species",
        sourceName: species.definition.name,
      };
    }
    if (background && reference.contentKey === background.contentKey) {
      const benefit = background.definition.benefits.find(
        (candidate) => `${background.sourceKey}/${slugifyFeatureName(candidate.name)}` === reference.featureSourceKey
      );
      return {
        ...reference,
        name: benefit?.name ?? reference.featureSourceKey,
        description: benefit?.description ?? "",
        sourceType: "background",
        sourceName: background.definition.name,
      };
    }
    return unresolvedFeatureView(reference, "unknown", "Unknown source");
  });
  for (const reference of character.featRefs) {
    const feat = getOpen5eFeat(reference.contentKey, reference.packHash);
    features.push({
      ...reference,
      featureSourceKey: feat?.sourceKey ?? reference.contentKey,
      name: feat?.name ?? reference.contentKey,
      description: feat?.description ?? "",
      sourceType: feat ? "feat" : "unknown",
      sourceName: feat ? "Feat" : "Unavailable rules pack",
    });
  }
  return {
    species: species
      ? {
          contentKey: species.contentKey,
          name: species.definition.name,
          description: species.definition.description,
          traits: species.definition.traits.map((trait) => ({ name: trait.name, description: trait.description })),
        }
      : null,
    characterClass: characterClass
      ? {
          contentKey: characterClass.contentKey,
          name: characterClass.definition.name,
          description: characterClass.definition.description,
          levelOneFeatures: (characterClass.profile?.levelOneFeatures ?? []).map((feature) => {
            const source = characterClass.definition.features.find((candidate) => candidate.sourceKey === feature.sourceKey);
            return { sourceKey: feature.sourceKey, name: feature.name, description: source?.description ?? "" };
          }),
          startingEquipmentDescription: characterClass.profile?.startingEquipmentDescription ?? null,
        }
      : null,
    background: background
      ? {
          contentKey: background.contentKey,
          name: background.definition.name,
          description: background.definition.description,
          benefits: background.definition.benefits.map((benefit) => ({ ...benefit })),
        }
      : null,
    alignment: alignment
      ? { contentKey: alignment.contentKey, name: alignment.name, description: alignment.description }
      : null,
    skills,
    languages,
    features,
  };
}

function unresolvedFeatureView(
  reference: EngineFeatureReference,
  sourceType: EngineCharacterFeatureView["sourceType"],
  sourceName: string
): EngineCharacterFeatureView {
  return {
    ...reference,
    name: reference.featureSourceKey,
    description: "",
    sourceType,
    sourceName,
  };
}

function characterData(
  character: EngineCharacter,
  runtimeContent: RuntimeContentState | null = null,
): EngineCharacterView {
  const carryWeight = inventoryWeight(character.inventory);
  const carryLimit = carryCapacity(character.abilities.str);
  const referencedClass = character.classRef
    ? getOpen5eClass(character.classRef.contentKey, character.classRef.packHash)
    : null;
  return {
    id: character.id,
    created: character.created,
    name: character.name,
    species: character.species,
    className: character.className,
    speciesRef: character.speciesRef,
    classRef: character.classRef,
    backgroundRef: character.backgroundRef,
    alignmentRef: character.alignmentRef,
    skillRefs: character.skillRefs,
    languageRefs: character.languageRefs,
    featureRefs: character.featureRefs,
    featRefs: character.featRefs,
    background: character.background,
    alignment: character.alignment,
    description: character.description,
    details: character.details,
    level: character.level,
    abilities: character.abilities,
    abilityModifiers: character.abilityModifiers,
    proficiencyBonus: character.proficiencyBonus,
    savingThrows: character.savingThrows,
    skills: character.skills,
    senses: character.senses,
    size: character.size,
    speed: character.speed,
    hitDie: character.hitDie,
    hitDiceRemaining: character.hitDiceRemaining,
    proficiencies: character.proficiencies,
    features: character.features,
    featureUses: character.featureUses,
    spellcasting: materializeSpellcasting(character, runtimeContent),
    hp: character.hp,
    maxHp: character.maxHp,
    lifecycleState: character.lifecycleState,
    deathRecord: character.deathRecord,
    corpseId: character.corpseId,
    ac: character.ac,
    inventory: materializeInventory(character.inventory),
    currency: character.currency,
    gold: character.gold,
    xp: character.xp,
    conditions: character.conditions,
    conditionEffects: character.conditionEffects,
    custody: character.custody ?? null,
    deathSaveSuccesses: character.deathSaveSuccesses,
    deathSaveFailures: character.deathSaveFailures,
    derived: {
      initiative: character.abilityModifiers.dex,
      passivePerception: 10 + (character.skills.perception?.bonus ?? character.abilityModifiers.wis),
      carryWeight,
      carryCapacity: carryLimit,
      encumbered: carryWeight > carryLimit,
      currencyBreakdown: currencyBreakdown(character.currency.copper),
      savingThrowProficiencies: referencedClass && character.classRef && referencedClass.packHash === character.classRef.packHash
        ? referencedClass.profile?.savingThrows ?? []
        : [],
    },
    sourceDetails: materializeCharacterSourceDetails(character),
  };
}

function combatData(combat: EngineCombat): EngineCombatView {
  const enemies = materializeCombatants(combat.enemies).map((enemy) => ({
    ...enemy,
    distanceFeet: tacticalDistanceFeet(combat, enemy),
    coverFromPlayer: deriveTacticalCover(
      combat.tactical.geometry,
      combat.tactical.actorPosition,
      combat.tactical.actorFootprint,
      enemy.position,
      enemy.footprint,
    ),
  }));
  return {
    status: combat.status,
    encounterId: combat.encounterId,
    encounterName: combat.encounterName,
    lifecycle: combat.lifecycle,
    round: combat.round,
    activeActorId: combat.activeActorId,
    turnBudget: combat.turnBudget,
    tactical: combat.tactical,
    pendingReaction: combat.pendingReaction,
    enemies,
    lootClaimed: combat.lootClaimed,
    lastAction: combat.lastAction,
  };
}

function findLiveCombatant(combat: EngineCombat, targetId?: string): EngineCombatant | null {
  if (targetId) return combat.enemies.find((enemy) => enemy.id === targetId && enemy.alive) ?? null;
  return combat.enemies.find((enemy) => enemy.alive) ?? null;
}

function firstLiveCombatantId(combat: EngineCombat): string | null {
  return combat.enemies.find((combatant) => combatant.alive)?.id ?? null;
}

function nextLiveCombatantId(combat: EngineCombat, currentId: string): string | null {
  const currentIndex = combat.enemies.findIndex((combatant) => combatant.id === currentId);
  if (currentIndex < 0) return firstLiveCombatantId(combat);
  return combat.enemies.slice(currentIndex + 1).find((combatant) => combatant.alive)?.id ?? null;
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function signed(value: number): string {
  return value >= 0 ? "+ " + value : "- " + Math.abs(value);
}

function applyRuntimeEffect(
  state: LanternCampaignState,
  input: EffectApplyInput,
  changes?: Array<{ path: string; before: unknown; after: unknown }>
): { effect: EngineEffectInstance; decision: "applied" | "ignored" | "replaced" } {
  const before = state.effects;
  const result = applyEffect(before, input);
  state.effects = result.effects.map((effect) => effect.id === result.effect.id && effect.duration.kind === "fixed"
    ? { ...effect, startTimeMinutes: state.time.gameTime.totalMinutes }
    : effect);
  syncConditionProjections(state);
  if (changes && JSON.stringify(before) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before, after: state.effects });
  }
  return { effect: result.effect, decision: result.decision };
}

function effectInput(
  state: LanternCampaignState,
  definitionKey: string,
  sourceRef: string,
  targetRefs: string[],
  operations: EngineEffectOperation[],
  duration: EngineEffectDuration = { kind: "persistent" },
  stackingKey = definitionKey,
  stackingRule: EngineEffectInstance["stackingRule"] = "ignore",
  clearedBy: EngineEffectInstance["clearedBy"] = ["never"],
  sourceCommandId: string | null = null
): EffectApplyInput {
  return {
    definitionKey,
    sourceRef,
    targetRefs,
    operations,
    startAnchor: { kind: "campaign-round", round: state.combat.round },
    duration,
    stackingKey,
    stackingRule,
    clearedBy,
    provenance: {
      sourceContentKey: null,
      sourceCommandId,
      rulesVersion: state.rulesVersion,
      formulaRevision: "effects-conditions-v1",
    },
  };
}

function applyConditionRuntimeEffect(
  state: LanternCampaignState,
  condition: string,
  sourceRef: string,
  targetRef: string,
  duration: EngineEffectDuration = { kind: "persistent" },
  stackingKey = `condition:${normalizeCondition(condition)}`,
  clearedBy: EngineEffectInstance["clearedBy"] = ["never"],
  sourceCommandId: string | null = null,
  changes?: Array<{ path: string; before: unknown; after: unknown }>
): { effect: EngineEffectInstance; decision: "applied" | "ignored" | "replaced" } {
  const normalized = normalizeCondition(condition);
  const operations: EngineEffectOperation[] = [
    { kind: "condition", condition: normalized, action: "apply" },
  ];
  if (normalized === "poisoned") {
    operations.push(
      { kind: "disadvantage", category: "attack-roll" },
      { kind: "disadvantage", category: "ability-check" },
    );
  }
  return applyRuntimeEffect(
    state,
    effectInput(state, `condition:${normalized}`, sourceRef, [targetRef], operations, duration, stackingKey, "ignore", clearedBy, sourceCommandId),
    changes
  );
}

function removeRuntimeCondition(
  state: LanternCampaignState,
  targetRef: string,
  condition: string,
  changes?: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const before = state.effects;
  state.effects = removeConditionEffects(before, targetRef, condition);
  syncConditionProjections(state);
  if (changes && JSON.stringify(before) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before, after: state.effects });
  }
}

function removeRuntimeSource(
  state: LanternCampaignState,
  sourceRef: string,
  changes?: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const before = state.effects;
  state.effects = removeEffectsBySource(before, sourceRef);
  syncConditionProjections(state);
  if (changes && JSON.stringify(before) !== JSON.stringify(state.effects)) {
    changes.push({ path: "/effects", before, after: state.effects });
  }
  const beforeActors = state.controlledActors;
  const now = state.time.gameTime.totalMinutes;
  state.controlledActors = state.controlledActors.map((actor) => actor.status === "active" && actor.sourceRef === sourceRef
    ? { ...actor, status: "expired", terminalAtMinutes: now, commandedThisTurn: false }
    : actor);
  if (changes && JSON.stringify(beforeActors) !== JSON.stringify(state.controlledActors)) {
    changes.push({ path: "/controlledActors", before: beforeActors, after: state.controlledActors });
  }
}

function hasRuntimeCondition(state: LanternCampaignState, actorId: string, condition: string): boolean {
  return hasActiveCondition(state.effects, actorId, condition)
    || (actorId === state.character.id && state.character.conditions.some((candidate) => normalizeCondition(candidate) === normalizeCondition(condition)));
}

function messageKindForOutcome(outcome: string): EngineMessage["kind"] {
  if (outcome.includes("check") || outcome.includes("social") || outcome === "success" || outcome === "failure" || outcome.includes("save")) return "roll";
  return "narration";
}

function makeMessage(kind: EngineMessage["kind"], text: string): EngineMessage {
  return { id: randomUUID(), kind, text, createdAt: new Date().toISOString() };
}

function rulesNarration(text: string, suggestedActions: NarrationEnvelope["suggestedActions"] = []): NarrationEnvelope {
  return { text, proposedFacts: [], suggestedActions };
}
