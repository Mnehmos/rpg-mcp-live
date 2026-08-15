import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GameStore } from "./store.js";
import { ReferenceEngineStore } from "./reference-engine-store.js";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError, ReferenceEngineUnsupportedError } from "./reference-engine-adapter.js";
import type { ReferenceEngineClient, ReferenceToolCallResult } from "./reference-engine-client.js";
import type { EngineToolCallRequest } from "./engine-contracts.js";
import { open5eSpellOptions } from "./open5e-rules.js";

function createStore(): ReferenceEngineStore {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-adapter-"));
  const gameStore = new GameStore(join(directory, "game.db"));
  return new ReferenceEngineStore(gameStore.getRawDb());
}

function ok(payload: unknown, text = ""): ReferenceToolCallResult {
  return { text, isError: false, data: payload, raw: payload, payload };
}

/** Routes calls by tool name + action to a fixture map, mirroring what was observed live. */
function fakeClient(handlers: Record<string, (args: Record<string, unknown>) => unknown>): ReferenceEngineClient {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const key = `${name}.${args.action}`;
      const handler = handlers[key] ?? handlers[name];
      if (!handler) throw new Error(`no fixture for ${key}`);
      return ok(handler(args));
    }),
    deleteCampaignData: vi.fn(async () => ({ deleted: true })),
  } as unknown as ReferenceEngineClient;
}

function toolCall(toolName: string, args: Record<string, unknown>): EngineToolCallRequest {
  return {
    clientCommandId: "00000000-0000-0000-0000-000000000000",
    expectedCampaignVersion: 0,
    toolName: toolName as EngineToolCallRequest["toolName"],
    arguments: args,
  };
}

describe("ReferenceEngineAdapter", () => {
  it("creates a campaign by initializing a new world+party and never falls back to 'pick first'", async () => {
    const store = createStore();
    const client = fakeClient({
      "session_manage.initialize": (args) => {
        expect(args.createNew).toBe(true);
        return { success: true, worldId: "world-1", partyId: "party-1" };
      },
      "narrative_manage.search": () => ({ notes: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.createCampaign("account-1", "actor-1");

    expect(campaign.phase).toBe("character_creation");
    expect(campaign.characterCreated).toBe(false);
    const routing = store.getRouting("account-1", campaign.id);
    expect(routing).toMatchObject({ backend: "reference", referenceWorldId: "world-1", referencePartyId: "party-1" });
  });

  it("throws for a campaign not routed to the reference backend", async () => {
    const store = createStore();
    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);

    await expect(adapter.getCampaign("account-1", "actor-1", "unknown-campaign")).rejects.toThrow(
      ReferenceEngineNotRoutedError
    );
  });

  it("creates a character, joins it to the party, and overlays real stats into the session view", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setCampaignProfile("account-1", "campaign-1", { name: "Test", premise: "p", setting: "s", tone: "t" });
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });

    let addMemberCalled = false;
    const client = fakeClient({
      "character_manage.create": (args) => {
        expect(args.race).toBe("human");
        expect(args.class).toBe("fighter");
        return {
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
          currency: { gold: 10, silver: 0, copper: 0 },
        };
      },
      "party_manage.add_member": (args) => {
        addMemberCalled = true;
        expect(args.partyId).toBe("party-1");
        expect(args.characterId).toBe("char-1");
        return { success: true };
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
        currency: { gold: 10, silver: 0, copper: 0 },
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const result = await adapter.executeToolCall(
      "account-1",
      "actor-1",
      "campaign-1",
      toolCall("character_create", { name: "Hero", species: "human", className: "fighter" })
    );

    expect(result.accepted).toBe(true);
    expect(addMemberCalled).toBe(true);
    expect(result.campaignVersion).toBe(1);
    const character = (result.data as {
      character: {
        name: string;
        abilities: unknown;
        abilityModifiers: Record<string, number>;
        gold: number;
        currency: { copper: number };
        derived: { carryCapacity: number };
      };
    }).character;
    expect(character.name).toBe("Hero");
    expect(character.abilityModifiers.str).toBe(3); // (16-10)/2 = 3
    expect(character.abilityModifiers.cha).toBe(-1); // floor((8-10)/2) = -1
    expect(character.gold).toBe(10);
    expect(character.currency.copper).toBe(1000);
    expect(character.derived.carryCapacity).toBe(240);

    expect(store.getRouting("account-1", "campaign-1")?.referenceCharacterId).toBe("char-1");
  });

  it("routes inventory actions to inventory_manage with the stored characterId", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

    const client = fakeClient({
      "inventory_manage.equip": (args) => {
        expect(args.characterId).toBe("char-1");
        expect(args.itemId).toBe("item-1");
        expect(args.slot).toBe("mainhand");
        return { success: true };
      },
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const result = await adapter.executeToolCall(
      "account-1",
      "actor-1",
      "campaign-1",
      toolCall("equip_item", { itemId: "item-1", slot: "mainhand" })
    );

    expect(result.accepted).toBe(true);
    expect(result.campaignVersion).toBe(1);
  });

  it("derives equip slots for carried reference-engine weapons, armor, and shields", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

    const client = fakeClient({
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 10 },
        hp: 10,
        maxHp: 10,
        ac: 10,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({
        inventory: [
          { item: { id: "chain-mail", name: "Chain Mail", type: "armor", weight: 55, properties: { ac: 16 } }, quantity: 1, equipped: false },
          { item: { id: "shield", name: "Shield", type: "armor", weight: 6, properties: { acBonus: 2 } }, quantity: 1, equipped: false },
          { item: { id: "crossbow", name: "Light Crossbow", type: "weapon", weight: 5, properties: { damage: "1d8" } }, quantity: 1, equipped: false },
        ],
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    expect(campaign.character.inventory.map((item) => [item.id, item.slot])).toEqual([
      ["chain-mail", "armor"],
      ["shield", "offhand"],
      ["crossbow", "mainhand"],
    ]);
  });

  it("projects the reference engine quest log instead of the compatibility tutorial quest", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

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
        level: 7,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
      "quest_manage.get_log": () => ({
        quests: [
          {
            id: "quest-rescue",
            name: "Rescue Sergeant Pell",
            description: "Bring Pell home from the salt tunnels.",
            status: "completed",
            objectives: [{ id: "obj-rescue", description: "Get Pell out alive", current: 1, required: 1, completed: true }],
            rewards: { experience: 50, gold: 12 },
          },
          {
            id: "quest-relay",
            name: "War-machine relay",
            description: "Find the source of the repeating tremor.",
            status: "active",
            objectives: [{ id: "obj-relay", description: "Locate the relay chamber", current: 1, required: 3, completed: false }],
            rewards: { experience: 100, gold: 25 },
          },
        ],
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    expect(campaign.quests.map((quest) => quest.title)).toEqual(["Rescue Sergeant Pell", "War-machine relay"]);
    expect(campaign.quests[0]).toMatchObject({ status: "completed", progress: 100, reward: { xp: 50, copper: 1_200 } });
    expect(campaign.quests[1]).toMatchObject({ status: "active", progress: 33, reward: { xp: 100, copper: 2_500 } });
  });

  it("clears the compatibility tutorial quest when the reference log is empty", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

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
        level: 7,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
      "quest_manage.get_log": () => ({ quests: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    expect(campaign.quests).toEqual([]);
  });

  it("rejects inventory actions before a character exists, without calling the reference engine", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });

    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);

    const result = await adapter.executeToolCall(
      "account-1",
      "actor-1",
      "campaign-1",
      toolCall("equip_item", { itemId: "item-1", slot: "mainhand" })
    );

    expect(result.accepted).toBe(false);
    expect(result.code).toBe("no_character");
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it("adds a player note via narrative_manage and reflects it in the session view", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });

    const client = fakeClient({
      "narrative_manage.add": (args) => {
        expect(args.worldId).toBe("world-1");
        expect(args.content).toBe("A note.");
        expect(args.visibility).toBe("player_visible");
        return { success: true, noteId: "note-1" };
      },
      "narrative_manage.search": () => ({
        notes: [
          {
            id: "note-1",
            worldId: "world-1",
            type: "session_log",
            content: "A note.",
            visibility: "player_visible",
            createdAt: "2026-08-12T00:00:00.000Z",
          },
        ],
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const result = await adapter.executeToolCall(
      "account-1",
      "actor-1",
      "campaign-1",
      toolCall("player_note_add", { text: "A note.", source: "player" })
    );

    expect(result.accepted).toBe(true);
    const notes = (result.data as { playerNotes: Array<{ text: string; source: string }> }).playerNotes;
    expect(notes).toEqual([{ id: "note-1", text: "A note.", source: "player", createdAt: "2026-08-12T00:00:00.000Z" }]);
  });

  it("returns a typed unsupported result for tools with no reference-engine equivalent, without calling the client", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });

    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);

    const result = await adapter.executeToolCall(
      "account-1",
      "actor-1",
      "campaign-1",
      toolCall("character_options", {})
    );

    expect(result.accepted).toBe(false);
    expect(result.code).toBe("unsupported_on_reference_backend");
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it("deletes routing on deleteCampaign, reverting the campaign to unrouted", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });
    const client = fakeClient({});
    const adapter = new ReferenceEngineAdapter(client, store);

    const result = await adapter.deleteCampaign("account-1", "campaign-1");

    expect(result.deleted).toBe(true);
    expect(store.getRouting("account-1", "campaign-1")).toBeNull();
  });

  it("overlays PLAYER.md narrative fields onto the character without touching mechanical stats (background/alignment come from character_manage, not the docket)", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });
    store.setDocket(
      "account-1",
      "campaign-1",
      "player",
      [
        "---",
        // A docket-side background — must NOT win over character_manage's.
        "background: Docket Background Should Be Ignored",
        "personalityTraits: |",
        "  Quick to laugh, slow to trust.",
        "  Always carries a spare candle.",
        "backstory: |",
        "  Raised in a temple, left after a vision of the abyss.",
        // A hostile docket attempting to override mechanical state — must be ignored.
        "hp: 99999",
        "ac: 999",
        "abilities: {str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20}",
        "---",
      ].join("\n")
    );

    const client = fakeClient({
      "character_manage.get": () => ({
        id: "char-1",
        name: "Hero",
        race: "human",
        characterClass: "fighter",
        stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 13,
        level: 1,
        xp: 0,
        background: "Acolyte",
        alignment: "Chaotic Neutral",
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({ inventory: [] }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    // background/alignment come from character_manage (real mechanical field), not the docket.
    expect(campaign.character.background).toBe("Acolyte");
    expect(campaign.character.alignment).toBe("Chaotic Neutral");
    expect(campaign.character.details.personalityTraits).toContain("Quick to laugh");
    expect(campaign.character.details.backstory).toContain("Raised in a temple");

    // Mechanical truth still comes only from character_manage, untouched by the docket.
    expect(campaign.character.hp).toBe(10);
    expect(campaign.character.ac).toBe(13);
    expect(campaign.character.abilities).toEqual({ str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 });
  });

  it("overlays CAMPAIGN.md onto the campaign profile", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setCampaignProfile("account-1", "campaign-1", {
      name: "Original Name",
      premise: "Original premise.",
      setting: "Open fantasy",
      tone: "Adventurous",
    });
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });
    store.setDocket(
      "account-1",
      "campaign-1",
      "campaign",
      ["---", "premise: |", "  A modern vampire adventure in a city that never sleeps.", "---"].join("\n")
    );

    const client = fakeClient({ "narrative_manage.search": () => ({ notes: [] }) });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    expect(campaign.campaign.name).toBe("Original Name");
    expect(campaign.campaign.premise).toContain("modern vampire adventure");
  });

  it("excludes the secrets and player dockets from getCampaign's returned dockets field", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });
    store.setDocket("account-1", "campaign-1", "secrets", "the villain is the king");
    store.setDocket("account-1", "campaign-1", "player", "---\nbackground: Acolyte\n---");
    store.setDocket("account-1", "campaign-1", "state", "It is raining in the harbor district.");

    const client = fakeClient({ "narrative_manage.search": () => ({ notes: [] }) });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { dockets } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    expect(dockets.state).toBe("It is raining in the harbor district.");
    expect(JSON.stringify(dockets)).not.toContain("villain");
    expect(JSON.stringify(dockets)).not.toContain("Acolyte");
  });

  it("hydrates a Warlock with real SRD data (Pact Magic, d8 hit die, real save proficiencies) via the content kernel, not the 4-class fallback", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

    const client = fakeClient({
      "character_manage.get": () => ({
        id: "char-1",
        name: "Argyle",
        race: "human",
        characterClass: "warlock",
        stats: { str: 11, dex: 15, con: 14, int: 12, wis: 15, cha: 16 },
        hp: 10,
        maxHp: 10,
        ac: 13,
        level: 1,
        xp: 0,
      }),
      "narrative_manage.search": () => ({ notes: [] }),
      "inventory_manage.get_detailed": () => ({
        inventory: [
          {
            item: { id: "item-1", name: "Crossbow, light", type: "weapon", weight: 5, properties: { damage: "1d8" } },
            quantity: 1,
            equipped: true,
          },
        ],
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    const { campaign } = await adapter.getCampaign("account-1", "actor-1", "campaign-1");

    // Real Warlock data from the content kernel, not the fighter-shaped 4-class fallback.
    expect(campaign.character.hitDie).toBe(8);
    expect(campaign.character.savingThrows.wis).toBeGreaterThan(0); // Warlock saves: wis + cha, not str + con
    expect(campaign.character.savingThrows.cha).toBeGreaterThan(0);
    expect(campaign.character.spellcasting).not.toBeNull();
    expect(campaign.character.spellcasting?.slotRecovery).toBe("short-or-long-rest"); // Pact Magic
    expect(campaign.character.spellcasting?.ability).toBe("cha");

    // Inventory flowed through as an "authored" item.
    expect(campaign.character.inventory).toHaveLength(1);
    expect(campaign.character.inventory[0]?.name).toBe("Crossbow, light");

    // Authoritative combat numbers from character_manage are untouched by hydration.
    expect(campaign.character.hp).toBe(10);
    expect(campaign.character.maxHp).toBe(10);
    expect(campaign.character.ac).toBe(13);
  });

  it("rejects cantrips and levelled spells submitted to the wrong spellbook bucket", async () => {
    const store = createStore();
    store.setBackend("account-1", "campaign-1", "reference");
    store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });
    const options = open5eSpellOptions("cleric", 1);
    const cantrip = options.spells.find((spell) => spell.level === 0);
    const levelled = options.spells.find((spell) => spell.level > 0);
    expect(cantrip).toBeDefined();
    expect(levelled).toBeDefined();

    const client = fakeClient({
      "character_manage.get": () => ({
        id: "char-1",
        name: "Sela",
        race: "human",
        characterClass: "cleric",
        stats: { str: 10, dex: 14, con: 13, int: 12, wis: 16, cha: 8 },
        hp: 10,
        maxHp: 10,
        ac: 12,
        level: 1,
        xp: 0,
      }),
    });
    const adapter = new ReferenceEngineAdapter(client, store);

    await expect(adapter.updateCharacterSpells("account-1", "actor-1", "campaign-1", {
      cantripsKnown: [levelled!.contentKey],
    })).rejects.toThrow("cantrip_requires_level_0");
    await expect(adapter.updateCharacterSpells("account-1", "actor-1", "campaign-1", {
      preparedSpells: [cantrip!.contentKey],
    })).rejects.toThrow("levelled_spell_cannot_be_cantrip");
    expect(client.callTool).toHaveBeenCalledTimes(2);
  });

  describe("updateCharacterDetails", () => {
    function baseCharacterFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: "char-1",
        name: "Argyle",
        race: "human",
        characterClass: "warlock",
        stats: { str: 11, dex: 15, con: 14, int: 12, wis: 15, cha: 16 },
        hp: 10,
        maxHp: 10,
        ac: 13,
        level: 1,
        xp: 0,
        ...overrides,
      };
    }

    it("updates background/alignment via character_manage.update (real mechanical field, not a docket)", async () => {
      const store = createStore();
      store.setBackend("account-1", "campaign-1", "reference");
      store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

      // Stateful fixture (unlike the other tests' static ones) — needed to prove
      // the update actually round-trips through a subsequent read, the way the
      // real reference engine would persist it.
      let updateArgs: Record<string, unknown> | null = null;
      let persisted = baseCharacterFixture();
      const client = fakeClient({
        "character_manage.update": (args) => {
          updateArgs = args;
          persisted = { ...persisted, background: args.background, alignment: args.alignment };
          return { success: true };
        },
        "character_manage.get": () => persisted,
        "narrative_manage.search": () => ({ notes: [] }),
        "inventory_manage.get_detailed": () => ({ inventory: [] }),
      });
      const adapter = new ReferenceEngineAdapter(client, store);

      const result = await adapter.updateCharacterDetails("account-1", "actor-1", "campaign-1", {
        background: "Acolyte",
        alignment: "Chaotic Neutral",
      });

      expect(updateArgs).toMatchObject({ characterId: "char-1", background: "Acolyte", alignment: "Chaotic Neutral" });
      expect(result.campaign.character.background).toBe("Acolyte");
      expect(result.campaign.character.alignment).toBe("Chaotic Neutral");
    });

    it("merges free-text detail fields into the player docket without clobbering fields set by a prior save", async () => {
      const store = createStore();
      store.setBackend("account-1", "campaign-1", "reference");
      store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1", characterId: "char-1" });

      const client = fakeClient({
        "character_manage.get": () => baseCharacterFixture(),
        "narrative_manage.search": () => ({ notes: [] }),
        "inventory_manage.get_detailed": () => ({ inventory: [] }),
      });
      const adapter = new ReferenceEngineAdapter(client, store);

      await adapter.updateCharacterDetails("account-1", "actor-1", "campaign-1", {
        details: { backstory: "Raised in a temple." },
      });
      const second = await adapter.updateCharacterDetails("account-1", "actor-1", "campaign-1", {
        details: { ideals: "Knowledge above all." },
      });

      expect(second.campaign.character.details.backstory).toBe("Raised in a temple.");
      expect(second.campaign.character.details.ideals).toBe("Knowledge above all.");
    });

    it("throws ReferenceEngineUnsupportedError when there is no character yet", async () => {
      const store = createStore();
      store.setBackend("account-1", "campaign-1", "reference");
      store.setReferenceIds("account-1", "campaign-1", { worldId: "world-1", partyId: "party-1" });
      const client = fakeClient({});
      const adapter = new ReferenceEngineAdapter(client, store);

      await expect(
        adapter.updateCharacterDetails("account-1", "actor-1", "campaign-1", { background: "Acolyte" })
      ).rejects.toThrow(ReferenceEngineUnsupportedError);
    });
  });
});
