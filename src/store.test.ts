import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialSession } from "./game.js";
import { CampaignVersionConflictError, GameStore } from "./store.js";

function createTestStore(): GameStore {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-"));
  return new GameStore(join(directory, "game.db"));
}

describe("authoritative campaign commands", () => {
  it("replays the same result for a retried client command", () => {
    const store = createTestStore();
    const initial = store.getOrCreateSession("player-1", () => createInitialSession("player-1"));
    const input = {
      userId: "player-1",
      campaignId: initial.id,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: 0,
      action: "roll" as const,
      createSession: () => createInitialSession("player-1"),
    };

    const first = store.executeAction(input);
    const replay = store.executeAction(input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(replay.session).toEqual(first.session);
    expect(store.getOrCreateSession("player-1", () => createInitialSession("player-1")).version).toBe(1);
    store.close();
  });

  it("rejects a command prepared against a stale campaign version", () => {
    const store = createTestStore();
    const initial = store.getOrCreateSession("player-1", () => createInitialSession("player-1"));

    store.executeAction({
      userId: "player-1",
      campaignId: initial.id,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: 0,
      action: "enter",
      createSession: () => createInitialSession("player-1"),
    });

    expect(() =>
      store.executeAction({
        userId: "player-1",
        campaignId: initial.id,
        clientCommandId: randomUUID(),
        expectedCampaignVersion: 0,
        action: "listen",
        createSession: () => createInitialSession("player-1"),
      })
    ).toThrow(CampaignVersionConflictError);

    store.close();
  });

  it("persists and replays a free-form intent without re-rolling", () => {
    const store = createTestStore();
    const initial = store.getOrCreateSession("player-1", () => createInitialSession("player-1"));
    const intent = {
      kind: "ability_check" as const,
      ability: "wis" as const,
      skill: "perception",
      goal: "Study the lantern for a hidden mechanism.",
    };
    const input = {
      userId: "player-1",
      campaignId: initial.id,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: 0,
      playerText: "I study the lantern for a hidden mechanism.",
      intent,
      createSession: () => createInitialSession("player-1"),
    };

    const first = store.executeIntent(input);
    const replay = store.executeIntent(input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(replay.event.intent).toEqual(intent);
    expect(replay.event.check).toEqual(first.event.check);
    expect(store.getStoredCommand("player-1", input.clientCommandId)?.result?.event).toEqual(first.event);
    store.close();
  });

  it("keeps successful DM narration in the campaign log", () => {
    const store = createTestStore();
    const initial = store.getOrCreateSession("player-1", () => createInitialSession("player-1"));
    const commandId = randomUUID();
    const result = store.executeAction({
      userId: "player-1",
      campaignId: initial.id,
      clientCommandId: commandId,
      expectedCampaignVersion: 0,
      action: "observe",
      createSession: () => createInitialSession("player-1"),
    });
    const narrated = store.updateCommandNarration("player-1", commandId, {
      text: "The lantern watches you back.",
      proposedFacts: [],
      suggestedActions: [],
    });

    expect(narrated?.narrationSource).toBe("llm");
    expect(store.getOrCreateSession("player-1", () => createInitialSession("player-1")).log.at(-1)?.text).toBe(
      "The lantern watches you back."
    );
    expect(result.session.version).toBe(1);
    store.close();
  });
});

describe("quickstart request idempotency", () => {
  const STALE_MS = 120_000;

  it("lets only the first concurrent replay claim a request", () => {
    const store = createTestStore();
    const requestId = randomUUID();

    expect(store.claimQuickstartRequest("player-1", requestId, STALE_MS, 1_000).state).toBe("claimed");
    expect(store.claimQuickstartRequest("player-1", requestId, STALE_MS, 2_000).state).toBe("in_progress");
    expect(store.claimQuickstartRequest("player-2", requestId, STALE_MS, 2_000).state).toBe("claimed");
    store.close();
  });

  it("returns the finished campaign for a replay after completion", () => {
    const store = createTestStore();
    const requestId = randomUUID();
    store.claimQuickstartRequest("player-1", requestId, STALE_MS, 1_000);
    store.attachQuickstartCampaign("player-1", requestId, "campaign-a", "salt-road");
    store.completeQuickstartRequest("player-1", requestId);

    expect(store.claimQuickstartRequest("player-1", requestId, STALE_MS, 2_000)).toEqual({
      state: "done",
      campaignId: "campaign-a",
      presetId: "salt-road",
    });
    store.close();
  });

  it("resumes a released or stale claim with the campaign it already created", () => {
    const store = createTestStore();
    const released = randomUUID();
    store.claimQuickstartRequest("player-1", released, STALE_MS, 1_000);
    store.attachQuickstartCampaign("player-1", released, "campaign-a", "ember-watch");
    store.releaseQuickstartRequest("player-1", released);
    expect(store.claimQuickstartRequest("player-1", released, STALE_MS, 2_000)).toEqual({
      state: "claimed",
      campaignId: "campaign-a",
      presetId: "ember-watch",
    });

    const stale = randomUUID();
    store.claimQuickstartRequest("player-1", stale, STALE_MS, 1_000);
    store.attachQuickstartCampaign("player-1", stale, "campaign-b", "salt-road");
    expect(store.claimQuickstartRequest("player-1", stale, STALE_MS, 1_000 + STALE_MS).campaignId).toBe("campaign-b");
    store.close();
  });

  it("does not reopen a completed request when a late failure releases it", () => {
    const store = createTestStore();
    const requestId = randomUUID();
    store.claimQuickstartRequest("player-1", requestId, STALE_MS, 1_000);
    store.attachQuickstartCampaign("player-1", requestId, "campaign-a", "salt-road");
    store.completeQuickstartRequest("player-1", requestId);
    store.releaseQuickstartRequest("player-1", requestId);

    expect(store.claimQuickstartRequest("player-1", requestId, STALE_MS, 2_000).state).toBe("done");
    store.close();
  });
});
