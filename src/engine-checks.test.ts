import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number) => min));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import { createInitialCampaign, resolveEngineCommand } from "./engine-domain.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";

function contextFor(state: LanternCampaignState): RequestContext {
  return { requestId: randomUUID(), accountId: state.accountId, campaignId: state.id, actorId: state.actorId, capabilities: ["player", "dm"] };
}

function resolve(state: LanternCampaignState, raw: EngineCommand) {
  const context = contextFor(state);
  return resolveEngineCommand(state, context, randomUUID(), raw, raw.kind);
}

function addFriendlyHelper(state: LanternCampaignState): LanternCampaignState {
  const result = resolve(state, {
    kind: "world_context",
    title: "A quiet yard",
    description: "A trusted guide waits beside the door.",
    features: ["barred door"],
    exits: [],
    npcs: { upsert: [{ id: "guide", name: "Guide", description: "A willing guide.", disposition: "friendly", goals: ["help"], memories: [] }] },
  });
  return result.state;
}

describe("canonical check execution", () => {
  it("derives proficiency and expertise instead of trusting a persisted bonus", () => {
    deterministicRandomInt.mockClear().mockReturnValue(10);
    const state = createInitialCampaign("check-canonical", "actor-canonical");
    state.character.skills.athletics = { ...state.character.skills.athletics!, proficient: true, expertise: true, bonus: 99 };
    const result = resolve(state, { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Brace and push" });
    expect(result.accepted).toBe(true);
    expect(result.event?.check).toMatchObject({ skill: "athletics", proficiency: true, expertise: true, modifier: 6, formulaRevision: "checks-v1" });
  });

  it("accepts a legal helper as one advantage source and rejects an ineligible helper before RNG", () => {
    deterministicRandomInt.mockClear().mockReturnValue(1);
    const state = addFriendlyHelper(createInitialCampaign("check-helper", "actor-helper"));
    const assisted = resolve(state, { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Use the guide", helperId: "guide" });
    expect(assisted.accepted).toBe(true);
    expect(assisted.event?.check).toMatchObject({ helperId: "guide", mode: "advantage" });
    expect(assisted.event?.rolls).toHaveLength(2);
    const calls = deterministicRandomInt.mock.calls.length;
    const rejected = resolve(state, { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Use myself", helperId: "actor-helper" });
    expect(rejected).toMatchObject({ accepted: false, code: "helper_not_eligible" });
    expect(deterministicRandomInt.mock.calls.length).toBe(calls);
  });

  it("cancels opposing advantage and disadvantage and supports passive checks", () => {
    deterministicRandomInt.mockClear().mockReturnValue(10);
    const state = createInitialCampaign("check-modifiers", "actor-modifiers");
    const advantage = resolve(state, { kind: "improvise", title: "High ground", description: "A reviewed edge helps the check.", effectType: "advantage", checkCategory: "ability-check" });
    const disadvantage = resolve(advantage.state, { kind: "improvise", title: "Distracting noise", description: "A reviewed hindrance affects the check.", effectType: "disadvantage", checkCategory: "ability-check" });
    const result = resolve(disadvantage.state, { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Change the footing" });
    expect(result.event?.check?.mode).toBe("cancelled");
    expect(result.event?.rolls).toHaveLength(1);
    deterministicRandomInt.mockClear();
    const passive = resolve(createInitialCampaign("check-passive", "actor-passive"), { kind: "roll_check", ability: "wis", goal: "Notice a quiet sound", passive: true });
    expect(passive.accepted).toBe(true);
    expect(passive.event?.rolls).toEqual([{ kind: "passive_score", value: 10, sides: undefined }]);
    expect(deterministicRandomInt).not.toHaveBeenCalled();
  });

  it("compromises a repeated stealth pressure instead of allowing an endless fourth check", () => {
    deterministicRandomInt.mockClear().mockReturnValue(1);
    let state = createInitialCampaign("check-stealth-pressure", "actor-stealth-pressure");
    const goals = [
      "Slip through the passage toward the rear yard.",
      "Abandon the decoy and move toward the rear yard.",
      "Climb the side stair without being seen.",
    ];
    for (const goal of goals) {
      const result = resolve(state, { kind: "roll_check", ability: "dex", skill: "stealth", goal });
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state.failurePressures).toMatchObject([{ challengeId: "ability-check:stealth", failureCount: 3, status: "compromised" }]);
    const calls = deterministicRandomInt.mock.calls.length;
    const blocked = resolve(state, { kind: "roll_check", ability: "dex", skill: "stealth", goal: "Try the same passage from the other side." });
    expect(blocked).toMatchObject({ accepted: false, code: "challenge_pressure_compromised", state: { version: 3 } });
    expect(deterministicRandomInt.mock.calls.length).toBe(calls);
  });

  it("requires a tool proficiency and preserves full evidence for withheld checks", () => {
    deterministicRandomInt.mockClear().mockReturnValue(20);
    const state = createInitialCampaign("check-secret", "actor-secret");
    const invalid = resolve(state, { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Pick the lock", tool: "Thieves' Tools" });
    expect(invalid).toMatchObject({ accepted: false, code: "tool_proficiency_required" });
    state.character.proficiencies.tools = ["Thieves' Tools"];
    const result = resolve(state, { kind: "challenge_attempt", challengeId: "barred-door-v1", goal: "Force it", approach: "Pick the lock", tool: "Thieves' Tools", informationPolicy: "withheld" });
    expect(result.accepted).toBe(true);
    expect(result.message).toContain("withheld");
    expect(result.data).not.toHaveProperty("roll");
    expect(result.event?.check).toMatchObject({ informationPolicy: "withheld", tool: "Thieves' Tools" });
    expect(result.event?.rolls.length).toBeGreaterThan(0);
  });

  it("resolves a reviewed opposed challenge against a living combatant", () => {
    deterministicRandomInt.mockClear().mockReturnValue(10);
    const state = createInitialCampaign("check-opposed", "actor-opposed");
    const started = resolve(state, { kind: "combat_start", encounterId: "yard", encounterName: "A yard", creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }] });
    const opponentId = started.state.combat.enemies[0]!.id;
    const result = resolve(started.state, { kind: "challenge_attempt", challengeId: "stealth-perception-v1", goal: "Slip past", approach: "Move through the shadows", opponentId });
    expect(result.accepted).toBe(true);
    expect(result.event?.check).toMatchObject({ kind: "opposed-check", opponentId, opponentSkill: "perception", opponentTotal: expect.any(Number) });
    expect(result.event?.adjudication?.dcSource).toBe("opposed_actor");
  });

  it("keeps fictional improvise explicitly non-mechanical and rejects zero damage", () => {
    const state = createInitialCampaign("check-fiction", "actor-fiction");
    const fictional = resolve(state, { kind: "improvise", title: "A flourish", description: "The lantern glows brighter for a moment.", effectType: "fictional" });
    expect(fictional.accepted).toBe(true);
    expect(fictional.message).toContain("no mechanical effect");
    expect(fictional.data).toMatchObject({ mechanical: false });
    const damage = resolve(state, { kind: "improvise", title: "A weak spark", description: "It does no harm.", effectType: "damage", amount: 0 });
    expect(damage).toMatchObject({ accepted: false, code: "damage_amount_required" });
  });
});
