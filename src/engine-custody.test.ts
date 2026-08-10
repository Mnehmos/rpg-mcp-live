import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, command: EngineCommand) {
  return resolveEngineCommand(state, context(state), randomUUID(), command, command.kind);
}

function sandbox(): LanternCampaignState {
  const initial = createInitialCampaign("custody-account", "custody-player");
  const created = apply(initial, { kind: "character_create", name: "Mnehmos", species: "human", className: "fighter" });
  const tutorial = apply(created.state, { kind: "tutorial_advance" });
  const ready = apply(tutorial.state, { kind: "tutorial_advance" });
  expect(ready.accepted).toBe(true);
  return ready.state;
}

function establishGuards(state: LanternCampaignState): LanternCampaignState {
  const result = apply(state, {
    kind: "world_context",
    title: "The holding vault",
    description: "A guarded stone vault below the arena.",
    features: ["iron bars"],
    exits: [{ id: "vault-corridor", label: "The torchlit corridor" }],
    npcs: {
      upsert: [
        {
          id: "guard-patrol",
          name: "Patrol guard",
          description: "A guard with a ring of keys.",
          disposition: "hostile",
          goals: ["keep the vault secure"],
          memories: [],
          agency: {
            actorType: "guard",
            locationRef: "holding-vault",
            schedule: [],
            goals: [],
            resources: { inventory: [], copper: 0, actionPoints: 0 },
            maxHp: 10,
            hp: 10,
          },
        },
        {
          id: "titus",
          name: "Titus",
          description: "A nervous guard companion.",
          disposition: "neutral",
          goals: ["stay with Mnehmos"],
          memories: [],
          agency: {
            actorType: "traveler",
            locationRef: "holding-vault",
            schedule: [],
            goals: [],
            resources: { inventory: [], copper: 0, actionPoints: 1 },
            maxHp: 10,
            hp: 10,
          },
        },
      ],
    },
  });
  expect(result.accepted).toBe(true);
  return result.state;
}

describe("typed custody and restraint", () => {
  it("records surrender for every named actor, persists through reload, and restricts movement/combat but not speaking", () => {
    const state = establishGuards(sandbox());
    const surrendered = apply(state, {
      kind: "custody_action",
      action: "surrender",
      guardId: "guard-patrol",
      affectedActorIds: [state.actorId, "titus"],
    });

    expect(surrendered.accepted).toBe(true);
    expect(surrendered.state.character.custody).toMatchObject({
      actorId: state.actorId,
      status: "restrained",
      sourceGuardId: "guard-patrol",
      reason: "surrender",
      locationRef: state.worldContext!.id,
      releasePolicy: "guard-release-or-escape",
    });
    expect(surrendered.state.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody).toMatchObject({
      actorId: "titus",
      status: "under_guard",
      sourceGuardId: "guard-patrol",
    });

    const moved = apply(surrendered.state, { kind: "move", destinationId: "vault-corridor" });
    expect(moved.accepted).toBe(false);
    expect(moved.code).toBe("custody_restricted");
    const combat = apply(surrendered.state, {
      kind: "combat_start",
      encounterId: "custody-fight",
      encounterName: "Custody fight",
      creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
    });
    expect(combat.accepted).toBe(false);
    expect(combat.code).toBe("custody_restricted");
    const spoken = apply(surrendered.state, { kind: "declare", goal: "Answer the guard's questions." });
    expect(spoken.accepted).toBe(true);

    const reloaded = normalizeCampaignState(JSON.parse(JSON.stringify(surrendered.state)) as LanternCampaignState);
    expect(reloaded.character.custody).toEqual(surrendered.state.character.custody);
    expect(reloaded.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody)
      .toEqual(surrendered.state.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody);
    const view = toSessionView(reloaded);
    expect(view.character.custody).toEqual(reloaded.character.custody);
    expect(view.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody)
      .toEqual(reloaded.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody);
  });

  it("clears the whole custody group on release, and only the player on escape", () => {
    const state = establishGuards(sandbox());
    const surrendered = apply(state, {
      kind: "custody_action",
      action: "surrender",
      guardId: "guard-patrol",
      affectedActorIds: [state.actorId, "titus"],
    });
    const released = apply(surrendered.state, { kind: "custody_action", action: "release", guardId: "guard-patrol" });
    expect(released.accepted).toBe(true);
    expect(released.state.character.custody).toBeNull();
    expect(released.state.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody).toBeNull();

    const surrenderedAgain = apply(released.state, {
      kind: "custody_action",
      action: "surrender",
      guardId: "guard-patrol",
      affectedActorIds: [released.state.actorId, "titus"],
    });
    const escaped = apply(surrenderedAgain.state, { kind: "custody_action", action: "escape" });
    expect(escaped.accepted).toBe(true);
    expect(escaped.state.character.custody).toBeNull();
    expect(escaped.state.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody).toMatchObject({ status: "under_guard" });
    const beforeRepeat = JSON.parse(JSON.stringify(escaped.state));
    const repeat = apply(escaped.state, { kind: "custody_action", action: "escape" });
    expect(repeat.accepted).toBe(false);
    expect(repeat.code).toBe("custody_not_active");
    expect(repeat.state).toEqual(beforeRepeat);

    const releasedCompanion = apply(escaped.state, {
      kind: "custody_action",
      action: "release",
      guardId: "guard-patrol",
      affectedActorIds: ["titus"],
    });
    expect(releasedCompanion.accepted).toBe(true);
    expect(releasedCompanion.state.worldContext?.npcs.find((npc) => npc.id === "titus")?.custody).toBeNull();
    const repeatedCompanionRelease = apply(releasedCompanion.state, {
      kind: "custody_action",
      action: "release",
      guardId: "guard-patrol",
      affectedActorIds: ["titus"],
    });
    expect(repeatedCompanionRelease.accepted).toBe(false);
    expect(repeatedCompanionRelease.code).toBe("custody_release_target_invalid");
  });

  it("keeps captive NPC and controlled actors from taking engine actions", () => {
    const state = establishGuards(sandbox());
    const controlled = apply(state, { kind: "controlled_actor_create", profileId: "familiar-scout-v1" });
    expect(controlled.accepted).toBe(true);
    const controlledId = controlled.state.controlledActors[0]!.id;
    const surrendered = apply(controlled.state, {
      kind: "custody_action",
      action: "surrender",
      guardId: "guard-patrol",
      affectedActorIds: [controlled.state.actorId, "titus", controlledId],
    });
    expect(surrendered.accepted).toBe(true);

    const npcTick = apply(surrendered.state, {
      kind: "npc_tick",
      npcId: "titus",
      trigger: "operator_batch",
      triggerId: "custody-npc-tick",
      offerId: "no_op",
    });
    expect(npcTick.accepted).toBe(false);
    expect(npcTick.code).toBe("custody_restricted");

    const controlledCommand = apply(surrendered.state, {
      kind: "controlled_actor_command",
      actorId: controlledId,
      action: "guard",
    });
    expect(controlledCommand.accepted).toBe(false);
    expect(controlledCommand.code).toBe("custody_restricted");

    const escaped = apply(surrendered.state, { kind: "custody_action", action: "escape" });
    expect(escaped.accepted).toBe(true);
    expect(toSessionView(escaped.state).controlledActors.find((actor) => actor.id === controlledId)?.legalCommands.every((offer) => !offer.legal)).toBe(true);
    const stillCaptiveCommand = apply(escaped.state, {
      kind: "controlled_actor_command",
      actorId: controlledId,
      action: "guard",
    });
    expect(stillCaptiveCommand.accepted).toBe(false);
    expect(stillCaptiveCommand.code).toBe("custody_restricted");
  });
});
