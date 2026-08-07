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
