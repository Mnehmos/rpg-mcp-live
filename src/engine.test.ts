import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadActiveOpen5eContentPack } from "./content/pack.js";
import { Open5eContentResolver } from "./content/resolve.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand, toSessionView } from "./engine-domain.js";
import { executeReadTool, lanternToolDefinitions } from "./engine-tools.js";
import {
  EngineVersionConflictError,
  LanternEngineStore,
} from "./engine-store.js";
import type { CreateCampaignContext, RequestContext } from "./engine-contracts.js";
import { currencyFromCopper } from "./open5e-rules.js";

function createTestStore(): LanternEngineStore {
  const directory = mkdtempSync(join(tmpdir(), "lantern-engine-"));
  return new LanternEngineStore(join(directory, "engine.db"));
}

function createCampaign(store: LanternEngineStore, accountId: string, actorId: string) {
  const createContext: CreateCampaignContext = {
    requestId: randomUUID(),
    accountId,
    actorId,
    capabilities: ["player", "dm"],
  };
  const state = createInitialCampaign(accountId, actorId);
  return store.createCampaign(createContext, state);
}

function context(accountId: string, campaignId: string, actorId = accountId): RequestContext {
  return {
    requestId: randomUUID(),
    accountId,
    campaignId,
    actorId,
    capabilities: ["player", "dm"],
  };
}

describe("Lantern engine boundary", () => {
  it("keeps campaign reads account-scoped and requires explicit actor context", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");

    expect(() => store.getCampaign(context("account-b", campaign.id, "actor-b"))).toThrow("Campaign not found");
    expect(() => store.getCampaign(context("account-a", campaign.id, "actor-b"))).toThrow("actor");
    store.close();
  });

  it("deletes an owned campaign and cascades its commands and events atomically", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const otherCampaign = createCampaign(store, "account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const commandId = randomUUID();
    const command = { kind: "roll_check" as const, ability: "wis" as const, goal: "Create deletion evidence." };
    const committed = store.executeCommand({
      context: commandContext,
      clientCommandId: commandId,
      expectedCampaignVersion: campaign.version,
      command,
      tool: "roll_check",
      resolve: (state) => resolveEngineCommand(state, commandContext, commandId, command, "roll_check"),
    });

    const deleted = store.deleteCampaign(commandContext, committed.state.version);

    expect(deleted).toMatchObject({
      deleted: true,
      campaignId: campaign.id,
      previousVersion: committed.state.version,
      deletedCommands: 1,
      deletedEvents: 1,
    });
    expect(() => store.getCampaign(commandContext)).toThrow("Campaign not found");
    expect(store.listCampaigns("account-a").map((entry) => entry.id)).toEqual([otherCampaign.id]);
    expect(store.getStoredCommand("account-a", commandId)).toBeNull();
    store.close();
  });

  it("rejects stale or cross-actor campaign deletion without changing the campaign", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const commandId = randomUUID();
    const command = { kind: "roll_check" as const, ability: "wis" as const, goal: "Advance before deletion." };
    const committed = store.executeCommand({
      context: commandContext,
      clientCommandId: commandId,
      expectedCampaignVersion: campaign.version,
      command,
      tool: "roll_check",
      resolve: (state) => resolveEngineCommand(state, commandContext, commandId, command, "roll_check"),
    });

    expect(() => store.deleteCampaign(commandContext, campaign.version)).toThrow(EngineVersionConflictError);
    expect(() => store.deleteCampaign(context("account-b", campaign.id, "actor-b"), committed.state.version)).toThrow("Campaign not found");
    expect(store.getCampaign(commandContext).version).toBe(committed.state.version);
    expect(store.listCampaignEvents(commandContext)).toHaveLength(1);
    store.close();
  });

  it("supports the complete tool catalog while keeping observe read-only", () => {
    const names = lanternToolDefinitions.map((definition) => definition.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "campaign_context",
        "content_search",
        "content_get",
        "rules_reference",
        "character_options",
        "world_context",
        "challenge_attempt",
        "player_notes",
        "player_note_add",
        "npc_context",
        "merchant_catalog",
        "observe",
        "move",
        "interact",
        "social_check",
        "merchant_trade",
        "social_action",
        "quest_create",
        "quest_update",
        "improvise",
        "campaign_beat",
        "character_sheet",
        "character_create",
        "character_update",
        "inventory",
        "equip_item",
        "unequip_item",
        "drop_item",
        "use_item",
        "quest_progress",
        "combat_state",
        "combat_start",
        "encounter_decision",
        "spawn_creature",
        "learn_spell",
        "prepare_spell",
        "cast_spell",
        "combat_action",
        "combat_move",
        "end_turn",
        "advancement_confirm",
        "npc_advance",
        "advance_turn",
        "death_save",
        "loot",
        "rest",
        "roll_check",
        "tutorial_advance",
      ])
    );
    expect(names).toHaveLength(54);

    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const initialContext = context("account-a", campaign.id, "actor-a");
    const result = store.executeCommand({
      context: initialContext,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: 0,
      command: { kind: "observe" },
      tool: "observe",
      resolve: (state) => resolveEngineCommand(state, initialContext, randomUUID(), { kind: "observe" }, "observe"),
    });

    expect(result.accepted).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.event).toBeNull();
    expect(result.state.version).toBe(0);
    store.close();
  });

  it("registers the verified pack and keeps gated content reads version-neutral", async () => {
    const pack = await loadActiveOpen5eContentPack();
    const resolver = new Open5eContentResolver(pack, {
      gamesystem: "5e-2014",
      allowedLicenses: ["cc-by-40", "cc0"],
      allowedDocuments: ["srd-2014", "core", "elderberry-inn-icons"],
    });
    const store = createTestStore();
    const installed = store.installContentPack(pack.descriptor);
    const installedAgain = store.installContentPack(pack.descriptor);
    expect(installedAgain.installedAt).toBe(installed.installedAt);
    expect(store.getInstalledContentPacks()).toEqual([installed]);

    const campaign = createCampaign(store, "account-content", "actor-content");
    expect(campaign.rulesVersion).toBe(pack.descriptor.rulesVersion);
    const read = executeReadTool(campaign, "content_get", {
      contentKey: "open5e:skill:5e-2014:srd-2014:athletics",
    }, resolver);
    expect(read).toMatchObject({
      accepted: true,
      readOnly: true,
      campaignVersion: 0,
      data: { effectiveTier: 1 },
    });
    const ruleSearch = executeReadTool(campaign, "rules_reference", {
      action: "search",
      query: "speed is halved",
      collections: ["rules"],
      limit: 5,
    }, resolver);
    expect(ruleSearch).toMatchObject({
      accepted: true,
      readOnly: true,
      campaignVersion: 0,
      data: {
        results: [
          {
            effectiveTier: 0,
            normalized: {
              kind: "rule",
              contentKey: "open5e:rule:5e-2014:srd-2014:srd_attacking_grappling",
              rulesetKey: "srd_attacking",
            },
          },
        ],
      },
    });
    const ruleGet = executeReadTool(campaign, "rules_reference", {
      action: "get",
      contentKey: "open5e:plane:5e-2014:srd-2014:astral-plane",
    }, resolver);
    expect(ruleGet).toMatchObject({
      accepted: true,
      readOnly: true,
      campaignVersion: 0,
      data: { normalized: { kind: "plane", name: "Astral Plane", sourceApiVersion: "v1" } },
    });
    expect(store.getCampaign(context("account-content", campaign.id, "actor-content")).version).toBe(0);

    const forbidden = executeReadTool(campaign, "content_get", {
      contentKey: "open5e:document:a5e:a5e-ag:a5e-ag",
    }, resolver);
    expect(forbidden).toMatchObject({
      accepted: false,
      readOnly: true,
      code: "content_gamesystem_forbidden",
      campaignVersion: 0,
    });
    expect(JSON.stringify(campaign)).not.toContain('"documentKey"');
    expect(JSON.stringify(campaign)).not.toContain('"fidelityTier"');
    store.close();
  });

  it("persists the player turn immediately before the DM result", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const commandId = randomUUID();
    const playerText = "I examine the opening and look for a useful lead.";
    const command = { kind: "declare" as const, goal: playerText };

    const result = store.executeCommand({
      context: commandContext,
      clientCommandId: commandId,
      expectedCampaignVersion: campaign.version,
      command,
      tool: "declare",
      playerText,
      resolve: (state) => resolveEngineCommand(state, commandContext, commandId, command, "declare", playerText),
    });

    expect(result.session.log.slice(-2).map((message) => message.kind)).toEqual(["player", "narration"]);
    expect(result.session.log.at(-2)?.text).toBe(playerText);
    expect(store.getCampaign(commandContext).log.slice(-2).map((message) => message.kind)).toEqual(["player", "narration"]);
    store.close();
  });

  it("replays a command without rerolling and rejects stale writes", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const commandId = randomUUID();
    const firstContext = context("account-a", campaign.id, "actor-a");
    const input = {
      context: firstContext,
      clientCommandId: commandId,
      expectedCampaignVersion: 0,
      command: { kind: "roll_check" as const, ability: "wis" as const, goal: "Study the lantern." },
      tool: "roll_check" as const,
      resolve: (state: typeof campaign) =>
        resolveEngineCommand(
          state,
          firstContext,
          commandId,
          { kind: "roll_check", ability: "wis", goal: "Study the lantern." },
          "roll_check"
        ),
    };

    const first = store.executeCommand(input);
    const replay = store.executeCommand(input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    expect(first.event?.rulesVersion).toBe(campaign.rulesVersion);
    expect(first.event?.contentKeys).toEqual([]);
    expect(first.event?.rolls[0]?.value).toBeGreaterThanOrEqual(1);
    expect(first.event?.rolls[0]?.value).toBeLessThanOrEqual(20);

    expect(() =>
      store.executeCommand({
        ...input,
        clientCommandId: randomUUID(),
      })
    ).toThrow(EngineVersionConflictError);
    store.close();
  });

  it("rejects graph-invalid movement without changing state or version", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const rejected = store.executeCommand({
      context: commandContext,
      clientCommandId: randomUUID(),
      expectedCampaignVersion: 0,
      command: { kind: "move", destinationId: "encounter" },
      tool: "move",
      resolve: (state) =>
        resolveEngineCommand(state, commandContext, randomUUID(), { kind: "move", destinationId: "encounter" }, "move"),
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("invalid_move");
    expect(rejected.state.version).toBe(0);
    expect(store.getCampaign(commandContext).worldContext).toBeNull();
    store.close();
  });

  it("lets the DM establish any world context and shares durable notes with the player", () => {
    const store = createTestStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    expect(campaign.worldContext).toBeNull();
    expect(campaign.playerNotes).toEqual([]);

    const worldContextId = randomUUID();
    const worldCommand = {
      kind: "world_context" as const,
      title: "Harbor of Glass",
      description: "A crowded harbor city catches the last light in its salt-stained windows.",
      features: ["ferry market", "red signal tower"],
      exits: [{ id: "ferry-market", label: "The ferry market" }],
    };
    const established = store.executeCommand({
      context: commandContext,
      clientCommandId: worldContextId,
      expectedCampaignVersion: 0,
      command: worldCommand,
      tool: "world_context",
      playerText: "I arrive wherever the DM takes me.",
      resolve: (state) => resolveEngineCommand(state, commandContext, worldContextId, worldCommand, "world_context"),
    });
    expect(established.accepted).toBe(true);
    expect(established.state.worldContext?.title).toBe("Harbor of Glass");
    expect(established.state.worldContext?.exits[0]?.id).toBe("ferry-market");

    const noteId = randomUUID();
    const noteCommand = { kind: "player_note_add" as const, text: "The red signal tower matters to me.", source: "player" as const };
    const noted = store.executeCommand({
      context: commandContext,
      clientCommandId: noteId,
      expectedCampaignVersion: 1,
      command: noteCommand,
      tool: "player_note_add",
      resolve: (state) => resolveEngineCommand(state, commandContext, noteId, noteCommand, "player_note_add"),
    });
    expect(noted.state.playerNotes).toHaveLength(1);
    expect(noted.session.playerNotes[0]?.source).toBe("player");
    expect(noted.session.playerNotes[0]?.text).toContain("signal tower");
    expect(noted.session.character.inventory.length).toBeGreaterThan(0);
    store.close();
  });

  it("enforces combat turn ownership and atomic consumable effects", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "encounter",
        encounterName: "Impossible training",
        creatures: [{
          creatureKey: "open5e:creature:5e-2014:srd-2014:srd_tarrasque",
          count: 1,
        }],
      },
      "combat_start"
    );
    expect(started.accepted).toBe(true);
    const targetId = started.state.combat.enemies[0]!.id;
    const attack = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "attack", targetId },
      "combat_action"
    );
    expect(attack.accepted).toBe(true);
    expect(attack.state.combat.activeActorId).toBe(campaign.actorId);

    const offTurn = resolveEngineCommand(
      attack.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "attack", targetId },
      "combat_action"
    );
    expect(offTurn.accepted).toBe(false);
    expect(offTurn.code).toBe("action_already_used");
    expect(offTurn.state.version).toBe(attack.state.version);

    campaign.character.hp = 2;
    campaign.character.inventory.push({
      id: "test-draught",
      quantity: 1,
      authoredDefinition: {
        name: "Test Draught",
        kind: "consumable",
        weight: 0.5,
        healing: 6,
      },
    });
    const used = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "use_item", itemId: "test-draught" },
      "use_item"
    );
    expect(used.accepted).toBe(true);
    expect(used.state.character.hp).toBe(8);
    expect(used.state.character.inventory.some((item) => item.id === "test-draught")).toBe(false);
  });

  it("stores pack-backed combatants, queues every foe, and rejects uncompiled creature actions", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const goblinKey = "open5e:creature:5e-2014:srd-2014:srd_goblin";
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "goblin-patrol",
        encounterName: "Goblin patrol",
        creatures: [{ creatureKey: goblinKey, count: 2 }],
      },
      "combat_start"
    );

    expect(started.accepted).toBe(true);
    expect(started.state.version).toBe(1);
    expect(started.event?.contentKeys).toEqual([goblinKey]);
    expect(started.state.combat.enemies).toHaveLength(2);
    const persisted = JSON.stringify(started.state.combat.enemies);
    expect(persisted).toContain(goblinKey);
    expect(persisted).toContain(started.state.rulesVersion.slice("open5e-pack@".length));
    expect(persisted).not.toContain('"name"');
    expect(persisted).not.toContain('"armorClass"');
    const startedView = toSessionView(started.state);
    expect(startedView.combat.enemies[0]).toMatchObject({
      name: "Goblin",
      maxHp: 7,
      armorClass: 15,
      mechanicsStatus: "basic-attacks-compiled",
    });
    expect(startedView.combat.enemies[0]?.attacks.map((attack) => attack.actionKey)).toEqual([
      "scimitar",
      "shortbow",
    ]);

    const dodged = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const firstGoblinId = dodged.state.combat.enemies[0]!.id;
    const secondGoblinId = dodged.state.combat.enemies[1]!.id;
    expect(dodged.state.combat.activeActorId).toBe(campaign.actorId);

    const ambiguous = resolveEngineCommand(
      dodged.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn" },
      "advance_turn"
    );
    expect(ambiguous.accepted).toBe(false);
    expect(ambiguous.code).toBe("enemy_action_required");
    expect(ambiguous.state.version).toBe(dodged.state.version);

    const firstTurn = resolveEngineCommand(
      dodged.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", combatantId: firstGoblinId, attackKey: "scimitar" },
      "advance_turn"
    );
    expect(firstTurn.accepted).toBe(true);
    expect(firstTurn.state.combat.activeActorId).toBe(secondGoblinId);
    expect(firstTurn.event?.rolls[0]).toMatchObject({ kind: "enemy_attack_d20", sides: 20 });
    expect(firstTurn.message).toContain("Scimitar");

    const captainCampaign = createInitialCampaign("account-a", "actor-a");
    const captainContext = context("account-a", captainCampaign.id, "actor-a");
    const captain = resolveEngineCommand(
      captainCampaign,
      captainContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "captain",
        encounterName: "Captain's challenge",
        creatures: [{
          creatureKey: "open5e:creature:5e-2014:srd-2014:srd_bandit-captain",
          count: 1,
        }],
      },
      "combat_start"
    );
    const captainDodges = resolveEngineCommand(
      captain.state,
      captainContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const deferredMultiattack = resolveEngineCommand(
      captainDodges.state,
      captainContext,
      randomUUID(),
      { kind: "advance_turn", attackKey: "multiattack" },
      "advance_turn"
    );
    expect(deferredMultiattack.accepted).toBe(false);
    expect(deferredMultiattack.code).toBe("content_tier_insufficient");
    expect(deferredMultiattack.message).toContain("not executable in S3");
  });

  it("executes exact S7 multiattack as one authoritative creature turn", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    campaign.character.hp = 200;
    campaign.character.maxHp = 200;
    const commandContext = context("account-a", campaign.id, "actor-a");
    const creatureKey = "open5e:creature:5e-2014:srd-2014:srd_air-elemental";
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "elemental-test",
        encounterName: "Elemental test",
        creatures: [{ creatureKey, count: 1 }],
      },
      "combat_start"
    );
    const yielded = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const enemyId = yielded.state.combat.enemies[0]!.id;
    const resolved = resolveEngineCommand(
      yielded.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", combatantId: enemyId, actionKey: "multiattack" },
      "advance_turn"
    );

    expect(resolved.accepted).toBe(true);
    expect(resolved.state.version).toBe(yielded.state.version + 1);
    expect(resolved.state.combat.round).toBe(2);
    expect(resolved.state.combat.activeActorId).toBe(campaign.actorId);
    expect(resolved.event?.rolls.filter((roll) => /^enemy_attack_\d+_d20$/.test(roll.kind))).toHaveLength(2);
    expect(resolved.event?.contentKeys).toEqual(expect.arrayContaining([
      creatureKey,
      "open5e:effect-program:5e-2014:srd-2014:srd_air-elemental/multiattack",
      "open5e:creature-attack:5e-2014:srd-2014:srd_air-elemental/slam",
    ]));
    expect(resolved.message).toContain("uses Multiattack");
    expect(JSON.stringify(resolved.state.combat.enemies)).not.toContain("sourceDescription");
  });

  it("executes exact save damage, consumes recharge availability, and rejects an already-failed recharge", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    campaign.character.hp = 1_000;
    campaign.character.maxHp = 1_000;
    const commandContext = context("account-a", campaign.id, "actor-a");
    const creatureKey = "open5e:creature:5e-2014:srd-2014:srd_young-red-dragon";
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "breath-test",
        encounterName: "Breath test",
        creatures: [{ creatureKey, count: 1 }],
      },
      "combat_start"
    );
    const yielded = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const enemyId = yielded.state.combat.enemies[0]!.id;
    const breath = resolveEngineCommand(
      yielded.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", combatantId: enemyId, actionKey: "fire-breath" },
      "advance_turn"
    );

    expect(breath.accepted).toBe(true);
    expect(breath.event?.rolls.some((roll) => roll.kind === "character_dex_save_d20")).toBe(true);
    expect(breath.event?.rolls.filter((roll) => roll.kind === "enemy_effect_damage")).toHaveLength(16);
    expect(breath.state.combat.enemies[0]?.actionResources["fire-breath"]).toMatchObject({
      kind: "recharge",
      available: false,
      rechargeMinimum: 5,
    });

    const nextPlayerTurn = resolveEngineCommand(
      breath.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const blockedState = structuredClone(nextPlayerTurn.state);
    blockedState.combat.enemies[0]!.actionResources["fire-breath"] = {
      kind: "recharge",
      usesRemaining: null,
      available: false,
      rechargeMinimum: 5,
      lastRechargeRound: blockedState.combat.round,
    };
    const blocked = resolveEngineCommand(
      blockedState,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", combatantId: enemyId, actionKey: "fire-breath" },
      "advance_turn"
    );
    expect(blocked.accepted).toBe(false);
    expect(blocked.code).toBe("action_not_recharged");
    expect(blocked.state.version).toBe(blockedState.version);
  });

  it("keeps incomplete S7 effect fragments non-executable without consuming their usage limit", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "fragment-test",
        encounterName: "Fragment test",
        creatures: [{
          creatureKey: "open5e:creature:5e-2014:srd-2014:srd_adult-brass-dragon",
          count: 1,
        }],
      },
      "combat_start"
    );
    const yielded = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const beforeResource = structuredClone(yielded.state.combat.enemies[0]?.actionResources["breath-weapons"]);
    const rejected = resolveEngineCommand(
      yielded.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", actionKey: "breath-weapons" },
      "advance_turn"
    );

    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("content_tier_insufficient");
    expect(rejected.state.version).toBe(yielded.state.version);
    expect(rejected.state.combat.enemies[0]?.actionResources["breath-weapons"]).toEqual(beforeResource);
  });

  it("applies, enforces, and expires a compiled condition duration", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    campaign.character.hp = 200;
    campaign.character.maxHp = 200;
    campaign.character.savingThrows.con = -100;
    const commandContext = context("account-a", campaign.id, "actor-a");
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "condition-test",
        encounterName: "Condition test",
        creatures: [{
          creatureKey: "open5e:creature:5e-2014:srd-2014:srd_vrock",
          count: 1,
        }],
      },
      "combat_start"
    );
    const yielded = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "dodge" },
      "combat_action"
    );
    const enemyId = yielded.state.combat.enemies[0]!.id;
    const screech = resolveEngineCommand(
      yielded.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", combatantId: enemyId, actionKey: "stunning-screech" },
      "advance_turn"
    );

    expect(screech.accepted).toBe(true);
    expect(screech.state.character.conditions).toContain("stunned");
    expect(screech.state.character.conditionEffects[0]).toMatchObject({
      name: "Stunned",
      sourceCombatantId: enemyId,
      duration: { kind: "turn-boundary", boundary: "end", subject: "source", offsetTurns: 1 },
    });
    expect(screech.state.combat.enemies[0]?.actionResources["stunning-screech"]).toMatchObject({
      kind: "per-day",
      usesRemaining: 0,
      available: false,
    });

    const illegalAction = resolveEngineCommand(
      screech.state,
      commandContext,
      randomUUID(),
      { kind: "combat_action", action: "attack", targetId: enemyId },
      "combat_action"
    );
    expect(illegalAction.accepted).toBe(false);
    expect(illegalAction.code).toBe("condition_prevents_action");

    const skipped = resolveEngineCommand(
      screech.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn" },
      "advance_turn"
    );
    expect(skipped.accepted).toBe(true);
    expect(skipped.state.combat.activeActorId).toBe(enemyId);

    const nextVrockTurn = resolveEngineCommand(
      skipped.state,
      commandContext,
      randomUUID(),
      { kind: "advance_turn", combatantId: enemyId, actionKey: "multiattack" },
      "advance_turn"
    );
    expect(nextVrockTurn.accepted).toBe(true);
    expect(nextVrockTurn.state.character.conditions).not.toContain("stunned");
    expect(nextVrockTurn.state.character.conditionEffects).toEqual([]);
  });

  it("spawns multiple source creatures into one active encounter with one version increment", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "reinforcements",
        encounterName: "Reinforcements",
        creatures: [{
          creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin",
          count: 1,
        }],
      },
      "combat_start"
    );
    const spawned = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      {
        kind: "spawn_creature",
        creatureKey: "open5e:creature:5e-2014:srd-2014:srd_wolf",
        count: 3,
      },
      "spawn_creature"
    );

    expect(spawned.accepted).toBe(true);
    expect(spawned.state.version).toBe(started.state.version + 1);
    expect(spawned.state.combat.enemies).toHaveLength(4);
    expect(toSessionView(spawned.state).combat.enemies.filter((enemy) => enemy.name === "Wolf")).toHaveLength(3);
    expect(spawned.event?.contentKeys).toEqual([
      "open5e:creature:5e-2014:srd-2014:srd_goblin",
      "open5e:creature:5e-2014:srd-2014:srd_wolf",
    ]);
  });

  it("lets the DM author an encounter and its loot without engine-invented rewards", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const started = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "ambush",
        encounterName: "Ambush at the ford",
        creatures: [{
          creatureKey: "open5e:creature:5e-2014:srd-2014:srd_bandit",
          count: 1,
        }],
      },
      "combat_start"
    );
    expect(started.accepted).toBe(true);
    expect(started.state.combat.encounterName).toBe("Ambush at the ford");

    const defeated = started.state;
    defeated.combat.status = "ended";
    defeated.combat.enemies[0]!.hp = 0;
    defeated.combat.enemies[0]!.alive = false;
    const loot = resolveEngineCommand(
      defeated,
      commandContext,
      randomUUID(),
      {
        kind: "loot",
        items: [{ id: "bandit-token", name: "Bandit Token", kind: "treasure", quantity: 1, weight: 0.1, valueCopper: 25 }],
        rewardXp: 30,
        rewardCopper: 15,
        questId: "first-light",
      },
      "loot"
    );
    expect(loot.accepted).toBe(true);
    expect(loot.state.character.inventory.some((item) => item.id === "bandit-token")).toBe(true);
    expect(loot.state.character.inventory.some((item) => item.id === "rustkey")).toBe(false);
    expect(loot.state.character.currency.copper).toBe(1_715);
    expect(loot.state.character.xp).toBe(80);
    expect(loot.state.quest.rewardClaimed).toBe(true);
  });

  it("keeps campaign setup, character creation, tutorial, and sandbox as explicit phases", () => {
    const campaign = createInitialCampaign("account-a", "actor-a", undefined, {
      name: "The Salt Road",
      premise: "A fallen star has opened a road beneath the city.",
      setting: "Frontier city",
      tone: "Mysterious",
    });
    const commandContext = context("account-a", campaign.id, "actor-a");

    expect(campaign.phase).toBe("character_creation");
    expect(campaign.character.created).toBe(false);
    expect(campaign.campaign.name).toBe("The Salt Road");

    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Mnehmos", species: "dwarf", className: "barbarian" },
      "character_create"
    );
    expect(created.accepted).toBe(true);
    expect(created.state.phase).toBe("tutorial");
    expect(created.state.character.name).toBe("Mnehmos");

    const firstTutorialStep = resolveEngineCommand(
      created.state,
      commandContext,
      randomUUID(),
      { kind: "tutorial_advance" },
      "tutorial_advance"
    );
    expect(firstTutorialStep.state.phase).toBe("tutorial");
    expect(firstTutorialStep.state.tutorialStep).toBe(1);

    const sandbox = resolveEngineCommand(
      firstTutorialStep.state,
      commandContext,
      randomUUID(),
      { kind: "tutorial_advance" },
      "tutorial_advance"
    );
    expect(sandbox.state.phase).toBe("sandbox");
    expect(sandbox.state.tutorialStep).toBe(2);
  });

  it("rolls and validates a player-assigned ability-score set before canonical creation", () => {
    const campaign = createInitialCampaign("account-stats", "actor-stats");
    const commandContext = context("account-stats", campaign.id, "actor-stats");
    const rolled = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_roll_stats", method: "rolled" },
      "character_roll_stats"
    );

    expect(rolled).toMatchObject({ accepted: true, message: expect.stringContaining("rolled six ability scores") });
    const draft = rolled.state.characterCreation.abilityScoreDraft;
    expect(draft).not.toBeNull();
    expect(draft?.scores).toHaveLength(6);
    expect(draft?.rolls).toHaveLength(6);
    for (const roll of draft?.rolls ?? []) {
      expect(roll.dice).toHaveLength(4);
      expect(roll.total).toBe(roll.dice.reduce((sum, die) => sum + die, 0) - roll.dropped);
    }

    const assigned = draft?.scores ?? [];
    const created = resolveEngineCommand(
      rolled.state,
      commandContext,
      randomUUID(),
      {
        kind: "character_create",
        name: "Rolled Hero",
        speciesKey: "open5e:species:5e-2014:srd-2014:srd_human",
        classKey: "open5e:class:5e-2014:srd-2014:srd_fighter",
        backgroundKey: "open5e:background:5e-2014:srd-2014:srd_acolyte",
        alignmentKey: "open5e:alignment:5e-2014:srd-2014:neutral",
        abilityScoreMethod: "rolled",
        abilityScoreDraftId: draft?.id,
        abilityScores: {
          str: assigned[0] ?? 8,
          dex: assigned[1] ?? 8,
          con: assigned[2] ?? 8,
          int: assigned[3] ?? 8,
          wis: assigned[4] ?? 8,
          cha: assigned[5] ?? 8,
        },
      },
      "character_create"
    );

    expect(created).toMatchObject({ accepted: true, message: expect.stringContaining("ready") });
    expect(created.state.phase).toBe("tutorial");
    expect(created.state.characterCreation.abilityScoreDraft).toBeNull();
  });

  it("creates a fully pinned S5 character from validated Open5e choices", () => {
    const campaign = createInitialCampaign("account-s5", "actor-s5");
    const commandContext = context("account-s5", campaign.id, "actor-s5");
    const optionsRead = executeReadTool(campaign, "character_options");
    expect(optionsRead).toMatchObject({ accepted: true, readOnly: true, campaignVersion: 0 });
    expect(optionsRead.data).toMatchObject({
      packHash: "fbd846cf7b7833560b22f4ebffaf950fb6b2adf62cf9c6fff469266325ac31fa",
      species: expect.arrayContaining([expect.objectContaining({ name: "Half-Elf", selectable: true })]),
      classes: expect.arrayContaining([expect.objectContaining({ name: "Bard", selectable: true })]),
      backgrounds: [expect.objectContaining({ name: "Acolyte", startingCurrencyCopper: 1_500 })],
    });

    const command = {
      kind: "character_create" as const,
      name: "Cadence",
      speciesKey: "open5e:species:5e-2014:srd-2014:srd_half-elf",
      classKey: "open5e:class:5e-2014:srd-2014:srd_bard",
      backgroundKey: "open5e:background:5e-2014:srd-2014:srd_acolyte",
      alignmentKey: "open5e:alignment:5e-2014:srd-2014:chaotic-good",
      abilityBonusChoices: ["str", "dex"] as Array<"str" | "dex">,
      skillKeys: [
        "open5e:skill:5e-2014:srd-2014:acrobatics",
        "open5e:skill:5e-2014:srd-2014:deception",
        "open5e:skill:5e-2014:srd-2014:performance",
      ],
      languageKeys: [
        "open5e:language:5e-2014:core:dwarvish",
        "open5e:language:5e-2014:core:giant",
        "open5e:language:5e-2014:core:goblin",
      ],
      toolProficiencies: ["lute", "flute", "drum"],
    };
    const created = resolveEngineCommand(campaign, commandContext, randomUUID(), command, "character_create");

    expect(created.accepted).toBe(true);
    expect(created.state.phase).toBe("tutorial");
    expect(created.state.character).toMatchObject({
      name: "Cadence",
      species: "Half-Elf",
      className: "Bard",
      background: "Acolyte",
      alignment: "Chaotic-Good",
      abilities: { str: 9, dex: 15, con: 13, int: 10, wis: 12, cha: 17 },
      hitDie: 8,
      hp: 9,
      maxHp: 9,
      ac: 13,
      currency: { copper: 1_500 },
      gold: 15,
      spellcasting: { ability: "cha", slots: { "1": 2 } },
    });
    expect(created.state.character.speciesRef?.contentKey).toBe(command.speciesKey);
    expect(created.state.character.classRef?.contentKey).toBe(command.classKey);
    expect(created.state.character.skillRefs).toHaveLength(5);
    expect(created.state.character.languageRefs).toHaveLength(5);
    expect(created.state.character.proficiencies.tools).toEqual(["lute", "flute", "drum"]);
    expect(created.state.character.proficiencies.languages).toEqual(["Common", "Elvish", "Dwarvish", "Giant", "Goblin"]);
    expect(created.state.character.skills).toMatchObject({
      acrobatics: { proficient: true },
      deception: { proficient: true },
      performance: { proficient: true },
      insight: { proficient: true },
      religion: { proficient: true },
    });
    expect(created.state.character.features).toEqual(expect.arrayContaining(["Bardic Inspiration", "Skill Versatility", "Shelter of the Faithful"]));
    expect(created.state.character.inventory.map((item) => item.contentKey)).toEqual(expect.arrayContaining([
      "open5e:item:5e-2014:srd-2014:srd_rapier",
      "open5e:item:5e-2014:srd-2014:srd_lute",
      "open5e:item:5e-2014:srd-2014:srd_clothes-common",
      "open5e:item:5e-2014:srd-2014:srd_pouch",
    ]));
    expect(created.event?.contentKeys).toEqual(expect.arrayContaining([
      command.speciesKey,
      command.classKey,
      command.backgroundKey,
      command.alignmentKey,
      ...command.skillKeys,
      ...command.languageKeys,
    ]));

    const hydrated = normalizeCampaignState(created.state);
    expect(hydrated.character.savingThrows.dex).toBe(4);
    expect(hydrated.character.savingThrows.cha).toBe(5);
    expect(hydrated.character.proficiencies.tools).toEqual(["lute", "flute", "drum"]);
  });

  it("creates a selectable non-SRD background only when the campaign opts into its source partition", () => {
    const campaign = createInitialCampaign(
      "account-full-backgrounds",
      "actor-full-backgrounds",
      randomUUID(),
      undefined,
      undefined,
      {
        gamesystem: "5e-2014",
        baseDocumentKey: "srd-2014",
        allowedDocumentKeys: ["core", "elderberry-inn-icons", "open5e", "srd-2014", "tdcs", "toh"],
        allowedLicenseKeys: ["cc-by-40", "cc0", "ogl-10a"],
      }
    );
    const commandContext = context("account-full-backgrounds", campaign.id, "actor-full-backgrounds");
    const command = {
      kind: "character_create" as const,
      name: "Court Test",
      speciesKey: "open5e:species:5e-2014:srd-2014:srd_human",
      classKey: "open5e:class:5e-2014:srd-2014:srd_fighter",
      backgroundKey: "open5e:background:5e-2014:toh:toh_court-servant",
      alignmentKey: "open5e:alignment:5e-2014:srd-2014:neutral",
      skillKeys: [
        "open5e:skill:5e-2014:srd-2014:athletics",
        "open5e:skill:5e-2014:srd-2014:perception",
      ],
      languageKeys: [
        "open5e:language:5e-2014:core:dwarvish",
        "open5e:language:5e-2014:core:giant",
      ],
      toolProficiencies: ["artisan's tools"],
    };
    const created = resolveEngineCommand(campaign, commandContext, randomUUID(), command, "character_create");

    expect(created.accepted).toBe(true);
    expect(created.state.character.background).toBe("Court Servant");
    expect(created.state.character.currency).toEqual({ copper: 2_000 });
    expect(created.state.character.skills).toMatchObject({
      athletics: { proficient: true },
      history: { proficient: true },
      insight: { proficient: true },
      perception: { proficient: true },
    });
    expect(created.state.character.proficiencies.languages).toEqual(["Common", "Dwarvish", "Giant"]);
    expect(created.state.character.proficiencies.tools).toEqual(["artisan's tools"]);
  });

  it("rejects nonselectable parent species and duplicate fixed proficiencies without mutation", () => {
    const campaign = createInitialCampaign("account-invalid-s5", "actor-invalid-s5");
    const commandContext = context("account-invalid-s5", campaign.id, "actor-invalid-s5");
    const parentSpecies = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "character_create",
        name: "Stone",
        speciesKey: "open5e:species:5e-2014:srd-2014:srd_dwarf",
        classKey: "open5e:class:5e-2014:srd-2014:srd_fighter",
      },
      "character_create"
    );
    expect(parentSpecies).toMatchObject({ accepted: false, code: "species_not_selectable" });
    expect(parentSpecies.state.version).toBe(0);

    const duplicateSkill = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "character_create",
        name: "Echo",
        speciesKey: "open5e:species:5e-2014:srd-2014:srd_human",
        classKey: "open5e:class:5e-2014:srd-2014:srd_cleric",
        skillKeys: [
          "open5e:skill:5e-2014:srd-2014:insight",
          "open5e:skill:5e-2014:srd-2014:medicine",
        ],
      },
      "character_create"
    );
    expect(duplicateSkill).toMatchObject({ accepted: false, code: "duplicate_skill_choice" });
    expect(duplicateSkill.state.version).toBe(0);
    expect(duplicateSkill.state.character.created).toBe(false);
  });

  it("projects canonical copper into exact gold, silver, and copper denominations", () => {
    expect(currencyFromCopper(137)).toEqual({ totalCopper: 137, platinum: 0, gold: 1, electrum: 0, silver: 3, copper: 7 });
    expect(currencyFromCopper(500)).toEqual({ totalCopper: 500, platinum: 0, gold: 5, electrum: 0, silver: 0, copper: 0 });
  });

  it("supports a full Open5e-informed character sheet and concrete authored commerce", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Mnehmos", species: "dwarf", className: "fighter", background: "Soldier" },
      "character_create"
    );
    expect(created.state.character.background).toBe("Soldier");
    expect(created.state.character.proficiencies.armor).toContain("all armor");
    expect(created.state.character.skills.athletics?.bonus).toBeGreaterThan(0);
    expect(created.state.character.currency.copper).toBe(500);
    expect(created.state.character.inventory.some((item) => item.id === "chain-mail")).toBe(true);

    const contextCommand = {
      kind: "world_context" as const,
      title: "The Market of Three Bells",
      description: "A living bazaar where every deal has a witness.",
      features: ["jade stall", "tea cart"],
      exits: [],
      npcs: { upsert: [{ id: "narin", name: "Narin", description: "A cautious trader.", disposition: "neutral" as const, goals: ["turn a profit"], memories: [] }] },
      merchants: { upsert: [{
        id: "narin-market",
        name: "Narin's stall",
        description: "Portable goods arranged on blue cloth.",
        disposition: "neutral" as const,
        items: [{
          item: { id: "carved-jade", name: "Carved Jade", kind: "treasure" as const, quantity: 1, weight: 1, valueCopper: 100, description: "A polished jade ornament.", properties: [] },
          stock: 2,
          buyPriceCopper: 150,
          sellPriceCopper: 75,
        }],
      }] },
    };
    const established = resolveEngineCommand(created.state, commandContext, randomUUID(), contextCommand, "world_context");
    const purchase = resolveEngineCommand(
      established.state,
      commandContext,
      randomUUID(),
      { kind: "merchant_trade", merchantId: "narin-market", itemId: "carved-jade", side: "offer", quantity: 1, offerUnitPriceCopper: 100 },
      "merchant_trade"
    );
    expect(purchase.accepted).toBe(true);
    expect(purchase.state.character.currency.copper).toBe(400);
    expect(purchase.state.character.inventory.find((item) => item.id === "carved-jade")?.quantity).toBe(1);
    expect(purchase.message).toContain("offer accepted");
  });

  it("stores S2 equipment by immutable reference and resolves an atomic buy, equip, AC, unequip, and sell path", () => {
    const campaign = createInitialCampaign("account-s2", "actor-s2");
    const commandContext = context("account-s2", campaign.id, "actor-s2");
    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Aster", species: "human", className: "fighter" },
      "character_create"
    );
    expect(created.state.character.ac).toBe(18);
    const persistedInventory = JSON.stringify(created.state.character.inventory);
    expect(persistedInventory).toContain("open5e:item:5e-2014:srd-2014:srd_chain-mail");
    expect(persistedInventory).toContain("fbd846cf7b7833560b22f4ebffaf950fb6b2adf62cf9c6fff469266325ac31fa");
    expect(persistedInventory).not.toContain('"name"');
    expect(persistedInventory).not.toContain('"weight"');
    expect(persistedInventory).not.toContain('"valueCopper"');
    const sheet = toSessionView(created.state).character;
    expect(sheet.inventory.find((item) => item.id === "chain-mail")).toMatchObject({
      name: "Chain mail",
      weight: 55,
      valueCopper: 7_500,
      definitionSource: "open5e",
      armorProfile: { base: 16, addDexterityModifier: false },
    });
    expect(created.event?.contentKeys).toEqual(expect.arrayContaining([
      "open5e:item:5e-2014:srd-2014:srd_chain-mail",
      "open5e:item:5e-2014:srd-2014:srd_shield",
    ]));

    const market = resolveEngineCommand(
      created.state,
      commandContext,
      randomUUID(),
      {
        kind: "world_context",
        title: "The armorer's yard",
        description: "Finished armor hangs beneath a striped awning.",
        features: ["armor racks"],
        exits: [],
        merchants: { upsert: [{
          id: "armorer",
          name: "The Armorer",
          description: "A practical smith.",
          disposition: "neutral",
          items: [{
            item: {
              id: "market-plate",
              contentKey: "open5e:item:5e-2014:srd-2014:srd_plate-armor",
              quantity: 1,
            },
            stock: 1,
            buyPriceCopper: 500,
            sellPriceCopper: 500,
          }],
        }] },
      },
      "world_context"
    );
    expect(JSON.stringify(market.state.worldContext)).not.toContain('"name":"Plate Armor"');

    const purchase = resolveEngineCommand(
      market.state,
      commandContext,
      randomUUID(),
      { kind: "merchant_trade", merchantId: "armorer", itemId: "market-plate", side: "buy", quantity: 1 },
      "merchant_trade"
    );
    expect(purchase.accepted).toBe(true);
    expect(purchase.state.version).toBe(market.state.version + 1);
    expect(purchase.state.character.currency.copper).toBe(0);
    expect(purchase.event?.contentKeys).toContain("open5e:item:5e-2014:srd-2014:srd_plate-armor");

    const equipped = resolveEngineCommand(
      purchase.state,
      commandContext,
      randomUUID(),
      { kind: "equip_item", itemId: "market-plate", slot: "armor" },
      "equip_item"
    );
    expect(equipped.accepted).toBe(true);
    expect(equipped.state.version).toBe(purchase.state.version + 1);
    expect(equipped.state.character.ac).toBe(20);
    expect(equipped.event?.contentKeys).toContain("open5e:item:5e-2014:srd-2014:srd_plate-armor");

    const unequipped = resolveEngineCommand(
      equipped.state,
      commandContext,
      randomUUID(),
      { kind: "unequip_item", itemId: "market-plate" },
      "unequip_item"
    );
    const sold = resolveEngineCommand(
      unequipped.state,
      commandContext,
      randomUUID(),
      { kind: "merchant_trade", merchantId: "armorer", itemId: "market-plate", side: "sell", quantity: 1 },
      "merchant_trade"
    );
    expect(sold.accepted).toBe(true);
    expect(sold.state.version).toBe(unequipped.state.version + 1);
    expect(sold.state.character.currency.copper).toBe(500);
    expect(sold.state.character.inventory.some((item) => item.id === "market-plate")).toBe(false);
  });

  it("learns and casts a compiled cantrip from pinned S5 spell content", () => {
    const campaign = createInitialCampaign("account-spell", "actor-spell");
    const commandContext = context("account-spell", campaign.id, "actor-spell");
    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Meridian", species: "human", className: "wizard" },
      "character_create"
    );
    expect(created.state.character.spellcasting).toMatchObject({
      ability: "int",
      slots: { "1": 2 },
      slotMaximums: { "1": 2 },
      slotRecovery: "long-rest",
    });
    const fireBoltKey = "open5e:spell:5e-2014:srd-2014:srd_fire-bolt";
    const learned = resolveEngineCommand(
      created.state,
      commandContext,
      randomUUID(),
      { kind: "learn_spell", spellKey: fireBoltKey },
      "learn_spell"
    );
    expect(learned.accepted).toBe(true);
    expect(learned.state.character.spellcasting?.knownSpells).toEqual([
      { contentKey: fireBoltKey, packHash: "fbd846cf7b7833560b22f4ebffaf950fb6b2adf62cf9c6fff469266325ac31fa" },
    ]);
    expect(JSON.stringify(learned.state.character.spellcasting)).not.toContain("Fire Bolt");

    const started = resolveEngineCommand(
      learned.state,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "goblin-yard",
        encounterName: "Goblin Yard",
        creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
      },
      "combat_start"
    );
    const targetId = started.state.combat.enemies[0]?.id;
    expect(targetId).toBeTruthy();
    const slotsBefore = { ...started.state.character.spellcasting?.slots };
    const cast = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "cast_spell", spellKey: fireBoltKey, targetIds: [targetId as string] },
      "cast_spell"
    );

    expect(cast.accepted).toBe(true);
    expect(cast.state.character.spellcasting?.slots).toEqual(slotsBefore);
    expect(cast.state.combat.turnBudget.action.spent).toBe(true);
    expect(cast.event?.contentKeys).toContain(fireBoltKey);
    expect(cast.data).toMatchObject({ slotLevel: null, deferredProseEffects: true });
  });

  it("rejects an uncompiled spell without consuming its slot, action, target HP, or campaign version", () => {
    const campaign = createInitialCampaign("account-tier", "actor-tier");
    const commandContext = context("account-tier", campaign.id, "actor-tier");
    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Cipher", species: "elf", className: "wizard" },
      "character_create"
    );
    const magicMissileKey = "open5e:spell:5e-2014:srd-2014:srd_magic-missile";
    const learned = resolveEngineCommand(created.state, commandContext, randomUUID(), { kind: "learn_spell", spellKey: magicMissileKey }, "learn_spell");
    const prepared = resolveEngineCommand(learned.state, commandContext, randomUUID(), { kind: "prepare_spell", spellKey: magicMissileKey, prepared: true }, "prepare_spell");
    const started = resolveEngineCommand(
      prepared.state,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "tier-goblin",
        encounterName: "Tier Goblin",
        creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
      },
      "combat_start"
    );
    const before = JSON.stringify(started.state);
    const rejected = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "cast_spell", spellKey: magicMissileKey, targetIds: [started.state.combat.enemies[0]!.id] },
      "cast_spell"
    );

    expect(rejected).toMatchObject({ accepted: false, code: "content_tier_insufficient", event: null });
    expect(JSON.stringify(rejected.state)).toBe(before);
  });

  it("uses persisted encounter distance and area geometry for spell range and affected targets", () => {
    const campaign = createInitialCampaign("account-area", "actor-area");
    const commandContext = context("account-area", campaign.id, "actor-area");
    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Vector", species: "human", className: "wizard" },
      "character_create"
    );
    const burningHandsKey = "open5e:spell:5e-2014:srd-2014:srd_burning-hands";
    const learned = resolveEngineCommand(created.state, commandContext, randomUUID(), { kind: "learn_spell", spellKey: burningHandsKey }, "learn_spell");
    const prepared = resolveEngineCommand(learned.state, commandContext, randomUUID(), { kind: "prepare_spell", spellKey: burningHandsKey, prepared: true }, "prepare_spell");
    const started = resolveEngineCommand(
      prepared.state,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "close-cone",
        encounterName: "Close Cone",
        creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 2, distanceFeet: 10 }],
      },
      "combat_start"
    );
    const targetIds = started.state.combat.enemies.map((enemy) => enemy.id);
    expect(started.state.combat.enemies.every((enemy) => enemy.distanceFeet === 10)).toBe(true);

    const distant = JSON.parse(JSON.stringify(started.state)) as typeof started.state;
    for (const enemy of distant.combat.enemies) enemy.position = { ...enemy.position, x: distant.combat.tactical.actorPosition.x + 4 };
    const distantBefore = JSON.stringify(distant);
    const rejected = resolveEngineCommand(
      distant,
      commandContext,
      randomUUID(),
      { kind: "cast_spell", spellKey: burningHandsKey, targetIds },
      "cast_spell"
    );
    expect(rejected).toMatchObject({ accepted: false, code: "spell_target_out_of_range" });
    expect(JSON.stringify(rejected.state)).toBe(distantBefore);

    const cast = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "cast_spell", spellKey: burningHandsKey, targetIds },
      "cast_spell"
    );
    expect(cast.accepted).toBe(true);
    expect(cast.state.character.spellcasting?.slots["1"]).toBe(1);
    expect(cast.data).toMatchObject({
      range: { source: { text: "Self", distance: 0, unit: "feet" }, executableFeet: 15 },
      targetResults: [{ targetId: targetIds[0] }, { targetId: targetIds[1] }],
    });
  });

  it("rejects prose-only upcasting, then atomically resolves concentration and long-rest recovery", () => {
    const campaign = createInitialCampaign("account-upcast", "actor-upcast");
    const commandContext = context("account-upcast", campaign.id, "actor-upcast");
    const created = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      { kind: "character_create", name: "Axiom", species: "human", className: "wizard" },
      "character_create"
    );
    const leveled = JSON.parse(JSON.stringify(created.state)) as typeof created.state;
    leveled.character.level = 9;
    const normalized = normalizeCampaignState(leveled);
    const wallKey = "open5e:spell:5e-2014:srd-2014:srd_wall-of-fire";
    const learned = resolveEngineCommand(normalized, commandContext, randomUUID(), { kind: "learn_spell", spellKey: wallKey }, "learn_spell");
    const prepared = resolveEngineCommand(learned.state, commandContext, randomUUID(), { kind: "prepare_spell", spellKey: wallKey, prepared: true }, "prepare_spell");
    const started = resolveEngineCommand(
      prepared.state,
      commandContext,
      randomUUID(),
      {
        kind: "combat_start",
        encounterId: "troll-bridge",
        encounterName: "Troll Bridge",
        creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_troll", count: 1 }],
      },
      "combat_start"
    );
    const targetId = started.state.combat.enemies[0]!.id;
    const beforeUpcast = JSON.stringify(started.state);
    const rejectedUpcast = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "cast_spell", spellKey: wallKey, slotLevel: 5, targetIds: [targetId] },
      "cast_spell"
    );
    expect(rejectedUpcast).toMatchObject({ accepted: false, code: "content_tier_insufficient" });
    expect(JSON.stringify(rejectedUpcast.state)).toBe(beforeUpcast);

    const cast = resolveEngineCommand(
      started.state,
      commandContext,
      randomUUID(),
      { kind: "cast_spell", spellKey: wallKey, slotLevel: 4, targetIds: [targetId] },
      "cast_spell"
    );
    expect(cast.accepted).toBe(true);
    expect(cast.state.character.spellcasting?.slots["4"]).toBe((started.state.character.spellcasting?.slots["4"] ?? 0) - 1);
    expect(cast.state.character.spellcasting?.concentration).toMatchObject({ contentKey: wallKey, startedRound: 1 });

    const restedState = JSON.parse(JSON.stringify(cast.state)) as typeof cast.state;
    restedState.combat.status = "ended";
    restedState.combat.activeActorId = null;
    const rested = resolveEngineCommand(restedState, commandContext, randomUUID(), { kind: "rest", restType: "long" }, "rest");
    expect(rested.accepted).toBe(true);
    expect(rested.state.character.spellcasting?.slots).toEqual(rested.state.character.spellcasting?.slotMaximums);
    expect(rested.state.character.spellcasting?.concentration).toBeNull();
  });

  it("gives the DM concrete quest, social, beat, and improv primitives", () => {
    const campaign = createInitialCampaign("account-a", "actor-a");
    const commandContext = context("account-a", campaign.id, "actor-a");
    const world = resolveEngineCommand(
      campaign,
      commandContext,
      randomUUID(),
      {
        kind: "world_context",
        title: "A crossroads",
        description: "Three roads meet under a watchful hawk.",
        features: ["old milestone"],
        exits: [],
        npcs: { upsert: [{ id: "guide", name: "The Guide", description: "A patient traveler.", disposition: "friendly", goals: ["find the lost caravan"], memories: [] }] },
      },
      "world_context"
    );
    const social = resolveEngineCommand(world.state, commandContext, randomUUID(), { kind: "social_check", npcId: "guide", ability: "cha", goal: "Ask for directions." }, "social_check");
    expect(social.event?.tool).toBe("social_check");
    const quest = resolveEngineCommand(social.state, commandContext, randomUUID(), { kind: "quest_create", title: "Find the caravan", objective: "Locate the missing wagons.", rewardXp: 100, rewardCopper: 2_000, giverNpcId: "guide" }, "quest_create");
    expect(quest.state.quests.some((entry) => entry.title === "Find the caravan")).toBe(true);
    const beat = resolveEngineCommand(quest.state, commandContext, randomUUID(), { kind: "campaign_beat", title: "Distant horns", description: "Horns answer from the northern road.", pressure: "The caravan is moving now.", choices: ["Follow the horns", "Question the guide"] }, "campaign_beat");
    expect(beat.state.currentBeat?.choices).toHaveLength(2);
    const improv = resolveEngineCommand(beat.state, commandContext, randomUUID(), { kind: "improvise", title: "Kick the milestone", description: "The stone pivots and reveals a narrow trail.", effectType: "fictional" }, "improvise");
    expect(improv.accepted).toBe(true);
    expect(improv.state.improvEffects.at(-1)?.title).toBe("Kick the milestone");
  });
});
