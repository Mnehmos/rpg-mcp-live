import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDmContext,
  LanternDungeonMaster,
} from "../src/engine-dm.js";
import {
  createInitialCampaign,
  normalizeCampaignState,
  projectEventForActor,
  resolveEngineCommand,
} from "../src/engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "../src/engine-store.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type EngineCommandResult,
  type EngineEvent,
  type EngineResolutionTool,
  type LanternCampaignState,
  type RequestContext,
} from "../src/engine-contracts.js";
import { ruinedGatehouseWorldContextCommand } from "../src/world-object-fixture.js";

export const GAUNTLET_FIXTURE_VERSION = "open-ended-gauntlet-v1" as const;
export const GAUNTLET_RUBRIC_VERSION = "experience-rubric-v1" as const;
export const GAUNTLET_BASELINE_VERSION = "open-ended-baseline-v1" as const;
export const GAUNTLET_EXPECTED_BASELINE_DIGEST = "a546d72dabe73c324721fd54b0529b5c72e2d0a603f47baf472442b79ec32794" as const;

export const GAUNTLET_SCENARIO_IDS = [
  "ignore-hook",
  "creative-environmental-action",
  "negotiation-avoids-combat",
  "failed-essential-clue",
  "repeated-identical-search",
  "changed-approach",
  "surrender-instead-of-fighting",
  "hidden-information-probe",
  "duplicate-submission",
  "model-timeout-after-commit",
] as const;

export type GauntletScenarioId = (typeof GAUNTLET_SCENARIO_IDS)[number];

export interface GauntletHardAssertion {
  name: string;
  passed: boolean;
  details: string;
}

export interface GauntletTraceEvent {
  eventId: string;
  tool: string;
  outcome: string;
  previousVersion: number;
  version: number;
  contentKeys: string[];
  rolls: Array<{ kind: string; value: number; sides?: number }>;
  modifiers: Array<{ name: string; value: number }>;
  stateChanges: Array<{ path: string; changed: true }>;
  effectTools: string[];
}

export interface GauntletPublicProjection {
  events: GauntletTraceEvent[];
  narration: { text: string; proposedFacts: unknown[]; suggestedActions: unknown[] };
  stateDeltas: Array<{ path: string; changed: true }>;
  finalContinuation: { status: string; version: number; summary: string };
}

export interface GauntletTrace {
  fixtureVersion: typeof GAUNTLET_FIXTURE_VERSION;
  rubricVersion: typeof GAUNTLET_RUBRIC_VERSION;
  scenarioId: GauntletScenarioId;
  title: string;
  ownerIssue: "#22";
  failureCategory: string;
  playerText: string;
  interpretedIntent: string;
  legalOffers: Array<{ id: string; available: boolean; reason: string | null }>;
  commandIds: string[];
  publicEventIds: string[];
  privateRunIds: string[];
  events: GauntletTraceEvent[];
  stateDeltas: Array<{ path: string; changed: true }>;
  revisions: number[];
  narration: { text: string; proposedFacts: unknown[]; suggestedActions: unknown[] };
  telemetry: {
    provider: string;
    latencyMs: number;
    timeoutMs: number;
    timedOut: boolean;
    inputTokens: number;
    cacheTokens: number;
    reasoningTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  finalContinuation: { status: string; version: number; summary: string };
  hardAssertions: GauntletHardAssertion[];
  hardPass: boolean;
  publicProjection: GauntletPublicProjection;
}

export interface ExperienceScorecard {
  scenarioId: GauntletScenarioId;
  rubricVersion: typeof GAUNTLET_RUBRIC_VERSION;
  reviewer: "independent-human";
  status: "pending";
  modelSelfScoreUsed: false;
  dimensions: Record<
    | "agency"
    | "fairness"
    | "clarity"
    | "discovery"
    | "characterRelevance"
    | "pacing"
    | "continuity"
    | "trust"
    | "nextAffordance"
    | "boundaryRespect",
    number | null
  >;
  notes: string[];
}

export interface GauntletReport {
  fixtureVersion: typeof GAUNTLET_FIXTURE_VERSION;
  rubricVersion: typeof GAUNTLET_RUBRIC_VERSION;
  generatedAt: string;
  traces: GauntletTrace[];
  scorecards: ExperienceScorecard[];
  baseline: {
    version: typeof GAUNTLET_BASELINE_VERSION;
    digest: string;
    compatible: boolean;
  };
  hardPass: boolean;
}

interface ScenarioStep {
  command: EngineCommand;
  result: EngineCommandResult;
  beforeVersion: number;
}

interface ScenarioSession {
  scenarioId: GauntletScenarioId;
  state: LanternCampaignState;
  context: RequestContext;
  store: LanternEngineStore;
  directory: string;
  nextCommand: number;
}

type ResolverTool = Parameters<typeof resolveEngineCommand>[4];

function assertion(name: string, passed: boolean, details: string): GauntletHardAssertion {
  return { name, passed, details };
}

function sessionFor(scenarioId: GauntletScenarioId, state = createInitialCampaign(
  `gauntlet-${scenarioId}-account`,
  `gauntlet-${scenarioId}-actor`,
  randomUUID(),
)): ScenarioSession {
  const directory = mkdtempSync(join(tmpdir(), `lantern-gauntlet-${scenarioId}-`));
  const store = new LanternEngineStore(join(directory, "engine.db"));
  const context: RequestContext = {
    requestId: `gauntlet-request-${scenarioId}`,
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
  store.createCampaign(context, state);
  return { scenarioId, state, context, store, directory, nextCommand: 0 };
}

function closeSession(session: ScenarioSession): void {
  session.store.close();
  rmSync(session.directory, { recursive: true, force: true });
}

function execute(
  session: ScenarioSession,
  command: EngineCommand,
  playerText?: string,
  options: { id?: string; expectedVersion?: number } = {},
): ScenarioStep {
  const id = options.id ?? `${session.scenarioId}-command-${session.nextCommand++}`;
  const beforeVersion = session.state.version;
  const result = session.store.executeCommand({
    context: session.context,
    clientCommandId: id,
    expectedCampaignVersion: options.expectedVersion ?? beforeVersion,
    command,
    tool: command.kind as EngineResolutionTool,
    playerText,
    resolve: (current) => resolveEngineCommand(
      current,
      session.context,
      id,
      command,
      command.kind as ResolverTool,
      playerText,
    ),
  });
  if (result.state.version >= session.state.version) session.state = result.state;
  return { command, result, beforeVersion };
}

function fixtureApply(state: LanternCampaignState, command: EngineCommand): LanternCampaignState {
  const context: RequestContext = {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
  const result = resolveEngineCommand(state, context, randomUUID(), command, command.kind as ResolverTool);
  if (!result.accepted) throw new Error(`Fixture command ${command.kind} failed: ${result.code}`);
  return result.state;
}

function characterCommand(name: string, className: "fighter" | "wizard" = "fighter"): EngineCommand {
  return {
    kind: "character_create",
    name,
    species: "human",
    className,
    background: "Acolyte",
    alignment: "Neutral",
  };
}

function setupCharacter(session: ScenarioSession, name = "Gauntlet Investigator"): ScenarioStep {
  const step = execute(session, characterCommand(name));
  if (!step.result.accepted) throw new Error(`Character fixture failed: ${step.result.code}`);
  return step;
}

function setupSituation(session: ScenarioSession): ScenarioStep {
  const step = execute(session, { kind: "situation_create", templateId: "watchtower-relic-v1" });
  if (!step.result.accepted) throw new Error(`Situation fixture failed: ${step.result.code}`);
  return step;
}

function makeTrace(
  scenarioId: GauntletScenarioId,
  title: string,
  failureCategory: string,
  playerText: string,
  interpretedIntent: string,
  steps: ScenarioStep[],
  hardAssertions: GauntletHardAssertion[],
  options: {
    telemetry?: Partial<GauntletTrace["telemetry"]>;
    extraCommandIds?: string[];
    continuationStatus?: string;
  } = {},
): GauntletTrace {
  const publicEvents = steps
    .map((step) => step.result.event ? projectEventForActor(step.result.context.actorId, step.result.state, step.result.event) : null)
    .filter((event): event is EngineEvent => Boolean(event));
  const events: GauntletTraceEvent[] = publicEvents.map((event) => ({
    eventId: event.id,
    tool: event.tool,
    outcome: event.outcome,
    previousVersion: event.previousVersion,
    version: event.version,
    contentKeys: [...event.contentKeys],
    rolls: [...event.rolls],
    modifiers: [...event.modifiers],
    stateChanges: event.stateChanges.map((change) => ({ path: change.path, changed: true as const })),
    effectTools: (event.effects ?? []).map((effect) => effect.tool),
  }));
  const stateDeltas = events.flatMap((event) => event.stateChanges);
  const last = steps.at(-1)?.result;
  const finalContinuation = {
    status: options.continuationStatus ?? (last?.accepted ? "continue" : "offer-correction"),
    version: last?.state.version ?? 0,
    summary: last?.message ?? "No authoritative result was produced.",
  };
  const narration = last?.narration ?? {
    text: finalContinuation.summary,
    proposedFacts: [],
    suggestedActions: [],
  };
  const trace: GauntletTrace = {
    fixtureVersion: GAUNTLET_FIXTURE_VERSION,
    rubricVersion: GAUNTLET_RUBRIC_VERSION,
    scenarioId,
    title,
    ownerIssue: "#22",
    failureCategory,
    playerText,
    interpretedIntent,
    legalOffers: steps.map((step) => ({
      id: step.command.kind,
      available: step.result.accepted || step.result.readOnly,
      reason: step.result.code,
    })),
    commandIds: [...steps.map((step) => step.result.clientCommandId), ...(options.extraCommandIds ?? [])],
    publicEventIds: events.map((event) => event.eventId),
    privateRunIds: [`private-run:${scenarioId}`],
    events,
    stateDeltas,
    revisions: steps.map((step) => step.result.state.version),
    narration: {
      text: narration.text,
      proposedFacts: [...narration.proposedFacts],
      suggestedActions: [...narration.suggestedActions],
    },
    telemetry: {
      provider: "deterministic-fixture",
      latencyMs: 0,
      timeoutMs: 0,
      timedOut: false,
      inputTokens: 0,
      cacheTokens: 0,
      reasoningTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      ...options.telemetry,
    },
    finalContinuation,
    hardAssertions,
    hardPass: hardAssertions.every((item) => item.passed),
    publicProjection: {
      events,
      narration: {
        text: narration.text,
        proposedFacts: [...narration.proposedFacts],
        suggestedActions: [...narration.suggestedActions],
      },
      stateDeltas,
      finalContinuation,
    },
  };
  return trace;
}

function directSituationState(
  scenarioId: GauntletScenarioId,
  options: { strength?: number; difficulty?: "gentle" | "standard" | "challenging"; className?: "fighter" | "wizard" } = {},
): LanternCampaignState {
  let state = createInitialCampaign(
    `gauntlet-${scenarioId}-account`,
    `gauntlet-${scenarioId}-actor`,
    randomUUID(),
  );
  state = fixtureApply(state, characterCommand("Situation Specialist", options.className ?? "fighter"));
  if (options.strength !== undefined) state.character.abilities.str = options.strength;
  if (options.difficulty) {
    state.experienceProfile.difficulty = options.difficulty;
    state.experienceProfile.difficultyPolicyKey = `lantern-difficulty-${options.difficulty}-v1`;
  }
  state = normalizeCampaignState(state);
  state = fixtureApply(state, { kind: "situation_create", templateId: "watchtower-relic-v1" });
  return state;
}

async function runIgnoreHook(): Promise<GauntletTrace> {
  const session = sessionFor("ignore-hook");
  try {
    setupCharacter(session);
    setupSituation(session);
    const step = execute(session, { kind: "situation_ignore" }, "I leave the watchtower situation unattended for an hour.");
    const assertions = [
      assertion("authoritative ignore accepted", step.result.accepted, `code=${step.result.code}`),
      assertion("pressure advances once", step.result.state.situation?.pressure.current === 1, `pressure=${step.result.state.situation?.pressure.current}`),
      assertion("one event and one version increment", Boolean(step.result.event) && step.result.state.version === step.beforeVersion + 1, `version=${step.result.state.version}`),
    ];
    return makeTrace("ignore-hook", "Ignore hook advances a reviewed situation", "soft-lock", "I leave the situation unattended.", "situation_ignore", [step], assertions);
  } finally {
    closeSession(session);
  }
}

async function runCreativeEnvironmentalAction(): Promise<GauntletTrace> {
  const session = sessionFor("creative-environmental-action");
  try {
    setupCharacter(session, "Gatehouse Tinkerer");
    const world = execute(session, engineCommandSchema.parse(ruinedGatehouseWorldContextCommand()));
    if (!world.result.accepted) throw new Error(`World fixture failed: ${world.result.code}`);
    const beforeInvalid = JSON.stringify(session.store.getCampaign(session.context));
    const invalid = execute(session, { kind: "interact", targetId: "gatehouse-oil", affordance: "ignite", goal: "Ignite the oil without a fire source." });
    const afterInvalid = JSON.stringify(session.store.getCampaign(session.context));
    const unlock = execute(session, { kind: "interact", targetId: "gatehouse-door", affordance: "unlock", goal: "Unlock the gatehouse door." });
    const open = execute(session, { kind: "interact", targetId: "gatehouse-door", affordance: "open", goal: "Open the unlocked gatehouse door." });
    const step = execute(session, { kind: "interact", targetId: "gatehouse-lever", affordance: "activate", goal: "Activate the lever to open the alternate route." }, "I activate the rusted lever to open the alternate route.");
    const door = step.result.state.worldContext?.objects.find((object) => object.id === "gatehouse-door");
    const lever = step.result.state.worldContext?.objects.find((object) => object.id === "gatehouse-lever");
    const assertions = [
      assertion("typed affordance accepted", step.result.accepted, `code=${step.result.code}`),
      assertion("domain-invalid affordance is immutable", !invalid.result.accepted && invalid.result.code === "fire_source_required" && invalid.result.event === null && invalid.result.state.version === invalid.beforeVersion && beforeInvalid === afterInvalid, `code=${invalid.result.code}`),
      assertion("door state is authoritative", door?.state === "open", `door=${door?.state}`),
      assertion("lever state is authoritative", lever?.state === "active", `lever=${lever?.state}`),
      assertion("rejected or narration-only mechanics are absent", Boolean(step.result.event) && step.result.state.version === step.beforeVersion + 1, `event=${Boolean(step.result.event)}`),
    ];
    return makeTrace("creative-environmental-action", "Creative environmental action uses a typed affordance", "narration-only-mechanics", "I activate the rusted lever to open the alternate route.", "interact.activate", [invalid, unlock, open, step], assertions);
  } finally {
    closeSession(session);
  }
}

async function runNegotiationAvoidsCombat(): Promise<GauntletTrace> {
  const state = directSituationState("negotiation-avoids-combat", { strength: 20, difficulty: "gentle" });
  let next = fixtureApply(state, { kind: "situation_visit", locationId: "watchtower-yard" });
  next = fixtureApply(next, { kind: "situation_clue_attempt", clueId: "watchtower-clue-map", approach: "Read the marked route without disturbing it." });
  const session = sessionFor("negotiation-avoids-combat", next);
  try {
    const step = execute(session, { kind: "situation_choose", choice: "bargain" }, "I negotiate a bargain that avoids a fight.");
    const assertions = [
      assertion("negotiated outcome is legal", step.result.accepted, `code=${step.result.code}`),
      assertion("bargain resolves without combat", step.result.state.situation?.outcome?.choice === "bargain" && step.result.state.combat.status !== "active", `outcome=${step.result.state.situation?.outcome?.choice}`),
      assertion("mechanics are in the event", Boolean(step.result.event), `event=${Boolean(step.result.event)}`),
    ];
    return makeTrace("negotiation-avoids-combat", "Negotiation resolves a situation without combat", "combat-forced-by-narration", "I negotiate a bargain that avoids a fight.", "situation_choose.bargain", [step], assertions, { continuationStatus: "resolved" });
  } finally {
    closeSession(session);
  }
}

async function runFailedEssentialClue(): Promise<GauntletTrace> {
  const state = directSituationState("failed-essential-clue", { strength: 3, difficulty: "challenging", className: "wizard" });
  const session = sessionFor("failed-essential-clue", state);
  try {
    const step = execute(session, { kind: "situation_clue_attempt", clueId: "watchtower-clue-boots", approach: "Follow the prints in the open road." }, "I search the fresh prints and fail to find the essential clue.");
    const assertions = [
      assertion("failed clue remains an accepted fail-forward result", step.result.accepted && step.result.event?.outcome === "situation_clue_failed_forward", `outcome=${step.result.event?.outcome}`),
      assertion("complication is recorded", (step.result.state.situation?.complicationCount ?? 0) === 1, `complications=${step.result.state.situation?.complicationCount}`),
      assertion("a next clue path remains available", step.result.state.situation?.clues.some((clue) => clue.id !== "watchtower-clue-boots" && !clue.foundBy.includes(step.result.state.actorId)) === true, "unfound alternate clue exists"),
    ];
    return makeTrace("failed-essential-clue", "An essential clue fails forward", "dead-end-on-failure", "I search the fresh prints and fail to find the essential clue.", "situation_clue_attempt", [step], assertions);
  } finally {
    closeSession(session);
  }
}

async function runRepeatedIdenticalSearch(): Promise<GauntletTrace> {
  const session = sessionFor("repeated-identical-search");
  try {
    const command: EngineCommand = { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Search the barred door for a way through.", approach: "Shoulder it" };
    const first = execute(session, command, "I search the barred door by shouldering it.");
    const beforeRetry = JSON.stringify(session.store.getCampaign(session.context));
    const retry = execute(session, command, undefined, { id: "repeated-identical-search-retry", expectedVersion: first.result.state.version });
    const afterRetry = JSON.stringify(session.store.getCampaign(session.context));
    const assertions = [
      assertion("first search is authoritative", first.result.accepted && Boolean(first.result.event), `code=${first.result.code}`),
      assertion("identical retry is blocked", !retry.result.accepted && retry.result.code === "retry_blocked", `code=${retry.result.code}`),
      assertion("retry does not mutate state or create an event", beforeRetry === afterRetry && retry.result.event === null && retry.result.state.version === first.result.state.version, `version=${retry.result.state.version}`),
    ];
    return makeTrace("repeated-identical-search", "Repeated identical search is rejected without mutation", "duplicate-mutation", "I repeat the exact same search.", "challenge_attempt with identical approach", [first, retry], assertions, { continuationStatus: "offer-correction", extraCommandIds: ["repeated-identical-search-retry"] });
  } finally {
    closeSession(session);
  }
}

async function runChangedApproach(): Promise<GauntletTrace> {
  const session = sessionFor("changed-approach");
  try {
    const firstCommand: EngineCommand = { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Search the barred door for a way through.", approach: "Shoulder it" };
    const changedCommand: EngineCommand = { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Search the barred door for a way through.", approach: "Brace a timber and ram it" };
    const first = execute(session, firstCommand, "I shoulder the barred door.");
    const changed = execute(session, changedCommand, "I change approach and brace a timber before ramming it.");
    const assertions = [
      assertion("initial approach is accepted", first.result.accepted, `code=${first.result.code}`),
      assertion("changed approach gets a distinct authoritative attempt", changed.result.accepted && changed.result.state.adjudicationHistory.length === first.result.state.adjudicationHistory.length + 1, `history=${changed.result.state.adjudicationHistory.length}`),
      assertion("versions advance once per accepted attempt", changed.result.state.version === first.result.state.version + 1, `version=${changed.result.state.version}`),
    ];
    return makeTrace("changed-approach", "A changed approach receives a fresh adjudication", "stale-narration", "I change approach and brace a timber before ramming it.", "challenge_attempt with changed approach", [first, changed], assertions);
  } finally {
    closeSession(session);
  }
}

async function runSurrenderInsteadOfFighting(): Promise<GauntletTrace> {
  let state = createInitialCampaign("gauntlet-surrender-instead-of-fighting-account", "gauntlet-surrender-instead-of-fighting-actor", randomUUID());
  state = fixtureApply(state, characterCommand("Guard Negotiator"));
  state = fixtureApply(state, { kind: "tutorial_advance" });
  state = fixtureApply(state, { kind: "tutorial_advance" });
  state = fixtureApply(state, {
    kind: "combat_start",
    encounterId: "gauntlet-guard-negotiation",
    encounterName: "Guard Negotiation",
    lifecycleProfile: "guards-surrender-v1",
    approach: {
      challengeId: "stealth-perception-v1",
      groupIndex: 0,
      goal: "Approach without starting a fight.",
      approach: "Keep to the shadows and speak only when close.",
    },
    creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 2 }],
  });
  for (const enemy of state.combat.enemies) enemy.hp = 1;
  state = normalizeCampaignState(state);
  const session = sessionFor("surrender-instead-of-fighting", state);
  try {
    const first = execute(session, { kind: "combat_action", action: "attack_nonlethal", targetId: state.combat.enemies[0]!.id }, "I use a nonlethal strike, leaving the guards a chance to surrender.");
    const targetId = first.result.state.combat.enemies.find((enemy) => enemy.id !== state.combat.enemies[0]!.id)?.id ?? "missing-target";
    const second = execute(session, { kind: "encounter_decision", decision: "accept_surrender", targetId }, "I accept the guards' surrender instead of continuing the fight.");
    const assertions = [
      assertion("nonlethal action is authoritative", first.result.accepted && first.result.event !== null, `code=${first.result.code}`),
      assertion("server offers surrender", first.result.state.combat.lifecycle?.morale.offers.some((offer) => offer.status === "offered") === true, "surrender offer present"),
      assertion("surrender ends combat without a kill", second.result.accepted && second.result.state.combat.lifecycle?.outcome === "surrendered" && second.result.state.combat.status === "ended", `outcome=${second.result.state.combat.lifecycle?.outcome}`),
    ];
    return makeTrace("surrender-instead-of-fighting", "Surrender is a legal alternative to fighting", "forced-combat-outcome", "I accept the guards' surrender instead of continuing the fight.", "encounter_decision.accept_surrender", [first, second], assertions, { continuationStatus: "resolved" });
  } finally {
    closeSession(session);
  }
}

async function runHiddenInformationProbe(): Promise<GauntletTrace> {
  const session = sessionFor("hidden-information-probe");
  try {
    setupCharacter(session, "Hidden-Info Tester");
    setupSituation(session);
    const step = execute(session, { kind: "observe" }, "I inspect the current scene without claiming hidden knowledge.");
    const publicData = JSON.stringify(step.result.data);
    const dmContext = JSON.stringify(buildDmContext(step.result.state, session.context, "I inspect the current scene.", "player_turn"));
    const assertions = [
      assertion("read-only probe does not advance the campaign", step.result.readOnly && step.result.state.version === step.beforeVersion && step.result.event === null, `version=${step.result.state.version}`),
      assertion("public projection withholds hidden truth ids", !publicData.includes("watchtower-truth-warden") && !publicData.includes("The warden diverted the patrol"), "hidden truth absent from player data"),
      assertion("DM context is actor-scoped", !dmContext.includes("watchtower-truth-warden") && !dmContext.includes("The warden diverted the patrol"), "hidden truth absent from DM context"),
    ];
    return makeTrace("hidden-information-probe", "Hidden information is withheld from the actor projection", "private-information-leak", "I inspect the current scene without claiming hidden knowledge.", "observe", [step], assertions);
  } finally {
    closeSession(session);
  }
}

async function runDuplicateSubmission(): Promise<GauntletTrace> {
  const session = sessionFor("duplicate-submission");
  try {
    setupCharacter(session, "Duplicate Tester");
    setupSituation(session);
    const command: EngineCommand = { kind: "situation_ignore" };
    const id = "duplicate-submission-command";
    const first = execute(session, command, "I wait one hour.", { id });
    const eventsAfterFirst = session.store.listCampaignEvents(session.context);
    const replay = execute(session, command, "I wait one hour.", { id, expectedVersion: first.beforeVersion });
    const eventsAfterReplay = session.store.listCampaignEvents(session.context);
    const beforeStale = JSON.stringify(session.store.getCampaign(session.context));
    let staleRejected = false;
    try {
      execute(session, { kind: "situation_ignore" }, undefined, { id: "duplicate-submission-stale", expectedVersion: first.beforeVersion });
    } catch (error) {
      staleRejected = error instanceof EngineVersionConflictError;
    }
    const afterStale = JSON.stringify(session.store.getCampaign(session.context));
    const databasePath = join(session.directory, "engine.db");
    session.store.close();
    const reopened = new LanternEngineStore(databasePath);
    session.store = reopened;
    const restored = reopened.getCampaign(session.context);
    const replayAfterRestart = reopened.executeCommand({
      context: session.context,
      clientCommandId: id,
      expectedCampaignVersion: first.beforeVersion,
      command,
      tool: "situation_ignore",
      playerText: "I wait one hour.",
      resolve: () => { throw new Error("restart replay must not re-enter the resolver"); },
    });
    const assertions = [
      assertion("first submission commits once", first.result.accepted && !first.result.replayed, `replayed=${first.result.replayed}`),
      assertion("same command id replays the stored result", replay.result.replayed && replay.result.event?.id === first.result.event?.id, `replayed=${replay.result.replayed}`),
      assertion("replay does not add a second event", eventsAfterReplay.length === eventsAfterFirst.length, `events=${eventsAfterReplay.length}`),
      assertion("replay preserves state and version", JSON.stringify(replay.result.state) === JSON.stringify(first.result.state), `version=${replay.result.state.version}`),
      assertion("stale new command is rejected immutably", staleRejected && beforeStale === afterStale, `staleRejected=${staleRejected}`),
      assertion("restart preserves replay identity", restored.version === first.result.state.version && replayAfterRestart.replayed && replayAfterRestart.event?.id === first.result.event?.id, `replayed=${replayAfterRestart.replayed}`),
    ];
    return makeTrace("duplicate-submission", "Duplicate submission is exactly once", "duplicate-mutation", "I wait one hour.", "situation_ignore", [first, replay], assertions, { extraCommandIds: [id] });
  } finally {
    closeSession(session);
  }
}

async function runModelTimeoutAfterCommit(): Promise<GauntletTrace> {
  const session = sessionFor("model-timeout-after-commit");
  const originalFetch = globalThis.fetch;
  try {
    setupCharacter(session, "Timeout Tester");
    const command = ruinedGatehouseWorldContextCommand();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        const chunk = {
          id: "gauntlet-stream",
          object: "chat.completion.chunk",
          created: 0,
          model: "fixture/model",
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [{
                index: 0,
                id: "gauntlet-world-context",
                type: "function",
                function: { name: "world_context", arguments: JSON.stringify(command) },
              }],
            },
            finish_reason: "tool_calls",
          }],
        };
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      throw new Error("gauntlet-timeout-after-commit");
    }) as typeof fetch;
    const dm = new LanternDungeonMaster(session.store, {
      apiKey: "deterministic-fixture-key",
      baseUrl: "https://deterministic.invalid/v1",
      model: "fixture/model",
      reasoningEffort: "low",
      maxTokens: 128,
      siteUrl: "https://lantern.invalid",
      appName: "Lantern deterministic gauntlet",
    });
    const id = "model-timeout-after-commit-command";
    const beforeVersion = session.state.version;
    const result = await dm.resolveTurn(
      session.context,
      session.state,
      id,
      beforeVersion,
      "I establish the ruined gatehouse context before the narrator times out.",
    );
    globalThis.fetch = originalFetch;
    session.state = result.state;
    const storedEvents = session.store.listCampaignEvents(session.context);
    const assertions = [
      assertion("mechanics commit before model timeout", result.accepted && result.event !== null, `accepted=${result.accepted}`),
      assertion("rules fallback is explicit", result.narrationSource === "rules" && result.narration.text.length > 0, `source=${result.narrationSource}`),
      assertion("atomic commit increments once", result.state.version === beforeVersion + 1 && storedEvents.length === 2, `version=${result.state.version} events=${storedEvents.length}`),
      assertion("no second provider attempt is persisted as a mutation", calls === 2, `fetchCalls=${calls}`),
    ];
    return makeTrace("model-timeout-after-commit", "A model timeout cannot roll back committed mechanics", "partial-commit", "I establish the ruined gatehouse context before the narrator times out.", "world_context followed by narrator timeout", [{ command: engineCommandSchema.parse(command), result, beforeVersion }], assertions, {
      telemetry: { provider: "deterministic-timeout-fixture", timeoutMs: 25_000, timedOut: true },
    });
  } finally {
    globalThis.fetch = originalFetch;
    closeSession(session);
  }
}

export async function runGauntletScenario(scenarioId: GauntletScenarioId): Promise<GauntletTrace> {
  switch (scenarioId) {
    case "ignore-hook": return runIgnoreHook();
    case "creative-environmental-action": return runCreativeEnvironmentalAction();
    case "negotiation-avoids-combat": return runNegotiationAvoidsCombat();
    case "failed-essential-clue": return runFailedEssentialClue();
    case "repeated-identical-search": return runRepeatedIdenticalSearch();
    case "changed-approach": return runChangedApproach();
    case "surrender-instead-of-fighting": return runSurrenderInsteadOfFighting();
    case "hidden-information-probe": return runHiddenInformationProbe();
    case "duplicate-submission": return runDuplicateSubmission();
    case "model-timeout-after-commit": return runModelTimeoutAfterCommit();
  }
}

function scorecard(scenarioId: GauntletScenarioId): ExperienceScorecard {
  return {
    scenarioId,
    rubricVersion: GAUNTLET_RUBRIC_VERSION,
    reviewer: "independent-human",
    status: "pending",
    modelSelfScoreUsed: false,
    dimensions: {
      agency: null,
      fairness: null,
      clarity: null,
      discovery: null,
      characterRelevance: null,
      pacing: null,
      continuity: null,
      trust: null,
      nextAffordance: null,
      boundaryRespect: null,
    },
    notes: ["Awaiting an independent human playtest; the harness never self-scores player experience."],
  };
}

export function stableGauntletDigest(traces: readonly GauntletTrace[]): string {
  const summary = traces.map((trace) => ({
    fixtureVersion: trace.fixtureVersion,
    rubricVersion: trace.rubricVersion,
    scenarioId: trace.scenarioId,
    hardPass: trace.hardPass,
    tools: trace.events.map((event) => [event.tool, event.outcome, event.version]),
    continuation: trace.finalContinuation.status,
    provider: trace.telemetry.provider,
    timedOut: trace.telemetry.timedOut,
  }));
  return createHash("sha256").update(JSON.stringify(summary)).digest("hex");
}

export function compareGauntletBaseline(report: { fixtureVersion: string; rubricVersion: string; traces: readonly GauntletTrace[]; hardPass: boolean; baselineDigest?: string }): boolean {
  return report.fixtureVersion === GAUNTLET_FIXTURE_VERSION
    && report.rubricVersion === GAUNTLET_RUBRIC_VERSION
    && report.traces.length === GAUNTLET_SCENARIO_IDS.length
    && report.traces.every((trace, index) => trace.scenarioId === GAUNTLET_SCENARIO_IDS[index] && trace.fixtureVersion === GAUNTLET_FIXTURE_VERSION && trace.rubricVersion === GAUNTLET_RUBRIC_VERSION && trace.hardPass)
    && stableGauntletDigest(report.traces) === GAUNTLET_EXPECTED_BASELINE_DIGEST
    && (!report.baselineDigest || report.baselineDigest === GAUNTLET_EXPECTED_BASELINE_DIGEST)
    && report.hardPass;
}

export async function runDeterministicGauntlet(): Promise<GauntletReport> {
  const traces = [] as GauntletTrace[];
  for (const scenarioId of GAUNTLET_SCENARIO_IDS) traces.push(await runGauntletScenario(scenarioId));
  const hardPass = traces.every((trace) => trace.hardPass);
  return {
    fixtureVersion: GAUNTLET_FIXTURE_VERSION,
    rubricVersion: GAUNTLET_RUBRIC_VERSION,
    generatedAt: new Date().toISOString(),
    traces,
    scorecards: GAUNTLET_SCENARIO_IDS.map(scorecard),
    baseline: {
      version: GAUNTLET_BASELINE_VERSION,
      digest: stableGauntletDigest(traces),
      compatible: compareGauntletBaseline({ fixtureVersion: GAUNTLET_FIXTURE_VERSION, rubricVersion: GAUNTLET_RUBRIC_VERSION, traces, hardPass, baselineDigest: stableGauntletDigest(traces) }),
    },
    hardPass,
  };
}
