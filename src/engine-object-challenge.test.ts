import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number, _max: number) => min));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import {
  createInitialCampaign,
  resolveEngineCommand,
} from "./engine-domain.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";
import {
  commandForTool,
  lanternToolDefinitions,
  parseToolArguments,
} from "./engine-tools.js";
import {
  compileAtomicTurnResolution,
  provisionalState,
} from "./engine-turn-plan.js";
import { ruinedGatehouseWorldContextCommand } from "./world-object-fixture.js";

const doorId = "gatehouse-door";

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

function resolve(state: LanternCampaignState, next: EngineCommand, clientCommandId: string = randomUUID()) {
  return resolveEngineCommand(state, contextFor(state), clientCommandId, next, next.kind);
}

function preparedState(accountId: string, actorId: string): LanternCampaignState {
  const initial = createInitialCampaign(accountId, actorId);
  initial.character.created = true;
  initial.phase = "sandbox";
  const materialized = resolve(initial, ruinedGatehouseWorldContextCommand());
  if (!materialized.accepted) throw new Error(materialized.code + ": " + materialized.message);
  return materialized.state;
}

function targetState(state: LanternCampaignState, targetId = doorId) {
  return state.worldContext?.objects.find((object) => object.id === targetId);
}

function forceDoor(targetId = doorId): EngineCommand {
  return command({
    kind: "challenge_attempt",
    challengeId: "barred-door-v1",
    targetId,
    goal: "Force the locked door open",
    approach: "Set my shoulder and drive through it",
  });
}

function pickLock(targetId = doorId): EngineCommand {
  return command({
    kind: "challenge_attempt",
    challengeId: "pick-lock-v1",
    targetId,
    goal: "Pick the lock",
    approach: "Probe the pins carefully with my thieves' tools",
  });
}

describe("target-bound object challenges", () => {
  it("atomically opens the exact locked object on a successful force challenge", () => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const state = preparedState("object-force", "actor-force");
    const before = targetState(state);
    const result = resolve(state, forceDoor(), "force-door");

    expect(result).toMatchObject({
      accepted: true,
      state: { version: state.version + 1 },
      data: {
        success: true,
        objectTransition: {
          objectId: doorId,
          objectName: "Wooden gatehouse door",
          beforeState: "locked",
          afterState: "open",
          affordance: "open",
        },
      },
    });
    expect(targetState(result.state)).toMatchObject({
      state: "open",
      revision: (before?.revision ?? 0) + 1,
      provenance: {
        sourceCommandId: "force-door",
        sourceVersion: state.version + 1,
      },
    });
    expect(result.event?.adjudication).toMatchObject({
      challengeId: "barred-door-v1",
      targetId: doorId,
      sceneId: state.worldContext?.id + ":" + doorId,
      selectedRuleFamily: "athletics",
    });
    expect(result.event?.stateChanges).toContainEqual(expect.objectContaining({
      path: "/worldContext/objects/" + doorId,
      before: expect.objectContaining({ state: "locked" }),
      after: expect.objectContaining({ state: "open" }),
    }));
    expect(result.message).toBe("You force Wooden gatehouse door open.");
    expect(result.state.log.at(-1)?.text).toBe(result.message);
  });

  it("uses the reviewed Thieves' Tools check and unlocks the same target on success", () => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const state = preparedState("object-lockpick", "actor-lockpick");
    state.character.proficiencies.tools = ["Thieves' Tools"];
    const result = resolve(state, pickLock(), "pick-door");

    expect(result.accepted).toBe(true);
    expect(targetState(result.state)?.state).toBe("unlocked");
    expect(result.event?.adjudication).toMatchObject({
      challengeId: "pick-lock-v1",
      targetId: doorId,
      selectedRuleFamily: "thieves-tools",
      tool: "Thieves' Tools",
    });
    expect(result.event?.check).toMatchObject({
      ability: "dex",
      skill: null,
      tool: "Thieves' Tools",
      modifierSources: expect.arrayContaining(["tool_proficiency"]),
    });
    expect(result.data).toMatchObject({
      objectTransition: { objectId: doorId, beforeState: "locked", afterState: "unlocked" },
    });
  });

  it("keeps the target locked on failure and records no object-state change", () => {
    deterministicRandomInt.mockReset().mockReturnValue(1);
    const state = preparedState("object-failure", "actor-failure");
    const before = structuredClone(targetState(state));
    const result = resolve(state, forceDoor(), "failed-force");

    expect(result).toMatchObject({
      accepted: true,
      data: { success: false, outcome: "failure-with-complication" },
    });
    expect(targetState(result.state)).toEqual(before);
    expect(result.event?.stateChanges.some((change) => change.path === "/worldContext/objects/" + doorId)).toBe(false);
    expect(result.data).not.toHaveProperty("objectTransition");
  });

  it("binds retry identity to the target instead of blocking the same approach on another object", () => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const state = preparedState("object-retry-target", "actor-retry-target");
    const firstDoor = targetState(state)!;
    state.worldContext!.objects.push({
      ...structuredClone(firstDoor),
      id: "gatehouse-second-door",
      definition: {
        ...structuredClone(firstDoor.definition),
        key: "gatehouse-second-door",
        sourceRef: "fixture:ruined-gatehouse:second-door",
        name: "Second gatehouse door",
      },
    });
    const first = resolve(state, forceDoor(), "target-one");
    const second = resolve(first.state, forceDoor("gatehouse-second-door"), "target-two");

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(targetState(second.state)?.state).toBe("open");
    expect(targetState(second.state, "gatehouse-second-door")?.state).toBe("open");
    expect(first.event?.adjudication?.approachHash).not.toBe(second.event?.adjudication?.approachHash);
    expect(first.event?.adjudication?.sceneId).not.toBe(second.event?.adjudication?.sceneId);
  });

  it.each([
    {
      label: "missing target",
      mutate: (_state: LanternCampaignState) => undefined,
      next: command({ kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Shoulder it" }),
      code: "challenge_target_required",
    },
    {
      label: "unknown target",
      mutate: (_state: LanternCampaignState) => undefined,
      next: forceDoor("not-an-object"),
      code: "challenge_target_not_found",
    },
    {
      label: "wrong target state",
      mutate: (state: LanternCampaignState) => { targetState(state)!.state = "open"; },
      next: forceDoor(),
      code: "challenge_target_state_invalid",
    },
    {
      label: "missing target affordance",
      mutate: (state: LanternCampaignState) => {
        const crate = targetState(state, "gatehouse-crate")!;
        crate.state = "locked";
      },
      next: forceDoor("gatehouse-crate"),
      code: "challenge_target_affordance_unavailable",
    },
  ])("rejects $label before RNG without mutation", ({ mutate, next, code }) => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const state = preparedState("object-invalid-" + code, "actor-invalid-" + code);
    mutate(state);
    const before = JSON.stringify(state);
    const result = resolve(state, next);

    expect(result).toMatchObject({ accepted: false, code, event: null });
    expect(JSON.stringify(result.state)).toBe(before);
    expect(deterministicRandomInt).not.toHaveBeenCalled();
  });

  it("rejects the wrong challenge/tool pairing and requires reviewed lockpick proficiency", () => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const state = preparedState("object-tools", "actor-tools");
    const forcedWithTools = resolve(state, command({
      kind: "challenge_attempt",
      challengeId: "barred-door-v1",
      targetId: doorId,
      goal: "Pick it",
      approach: "Use lockpicks",
      tool: "Thieves' Tools",
    }));
    expect(forcedWithTools).toMatchObject({ accepted: false, code: "challenge_tool_not_applicable" });

    const untrained = resolve(state, pickLock());
    expect(untrained).toMatchObject({ accepted: false, code: "tool_proficiency_required" });
    expect(targetState(untrained.state)?.state).toBe("locked");
    expect(deterministicRandomInt).not.toHaveBeenCalled();
  });

  it("materializes and opens the target in one H15 atomic turn", () => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const initial = createInitialCampaign("object-h15", "actor-h15");
    initial.character.created = true;
    initial.phase = "sandbox";
    const context = contextFor(initial);
    const materializeCommand = ruinedGatehouseWorldContextCommand();
    const materialized = resolveEngineCommand(initial, context, "h15:0", materializeCommand, "world_context");
    const challenge = forceDoor();
    const challenged = resolveEngineCommand(
      provisionalState(materialized, initial.version),
      context,
      "h15:1",
      challenge,
      "challenge_attempt",
    );
    const committed = compileAtomicTurnResolution(initial, context, "h15", [
      { tool: "world_context", command: materializeCommand, resolution: materialized },
      { tool: "challenge_attempt", command: challenge, resolution: challenged },
    ]);

    expect(committed).toMatchObject({
      accepted: true,
      state: { version: initial.version + 1 },
      event: { outcome: "atomic_turn_plan" },
    });
    expect(committed.event?.effects?.map((effect) => effect.tool)).toEqual(["world_context", "challenge_attempt"]);
    expect(targetState(committed.state)?.state).toBe("open");
    expect(committed.event?.effects?.[1]?.stateChanges).toContainEqual(expect.objectContaining({
      path: "/worldContext/objects/" + doorId,
    }));
  });

  it("replays the persisted target transition after restart without rerolling", () => {
    deterministicRandomInt.mockReset().mockReturnValue(20);
    const state = preparedState("object-replay", "actor-replay");
    const context = contextFor(state);
    const directory = mkdtempSync(join(tmpdir(), "lantern-object-challenge-"));
    const databasePath = join(directory, "engine.db");
    const clientCommandId = "replay-object-transition";
    const next = forceDoor();
    const store = new LanternEngineStore(databasePath);
    store.createCampaign(context, state);
    const first = store.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command: next,
      tool: "challenge_attempt",
      resolve: (current) => resolveEngineCommand(current, context, clientCommandId, next, "challenge_attempt"),
    });
    const callsAfterFirst = deterministicRandomInt.mock.calls.length;
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const replay = reopened.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command: next,
      tool: "challenge_attempt",
      resolve: () => { throw new Error("Replay re-entered the resolver."); },
    });
    expect(replay.replayed).toBe(true);
    expect(targetState(replay.state)?.state).toBe("open");
    expect(replay.event).toEqual(first.event);
    expect(deterministicRandomInt.mock.calls.length).toBe(callsAfterFirst);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("exposes and persists targetId through the model-facing tool contract", () => {
    const parsed = parseToolArguments("challenge_attempt", {
      challengeId: "pick-lock-v1",
      targetId: doorId,
      goal: "Pick the lock",
      approach: "Work the pins",
    });
    expect(parsed).toMatchObject({ challengeId: "pick-lock-v1", targetId: doorId });
    expect(commandForTool("challenge_attempt", parsed)).toMatchObject({
      kind: "challenge_attempt",
      challengeId: "pick-lock-v1",
      targetId: doorId,
    });
    const definition = lanternToolDefinitions.find((candidate) => candidate.function.name === "challenge_attempt");
    expect(definition?.function.parameters.properties).toHaveProperty("targetId");
  });
});
