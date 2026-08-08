import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number, _max: number) => min));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import { buildDmContext } from "./engine-dm.js";
import {
  actorKnowledgeProjection,
  createInitialCampaign,
  projectResolutionForActor,
  resolveEngineCommand,
} from "./engine-domain.js";
import { compileAtomicTurnResolution } from "./engine-turn-plan.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";

function contextFor(state: LanternCampaignState, actorId = state.actorId): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId,
    capabilities: ["player", "dm"],
  };
}

function command(raw: unknown): EngineCommand {
  return engineCommandSchema.parse(raw);
}

function worldContextCommand(facts?: unknown): EngineCommand {
  return command({
    kind: "world_context",
    title: "The sealed archive",
    description: "Dust hangs in the quiet archive.",
    features: ["sealed shelves"],
    exits: [],
    ...(facts ? { facts: { upsert: facts } } : {}),
  });
}

function run(state: LanternCampaignState, context: RequestContext, next: EngineCommand, clientCommandId = randomUUID()) {
  return resolveEngineCommand(state, context, clientCommandId, next, next.kind);
}

function searchableFact(overrides: Record<string, unknown> = {}) {
  return {
    id: "secret-compartment",
    kind: "secret",
    title: "A hidden compartment",
    description: "A false shelf conceals a moonstone.",
    visibility: "hidden",
    obscurity: "clear",
    passiveDc: 30,
    ...overrides,
  };
}

describe("scenario 8 actor-scoped perception fixture (#22)", () => {
  it("builds the actual DM context from an actor projection and omits unrevealed facts", () => {
    const state = createInitialCampaign("account-projection", "actor-projection");
    const context = contextFor(state);
    const established = run(state, context, worldContextCommand([
      {
        id: "visible-relic",
        kind: "object",
        title: "A visible relic",
        description: "A brass key rests on the table.",
        visibility: "public",
      },
      searchableFact(),
    ]));

    const projection = actorKnowledgeProjection(context.actorId, established.state);
    expect(projection.facts.map((fact) => fact.id)).toEqual(["visible-relic"]);
    const serializedPrompt = JSON.stringify(buildDmContext(established.state, context, "I look around.", "player_turn"));
    expect(serializedPrompt).toContain("A visible relic");
    expect(serializedPrompt).not.toContain("A hidden compartment");
    expect(serializedPrompt).not.toContain("secret-compartment");
  });

  it("records passive perception once and gates dark facts on darkvision", () => {
    const state = createInitialCampaign("account-passive", "actor-passive");
    const context = contextFor(state);
    const established = run(state, context, worldContextCommand([
      searchableFact({ id: "clear-secret", title: "A clear secret", passiveDc: 10 }),
    ]));
    expect(established.state.actorKnowledge.filter((record) => record.factId === "clear-secret")).toHaveLength(1);

    const repeated = run(established.state, context, worldContextCommand());
    expect(repeated.state.actorKnowledge.filter((record) => record.factId === "clear-secret")).toHaveLength(1);

    const darkState = createInitialCampaign("account-dark", "actor-dark");
    const darkContext = contextFor(darkState);
    const darkEstablished = run(darkState, darkContext, worldContextCommand([
      searchableFact({ id: "dark-secret", title: "A dark secret", obscurity: "dark", passiveDc: 10 }),
    ]));
    expect(darkEstablished.state.actorKnowledge.filter((record) => record.factId === "dark-secret")).toHaveLength(0);
    darkEstablished.state.character.senses.darkvisionFeet = 60;
    const darkSeen = run(darkEstablished.state, darkContext, worldContextCommand());
    expect(darkSeen.state.actorKnowledge.filter((record) => record.factId === "dark-secret")).toHaveLength(1);
  });

  it("authorizes successful active search, withholds failed search details, and blocks identical retries", () => {
    const state = createInitialCampaign("account-search", "actor-search");
    const context = contextFor(state);
    const established = run(state, context, worldContextCommand([searchableFact()]));
    const search = command({
      kind: "challenge_attempt",
      challengeId: "search-hidden-fact-v1",
      factId: "secret-compartment",
      goal: "Find the hidden compartment",
      approach: "Tap and inspect the shelves",
    });

    deterministicRandomInt.mockReturnValue(20);
    const success = run(established.state, context, search);
    const publicSuccess = projectResolutionForActor(success, context.actorId);
    expect(publicSuccess.data).toMatchObject({ discovery: { factId: "secret-compartment", tier: "known" } });
    expect(actorKnowledgeProjection(context.actorId, success.state).facts.map((fact) => fact.id)).toContain("secret-compartment");

    const failedState = createInitialCampaign("account-search-fail", "actor-search-fail");
    const failedContext = contextFor(failedState);
    const failedEstablished = run(failedState, failedContext, worldContextCommand([searchableFact()]));
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(1);
    const failed = run(failedEstablished.state, failedContext, search);
    const publicFailure = projectResolutionForActor(failed, failedContext.actorId);
    expect(publicFailure.accepted).toBe(true);
    expect(JSON.stringify(publicFailure)).not.toContain("secret-compartment");
    expect(JSON.stringify(publicFailure)).not.toContain("A hidden compartment");
    const callsAfterFailure = deterministicRandomInt.mock.calls.length;
    const retry = run(failed.state, failedContext, search);
    expect(retry).toMatchObject({ accepted: false, code: "retry_blocked" });
    expect(deterministicRandomInt.mock.calls.length).toBe(callsAfterFailure);

    deterministicRandomInt.mockClear();
    const invalid = run(
      failedEstablished.state,
      failedContext,
      command({ ...search, factId: "not-authorized" })
    );
    const publicInvalid = projectResolutionForActor(invalid, failedContext.actorId);
    expect(publicInvalid).toMatchObject({
      accepted: false,
      code: "search_unavailable",
      data: { adjudication: { dc: null, dcProvenance: "withheld" } },
    });
    expect(JSON.stringify(publicInvalid)).not.toContain("approachHash");
    expect(deterministicRandomInt).not.toHaveBeenCalled();
  });

  it("redacts hidden arguments from nested atomic-turn evidence", () => {
    deterministicRandomInt.mockReturnValue(20);
    const state = createInitialCampaign("account-turn-plan", "actor-turn-plan");
    const context = contextFor(state);
    const established = run(state, context, worldContextCommand([searchableFact()]));
    const search = command({
      kind: "challenge_attempt",
      challengeId: "search-hidden-fact-v1",
      factId: "secret-compartment",
      goal: "Find it",
      approach: "Search the shelves",
    });
    const success = run(established.state, context, search);
    const atomic = compileAtomicTurnResolution(established.state, context, randomUUID(), [{
      tool: "challenge_attempt",
      command: search,
      resolution: success,
    }]);
    const projected = projectResolutionForActor(atomic, context.actorId);
    const nestedCommand = (projected.event?.command as { effects?: Array<{ command?: { factId?: string } }> }).effects?.[0]?.command;
    expect(nestedCommand?.factId).toBeUndefined();
    expect((projected.event?.effects?.[0]?.command as { factId?: string }).factId).toBeUndefined();
    expect(projected.data).toMatchObject({ effects: [{ data: { discovery: { factId: "secret-compartment" } } }] });
  });

  it("persists discovery across restart and replays the command without another knowledge record", () => {
    deterministicRandomInt.mockReturnValue(20);
    const directory = mkdtempSync(join(tmpdir(), "lantern-knowledge-"));
    const state = createInitialCampaign("account-persist", "actor-persist");
    const context = contextFor(state);
    const store = new LanternEngineStore(join(directory, "engine.db"));
    store.createCampaign(context, state);
    const setupCommand = worldContextCommand([searchableFact()]);
    const setupId = randomUUID();
    const established = store.executeCommand({
      context,
      clientCommandId: setupId,
      expectedCampaignVersion: 0,
      command: setupCommand,
      tool: "world_context",
      resolve: (current) => run(current, context, setupCommand, setupId),
    });
    const search = command({
      kind: "challenge_attempt",
      challengeId: "search-hidden-fact-v1",
      factId: "secret-compartment",
      goal: "Find it",
      approach: "Search the shelves",
    });
    const searchId = randomUUID();
    const discovered = store.executeCommand({
      context,
      clientCommandId: searchId,
      expectedCampaignVersion: established.state.version,
      command: search,
      tool: "challenge_attempt",
      resolve: (current) => run(current, context, search, searchId),
    });
    const records = discovered.state.actorKnowledge;
    store.close();

    const reopened = new LanternEngineStore(join(directory, "engine.db"));
    const loaded = reopened.getCampaign(context);
    expect(actorKnowledgeProjection(context.actorId, loaded).facts.map((fact) => fact.id)).toContain("secret-compartment");
    const replay = reopened.executeCommand({
      context,
      clientCommandId: searchId,
      expectedCampaignVersion: established.state.version,
      command: search,
      tool: "challenge_attempt",
      resolve: () => { throw new Error("A replay must not re-enter the resolver."); },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state.actorKnowledge).toEqual(records);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("marks prior knowledge stale after a fact revision and isolates actors and campaigns", () => {
    const state = createInitialCampaign("account-stale", "actor-stale");
    const context = contextFor(state);
    const established = run(state, context, worldContextCommand([
      searchableFact({ id: "stale-secret", title: "Old secret", passiveDc: 10 }),
    ]));
    expect(actorKnowledgeProjection(context.actorId, established.state).facts.map((fact) => fact.id)).toContain("stale-secret");

    const revised = run(established.state, context, worldContextCommand([
      searchableFact({ id: "stale-secret", title: "Changed secret", passiveDc: 30 }),
    ]));
    expect(revised.state.actorKnowledge).toEqual([
      expect.objectContaining({ factId: "stale-secret", tier: "stale", stale: true }),
    ]);
    expect(actorKnowledgeProjection(context.actorId, revised.state).facts.map((fact) => fact.id)).not.toContain("stale-secret");
    expect(actorKnowledgeProjection("another-actor", revised.state).facts.map((fact) => fact.id)).not.toContain("stale-secret");

    const otherCampaign = createInitialCampaign("other-account", "other-actor");
    otherCampaign.worldFacts = revised.state.worldFacts;
    expect(actorKnowledgeProjection(otherCampaign.actorId, otherCampaign).facts).toEqual([]);
  });
});
