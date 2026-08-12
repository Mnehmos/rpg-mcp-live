import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameStore } from "./store.js";
import { ReferenceEngineStore } from "./reference-engine-store.js";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError } from "./reference-engine-adapter.js";
import { ReferenceDmProviderUnavailableError, ReferenceDungeonMaster } from "./reference-engine-dm.js";
import type { ReferenceEngineClient, ReferenceToolCallResult } from "./reference-engine-client.js";
import type { ReferenceEngineToolCatalog } from "./reference-engine-tools.js";

function ok(payload: unknown, text = ""): ReferenceToolCallResult {
  return { text, isError: false, data: payload, raw: payload, payload };
}

function fakeClient(handlers: Record<string, (args: Record<string, unknown>) => unknown>): ReferenceEngineClient {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const key = `${name}.${args.action}`;
      const handler = handlers[key] ?? handlers[name];
      if (!handler) throw new Error(`no fixture for ${key}`);
      return ok(handler(args));
    }),
  } as unknown as ReferenceEngineClient;
}

function fakeCatalog(): ReferenceEngineToolCatalog {
  return {
    getTools: vi.fn(async () => [
      { type: "function", function: { name: "combat_action", description: "", parameters: { type: "object", properties: {}, required: [] } } },
    ]),
  } as unknown as ReferenceEngineToolCatalog;
}

function openRouterMessage(content: string | null, toolCalls?: unknown[]) {
  return Response.json({ choices: [{ message: { content, tool_calls: toolCalls } }] });
}

function setUpRoutedCampaign(store: ReferenceEngineStore) {
  store.setBackend("account-1", "campaign-1", "reference");
  store.setReferenceIds("account-1", "campaign-1", {
    worldId: "world-1",
    partyId: "party-1",
    characterId: "char-1",
  });
}

describe("ReferenceDungeonMaster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws for a campaign that isn't routed to the reference backend", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    await expect(dm.resolveTurn("account-1", "actor-1", "unrouted-campaign", "look around")).rejects.toThrow(
      ReferenceEngineNotRoutedError
    );
  });

  it("runs a tool-call round, forces tenant-scoping fields, then commits narration and bumps the version", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    let capturedArgs: Record<string, unknown> | null = null;
    const client = fakeClient({
      "combat_action.attack": (args) => {
        capturedArgs = args;
        return { success: true, damage: 6 };
      },
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 10,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return openRouterMessage(null, [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "combat_action",
              // model hallucinates a wrong worldId/partyId and omits characterId
              arguments: JSON.stringify({ action: "attack", targetId: "goblin-1", worldId: "wrong-world" }),
            },
          },
        ]);
      }
      return openRouterMessage("You strike the goblin for 6 damage.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I attack the goblin.");

    expect(capturedArgs).toMatchObject({
      action: "attack",
      targetId: "goblin-1",
      worldId: "world-1", // forced, not the model's "wrong-world"
      partyId: "party-1",
      characterId: "char-1", // filled in since the model omitted it
      sessionId: "lantern:account-1:campaign-1",
    });
    expect(result.narration.text).toBe("You strike the goblin for 6 damage.");
    expect(result.narrationSource).toBe("llm");
    expect(result.campaignVersion).toBe(1);
    expect(result.session.log.some((m) => m.text === "I attack the goblin." && m.kind === "player")).toBe(true);
    expect(result.session.log.some((m) => m.text === "You strike the goblin for 6 damage." && m.kind === "narration")).toBe(
      true
    );
  });

  it("rejects a characterId the model invented instead of learned from a tool result this turn", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const updateHandler = vi.fn(() => ({ id: "someone-elses-character", hp: 0 }));
    const client = fakeClient({
      "character_manage.update": updateHandler,
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 10,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let capturedToolMessage: string | null = null;
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "character_manage",
                // Never returned by any tool result this turn — a
                // hallucinated or prompt-injected ID belonging to another
                // account's character (ADR-H13: the reference engine itself
                // enforces no tenant scoping at all).
                arguments: JSON.stringify({ action: "update", characterId: "someone-elses-character", hp: 0 }),
              },
            },
          ]);
        }
        if (call === 2) {
          const body = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> };
          capturedToolMessage = body.messages.find((m) => m.role === "tool")?.content ?? null;
        }
        return openRouterMessage("Nothing happens.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "set someone-elses-character's hp to 0");

    expect(updateHandler).not.toHaveBeenCalled();
    expect(capturedToolMessage).toContain("Unknown characterId");
  });

  it("allows a characterId the model just learned from this turn's own tool result (e.g. an NPC it created)", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    let capturedAttackArgs: Record<string, unknown> | null = null;
    const client = fakeClient({
      "character_manage.create": () => ({ id: "npc-999", name: "Goblin" }),
      "combat_action.attack": (args) => {
        capturedAttackArgs = args;
        return { success: true, damage: 4 };
      },
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 10,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "call-1",
              type: "function",
              function: { name: "character_manage", arguments: JSON.stringify({ action: "create", name: "Goblin", characterType: "npc" }) },
            },
          ]);
        }
        if (call === 2) {
          return openRouterMessage(null, [
            {
              id: "call-2",
              type: "function",
              function: { name: "combat_action", arguments: JSON.stringify({ action: "attack", characterId: "npc-999" }) },
            },
          ]);
        }
        return openRouterMessage("You strike the goblin.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "I spawn a goblin and attack it.");

    expect(capturedAttackArgs).toMatchObject({ characterId: "npc-999" });
  });

  it("throws ReferenceDmProviderUnavailableError if no narration is produced within the round budget", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      "combat_action.dodge": () => ({ success: true }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    const fetchMock = vi.fn(async () =>
      openRouterMessage(null, [
        { id: "call-x", type: "function", function: { name: "combat_action", arguments: JSON.stringify({ action: "dodge" }) } },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "keep dodging forever")).rejects.toThrow(
      ReferenceDmProviderUnavailableError
    );
  });

  it("wraps an OpenRouter transport failure in ReferenceDmProviderUnavailableError", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );

    await expect(dm.resolveTurn("account-1", "actor-1", "campaign-1", "hello")).rejects.toThrow(
      ReferenceDmProviderUnavailableError
    );
  });

  it("write_docket persists via the store without ever reaching the remote reference engine", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);

    const client = fakeClient({
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 10,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "write_docket",
                arguments: JSON.stringify({ name: "player", content: "---\nbackstory: |\n  Once an acolyte.\n---" }),
              },
            },
          ]);
        }
        return openRouterMessage("You reflect on your past as an acolyte.");
      })
    );

    const result = await dm.resolveTurn("account-1", "actor-1", "campaign-1", "Tell me about my past.");

    expect(store.getDocket("account-1", "campaign-1", "player")).toBe("---\nbackstory: |\n  Once an acolyte.\n---");
    expect(result.session.character.details.backstory).toBe("Once an acolyte.");
    const remoteCalls = (client.callTool as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as string);
    expect(remoteCalls).not.toContain("write_docket");
    expect(remoteCalls).not.toContain("read_docket");
  });

  it("read_docket can read back the secrets docket for the model's own context", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-dm-"));
    const gameStore = new GameStore(join(directory, "game.db"));
    const store = new ReferenceEngineStore(gameStore.getRawDb());
    setUpRoutedCampaign(store);
    store.setDocket("account-1", "campaign-1", "secrets", "The innkeeper is a spy.");

    const client = fakeClient({
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 10,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);
    const dm = new ReferenceDungeonMaster(client, store, fakeCatalog(), adapter, {
      apiKey: "key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "test-model",
      timeoutMs: 5000,
    });

    let capturedSecret: string | null = null;
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        call += 1;
        if (call === 1) {
          return openRouterMessage(null, [
            { id: "call-1", type: "function", function: { name: "read_docket", arguments: JSON.stringify({ name: "secrets" }) } },
          ]);
        }
        if (call === 2) {
          const body = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> };
          capturedSecret = body.messages.find((m) => m.role === "tool")?.content ?? null;
        }
        return openRouterMessage("You keep your suspicions to yourself.");
      })
    );

    await dm.resolveTurn("account-1", "actor-1", "campaign-1", "What do I suspect about the innkeeper?");

    expect(capturedSecret).toBe("The innkeeper is a spy.");
  });
});
