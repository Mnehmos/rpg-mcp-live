import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  activateScene,
  authorizePacingRefs,
  authorizedRandomEventRefs,
  buildSceneRecap,
  deriveNoChangeTurns,
  sceneStateFromProjection,
  type SceneState,
} from "./engine-orchestration.js";
import {
  createInitialCampaign,
  resolveEngineCommand,
  resolveOrchestrationDecision,
  resolveProductionRoomEnter,
} from "./engine-domain.js";
import type { EngineEvent, EngineOrchestrationCommand, RequestContext } from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";

function event(version: number, stateChanges: EngineEvent["stateChanges"], tool: EngineEvent["tool"] = "declare"): Pick<EngineEvent, "id" | "version" | "outcome" | "stateChanges" | "tool"> {
  return { id: `event-${version}`, version, outcome: "declared", stateChanges, tool };
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
      committedEvents: [event(11, []), event(12, [])],
      publicFactRefs: ["fact-public"],
      unresolvedRefs: ["pressure-a"],
      now: "2026-08-08T18:01:00.000Z",
    });
    expect(recap.committedEventRefs).toEqual(["event-11", "event-12"]);
    expect(recap.publicFactRefs).toEqual(["fact-public"]);
    expect(JSON.stringify(recap)).not.toContain("private");
    expect(recap.headline).toContain("remains open");
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
