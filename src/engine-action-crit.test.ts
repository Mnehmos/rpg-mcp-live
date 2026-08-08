import { vi, describe, expect, it } from "vitest";

const fixedRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => max - 1));
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomInt: fixedRandomInt,
}));

import { randomUUID } from "node:crypto";
import { createInitialCampaign, resolveEngineCommand } from "./engine-domain.js";
import type { RequestContext } from "./engine-contracts.js";

function run() {
  let state = createInitialCampaign("crit-account", "crit-actor");
  const context: RequestContext = {
    requestId: randomUUID(), accountId: state.accountId, campaignId: state.id, actorId: state.actorId, capabilities: ["player", "dm"],
  };
  state = resolveEngineCommand(state, context, randomUUID(), { kind: "character_create", name: "Crit Fighter", species: "human", className: "fighter" }, "character_create").state;
  state = resolveEngineCommand(state, context, randomUUID(), { kind: "tutorial_advance" }, "tutorial_advance").state;
  state = resolveEngineCommand(state, context, randomUUID(), { kind: "tutorial_advance" }, "tutorial_advance").state;
  return resolveEngineCommand(state, context, randomUUID(), {
    kind: "combat_start", encounterId: "crit-encounter", encounterName: "Critical Test",
    creatures: [{ creatureKey: "open5e:creature:5e-2014:srd-2014:srd_goblin", count: 1 }],
  }, "combat_start");
}

describe("weapon critical derivation", () => {
  it("doubles the weapon dice count, not one die's face value", () => {
    const started = run();
    const targetId = started.state.combat.enemies[0]!.id;
    const attack = resolveEngineCommand(started.state, {
      requestId: randomUUID(), accountId: started.state.accountId, campaignId: started.state.id, actorId: started.state.actorId, capabilities: ["player", "dm"],
    }, randomUUID(), { kind: "combat_action", action: "attack", targetId }, "combat_action");
    expect(attack.accepted).toBe(true);
    expect(attack.event?.rolls.find((roll) => roll.kind === "attack_d20")?.value).toBe(20);
    expect(attack.event?.rolls.filter((roll) => roll.kind === "damage_1d8")).toHaveLength(2);
  });
});
