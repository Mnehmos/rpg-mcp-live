import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  engineCommandSchema,
  engineSituationDefinitionProposalSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import {
  createInitialCampaign,
  normalizeCampaignState,
  readToolData,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";
import {
  ashmereSituationDefinition,
  prepareAshmereWorld,
  prepareWatchtowerWorld,
  situationFixtureId,
  watchtowerSituationDefinition,
} from "./situation-test-fixtures.js";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number, _max: number) => min));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

beforeEach(() => {
  deterministicRandomInt.mockReset();
  deterministicRandomInt.mockImplementation((min: number, _max: number) => min);
});

function context(state: LanternCampaignState, actorId = state.actorId): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, command: EngineCommand, actorId = state.actorId) {
  return resolveEngineCommand(state, context(state, actorId), randomUUID(), command, command.kind);
}

function accepted(state: LanternCampaignState, command: EngineCommand): LanternCampaignState {
  const result = apply(state, command);
  if (!result.accepted) throw new Error(`${command.kind} failed: ${result.code} ${result.message}`);
  return result.state;
}

function characterReady(): LanternCampaignState {
  const initial = createInitialCampaign("situation-account", "situation-actor");
  return accepted(initial, {
    kind: "character_create",
    name: "Situation Investigator",
    species: "human",
    className: "fighter",
  });
}

function situationReady(): LanternCampaignState {
  return accepted(prepareWatchtowerWorld(characterReady()), {
    kind: "situation_create",
    definition: watchtowerSituationDefinition(),
  });
}

function strongInvestigator(state: LanternCampaignState): LanternCampaignState {
  state.character.abilities.wis = 20;
  state.character.skills.perception = { ability: "wis", proficient: true, expertise: true, bonus: 0 };
  state.experienceProfile.difficulty = "gentle";
  return state;
}

function nodeId(key: string): string {
  return situationFixtureId("watchtower-relic", "node", key);
}

function clueId(key: string): string {
  return situationFixtureId("watchtower-relic", "clue", key);
}

function truthId(key: string): string {
  return situationFixtureId("watchtower-relic", "truth", key);
}

function revelationId(key: string): string {
  return situationFixtureId("watchtower-relic", "revelation", key);
}

function outcomeId(key: string): string {
  return situationFixtureId("watchtower-relic", "outcome", key);
}

function removeWarden(state: LanternCampaignState): LanternCampaignState {
  const world = state.worldContext!;
  return accepted(state, {
    kind: "world_context",
    title: world.title,
    description: world.description,
    features: world.features,
    exits: world.exits,
    npcs: { remove: ["watchtower-warden"] },
  });
}

function revealCentral(state: LanternCampaignState): LanternCampaignState {
  const visited = accepted(strongInvestigator(state), { kind: "situation_visit", locationId: nodeId("yard") });
  return accepted(visited, { kind: "situation_clue_attempt", clueId: clueId("map"), approach: "Read the marked route without disturbing it." });
}

function withTravelSupplies(state: LanternCampaignState): LanternCampaignState {
  state.character.inventory.push(
    { id: "situation-ration", quantity: 1, ownerRef: { kind: "actor", id: state.character.id }, authoredDefinition: { name: "Situation ration", kind: "consumable", weight: 1, properties: ["ration"] } },
    { id: "situation-water", quantity: 1, ownerRef: { kind: "actor", id: state.character.id }, authoredDefinition: { name: "Situation water", kind: "consumable", weight: 1, properties: ["water"] } },
  );
  return normalizeCampaignState(state);
}

describe("authored situation compiler", () => {
  it("compiles the watchtower as data with stable identities, canonical knowledge, and actor-safe projection", () => {
    const prepared = prepareWatchtowerWorld(characterReady());
    const worldBefore = structuredClone(prepared.worldContext);
    const state = accepted(prepared, { kind: "situation_create", definition: watchtowerSituationDefinition() });
    const situation = state.situation!;

    expect(situation.definitionKey).toBe("watchtower-relic");
    expect(situation.nodes.map((node) => node.id)).toEqual([nodeId("road"), nodeId("yard"), nodeId("vault")]);
    expect(situation.revelations.find((revelation) => revelation.id === revelationId("central"))?.clueIds).toHaveLength(3);
    expect(situation.roles[0]).toMatchObject({ status: "preferred", preferred: { kind: "actor", ref: "watchtower-warden" } });
    expect(situation.criticalObject?.policy.kind).toBe("alternate_path");
    expect(state.worldContext).toEqual(worldBefore);
    expect(state.worldFacts.map((fact) => fact.id)).toEqual(expect.arrayContaining([truthId("warden"), situationFixtureId("watchtower-relic", "clue-fact", "map")]));
    expect(state.actorKnowledge.filter((record) => record.actorId === "watchtower-warden").map((record) => record.factId)).toEqual(
      expect.arrayContaining([truthId("warden"), truthId("relic"), truthId("pressure")]),
    );

    const projection = readToolData(state, "situation_context") as NonNullable<ReturnType<typeof toSessionView>["situation"]>;
    expect(JSON.stringify(projection)).not.toContain("The warden diverted the patrol");
    expect(JSON.stringify(projection)).not.toContain("The route bends away from the village");
    expect(JSON.stringify(projection)).not.toContain("diverted patrol, a warning relic");
    expect(JSON.stringify(projection)).not.toContain("The patrol arrives according to its committed route");
    expect(projection.pressure.defaultDevelopment).toBeNull();
    expect(projection.revelations.every((revelation) => revelation.title === "Unresolved lead")).toBe(true);
    expect(projection.clues.every((clue) => !("factId" in clue) && !("finding" in clue))).toBe(true);
    expect(projection.roles[0]).toEqual({ id: situation.roles[0]!.id, capability: "reveal-location", status: "preferred" });
    expect(toSessionView(state).situation).toEqual(projection);

    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(state)) as LanternCampaignState);
    expect(restarted.situation).toEqual(state.situation);
  });

  it("compiles a second Ashmere definition without a critical object or source-owned adventure code", () => {
    const state = accepted(prepareAshmereWorld(characterReady()), {
      kind: "situation_create",
      definition: ashmereSituationDefinition(),
    });
    expect(state.situation).toMatchObject({ definitionKey: "bell-beneath-ashmere", title: "The Bell Beneath Ashmere", criticalObject: null });
    expect(state.situation?.nodes).toHaveLength(3);
    expect(state.situation?.revelations[0]?.clueIds).toHaveLength(3);
    expect(state.situation?.roles[0]).toMatchObject({ capability: "testify", status: "preferred" });
    expect(state.actorKnowledge.filter((record) => record.actorId === "oren-dockhand")).toHaveLength(1);

    const projection = readToolData(state, "situation_context") as NonNullable<ReturnType<typeof toSessionView>["situation"]>;
    expect(projection.nodes.map((node) => node.title)).not.toContain("Flooded Cistern");
    expect(JSON.stringify(projection)).not.toContain("submerged mechanism");
  });

  it("rejects malformed, disconnected, dangling-hard-reference, and critical-object authoring without mutation", () => {
    const valid = watchtowerSituationDefinition();
    const tooFewCentral = structuredClone(valid);
    tooFewCentral.clues = tooFewCentral.clues.filter((clue) => clue.key !== "inscription");
    expect(engineSituationDefinitionProposalSchema.safeParse(tooFewCentral).success).toBe(false);

    const prepared = prepareWatchtowerWorld(characterReady());
    const disconnected = structuredClone(valid);
    disconnected.nodes[1]!.exitKeys = ["road"];
    disconnected.nodes[2]!.exitKeys = ["yard"];
    disconnected.nodes[0]!.exitKeys = [];
    const before = JSON.stringify(prepared);
    const graphResult = apply(prepared, { kind: "situation_create", definition: disconnected });
    expect(graphResult).toMatchObject({ accepted: false, code: "situation_graph_disconnected", event: null });
    expect(JSON.stringify(graphResult.state)).toBe(before);

    const dangling = structuredClone(valid);
    dangling.roles[0]!.preferred = { kind: "actor", ref: "invented-after-search" };
    const danglingResult = apply(prepared, { kind: "situation_create", definition: dangling });
    expect(danglingResult).toMatchObject({ accepted: false, code: "situation_role_reference_not_found", event: null });
    expect(JSON.stringify(danglingResult.state)).toBe(before);

    const missingObject = structuredClone(valid);
    missingObject.criticalObject = { objectId: "invented-treasure" };
    const objectResult = apply(prepared, { kind: "situation_create", definition: missingObject });
    expect(objectResult).toMatchObject({ accepted: false, code: "situation_critical_object_not_found", event: null });
    expect(JSON.stringify(objectResult.state)).toBe(before);
  });

  it("keeps traversal explicit and rejects out-of-order node access without mutation", () => {
    const state = situationReady();
    const before = JSON.stringify(state);
    const outOfOrder = apply(state, { kind: "situation_visit", locationId: nodeId("vault") });
    expect(outOfOrder).toMatchObject({ accepted: false, code: "location_not_reachable", event: null });
    expect(JSON.stringify(outOfOrder.state)).toBe(before);

    const yard = apply(state, { kind: "situation_visit", locationId: nodeId("yard") });
    expect(yard.accepted).toBe(true);
    const vault = apply(yard.state, { kind: "situation_visit", locationId: nodeId("vault") });
    expect(vault.accepted).toBe(true);
    expect(vault.state.situation?.visitedLocationIds).toEqual([nodeId("road"), nodeId("yard"), nodeId("vault")]);
  });

  it("uses server-owned checks while leaving the concrete fictional consequence to the DM", () => {
    const failed = apply(situationReady(), {
      kind: "situation_clue_attempt",
      clueId: clueId("boots"),
      approach: "Follow the prints in the open road.",
    });
    expect(failed).toMatchObject({ accepted: true, event: { outcome: "situation_clue_failed_forward" } });
    expect(failed.message).toContain("DM must now commit and portray");
    expect(failed.state.situation?.lastComplication).toBe("pending-dm-consequence");
    expect(failed.state.actorKnowledge.some((record) => record.actorId === failed.state.actorId && record.factId === truthId("warden"))).toBe(false);

    const yard = accepted(failed.state, { kind: "situation_visit", locationId: nodeId("yard") });
    const found = apply(strongInvestigator(yard), {
      kind: "situation_clue_attempt",
      clueId: clueId("map"),
      approach: "Read the marked route without disturbing it.",
    });
    expect(found).toMatchObject({ accepted: true, event: { outcome: "situation_clue_found" }, data: { success: true } });
    expect(found.message).toContain("DM must now portray");
    expect(found.event?.adjudication?.requestedDifficultyBand).toBe("gentle");
    expect(found.state.situation?.revelations.find((revelation) => revelation.id === revelationId("central"))?.status).toBe("revealed");
    expect(found.state.actorKnowledge.filter((record) => record.actorId === found.state.actorId).map((record) => record.factId)).toEqual(
      expect.arrayContaining([situationFixtureId("watchtower-relic", "clue-fact", "map"), truthId("warden")]),
    );
    const revealedProjection = readToolData(found.state, "situation_context") as NonNullable<ReturnType<typeof toSessionView>["situation"]>;
    expect(revealedProjection.revelations.find((revelation) => revelation.id === revelationId("central"))?.title).toBe("Who changed the patrol route");
    expect(revealedProjection.clues.find((clue) => clue.id === clueId("map"))?.finding).toContain("Mara's hand");
  });

  it("reconciles preferred, alternate, and fallback sources plus critical-object lifecycle", () => {
    const alternate = removeWarden(situationReady());
    expect(alternate.situation?.roles[0]).toMatchObject({ status: "alternate", activeSource: { kind: "object", ref: "watchtower-relic" } });

    const fallback = accepted(alternate, { kind: "interact", targetId: "watchtower-relic", affordance: "break", goal: "Destroy the relic and use the inscription." });
    expect(fallback.situation?.roles[0]).toMatchObject({ status: "fallback", activeSource: { kind: "feature", ref: "watchtower-inscription" } });
    expect(fallback.situation?.criticalObject).toMatchObject({ destroyed: true, reaction: "declared-loss" });

    const early = accepted(situationReady(), { kind: "interact", targetId: "watchtower-relic", affordance: "take", goal: "Carry the relic before deciding." });
    expect(early.situation?.criticalObject).toMatchObject({ acquiredByActorId: early.actorId, reaction: "retained-early", destroyed: false });
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(early)) as LanternCampaignState).situation?.criticalObject?.reaction).toBe("retained-early");
  });

  it("advances authored pressure and exposes only declaratively legal outcomes", () => {
    let pressured = situationReady();
    pressured = accepted(pressured, { kind: "situation_ignore" });
    pressured = accepted(pressured, { kind: "situation_ignore" });
    pressured = accepted(pressured, { kind: "situation_ignore" });
    expect(pressured.situation?.pressure).toMatchObject({ current: 3, max: 3, intervalMinutes: 60, defaultDevelopmentApplied: true });
    const pressuredProjection = readToolData(pressured, "situation_context") as NonNullable<ReturnType<typeof toSessionView>["situation"]>;
    expect(pressuredProjection.pressure.defaultDevelopment?.title).toBe("The patrol reaches the village");

    const initialProjection = readToolData(situationReady(), "situation_context") as NonNullable<ReturnType<typeof toSessionView>["situation"]>;
    expect(initialProjection.outcomes.map((outcome) => outcome.title)).toEqual(["Walk away"]);
    const unavailable = apply(situationReady(), { kind: "situation_choose", outcomeId: outcomeId("solve") });
    expect(unavailable).toMatchObject({ accepted: false, code: "situation_choice_unavailable", event: null });

    const revealed = revealCentral(situationReady());
    const revealedProjection = readToolData(revealed, "situation_context") as NonNullable<ReturnType<typeof toSessionView>["situation"]>;
    expect(revealedProjection.outcomes.map((outcome) => outcome.id)).toEqual(expect.arrayContaining([outcomeId("solve"), outcomeId("bargain"), outcomeId("walk-away")]));
    const solved = apply(revealed, { kind: "situation_choose", outcomeId: outcomeId("solve") });
    expect(solved).toMatchObject({ accepted: true, data: { outcome: { outcomeId: outcomeId("solve"), title: "Use the truth and intact relic" } } });

    const fallback = accepted(removeWarden(revealCentral(situationReady())), { kind: "interact", targetId: "watchtower-relic", affordance: "break", goal: "Use the fallback record." });
    const exposed = apply(fallback, { kind: "situation_choose", outcomeId: outcomeId("expose") });
    expect(exposed).toMatchObject({ accepted: true, data: { outcome: { outcomeId: outcomeId("expose") } } });
  });

  it("records random-event provenance without auto-authoring a situation or altering established truths", () => {
    let seedState = accepted(characterReady(), {
      kind: "world_context",
      title: "The war road",
      description: "A reviewed road segment with a distant pier.",
      features: [],
      exits: [{ id: "west-pier", label: "the west pier" }],
    });
    seedState = withTravelSupplies(seedState);
    deterministicRandomInt
      .mockImplementationOnce((min: number, _max: number) => min)
      .mockImplementationOnce((min: number, _max: number) => min)
      .mockImplementationOnce((_min: number, max: number) => max);
    const traveled = apply(seedState, { kind: "travel", routeId: "one-day-road-v1", destinationId: "west-pier", pace: "normal" });
    expect(traveled.accepted).toBe(true);
    const event = traveled.state.time.randomEvents.at(-1)!;
    expect(event.selectedEntryId).toBe("roadside-sign");
    expect(traveled.state.situation).toBeNull();
    expect(event.createdSituationIds).toEqual([]);

    const seeded = apply(prepareWatchtowerWorld(traveled.state), {
      kind: "situation_create",
      definition: watchtowerSituationDefinition(),
      sourceRandomEventId: event.id,
    });
    expect(seeded).toMatchObject({ accepted: true });
    expect(seeded.state.situation?.provenance.sourceRandomEvent).toMatchObject({ tableId: "travel-watch-v1", tableVersion: "1", entryId: "roadside-sign" });
    expect(seeded.state.time.randomEvents.find((candidate) => candidate.id === event.id)?.createdSituationIds).toEqual([seeded.state.situation?.id]);

    const replayState = structuredClone(seeded.state);
    replayState.situation = null;
    const beforeReplay = JSON.stringify(replayState);
    const reusedEvent = apply(replayState, { kind: "situation_create", definition: watchtowerSituationDefinition(), sourceRandomEventId: event.id });
    expect(reusedEvent).toMatchObject({ accepted: false, code: "random_event_replayed", event: null });
    expect(JSON.stringify(reusedEvent.state)).toBe(beforeReplay);

    let existing = withTravelSupplies(situationReady());
    existing.worldContext!.exits = [{ id: "west-pier", label: "the west pier" }];
    const truthIdsBefore = existing.situation!.truths.map((truth) => truth.id);
    deterministicRandomInt
      .mockImplementationOnce((min: number, _max: number) => min)
      .mockImplementationOnce((min: number, _max: number) => min)
      .mockImplementationOnce((_min: number, max: number) => max);
    const altered = apply(existing, { kind: "travel", routeId: "one-day-road-v1", destinationId: "west-pier", pace: "normal" });
    expect(altered.accepted).toBe(true);
    expect(altered.state.situation?.truths.map((truth) => truth.id)).toEqual(truthIdsBefore);
    expect(altered.state.situation?.complicationCount).toBe(0);
  });

  it("persists commands exactly once, rejects stale versions, and retains legacy load/replay compatibility", () => {
    const state = situationReady();
    const directory = mkdtempSync(join(tmpdir(), "lantern-situation-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    const owner = context(state);
    store.createCampaign({ requestId: owner.requestId, accountId: owner.accountId, actorId: owner.actorId, capabilities: owner.capabilities }, state);
    const clientCommandId = randomUUID();
    const command = { kind: "situation_ignore" } as const;
    const input = {
      context: owner,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "situation_ignore" as const,
      resolve: (current: LanternCampaignState) => resolveEngineCommand(current, owner, clientCommandId, command, "situation_ignore"),
    };
    const first = store.executeCommand(input);
    const replay = store.executeCommand(input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(() => store.executeCommand({ ...input, clientCommandId: randomUUID(), expectedCampaignVersion: state.version })).toThrow(EngineVersionConflictError);
    expect(store.getCampaign(owner).situation?.pressure.current).toBe(1);
    store.close();

    expect(engineCommandSchema.safeParse({ kind: "situation_create", templateId: "watchtower-relic-v1" }).success).toBe(true);
    const freshLegacy = prepareWatchtowerWorld(characterReady());
    const beforeLegacy = JSON.stringify(freshLegacy);
    const legacyCommand = apply(freshLegacy, { kind: "situation_create", templateId: "watchtower-relic-v1" });
    expect(legacyCommand).toMatchObject({ accepted: false, code: "legacy_situation_template_retired", event: null });
    expect(JSON.stringify(legacyCommand.state)).toBe(beforeLegacy);

    const legacyState = prepareWatchtowerWorld(characterReady());
    (legacyState as unknown as { situation: unknown }).situation = {
      id: "situation:legacy-watchtower",
      templateId: "watchtower-relic-v1",
      status: "active",
      currentLocationId: "watchtower-road",
      visitedLocationIds: ["watchtower-road"],
      nodes: [{ id: "watchtower-road", title: "Road", description: "Road", exitIds: [] }],
      truths: [], revelations: [], clues: [],
      role: { id: "legacy-role", capability: "reveal_location", preferredRef: "watchtower-warden", alternateRefs: ["watchtower-relic"], fallbackRef: "watchtower-inscription", activeSourceRef: "watchtower-warden", status: "preferred" },
      pressure: { id: "legacy-pressure", title: "Patrol", current: 0, max: 3, nextAdvanceAtMinutes: 60, lastAdvancedAtMinutes: null, defaultDevelopmentId: "patrol-arrives", defaultDevelopmentApplied: false },
      criticalObject: { objectId: "watchtower-relic", policy: legacyState.worldContext!.objects[0]!.definition.criticalPolicy, acquiredByActorId: null, destroyed: false, reaction: "none" },
      outcome: null,
      sourceRandomEventId: null,
      revision: 1,
      complicationCount: 0,
      lastComplication: null,
      provenance: { sourceCommandId: "legacy", sourceVersion: 1, rulesVersion: "situations-v1", sourceRandomEvent: null },
    };
    const migrated = normalizeCampaignState(legacyState);
    expect(migrated.situation).toMatchObject({ definitionKey: "watchtower-relic-v1", definitionHash: "legacy-watchtower-relic-v1" });
    expect(migrated.situation?.roles[0]).toMatchObject({ status: "preferred", preferred: { kind: "actor", ref: "watchtower-warden" } });
  });
});
