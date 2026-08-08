import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  engineCommandSchema,
  engineQuestGraphInputSchema,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand, toSessionView } from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function rescueGraph(deadlineAtMinutes = 60) {
  return {
    objectives: [
      {
        id: "reach-ruin",
        title: "Reach the ruin",
        mode: "ordered" as const,
        optional: false,
        hidden: false,
        predicate: { kind: "actor_at_location" as const, actorId: "actor-quest", locationRef: "ruin" },
      },
      {
        id: "recover-evidence",
        title: "Recover the sealed evidence",
        mode: "unordered" as const,
        optional: true,
        hidden: true,
        predicate: { kind: "fact_discovered" as const, factId: "rescue-evidence" },
      },
    ],
    transitions: [
      {
        id: "rescue-succeeded",
        label: "The survivors are rescued",
        outcome: "success" as const,
        predicates: [{ kind: "encounter_outcome" as const, outcomeId: "rescue-encounter", outcome: "rescue_succeeded" as const }],
        requiresObjectiveIds: ["reach-ruin"],
        consequence: {
          xp: 100,
          copper: 250,
          items: [{ id: "rescue-medal", quantity: 1, authoredDefinition: { name: "Rescue medal", kind: "treasure", weight: 0.1, valueCopper: 25 } }],
          reputation: { communityId: "local-community", delta: 5 },
          worldFact: { factId: "rescued-villagers", active: true },
          followUpQuestId: "escort-follow-up",
        },
      },
      {
        id: "rescue-failed-evidence",
        label: "The rescue fails, but the evidence is recovered",
        outcome: "failure" as const,
        predicates: [{ kind: "encounter_outcome" as const, outcomeId: "rescue-encounter", outcome: "rescue_failed" as const }],
        requiresObjectiveIds: ["reach-ruin", "recover-evidence"],
        consequence: { xp: 25, copper: 50, reputation: { communityId: "local-community", delta: -2 } },
      },
      {
        id: "deadline-expired",
        label: "The deadline passes",
        outcome: "expiration" as const,
        predicates: [],
        requiresObjectiveIds: [],
        consequence: { reputation: { communityId: "local-community", delta: -5 } },
      },
      {
        id: "abandon-rescue",
        label: "Abandon the rescue",
        outcome: "abandonment" as const,
        predicates: [],
        requiresObjectiveIds: [],
        choiceId: "abandon",
        consequence: { xp: 0, copper: 0 },
      },
    ],
    deadlineAtMinutes,
    deadlineTransitionId: "deadline-expired",
    followUpQuestId: "escort-follow-up",
    clock: { id: "rescue-clock", title: "Rescue progress", max: 2, source: "objective" as const },
  };
}

function graphQuestState(): LanternCampaignState {
  const state = createInitialCampaign("account-quest", "actor-quest");
  state.worldContext = {
    id: "ruin",
    title: "The ruin",
    description: "A broken ruin.",
    features: [],
    exits: [],
    npcs: [],
    merchants: [],
    objects: [],
  };
  state.worldFacts = [
    {
      id: "rescue-evidence",
      sceneId: "ruin",
      title: "Sealed evidence",
      description: "A sealed ledger.",
      kind: "secret",
      visibility: "hidden",
      obscurity: "dark",
      requiredSense: "normal",
      passiveDc: null,
      revision: 1,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "rescued-villagers",
      sceneId: "ruin",
      title: "Rescued villagers",
      description: "The villagers survived.",
      kind: "area",
      visibility: "public",
      obscurity: "clear",
      requiredSense: "normal",
      passiveDc: null,
      revision: 1,
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  return normalizeCampaignState(state);
}

function createRescueQuest(state: LanternCampaignState, graph = rescueGraph()) {
  const command = engineCommandSchema.parse({
    kind: "quest_create",
    title: "Rescue at the ruin",
    objective: "Resolve the rescue graph.",
    rewardXp: 0,
    rewardCopper: 0,
    graph,
  });
  const result = resolveEngineCommand(state, context(state), randomUUID(), command, "quest_create");
  expect(result.accepted).toBe(true);
  const quest = result.state.quests.at(-1)!;
  return { state: result.state, quest, event: result.event };
}

describe("authoritative quest graphs", () => {
  it("accepts only the closed predicate vocabulary and hides unrevealed objectives", () => {
    const parsed = engineQuestGraphInputSchema.safeParse(rescueGraph());
    expect(parsed.success).toBe(true);
    expect(engineQuestGraphInputSchema.safeParse({ ...rescueGraph(), objectives: [{ ...rescueGraph().objectives[0], predicate: { kind: "script", code: "state => true" } }] }).success).toBe(false);
    expect(engineQuestGraphInputSchema.safeParse({
      ...rescueGraph(),
      transitions: [{
        ...rescueGraph().transitions[0],
        consequence: { items: [{ id: "zero-reward", quantity: 0, authoredDefinition: { name: "Zero reward", kind: "treasure", weight: 0 } }] },
      }],
    }).success).toBe(false);
    const created = createRescueQuest(graphQuestState());
    const projected = toSessionView(created.state).quests.find((quest) => quest.id === created.quest.id)!;
    expect(projected.graph?.objectives.find((objective) => objective.id === "recover-evidence")).toMatchObject({ title: "Hidden objective", discovered: false });
    expect(projected.graph?.transitions.some((transition) => transition.id === "rescue-failed-evidence")).toBe(false);
    expect(JSON.stringify(created.event?.command ?? created.state.log)).not.toContain("rescue-evidence");
  });

  it("resolves the rescue-success branch atomically with reward, reputation, world change, follow-up, and bounded clock", () => {
    const created = createRescueQuest(graphQuestState());
    const state = created.state;
    (state.combat as any).lifecycle = { outcomeId: "rescue-encounter", outcome: "rescue_succeeded" };
    const command = engineCommandSchema.parse({ kind: "quest_transition", questId: created.quest.id, transitionId: "rescue-succeeded" });
    const result = resolveEngineCommand(state, context(state), randomUUID(), command, "quest_transition");
    expect(result.accepted).toBe(true);
    expect(result.state.quests.at(-1)).toMatchObject({ status: "completed", progress: 50 });
    expect(result.state.character.xp).toBe(100);
    expect(result.state.character.currency.copper).toBe(state.character.currency.copper + 250);
    expect(result.state.character.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ id: "rescue-medal", quantity: 1 })]));
    expect(result.state.social?.reputations).toEqual(expect.arrayContaining([expect.objectContaining({ communityId: "local-community", score: 5 })]));
    expect(result.state.worldFacts.find((fact) => fact.id === "rescued-villagers")?.active).toBe(true);
    expect(result.state.quests.at(-1)?.graph?.followUpEligible).toBe(true);
    expect(result.state.quests.at(-1)?.graph?.clock?.current).toBe(1);
    expect(result.state.claimedRewards).toEqual(expect.arrayContaining([
      `${created.quest.id}:rescue-succeeded:xp`,
      `${created.quest.id}:rescue-succeeded:copper`,
      `${created.quest.id}:rescue-succeeded:reputation`,
      `${created.quest.id}:rescue-succeeded:world`,
      `${created.quest.id}:rescue-succeeded:item:rescue-medal`,
    ]));
    expect(result.event?.stateChanges.some((change) => change.path === "/claimedRewards")).toBe(true);
  });

  it("requires hidden evidence for the failure branch and never allows direct quest_update mutation", () => {
    const created = createRescueQuest(graphQuestState());
    const state = created.state;
    (state.combat as any).lifecycle = { outcomeId: "rescue-encounter", outcome: "rescue_failed" };
    const invalidUpdate = engineCommandSchema.parse({ kind: "quest_update", questId: created.quest.id, status: "completed" });
    const rejected = resolveEngineCommand(state, context(state), randomUUID(), invalidUpdate, "quest_update");
    expect(rejected).toMatchObject({ accepted: false, code: "quest_transition_required" });
    expect(JSON.stringify(rejected.state)).toBe(JSON.stringify(state));
    expect(rejected.event).toBeNull();
    const transition = engineCommandSchema.parse({ kind: "quest_transition", questId: created.quest.id, transitionId: "rescue-failed-evidence" });
    const missingEvidence = resolveEngineCommand(state, context(state), randomUUID(), transition, "quest_transition");
    expect(missingEvidence).toMatchObject({ accepted: false, code: "quest_objective_unsatisfied" });
    const withEvidence = {
      ...state,
      actorKnowledge: [{ id: "knowledge-evidence", actorId: state.actorId, factId: "rescue-evidence", tier: "known", source: "active-search", provenance: "test", confidence: 1, campaignVersion: state.version, factRevision: 1, stale: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    } as LanternCampaignState;
    const accepted = resolveEngineCommand(withEvidence, context(withEvidence), randomUUID(), transition, "quest_transition");
    expect(accepted.accepted).toBe(true);
    expect(accepted.state.quests.at(-1)).toMatchObject({ status: "failed" });
    expect(accepted.state.quests.at(-1)?.graph?.objectives.find((objective) => objective.id === "recover-evidence")).toMatchObject({ status: "completed", discovered: true });
  });

  it("keeps abandonment distinct and applies no success reward", () => {
    const created = createRescueQuest(graphQuestState());
    const command = engineCommandSchema.parse({ kind: "quest_transition", questId: created.quest.id, transitionId: "abandon-rescue", choiceId: "abandon" });
    const result = resolveEngineCommand(created.state, context(created.state), randomUUID(), command, "quest_transition");
    expect(result.accepted).toBe(true);
    expect(result.state.quests.at(-1)).toMatchObject({ status: "abandoned", progress: 50, rewardClaimed: false });
    expect(result.state.character.xp).toBe(created.state.character.xp);
    expect(result.state.character.currency).toEqual(created.state.character.currency);
    expect(result.state.quests.at(-1)?.graph?.clock).toMatchObject({ current: 1, resolvedByTransitionId: "abandon-rescue" });
  });

  it("rejects a schema-valid consequence that references an unknown world fact atomically", () => {
    const created = createRescueQuest(graphQuestState());
    const invalidState = JSON.parse(JSON.stringify(created.state)) as LanternCampaignState;
    invalidState.combat.lifecycle = { outcomeId: "rescue-encounter", outcome: "rescue_succeeded" } as any;
    invalidState.quests.at(-1)!.graph!.transitions.find((transition) => transition.id === "rescue-succeeded")!.consequence.worldFact = { factId: "missing-fact", active: true };
    const command = engineCommandSchema.parse({ kind: "quest_transition", questId: created.quest.id, transitionId: "rescue-succeeded" });
    const rejected = resolveEngineCommand(invalidState, context(invalidState), randomUUID(), command, "quest_transition");
    expect(rejected).toMatchObject({ accepted: false, code: "quest_world_fact_missing" });
    expect(JSON.stringify(rejected.state)).toBe(JSON.stringify(invalidState));
    expect(rejected.event).toBeNull();
  });

  it("expires exactly once at the #12 time boundary and survives restart/replay", () => {
    const created = createRescueQuest(graphQuestState());
    const state = created.state;
    state.character.created = true;
    state.character.hitDiceRemaining = 1;
    state.character.hp = Math.max(1, state.character.hp);
    const beforeDeadline = { ...state, time: { ...state.time, gameTime: { ...state.time.gameTime, totalMinutes: 30 } } };
    const expiration = engineCommandSchema.parse({ kind: "quest_transition", questId: created.quest.id, transitionId: "deadline-expired" });
    expect(resolveEngineCommand(beforeDeadline, context(beforeDeadline), randomUUID(), expiration, "quest_transition")).toMatchObject({ accepted: false, code: "quest_deadline_not_reached" });
    const atDeadline = { ...state, time: { ...state.time, gameTime: { ...state.time.gameTime, totalMinutes: 60 } } };
    const rest = engineCommandSchema.parse({ kind: "rest", restType: "long" });
    const result = resolveEngineCommand(atDeadline, context(atDeadline), randomUUID(), rest, "rest");
    expect(result.accepted).toBe(true);
    expect(result.state.quests.at(-1)).toMatchObject({ status: "expired" });
    expect(result.state.time.gameTime.totalMinutes).toBe(540);
    const restart = normalizeCampaignState(JSON.parse(JSON.stringify(result.state)));
    expect(restart.quests.at(-1)).toMatchObject({ status: "expired" });
    const store = new LanternEngineStore(":memory:");
    const request = context(atDeadline);
    store.createCampaign(request, atDeadline);
    const id = randomUUID();
    const stored = store.executeCommand({ context: request, clientCommandId: id, expectedCampaignVersion: atDeadline.version, command: rest, tool: "rest", resolve: (current) => resolveEngineCommand(current, request, id, rest, "rest") });
    const replay = store.executeCommand({ context: request, clientCommandId: id, expectedCampaignVersion: atDeadline.version, command: rest, tool: "rest", resolve: (current) => resolveEngineCommand(current, request, id, rest, "rest") });
    expect(replay.replayed).toBe(true);
    expect(replay.state.quests.at(-1)?.status).toBe(stored.state.quests.at(-1)?.status);
    expect(() => store.executeCommand({ context: request, clientCommandId: randomUUID(), expectedCampaignVersion: atDeadline.version, command: rest, tool: "rest", resolve: (current) => resolveEngineCommand(current, request, randomUUID(), rest, "rest") })).toThrow(EngineVersionConflictError);
  });

  it("replays one graph transition and rejects a different command at the stale version", () => {
    const created = createRescueQuest(graphQuestState());
    const state = created.state;
    const request = context(state);
    const store = new LanternEngineStore(":memory:");
    store.createCampaign(request, state);
    const command = engineCommandSchema.parse({ kind: "quest_transition", questId: created.quest.id, transitionId: "abandon-rescue", choiceId: "abandon" });
    const id = randomUUID();
    const execute = () => store.executeCommand({
      context: request,
      clientCommandId: id,
      expectedCampaignVersion: state.version,
      command,
      tool: "quest_transition",
      resolve: (current) => resolveEngineCommand(current, request, id, command, "quest_transition"),
    });
    const first = execute();
    const replay = execute();
    expect(first.accepted).toBe(true);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.state.claimedRewards).toEqual(first.state.claimedRewards);
    expect(replay.state.quests.at(-1)?.graph?.consequenceRecords).toHaveLength(1);
    expect(() => store.executeCommand({
      context: request,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: state.version,
      command,
      tool: "quest_transition",
      resolve: (current) => resolveEngineCommand(current, request, randomUUID(), command, "quest_transition"),
    })).toThrow(EngineVersionConflictError);
  });

  it("advances a time-sourced clock from committed elapsed time and caps it", () => {
    const created = createRescueQuest(graphQuestState(), rescueGraph(10_000));
    const state = created.state;
    state.quest.graph!.clock!.source = "time";
    state.quests.at(-1)!.graph!.clock!.source = "time";
    state.character.created = true;
    state.character.hitDiceRemaining = 1;
    state.character.hp = Math.max(1, state.character.hp);
    const rest = engineCommandSchema.parse({ kind: "rest", restType: "long" });
    const result = resolveEngineCommand(state, context(state), randomUUID(), rest, "rest");
    expect(result.accepted).toBe(true);
    expect(result.state.quests.at(-1)?.graph?.clock).toMatchObject({ current: 2, max: 2, source: "time" });
    expect(result.event?.stateChanges.some((change) => change.path.endsWith("/graph/clock"))).toBe(true);
  });
});
