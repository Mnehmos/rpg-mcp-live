import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineCommand, EngineKnowledgeRecord, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import {
  createInitialCampaign,
  normalizeCampaignState,
  projectResolutionForActor,
  readToolData,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

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

function partyReady(): LanternCampaignState {
  let state = createInitialCampaign("party-account", "party-player");
  const created = apply(state, { kind: "character_create", name: "Party Leader", species: "human", className: "fighter" });
  if (!created.accepted) throw new Error(created.code ?? "character creation failed");
  state = created.state;
  const familiar = apply(state, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
  if (!familiar.accepted) throw new Error(familiar.code ?? "controlled actor creation failed");
  state = familiar.state;
  const party = apply(state, { kind: "party_create" });
  if (!party.accepted) throw new Error(party.code ?? "party creation failed");
  return party.state;
}

function knowledgeRecord(actorId: string, factId: string, campaignVersion: number): EngineKnowledgeRecord {
  const now = new Date(0).toISOString();
  return {
    id: `${actorId}:${factId}`,
    actorId,
    factId,
    tier: "known",
    source: "dm",
    provenance: "party-test",
    confidence: 1,
    campaignVersion,
    factRevision: 1,
    stale: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("party coordination", () => {
  it("forms an explicit PC plus companion party with independent scopes and restart continuity", () => {
    const state = partyReady();
    const party = state.party!;
    const companion = state.controlledActors[0]!;
    expect(party.members.map((member) => member.actorId)).toEqual([state.actorId, companion.id]);
    expect(party.members[1]).toMatchObject({ role: "companion", controllerActorId: state.actorId });
    expect(party.shared).toMatchObject({ questIds: ["first-light"], currency: { copper: 0 } });
    expect(party.rewardAllocation).toBe("leader-only");
    expect(party.consent).toEqual({ mode: "single-controller-future-member-seam", permanentChoiceRequires: "leader-confirmation" });
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(state)) as LanternCampaignState);
    expect(restarted.party).toEqual(state.party);
    expect(toSessionView(restarted).party).toEqual(state.party);
  });

  it("switches viewpoint and split scenes without leaking another actor's hidden knowledge", () => {
    let state = partyReady();
    const companionId = state.controlledActors[0]!.id;
    state.worldContext = {
      id: "hall",
      title: "Hall",
      description: "A quiet hall.",
      exits: [],
      features: [],
      npcs: [],
      merchants: [],
      objects: [],
    };
    state.worldFacts = [{
      id: "hidden-door",
      kind: "secret",
      title: "Hidden door",
      description: "A concealed way out.",
      visibility: "hidden",
      obscurity: "clear",
      requiredSense: "normal",
      passiveDc: null,
      sceneId: "hall",
      revision: 1,
      active: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }];
    state.actorKnowledge = [knowledgeRecord(state.actorId, "hidden-door", state.version)];
    const leaderView = toSessionView(state);
    expect(leaderView.worldContext?.facts.map((fact) => fact.id)).toContain("hidden-door");

    const switched = apply(state, { kind: "party_set_viewpoint", actorId: companionId });
    expect(switched.accepted).toBe(true);
    expect(switched.state.party?.activeViewpointActorId).toBe(companionId);
    expect(toSessionView(switched.state).worldContext?.facts.map((fact) => fact.id)).not.toContain("hidden-door");
    expect(readToolData(switched.state, "party_context")).toMatchObject({ viewpoint: { actorId: companionId, knowledge: [] } });

    const split = apply(switched.state, { kind: "party_split", actorId: companionId, sceneId: "side-room", locationRef: "side-room" });
    expect(split.accepted).toBe(true);
    expect(split.state.party?.mode).toBe("split");
    expect(split.state.party?.members.find((member) => member.actorId === companionId)).toMatchObject({ sceneId: "side-room", locationRef: "side-room" });
    const rejoined = apply(split.state, { kind: "party_rejoin" });
    expect(rejoined.accepted).toBe(true);
    expect(rejoined.state.party?.mode).toBe("together");
    expect(rejoined.state.party?.members.every((member) => member.sceneId === "hall" && member.locationRef === "hall")).toBe(true);

    const projected = projectResolutionForActor(switched, state.actorId);
    expect(projected.state.worldFacts.map((fact) => fact.id)).not.toContain("hidden-door");
  });

  it("moves a personal item into and out of the shared container exactly once", () => {
    let state = partyReady();
    const companionId = state.controlledActors[0]!.id;
    const item = { ...state.character.inventory[0]! };
    item.id = "party-shared-item";
    item.quantity = 2;
    item.equipped = false;
    item.slot = undefined;
    item.ownerRef = { kind: "actor", id: state.character.id };
    state.character.inventory.push(item);

    const toShared = apply(state, { kind: "party_shared_transfer", actorId: state.actorId, itemId: item.id, quantity: 1, direction: "to_shared" });
    expect(toShared.accepted).toBe(true);
    expect(toShared.state.character.inventory.find((candidate) => candidate.id === item.id)?.quantity).toBe(1);
    expect(toShared.state.party?.shared.container.inventory.find((candidate) => candidate.id === item.id)?.quantity).toBe(1);

    const toCompanion = apply(toShared.state, { kind: "party_shared_transfer", actorId: companionId, itemId: item.id, quantity: 1, direction: "from_shared" });
    expect(toCompanion.accepted).toBe(true);
    expect(toCompanion.state.party?.shared.container.inventory.some((candidate) => candidate.id === item.id)).toBe(false);
    expect(toCompanion.state.controlledActors[0]!.inventory.find((candidate) => candidate.id === item.id)).toMatchObject({ quantity: 1, ownerRef: { kind: "actor", id: companionId } });

    const before = JSON.stringify(toCompanion.state);
    const unauthorized = apply(toCompanion.state, { kind: "party_shared_transfer", actorId: companionId, itemId: item.id, quantity: 1, direction: "to_shared" }, "other-controller");
    expect(unauthorized).toMatchObject({ accepted: false, code: "party_unauthorized", event: null });
    expect(JSON.stringify(unauthorized.state)).toBe(before);
  });

  it("resolves one server-owned group check and rejects invalid participant lists without mutation", () => {
    const state = partyReady();
    const companionId = state.controlledActors[0]!.id;
    const result = apply(state, { kind: "party_group_check", ability: "wis", goal: "Search as a team", actorIds: [state.actorId, companionId] });
    expect(result.accepted).toBe(true);
    expect(result.event?.check).toMatchObject({ actorId: state.actorId, formulaRevision: "party-group-check-v1" });
    expect(result.data).toMatchObject({ participants: [state.actorId, companionId], policy: "party-group-check-v1" });
    const before = JSON.stringify(state);
    const invalid = apply(state, { kind: "party_group_check", ability: "wis", goal: "Search as a team", actorIds: [companionId, companionId] });
    expect(invalid).toMatchObject({ accepted: false, code: "party_leader_required", event: null });
    expect(JSON.stringify(invalid.state)).toBe(before);
  });

  it("keeps party control idempotent and rejects stale persistence versions", () => {
    const state = partyReady();
    const companionId = state.controlledActors[0]!.id;
    const directory = mkdtempSync(join(tmpdir(), "lantern-party-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    const owner = context(state);
    store.createCampaign({ requestId: owner.requestId, accountId: owner.accountId, actorId: owner.actorId, capabilities: owner.capabilities }, state);
    const clientCommandId = randomUUID();
    const input = {
      context: owner,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command: { kind: "party_set_viewpoint", actorId: companionId } as const,
      tool: "party_set_viewpoint" as const,
      resolve: (current: LanternCampaignState) => resolveEngineCommand(current, owner, clientCommandId, { kind: "party_set_viewpoint", actorId: companionId }, "party_set_viewpoint"),
    };
    const first = store.executeCommand(input);
    const replay = store.executeCommand(input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(() => store.executeCommand({ ...input, clientCommandId: randomUUID(), command: { kind: "party_rejoin" }, tool: "party_rejoin", expectedCampaignVersion: state.version, resolve: (current) => resolveEngineCommand(current, owner, randomUUID(), { kind: "party_rejoin" }, "party_rejoin") })).toThrow(EngineVersionConflictError);
    expect(store.getCampaign(owner).party?.activeViewpointActorId).toBe(companionId);
    store.close();
  });
});
