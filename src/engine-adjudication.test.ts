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

import { createInitialCampaign, resolveEngineCommand } from "./engine-domain.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";
import { commandForTool, lanternToolDefinitions, parseToolArguments } from "./engine-tools.js";
import { compileAtomicTurnResolution, provisionalState } from "./engine-turn-plan.js";

function contextFor(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function command(raw: unknown): EngineCommand {
  return engineCommandSchema.parse(raw);
}

function createHarness(state: LanternCampaignState): { store: LanternEngineStore; context: RequestContext; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "lantern-adjudication-"));
  const store = new LanternEngineStore(join(dir, "engine.db"));
  const context = contextFor(state);
  store.createCampaign(context, state);
  return { store, context, dir };
}

function execute(
  harness: { store: LanternEngineStore; context: RequestContext },
  state: LanternCampaignState,
  clientCommandId: string,
  next: EngineCommand,
  expectedVersion = state.version,
) {
  return harness.store.executeCommand({
    context: harness.context,
    clientCommandId,
    expectedCampaignVersion: expectedVersion,
    command: next,
    tool: next.kind,
    resolve: (current) => resolveEngineCommand(current, harness.context, clientCommandId, next, next.kind),
  });
}

function closeHarness(harness: { store: LanternEngineStore; dir: string }): void {
  harness.store.close();
  rmSync(harness.dir, { recursive: true, force: true });
}

function heldKeyRingState(accountId: string, actorId: string): LanternCampaignState {
  const state = createInitialCampaign(accountId, actorId);
  state.phase = "sandbox";
  state.character.created = true;
  state.worldContext = {
    id: "ludus-vault",
    title: "The Ludus Holding Vault",
    description: "Titus guards the barred opening with a key ring at his belt.",
    features: ["Titus's key ring"],
    exits: [],
    npcs: [{
      id: "titus",
      name: "Titus",
      description: "A nervous guard at the barred opening.",
      disposition: "unfriendly",
      goals: ["Keep the prisoner contained"],
      socialDc: 14,
      relationshipScore: 0,
      memories: [],
    }],
    merchants: [],
    objects: [],
  };
  state.log.push({
    id: "released-key-ring-beat",
    kind: "narration",
    text: "Titus shifts at the bars; a ring of iron keys hangs from his belt.",
    createdAt: new Date(0).toISOString(),
  });
  return state;
}

function keyRingMaterializationCommand(includeSecondHeldObject = false, canLose = true): EngineCommand {
  const keyRing = {
    id: "titus-key-ring",
    definition: {
      key: "mundane-key-ring",
      sourceRef: "public-log:released-key-ring-beat",
      name: "Titus's key ring",
      description: "A mundane ring of iron keys established in released narration.",
      material: "metal",
      tags: ["key-ring", "keys", "mundane"],
      affordances: ["inspect", "move", "carry", "throw", "take", "steal", "drop"],
      prerequisites: [],
      effectInteractions: [],
      weight: 0.25,
      criticalPolicy: {
        kind: "ordinary_consequence",
        canDestroy: true,
        canLose,
        canSell: false,
        canConsume: false,
        canHide: true,
      },
    },
    state: "intact",
    locationRef: "titus",
  };
  return command({
    kind: "world_context",
    title: "The Ludus Holding Vault",
    description: "Titus guards the barred opening with a key ring at his belt.",
    features: ["Titus's key ring"],
    exits: [],
    objects: {
      upsert: [keyRing, ...(includeSecondHeldObject ? [{
        ...keyRing,
        id: "titus-bronze-seal",
        definition: {
          ...keyRing.definition,
          key: "mundane-bronze-seal",
          sourceRef: "public-log:released-bronze-seal-beat",
          name: "Titus's bronze seal",
          description: "A mundane bronze seal established in released narration.",
          tags: ["bronze-seal", "seal", "mundane"],
        },
      }] : [])],
    },
  });
}

describe("server-owned challenge adjudication", () => {
  it("materializes a released key ring, resolves its contest, and transfers it once in one atomic turn", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(20);
    const state = heldKeyRingState("account-key-success", "actor-key-success");
    const harness = createHarness(state);
    const rootCommandId = randomUUID();
    const materialize = keyRingMaterializationCommand();
    const materialized = resolveEngineCommand(state, harness.context, `${rootCommandId}:0`, materialize, "world_context");
    expect(materialized.accepted).toBe(true);

    const contest = command({
      kind: "challenge_attempt",
      challengeId: "seize-held-object-v1",
      goal: "Seize Titus's key ring",
      approach: "Lunge through the opening and snatch it",
      sceneId: "ludus-vault:titus-key-ring",
      opponentId: "titus",
    });
    const contested = resolveEngineCommand(
      provisionalState(materialized, state.version),
      harness.context,
      `${rootCommandId}:1`,
      contest,
      "challenge_attempt",
    );
    expect(contested.state.adjudicationHistory.at(-1)?.outcome).toBe("success");

    const steal = command({
      kind: "interact",
      targetId: "titus-key-ring",
      affordance: "steal",
      goal: "Take the key ring from Titus",
    });
    const stolen = resolveEngineCommand(
      provisionalState(contested, state.version),
      harness.context,
      `${rootCommandId}:2`,
      steal,
      "interact",
    );
    expect(stolen.accepted).toBe(true);

    const staged = [
      { tool: "world_context" as const, command: materialize, resolution: materialized },
      { tool: "challenge_attempt" as const, command: contest, resolution: contested },
      { tool: "interact" as const, command: steal, resolution: stolen },
    ];
    const plan = compileAtomicTurnResolution(state, harness.context, rootCommandId, staged);
    const turnPlan = { kind: "turn_plan" as const, effects: staged.map(({ tool, command: effect }) => ({ tool, command: effect })) };
    const committed = harness.store.executeCommand({
      context: harness.context,
      clientCommandId: rootCommandId,
      expectedCampaignVersion: state.version,
      command: turnPlan,
      tool: "turn_plan",
      resolve: () => plan,
    });
    expect(committed.state.version).toBe(state.version + 1);
    expect(committed.event?.effects?.map((effect) => effect.tool)).toEqual(["world_context", "challenge_attempt", "interact"]);
    expect(committed.state.worldContext?.objects).toHaveLength(1);
    expect(committed.state.worldContext?.objects[0]).toMatchObject({
      id: "titus-key-ring",
      ownerRef: { kind: "actor", id: state.actorId },
      locationRef: null,
      definition: { sourceRef: "public-log:released-key-ring-beat", tags: ["key-ring", "keys", "mundane"] },
    });

    const randomCalls = deterministicRandomInt.mock.calls.length;
    harness.store.close();
    const reopened = new LanternEngineStore(join(harness.dir, "engine.db"));
    const replay = reopened.executeCommand({
      context: harness.context,
      clientCommandId: rootCommandId,
      expectedCampaignVersion: state.version,
      command: turnPlan,
      tool: "turn_plan",
      resolve: () => { throw new Error("A replay must not materialize or roll again."); },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state.worldContext?.objects).toHaveLength(1);
    expect(deterministicRandomInt.mock.calls.length).toBe(randomCalls);
    reopened.close();
    rmSync(harness.dir, { recursive: true, force: true });
  });

  it("keeps the materialized key ring with Titus when the current contest fails", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(1);
    const state = heldKeyRingState("account-key-failure", "actor-key-failure");
    const context = contextFor(state);
    const materialize = keyRingMaterializationCommand();
    const materialized = resolveEngineCommand(state, context, "failed-key:0", materialize, "world_context");
    const contest = command({
      kind: "challenge_attempt",
      challengeId: "seize-held-object-v1",
      goal: "Seize Titus's key ring",
      approach: "Lunge through the opening and snatch it",
      sceneId: "ludus-vault:titus-key-ring",
      opponentId: "titus",
    });
    const contested = resolveEngineCommand(provisionalState(materialized, state.version), context, "failed-key:1", contest, "challenge_attempt");
    expect(contested.state.adjudicationHistory.at(-1)?.outcome).toBe("failure-with-complication");
    const randomCallsAfterFailure = deterministicRandomInt.mock.calls.length;

    const retry = resolveEngineCommand(provisionalState(contested, state.version), context, "failed-key:retry", contest, "challenge_attempt");
    expect(retry).toMatchObject({ accepted: false, code: "retry_blocked" });
    expect(deterministicRandomInt.mock.calls.length).toBe(randomCallsAfterFailure);

    for (const affordance of ["move", "carry", "throw", "take", "steal"] as const) {
      const transfer = command({
        kind: "interact",
        targetId: "titus-key-ring",
        affordance,
        goal: "Take the key ring from Titus",
        ...(["move", "carry", "throw"].includes(affordance) ? { destinationId: "ludus-vault" } : {}),
      });
      const rejected = resolveEngineCommand(provisionalState(contested, state.version), context, `failed-key:${affordance}`, transfer, "interact");
      expect(rejected).toMatchObject({ accepted: false, code: "contest_failed" });
    }

    const plan = compileAtomicTurnResolution(state, context, randomUUID(), [
      { tool: "world_context", command: materialize, resolution: materialized },
      { tool: "challenge_attempt", command: contest, resolution: contested },
    ]);
    expect(plan.state.worldContext?.objects).toHaveLength(1);
    expect(plan.state.worldContext?.objects[0]).toMatchObject({
      ownerRef: { kind: "world", id: "ludus-vault" },
      locationRef: "titus",
    });
  });

  it("preserves a protected held object when carry is requested", () => {
    const state = heldKeyRingState("account-key-protected", "actor-key-protected");
    const context = contextFor(state);
    const materialized = resolveEngineCommand(state, context, "protected-key:0", keyRingMaterializationCommand(false, false), "world_context");
    const carry = command({
      kind: "interact",
      targetId: "titus-key-ring",
      affordance: "carry",
      destinationId: "ludus-vault",
      goal: "Carry Titus's key ring away",
    });
    const rejected = resolveEngineCommand(provisionalState(materialized, state.version), context, "protected-key:1", carry, "interact");

    expect(rejected).toMatchObject({ accepted: false, code: "critical_object_protected" });
    expect(rejected.state.worldContext?.objects[0]).toMatchObject({
      ownerRef: { kind: "world", id: "ludus-vault" },
      locationRef: "titus",
    });
  });

  it("binds one successful held-object contest to one target", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(20);
    const state = heldKeyRingState("account-key-binding", "actor-key-binding");
    const context = contextFor(state);
    const materialize = keyRingMaterializationCommand(true);
    const materialized = resolveEngineCommand(state, context, "bound-key:0", materialize, "world_context");
    const contest = command({
      kind: "challenge_attempt",
      challengeId: "seize-held-object-v1",
      goal: "Seize Titus's key ring",
      approach: "Lunge through the opening and snatch it",
      sceneId: "ludus-vault:titus-key-ring",
      opponentId: "titus",
    });
    const contested = resolveEngineCommand(provisionalState(materialized, state.version), context, "bound-key:1", contest, "challenge_attempt");
    const secondObject = command({ kind: "interact", targetId: "titus-bronze-seal", affordance: "steal", goal: "Take Titus's bronze seal" });
    const rejected = resolveEngineCommand(provisionalState(contested, state.version), context, "bound-key:2", secondObject, "interact");
    expect(rejected).toMatchObject({ accepted: false, code: "contest_required" });
  });

  it("resolves an ordinary unlocked door automatically without RNG", () => {
    deterministicRandomInt.mockClear();
    const state = createInitialCampaign("account-auto", "actor-auto");
    const harness = createHarness(state);
    const result = execute(
      harness,
      state,
      randomUUID(),
      command({ kind: "challenge_attempt", challengeId: "ordinary-unlocked-door-v1", goal: "Open the door", approach: "Turn the handle" })
    );

    expect(result).toMatchObject({ accepted: true, code: null });
    expect(result.state.version).toBe(1);
    expect(result.state.adjudicationHistory).toHaveLength(1);
    expect(result.state.adjudicationHistory[0]).toMatchObject({
      challengeId: "ordinary-unlocked-door-v1",
      feasibility: "automatic",
      outcome: "automatic-success",
      attemptVersion: 1,
    });
    expect(result.event?.adjudication).toMatchObject({ dc: null, dcSource: "none", feasibility: "automatic" });
    expect(result.event?.rolls).toEqual([]);
    expect(deterministicRandomInt).not.toHaveBeenCalled();
    closeHarness(harness);
  });

  it("rejects an impossible stone gate with a causal reason and no mutation", () => {
    deterministicRandomInt.mockClear();
    const state = createInitialCampaign("account-impossible", "actor-impossible");
    const harness = createHarness(state);
    const before = JSON.stringify(harness.store.getCampaign(harness.context));
    const result = execute(
      harness,
      state,
      randomUUID(),
      command({ kind: "challenge_attempt", challengeId: "multi-ton-stone-gate-v1", goal: "Open the gate", approach: "Lift it by hand" })
    );

    expect(result).toMatchObject({ accepted: false, code: "impossible_action" });
    expect(result.message).toContain("multi-ton stone slab");
    expect((result.data as { alternatives: string[] }).alternatives).toContain("find a lever or mechanism");
    expect(result.state.version).toBe(0);
    expect(result.state.adjudicationHistory).toEqual([]);
    expect(result.event).toBeNull();
    expect(JSON.stringify(harness.store.getCampaign(harness.context))).toBe(before);
    expect(harness.store.listCampaignEvents(harness.context)).toHaveLength(0);
    expect(deterministicRandomInt).not.toHaveBeenCalled();
    closeHarness(harness);
  });

  it("uses the active profile band and reviewed Athletics DC instead of model proposals", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(20);
    const state = createInitialCampaign("account-uncertain", "actor-uncertain");
    const harness = createHarness(state);
    const result = execute(
      harness,
      state,
      randomUUID(),
      command({
        kind: "challenge_attempt",
        challengeId: "barred-door-v1",
        goal: "Force the barred door",
        approach: "Shoulder it",
        difficultyBand: "gentle",
        requestedStakes: ["time"],
      })
    );
    const adjudication = result.event?.adjudication;

    expect(result.accepted).toBe(true);
    expect(adjudication).toMatchObject({
      challengeId: "barred-door-v1",
      feasibility: "uncertain",
      selectedRuleFamily: "athletics",
      dcSource: "reviewed_challenge",
      dc: 14,
      requestedDifficultyBand: "gentle",
      selectedDifficultyBand: "standard",
      difficultyPolicyKey: "lantern-difficulty-standard-v1",
      stakes: ["time", "noise", "exposure"],
      costs: { timeMinutes: 5, noise: 2, exposure: 1 },
    });
    expect(result.event?.command).toMatchObject({ kind: "challenge_attempt" });
    expect(result.event?.rolls).toEqual([{ kind: "d20", value: 20, sides: 20 }]);
    expect(result.state.adjudicationHistory[0]).toMatchObject({ outcome: "success", roll: 20 });
    expect(result.state).not.toHaveProperty("clock");
    closeHarness(harness);
  });

  it("records bounded failure costs, blocks an identical retry, and allows a changed approach", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(1);
    const state = createInitialCampaign("account-retry", "actor-retry");
    const harness = createHarness(state);
    const firstCommand = command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Shoulder it" });
    const first = execute(harness, state, randomUUID(), firstCommand);

    expect(first).toMatchObject({ accepted: true, state: { version: 1 } });
    expect(first.state.adjudicationHistory[0]).toMatchObject({ outcome: "failure-with-complication", roll: 1, total: 5, costs: { timeMinutes: 5, noise: 2, exposure: 1 } });
    expect(first.event?.adjudication?.allowedOutcomes).toEqual(["success", "failure-with-complication"]);
    const randomCallsAfterFirst = deterministicRandomInt.mock.calls.length;
    const beforeRetry = JSON.stringify(harness.store.getCampaign(harness.context));
    const retry = execute(harness, first.state, randomUUID(), firstCommand, first.state.version);

    expect(retry).toMatchObject({ accepted: false, code: "retry_blocked", state: { version: 1 } });
    expect(deterministicRandomInt.mock.calls.length).toBe(randomCallsAfterFirst);
    expect(JSON.stringify(harness.store.getCampaign(harness.context))).toBe(beforeRetry);
    expect(harness.store.listCampaignEvents(harness.context)).toHaveLength(1);

    const changed = execute(
      harness,
      first.state,
      randomUUID(),
      command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Brace a timber and ram it" }),
      first.state.version
    );
    expect(changed).toMatchObject({ accepted: true, state: { version: 2 } });
    expect(changed.state.adjudicationHistory).toHaveLength(2);
    closeHarness(harness);
  });

  it("turns repeated changed failures into a compromised approach instead of another roll", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(1);
    const state = createInitialCampaign("account-pressure", "actor-pressure");
    const harness = createHarness(state);
    const attempts = ["Shoulder it", "Brace a timber and ram it", "Wedge the door with a fallen beam"];
    let current = state;
    for (const approach of attempts) {
      const result = execute(
        harness,
        current,
        randomUUID(),
        command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach }),
        current.version,
      );
      expect(result.accepted).toBe(true);
      current = result.state;
    }

    expect(current.failurePressures).toMatchObject([{
      challengeId: "barred-door-v1",
      sceneId: "campaign-scene",
      failureCount: 3,
      threshold: 3,
      status: "compromised",
    }]);
    const callsAfterThreshold = deterministicRandomInt.mock.calls.length;
    const blocked = execute(
      harness,
      current,
      randomUUID(),
      command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Kick the hinges" }),
      current.version,
    );
    expect(blocked).toMatchObject({ accepted: false, code: "challenge_pressure_compromised", state: { version: 3 } });
    expect(blocked.data).toMatchObject({ failurePressure: { status: "compromised", failureCount: 3 } });
    expect(deterministicRandomInt.mock.calls.length).toBe(callsAfterThreshold);

    const changedScene = execute(
      harness,
      current,
      randomUUID(),
      command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Kick the hinges", sceneId: "new-scene" }),
      current.version,
    );
    expect(changedScene.accepted).toBe(true);
    expect(changedScene.state.failurePressures).toHaveLength(1);
    closeHarness(harness);
  });

  it("rejects stale attempts immutably and replays a resolved attempt after restart without rerolling", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(20);
    const state = createInitialCampaign("account-restart", "actor-restart");
    const harness = createHarness(state);
    const next = command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Shoulder it" });
    const clientCommandId = randomUUID();
    const first = execute(harness, state, clientCommandId, next);
    expect(first.accepted).toBe(true);
    expect(() => execute(harness, first.state, randomUUID(), next, 0)).toThrow(EngineVersionConflictError);
    const callsAfterFirst = deterministicRandomInt.mock.calls.length;
    const eventsAfterFirst = harness.store.listCampaignEvents(harness.context);
    harness.store.close();

    const reopened = new LanternEngineStore(join(harness.dir, "engine.db"));
    const replay = reopened.executeCommand({
      context: harness.context,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command: next,
      tool: next.kind,
      resolve: () => { throw new Error("A replay must not re-enter the resolver."); },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(first.state);
    expect(replay.event).toEqual(first.event);
    expect(deterministicRandomInt.mock.calls.length).toBe(callsAfterFirst);
    expect(reopened.listCampaignEvents(harness.context)).toEqual(eventsAfterFirst);
    reopened.close();
    rmSync(harness.dir, { recursive: true, force: true });
  });

  it("keeps the same d20 mechanics while a profile selects a different reviewed band", () => {
    deterministicRandomInt.mockClear();
    deterministicRandomInt.mockReturnValue(12);
    const gentle = createInitialCampaign("account-gentle", "actor-gentle");
    gentle.experienceProfile = {
      ...gentle.experienceProfile,
      difficulty: "gentle",
      difficultyPolicyKey: "lantern-difficulty-gentle-v1",
    };
    const challenging = JSON.parse(JSON.stringify(gentle)) as LanternCampaignState;
    challenging.id = "campaign-challenging";
    challenging.accountId = "account-challenging";
    challenging.experienceProfile = {
      ...challenging.experienceProfile,
      difficulty: "challenging",
      difficultyPolicyKey: "lantern-difficulty-challenging-v1",
    };
    const gentleContext = contextFor(gentle);
    const challengingContext = contextFor(challenging);
    const next = command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force the barred door", approach: "Shoulder it" });
    const gentleResult = resolveEngineCommand(gentle, gentleContext, randomUUID(), next, "challenge_attempt");
    const challengingResult = resolveEngineCommand(challenging, challengingContext, randomUUID(), next, "challenge_attempt");

    expect(gentleResult.event?.rolls).toEqual(challengingResult.event?.rolls);
    expect(gentleResult.event?.modifiers?.[0]).toEqual(challengingResult.event?.modifiers?.[0]);
    expect(gentleResult.event?.adjudication).toMatchObject({ dc: 10, selectedDifficultyBand: "gentle" });
    expect(challengingResult.event?.adjudication).toMatchObject({ dc: 18, selectedDifficultyBand: "challenging" });
  });

  it("exposes only the bounded challenge contract to tool callers", () => {
    const parsed = parseToolArguments("challenge_attempt", {
      challengeId: "barred-door-v1",
      goal: "Force it",
      approach: "Shoulder it",
      difficultyBand: "gentle",
      requestedStakes: ["time"],
    });
    expect(parsed).toMatchObject({ challengeId: "barred-door-v1", difficultyBand: "gentle" });
    expect(commandForTool("challenge_attempt", parsed)).toMatchObject({ kind: "challenge_attempt" });
    expect(lanternToolDefinitions.map((definition) => definition.function.name)).toContain("challenge_attempt");
  });
});
