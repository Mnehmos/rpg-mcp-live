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

describe("server-owned challenge adjudication", () => {
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
