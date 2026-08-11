import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  activateScene,
  applyOrchestrationDecision,
  authorizePacingRefs,
  authorizedRandomEventRefs,
  buildCausalityContext,
  buildSceneRecap,
  deriveNoChangeTurns,
  emptyOrchestrationState,
  fictionBearingKinds,
  refreshSceneFromEvents,
  sceneStateFromProjection,
  type SceneState,
} from "./engine-orchestration.js";
import {
  actorKnowledgeProjection,
  createInitialCampaign,
  projectEventForActor,
  projectStateForActor,
  readToolData,
  resolveEngineCommand,
  resolveOrchestrationDecision,
  resolveProductionRoomEnter,
} from "./engine-domain.js";
import type { EngineEvent, EngineOrchestrationCommand, EngineSocialProjection, RequestContext } from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";

function event(version: number, stateChanges: EngineEvent["stateChanges"], tool: EngineEvent["tool"] = "declare"): Pick<EngineEvent, "id" | "version" | "outcome" | "stateChanges" | "tool"> {
  return { id: `event-${version}`, version, outcome: "declared", stateChanges, tool };
}

function committedEvent(version: number, stateChanges: EngineEvent["stateChanges"]): EngineEvent {
  return {
    id: `event-${version}`,
    kind: "command",
    tool: "declare",
    command: { kind: "declare", goal: `Turn ${version}` },
    accountId: "account-a",
    campaignId: "campaign-a",
    actorId: "actor-a",
    requestId: `request-${version}`,
    clientCommandId: `command-${version}`,
    previousVersion: version - 1,
    version,
    rulesVersion: "test-rules",
    contentKeys: [],
    rolls: [],
    modifiers: [],
    outcome: "declared",
    stateChanges,
    createdAt: "2026-08-08T18:00:00.000Z",
  };
}

function scene(): SceneState {
  return activateScene(sceneStateFromProjection({
    sceneId: "scene-a",
    revision: 1,
    campaignVersion: 10,
    mode: "exploration",
    immediateQuestion: "What matters most in this moment?",
    pressureRefs: ["pressure-a"],
    committedEventRefs: ["event-10"],
    actorId: "actor-a",
    now: "2026-08-08T18:00:00.000Z",
  }), "2026-08-08T18:00:01.000Z");
}

describe("scene pacing and session orchestration", () => {
  it("derives three no-change turns from committed events and ignores private/presentation records", () => {
    const events = [
      event(11, []),
      event(12, []),
      event(13, [], "orchestration"),
      event(14, [{ path: "/productionRoom/releasedSequences/x", before: null, after: {} }], "declare"),
      event(15, []),
      event(16, []),
    ];
    expect(deriveNoChangeTurns(events, 10)).toBe(4);
    expect(deriveNoChangeTurns([event(11, []), event(12, [{ path: "/worldContext/title", before: "old", after: "new" }]), event(13, [])], 10)).toBe(1);
    expect(deriveNoChangeTurns([
      event(11, [{ path: "/lastRoll", before: null, after: 16 }]),
      event(12, [{ path: "/adjudicationHistory/0", before: null, after: { outcome: "success" } }]),
    ], 10)).toBe(2);
    const carryingScene = { ...scene(), noChangeTurns: 2 };
    const refreshed = refreshSceneFromEvents(carryingScene, [event(11, [{ path: "/lastRoll", before: null, after: 8 }])]);
    expect(refreshed.noChangeTurns).toBe(3);
    expect(refreshSceneFromEvents(refreshed, [event(11, [{ path: "/lastRoll", before: null, after: 8 }])]).noChangeTurns).toBe(3);
  });

  it("classifies only fiction-bearing deltas and bound scene moves as momentum", () => {
    expect(fictionBearingKinds({
      stateChanges: [
        { path: "/lastRoll", before: null, after: 16 },
        { path: "/adjudicationHistory/0", before: null, after: {} },
        { path: "/worldContext/objects/gate/state", before: "locked", after: "open" },
        { path: "/actorKnowledge/fact-a", before: null, after: {} },
        { path: "/time/gameTime/totalMinutes", before: 0, after: 10 },
        { path: "/social/relationships/relation-a", before: null, after: {} },
        { path: "/character/hp", before: 10, after: 8 },
        { path: "/quests/quest-a/status", before: "active", after: "completed" },
      ],
      command: {
        kind: "improvise",
        sceneMove: { category: "pressure", sourceEffectIndex: 0, outcome: "failure", nextDecision: "The guard closes in." },
      } as EngineEvent["command"],
    })).toEqual(expect.arrayContaining([
      "world",
      "position",
      "knowledge",
      "time",
      "relationship",
      "resource",
      "opportunity",
      "closure",
      "pressure",
    ]));
    expect(fictionBearingKinds({
      stateChanges: [
        { path: "/lastRoll", before: null, after: 16 },
        { path: "/adjudicationHistory/0", before: null, after: {} },
        { path: "/log/0", before: null, after: {} },
      ],
    })).toEqual([]);
    expect(fictionBearingKinds({
      stateChanges: [{ path: "/time/scheduledEvents/secret", before: null, after: { targetRef: "hidden" } }],
    })).toEqual([]);
  });

  it("derives a bounded actor-safe causal lens and live threads without private scheduler data", () => {
    const state = createInitialCampaign("account-a", "actor-a", randomUUID());
    state.failurePressures = [{
      id: "pressure-failed-lock",
      actorId: "actor-a",
      challengeId: "locked-gate",
      sceneId: "scene-a",
      failureCount: 2,
      threshold: 3,
      status: "rising",
      lastFailureVersion: 11,
    }];
    state.quests = [{
      id: "quest-a",
      title: "Beat the bell",
      objective: "Reach the arena before the bell",
      status: "active",
      reward: { xp: 10, copper: 0 },
      rewardClaimed: false,
      progress: 1,
      deadlineAtMinutes: 30,
    }];
    state.time.scheduledEvents = [{
      id: "secret-clock",
      kind: "world-clock",
      dueAtMinutes: 20,
      status: "pending",
      targetRef: "hidden-target",
      provenance: { sourceCommandId: "secret", sourceVersion: 1 },
    }];
    const social: EngineSocialProjection = {
      relationships: [],
      factions: [],
      reputations: [],
      heat: [],
      obligations: [{
        id: "promise-a",
        kind: "promise",
        actorId: "actor-a",
        counterpartyId: "npc-a",
        terms: "Return the signet.",
        status: "open",
        deadlineAtMinutes: 40,
        consequenceApplied: false,
        createdAt: "2026-08-08T18:00:00.000Z",
        resolvedAt: null,
        provenance: { sourceCommandId: "promise-command", sourceVersion: 9, occurredAt: "2026-08-08T18:00:00.000Z" },
      }],
      rumors: [],
    };
    const events = [
      committedEvent(11, [{ path: "/lastRoll", before: null, after: 16 }]),
      committedEvent(12, [{ path: "/social/relationships/relation-a", before: null, after: {} }]),
      committedEvent(13, [{ path: "/adjudicationHistory/0", before: null, after: {} }]),
    ];
    const causality = buildCausalityContext({
      state,
      events,
      social,
      situation: null,
      knownFactRefs: ["fact-public"],
      scene: scene(),
    });
    expect(causality.noChangeTurns).toBe(1);
    expect(causality.receipts).toEqual([
      expect.objectContaining({ eventId: "event-12", kinds: ["relationship"], evidencePaths: ["/social"] }),
    ]);
    expect(causality.openThreads).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRef: "pressure-failed-lock", kind: "pressure" }),
      expect.objectContaining({ sourceRef: "promise-a", kind: "relationship" }),
      expect.objectContaining({ sourceRef: "quest-a", kind: "time" }),
    ]));
    expect(causality.lens.knownFactRefs).toEqual(["fact-public"]);
    expect(JSON.stringify(causality)).not.toContain("hidden-target");
    expect(JSON.stringify(causality)).not.toContain("secret-clock");
    const campaignContext = readToolData(state, "campaign_context") as { causality: unknown; resume: { causality: unknown } };
    expect(campaignContext.causality).toBeTruthy();
    expect(campaignContext.resume.causality).toEqual(campaignContext.causality);
  });

  it("keeps pacing references bounded to public, current, unsurfaced refs", () => {
    const authorization = authorizePacingRefs({
      pressureRefs: ["pressure-a", "pressure-hidden", "pressure-used"],
      clueRefs: ["clue-a"],
      consequenceRefs: ["consequence-a"],
      hiddenRefs: ["pressure-hidden"],
      surfacedRefs: ["pressure-used"],
      staleRefs: ["clue-stale"],
    });
    expect(authorization.allRefs).toEqual(["pressure-a", "clue-a", "consequence-a"]);
  });

  it("accepts only committed triggered random-event references", () => {
    expect(authorizedRandomEventRefs([
      {
        id: "random-1",
        trigger: "travel-day",
        triggerId: "travel-1",
        tableId: "table-1",
        tableVersion: "v1",
        contextHash: "hash",
        occurrenceRoll: 1,
        occurrenceThreshold: 1,
        triggered: true,
        selectedEntryId: "entry-1",
        reusedEntityIds: [],
        instantiatedEntityIds: [],
        createdFactIds: ["fact-1"],
        createdClockIds: [],
        createdSituationIds: [],
        createdEncounterIds: [],
        sourceEventId: "event-1",
        campaignVersion: 4,
      },
      {
        id: "random-quiet",
        trigger: "downtime",
        triggerId: "downtime-1",
        tableId: "table-1",
        tableVersion: "v1",
        contextHash: "hash",
        occurrenceRoll: 20,
        occurrenceThreshold: 1,
        triggered: false,
        reusedEntityIds: [],
        instantiatedEntityIds: [],
        createdFactIds: [],
        createdClockIds: [],
        createdSituationIds: [],
        createdEncounterIds: [],
        sourceEventId: "event-quiet",
        campaignVersion: 4,
      },
    ], ["event-1"])).toEqual(["random-1", "fact-1"]);
  });

  it("builds a compact recap from event and public fact references only", () => {
    const recap = buildSceneRecap({
      scene: scene(),
      campaignVersion: 14,
      committedEvents: [
        event(11, [{ path: "/social/relationships/relation-a", before: null, after: {} }]),
        event(12, [{ path: "/log/0", before: null, after: { text: "A full conversation transcript" } }]),
      ],
      publicFactRefs: ["fact-public"],
      actorSafeSocialRecordIds: ["relation-a"],
      unresolvedRefs: ["pressure-a"],
      now: "2026-08-08T18:01:00.000Z",
    });
    expect(recap.committedEventRefs).toEqual(["event-11", "event-12"]);
    expect(recap.publicFactRefs).toEqual(["fact-public"]);
    expect(recap.continuityRefs).toEqual(["fact-public", "relationship:relation-a"]);
    expect(JSON.stringify(recap)).not.toContain("private");
    expect(JSON.stringify(recap)).not.toContain("conversation transcript");
    expect(recap.headline).toContain("remains open");
    const filtered = buildSceneRecap({
      scene: scene(),
      campaignVersion: 14,
      committedEvents: [event(11, [{ path: "/social/relationships/relation-private", before: null, after: {} }])],
      publicFactRefs: ["fact-public"],
      now: "2026-08-08T18:01:00.000Z",
    });
    expect(filtered.continuityRefs).toEqual(["fact-public"]);
  });

  it("records a non-forcing reframe without selecting a plot ref or replacing the question", () => {
    const currentScene = scene();
    const orchestration = { ...emptyOrchestrationState(), activeScene: currentScene };
    const applied = applyOrchestrationDecision(
      orchestration,
      { sceneId: currentScene.sceneId, sceneRevision: currentScene.revision, action: "reframe" },
      authorizePacingRefs({}),
      3,
      11,
      [],
      [],
      "2026-08-08T18:02:00.000Z",
    );
    expect(applied.state.activeScene?.immediateQuestion).toBe(currentScene.immediateQuestion);
    expect(applied.state.activeScene?.surfacedRefs).toEqual([]);
    expect(applied.decision.selectedRef).toBeUndefined();
  });

  it("recomputes the same causal view after restart without model work", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-causality-restart-"));
    const database = join(directory, "engine.db");
    let store = new LanternEngineStore(database);
    try {
      const state = createInitialCampaign("account-restart", "actor-restart");
      const context: RequestContext = {
        requestId: randomUUID(),
        accountId: state.accountId,
        campaignId: state.id,
        actorId: state.actorId,
        capabilities: ["player", "dm"],
      };
      store.createCampaign(context, state);
      const clientCommandId = randomUUID();
      store.executeCommand({
        context,
        clientCommandId,
        expectedCampaignVersion: 0,
        command: { kind: "declare", goal: "I hold position." },
        tool: "declare",
        resolve: (current) => resolveEngineCommand(current, context, clientCommandId, { kind: "declare", goal: "I hold position." }, "declare"),
      });
      const snapshot = (source: LanternEngineStore) => {
        const current = source.getCampaign(context);
        const knowledge = actorKnowledgeProjection(context.actorId, current);
        return buildCausalityContext({
          state: projectStateForActor(context.actorId, current),
          events: source.listCampaignEvents(context).map((candidate) => projectEventForActor(context.actorId, current, candidate)),
          social: knowledge.social,
          situation: null,
          knownFactRefs: knowledge.facts.map((fact) => fact.id),
        });
      };
      const beforeRestart = snapshot(store);
      store.close();
      store = new LanternEngineStore(database);
      expect(snapshot(store)).toEqual(beforeRestart);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records orchestration without changing mechanics, supports replay, and rejects stale scene revisions", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-orchestration-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    try {
      const state = createInitialCampaign("account-orchestration", "actor-orchestration");
      const context: RequestContext = {
        requestId: randomUUID(),
        accountId: state.accountId,
        campaignId: state.id,
        actorId: state.actorId,
        capabilities: ["player", "dm"],
      };
      store.createCampaign(context, state);

      const enterId = randomUUID();
      const enter = store.executeCommand({
        context,
        clientCommandId: enterId,
        expectedCampaignVersion: 0,
        command: { kind: "production_room_enter" },
        tool: "production_room",
        resolve: (current) => resolveProductionRoomEnter(current, context, enterId),
      });
      expect(enter.accepted).toBe(true);
      for (let index = 0; index < 3; index += 1) {
        const current = store.getCampaign(context);
        const clientCommandId = randomUUID();
        const command = { kind: "declare" as const, goal: `I hold position ${index}.` };
        const result = store.executeCommand({
          context,
          clientCommandId,
          expectedCampaignVersion: current.version,
          command,
          tool: "declare",
          resolve: (candidate) => resolveEngineCommand(candidate, context, clientCommandId, command, "declare"),
        });
        expect(result.accepted).toBe(true);
      }

      const before = store.getCampaign(context);
      const sceneBefore = before.orchestration?.activeScene;
      if (!sceneBefore) throw new Error("The production-room opening did not establish a scene.");
      const decision: EngineOrchestrationCommand = {
        kind: "orchestration_decision",
        decision: {
          sceneId: sceneBefore.sceneId,
          sceneRevision: sceneBefore.revision,
          action: "clarify",
          clarificationQuestion: "What will you do next?",
          hookId: sceneBefore.hookRefs[0],
        },
      };
      const decisionId = randomUUID();
      const events = store.listCampaignEvents(context);
      const result = store.executeCommand({
        context,
        clientCommandId: decisionId,
        expectedCampaignVersion: before.version,
        command: decision,
        tool: "orchestration",
        resolve: (candidate) => resolveOrchestrationDecision(candidate, context, decisionId, decision, events),
      });
      expect(result.accepted).toBe(true);
      expect(result.state.character.hp).toBe(before.character.hp);
      expect(result.state.orchestration?.activeScene?.noChangeTurns).toBe(3);
      expect(result.state.orchestration?.activeScene?.immediateQuestion).toBe("What will you do next?");
      expect(result.state.orchestration?.activeScene?.revision).toBe(sceneBefore.revision + 1);
      expect(result.state.orchestration?.activeScene?.status).toBe("active");
      expect(result.state.orchestration?.activeScene?.discoveredFactRefs).toEqual([]);
      expect(result.state.orchestration?.hooks[0]?.status).toBe("active");
      expect(result.state.orchestration?.hooks[0]?.lastUsedSceneId).toBe(sceneBefore.sceneId);

      const replay = store.executeCommand({
        context,
        clientCommandId: decisionId,
        expectedCampaignVersion: before.version,
        command: decision,
        tool: "orchestration",
        resolve: (candidate) => resolveOrchestrationDecision(candidate, context, decisionId, decision, events),
      });
      expect(replay.replayed).toBe(true);
      expect(replay.state.version).toBe(result.state.version);

      const staleDecision: EngineOrchestrationCommand = {
        kind: "orchestration_decision",
        decision: {
          sceneId: sceneBefore.sceneId,
          sceneRevision: sceneBefore.revision,
          action: "clarify",
          clarificationQuestion: "What else matters here?",
        },
      };
      const staleId = randomUUID();
      const staleEvents = store.listCampaignEvents(context);
      const stale = store.executeCommand({
        context,
        clientCommandId: staleId,
        expectedCampaignVersion: result.state.version,
        command: staleDecision,
        tool: "orchestration",
        resolve: (candidate) => resolveOrchestrationDecision(candidate, context, staleId, staleDecision, staleEvents),
      });
      expect(stale.accepted).toBe(false);
      expect(stale.code).toBe("orchestration_rejected");
      expect(store.getCampaign(context).version).toBe(result.state.version);
      expect(store.getCampaign(context).orchestration?.activeScene?.immediateQuestion).toBe("What will you do next?");

      const transitionBase = store.getCampaign(context);
      const transitionScene = transitionBase.orchestration?.activeScene;
      if (!transitionScene) throw new Error("The clarified scene was not persisted.");
      const transition: EngineOrchestrationCommand = {
        kind: "orchestration_decision",
        decision: {
          sceneId: transitionScene.sceneId,
          sceneRevision: transitionScene.revision,
          action: "transition",
          transitionReason: "completed",
        },
      };
      const transitionId = randomUUID();
      const transitionEvents = store.listCampaignEvents(context);
      const transitionResult = store.executeCommand({
        context,
        clientCommandId: transitionId,
        expectedCampaignVersion: transitionBase.version,
        command: transition,
        tool: "orchestration",
        resolve: (candidate) => resolveOrchestrationDecision(candidate, context, transitionId, transition, transitionEvents),
      });
      expect(transitionResult.accepted).toBe(true);
      expect(transitionResult.state.orchestration?.activeScene?.status).toBe("resolved");
      expect(transitionResult.state.orchestration?.recaps).toHaveLength(1);
      const recap = transitionResult.state.orchestration?.recaps[0];
      expect(recap?.committedEventRefs.length).toBeGreaterThan(0);
      expect(JSON.stringify(recap)).not.toContain("productionRoom");

      const duplicateTransitionId = randomUUID();
      const duplicateTransitionEvents = store.listCampaignEvents(context);
      const duplicateTransition = store.executeCommand({
        context,
        clientCommandId: duplicateTransitionId,
        expectedCampaignVersion: transitionResult.state.version,
        command: transition,
        tool: "orchestration",
        resolve: (candidate) => resolveOrchestrationDecision(candidate, context, duplicateTransitionId, transition, duplicateTransitionEvents),
      });
      expect(duplicateTransition.accepted).toBe(false);
      expect(duplicateTransition.code).toBe("orchestration_rejected");
      expect(store.getCampaign(context).version).toBe(transitionResult.state.version);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
