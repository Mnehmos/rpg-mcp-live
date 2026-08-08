import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import { engineCommandSchema } from "./engine-contracts.js";

function context(campaignId: string) {
  return {
    requestId: randomUUID(),
    accountId: "progression-account",
    campaignId,
    actorId: "progression-actor",
    capabilities: ["player", "dm"],
  };
}

function resolve(state: ReturnType<typeof createInitialCampaign>, command: Parameters<typeof resolveEngineCommand>[3]) {
  const request = context(state.id);
  const commandId = randomUUID();
  return resolveEngineCommand(state, request, commandId, command, command.kind === "quest_update" ? "quest_update" : command.kind);
}

function createFighter() {
  const campaign = createInitialCampaign("progression-account", "progression-actor", randomUUID());
  return resolve(campaign, { kind: "character_create", name: "Rook", species: "human", className: "fighter" });
}

describe("progression kernel", () => {
  it("opens one server-owned pending advancement from a completed quest milestone", () => {
    const created = createFighter();
    const quest = resolve(created.state, {
      kind: "quest_create",
      title: "The milestone",
      objective: "Reach the old watchtower.",
      rewardXp: 300,
      rewardCopper: 10,
    });
    const completed = resolve(quest.state, {
      kind: "quest_update",
      questId: quest.state.quest.id,
      status: "completed",
    });

    expect(completed.accepted).toBe(true);
    expect(completed.state.character.level).toBe(1);
    expect(completed.state.character.xp).toBe(300);
    expect(completed.state.advancementPolicy).toMatchObject({ mode: "milestone", maxLevel: 2, hpPolicy: "fixed-average" });
    expect(completed.state.pendingAdvancement).toMatchObject({
      sourceKind: "quest-milestone",
      sourceId: quest.state.quest.id,
      fromLevel: 1,
      toLevel: 2,
      status: "pending",
      preview: { toLevel: 2 },
    });
    expect(completed.event?.stateChanges.some((change) => change.path === "/pendingAdvancement")).toBe(true);
  });

  it("confirms derived 1-to-2 state once and keeps it stable across restart", () => {
    const created = createFighter();
    const quest = resolve(created.state, {
      kind: "quest_create",
      title: "The milestone",
      objective: "Reach the old watchtower.",
      rewardXp: 300,
      rewardCopper: 10,
    });
    const completed = resolve(quest.state, { kind: "quest_update", questId: quest.state.quest.id, status: "completed" });
    const pending = completed.state.pendingAdvancement!;
    const confirmed = resolve(completed.state, { kind: "advancement_confirm", pendingId: pending.id });

    expect(confirmed.accepted).toBe(true);
    expect(confirmed.state.character.level).toBe(2);
    expect(confirmed.state.character.proficiencyBonus).toBe(2);
    expect(confirmed.state.character.hitDiceRemaining).toBe(2);
    expect(confirmed.state.character.maxHp).toBe(pending.preview.maxHpAfter);
    expect(confirmed.state.character.hp).toBe(pending.preview.currentHpAfter);
    expect(confirmed.state.pendingAdvancement).toMatchObject({ id: pending.id, status: "consumed" });

    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(confirmed.state)));
    expect(restarted.character.level).toBe(2);
    expect(restarted.character.maxHp).toBe(confirmed.state.character.maxHp);
    expect(restarted.character.proficiencyBonus).toBe(2);
    expect(restarted.pendingAdvancement).toMatchObject({ id: pending.id, status: "consumed" });

    const beforeRetry = JSON.stringify(confirmed.state);
    const duplicate = resolve(confirmed.state, { kind: "advancement_confirm", pendingId: pending.id });
    expect(duplicate).toMatchObject({ accepted: false, code: "advancement_consumed" });
    expect(JSON.stringify(duplicate.state)).toBe(beforeRetry);
  });

  it("rejects caller-authored progression consequences at the schema boundary", () => {
    expect(engineCommandSchema.safeParse({
      kind: "advancement_confirm",
      pendingId: "pending-1",
      targetLevel: 20,
      hpGain: 999,
      proficiencyBonus: 99,
    }).success).toBe(false);
    expect(engineCommandSchema.safeParse({ kind: "npc_advance", combatantId: "goblin-1", templateId: "other" }).success).toBe(false);
  });

  it("applies the veteran template to one encounter instance without changing static content", () => {
    const created = createFighter();
    const started = resolve(created.state, {
      kind: "combat_start",
      encounterId: "veteran-test",
      encounterName: "Veteran test",
      creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
    });
    const target = started.state.combat.enemies[0]!;
    const beforeView = (started.data as { combat?: { enemies?: unknown[] } }).combat;
    const advanced = resolve(started.state, { kind: "npc_advance", combatantId: target.id, templateId: "veteran" });

    expect(advanced.accepted).toBe(true);
    const progressed = advanced.state.combat.enemies[0]!;
    expect(progressed.progression).toMatchObject({ templateId: "veteran", templateVersion: "v1", modifications: { maxHp: 5, armorClass: 1, attackBonus: 1, damageBonus: 1 } });
    expect(progressed.contentKey).toBe(target.contentKey);
    expect(progressed.packHash).toBe(target.packHash);
    expect(beforeView).toBeDefined();

    const beforeRetry = JSON.stringify(advanced.state);
    const duplicate = resolve(advanced.state, { kind: "npc_advance", combatantId: target.id, templateId: "veteran" });
    expect(duplicate).toMatchObject({ accepted: false, code: "npc_progression_already_applied" });
    expect(JSON.stringify(duplicate.state)).toBe(beforeRetry);
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(advanced.state))).combat.enemies[0]?.progression).toEqual(progressed.progression);
  });
});
