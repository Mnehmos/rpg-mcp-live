import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameStore } from "./store.js";
import { REFERENCE_COMMAND_LEASE_MS, ReferenceEngineStore } from "./reference-engine-store.js";

function createTestStore(): ReferenceEngineStore {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-reference-engine-"));
  const gameStore = new GameStore(join(directory, "game.db"));
  return new ReferenceEngineStore(gameStore.getRawDb());
}

describe("ReferenceEngineStore", () => {
  it("defaults to the reference backend when no routing row exists", () => {
    const store = createTestStore();
    expect(store.resolveBackend("user-1", "campaign-1")).toBe("reference");
    expect(store.getRouting("user-1", "campaign-1")).toBeNull();
  });

  it("routes a campaign to the reference backend and resolves it back", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    expect(store.resolveBackend("user-1", "campaign-1")).toBe("reference");

    const routing = store.getRouting("user-1", "campaign-1");
    expect(routing).toMatchObject({
      backend: "reference",
      referenceWorldId: null,
      referencePartyId: null,
      referenceSessionId: null,
      referenceCharacterId: null,
    });
  });

  it("merge-updates only the supplied reference IDs, leaving others untouched", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    store.setReferenceIds("user-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });
    store.setReferenceIds("user-1", "campaign-1", { characterId: "char-1" });

    expect(store.getRouting("user-1", "campaign-1")).toMatchObject({
      referenceWorldId: "world-1",
      referencePartyId: "party-1",
      referenceCharacterId: "char-1",
      referenceSessionId: null,
    });
  });

  it("throws when setting reference IDs before a routing row exists", () => {
    const store = createTestStore();
    expect(() => store.setReferenceIds("user-1", "campaign-1", { worldId: "world-1" })).toThrow();
  });

  it("keeps routing isolated per user and per campaign", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    store.setBackend("user-1", "campaign-2", "reference");
    store.setBackend("user-2", "campaign-1", "reference");
    store.setReferenceIds("user-1", "campaign-1", { worldId: "world-user1-camp1" });
    store.setReferenceIds("user-2", "campaign-1", { worldId: "world-user2-camp1" });

    expect(store.resolveBackend("user-1", "campaign-1")).toBe("reference");
    expect(store.resolveBackend("user-1", "campaign-2")).toBe("reference");
    expect(store.getRouting("user-1", "campaign-1")?.referenceWorldId).toBe("world-user1-camp1");
    expect(store.getRouting("user-2", "campaign-1")?.referenceWorldId).toBe("world-user2-camp1");
  });

  it("removes a routing row on delete, reverting to the reference default", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    store.deleteRouting("user-1", "campaign-1");
    expect(store.resolveBackend("user-1", "campaign-1")).toBe("reference");
  });

  it("stores the campaign profile and starts version at 0", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    store.setCampaignProfile("user-1", "campaign-1", { name: "Test Campaign" });

    const routing = store.getRouting("user-1", "campaign-1");
    expect(routing?.version).toBe(0);
    expect(JSON.parse(routing?.campaignProfileJson ?? "null")).toEqual({ name: "Test Campaign" });
  });

  it("increments the version on each bump, isolated per campaign", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    store.setBackend("user-1", "campaign-2", "reference");

    expect(store.bumpVersion("user-1", "campaign-1")).toBe(1);
    expect(store.bumpVersion("user-1", "campaign-1")).toBe(2);
    expect(store.getRouting("user-1", "campaign-2")?.version).toBe(0);
  });

  it("persists a command receipt and replays its resolved result", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");

    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-1", 0, '{"playerText":"look"}'))
      .toEqual({ status: "started" });

    const result = { campaignVersion: 1, narration: { text: "A lantern burns." } };
    store.resolveReferenceCommand("user-1", "campaign-1", "command-1", result);

    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-1", 0, '{"playerText":"look"}'))
      .toEqual({ status: "resolved", result });
    expect(store.getReferenceCommand("user-1", "campaign-1", "command-1")).toMatchObject({
      expectedCampaignVersion: 0,
      status: "resolved",
      result,
      failure: null,
    });
  });

  it("keeps internal legacy narration markers out of player projections", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    const marker = "[PRIOR DM NARRATION — continuity only, not authoritative state. The accepted RPG MCP results above are the source of truth; this prose never proves possession, a quest, party membership, lighting, movement, combat, or another durable fact.]\n";
    store.appendLogMessages("user-1", "campaign-1", [{
      id: "legacy-narration",
      kind: "narration",
      text: `${marker}${marker}The cellar door opens.`,
      createdAt: "2026-01-01T00:00:00.000Z",
    }]);
    expect(store.getLogMessages("user-1", "campaign-1")[0]?.text).toBe("The cellar door opens.");

    store.beginReferenceCommand("user-1", "campaign-1", "command-legacy", 0, '{"playerText":"look"}');
    store.resolveReferenceCommand("user-1", "campaign-1", "command-legacy", {
      narration: { text: `${marker}The torch gutters.` },
    });
    expect(store.getReferenceCommand("user-1", "campaign-1", "command-legacy")?.result).toEqual({
      narration: { text: "The torch gutters." },
    });
  });

  it("keeps failed receipts retry-safe and rejects stale or reused command ids", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");
    store.setBackend("user-1", "campaign-2", "reference");

    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-1", 0, '{"playerText":"attack"}'))
      .toEqual({ status: "started" });
    const failure = {
      correlationId: "corr-1",
      commitStatus: "not_committed" as const,
      phase: "tool_loop",
      toolRounds: 0,
      toolCallNames: [],
      acceptedToolCalls: 0,
      message: "provider unavailable",
    };
    store.failReferenceCommand("user-1", "campaign-1", "command-1", failure);
    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-1", 0, '{"playerText":"attack"}'))
      .toEqual({ status: "failed", failure });
    expect(() => store.beginReferenceCommand("user-1", "campaign-2", "command-1", 0, '{"playerText":"attack"}'))
      .toThrow("cannot be reused");

    store.bumpVersion("user-1", "campaign-1");
    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-2", 0, '{"playerText":"look"}'))
      .toEqual({ status: "conflict", currentVersion: 1 });
  });

  it("recovers a stale processing receipt into an uncertain terminal state", () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-reference-engine-stale-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const db = gameStore.getRawDb();
    const store = new ReferenceEngineStore(db);
    store.setBackend("user-1", "campaign-1", "reference");

    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-stale", 0, '{"playerText":"look"}'))
      .toEqual({ status: "started" });
    db.prepare("UPDATE reference_engine_commands SET updated_at = ? WHERE user_id = ? AND client_command_id = ?")
      .run(new Date(Date.now() - REFERENCE_COMMAND_LEASE_MS - 1).toISOString(), "user-1", "command-stale");

    expect(store.getReferenceCommand("user-1", "campaign-1", "command-stale")).toMatchObject({
      status: "failed",
      failure: {
        commitStatus: "uncertain",
        phase: "recovery",
      },
    });
    store.resolveReferenceCommand("user-1", "campaign-1", "command-stale", { narration: "late worker result" });
    expect(store.getReferenceCommand("user-1", "campaign-1", "command-stale")).toMatchObject({
      status: "failed",
      failure: { commitStatus: "uncertain" },
      result: null,
    });
    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-stale", 0, '{"playerText":"look"}'))
      .toMatchObject({ status: "failed", failure: { commitStatus: "uncertain" } });
  });

  it("serializes different client commands that reserve the same campaign version", () => {
    const store = createTestStore();
    store.setBackend("user-1", "campaign-1", "reference");

    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-a", 0, '{"playerText":"look"}'))
      .toEqual({ status: "started" });
    expect(store.beginReferenceCommand("user-1", "campaign-1", "command-b", 0, '{"playerText":"listen"}'))
      .toEqual({ status: "processing" });
  });

  describe("dockets", () => {
    it("returns an empty string for an unwritten docket", () => {
      const store = createTestStore();
      expect(store.getDocket("user-1", "campaign-1", "player")).toBe("");
    });

    it("round-trips a docket's content", () => {
      const store = createTestStore();
      store.setDocket("user-1", "campaign-1", "player", "# Player\nbackstory: A wandering scholar.");
      expect(store.getDocket("user-1", "campaign-1", "player")).toBe("# Player\nbackstory: A wandering scholar.");
    });

    it("overwrites a docket's content on repeated writes", () => {
      const store = createTestStore();
      store.setDocket("user-1", "campaign-1", "journal", "Session 1.");
      store.setDocket("user-1", "campaign-1", "journal", "Session 1.\nSession 2.");
      expect(store.getDocket("user-1", "campaign-1", "journal")).toBe("Session 1.\nSession 2.");
    });

    it("keeps dockets isolated per user and per campaign", () => {
      const store = createTestStore();
      store.setDocket("user-1", "campaign-1", "player", "user1-camp1");
      store.setDocket("user-2", "campaign-1", "player", "user2-camp1");
      store.setDocket("user-1", "campaign-2", "player", "user1-camp2");

      expect(store.getDocket("user-1", "campaign-1", "player")).toBe("user1-camp1");
      expect(store.getDocket("user-2", "campaign-1", "player")).toBe("user2-camp1");
      expect(store.getDocket("user-1", "campaign-2", "player")).toBe("user1-camp2");
    });

    it("listDockets excludes secrets by default", () => {
      const store = createTestStore();
      store.setDocket("user-1", "campaign-1", "player", "player content");
      store.setDocket("user-1", "campaign-1", "secrets", "the villain is the king");

      const dockets = store.listDockets("user-1", "campaign-1");
      expect(dockets.player).toBe("player content");
      expect(dockets.secrets).toBeUndefined();
      expect(JSON.stringify(dockets)).not.toContain("villain");
    });

    it("listDockets can include secrets when explicitly requested (orchestrator-internal use only)", () => {
      const store = createTestStore();
      store.setDocket("user-1", "campaign-1", "secrets", "the villain is the king");
      const dockets = store.listDockets("user-1", "campaign-1", { excludeSecrets: false });
      expect(dockets.secrets).toBe("the villain is the king");
    });

    it("getDocket still returns secrets directly (for the orchestrator's own use)", () => {
      const store = createTestStore();
      store.setDocket("user-1", "campaign-1", "secrets", "the villain is the king");
      expect(store.getDocket("user-1", "campaign-1", "secrets")).toBe("the villain is the king");
    });
  });
});
