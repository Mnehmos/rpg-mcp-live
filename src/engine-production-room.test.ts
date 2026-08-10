import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInitialCampaign, projectResolutionForActor, projectStateForActor, resolveProductionRoomEnter, resolveProductionRoomNarrationRelease } from "./engine-domain.js";
import type { RequestContext } from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";
import {
  ProductionRoomPolicyError,
  ProductionRoomStaleError,
  ProductionRoomValidationError,
  buildRuinedGatehouseBlueprint,
  buildSafeNarrationFallback,
  compileNarrationDraft,
  commitSceneSnapshot,
  completeDmRun,
  createDmRun,
  createProductionRoomToolRegistry,
  emptyProductionRoomState,
  hashBlueprint,
  initialPlayback,
  openSceneInput,
  narrationDraftFromEnvelope,
  parseProductionRoomState,
  playNextBeat,
  promoteSceneDetail,
  projectSceneForActor,
  recordProductionRoomLiveRelease,
  releaseNarrationSequence,
  serializeProductionRoomState,
  validateDetailPromotion,
  validateNarrationSequence,
  type NarrationSequenceIR,
} from "./engine-production-room.js";

const runId = "run-gatehouse-1";
const baseTime = "2026-08-08T18:00:00.000Z";

function snapshot() {
  const blueprint = buildRuinedGatehouseBlueprint(4, runId);
  return commitSceneSnapshot({
    blueprint,
    sourceRunId: runId,
    currentCampaignVersion: 4,
    committedEventIds: ["event-gatehouse-enter"],
    now: baseTime,
  });
}

function sequence(): NarrationSequenceIR {
  const scene = snapshot();
  const projection = projectSceneForActor(scene, "actor-a");
  return {
    id: "narration-gatehouse-1",
    sceneId: projection.sceneId,
    sceneRevision: projection.revision,
    campaignVersion: projection.campaignVersion,
    sourceRunId: runId,
    narratorRunId: "run-narrator-1",
    committedEventIds: ["event-gatehouse-enter"],
    beats: [
      {
        id: "beat-establish",
        kind: "establishing",
        text: "The ruined gatehouse leans into the road, its wounded guard watching the locked chest.",
        entityRefs: ["gatehouse-wounded-guard", "gatehouse-locked-chest"],
        publicFactRefs: ["gatehouse-guard-partial-truth"],
        committedEventRefs: ["event-gatehouse-enter"],
        revealRequests: [],
        interruptible: true,
      },
      {
        id: "beat-question",
        kind: "question",
        text: "The north road and cellar stairs remain open to your choice.",
        entityRefs: ["gatehouse-exit-north", "gatehouse-exit-cellar"],
        publicFactRefs: [],
        committedEventRefs: [],
        revealRequests: [],
        interruptible: true,
      },
    ],
    status: "candidate",
    createdAt: baseTime,
    releasedAt: null,
  };
}

describe("DM production room boundary", () => {
  it("registers read/propose model tools but rejects model-facing campaign resolution", () => {
    const registry = createProductionRoomToolRegistry();
    expect(registry.get("scene_propose")?.mutationScope).toBe("run_draft");
    expect(registry.get("engine_commit")?.modelFacing).toBe(false);
    expect(() => createProductionRoomToolRegistry([{
      name: "bad-model-commit",
      phase: "private_planning",
      visibility: "private",
      authority: "resolve",
      mutationScope: "campaign_transaction",
      modelFacing: true,
    }])).toThrow(ProductionRoomPolicyError);
  });

  it("commits the gatehouse snapshot before opening player input", () => {
    const scene = snapshot();
    expect(scene.inputOpenedAt).toBeNull();
    expect(scene.committedAt).toBe(baseTime);
    const opened = openSceneInput(scene, "2026-08-08T18:00:01.000Z");
    expect(opened.inputOpenedAt).toBe("2026-08-08T18:00:01.000Z");
    expect(opened.entities.map((entity) => entity.id)).toEqual(expect.arrayContaining([
      "gatehouse-wounded-guard",
      "gatehouse-locked-chest",
      "gatehouse-broken-lever",
      "gatehouse-exit-north",
      "gatehouse-exit-cellar",
    ]));
  });

  it("keeps the clue and hidden motive out of the actor projection", () => {
    const scene = snapshot();
    const projection = projectSceneForActor(scene, "actor-a");
    expect(projection.entities.map((entity) => entity.id)).not.toContain("gatehouse-hidden-clue");
    expect(projection.visibleFactRefs).toEqual(expect.arrayContaining(["gatehouse-guard-partial-truth"]));
    expect(projection.visibleFactRefs).not.toContain("gatehouse-chest-clue-fact");
    expect(JSON.stringify(projection)).not.toContain("gatehouse-guard-hidden-motive");
  });

  it("rejects stale blueprints and preserves idempotent same-blueprint commit", () => {
    const blueprint = buildRuinedGatehouseBlueprint(4, runId);
    const committed = commitSceneSnapshot({ blueprint, sourceRunId: runId, currentCampaignVersion: 4, now: baseTime });
    expect(() => commitSceneSnapshot({ blueprint, sourceRunId: runId, currentCampaignVersion: 5, existingSnapshot: committed })).toThrow(ProductionRoomStaleError);
    expect(commitSceneSnapshot({ blueprint, sourceRunId: runId, currentCampaignVersion: 4, existingSnapshot: committed })).toBe(committed);
    expect(hashBlueprint(blueprint)).toHaveLength(64);
  });

  it("releases only validated narration and replays without another model call", () => {
    const scene = snapshot();
    const projection = projectSceneForActor(scene, "actor-a");
    const released = releaseNarrationSequence(sequence(), projection, "2026-08-08T18:00:02.000Z");
    expect(released.status).toBe("released");
    expect(released.releasedAt).toBe("2026-08-08T18:00:02.000Z");
    let playback = initialPlayback(released);
    const first = playNextBeat(released, playback);
    expect(first.beat?.id).toBe("beat-establish");
    playback = first.playback;
    const second = playNextBeat(released, playback);
    expect(second.beat?.id).toBe("beat-question");
    expect(playNextBeat(released, second.playback).beat).toBeNull();
    const fallback = buildSafeNarrationFallback(projection, runId, "fallback-narrator", "2026-08-08T18:00:04.000Z");
    expect(fallback.status).toBe("released");
    expect(fallback.beats[0]?.publicFactRefs).toEqual([]);
  });

  it("compiles only actor-safe narrator refs and rejects uncommitted public prose", () => {
    const projection = projectSceneForActor(snapshot(), "actor-a");
    const compiled = compileNarrationDraft({
      sourceRunId: runId,
      narratorRunId: "narrator-safe-1",
      projection,
      now: baseTime,
      draft: {
        beats: [{
          kind: "consequence",
          text: "The wounded guard points from the locked chest toward the north road.",
          entityRefs: ["gatehouse-wounded-guard", "gatehouse-locked-chest", "gatehouse-exit-north"],
          publicFactRefs: ["gatehouse-guard-partial-truth"],
          committedEventRefs: ["event-gatehouse-enter"],
          interruptible: true,
        }],
        suggestedActions: [],
      },
    });
    expect(compiled.sequence.status).toBe("released");
    expect(compiled.narration.text).toContain("wounded guard");
    expect(() => compileNarrationDraft({
      sourceRunId: runId,
      narratorRunId: "narrator-unsafe-1",
      projection,
      draft: {
        beats: [{
          kind: "consequence",
          text: "A private tool_call reveals the hidden ambush.",
          entityRefs: ["gatehouse-hidden-clue"],
          publicFactRefs: ["gatehouse-chest-clue-fact"],
          committedEventRefs: ["event-not-committed"],
          interruptible: true,
        }],
        suggestedActions: [],
      },
    })).toThrow(ProductionRoomValidationError);
    expect(() => narrationDraftFromEnvelope({
      text: "A new enemy appears.",
      proposedFacts: [{ kind: "introduce_npc", npcId: "retroactive-enemy", name: "Enemy", disposition: "hostile" }],
      suggestedActions: [],
    }, projection)).toThrow(ProductionRoomValidationError);
  });

  it("persists one private planner/narrator pair and idempotent public replay metadata", () => {
    const projection = projectSceneForActor(snapshot(), "actor-a");
    const planner = completeDmRun(createDmRun({
      id: "planner-live-1",
      kind: "intent_interpretation",
      accountId: "account-a",
      campaignId: "campaign-a",
      actorId: "actor-a",
      baseCampaignVersion: 4,
      baseSceneRevision: 1,
      usage: { provider: "openrouter", model: "test", inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, latencyMs: 12 },
      createdAt: baseTime,
    }), "private planner output", "committed", baseTime);
    const narrator = completeDmRun(createDmRun({
      id: "narrator-live-1",
      kind: "narration",
      accountId: "account-a",
      campaignId: "campaign-a",
      actorId: "actor-a",
      baseCampaignVersion: 4,
      baseSceneRevision: 1,
      usage: { provider: "openrouter", model: "test", inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0, latencyMs: 7 },
      createdAt: baseTime,
    }), "public narrator draft", "released", baseTime);
    const compiled = compileNarrationDraft({
      sourceRunId: planner.id,
      narratorRunId: narrator.id,
      projection,
      now: baseTime,
      draft: {
        beats: [{ kind: "consequence", text: "The committed scene changes.", entityRefs: [], publicFactRefs: [], committedEventRefs: ["event-gatehouse-enter"], interruptible: true }],
        suggestedActions: [],
      },
    });
    const once = recordProductionRoomLiveRelease(emptyProductionRoomState(), {
      plannerRun: planner,
      narratorRun: narrator,
      sequence: compiled.sequence,
    }, "command-live-1");
    const replay = recordProductionRoomLiveRelease(once, {
      plannerRun: planner,
      narratorRun: narrator,
      sequence: compiled.sequence,
    }, "command-live-1");
    expect(replay.runs).toHaveLength(2);
    expect(replay.releasedSequences).toHaveLength(1);
    expect(replay.playback).toHaveLength(1);
    expect(replay.processedOperationIds).toEqual(["command-live-1"]);
  });

  it("rejects hidden, absent, stale, and uncommitted narration references", () => {
    const scene = snapshot();
    const projection = projectSceneForActor(scene, "actor-a");
    const candidate = sequence();
    candidate.beats[0]!.entityRefs.push("gatehouse-hidden-clue");
    candidate.beats[0]!.publicFactRefs.push("gatehouse-chest-clue-fact");
    candidate.beats[0]!.committedEventRefs.push("event-not-committed");
    const result = validateNarrationSequence(candidate, projection);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("absent entity");
    expect(result.errors.join(" ")).toContain("unreleased fact");
    expect(result.errors.join(" ")).toContain("uncommitted event");
    expect(() => releaseNarrationSequence(candidate, projection)).toThrow(ProductionRoomValidationError);
  });

  it("allows a plausible flavor promotion but rejects a retroactive threat", () => {
    const scene = snapshot();
    const plausible = {
      id: "gatehouse-scratched-rune",
      label: "A scratched rune on the lintel",
      source: "player_observation",
      targetKind: "fact",
      retroactiveThreat: false,
      contradictsCommittedState: false,
      grantsUnboundedPower: false,
    } as const;
    expect(validateDetailPromotion(plausible, scene).valid).toBe(true);
    const promoted = promoteSceneDetail(scene, plausible, "2026-08-08T18:00:03.000Z");
    expect(promoted.revision).toBe(scene.revision + 1);
    expect(promoted.entities.map((entity) => entity.id)).toContain("gatehouse-scratched-rune");
    const rejected = validateDetailPromotion({
      id: "gatehouse-hidden-ambush",
      label: "A previously invisible ambush",
      source: "ephemeral_flavor",
      targetKind: "hazard",
      retroactiveThreat: true,
      contradictsCommittedState: false,
      grantsUnboundedPower: false,
    }, scene);
    expect(rejected.valid).toBe(false);
    expect(() => promoteSceneDetail(scene, {
      id: "gatehouse-hidden-ambush",
      label: "A previously invisible ambush",
      source: "ephemeral_flavor",
      targetKind: "hazard",
      retroactiveThreat: true,
      contradictsCommittedState: false,
      grantsUnboundedPower: false,
    })).toThrow(ProductionRoomValidationError);
  });

  it("round-trips released state for restart and keeps private traces absent", () => {
    const scene = snapshot();
    const projection = projectSceneForActor(scene, "actor-a");
    const released = releaseNarrationSequence(sequence(), projection, "2026-08-08T18:00:02.000Z");
    const state = emptyProductionRoomState();
    state.activeScene = scene;
    state.releasedSequences = [released];
    state.playback = [initialPlayback(released)];
    const restored = parseProductionRoomState(JSON.parse(serializeProductionRoomState(state)));
    expect(restored.activeScene?.sceneId).toBe("ruined-gatehouse");
    expect(restored.releasedSequences[0]?.status).toBe("released");
    expect(JSON.stringify(restored)).not.toContain("chain-of-thought");
  });

  it("integrates the committed snapshot with campaign persistence without projecting private room state", () => {
    const state = createInitialCampaign("account-room", "actor-room");
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const result = resolveProductionRoomEnter(state, context, randomUUID());
    expect(result.accepted).toBe(true);
    expect(result.event?.tool).toBe("production_room");
    expect(result.event?.command).toEqual({ kind: "production_room_enter" });
    expect(result.state.version).toBe(1);
    expect(result.state.productionRoom?.activeScene?.inputOpenedAt).not.toBeNull();
    expect(projectStateForActor(context.actorId, result.state).productionRoom).toBeUndefined();
    const projected = projectResolutionForActor(result, context.actorId);
    expect(JSON.stringify(projected.event)).not.toContain("gatehouse-hidden-clue");
    expect(JSON.stringify(projected.state)).not.toContain("gatehouse-guard-hidden-motive");
    expect(JSON.stringify(projected.data)).toContain("gatehouse-wounded-guard");
  });

  it("records a separate narrator run and releases a sequence against the committed scene", () => {
    const state = createInitialCampaign("account-narration", "actor-narration");
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const entered = resolveProductionRoomEnter(state, context, randomUUID());
    const scene = entered.state.productionRoom!.activeScene!;
    const projection = projectSceneForActor(scene, context.actorId);
    const candidate: NarrationSequenceIR = {
      id: "narration-integrated-1",
      sceneId: scene.sceneId,
      sceneRevision: scene.revision,
      campaignVersion: scene.campaignVersion,
      sourceRunId: scene.sourceRunId,
      narratorRunId: "narrator-integrated-1",
      committedEventIds: scene.committedEventIds,
      beats: [{
        id: "integrated-beat",
        kind: "establishing",
        text: "The guard keeps one hand pressed to the wound while the chest remains locked.",
        entityRefs: ["gatehouse-wounded-guard", "gatehouse-locked-chest"],
        publicFactRefs: ["gatehouse-guard-partial-truth"],
        committedEventRefs: scene.committedEventIds,
        revealRequests: [],
        interruptible: true,
      }],
      status: "candidate",
      createdAt: baseTime,
      releasedAt: null,
    };
    const released = resolveProductionRoomNarrationRelease(entered.state, context, randomUUID(), candidate);
    expect(released.accepted).toBe(true);
    expect(released.state.productionRoom?.releasedSequences[0]?.status).toBe("released");
    expect(released.state.productionRoom?.runs.map((run) => run.kind)).toEqual(["scene_build", "narration"]);
    expect(JSON.stringify(released.data)).not.toContain("narrator-integrated-1");
    expect(projection.visibleFactRefs).not.toContain("gatehouse-chest-clue-fact");
  });

  it("preserves the committed room through the SQLite restart boundary", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-production-room-"));
    const databasePath = join(directory, "engine.db");
    const state = createInitialCampaign("account-restart", "actor-restart");
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    };
    const firstStore = new LanternEngineStore(databasePath);
    firstStore.createCampaign(context, state);
    const commandId = randomUUID();
    const firstResult = firstStore.executeCommand({
      context,
      clientCommandId: commandId,
      expectedCampaignVersion: 0,
      command: { kind: "production_room_enter" },
      tool: "production_room",
      resolve: (current) => resolveProductionRoomEnter(current, context, commandId),
    });
    const replay = firstStore.executeCommand({
      context,
      clientCommandId: commandId,
      expectedCampaignVersion: 0,
      command: { kind: "production_room_enter" },
      tool: "production_room",
      resolve: (current) => resolveProductionRoomEnter(current, context, commandId),
    });
    expect(firstResult.state.version).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(replay.state.version).toBe(1);
    firstStore.close();
    const restarted = new LanternEngineStore(databasePath);
    const restored = restarted.getCampaign(context);
    expect(restored.productionRoom?.activeScene?.sceneId).toBe("ruined-gatehouse");
    expect(projectStateForActor(context.actorId, restored).productionRoom).toBeUndefined();
    restarted.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
