import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  engineSocialActionCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, readToolData, resolveEngineCommand } from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

function fixtureState(): LanternCampaignState {
  const state = createInitialCampaign("social-account", "hero");
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Hero";
  state.character.lifecycleState = "conscious";
  state.character.hp = 10;
  state.character.maxHp = 10;
  state.character.hitDiceRemaining = 1;
  state.worldContext = {
    id: "market-square",
    title: "Market Square",
    description: "A public square with a guard post.",
    features: ["guard-post"],
    exits: [],
    npcs: [
      { id: "victim", name: "Mara", description: "A local resident.", disposition: "friendly", goals: [], socialDc: 12, relationshipScore: 0, memories: [] },
      { id: "witness", name: "Witness", description: "A passerby.", disposition: "neutral", goals: [], socialDc: 12, relationshipScore: 0, memories: [] },
      { id: "guard", name: "Town Guard", description: "A watch officer.", disposition: "neutral", goals: [], socialDc: 12, relationshipScore: 0, memories: [] },
    ],
    merchants: [{
      id: "merchant",
      name: "Mara's Market",
      description: "A small stall.",
      disposition: "neutral",
      items: [{
        item: { id: "lamp-oil", quantity: 10, authoredDefinition: { name: "Lamp Oil", kind: "consumable", weight: 1, valueCopper: 100 } },
        stock: 10,
        buyPriceCopper: 100,
        sellPriceCopper: 50,
      }],
    }],
    objects: [],
  };
  state.social = {
    relationships: [],
    factions: [{
      id: "town-watch",
      name: "Town Watch",
      communityId: "local-community",
      members: [{ actorId: "hero", role: "resident", standing: 0 }],
      provenance: { sourceCommandId: "fixture", sourceVersion: 0, occurredAt: new Date(0).toISOString() },
    }],
    reputations: [],
    obligations: [],
    crimes: [],
    rumors: [],
  };
  return normalizeCampaignState(state);
}

function context(state: LanternCampaignState, capabilities = ["player", "dm"]): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities,
  };
}

function resolve(state: LanternCampaignState, command: EngineCommand, clientCommandId = randomUUID()) {
  const request = context(state);
  return resolveEngineCommand(state, request, clientCommandId, command, command.kind as never);
}

describe("#13 bounded social state", () => {
  it("records a promise, fulfills it exactly once, and projects only the open/public slice", () => {
    const state = fixtureState();
    const promise = { kind: "social_action", action: "promise", targetId: "victim", terms: "Return the borrowed map." } as const;
    expect(engineSocialActionCommandSchema.parse(promise)).toEqual(promise);
    const promiseCommandId = randomUUID();
    const created = resolve(state, promise, promiseCommandId);
    expect(created.accepted).toBe(true);
    expect(created.state.social?.obligations).toHaveLength(1);
    expect(created.state.social?.relationships[0]?.trust).toBe(5);
    expect((readToolData(created.state, "campaign_context") as { social: { obligations: unknown[]; crimes?: unknown[] } }).social.crimes).toBeUndefined();

    const obligationId = created.state.social?.obligations[0]?.id;
    const fulfilled = resolve(created.state, { kind: "social_action", action: "fulfill_promise", promiseId: obligationId }, randomUUID());
    expect(fulfilled.accepted).toBe(true);
    expect(fulfilled.state.social?.obligations[0]?.status).toBe("fulfilled");
    expect(fulfilled.state.social?.reputations[0]?.score).toBe(5);
    const duplicate = resolve(fulfilled.state, { kind: "social_action", action: "fulfill_promise", promiseId: obligationId }, randomUUID());
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.code).toBe("promise_already_resolved");
    expect(duplicate.state.version).toBe(fulfilled.state.version);
    expect(duplicate.event).toBeNull();
  });

  it("uses the reviewed social challenge instead of an NPC-authored free DC", () => {
    const state = fixtureState();
    state.worldContext!.npcs[0]!.socialDc = 30;
    const result = resolve(state, { kind: "social_check", npcId: "victim", ability: "cha", goal: "Ask for directions." });
    expect(result.accepted).toBe(true);
    expect(result.data).toMatchObject({ dc: 12, dcProvenance: "reviewed-challenge:social-check-v1:dc-band-v1" });
    expect(result.state.social?.relationships[0]?.trust).toBeGreaterThanOrEqual(-2);
    expect(result.state.social?.relationships[0]?.trust).toBeLessThanOrEqual(5);
  });

  it("distinguishes witnessed evidence from an unwitnessed allegation and delays guard rumors", () => {
    const witnessed = resolve(fixtureState(), { kind: "social_action", action: "theft", targetId: "victim", itemId: "silver-key", witnessId: "witness" }, randomUUID());
    expect(witnessed.accepted).toBe(true);
    expect(witnessed.state.social?.crimes[0]).toMatchObject({ status: "proven", witnessIds: ["witness"] });
    expect(witnessed.state.social?.rumors[0]).toMatchObject({ status: "pending", truthRelation: "true", targetId: "guard" });
    const hidden = readToolData(witnessed.state, "campaign_context") as { social: { rumors: unknown[]; crimes?: unknown[] } };
    expect(hidden.social.rumors).toEqual([]);
    expect(hidden.social.crimes).toBeUndefined();

    const afterTime = resolve(witnessed.state, { kind: "rest", restType: "short" }, randomUUID());
    expect(afterTime.accepted).toBe(true);
    expect(afterTime.state.social?.rumors[0]).toMatchObject({ status: "propagated", truthRelation: "true", propagatedAtMinutes: 60 });

    const alleged = resolve(fixtureState(), { kind: "social_action", action: "theft", targetId: "victim", itemId: "silver-key" }, randomUUID());
    expect(alleged.accepted).toBe(true);
    expect(alleged.state.social?.crimes[0]).toMatchObject({ status: "allegation", witnessIds: [] });
    expect(alleged.state.social?.rumors).toEqual([]);
    expect(alleged.state.social?.reputations).toEqual([]);
  });

  it("propagates a false rumor without changing its authoritative truth relation", () => {
    const state = fixtureState();
    const recorded = resolve(state, { kind: "social_action", action: "rumor", targetId: "guard", rumorText: "The hero stole the moonstone.", truthRelation: "false" }, randomUUID());
    expect(recorded.accepted).toBe(true);
    expect((readToolData(recorded.state, "observe") as { social: { rumors: unknown[] } }).social.rumors).toEqual([]);
    const propagated = resolve(recorded.state, { kind: "rest", restType: "short" }, randomUUID());
    expect(propagated.accepted).toBe(true);
    expect(propagated.state.social?.rumors[0]).toMatchObject({ status: "propagated", truthRelation: "false" });
    expect(propagated.state.social?.crimes).toEqual([]);
  });

  it("applies bounded merchant pricing and access from authoritative social state", () => {
    const state = fixtureState();
    state.social!.relationships.push({ id: "merchant-relation", actorA: "hero", actorB: "merchant", trust: 100, fear: 0, loyalty: 0, hostility: 0, updatedAt: new Date(0).toISOString(), provenance: { sourceCommandId: "fixture", sourceVersion: 0, occurredAt: new Date(0).toISOString() } });
    state.character.currency.copper = 1_000;
    const favorable = resolve(state, { kind: "merchant_trade", merchantId: "merchant", itemId: "lamp-oil", side: "buy", quantity: 1 }, randomUUID());
    expect(favorable.accepted).toBe(true);
    expect(favorable.data).toMatchObject({ baseUnitPriceCopper: 100, unitPriceCopper: 90, ruleKey: "merchant-social-v1", socialScore: 100 });

    const blocked = fixtureState();
    blocked.social!.relationships.push({ id: "merchant-relation", actorA: "hero", actorB: "merchant", trust: -100, fear: 0, loyalty: 0, hostility: 100, updatedAt: new Date(0).toISOString(), provenance: { sourceCommandId: "fixture", sourceVersion: 0, occurredAt: new Date(0).toISOString() } });
    const denied = resolve(blocked, { kind: "merchant_trade", merchantId: "merchant", itemId: "lamp-oil", side: "buy", quantity: 1 }, randomUUID());
    expect(denied.accepted).toBe(false);
    expect(denied.code).toBe("merchant_access_denied");
  });

  it("keeps social commands versioned, idempotent, stale-safe, and durable across restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-social-"));
    const databasePath = join(directory, "engine.db");
    const firstStore = new LanternEngineStore(databasePath);
    const state = fixtureState();
    firstStore.createCampaign({ requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId, capabilities: ["player", "dm"] }, state);
    const request = context(state);
    const command = { kind: "social_action", action: "promise", targetId: "victim", terms: "Keep watch." } as const;
    const storeCommandId = randomUUID();
    const first = firstStore.executeCommand({ context: request, clientCommandId: storeCommandId, expectedCampaignVersion: 0, command, tool: "social_action", resolve: (current) => resolveEngineCommand(current, request, storeCommandId, command, "social_action") });
    const replay = firstStore.executeCommand({ context: request, clientCommandId: storeCommandId, expectedCampaignVersion: 0, command, tool: "social_action", resolve: (current) => resolveEngineCommand(current, request, storeCommandId, command, "social_action") });
    expect(first.state.version).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(replay.state.version).toBe(1);
    expect(firstStore.listCampaignEvents(request)).toHaveLength(1);
    const staleCommandId = randomUUID();
    expect(() => firstStore.executeCommand({ context: request, clientCommandId: staleCommandId, expectedCampaignVersion: 0, command, tool: "social_action", resolve: (current) => resolveEngineCommand(current, request, staleCommandId, command, "social_action") })).toThrow(EngineVersionConflictError);
    firstStore.close();

    const reopened = new LanternEngineStore(databasePath);
    const persisted = reopened.getCampaign(request);
    expect(persisted.social?.obligations[0]).toMatchObject({ status: "open" });
    reopened.close();
  });
});
