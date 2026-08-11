import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyEffect,
  clearEffectsByPolicy,
  expireEffect,
  expireEffectsAtBoundary,
  hasActiveCondition,
  queryModifiers,
  removeConditionEffects,
  removeEffectsBySource,
} from "./engine-effects.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import type {
  EngineEffectInstance,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";

function effect(overrides: Partial<EngineEffectInstance> = {}): EngineEffectInstance {
  return {
    id: "effect-1",
    definitionKey: "test:effect",
    sourceRef: "source-a",
    targetRefs: ["target-a"],
    operations: [{ kind: "disadvantage", category: "attack-roll" }],
    startAnchor: { kind: "campaign-round", round: 1 },
    duration: { kind: "persistent" },
    stackingKey: "test:effect",
    stackingRule: "ignore",
    clearedBy: ["never"],
    status: "active",
    provenance: {
      sourceContentKey: null,
      sourceCommandId: "command-1",
      rulesVersion: "rules-1",
      formulaRevision: "test-v1",
    },
    ...overrides,
  };
}

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function resolve(state: LanternCampaignState, command: Parameters<typeof resolveEngineCommand>[3]) {
  const id = randomUUID();
  return resolveEngineCommand(state, context(state), id, command, command.kind === "improvise" ? "improvise" : "rest");
}

describe("effects and conditions kernel", () => {
  it("does not stack a same-source duplicate and cancels opposing modifiers", () => {
    const first = effect();
    const duplicate = applyEffect([first], {
      ...first,
      id: undefined,
    });
    expect(duplicate.decision).toBe("ignored");
    expect(duplicate.effects).toHaveLength(1);

    const advantage = effect({
      id: "effect-2",
      sourceRef: "source-b",
      stackingKey: "other",
      operations: [{ kind: "advantage", category: "attack-roll" }],
    });
    expect(queryModifiers([first, advantage], "target-a", "attack-roll")).toMatchObject({
      advantage: 1,
      disadvantage: 1,
      mode: "cancelled",
      advantageEffectIds: ["effect-2"],
      disadvantageEffectIds: ["effect-1"],
    });
  });

  it("expires at an explicit boundary exactly once", () => {
    const timed = effect({
      duration: { kind: "turn-boundary", subject: "target", boundary: "start", offsetTurns: 1 },
      clearedBy: ["duration"],
    });
    const beforeBoundary = expireEffectsAtBoundary([timed], "target-a", "start", 1);
    expect(beforeBoundary[0]?.status).toBe("active");
    const expired = expireEffectsAtBoundary(beforeBoundary, "target-a", "start", 2);
    expect(expired[0]?.status).toBe("expired");
    expect(expireEffect(expired, timed.id)[0]?.status).toBe("expired");
  });

  it("removes source dependents and rest-clears only permitted effects", () => {
    const sourceBound = effect({ id: "source-bound", sourceRef: "source-a", clearedBy: ["source-removal"] });
    const shortRest = effect({ id: "short-rest", sourceRef: "source-b", clearedBy: ["short-rest"] });
    const unrelated = effect({ id: "unrelated", sourceRef: "source-b", clearedBy: ["never"] });
    const removed = removeEffectsBySource([sourceBound, shortRest, unrelated], "source-a");
    expect(removed.find((candidate) => candidate.id === "source-bound")?.status).toBe("removed");
    const rested = clearEffectsByPolicy(removed, "short-rest");
    expect(rested.find((candidate) => candidate.id === "short-rest")?.status).toBe("removed");
    expect(rested.find((candidate) => candidate.id === "unrelated")?.status).toBe("active");
  });

  it("projects a bounded improvise condition into the canonical effect list", () => {
    const state = createInitialCampaign("account-effects", "actor-effects");
    const result = resolve(state, {
      kind: "improvise",
      title: "Tainted blade",
      description: "A reviewed poison marker takes hold.",
      effectType: "condition",
      targetId: state.character.id,
      condition: "poisoned",
      durationRounds: 2,
    });
    expect(result.accepted).toBe(true);
    expect(result.state.character.conditions).toEqual(["poisoned"]);
    expect(result.state.effects).toHaveLength(1);
    expect(hasActiveCondition(result.state.effects, state.character.id, "poisoned")).toBe(true);
    expect(queryModifiers(result.state.effects, state.character.id, "attack-roll").mode).toBe("disadvantage");
    expect(queryModifiers(result.state.effects, state.character.id, "ability-check").mode).toBe("disadvantage");

    const restored = normalizeCampaignState(JSON.parse(JSON.stringify(result.state)) as LanternCampaignState);
    expect(restored.effects).toEqual(result.state.effects);
    expect(restored.character.conditions).toEqual(["poisoned"]);
    expect(removeConditionEffects(restored.effects, restored.character.id, "poisoned").every((candidate) => candidate.status !== "active")).toBe(true);
  });

  it("rejects unsupported movement/summoning without committing state", () => {
    const state = createInitialCampaign("account-effects", "actor-effects");
    const before = JSON.stringify(state);
    const result = resolve(state, {
      kind: "improvise",
      title: "Unreviewed portal",
      description: "This must not become a narration-only mechanical success.",
      effectType: "movement",
      targetId: state.character.id,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe("unsupported_effect");
    expect(result.state.version).toBe(state.version);
    expect(JSON.stringify(result.state)).toBe(before);
  });

  it("rejects a condition operation without a reviewed marker immutably", () => {
    const state = createInitialCampaign("account-effects", "actor-effects");
    const before = JSON.stringify(state);
    const result = resolve(state, {
      kind: "improvise",
      title: "Unspecified affliction",
      description: "The resolver must not invent a condition.",
      effectType: "condition",
      targetId: state.character.id,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe("condition_required");
    expect(result.state.version).toBe(state.version);
    expect(JSON.stringify(result.state)).toBe(before);
  });

  it("resolves Dodge through the substrate and expires it at the next turn boundary", () => {
    const state = createInitialCampaign("account-effects", "actor-effects");
    const started = resolve(state, {
      kind: "combat_start",
      encounterId: "dodge-kernel",
      encounterName: "Dodge kernel",
      creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
    });
    expect(started.accepted).toBe(true);
    const dodged = resolveEngineCommand(
      started.state,
      context(started.state),
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "advance_turn",
    );
    expect(dodged.accepted).toBe(true);
    expect(dodged.state.character.conditions).toContain("dodging");
    expect(queryModifiers(dodged.state.effects, dodged.state.character.id, "attack-roll").mode).toBe("disadvantage");

    const enemy = resolveEngineCommand(
      dodged.state,
      context(dodged.state),
      randomUUID(),
      { kind: "advance_turn", actionKey: "scimitar" },
      "advance_turn",
    );
    expect(enemy.accepted).toBe(true);
    expect(enemy.state.character.conditions).not.toContain("dodging");
    expect(queryModifiers(enemy.state.effects, enemy.state.character.id, "attack-roll").mode).toBe("normal");
  });

  it("lets a creature authoritatively gain and then lose a condition", () => {
    const state = createInitialCampaign("account-effects", "actor-effects");
    state.character.hp = 200;
    state.character.maxHp = 200;
    state.character.savingThrows.con = -100;
    const started = resolve(state, {
      kind: "combat_start",
      encounterId: "condition-kernel",
      encounterName: "Condition kernel",
      creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_vrock", count: 1 }],
    });
    const dodged = resolveEngineCommand(
      started.state,
      context(started.state),
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action",
    );
    const enemyId = dodged.state.combat.enemies[0]!.id;
    const applied = resolveEngineCommand(
      dodged.state,
      context(dodged.state),
      randomUUID(),
      { kind: "advance_turn", combatantId: enemyId, actionKey: "stunning-screech" },
      "advance_turn",
    );
    expect(applied.accepted).toBe(true);
    expect(applied.state.character.conditions).toContain("stunned");
    expect(applied.state.effects.some((candidate) => candidate.status === "active" && candidate.operations.some((operation) => operation.kind === "condition" && operation.condition === "stunned"))).toBe(true);

    const skipped = resolveEngineCommand(
      applied.state,
      context(applied.state),
      randomUUID(),
      { kind: "advance_turn" },
      "advance_turn",
    );
    const expired = resolveEngineCommand(
      skipped.state,
      context(skipped.state),
      randomUUID(),
      { kind: "advance_turn", actionKey: "multiattack" },
      "advance_turn",
    );
    expect(expired.accepted).toBe(true);
    expect(expired.state.character.conditions).not.toContain("stunned");
    expect(expired.state.character.conditionEffects).toEqual([]);
    expect(expired.state.effects.some((candidate) => candidate.status === "active" && candidate.operations.some((operation) => operation.kind === "condition" && operation.condition === "stunned"))).toBe(false);
  });
});
