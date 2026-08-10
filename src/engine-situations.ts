import { createHash } from "node:crypto";
import { engineSituationDefinitionProposalSchema } from "./engine-contracts.js";
import type {
  EngineRandomEventResolution,
  EngineSituation,
  EngineSituationActor,
  EngineSituationClue,
  EngineSituationDefinitionProposal,
  EngineSituationOutcomeDefinition,
  EngineSituationProjection,
  EngineSituationReference,
  EngineSituationRevelation,
  EngineSituationRole,
  EngineSituationTruth,
  EngineWorldFact,
  LanternCampaignState,
} from "./engine-contracts.js";

const SITUATION_RULES_VERSION = "situations-v2";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function childId(namespace: string, kind: string, key: string): string {
  return `sit:${namespace}:${kind}:${key}`;
}

function canonicalActorExists(state: LanternCampaignState, actorRef: string): boolean {
  return actorRef === state.actorId
    || actorRef === state.character.id
    || state.controlledActors.some((actor) => actor.id === actorRef)
    || Boolean(state.worldContext?.npcs.some((npc) => npc.id === actorRef));
}

function canonicalReferenceExists(
  state: LanternCampaignState,
  reference: EngineSituationReference,
): boolean {
  const world = state.worldContext;
  switch (reference.kind) {
    case "actor":
      return canonicalActorExists(state, reference.ref);
    case "object":
      return Boolean(world?.objects.some((object) => object.id === reference.ref));
    case "feature":
      return Boolean(
        world?.id === reference.ref
          || world?.features.includes(reference.ref)
          || world?.exits.some((exit) => exit.id === reference.ref),
      );
    case "node":
    case "clue":
      return true;
  }
}

function referenceAvailable(
  situation: EngineSituation,
  state: LanternCampaignState,
  reference: EngineSituationReference,
): boolean {
  const world = state.worldContext;
  switch (reference.kind) {
    case "actor": {
      if (reference.ref === state.actorId || reference.ref === state.character.id) return true;
      if (state.controlledActors.some((actor) => actor.id === reference.ref)) return true;
      const npc = world?.npcs.find((candidate) => candidate.id === reference.ref);
      if (!npc) return false;
      if (!npc.agency) return true;
      return npc.agency.lifecycleState === "conscious"
        && (!world || npc.agency.locationRef === world.id);
    }
    case "object":
      return Boolean(world?.objects.some((object) => object.id === reference.ref && object.state !== "destroyed"));
    case "feature":
      return Boolean(
        world?.id === reference.ref
          || world?.features.includes(reference.ref)
          || world?.exits.some((exit) => exit.id === reference.ref),
      );
    case "node":
      return situation.nodes.some((node) => node.id === reference.ref);
    case "clue":
      return situation.clues.some((clue) => clue.id === reference.ref);
  }
}

function worldFact(
  id: string,
  title: string,
  description: string,
  visibility: "public" | "hidden",
  sceneId: string,
): EngineWorldFact {
  const now = new Date().toISOString();
  return {
    id,
    kind: visibility === "hidden" ? "secret" : "area",
    title,
    description,
    visibility,
    obscurity: visibility === "hidden" ? "dark" : "clear",
    requiredSense: "normal",
    passiveDc: null,
    sceneId,
    revision: 1,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export type SituationCompileResult =
  | {
      ok: true;
      situation: EngineSituation;
      worldFacts: EngineWorldFact[];
      actorKnowledge: Array<{ actorId: string; factId: string }>;
    }
  | { ok: false; code: string; message: string };

export function compileSituationDefinition(
  state: LanternCampaignState,
  proposal: EngineSituationDefinitionProposal,
  sourceCommandId: string,
  sourceVersion: number,
  sourceRandomEventId: string | null = null,
  sourceRandomEvent: EngineRandomEventResolution | null = null,
): SituationCompileResult {
  const parsed = engineSituationDefinitionProposalSchema.safeParse(proposal);
  if (!parsed.success) {
    return { ok: false, code: "situation_definition_invalid", message: parsed.error.issues[0]?.message ?? "The situation definition is invalid." };
  }
  const definition = parsed.data;
  const reachable = new Set<string>();
  const pending = [definition.initialNodeKey];
  while (pending.length > 0) {
    const key = pending.shift()!;
    if (reachable.has(key)) continue;
    reachable.add(key);
    const node = definition.nodes.find((candidate) => candidate.key === key);
    for (const exitKey of node?.exitKeys ?? []) pending.push(exitKey);
  }
  if (reachable.size !== definition.nodes.length) {
    return { ok: false, code: "situation_graph_disconnected", message: "Every situation node must be reachable from the initial node." };
  }
  for (const actor of definition.actors) {
    if (!canonicalActorExists(state, actor.actorRef)) {
      return { ok: false, code: "situation_actor_not_found", message: `Situation actor ${actor.actorRef} is not canonical in this campaign.` };
    }
  }
  const namespace = hash(definition.key).slice(0, 12);
  const situationId = `situation:${definition.key}`;
  const nodeIds = new Map(definition.nodes.map((node) => [node.key, childId(namespace, "node", node.key)]));
  const truthIds = new Map(definition.truths.map((truth) => [truth.key, childId(namespace, "truth", truth.key)]));
  const revelationIds = new Map(definition.revelations.map((revelation) => [revelation.key, childId(namespace, "revelation", revelation.key)]));
  const clueIds = new Map(definition.clues.map((clue) => [clue.key, childId(namespace, "clue", clue.key)]));
  const roleIds = new Map(definition.roles.map((role) => [role.key, childId(namespace, "role", role.key)]));
  const outcomeIds = new Map(definition.outcomes.map((outcome) => [outcome.key, childId(namespace, "outcome", outcome.key)]));
  const compileReference = (reference: EngineSituationReference): EngineSituationReference => ({
    kind: reference.kind,
    ref: reference.kind === "node"
      ? nodeIds.get(reference.ref)!
      : reference.kind === "clue" ? clueIds.get(reference.ref)! : reference.ref,
  });
  for (const role of definition.roles) {
    for (const input of [role.preferred, ...role.alternates, role.fallback]) {
      const reference = compileReference(input);
      if (!canonicalReferenceExists(state, reference)) {
        return { ok: false, code: "situation_role_reference_not_found", message: `Situation role reference ${input.kind}:${input.ref} is not canonical in this campaign.` };
      }
    }
  }
  const criticalObject = definition.criticalObject
    ? state.worldContext?.objects.find((object) => object.id === definition.criticalObject!.objectId)
    : undefined;
  if (definition.criticalObject && !criticalObject) {
    return { ok: false, code: "situation_critical_object_not_found", message: "A situation can reference only an already-canonical critical object." };
  }
  const sceneId = state.worldContext?.id ?? `scene:${situationId}`;
  const facts = [
    ...definition.truths.map((truth) => worldFact(truthIds.get(truth.key)!, truth.title, truth.description, truth.visibility, sceneId)),
    ...definition.clues.map((clue) => worldFact(childId(namespace, "clue-fact", clue.key), clue.title, clue.finding, "hidden", sceneId)),
  ];
  for (const fact of facts) {
    const existing = state.worldFacts.find((candidate) => candidate.id === fact.id);
    if (existing && (
      existing.title !== fact.title
      || existing.description !== fact.description
      || existing.visibility !== fact.visibility
      || existing.kind !== fact.kind
      || existing.sceneId !== fact.sceneId
      || !existing.active
    )) {
      return { ok: false, code: "situation_fact_conflict", message: "A committed world fact identity cannot be replaced by situation authoring." };
    }
  }
  const nodes = definition.nodes.map((node) => ({
    id: nodeIds.get(node.key)!,
    title: node.title,
    description: node.description,
    visibility: node.visibility,
    exitIds: node.exitKeys.map((key) => nodeIds.get(key)!),
  }));
  const truths: EngineSituationTruth[] = definition.truths.map((truth) => ({
    id: truthIds.get(truth.key)!,
    title: truth.title,
    description: truth.description,
    visibility: truth.visibility,
    discoveredBy: [],
  }));
  const revelations: EngineSituationRevelation[] = definition.revelations.map((revelation) => ({
    id: revelationIds.get(revelation.key)!,
    title: revelation.title,
    truthId: truthIds.get(revelation.truthKey)!,
    clueIds: definition.clues.filter((clue) => clue.revelationKey === revelation.key).map((clue) => clueIds.get(clue.key)!),
    status: "hidden",
  }));
  const clues: EngineSituationClue[] = definition.clues.map((clue) => ({
    id: clueIds.get(clue.key)!,
    title: clue.title,
    finding: clue.finding,
    visibility: clue.visibility,
    locationId: nodeIds.get(clue.nodeKey)!,
    revelationId: revelationIds.get(clue.revelationKey)!,
    factId: childId(namespace, "clue-fact", clue.key),
    challengeId: "situation-clue-v1",
    difficultyBand: clue.difficultyBand,
    foundBy: [],
    attempts: 0,
    failedAttempts: 0,
    lastComplication: null,
  }));
  const actors: EngineSituationActor[] = definition.actors.map((actor) => ({ actorRef: actor.actorRef, goals: [...actor.goals] }));
  const roles: EngineSituationRole[] = definition.roles.map((role) => ({
    id: roleIds.get(role.key)!,
    capability: role.capability,
    preferred: compileReference(role.preferred),
    alternates: role.alternates.map(compileReference),
    fallback: compileReference(role.fallback),
    activeSource: null,
    status: "impossible",
  }));
  const outcomes: EngineSituationOutcomeDefinition[] = definition.outcomes.map((outcome) => ({
    id: outcomeIds.get(outcome.key)!,
    key: outcome.key,
    title: outcome.title,
    terminalStatus: outcome.terminalStatus,
    reactivityTier: outcome.reactivityTier,
    requirements: outcome.requirements.map((requirement) => {
      switch (requirement.kind) {
        case "revelation_revealed":
          return { kind: requirement.kind, revelationId: revelationIds.get(requirement.revelationKey)! };
        case "role_status":
          return { kind: requirement.kind, roleId: roleIds.get(requirement.roleKey)!, statuses: [...requirement.statuses] };
        case "critical_object_state":
          return { ...requirement };
        case "pressure_at_least":
          return { ...requirement };
      }
    }),
  }));
  const situation: EngineSituation = {
    id: situationId,
    definitionKey: definition.key,
    title: definition.title,
    summary: definition.summary,
    definitionHash: hash(definition),
    status: "active",
    currentLocationId: nodeIds.get(definition.initialNodeKey)!,
    visitedLocationIds: [nodeIds.get(definition.initialNodeKey)!],
    nodes,
    truths,
    revelations,
    clues,
    actors,
    roles,
    pressure: {
      id: childId(namespace, "pressure", definition.pressure.key),
      title: definition.pressure.title,
      current: 0,
      max: definition.pressure.max,
      intervalMinutes: definition.pressure.intervalMinutes,
      nextAdvanceAtMinutes: state.time.gameTime.totalMinutes + definition.pressure.intervalMinutes,
      lastAdvancedAtMinutes: null,
      defaultDevelopment: {
        id: childId(namespace, "development", definition.pressure.defaultDevelopment.key),
        title: definition.pressure.defaultDevelopment.title,
        description: definition.pressure.defaultDevelopment.description,
      },
      defaultDevelopmentApplied: false,
    },
    criticalObject: criticalObject
      ? {
          objectId: criticalObject.id,
          policy: clone(criticalObject.definition.criticalPolicy),
          acquiredByActorId: criticalObject.ownerRef.kind === "actor" ? criticalObject.ownerRef.id : null,
          destroyed: criticalObject.state === "destroyed",
          reaction: criticalObject.state === "destroyed"
            ? "declared-loss"
            : criticalObject.ownerRef.kind === "actor" ? "retained-early" : "none",
        }
      : null,
    outcomes,
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
            entryId: sourceRandomEvent.selectedEntryId ?? "unselected-entry",
          }
        : null,
    },
  };
  return {
    ok: true,
    situation: reconcileSituation(situation, state),
    worldFacts: facts,
    actorKnowledge: definition.actors.flatMap((actor) => actor.knowsTruthKeys.map((truthKey) => ({
      actorId: actor.actorRef,
      factId: truthIds.get(truthKey)!,
    }))),
  };
}

function legacyReference(state: LanternCampaignState, situation: EngineSituation, ref: string): EngineSituationReference {
  if (canonicalActorExists(state, ref)) return { kind: "actor", ref };
  if (state.worldContext?.objects.some((object) => object.id === ref)) return { kind: "object", ref };
  if (situation.nodes.some((node) => node.id === ref)) return { kind: "node", ref };
  if (situation.clues.some((clue) => clue.id === ref)) return { kind: "clue", ref };
  return { kind: "feature", ref };
}

function normalizeLegacySituation(value: Record<string, unknown>, state: LanternCampaignState): EngineSituation | null {
  if (value.templateId !== "watchtower-relic-v1") return null;
  const legacy = value as unknown as {
    id: string;
    templateId: string;
    status: EngineSituation["status"];
    currentLocationId: string;
    visitedLocationIds: string[];
    nodes: Array<Omit<EngineSituation["nodes"][number], "visibility">>;
    truths: EngineSituationTruth[];
    revelations: EngineSituationRevelation[];
    clues: Array<Omit<EngineSituationClue, "finding" | "visibility">>;
    role: {
      id: string;
      capability: string;
      preferredRef: string;
      alternateRefs: string[];
      fallbackRef: string;
      activeSourceRef: string | null;
      status: "preferred" | "fallback" | "impossible";
    };
    pressure: {
      id: string;
      title: string;
      current: number;
      max: number;
      nextAdvanceAtMinutes: number;
      lastAdvancedAtMinutes: number | null;
      defaultDevelopmentId: string;
      defaultDevelopmentApplied: boolean;
    };
    criticalObject: NonNullable<EngineSituation["criticalObject"]>;
    outcome: ({ choice: string; committedAtMinutes: number; sourceCommandId: string; reactivityTier: EngineSituation["outcomes"][number]["reactivityTier"] } | null);
    sourceRandomEventId: string | null;
    revision: number;
    complicationCount: number;
    lastComplication: string | null;
    provenance: EngineSituation["provenance"];
  };
  if (!legacy.id || !Array.isArray(legacy.nodes) || !Array.isArray(legacy.truths) || !Array.isArray(legacy.revelations) || !Array.isArray(legacy.clues) || !legacy.role || !legacy.pressure || !legacy.criticalObject || !legacy.provenance) return null;
  const base: EngineSituation = {
    id: legacy.id,
    definitionKey: legacy.templateId,
    title: state.worldContext?.title ?? "Legacy watchtower situation",
    summary: state.worldContext?.description ?? "A persisted situation authored before the generic compiler migration.",
    definitionHash: "legacy-watchtower-relic-v1",
    status: legacy.status,
    currentLocationId: legacy.currentLocationId,
    visitedLocationIds: [...legacy.visitedLocationIds],
    nodes: legacy.nodes.map((node) => ({ ...clone(node), visibility: "public" as const })),
    truths: clone(legacy.truths),
    revelations: clone(legacy.revelations),
    clues: legacy.clues.map((clue) => ({ ...clone(clue), finding: clue.title, visibility: "public" as const })),
    actors: [],
    roles: [],
    pressure: {
      id: legacy.pressure.id,
      title: legacy.pressure.title,
      current: legacy.pressure.current,
      max: legacy.pressure.max,
      intervalMinutes: 60,
      nextAdvanceAtMinutes: legacy.pressure.nextAdvanceAtMinutes,
      lastAdvancedAtMinutes: legacy.pressure.lastAdvancedAtMinutes,
      defaultDevelopment: {
        id: legacy.pressure.defaultDevelopmentId,
        title: legacy.pressure.defaultDevelopmentId,
        description: "The persisted default development takes effect.",
      },
      defaultDevelopmentApplied: legacy.pressure.defaultDevelopmentApplied,
    },
    criticalObject: clone(legacy.criticalObject),
    outcomes: [],
    outcome: null,
    sourceRandomEventId: legacy.sourceRandomEventId,
    revision: legacy.revision,
    complicationCount: legacy.complicationCount,
    lastComplication: legacy.lastComplication,
    provenance: { ...clone(legacy.provenance), sourceRandomEvent: legacy.provenance.sourceRandomEvent ?? null },
  };
  const preferred = legacyReference(state, base, legacy.role.preferredRef);
  const alternates = legacy.role.alternateRefs.map((ref) => legacyReference(state, base, ref));
  const fallback = legacyReference(state, base, legacy.role.fallbackRef);
  const role: EngineSituationRole = {
    id: legacy.role.id,
    capability: "reveal-location",
    preferred,
    alternates,
    fallback,
    activeSource: legacy.role.activeSourceRef ? legacyReference(state, base, legacy.role.activeSourceRef) : null,
    status: legacy.role.status,
  };
  base.roles = [role];
  const centralId = legacy.revelations.find((revelation) => revelation.id.includes("central"))?.id ?? legacy.revelations[0]?.id ?? "legacy-central";
  const makeOutcome = (
    key: string,
    title: string,
    terminalStatus: "resolved" | "walked-away",
    requirements: EngineSituationOutcomeDefinition["requirements"],
  ): EngineSituationOutcomeDefinition => ({ id: `legacy-outcome:${key}`, key, title, terminalStatus, reactivityTier: terminalStatus === "walked-away" ? "contextual" : "booster", requirements });
  base.outcomes = [
    makeOutcome("solve", "Solve the situation", "resolved", [
      { kind: "revelation_revealed", revelationId: centralId },
      { kind: "role_status", roleId: role.id, statuses: ["preferred", "alternate", "fallback"] },
      { kind: "critical_object_state", state: "intact" },
    ]),
    makeOutcome("expose", "Expose the concealed truth", "resolved", [
      { kind: "revelation_revealed", revelationId: centralId },
      { kind: "role_status", roleId: role.id, statuses: ["fallback"] },
    ]),
    makeOutcome("bargain", "Bargain with the source", "resolved", [
      { kind: "revelation_revealed", revelationId: centralId },
      { kind: "role_status", roleId: role.id, statuses: ["preferred"] },
    ]),
    makeOutcome("walk-away", "Walk away", "walked-away", []),
  ];
  if (legacy.outcome) {
    const definition = base.outcomes.find((outcome) => outcome.key === legacy.outcome!.choice);
    if (definition) base.outcome = {
      outcomeId: definition.id,
      title: definition.title,
      committedAtMinutes: legacy.outcome.committedAtMinutes,
      sourceCommandId: legacy.outcome.sourceCommandId,
      reactivityTier: legacy.outcome.reactivityTier,
    };
  }
  const preferredNpc = state.worldContext?.npcs.find((npc) => npc.id === preferred.ref);
  base.actors = preferredNpc ? [{ actorRef: preferredNpc.id, goals: [...preferredNpc.goals] }] : [];
  return reconcileSituation(base, state);
}

export function normalizeSituation(value: unknown, state: LanternCampaignState): EngineSituation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<EngineSituation> & Record<string, unknown>;
  if (candidate.definitionKey) {
    if (
      typeof candidate.id !== "string"
      || typeof candidate.title !== "string"
      || typeof candidate.summary !== "string"
      || typeof candidate.definitionHash !== "string"
      || !Array.isArray(candidate.nodes)
      || !Array.isArray(candidate.truths)
      || !Array.isArray(candidate.revelations)
      || !Array.isArray(candidate.clues)
      || !Array.isArray(candidate.actors)
      || !Array.isArray(candidate.roles)
      || !Array.isArray(candidate.outcomes)
      || !candidate.pressure
      || !candidate.provenance
    ) return null;
    const normalized = clone(candidate as EngineSituation);
    normalized.provenance = { ...normalized.provenance, sourceRandomEvent: normalized.provenance.sourceRandomEvent ?? null };
    return reconcileSituation(normalized, state);
  }
  return normalizeLegacySituation(candidate, state);
}

export function reconcileSituation(situation: EngineSituation, state: LanternCampaignState): EngineSituation {
  const next = clone(situation);
  next.roles = next.roles.map((role) => {
    if (referenceAvailable(next, state, role.preferred)) return { ...role, activeSource: clone(role.preferred), status: "preferred" };
    const alternate = role.alternates.find((reference) => referenceAvailable(next, state, reference));
    if (alternate) return { ...role, activeSource: clone(alternate), status: "alternate" };
    if (referenceAvailable(next, state, role.fallback)) return { ...role, activeSource: clone(role.fallback), status: "fallback" };
    return { ...role, activeSource: null, status: "impossible" };
  });
  if (next.criticalObject) {
    const object = state.worldContext?.objects.find((candidate) => candidate.id === next.criticalObject!.objectId);
    next.criticalObject.acquiredByActorId = object?.ownerRef.kind === "actor" ? object.ownerRef.id : null;
    next.criticalObject.destroyed = object?.state === "destroyed";
    next.criticalObject.reaction = next.criticalObject.destroyed
      ? "declared-loss"
      : next.criticalObject.acquiredByActorId ? "retained-early" : "none";
  }
  return next;
}

export function advanceSituationPressure(situation: EngineSituation, beforeMinutes: number, afterMinutes: number): EngineSituation {
  const next = clone(situation);
  if (next.status !== "active" || afterMinutes < next.pressure.nextAdvanceAtMinutes) return next;
  const interval = next.pressure.intervalMinutes;
  const advances = Math.max(1, Math.floor((afterMinutes - next.pressure.nextAdvanceAtMinutes) / interval) + 1);
  next.pressure.current = Math.min(next.pressure.max, next.pressure.current + advances);
  next.pressure.lastAdvancedAtMinutes = next.pressure.nextAdvanceAtMinutes;
  next.pressure.nextAdvanceAtMinutes += advances * interval;
  if (next.pressure.current >= next.pressure.max) next.pressure.defaultDevelopmentApplied = true;
  void beforeMinutes;
  return next;
}

export function situationChoiceAllowed(
  situation: EngineSituation,
  state: LanternCampaignState,
  outcomeId: string,
): { allowed: true; outcome: EngineSituationOutcomeDefinition } | { allowed: false; reason: string } {
  if (situation.status !== "active") return { allowed: false, reason: "This situation already has a committed outcome." };
  const outcome = situation.outcomes.find((candidate) => candidate.id === outcomeId || candidate.key === outcomeId);
  if (!outcome) return { allowed: false, reason: "That outcome is not declared by the committed situation." };
  for (const requirement of outcome.requirements) {
    if (requirement.kind === "revelation_revealed" && situation.revelations.find((revelation) => revelation.id === requirement.revelationId)?.status !== "revealed") {
      return { allowed: false, reason: "A required revelation has not been established." };
    }
    if (requirement.kind === "role_status" && !requirement.statuses.includes(situation.roles.find((role) => role.id === requirement.roleId)?.status ?? "impossible")) {
      return { allowed: false, reason: "A required functional source is not available in the declared state." };
    }
    if (requirement.kind === "critical_object_state") {
      const critical = situation.criticalObject;
      const matches = requirement.state === "destroyed"
        ? critical?.destroyed === true
        : requirement.state === "actor-owned" ? Boolean(critical?.acquiredByActorId) : Boolean(critical && !critical.destroyed);
      if (!matches) return { allowed: false, reason: "The critical object does not satisfy this outcome." };
    }
    if (requirement.kind === "pressure_at_least" && situation.pressure.current < requirement.value) {
      return { allowed: false, reason: "The situation pressure has not reached the required threshold." };
    }
  }
  void state;
  return { allowed: true, outcome };
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
  const visibleNodeIds = new Set(
    situation.nodes
      .filter((node) => node.visibility === "public" || situation.visitedLocationIds.includes(node.id) || node.id === situation.currentLocationId)
      .map((node) => node.id),
  );
  const nodes = situation.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => ({ ...clone(node), exitIds: node.exitIds.filter((id) => visibleNodeIds.has(id)) }));
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
      .filter((revelation) => revelation.status === "revealed" && (
        knownFactIds.has(revelation.truthId)
        || situation.truths.find((truth) => truth.id === revelation.truthId)?.discoveredBy.includes(actorId)
      ))
      .map((revelation) => revelation.id),
  );
  const clues = situation.clues
    .filter((clue) => (clue.visibility === "public" && visibleNodeIds.has(clue.locationId)) || clue.foundBy.includes(actorId))
    .map((clue) => {
      const { factId: _factId, finding, ...safeClue } = clone(clue);
      return {
        ...safeClue,
        ...(clue.foundBy.includes(actorId) ? { finding } : {}),
        foundBy: clue.foundBy.includes(actorId) ? [actorId] : [],
      };
    });
  const hiddenCriticalFact = situation.criticalObject
    ? state.worldFacts.find((fact) => fact.id === situation.criticalObject!.objectId && fact.visibility === "hidden" && fact.active)
    : null;
  const criticalObject = hiddenCriticalFact && !knownFactIds.has(hiddenCriticalFact.id) && situation.criticalObject?.acquiredByActorId !== actorId
    ? null
    : clone(situation.criticalObject);
  return {
    id: situation.id,
    definitionKey: situation.definitionKey,
    title: situation.title,
    status: situation.status,
    currentLocationId: situation.currentLocationId,
    visitedLocationIds: [...situation.visitedLocationIds],
    nodes,
    truths,
    revelations: situation.revelations.map((revelation) => ({
      id: revelation.id,
      title: discoveredRevelationIds.has(revelation.id) ? revelation.title : "Unresolved lead",
      status: discoveredRevelationIds.has(revelation.id) ? "revealed" : "hidden",
    })),
    clues,
    roles: situation.roles.map((role) => ({ id: role.id, capability: role.capability, status: role.status })),
    pressure: {
      id: situation.pressure.id,
      title: situation.pressure.title,
      current: situation.pressure.current,
      max: situation.pressure.max,
      intervalMinutes: situation.pressure.intervalMinutes,
      lastAdvancedAtMinutes: situation.pressure.lastAdvancedAtMinutes,
      defaultDevelopment: situation.pressure.defaultDevelopmentApplied ? clone(situation.pressure.defaultDevelopment) : null,
      defaultDevelopmentApplied: situation.pressure.defaultDevelopmentApplied,
    },
    criticalObject,
    outcomes: situation.outcomes
      .filter((outcome) => situationChoiceAllowed(situation, state, outcome.id).allowed)
      .map((outcome) => ({
        id: outcome.id,
        title: outcome.title,
        terminalStatus: outcome.terminalStatus,
        reactivityTier: outcome.reactivityTier,
        available: true,
      })),
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
