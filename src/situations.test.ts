import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import {
  createInitialCampaign,
  normalizeCampaignState,
  readToolData,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

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
  if (!result.accepted) throw new Error(`${command.kind} failed: ${result.code}`);
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
  return accepted(characterReady(), { kind: "situation_create", templateId: "watchtower-relic-v1" });
}

function strongInvestigator(state: LanternCampaignState): LanternCampaignState {
  state.character.abilities.str = 20;
  state.character.skills.athletics = { ability: "str", proficient: true, expertise: true, bonus: 0 };
  state.experienceProfile.difficulty = "gentle";
  return state;
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
  const visited = accepted(strongInvestigator(state), { kind: "situation_visit", locationId: "watchtower-yard" });
  return accepted(visited, { kind: "situation_clue_attempt", clueId: "watchtower-clue-map", approach: "Read the marked route without disturbing it." });
}

function withTravelSupplies(state: LanternCampaignState): LanternCampaignState {
  state.character.inventory.push(
    { id: "situation-ration", quantity: 1, ownerRef: { kind: "actor", id: state.character.id }, authoredDefinition: { name: "Situation ration", kind: "consumable", weight: 1, properties: ["ration"] } },
    { id: "situation-water", quantity: 1, ownerRef: { kind: "actor", id: state.character.id }, authoredDefinition: { name: "Situation water", kind: "consumable", weight: 1, properties: ["water"] } },
  );
  return normalizeCampaignState(state);
}

describe("reviewed situations", () => {
  it("instantiates a stable graph, committed facts, fallback policy, and actor-safe projection", () => {
    const state = situationReady();
    const situation = state.situation!;
    expect(situation.templateId).toBe("watchtower-relic-v1");
    expect(situation.nodes.map((node) => node.id)).toEqual(["watchtower-road", "watchtower-yard", "watchtower-vault"]);
    expect(situation.revelations).toHaveLength(3);
    expect(situation.revelations[0]!.clueIds).toHaveLength(3);
    expect(situation.role).toMatchObject({ fallbackRef: "watchtower-inscription", status: "preferred" });
    expect(situation.criticalObject.policy.kind).toBe("alternate_path");
    expect(state.worldContext?.npcs.map((npc) => npc.id)).toContain("watchtower-warden");
    expect(state.worldContext?.objects.map((object) => object.id)).toContain("watchtower-relic");
    expect(state.worldFacts.map((fact) => fact.id)).toContain("watchtower-truth-warden");

    const projection = readToolData(state, "situation_context") as typeof state.situation;
    expect(projection).not.toBeNull();
    expect(JSON.stringify(projection)).not.toContain("watchtower-truth-warden");
    expect(JSON.stringify(projection)).not.toContain("The warden diverted the patrol");
    expect(projection!.revelations.every((revelation) => revelation.title === "Unresolved lead")).toBe(true);
    expect(projection!.clues.every((clue) => !("factId" in clue))).toBe(true);
    expect(toSessionView(state).situation).toEqual(projection);

    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(state)) as LanternCampaignState);
    expect(restarted.situation).toEqual(state.situation);

    const bypassContext = accepted(characterReady(), {
      kind: "world_context",
      title: "A side road",
      description: "The expected entrance was never used.",
      features: ["side entrance"],
      exits: [{ id: "side-yard", label: "the side yard" }],
    });
    const bypassed = accepted(bypassContext, { kind: "situation_create", templateId: "watchtower-relic-v1" });
    expect(bypassed.situation?.currentLocationId).toBe("watchtower-road");
    expect(bypassed.worldContext?.features).toEqual(expect.arrayContaining(["watchtower-road", "watchtower-vault", "watchtower-relic"]));
  });

  it("keeps traversal explicit and rejects out-of-order node access without mutation", () => {
    const state = situationReady();
    const before = JSON.stringify(state);
    const outOfOrder = apply(state, { kind: "situation_visit", locationId: "watchtower-vault" });
    expect(outOfOrder).toMatchObject({ accepted: false, code: "location_not_reachable", event: null });
    expect(JSON.stringify(outOfOrder.state)).toBe(before);

    const yard = apply(state, { kind: "situation_visit", locationId: "watchtower-yard" });
    expect(yard.accepted).toBe(true);
    const vault = apply(yard.state, { kind: "situation_visit", locationId: "watchtower-vault" });
    expect(vault.accepted).toBe(true);
    expect(vault.state.situation?.visitedLocationIds).toEqual(["watchtower-road", "watchtower-yard", "watchtower-vault"]);
  });

  it("uses server-owned checks for both fail-forward and discovery", () => {
    const failed = apply(situationReady(), {
      kind: "situation_clue_attempt",
      clueId: "watchtower-clue-boots",
      approach: "Follow the prints in the open road.",
    });
    expect(failed).toMatchObject({ accepted: true, event: { outcome: "situation_clue_failed_forward" } });
    expect(failed.state.situation?.complicationCount).toBe(1);
    expect(failed.state.situation?.clues.find((clue) => clue.id === "watchtower-clue-boots")).toMatchObject({ failedAttempts: 1 });
    expect(failed.state.situation?.clues.find((clue) => clue.id === "watchtower-clue-map")?.foundBy).toEqual([]);

    const yard = accepted(failed.state, { kind: "situation_visit", locationId: "watchtower-yard" });
    const found = apply(strongInvestigator(yard), {
      kind: "situation_clue_attempt",
      clueId: "watchtower-clue-map",
      approach: "Read the marked route without disturbing it.",
    });
    expect(found).toMatchObject({ accepted: true, event: { outcome: "situation_clue_found" }, data: { success: true } });
    expect(found.event?.adjudication?.requestedDifficultyBand).toBe("gentle");
    expect(found.state.situation?.revelations.find((revelation) => revelation.id === "watchtower-revelation-central")?.status).toBe("revealed");
    expect(found.state.actorKnowledge.map((record) => record.factId)).toEqual(expect.arrayContaining(["watchtower-fact-map", "watchtower-truth-warden"]));
    const revealedProjection = readToolData(found.state, "situation_context") as { revelations: Array<{ id: string; title: string; status: string }> } | null;
    expect(revealedProjection?.revelations.find((revelation) => revelation.id === "watchtower-revelation-central")).toEqual({ id: "watchtower-revelation-central", title: "Who changed the patrol route", status: "revealed" });
  });

  it("reconciles actor loss and critical-object acquisition or destruction", () => {
    const fallback = removeWarden(situationReady());
    expect(fallback.situation?.role).toMatchObject({ status: "fallback", activeSourceRef: "watchtower-inscription" });

    const early = accepted(situationReady(), { kind: "interact", targetId: "watchtower-relic", affordance: "take", goal: "Carry the relic before deciding." });
    expect(early.situation?.criticalObject).toMatchObject({ acquiredByActorId: early.actorId, reaction: "retained-early", destroyed: false });
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(early)) as LanternCampaignState).situation?.criticalObject.reaction).toBe("retained-early");

    const destroyed = accepted(situationReady(), { kind: "interact", targetId: "watchtower-relic", affordance: "break", goal: "Break the relic and follow the alternate route." });
    expect(destroyed.situation?.criticalObject).toMatchObject({ destroyed: true, reaction: "declared-loss" });
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(destroyed)) as LanternCampaignState).situation?.criticalObject).toMatchObject({ destroyed: true, reaction: "declared-loss" });
  });

  it("advances pressure at authoritative boundaries and exposes bounded outcomes", () => {
    let pressured = situationReady();
    pressured = accepted(pressured, { kind: "situation_ignore" });
    pressured = accepted(pressured, { kind: "situation_ignore" });
    pressured = accepted(pressured, { kind: "situation_ignore" });
    expect(pressured.situation?.pressure).toMatchObject({ current: 3, max: 3, defaultDevelopmentApplied: true });

    const walkedAway = apply(situationReady(), { kind: "situation_choose", choice: "walk-away" });
    expect(walkedAway).toMatchObject({ accepted: true, data: { outcome: { choice: "walk-away" } } });

    const solved = apply(revealCentral(situationReady()), { kind: "situation_choose", choice: "solve" });
    expect(solved).toMatchObject({ accepted: true, data: { outcome: { choice: "solve" } } });

    const bargained = apply(revealCentral(situationReady()), { kind: "situation_choose", choice: "bargain" });
    expect(bargained).toMatchObject({ accepted: true, data: { outcome: { choice: "bargain" } } });

    const exposed = apply(removeWarden(revealCentral(situationReady())), { kind: "situation_choose", choice: "expose" });
    expect(exposed).toMatchObject({ accepted: true, data: { outcome: { choice: "expose" } } });
  });

  it("rejects unavailable choices, unknown source events, and duplicate creation without mutation", () => {
    const state = characterReady();
    const before = JSON.stringify(state);
    const missingSource = apply(state, { kind: "situation_create", templateId: "watchtower-relic-v1", sourceRandomEventId: "missing-event" });
    expect(missingSource).toMatchObject({ accepted: false, code: "random_event_not_found", event: null });
    expect(JSON.stringify(missingSource.state)).toBe(before);

    const created = accepted(state, { kind: "situation_create", templateId: "watchtower-relic-v1" });
    const unavailable = apply(created, { kind: "situation_choose", choice: "solve" });
    expect(unavailable).toMatchObject({ accepted: false, code: "situation_choice_unavailable", event: null });
    const duplicate = apply(created, { kind: "situation_create", templateId: "watchtower-relic-v1" });
    expect(duplicate).toMatchObject({ accepted: false, code: "situation_exists", event: null });
  });

  it("persists situation commands exactly once and rejects stale versions", () => {
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
  });

  it("lets the reviewed roadside-sign table entry seed a durable situation and alter one already in motion", () => {
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
    const seeded = apply(seedState, { kind: "travel", routeId: "one-day-road-v1", destinationId: "west-pier", pace: "normal" });
    expect(seeded.accepted).toBe(true);
    expect(seeded.state.time.randomEvents.at(-1)?.selectedEntryId).toBe("roadside-sign");
    expect(seeded.state.situation?.provenance.sourceRandomEvent).toMatchObject({ tableId: "travel-watch-v1", tableVersion: "1", entryId: "roadside-sign" });
    expect(seeded.state.time.randomEvents.at(-1)?.createdSituationIds).toEqual([seeded.state.situation?.id]);
    expect(seeded.state.situation?.revelations).toHaveLength(3);

    let existing = withTravelSupplies(situationReady());
    const originalTruthIds = existing.situation!.truths.map((truth) => truth.id);
    deterministicRandomInt
      .mockImplementationOnce((min: number, _max: number) => min)
      .mockImplementationOnce((min: number, _max: number) => min)
      .mockImplementationOnce((_min: number, max: number) => max);
    const altered = apply(existing, { kind: "travel", routeId: "one-day-road-v1", destinationId: "watchtower-yard", pace: "normal" });
    expect(altered.accepted).toBe(true);
    expect(altered.state.situation?.truths.map((truth) => truth.id)).toEqual(originalTruthIds);
    expect(altered.state.situation?.lastComplication).toContain("newly posted sign");
    expect(altered.state.time.randomEvents.at(-1)?.createdSituationIds).toEqual([]);
  });
});
