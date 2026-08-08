import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EngineCommand, EngineEffectInstance, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { applyEffect } from "./engine-effects.js";
import { createInitialCampaign, normalizeCampaignState, projectResolutionForActor, readToolData, resolveEngineCommand, toSessionView } from "./engine-domain.js";

const GOBLIN = "open5e:creature:5e-2014:srd-2014:srd_goblin";

function context(state: LanternCampaignState, actorId = state.actorId): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, command: EngineCommand, actorId = state.actorId) {
  return resolveEngineCommand(state, context(state, actorId), randomUUID(), command, command.kind);
}

function createdState(): LanternCampaignState {
  const state = createInitialCampaign("controlled-account", "controlled-actor");
  const result = apply(state, { kind: "character_create", name: "Controller", species: "human", className: "fighter" });
  if (!result.accepted) throw new Error(String(result.code));
  return result.state;
}

function combatState(): LanternCampaignState {
  const created = createdState();
  const familiar = apply(created, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
  if (!familiar.accepted) throw new Error(String(familiar.code));
  const started = apply(familiar.state, {
    kind: "combat_start",
    encounterId: "controlled-encounter",
    encounterName: "Controlled actors",
    creatures: [{ creatureKey: GOBLIN, count: 1 }],
  });
  if (!started.accepted) throw new Error(String(started.code));
  started.state.combat.enemies[0]!.hp = 100;
  started.state.combat.enemies[0]!.alive = true;
  started.state.combat.activeActorId = started.state.actorId;
  return started.state;
}

describe("controlled actors", () => {
  it("creates fixed familiar and summon profiles with independent relationships and projections", () => {
    const created = createdState();
    const familiarResult = apply(created, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
    expect(familiarResult.accepted).toBe(true);
    const familiar = familiarResult.state.controlledActors[0]!;
    expect(familiar).toMatchObject({
      profileId: "familiar-scout-v1",
      kind: "companion",
      ownerActorId: created.actorId,
      controllerActorId: created.actorId,
      summonerActorId: null,
      maxHp: 5,
      turnPolicy: "controller-turn",
      defaultBehavior: "guard",
      progressionPolicy: "none",
      lootPolicy: "none",
    });
    expect(familiar.attack).toEqual({ attackBonus: 4, damageDice: "1d4", damageBonus: 2, damageType: "piercing", rangeFeet: 5 });

    const summonResult = apply(familiarResult.state, { kind: "controlled_actor_create", profileId: "summon-scout-v1" });
    expect(summonResult.accepted).toBe(true);
    const summon = summonResult.state.controlledActors.find((actor) => actor.profileId === "summon-scout-v1")!;
    expect(summon).toMatchObject({ kind: "summon", maxHp: 8, summonerActorId: created.actorId, expiresAtMinutes: 60, sourceRef: `controlled-actor-source:${summon.id}` });
    expect(summon.inventory).not.toBe(familiar.inventory);
    expect(toSessionView(summonResult.state).controlledActors).toHaveLength(2);
    const publicView = toSessionView(summonResult.state).controlledActors[1] as unknown as Record<string, unknown>;
    expect(publicView).not.toHaveProperty("sourceRef");
    expect(publicView).not.toHaveProperty("ownerActorId");
    expect(publicView).not.toHaveProperty("summonerActorId");
    expect(readToolData(summonResult.state, "controlled_actor_context")).toMatchObject({ campaignVersion: summonResult.state.version });
    expect(JSON.stringify(projectResolutionForActor(summonResult, created.actorId).event)).not.toContain("sourceRef");
  });

  it("rejects duplicate creation and unauthorized commands without mutation", () => {
    const created = createdState();
    const first = apply(created, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
    const before = JSON.stringify(first.state);
    const duplicate = apply(first.state, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
    expect(duplicate).toMatchObject({ accepted: false, code: "controlled_actor_exists", event: null });
    expect(JSON.stringify(duplicate.state)).toBe(before);
    const unauthorized = apply(first.state, { kind: "controlled_actor_dismiss", actorId: first.state.controlledActors[0]!.id }, "other-actor");
    expect(unauthorized).toMatchObject({ accepted: false, code: "controlled_actor_unauthorized", event: null });
    expect(JSON.stringify(unauthorized.state)).toBe(before);
  });

  it("does not let an owner bypass a distinct controller and hides terminal command offers", () => {
    const created = createdState();
    const result = apply(created, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
    const actor = result.state.controlledActors[0]!;
    actor.controllerActorId = "different-controller";
    const before = JSON.stringify(result.state);
    const unauthorized = apply(result.state, { kind: "controlled_actor_command", actorId: actor.id, action: "guard" });
    expect(unauthorized).toMatchObject({ accepted: false, code: "controlled_actor_unauthorized", event: null });
    expect(JSON.stringify(unauthorized.state)).toBe(before);

    actor.status = "incapacitated";
    const view = toSessionView(result.state).controlledActors[0]!;
    expect(view.legalCommands.every((offer) => !offer.legal)).toBe(true);
  });

  it("uses controller Action/Bonus costs, performs fixed behavior, and falls back to guard once", () => {
    let state = combatState();
    const actorId = state.controlledActors[0]!.id;
    const targetId = state.combat.enemies[0]!.id;
    const attack = apply(state, { kind: "controlled_actor_command", actorId, action: "attack", targetId });
    expect(attack.accepted).toBe(true);
    expect(attack.state.combat.turnBudget.action).toEqual({ available: false, spent: true });
    expect(attack.state.controlledActors[0]!.turnBudget.action).toEqual({ available: false, spent: true });
    expect(attack.state.controlledActors[0]!.lastBehavior).toBe("attack");

    const follow = apply(attack.state, { kind: "controlled_actor_command", actorId, action: "follow" });
    expect(follow.accepted).toBe(true);
    expect(follow.state.combat.turnBudget.bonusAction).toEqual({ available: false, spent: true });
    expect(follow.state.controlledActors[0]!.lastBehavior).toBe("follow");

    state = combatState();
    const fallback = apply(state, { kind: "end_turn" });
    expect(fallback.accepted).toBe(true);
    expect(fallback.state.controlledActors[0]!.lastBehavior).toBe("guard");
    expect(fallback.state.controlledActors[0]!.commandedThisTurn).toBe(true);
    expect(fallback.event?.stateChanges.some((change) => change.path.includes("controlledActors"))).toBe(true);
  });

  it("keeps actor effects independent and dismisses source-linked effects exactly once", () => {
    const created = createdState();
    const result = apply(created, { kind: "controlled_actor_create", profileId: "summon-scout-v1" });
    const actor = result.state.controlledActors[0]!;
    const effect: EngineEffectInstance = {
      id: "controlled-effect",
      definitionKey: "controlled-test",
      sourceRef: actor.sourceRef!,
      targetRefs: [actor.id],
      operations: [{ kind: "condition", condition: "guarded", action: "apply" }],
      startAnchor: { kind: "campaign-round", round: 0 },
      duration: { kind: "source-lifetime" },
      stackingKey: "controlled-test",
      stackingRule: "ignore",
      clearedBy: ["source-removal"],
      status: "active",
      provenance: { sourceContentKey: null, sourceCommandId: null, rulesVersion: result.state.rulesVersion, formulaRevision: "test" },
    };
    result.state.effects = applyEffect(result.state.effects, effect).effects;
    const dismissed = apply(result.state, { kind: "controlled_actor_dismiss", actorId: actor.id });
    expect(dismissed.accepted).toBe(true);
    expect(dismissed.state.controlledActors[0]!.status).toBe("dismissed");
    expect(dismissed.state.effects.find((candidate) => candidate.id === effect.id)?.status).toBe("removed");
    const replay = apply(dismissed.state, { kind: "controlled_actor_dismiss", actorId: actor.id });
    expect(replay).toMatchObject({ accepted: false, code: "controlled_actor_terminal", event: null });
  });

  it("expires summons at the persisted duration and preserves terminal state across restart", () => {
    const created = createdState();
    const result = apply(created, { kind: "controlled_actor_create", profileId: "summon-scout-v1" });
    const actorId = result.state.controlledActors[0]!.id;
    const rested = apply(result.state, { kind: "rest", restType: "short" });
    expect(rested.accepted).toBe(true);
    expect(rested.state.controlledActors.find((actor) => actor.id === actorId)?.status).toBe("expired");
    expect(rested.event?.stateChanges.some((change) => change.path === "/controlledActors")).toBe(true);
    const restarted = normalizeCampaignState(JSON.parse(JSON.stringify(rested.state)) as LanternCampaignState);
    expect(restarted.controlledActors).toEqual(rested.state.controlledActors);

    const deathCandidate = apply(created, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" }).state;
    deathCandidate.controlledActors[0]!.hp = 0;
    const normalized = normalizeCampaignState(JSON.parse(JSON.stringify(deathCandidate)) as LanternCampaignState);
    expect(normalized.controlledActors[0]!.status).toBe("dead");
    expect(normalizeCampaignState(JSON.parse(JSON.stringify(normalized)) as LanternCampaignState).controlledActors).toEqual(normalized.controlledActors);
  });
});
