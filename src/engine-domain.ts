import { createHash, randomInt, randomUUID } from "node:crypto";
import type { NarrationEnvelope } from "./ai-contracts.js";
import {
  engineExperienceProfileInputSchema,
  engineExperienceProfileSchema,
  engineWorldObjectInputSchema,
} from "./engine-contracts.js";
import type {
  CompiledCreatureAttack,
  CompiledEffectProgram,
  CompiledSpellEffect,
  NormalizedSpell,
} from "./content/schema.js";
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
  EngineKnowledgeRecord,
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
  EngineTacticalFootprint,
  EngineTacticalGeometry,
  EngineTacticalGeometryInput,
  EngineTacticalObstacle,
  EngineTacticalPosition,
  EngineTacticalTerrain,
  EngineCombatTacticalState,
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
  EngineEffectDuration,
  EngineEffectOperation,
  EngineEquipmentSlot,
  EngineImprovEffect,
  EngineInventoryItem,
  EngineInventoryItemView,
  EngineItemProvenance,
  EngineWeaponAttack,
  EngineMerchant,
  EngineMerchantPatch,
  EngineMerchantPatchOperations,
  EngineMerchantView,
  EngineNpc,
  EngineNpcPatch,
  EngineNpcPatchOperations,
  EngineMessage,
  EngineQuest,
  EngineResolution,
  EngineSessionView,
  EngineSpellReference,
  EngineSpellcastingView,
  EngineToolName,
  EngineWorldContextView,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";
import type { EffectApplyInput } from "./engine-effects.js";
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
  actorCheck?: { ability: EngineAbility; skill: string };
  opposed?: { ability: EngineAbility; skill: string };
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

function buildAdjudicationDecision(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineChallengeAttemptCommand,
  definition: ChallengeDefinition
): EngineAdjudicationDecision {
  const sceneId = command.sceneId?.trim() || state.worldContext?.id || "campaign-scene";
  const selectedDifficultyBand = state.experienceProfile.difficulty;
  const requestedStakes = [...new Set(command.requestedStakes ?? [])];
  return {
    id: clientCommandId,
    actorId: context.actorId,
    challengeId: definition.id,
    sceneId,
    goal: command.goal.trim(),
    approach: normalizeApproach(command.approach),
    approachHash: challengeApproachHash(context.actorId, definition.id, sceneId, command.approach, command.factId),
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
    ...(command.tool ? { tool: command.tool } : {}),
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
      && attempt.attemptVersion === state.version
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
  const fullData = { ability: actorCheck.ability, skill: actorCheck.skill, goal: command.goal, roll, modifier: derived.modifier, total, opponentId, opponentRoll, opponentModifier, opponentTotal, success, adjudication: decision, costs: decision.costs, outcome };
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    text,
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
    [{ path: "/lastRoll", before: state.lastRoll, after: roll }, attemptChange],
    [],
    decision,
    check
  );
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

  const checkCommand = {
    kind: "roll_check" as const,
    ability: (definition.actorCheck?.ability ?? "str") as EngineAbility,
    skill: definition.actorCheck?.skill ?? "athletics",
    goal: command.goal,
  };
  const result = resolveCheck(
    state,
    context,
    clientCommandId,
    checkCommand,
    tool,
    definition.actorCheck?.ability ?? "str",
    definition.actorCheck?.skill ?? "athletics",
    command.goal,
    decision,
    command
  );
  return definition.id === "search-hidden-fact-v1" && searchFact
    ? applySearchDiscoveryResolution(result, context.actorId, searchFact)
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
        if (!["rest-interruption", "effect-expiry", "world-clock", "quest-deadline"].includes(event.kind)) return [];
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
    phase: "character_creation",
    tutorialStep: 0,
    characterCreation: { abilityScoreDraft: null },
    advancementPolicy: defaultAdvancementPolicy(),
    pendingAdvancement: null,
    time: defaultTimeState(),
    worldContext: null,
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
    worldFacts?: unknown;
    worldObjects?: unknown;
    actorKnowledge?: unknown;
    time?: unknown;
  };
  next.time = normalizeTimeState(next.time);
  if (!next.campaign) next.campaign = defaultCampaignProfile();
  next.contentPolicy = normalizeContentPolicy(next.contentPolicy ?? defaultContentPolicy());
  next.experienceProfile = normalizeExperienceProfile(next.experienceProfile, next.updatedAt);
  next.adjudicationHistory = Array.isArray(next.adjudicationHistory)
    ? next.adjudicationHistory.slice(-100) as EngineAdjudicationAttempt[]
    : [];
  next.worldFacts = normalizeWorldFacts(next.worldFacts);
  next.actorKnowledge = normalizeKnowledgeRecords(next.actorKnowledge);
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
    next.worldFacts = [];
    next.actorKnowledge = [];
    next.playerNotes = [];
    next.advancementPolicy = defaultAdvancementPolicy();
    next.pendingAdvancement = null;
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
  next.character = recalculateProgressionOnLoad(normalizeCharacter(next.character));
  next.combat = normalizeCombat(next.combat, next.actorId, next.character.speed);
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
    }];
  });
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

export function toSessionView(state: LanternCampaignState): EngineSessionView {
  const projection = actorKnowledgeProjection(state.actorId, state);
  const sandboxActions = ["observe", "listen", "roll"];
  const advancementActions = state.pendingAdvancement?.status === "pending" ? ["advancement_confirm"] : [];
  const combatActions = state.combat.status === "active"
    ? state.combat.pendingReaction
      ? ["reaction_response:accept", "reaction_response:decline"]
      : state.combat.lifecycle?.phase === "resolving" && state.combat.activeActorId === state.actorId
      ? ["encounter_decision:accept_surrender", "encounter_decision:reject_surrender", "encounter_decision:capture", "encounter_decision:retreat", "encounter_decision:pursue", "encounter_decision:continue_attack"]
      : state.combat.activeActorId === state.actorId
      ? [
          ...(state.combat.turnBudget.movementFeet.spent < state.combat.turnBudget.movementFeet.available ? ["combat_move"] : []),
          ...(state.combat.turnBudget.action.spent ? [] : ["combat_action:attack", ...(state.combat.lifecycle ? ["combat_action:attack_nonlethal"] : []), "combat_action:dodge"]),
          ...(state.combat.turnBudget.bonusAction.spent || (state.character.featureUses.secondWind ?? 0) < 1 ? [] : ["combat_action:second_wind"]),
          "end_turn",
        ]
      : ["advance_turn"]
    : [];
  return {
    id: state.id,
    userId: state.accountId,
    version: state.version,
    rulesVersion: state.rulesVersion,
    contentPolicy: state.contentPolicy,
    campaign: state.campaign,
    experienceProfile: normalizeExperienceProfile(state.experienceProfile, state.updatedAt),
    phase: state.phase,
    tutorialStep: state.tutorialStep,
    characterCreation: state.characterCreation,
    advancementPolicy: state.advancementPolicy,
    pendingAdvancement: state.pendingAdvancement,
    time: state.time,
    characterCreated: state.character.created,
    worldContext: projection.worldContext,
    playerNotes: state.playerNotes,
    quests: state.quests,
    corpses: state.corpses,
    effects: state.effects.filter((effect) => effect.status === "active"),
    improvEffects: state.improvEffects,
    currentBeat: state.currentBeat,
    suggestedActions: state.suggestedActions,
    log: state.log.slice(-40),
    availableActions:
      state.combat.pendingReaction
        ? ["reaction_response:accept", "reaction_response:decline"]
        : state.phase === "character_creation"
        ? ["create_character"]
        : state.phase === "tutorial"
          ? ["continue"]
          : [...sandboxActions, ...advancementActions, ...combatActions],
    lastRoll: state.lastRoll,
    character: characterData(state.character) as EngineSessionView["character"],
    combat: combatData(state.combat),
    updatedAt: state.updatedAt,
  };
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
): unknown {
  const projection = actorKnowledgeProjection(state.actorId, state);
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
        worldContext: projection.worldContext,
        knowledge: projection.knowledge,
        playerNotes: state.playerNotes,
        quests: state.quests,
        corpses: state.corpses,
        effects: state.effects.filter((effect) => effect.status === "active"),
        improvEffects: state.improvEffects,
        currentBeat: state.currentBeat,
        character: characterData(state.character),
        combat: combatData(state.combat),
        quest: state.quest,
        recentLog: state.log.slice(-8),
      };
    case "observe":
      return {
        worldContext: projection.worldContext,
        campaignVersion: state.version,
        time: state.time,
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
      return characterData(state.character);
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
      return state.quest;
    case "combat_state":
      return combatData(state.combat);
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

function redactExperienceCommand(command: EngineCommand): EngineCommand {
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

export function resolveEngineCommand(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineCommand,
  tool: EngineToolName | "declare" | "listen",
  playerText?: string
): EngineResolution {
  if (
    state.character.lifecycleState === "dead"
    && command.kind !== "observe"
    && command.kind !== "world_context"
    && command.kind !== "player_note_add"
    && command.kind !== "experience_profile_update"
    && command.kind !== "experience_feedback_add"
    && command.kind !== "experience_boundary"
    && command.kind !== "campaign_beat"
    && command.kind !== "quest_create"
    && command.kind !== "quest_update"
  ) {
    return rejection(state, tool, "actor_dead", "A dead character cannot act, rest, cast, or receive ordinary healing.");
  }
  if (
    state.character.lifecycleState === "stable"
    && ["combat_action", "combat_move", "cast_spell", "move", "travel", "interact", "social_check", "merchant_trade", "equip_item", "unequip_item", "drop_item", "inventory_transfer", "improvise", "loot", "project"].includes(command.kind)
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
  switch (command.kind) {
    case "observe":
      return readOnlyResolution(state, tool, "The DM's current world context is available to you.", readToolData(state, "observe"));
    case "listen":
      return resolveCheck(state, context, clientCommandId, command, tool, "wis", "perception", playerText ?? "Listen carefully.");
    case "world_context":
      return resolveWorldContext(state, context, clientCommandId, command, tool);
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
    case "merchant_trade":
      return resolveMerchantTrade(state, context, clientCommandId, command, tool);
    case "quest_create":
      return resolveQuestCreate(state, context, clientCommandId, command, tool);
    case "quest_update":
      return resolveQuestUpdate(state, context, clientCommandId, command, tool);
    case "improvise":
      return resolveImprovise(state, context, clientCommandId, command, tool);
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
    case "end_turn":
      return resolvePlayerEndTurn(state, context, clientCommandId, command, tool);
    case "combat_start":
      return resolveCombatStart(state, context, clientCommandId, command, tool);
    case "encounter_decision":
      return resolveEncounterDecision(state, context, clientCommandId, command, tool);
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
        "You declare: " + command.goal + ". No mechanical check was required; the DM must answer with the immediate fictional consequence.",
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
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You move toward " + exit.label + ". The DM must establish the next context.",
    { exit, worldContext: state.worldContext },
    "moved",
    [],
    [],
    []
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
    "The DM establishes the current context: " + worldContext.title + ".",
    { worldContext: actorKnowledgeProjection(context.actorId, next).worldContext },
    "world_context_updated",
    [],
    [],
    stateChanges
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
  });
}

function mergeMerchantPatch(existing: EngineMerchant | undefined, patch: EngineMerchantPatch): EngineMerchant {
  return normalizeMerchant({
    id: patch.id,
    name: patch.name ?? existing?.name ?? "",
    description: patch.description ?? existing?.description ?? "",
    disposition: patch.disposition ?? existing?.disposition ?? "neutral",
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

function resolveSocialCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "social_check" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const npc = state.worldContext?.npcs.find((candidate) => candidate.id === command.npcId);
  if (!npc) return rejection(state, tool, "npc_not_found", "That NPC is not established in the current context.");
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
  const success = total >= npc.socialDc;
  const next = cloneCampaign(state);
  const nextNpc = next.worldContext?.npcs.find((candidate) => candidate.id === command.npcId);
  if (nextNpc) {
    nextNpc.relationshipScore = Math.max(-100, Math.min(100, nextNpc.relationshipScore + (success ? 5 : -2)));
  }
  const message =
    "You make a social check with " + npc.name + ": d20 " + roll + " " + signed(modifier) + " = " + total +
    " against DC " + npc.socialDc + ". " + (success ? "Success." : "Failure.");
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { npc: nextNpc ?? npc, goal: command.goal, roll, modifier, dc: npc.socialDc, total, success },
    success ? "social_success" : "social_failure",
    [
      { kind: "social_d20", value: roll, sides: 20 },
      ...(secondRoll === null ? [] : [{ kind: `social_${modifierQuery.mode}_d20`, value: secondRoll, sides: 20 }]),
    ],
    [{ name: command.ability + "_modifier", value: modifier }, { name: "social_dc", value: npc.socialDc }],
    nextNpc ? [{ path: "/worldContext/npcs/" + npc.id + "/relationshipScore", before: npc.relationshipScore, after: nextNpc.relationshipScore }] : [],
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
      informationPolicy: "public",
      formulaRevision: "checks-v1",
    }
  );
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
  const unitPrice = command.side === "offer" ? command.offerUnitPriceCopper : isBuying ? listing.buyPriceCopper : listing.sellPriceCopper;
  if (unitPrice === undefined) return rejection(state, tool, "offer_price_required", "An offer needs an explicit unit price.");
  const total = unitPrice * command.quantity;
  if (!Number.isSafeInteger(total)) return rejection(state, tool, "price_out_of_range", "That transaction is too large to resolve safely.");
  if (listing.stock >= 0 && isBuying && listing.stock < command.quantity) {
    return rejection(state, tool, "insufficient_stock", "The merchant does not have that quantity available.");
  }

  const next = cloneCampaign(state);
  const nextMerchant = next.worldContext?.merchants.find((candidate) => candidate.id === command.merchantId);
  const nextListing = nextMerchant?.items.find((candidate) => candidate.item.id === command.itemId);
  if (!nextMerchant || !nextListing) return rejection(state, tool, "merchant_not_found", "That merchant is no longer available.");
  const beforeCharacter = cloneCampaign(state).character;
  if (isBuying) {
    if (state.character.currency.copper < total) return rejection(state, tool, "insufficient_funds", "You cannot afford that purchase.");
    if (state.character.inventory.some((candidate) => candidate.id === nextListing.item.id)) {
      return rejection(state, tool, "item_instance_conflict", "That merchant instance already exists in your inventory.");
    }
    next.character.currency.copper -= total;
    syncCurrencyProjection(next.character);
    addInventory(next.character.inventory, withActorOwnership(
      { ...normalizeInventoryItem(nextListing.item), quantity: command.quantity, equipped: false },
      next.character.id,
      { kind: "merchant", sourceId: merchant.id },
    ));
    const capacityIssue = inventoryCapacityIssue(next.character.inventory, next.character);
    if (capacityIssue) return rejection(state, tool, capacityIssue.code, capacityIssue.message);
    if (nextListing.stock >= 0) nextListing.stock -= command.quantity;
  } else {
    const held = next.character.inventory.find((candidate) => candidate.id === command.itemId);
    if (!held || held.quantity < command.quantity) return rejection(state, tool, "item_not_owned", "You do not have that quantity to sell.");
    if (!isActorOwnedItem(held, next.character.id)) return rejection(state, tool, "item_not_owned", "You do not own that item.");
    if (held.equipped) return rejection(state, tool, "item_equipped", "Unequip the item before selling it.");
    const heldView = materializeInventoryItem(held);
    if (isContainerItem(heldView) && inventoryHasChildren(next.character.inventory, held.id)) {
      return rejection(state, tool, "container_not_empty", "Empty a container before selling it.");
    }
    held.quantity -= command.quantity;
    if (held.quantity <= 0) next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== held.id);
    next.character.currency.copper += total;
    syncCurrencyProjection(next.character);
    if (nextListing.stock >= 0) nextListing.stock += command.quantity;
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
      unitPriceCopper: unitPrice,
      totalCopper: total,
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
  };
  const next = cloneCampaign(state);
  next.quests = [...state.quests, quest].slice(-50);
  next.quest = quest;
  return commit(next, context, clientCommandId, command, tool, "Quest added: " + quest.title + ".", { quest, quests: next.quests }, "quest_created", [], [], [
    { path: "/quests", before: state.quests, after: next.quests },
    { path: "/quest", before: state.quest, after: next.quest },
  ]);
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
      { path: "/character/xp", before: state.character.xp, after: next.character.xp }
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
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
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
    ? "The fiction advances; no mechanical effect was applied: " + command.title + "."
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
      if (!object.definition.criticalPolicy.canLose && command.affordance === "steal") {
        return rejection(state, tool, "critical_object_protected", "This critical object cannot be lost through that interaction.", { objectId: object.id });
      }
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
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { object: nextWorld.objects.find((candidate) => candidate.id === object.id), affordance: command.affordance, sourceId: command.sourceId ?? null, destinationId: command.destinationId ?? null },
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
  const fullData = { ability, skill, goal, dc, roll, modifier: derived.modifier, total, success, ...(adjudication ? { adjudication, costs: adjudication.costs, outcome } : {}) };
  const data = withheld ? { informationPolicy: "withheld", outcome } : fullData;
  return commit(
    next,
    context,
    clientCommandId,
    persistedCommand ?? command,
    tool,
    text,
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

function tacticalDistanceFeet(combat: EngineCombat, enemy: EngineCombatant): number {
  const derived = fiveESimpleDistanceFeet(combat.tactical.actorPosition, enemy.position);
  return Number.isFinite(derived) ? derived : Math.max(0, enemy.distanceFeet);
}

function movementTriggers(
  from: EngineTacticalPosition,
  path: EngineTacticalPosition[],
  enemies: EngineCombatant[],
): EnginePathTrigger[] {
  const triggers: EnginePathTrigger[] = [];
  let previous = from;
  path.forEach((next, index) => {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const distanceBeforeFeet = fiveESimpleDistanceFeet(previous, enemy.position);
      const distanceAfterFeet = fiveESimpleDistanceFeet(next, enemy.position);
      const enters = distanceBeforeFeet > TACTICAL_REACH_FEET && distanceAfterFeet <= TACTICAL_REACH_FEET;
      const leaves = distanceBeforeFeet <= TACTICAL_REACH_FEET && distanceAfterFeet > TACTICAL_REACH_FEET;
      if (enters || leaves) {
        triggers.push({
          kind: "reach-boundary",
          enemyId: enemy.id,
          segmentIndex: index + 1,
          boundary: enters ? "entering-reach" : "leaving-reach",
          reachFeet: TACTICAL_REACH_FEET,
          distanceBeforeFeet,
          distanceAfterFeet,
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
    triggers: movementTriggers(tactical.actorPosition, pathResult.path, state.combat.enemies),
  };
  const next = cloneCampaign(state);
  next.combat.tactical.actorPosition = { ...plan.to };
  next.combat.tactical.lastPlan = plan;
  next.combat.turnBudget.movementFeet.spent += plan.costFeet;
  next.combat.lastAction = "combat_move";
  syncDerivedCombatDistances(next.combat.tactical, next.combat.enemies);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `You move ${plan.costFeet} feet through ${plan.path.length} tactical cell${plan.path.length === 1 ? "" : "s"}.`,
    { movement: plan, combat: combatData(next.combat) },
    "combat_moved",
    [],
    [],
    [
      { path: "/combat/tactical/actorPosition", before: state.combat.tactical.actorPosition, after: next.combat.tactical.actorPosition },
      { path: "/combat/turnBudget/movementFeet/spent", before: state.combat.turnBudget.movementFeet.spent, after: next.combat.turnBudget.movementFeet.spent },
      { path: "/combat/tactical/lastPlan", before: state.combat.tactical.lastPlan, after: next.combat.tactical.lastPlan },
    ],
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
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Encounter started: " + command.encounterName + ". " + describeCombatants(enemies) + (activeActorId === state.actorId ? " Your turn." : " The opposition acts first."),
    { combat: combatData(next.combat) },
    "encounter_started",
    [],
    [],
    [{ path: "/combat", before: state.combat, after: next.combat }]
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
  const spell = getOpen5eSpell(command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  const classList = getOpen5eSpellList(state.character.className);
  if (!classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!classList.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList.className} spell list.`);
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
    const knownCantrips = spellcasting.knownSpells.filter((reference) => getOpen5eSpell(reference.contentKey)?.definition.level === 0).length;
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
    const knownLeveled = spellcasting.knownSpells.filter((reference) => (getOpen5eSpell(reference.contentKey)?.definition.level ?? 0) > 0).length;
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
  const spell = getOpen5eSpell(command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  if (spell.definition.level === 0) {
    return rejection(state, tool, "cantrip_preparation_not_used", "Cantrips are cast from known cantrips and are not prepared.");
  }
  const classList = getOpen5eSpellList(state.character.className);
  if (!classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!classList.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList.className} spell list.`);
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
  const spell = getOpen5eSpell(command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
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
    return resolveHealingSpell(state, context, clientCommandId, command, tool, spell, spellcasting);
  }
  if (spell.effect.effectKind === "stat-modifier") {
    return resolveShieldCast(state, context, clientCommandId, command, tool, spell, spellcasting);
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
  const usesAreaSelection = spell.definition.targetType === "point"
    || spell.definition.targetType === "area"
    || spell.definition.area.shape !== null;
  const selectedIds = usesAreaSelection
    ? [...new Set(command.targetIds)]
    : command.targetIds;
  if (selectedIds.length === 0) return rejection(state, tool, "target_required", `Choose at least one living target for ${spell.definition.name}.`);
  if (
    !usesAreaSelection
    && (spell.definition.targetType === "creature" || spell.definition.targetType === "object")
    && targetLimit !== null
    && selectedIds.length !== targetLimit
  ) {
    return rejection(state, tool, "invalid_target_count", `${spell.definition.name} requires ${targetLimit} target selection${targetLimit === 1 ? "" : "s"} at this casting level.`);
  }
  const targets = selectedIds.map((targetId) => findLiveCombatant(state.combat, targetId));
  if (targets.some((target) => target === null)) {
    return rejection(state, tool, "invalid_spell_target", "Every spell target must be a living combatant in the active encounter.");
  }
  const rangeFeet = executableSpellRangeFeet(spell.definition);
  const outOfRange = targets.find((target) => target !== null && tacticalDistanceFeet(state.combat, target) > rangeFeet);
  if (outOfRange) {
    const distanceFeet = tacticalDistanceFeet(state.combat, outOfRange);
    return rejection(
      state,
      tool,
      "spell_target_out_of_range",
      `${spell.definition.name} can currently resolve through ${rangeFeet} feet; target ${outOfRange.id} is ${distanceFeet} feet away.`
    );
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
    if (!sourceTarget) continue;
    const target = next.combat.enemies.find((candidate) => candidate.id === sourceTarget.id);
    if (!target || !target.alive) continue;
    const targetView = materializeCombatant(target);
    let successfulSave: boolean | null = null;
    let hit = true;
    let critical = false;
    let attackTotal: number | null = null;
    let saveTotal: number | null = null;

    if (spell.effect.resolution === "spell-attack") {
      const die = randomInt(1, 21);
      attackTotal = die + spellcasting.spellAttackBonus;
      critical = die === 20;
      hit = die !== 1 && (critical || attackTotal >= targetView.armorClass);
      rolls.push({ kind: `spell_attack_${index + 1}`, value: die, sides: 20 });
      modifiers.push({ name: `spell_attack_bonus_${index + 1}`, value: spellcasting.spellAttackBonus });
    } else if (spell.effect.resolution === "saving-throw") {
      const ability = spell.definition.savingThrowAbility;
      if (!ability) return rejection(state, tool, "content_tier_insufficient", `${spell.definition.name} has no structured saving throw ability.`);
      const die = randomInt(1, 21);
      const saveModifier = targetView.savingThrowsAll[ability];
      saveTotal = die + saveModifier;
      successfulSave = saveTotal >= spellcasting.spellSaveDc;
      rolls.push({ kind: `spell_save_${ability}_${index + 1}`, value: die, sides: 20 });
      modifiers.push({ name: `target_${ability}_save_${index + 1}`, value: saveModifier });
    }

    const rolled = hit ? rollSpellDamage(damageExpression, critical, rolls, index + 1) : 0;
    const afterSave = successfulSave
      ? spell.effect.saveOnSuccess === "half" ? Math.floor(rolled / 2) : 0
      : rolled;
    const damage = applyCreatureDamageAffinity(targetView, spell.effect.damageType.contentKey, afterSave);
    const beforeHp = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    target.alive = target.hp > 0;
    changes.push({ path: `/combat/enemies/${target.id}/hp`, before: beforeHp, after: target.hp });
    targetResults.push({
      targetId: target.id,
      targetName: targetView.name,
      hit,
      critical,
      attackTotal,
      successfulSave,
      saveTotal,
      damageRolled: rolled,
      damageApplied: damage,
      damageType: spell.effect.damageType.name,
      hpBefore: beforeHp,
      hpAfter: target.hp,
      defeated: !target.alive,
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
  const message = `${spell.definition.name} resolves${slotText}: ${totalDamage} total ${spell.effect.damageType.name.toLowerCase()} damage across ${targetResults.length} target selection${targetResults.length === 1 ? "" : "s"}.`
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
      targetResults,
      deferredProseEffects: spell.effect.hasDeferredProseEffects,
      range: { source: spell.definition.range, executableFeet: rangeFeet },
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    defeatedAll ? "spell_encounter_ended" : "spell_cast",
    rolls,
    modifiers,
    changes
  );
}

function resolveHealingSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "cast_spell" }>,
  tool: EngineToolName | "declare" | "listen",
  spell: NonNullable<ReturnType<typeof getOpen5eSpell>>,
  spellcasting: NonNullable<EngineCharacter["spellcasting"]>
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
  const slotSelection = selectSpellSlot(spell.definition.level, command.slotLevel, spellcasting.slots);
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
  if (selectedSlotLevel !== null) {
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
  if (castingTime === "action") next.combat.activeActorId = firstLiveCombatantId(next.combat);
  next.combat.lastAction = `cast:${spell.contentKey}`;
  const slotText = selectedSlotLevel === null ? " as a cantrip" : ` with a level-${selectedSlotLevel} slot`;
  const turnText = castingTime === "action" ? " The opposition now has the turn." : "";
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${spell.definition.name} resolves${slotText}: ${healing.healed} hit points restored.${turnText}`,
    {
      spell: spell.definition,
      effectKind: "healing",
      slotLevel: selectedSlotLevel,
      targetId: state.character.id,
      healing,
      range: { source: spell.definition.range, executableFeet: executableSpellRangeFeet(spell.definition) },
      combat: combatData(next.combat),
      character: characterData(next.character),
      deferredProseEffects: effect.hasDeferredProseEffects,
    },
    "spell_healing",
    rolls,
    modifiers,
    changes
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
    return rejection(state, tool, "reaction_trigger_required", "Shield can only be cast in response to a server-offered incoming hit.");
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

  if (command.decision === "decline") {
    const next = cloneCampaign(state);
    const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
    const modifiers: Array<{ name: string; value: number }> = [{ name: "armor_class", value: pending.originalArmorClass }];
    const changes: Array<{ path: string; before: unknown; after: unknown }> = [
      { path: "/combat/pendingReaction", before: pending, after: null },
    ];
    next.combat.pendingReaction = null;
    const damage = rollStoredReactionDamage(pending, rolls);
    applyCharacterDamage(next, damage, "reaction", clientCommandId, changes, rolls, modifiers, pending.critical);
    next.combat.lastAction = `reaction:${pending.id}:declined`;
    const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `You decline Shield. ${pending.attackName} hits for ${damage} ${pending.damageType.toLocaleLowerCase("en-US")} damage.${turnSuffix}`,
      {
        reactionId: pending.id,
        decision: "decline",
        attackTotal: pending.attackTotal,
        armorClass: pending.originalArmorClass,
        damage: { rolled: damage, applied: damage, type: pending.damageType },
        combat: combatData(next.combat),
        character: characterData(next.character),
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
  const spell = getOpen5eSpell(spellKey);
  const spellcasting = state.character.spellcasting;
  if (!spell || !spell.effect || spell.effect.effectKind !== "stat-modifier") {
    return rejection(state, tool, "unsupported_effect", "Only a reviewed Shield stat modifier can resolve this reaction.");
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
  const acBefore = pending.originalArmorClass;
  const acAfter = deriveArmorClass(next.character, next.effects);
  next.character.ac = acAfter;
  changes.push({ path: "/character/ac", before: acBefore, after: acAfter });
  const hitAfter = pending.attackRoll !== 1 && (pending.critical || pending.attackTotal >= acAfter);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [
    { name: "attack_total", value: pending.attackTotal },
    { name: "armor_class_before", value: acBefore },
    { name: "armor_class_after", value: acAfter },
  ];
  let damage = 0;
  if (hitAfter) {
    damage = rollStoredReactionDamage(pending, rolls);
    applyCharacterDamage(next, damage, "reaction", clientCommandId, changes, rolls, modifiers, pending.critical);
  }
  next.combat.lastAction = `reaction:${pending.id}:shield`;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `Shield resolves: AC rises from ${acBefore} to ${acAfter}; the stored attack ${hitAfter ? "still hits" : "misses"}${hitAfter ? ` for ${damage} ${pending.damageType.toLocaleLowerCase("en-US")} damage` : ""}.${turnSuffix}`,
    {
      reactionId: pending.id,
      decision: "accept",
      spell: spell.definition,
      slotLevel: selectedSlotLevel,
      attackTotal: pending.attackTotal,
      acBefore,
      acAfter,
      armorClassComponents: queryStatModifier(next.effects, next.character.id, "armor-class").components,
      hitAfter,
      damage: { rolled: damage, applied: damage, type: pending.damageType },
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    next.character.hp === 0 ? "downed" : hitAfter ? "reaction_resolved_hit" : "reaction_resolved_miss",
    rolls,
    modifiers,
    changes,
    [spell.contentKey, pending.sourceActionKey]
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

function eligibleShieldReaction(state: LanternCampaignState): NonNullable<ReturnType<typeof getOpen5eSpell>> | null {
  const spellcasting = state.character.spellcasting;
  if (!spellcasting || state.combat.turnBudget.reaction.spent) return null;
  const spell = getOpen5eSpell("open5e:spell:5e-2014:srd-2014:srd_shield");
  if (!spell || !spell.effect || spell.effect.effectKind !== "stat-modifier") return null;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!progression) return null;
  const references = spell.definition.level === 0 || progression.selectionMode === "known"
    ? spellcasting.knownSpells
    : spellcasting.preparedSpells;
  const slotSelection = selectSpellSlot(spell.definition.level, undefined, spellcasting.slots);
  return spell.definition.castingTime === "reaction"
    && spell.effect.modifier.trigger === "incoming-attack-would-hit"
    && hasPinnedSpell(references, spell.contentKey, spell.packHash)
    && !("code" in slotSelection)
    ? spell
    : null;
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
    const hit = effectiveRoll !== 1 && (critical || total >= targetView.armorClass);
    rolls.push({ kind: "attack_d20", value: effectiveRoll, sides: 20 });
    if (secondRoll !== null) rolls.push({ kind: `attack_${attackModifierQuery.mode}_d20`, value: secondRoll, sides: 20 });
    modifiers.push({ name: "attack_bonus", value: derivedAttack.attackBonus }, { name: "target_ac", value: targetView.armorClass });
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
    combat: combatData(next.combat),
    effects: next.effects.filter((candidate) => candidate.status === "active"),
    character: characterData(next.character),
  }, outcome, rolls, modifiers, changes);
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
  const nextActor = next.combat.lifecycle
    ? lifecycleNextActorId(next.combat, state.actorId, state.actorId)
    : firstLiveCombatantId(next.combat);
  if (!nextActor) {
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    return commit(next, context, clientCommandId, command, tool, "With no foe left standing, the encounter ends.", { combat: combatData(next.combat) }, "encounter_ended", [], [], [{ path: "/combat/status", before: "active", after: "ended" }]);
  }
  next.combat.activeActorId = nextActor;
  if (next.combat.lifecycle) {
    next.combat.lifecycle.initiative.activeIndex = next.combat.lifecycle.initiative.order.indexOf(nextActor);
  }
  next.combat.lastAction = "end_turn";
  return commit(next, context, clientCommandId, command, tool, "Your turn ends. The opposition may act.", { combat: combatData(next.combat) }, "turn_ended", [], [], [{ path: "/combat/activeActorId", before: state.combat.activeActorId, after: nextActor }]);
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

  const next = cloneCampaign(state);
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
  const hit = effectiveRoll !== 1 && (critical || total >= next.character.ac);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [{ kind: "enemy_attack_d20", value: effectiveRoll, sides: 20 }];
  if (secondRoll !== null) rolls.push({ kind: `enemy_attack_${attackModifiers.mode}_d20`, value: secondRoll, sides: 20 });
  const modifiers = [{ name: "enemy_attack_bonus", value: attackModifier }, { name: "armor_class", value: next.character.ac }];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  let message = enemyView.name + " uses " + attack.name + ".";
  let outcome = "enemy_miss";

  if (hit) {
    const shield = eligibleShieldReaction(state);
    if (shield) {
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
        originalArmorClass: next.character.ac,
        damageDiceCount: attack.damage.diceCount * (critical ? 2 : 1),
        damageDieSides: attack.damage.dieSides,
        damageBonus: attack.damage.bonus,
        damageType: attack.damage.typeName,
        eligibleReactionIds: [shield.contentKey],
        status: "offered",
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
        `${enemyView.name} hits with ${attack.name}; Shield may be cast before damage resolves.`,
        {
          reactionId: pending.id,
          pendingReaction: pending,
          attack: { attackRoll: effectiveRoll, attackTotal: total, attackBonus: attackModifier, critical, armorClass: next.character.ac },
          combat: combatData(next.combat),
          character: characterData(next.character),
        },
        "reaction_offered",
        rolls,
        modifiers,
        changes,
        [attack.contentKey, shield.contentKey]
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
    { combat: combatData(next.combat), character: characterData(next.character) },
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
    { skipped: true, condition, combat: combatData(next.combat), character: characterData(next.character) },
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
    const result = resolveOneCreatureAttack(next, attack, index + 1, rolls, modifiers, changes, clientCommandId);
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

function resolveOneCreatureAttack(
  state: LanternCampaignState,
  attack: CompiledCreatureAttack,
  sequenceNumber: number,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
  sourceCommandId: string,
): { hit: boolean; message: string } {
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
  const hit = effectiveRoll !== 1 && (critical || total >= state.character.ac);
  rolls.push({ kind: `enemy_attack_${sequenceNumber}_d20`, value: effectiveRoll, sides: 20 });
  if (secondRoll !== null) rolls.push({ kind: `enemy_attack_${sequenceNumber}_${modifierQuery.mode}_d20`, value: secondRoll, sides: 20 });
  modifiers.push(
    { name: `enemy_attack_${sequenceNumber}_bonus`, value: attack.toHit },
    { name: `enemy_attack_${sequenceNumber}_armor_class`, value: state.character.ac }
  );
  if (!hit) return { hit: false, message: `${attack.name} misses.` };

  const diceCount = attack.damage.diceCount * (critical ? 2 : 1);
  let damage = attack.damage.bonus;
  for (let index = 0; index < diceCount; index += 1) {
    const die = randomInt(1, attack.damage.dieSides + 1);
    damage += die;
    rolls.push({ kind: `enemy_damage_${sequenceNumber}`, value: die, sides: attack.damage.dieSides });
  }
  damage = Math.max(0, damage);
  modifiers.push({ name: `enemy_damage_${sequenceNumber}_bonus`, value: attack.damage.bonus });
  applyCharacterDamage(state, damage, "enemy-multiattack", sourceCommandId, changes, rolls, modifiers, critical);
  return {
    hit: true,
    message: `${attack.name} ${critical ? "critically " : ""}hits for ${damage} ${attack.damage.typeName.toLocaleLowerCase("en-US")} damage.`,
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
  if (lifecycleRewardKey && state.combat.lifecycle?.claimedRewards.includes(lifecycleRewardKey)) {
    return rejection(state, tool, "reward_claimed", "This encounter outcome's reward has already been claimed.");
  }
  if (state.combat.lootClaimed) return rejection(state, tool, "loot_claimed", "The encounter area has already been searched.");
  const quest = command.questId ? state.quests.find((candidate) => candidate.id === command.questId) : null;
  if (command.questId && !quest) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  const questRewardAvailable = Boolean(quest && !quest.rewardClaimed);
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
  if (lifecycleRewardKey && next.combat.lifecycle) next.combat.lifecycle.claimedRewards.push(lifecycleRewardKey);
  if (quest) {
    const nextQuest = next.quests.find((candidate) => candidate.id === quest.id);
    if (nextQuest) {
      nextQuest.status = "completed";
      nextQuest.progress = 100;
      nextQuest.rewardClaimed = true;
      if (next.quest.id === nextQuest.id) next.quest = nextQuest;
    }
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
): { before: EngineGameTime; after: EngineGameTime; processedEventIds: string[]; expiredEffectIds: string[]; interrupted: boolean } {
  void reason;
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
      next.quests = next.quests.map((quest) => quest.id === event.targetRef && quest.status === "active"
        ? { ...quest, status: "failed" as const }
        : quest);
      if (next.quest.id === event.targetRef && next.quest.status === "active") next.quest = { ...next.quest, status: "failed" };
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
  next.quests = next.quests.map((quest) => quest.status === "active"
    && quest.deadlineAtMinutes !== undefined
    && quest.deadlineAtMinutes > before.totalMinutes
    && quest.deadlineAtMinutes <= after.totalMinutes
    ? { ...quest, status: "failed" as const }
    : quest);
  if (next.quest.status === "active"
    && next.quest.deadlineAtMinutes !== undefined
    && next.quest.deadlineAtMinutes > before.totalMinutes
    && next.quest.deadlineAtMinutes <= after.totalMinutes) {
    next.quest = { ...next.quest, status: "failed" };
  }
  next.time.worldClocks = next.time.worldClocks.map((clock) => ({
    ...clock,
    elapsedMinutes: clock.elapsedMinutes + after.totalMinutes - before.totalMinutes,
    provenance: { sourceCommandId, sourceVersion: next.version + 1 },
  }));
  next.time.gameTime = after;
  return { before, after, processedEventIds, expiredEffectIds: [...new Set(expiredEffectIds)], interrupted };
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
    { path: "/time/travel", before: state.time.travel, after: travel },
    { path: "/time/randomEvents", before: state.time.randomEvents, after: next.time.randomEvents },
    { path: "/time/survival", before: beforeSurvival, after: next.time.survival },
    ...(JSON.stringify(beforeQuests) !== JSON.stringify(next.quests) ? [{ path: "/quests", before: beforeQuests, after: next.quests }] : []),
    ...(JSON.stringify(beforeEffects) !== JSON.stringify(next.effects) ? [{ path: "/effects", before: beforeEffects, after: next.effects }] : []),
    ...(JSON.stringify(beforeEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: beforeEvents, after: next.time.scheduledEvents }] : []),
    ...(JSON.stringify(beforeWorldClocks) !== JSON.stringify(next.time.worldClocks) ? [{ path: "/time/worldClocks", before: beforeWorldClocks, after: next.time.worldClocks }] : []),
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
  if (existing.workCompletedMinutes === 0) consumeInventoryProperty(next, existing.materialProperty, existing.materialQuantity, changes);
  const advance = advanceGameTime(next, existing.workRequiredMinutes - existing.workCompletedMinutes, "downtime-project", clientCommandId);
  const project = next.time.projects.find((candidate) => candidate.id === existing.id);
  if (!project) return rejection(state, tool, "project_not_active", "That project is not active.");
  project.workCompletedMinutes = project.workRequiredMinutes;
  project.status = "completed";
  project.completedAtMinutes = advance.after.totalMinutes;
  project.provenance = { sourceCommandId: clientCommandId, sourceVersion: state.version };
  changes.push(
    { path: "/time/gameTime", before: advance.before, after: advance.after },
    { path: "/time/projects", before: state.time.projects, after: next.time.projects },
  );
  return commit(next, context, clientCommandId, command, tool, "The research project completes and its progress is recorded exactly once.", { project, timeAdvance: { before: advance.before, after: advance.after, minutes: advance.after.totalMinutes - advance.before.totalMinutes, reason: "downtime-project", processedEventIds: advance.processedEventIds } }, "project_completed", [], [], changes);
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
      },
      "rest_interrupted",
      [],
      [],
      [
        { path: "/time/gameTime", before: beforeTime.gameTime, after: next.time.gameTime },
        { path: "/time/rest", before: beforeTime.rest, after: next.time.rest },
        ...(JSON.stringify(beforeQuests) !== JSON.stringify(next.quests) ? [{ path: "/quests", before: beforeQuests, after: next.quests }] : []),
        ...(JSON.stringify(beforeEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: beforeEvents, after: next.time.scheduledEvents }] : []),
        ...(JSON.stringify(beforeEffectsForTime) !== JSON.stringify(next.effects) ? [{ path: "/effects", before: beforeEffectsForTime, after: next.effects }] : []),
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
    { restType: command.restType, hpRestored: next.character.hp - beforeHp, hitDiceRemaining: next.character.hitDiceRemaining, character: characterData(next.character), timeAdvance: { before: advance.before, after: advance.after, minutes: requiredMinutes, reason: command.restType === "short" ? "short-rest" : "long-rest", processedEventIds: advance.processedEventIds } },
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
      { path: "/time/rest", before: beforeTime.rest, after: next.time.rest },
      ...(JSON.stringify(beforeQuests) !== JSON.stringify(next.quests) ? [{ path: "/quests", before: beforeQuests, after: next.quests }] : []),
      ...(JSON.stringify(beforeEvents) !== JSON.stringify(next.time.scheduledEvents) ? [{ path: "/time/scheduledEvents", before: beforeEvents, after: next.time.scheduledEvents }] : []),
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

function commit(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineCommand,
  tool: EngineToolName | "declare" | "listen",
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
        && child.startsWith("open5e:")
        && (key === "contentKey" || key.endsWith("Key"))
      ) {
        keys.add(child);
      } else if (Array.isArray(child) && key.endsWith("Keys")) {
        for (const contentKey of child) {
          if (typeof contentKey === "string" && contentKey.startsWith("open5e:")) keys.add(contentKey);
        }
      } else visit(child);
    }
  };
  visit(value);
  return [...keys].sort();
}

function readOnlyResolution(
  state: LanternCampaignState,
  tool: EngineToolName | "declare" | "listen",
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
  tool: EngineToolName | "declare" | "listen",
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
    if (!reference.contentKey.startsWith("open5e:spell:") || seen.has(reference.contentKey)) continue;
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
    || !candidate.contentKey.startsWith("open5e:spell:")
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
  return {
    id: npc.id,
    name: npc.name,
    description: npc.description ?? "",
    disposition: npc.disposition ?? "neutral",
    goals: npc.goals ?? [],
    socialDc: npc.socialDc ?? 12,
    relationshipScore: npc.relationshipScore ?? 0,
    memories: npc.memories ?? [],
  };
}

function normalizeMerchant(merchant: EngineMerchant): EngineMerchant {
  return {
    id: merchant.id,
    name: merchant.name,
    description: merchant.description ?? "",
    disposition: merchant.disposition ?? "neutral",
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
  return merchants.map((merchant) => ({
    ...merchant,
    items: merchant.items.map((listing) => ({
      ...listing,
      item: materializeInventoryItem(listing.item),
    })),
  }));
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
    facts,
    knowledge,
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
  const projection = actorKnowledgeProjection(actorId, state);
  const projected = cloneCampaign(state);
  projected.worldFacts = projection.facts;
  projected.actorKnowledge = projection.knowledge;
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
          stateChanges: effect.stateChanges.filter((change) => !change.path.startsWith("/worldFacts") && !change.path.startsWith("/actorKnowledge")),
        };
      }),
    } : {}),
    stateChanges: event.stateChanges.filter((change) => !change.path.startsWith("/worldFacts") && !change.path.startsWith("/actorKnowledge")),
  };
}

function redactResolutionData(data: unknown): unknown {
  if (Array.isArray(data)) return data.map((entry) => redactResolutionData(entry));
  if (!data || typeof data !== "object") return data;
  const projected = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  if (projected.command && typeof projected.command === "object" && !Array.isArray(projected.command)) {
    projected.command = redactCommand(projected.command as Record<string, unknown>);
  }
  if (Object.hasOwn(projected, "data")) projected.data = redactResolutionData(projected.data);
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
  const projected = JSON.parse(JSON.stringify(command)) as Record<string, unknown>;
  if (projected.kind === "world_context") delete projected.facts;
  if (projected.kind === "challenge_attempt") delete projected.factId;
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
  return projected as T;
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
  return {
    id: legacy.id ?? randomUUID(),
    title: legacy.title ?? "Untitled quest",
    objective: legacy.objective ?? "Follow the thread.",
    status: legacy.status ?? "active",
    reward: {
      xp: legacy.reward?.xp ?? 0,
      copper: legacy.reward?.copper ?? (legacy.reward?.gold ?? 0) * 100,
    },
    rewardClaimed: legacy.rewardClaimed ?? false,
    progress: Math.max(0, Math.min(100, legacy.progress ?? 0)),
    giverNpcId: legacy.giverNpcId,
    deadline: legacy.deadline,
    ...(typeof legacy.deadlineAtMinutes === "number" ? { deadlineAtMinutes: Math.max(0, Math.trunc(legacy.deadlineAtMinutes)) } : {}),
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
  return tier === 2 && (item.effectKey === "lantern-ward-v1" || (item.kind === "consumable" && Boolean(item.healing)));
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

function normalizeCombat(combat: EngineCombat | null | undefined, actorId = "actor", movementFeet = 30): EngineCombat {
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
  const tactical = normalizeCombatTactical(combat.tactical, combat.encounterId ?? "legacy", actorId, maxDistanceCells);
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
      actionResources: normalizeActionResources(enemy.actionResources),
      progression: normalizeCombatantProgression(enemy.progression),
    } satisfies EngineCombatant;
  });
  syncDerivedCombatDistances(tactical, enemies);
  return {
    status: combat.status ?? "none",
    encounterId: combat.encounterId ?? null,
    encounterName: combat.encounterName ?? null,
    lifecycle: normalizeEncounterLifecycle(combat.lifecycle),
    round: Math.max(0, combat.round ?? 0),
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
  const outcome = ["killed", "surrendered", "captured", "escaped"].includes(candidate.outcome ?? "")
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
): EngineCombatTacticalState {
  const fallback = emptyTacticalState(encounterId);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = value as Partial<EngineCombatTacticalState>;
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
  if (validateTacticalGeometry(geometry)) return fallback;
  const actorPosition = isTacticalPosition(candidate.actorPosition) && candidate.actorPosition.frameId === frameId && candidate.actorPosition.z === 0
    ? { ...candidate.actorPosition }
    : { frameId, x: 0, y: 0, z: 0 };
  if (positionFitsGeometry(actorPosition, normalizeFootprint(candidate.actorFootprint), geometry, [])) return fallback;
  return {
    geometry,
    movementMode: "walking",
    actorPosition,
    actorFootprint: normalizeFootprint(candidate.actorFootprint),
    lastPlan: normalizeMovementPlan(candidate.lastPlan, actorId, geometry.revision, frameId),
  };
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
    triggers: candidate.triggers.filter((trigger): trigger is EnginePathTrigger => Boolean(trigger && typeof trigger === "object" && (trigger as EnginePathTrigger).kind === "reach-boundary")).map((trigger) => ({ ...trigger })),
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

function materializeSpellcasting(character: EngineCharacter): EngineSpellcastingView | null {
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
  const knownSpells = spellcasting.knownSpells.map(materializeSpellReference).sort(compareSpellViews);
  const preparedSpells = spellcasting.preparedSpells.map(materializeSpellReference).sort(compareSpellViews);
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
      ? { ...materializeSpellReference(spellcasting.concentration), startedRound: spellcasting.concentration.startedRound }
      : null,
  };
}

function materializeSpellReference(reference: EngineSpellReference): EngineSpellcastingView["knownSpells"][number] {
  const source = getOpen5eSpell(reference.contentKey, reference.packHash);
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

function characterData(character: EngineCharacter): EngineCharacterView {
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
    spellcasting: materializeSpellcasting(character),
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

function rulesNarration(text: string, suggestedActions: Array<{ id: string; label: string }> = []): NarrationEnvelope {
  return { text, proposedFacts: [], suggestedActions };
}
