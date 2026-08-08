import type {
  EngineNpc,
  EngineSituation,
  EngineSituationChoice,
  EngineSituationClue,
  EngineSituationProjection,
  EngineSituationRevelation,
  EngineSituationTruth,
  EngineRandomEventResolution,
  EngineWorldContext,
  EngineWorldFact,
  EngineWorldObjectInstance,
  LanternCampaignState,
} from "./engine-contracts.js";

const SITUATION_RULES_VERSION = "situations-v1";
const PRESSURE_INTERVAL_MINUTES = 60;

const NODE_DEFINITIONS = [
  { id: "watchtower-road", title: "The Watchtower Road", description: "A rutted road approaches a burned watchtower from the south.", exitIds: ["watchtower-yard"] },
  { id: "watchtower-yard", title: "The Abandoned Yard", description: "A collapsed yard holds a cold brazier, fresh boot prints, and a silent warden.", exitIds: ["watchtower-road", "watchtower-vault"] },
  { id: "watchtower-vault", title: "The Relic Vault", description: "A cracked stair ends at a vault where the old signal relic rests under dust.", exitIds: ["watchtower-yard"] },
] as const;

const TRUTH_DEFINITIONS = [
  { id: "watchtower-truth-warden", title: "The warden hid the patrol route", description: "The warden diverted the patrol to protect a displaced village.", visibility: "hidden" as const },
  { id: "watchtower-truth-relic", title: "The relic is a warning device", description: "The relic can warn the village before the next patrol arrives.", visibility: "hidden" as const },
  { id: "watchtower-truth-pressure", title: "The next patrol is already moving", description: "A patrol is following the old route and will reach the village if nobody intervenes.", visibility: "hidden" as const },
] as const;

const CLUE_DEFINITIONS = [
  { id: "watchtower-clue-map", title: "A marked patrol map", locationId: "watchtower-yard", revelationId: "watchtower-revelation-central", factId: "watchtower-fact-map", difficultyBand: "gentle" as const },
  { id: "watchtower-clue-boots", title: "Fresh boot prints", locationId: "watchtower-road", revelationId: "watchtower-revelation-central", factId: "watchtower-fact-boots", difficultyBand: "challenging" as const },
  { id: "watchtower-clue-inscription", title: "A scratched warning inscription", locationId: "watchtower-vault", revelationId: "watchtower-revelation-central", factId: "watchtower-fact-inscription", difficultyBand: "standard" as const },
  { id: "watchtower-clue-relic", title: "The relic's old warning plate", locationId: "watchtower-vault", revelationId: "watchtower-revelation-relic", factId: "watchtower-fact-relic", difficultyBand: "gentle" as const },
  { id: "watchtower-clue-signal", title: "A signal schedule", locationId: "watchtower-yard", revelationId: "watchtower-revelation-pressure", factId: "watchtower-fact-signal", difficultyBand: "standard" as const },
] as const;

const OBJECT_ID = "watchtower-relic";
const PREFERRED_ACTOR_ID = "watchtower-warden";
const FALLBACK_ID = "watchtower-inscription";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixtureNpc(): EngineNpc {
  return {
    id: PREFERRED_ACTOR_ID,
    name: "Mara, the displaced warden",
    description: "A tired warden who knows why the patrol route changed.",
    disposition: "neutral",
    goals: ["protect the displaced village", "keep the patrol from finding the relic"],
    socialDc: 14,
    relationshipScore: 0,
    memories: [],
  };
}

function fixtureObject(sceneId: string, sourceCommandId: string, sourceVersion: number): EngineWorldObjectInstance {
  const now = new Date().toISOString();
  return {
    id: OBJECT_ID,
    sceneId,
    definition: {
      key: "watchtower-relic-v1",
      sourceRef: "reviewed-situation:watchtower-relic-v1",
      name: "Old Signal Relic",
      description: "A brass signal device that can warn the village.",
      material: "metal",
      tags: ["critical", "relic", "breakable"],
      affordances: ["inspect", "take", "drop", "break"],
      prerequisites: [],
      effectInteractions: [],
      weight: 4,
      criticalPolicy: {
        kind: "alternate_path",
        canDestroy: true,
        canLose: true,
        canSell: false,
        canConsume: false,
        canHide: true,
        recoveryRef: FALLBACK_ID,
      },
    },
    state: "intact",
    locationRef: "watchtower-vault",
    ownerRef: { kind: "world", id: sceneId },
    containerRef: null,
    revision: 1,
    provenance: { sourceCommandId, sourceVersion, occurredAt: now },
  };
}

function fixtureWorldFact(
  id: string,
  title: string,
  description: string,
  sceneId: string,
): EngineWorldFact {
  const now = new Date().toISOString();
  return {
    id,
    kind: "secret",
    title,
    description,
    visibility: "hidden",
    obscurity: "dark",
    requiredSense: "normal",
    passiveDc: null,
    sceneId,
    revision: 1,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function instantiateWatchtowerSituation(
  state: LanternCampaignState,
  sourceCommandId: string,
  sourceVersion: number,
  sourceRandomEventId: string | null = null,
  sourceRandomEvent: EngineRandomEventResolution | null = null,
): { situation: EngineSituation; worldContext: EngineWorldContext; worldFacts: EngineWorldFact[] } {
  const situationId = `situation:${sourceCommandId}`;
  const sceneId = state.worldContext?.id ?? `scene:${situationId}`;
  const current = state.worldContext;
  const nodeIds = NODE_DEFINITIONS.map((node) => node.id);
  const object = fixtureObject(sceneId, sourceCommandId, sourceVersion);
  const existingNpc = current?.npcs.find((npc) => npc.id === PREFERRED_ACTOR_ID);
  const existingObject = current?.objects.find((candidate) => candidate.id === OBJECT_ID);
  const nodes = NODE_DEFINITIONS.map((node) => ({ ...node, exitIds: [...node.exitIds] }));
  const truths: EngineSituationTruth[] = TRUTH_DEFINITIONS.map((truth) => ({ ...truth, discoveredBy: [] }));
  const revelations: EngineSituationRevelation[] = [
    { id: "watchtower-revelation-central", title: "Who changed the patrol route", truthId: TRUTH_DEFINITIONS[0].id, clueIds: CLUE_DEFINITIONS.filter((clue) => clue.revelationId === "watchtower-revelation-central").map((clue) => clue.id), status: "hidden" },
    { id: "watchtower-revelation-relic", title: "What the relic can do", truthId: TRUTH_DEFINITIONS[1].id, clueIds: ["watchtower-clue-relic"], status: "hidden" },
    { id: "watchtower-revelation-pressure", title: "What happens if nobody acts", truthId: TRUTH_DEFINITIONS[2].id, clueIds: ["watchtower-clue-signal"], status: "hidden" },
  ];
  const clues: EngineSituationClue[] = CLUE_DEFINITIONS.map((clue) => ({
    ...clue,
    challengeId: "barred-door-v1",
    difficultyBand: clue.difficultyBand,
    foundBy: [],
    attempts: 0,
    failedAttempts: 0,
    lastComplication: null,
  }));
  const situation: EngineSituation = {
    id: situationId,
    templateId: "watchtower-relic-v1",
    status: "active",
    currentLocationId: "watchtower-road",
    visitedLocationIds: ["watchtower-road"],
    nodes,
    truths,
    revelations,
    clues,
    role: {
      id: "watchtower-reveal-role",
      capability: "reveal_location",
      preferredRef: PREFERRED_ACTOR_ID,
      alternateRefs: [OBJECT_ID],
      fallbackRef: FALLBACK_ID,
      activeSourceRef: existingNpc ? PREFERRED_ACTOR_ID : FALLBACK_ID,
      status: existingNpc ? "preferred" : "fallback",
    },
    pressure: {
      id: "watchtower-patrol-pressure",
      title: "The patrol closes on the village",
      current: 0,
      max: 3,
      nextAdvanceAtMinutes: state.time.gameTime.totalMinutes + PRESSURE_INTERVAL_MINUTES,
      lastAdvancedAtMinutes: null,
      defaultDevelopmentId: "watchtower-patrol-arrives",
      defaultDevelopmentApplied: false,
    },
    criticalObject: {
      objectId: OBJECT_ID,
      policy: clone(object.definition.criticalPolicy),
      acquiredByActorId: existingObject?.ownerRef.kind === "actor" ? existingObject.ownerRef.id : null,
      destroyed: existingObject?.state === "destroyed",
      reaction: existingObject?.state === "destroyed"
        ? "declared-loss"
        : existingObject?.ownerRef.kind === "actor" ? "retained-early" : "none",
    },
    outcome: null,
    sourceRandomEventId,
    revision: 1,
    complicationCount: 0,
    lastComplication: null,
    provenance: {
      sourceCommandId,
      sourceVersion,
      rulesVersion: SITUATION_RULES_VERSION,
      sourceRandomEvent: sourceRandomEvent
        ? {
            id: sourceRandomEvent.id,
            tableId: sourceRandomEvent.tableId,
            tableVersion: sourceRandomEvent.tableVersion,
            entryId: sourceRandomEvent.selectedEntryId ?? "manual-entry",
          }
        : null,
    },
  };
  const worldContext: EngineWorldContext = current
    ? {
        ...clone(current),
        features: [...new Set([...current.features, ...nodeIds, FALLBACK_ID, OBJECT_ID])],
        npcs: existingNpc ? clone(current.npcs) : [...clone(current.npcs), fixtureNpc()],
        objects: existingObject ? clone(current.objects) : [...clone(current.objects), object],
      }
    : {
        id: sceneId,
        title: "The Watchtower's Unquiet Light",
        description: "An abandoned watchtower hides a choice that can change the village's fate.",
        features: [...nodeIds, FALLBACK_ID, OBJECT_ID],
        exits: [
          { id: "watchtower-yard", label: "the abandoned yard" },
          { id: "watchtower-vault", label: "the relic vault" },
        ],
        npcs: [fixtureNpc()],
        merchants: [],
        objects: [object],
      };
  const worldFacts = [
    ...TRUTH_DEFINITIONS.map((truth) => fixtureWorldFact(truth.id, truth.title, truth.description, sceneId)),
    ...CLUE_DEFINITIONS.map((clue) => fixtureWorldFact(clue.factId, clue.title, `Evidence found at ${clue.locationId}.`, sceneId)),
  ];
  return { situation, worldContext, worldFacts };
}

export function reconcileSituation(situation: EngineSituation, state: LanternCampaignState): EngineSituation {
  const next = clone(situation);
  const preferred = state.worldContext?.npcs.find((npc) => {
    if (npc.id !== next.role.preferredRef) return false;
    if (npc.disposition === "hostile") return false;
    if (!npc.agency) return true;
    return npc.agency.lifecycleState === "conscious"
      && (!state.worldContext || npc.agency.locationRef === state.worldContext.id);
  });
  const fallbackAvailable = Boolean(
    state.worldContext?.features.includes(next.role.fallbackRef)
      || state.worldContext?.objects.some((object) => object.id === next.role.fallbackRef && object.state !== "destroyed"),
  );
  next.role.status = preferred ? "preferred" : fallbackAvailable ? "fallback" : "impossible";
  next.role.activeSourceRef = preferred?.id ?? (fallbackAvailable ? next.role.fallbackRef : null);
  const object = state.worldContext?.objects.find((candidate) => candidate.id === next.criticalObject.objectId);
  next.criticalObject.acquiredByActorId = object?.ownerRef.kind === "actor" ? object.ownerRef.id : null;
  next.criticalObject.destroyed = object?.state === "destroyed";
  next.criticalObject.reaction = next.criticalObject.destroyed
    ? "declared-loss"
    : next.criticalObject.acquiredByActorId ? "retained-early" : "none";
  return next;
}

export function normalizeSituation(value: unknown, state: LanternCampaignState): EngineSituation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EngineSituation>;
  if (
    candidate.templateId !== "watchtower-relic-v1"
    || typeof candidate.id !== "string"
    || !Array.isArray(candidate.nodes)
    || !Array.isArray(candidate.truths)
    || !Array.isArray(candidate.revelations)
    || !Array.isArray(candidate.clues)
    || !candidate.role
    || !candidate.pressure
    || !candidate.criticalObject
    || !candidate.provenance
  ) return null;
  const normalized = clone(candidate as EngineSituation);
  normalized.provenance = {
    ...normalized.provenance,
    sourceRandomEvent: normalized.provenance.sourceRandomEvent ?? null,
  };
  return reconcileSituation(normalized, state);
}

export function advanceSituationPressure(situation: EngineSituation, beforeMinutes: number, afterMinutes: number): EngineSituation {
  const next = clone(situation);
  if (next.status !== "active" || afterMinutes < next.pressure.nextAdvanceAtMinutes) return next;
  const advances = Math.max(1, Math.floor((afterMinutes - next.pressure.nextAdvanceAtMinutes) / PRESSURE_INTERVAL_MINUTES) + 1);
  next.pressure.current = Math.min(next.pressure.max, next.pressure.current + advances);
  next.pressure.lastAdvancedAtMinutes = next.pressure.nextAdvanceAtMinutes;
  next.pressure.nextAdvanceAtMinutes += advances * PRESSURE_INTERVAL_MINUTES;
  if (next.pressure.current >= next.pressure.max) next.pressure.defaultDevelopmentApplied = true;
  void beforeMinutes;
  return next;
}

export function situationChoiceAllowed(
  situation: EngineSituation,
  state: LanternCampaignState,
  choice: EngineSituationChoice,
): { allowed: true } | { allowed: false; reason: string } {
  if (situation.status !== "active") return { allowed: false, reason: "This situation already has a committed outcome." };
  if (choice === "walk-away") return { allowed: true };
  const central = situation.revelations.find((revelation) => revelation.id === "watchtower-revelation-central")?.status === "revealed";
  if (!central) return { allowed: false, reason: "The central revelation is not established yet; choose a clue path or walk away." };
  if (choice === "expose" && situation.role.status !== "fallback") return { allowed: false, reason: "Exposing the concealed truth requires the preferred source to be gone and the fallback to be active." };
  if (choice === "bargain" && situation.role.status !== "preferred") return { allowed: false, reason: "Bargaining requires the concealed actor to remain available." };
  if (choice === "solve" && situation.criticalObject.destroyed) return { allowed: false, reason: "The critical object is destroyed; follow the declared alternate route instead of restoring it." };
  if (choice === "solve" && situation.role.status === "impossible") return { allowed: false, reason: "No functional source remains for the situation's reveal role." };
  void state;
  return { allowed: true };
}

export function projectSituationForActor(
  situation: EngineSituation,
  state: LanternCampaignState,
  actorId: string,
): EngineSituationProjection {
  const knownFactIds = new Set(
    state.actorKnowledge
      .filter((record) => record.actorId === actorId && !record.stale && (record.tier === "known" || record.tier === "perceived"))
      .map((record) => record.factId),
  );
  const truths = situation.truths
    .filter((truth) => truth.visibility === "public" || knownFactIds.has(truth.id) || truth.discoveredBy.includes(actorId))
    .map((truth) => ({
      id: truth.id,
      title: truth.title,
      visibility: truth.visibility,
      description: truth.description,
      discovered: truth.visibility === "public" || knownFactIds.has(truth.id) || truth.discoveredBy.includes(actorId),
    }));
  const discoveredRevelationIds = new Set(
    situation.revelations
      .filter((revelation) => revelation.status === "revealed" && situation.truths.find((truth) => truth.id === revelation.truthId)?.discoveredBy.includes(actorId))
      .map((revelation) => revelation.id),
  );
  return {
    id: situation.id,
    templateId: situation.templateId,
    status: situation.status,
    currentLocationId: situation.currentLocationId,
    visitedLocationIds: [...situation.visitedLocationIds],
    nodes: clone(situation.nodes),
    truths,
    revelations: situation.revelations.map((revelation) => ({
      id: revelation.id,
      title: discoveredRevelationIds.has(revelation.id) ? revelation.title : "Unresolved lead",
      status: discoveredRevelationIds.has(revelation.id) ? "revealed" : "hidden",
    })),
    clues: situation.clues.map((clue) => {
      const { factId: _factId, ...safeClue } = clone(clue);
      return {
        ...safeClue,
        foundBy: clue.foundBy.includes(actorId) ? [actorId] : [],
      };
    }),
    role: {
      id: situation.role.id,
      capability: situation.role.capability,
      alternateRefs: [...situation.role.alternateRefs],
      fallbackRef: situation.role.fallbackRef,
      activeSourceRef: situation.role.activeSourceRef,
      status: situation.role.status,
      preferredAvailable: situation.role.status === "preferred",
    },
    pressure: {
      id: situation.pressure.id,
      title: situation.pressure.title,
      current: situation.pressure.current,
      max: situation.pressure.max,
      lastAdvancedAtMinutes: situation.pressure.lastAdvancedAtMinutes,
      defaultDevelopmentId: situation.pressure.defaultDevelopmentId,
      defaultDevelopmentApplied: situation.pressure.defaultDevelopmentApplied,
    },
    criticalObject: clone(situation.criticalObject),
    outcome: clone(situation.outcome),
    sourceRandomEventId: situation.sourceRandomEventId,
    revision: situation.revision,
    complicationCount: situation.complicationCount,
    lastComplication: situation.lastComplication,
  };
}

export function situationClueFactIds(situation: EngineSituation, clueId: string): string[] {
  const clue = situation.clues.find((candidate) => candidate.id === clueId);
  if (!clue) return [];
  const revelation = situation.revelations.find((candidate) => candidate.id === clue.revelationId);
  return [clue.factId, ...(revelation ? [revelation.truthId] : [])];
}

export const situationPressureIntervalMinutes = PRESSURE_INTERVAL_MINUTES;
