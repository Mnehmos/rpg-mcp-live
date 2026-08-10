import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { compileAtomicTurnResolution } from "./engine-turn-plan.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { LanternEngineStore, EngineVersionConflictError } from "./engine-store.js";
import { commandForTool, parseToolArguments } from "./engine-tools.js";
import { materializeInventoryItem } from "./open5e-rules.js";
import { ruinedGatehouseWorldContextCommand } from "./world-object-fixture.js";

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function apply(state: LanternCampaignState, raw: unknown, tool: "character_create" | "world_context" | "interact") {
  const command = engineCommandSchema.parse(raw);
  return resolveEngineCommand(state, context(state), randomUUID(), command, tool);
}

function seededState(): LanternCampaignState {
  const initial = createInitialCampaign("account-world-objects", "actor-world-objects");
  const created = apply(initial, {
    kind: "character_create",
    name: "Object Tester",
    species: "human",
    className: "fighter",
    background: "Acolyte",
    alignment: "Neutral",
  }, "character_create");
  if (!created.accepted) throw new Error("character fixture failed");
  const world = apply(created.state, ruinedGatehouseWorldContextCommand(), "world_context");
  if (!world.accepted) throw new Error(`world fixture failed: ${world.code}`);
  return world.state;
}

function interaction(
  state: LanternCampaignState,
  targetId: string,
  affordance: NonNullable<Extract<EngineCommand, { kind: "interact" }>["affordance"]>,
  extra: Record<string, unknown> = {},
) {
  const command = engineCommandSchema.parse({
    kind: "interact",
    targetId,
    affordance,
    goal: affordance + " " + targetId,
    ...extra,
  });
  return resolveEngineCommand(state, context(state), randomUUID(), command, "interact");
}

describe("systemic world-object affordances", () => {
  it("exposes eight stable gatehouse instances through the typed world_context contract", () => {
    const state = seededState();
    const objects = state.worldContext?.objects ?? [];
    expect(objects).toHaveLength(8);
    expect(objects.map((object) => object.id)).toEqual([
      "gatehouse-door",
      "gatehouse-crate",
      "gatehouse-weapon",
      "gatehouse-rope",
      "gatehouse-oil",
      "gatehouse-fire",
      "gatehouse-lever",
      "gatehouse-clue",
    ]);
    expect(objects.every((object) => object.sceneId === state.worldContext?.id)).toBe(true);
    expect(objects.every((object) => object.revision === 1 && object.provenance.sourceVersion === 2)).toBe(true);
    expect(state.worldContext?.objects.find((object) => object.id === "gatehouse-clue")?.definition.criticalPolicy).toMatchObject({
      kind: "recoverable_route",
      recoveryRef: "gatehouse-inscription",
    });
    const parsed = parseToolArguments("interact", {
      targetId: "gatehouse-door",
      goal: "Unlock the door.",
      affordance: "unlock",
    });
    expect(commandForTool("interact", parsed)).toEqual({
      kind: "interact",
      targetId: "gatehouse-door",
      goal: "Unlock the door.",
      affordance: "unlock",
    });
  });

  it("keeps direct exploration and atomic turn-plan affordances on one resolver", () => {
    const directState = seededState();
    const direct = interaction(directState, "gatehouse-door", "unlock");
    expect(direct.accepted).toBe(true);
    expect(direct.state.worldContext?.objects.find((object) => object.id === "gatehouse-door")?.state).toBe("unlocked");

    const planState = seededState();
    const command = engineCommandSchema.parse({
      kind: "interact",
      targetId: "gatehouse-door",
      affordance: "unlock",
      goal: "Unlock the gatehouse door during the combat plan.",
    });
    const staged = resolveEngineCommand(planState, context(planState), "turn-plan:0", command, "interact");
    expect(staged.accepted).toBe(true);
    const plan = compileAtomicTurnResolution(planState, context(planState), randomUUID(), [{
      tool: "interact",
      command,
      resolution: staged,
    }]);
    expect(plan.accepted).toBe(true);
    expect(plan.event?.tool).toBe("turn_plan");
    expect(plan.state.worldContext?.objects.find((object) => object.id === "gatehouse-door")?.state).toBe("unlocked");
    expect(plan.event?.effects?.[0]?.stateChanges[0]?.path).toBe("/worldContext/objects/gatehouse-door");
  });

  it("derives material, state, ownership, and critical-policy rejection without mutation", () => {
    const cases = [
      { target: "gatehouse-oil", affordance: "ignite" as const, code: "fire_source_required" },
      { target: "gatehouse-lever", affordance: "attach" as const, code: "wrong_material", extra: { sourceId: "gatehouse-weapon" } },
      { target: "gatehouse-clue", affordance: "break" as const, code: "critical_object_protected" },
      { target: "gatehouse-crate", affordance: "drop" as const, code: "ownership_required", extra: { destinationId: "gatehouse-threshold" } },
    ];
    for (const testCase of cases) {
      const state = seededState();
      const before = JSON.stringify(state);
      const result = interaction(state, testCase.target, testCase.affordance, testCase.extra);
      expect(result.accepted, testCase.target).toBe(false);
      expect(result.code, testCase.target).toBe(testCase.code);
      expect(JSON.stringify(result.state), testCase.target).toBe(before);
      expect(result.state.version, testCase.target).toBe(state.version);
      expect(result.event, testCase.target).toBeNull();
    }
    const initial = createInitialCampaign("account-world-object-invalid", "actor-world-object-invalid");
    const invalidFixture = ruinedGatehouseWorldContextCommand();
    const invalidUpsert = invalidFixture.objects?.upsert;
    if (!invalidUpsert?.[0]) throw new Error("world fixture must contain objects");
    invalidUpsert[0] = { ...invalidUpsert[0], state: "destroyed" };
    const initialBefore = JSON.stringify(initial);
    const invalidSeed = apply(initial, invalidFixture, "world_context");
    expect(invalidSeed.accepted).toBe(false);
    expect(invalidSeed.code).toBe("object_state_not_authorable");
    expect(JSON.stringify(invalidSeed.state)).toBe(initialBefore);
  });

  it("commits deterministic transitions and preserves early clue acquisition", () => {
    let state = seededState();
    const unlocked = interaction(state, "gatehouse-door", "unlock");
    expect(unlocked.accepted).toBe(true);
    state = unlocked.state;
    const opened = interaction(state, "gatehouse-door", "open");
    expect(opened.accepted).toBe(true);
    state = opened.state;
    const activated = interaction(state, "gatehouse-lever", "activate");
    expect(activated.accepted).toBe(true);
    expect(activated.state.worldContext?.objects.find((object) => object.id === "gatehouse-lever")?.state).toBe("active");
    expect(activated.state.worldContext?.objects.find((object) => object.id === "gatehouse-door")?.state).toBe("open");

    const ignited = interaction(activated.state, "gatehouse-oil", "ignite", { sourceId: "gatehouse-fire" });
    expect(ignited.accepted).toBe(true);
    expect(ignited.state.worldContext?.objects.find((object) => object.id === "gatehouse-oil")?.state).toBe("lit");
    const attached = interaction(ignited.state, "gatehouse-lever", "attach", { sourceId: "gatehouse-rope" });
    expect(attached.accepted).toBe(true);
    expect(attached.state.worldContext?.objects.find((object) => object.id === "gatehouse-rope")?.state).toBe("attached");
    expect(attached.state.worldContext?.objects.find((object) => object.id === "gatehouse-lever")?.state).toBe("attached");
    expect(attached.event?.stateChanges).toHaveLength(2);

    const taken = interaction(attached.state, "gatehouse-clue", "take");
    expect(taken.accepted).toBe(true);
    const clue = taken.state.worldContext?.objects.find((object) => object.id === "gatehouse-clue");
    expect(clue).toMatchObject({ state: "carried", ownerRef: { kind: "actor", id: taken.state.actorId }, locationRef: null });
    const carriedClue = taken.state.character.inventory.find((item) => item.id === "gatehouse-clue");
    expect(carriedClue).toMatchObject({
      id: "gatehouse-clue",
      quantity: 1,
      ownerRef: { kind: "actor", id: taken.state.character.id },
      provenance: { kind: "authored", sourceId: "fixture:ruined-gatehouse:important-clue" },
      authoredDefinition: { name: "Important gatehouse clue", kind: "misc" },
    });
    expect(carriedClue ? materializeInventoryItem(carriedClue) : null).toMatchObject({
      id: "gatehouse-clue",
      name: "Important gatehouse clue",
      definitionSource: "authored",
    });
    const stalePersisted = JSON.parse(JSON.stringify(taken.state)) as LanternCampaignState;
    stalePersisted.character.inventory = [];
    const refreshed = normalizeCampaignState(stalePersisted);
    expect(refreshed.character.inventory.some((item) => item.id === "gatehouse-clue")).toBe(true);
    const dropped = interaction(taken.state, "gatehouse-clue", "drop", { destinationId: "gatehouse-threshold" });
    expect(dropped.accepted).toBe(true);
    expect(dropped.state.worldContext?.objects.find((object) => object.id === "gatehouse-clue")).toMatchObject({
      state: "intact",
      ownerRef: { kind: "world", id: dropped.state.worldContext?.id },
      locationRef: "gatehouse-threshold",
    });
    expect(dropped.state.character.inventory.some((item) => item.id === "gatehouse-clue")).toBe(false);

    const lossCommand = {
      ...ruinedGatehouseWorldContextCommand(),
      objects: { remove: ["gatehouse-clue"] },
    };
    const lost = apply(dropped.state, lossCommand, "world_context");
    expect(lost.accepted).toBe(true);
    expect(lost.state.worldContext?.objects.some((object) => object.id === "gatehouse-clue")).toBe(false);
    expect(lost.event?.stateChanges.some((change) => change.path === "/worldContext/objects/gatehouse-clue" && change.after === null)).toBe(true);
    const protectedRemoval = apply(lost.state, { ...ruinedGatehouseWorldContextCommand(), objects: { remove: ["gatehouse-door"] } }, "world_context");
    expect(protectedRemoval.accepted).toBe(false);
    expect(protectedRemoval.code).toBe("critical_object_protected");
  });

  it("is exactly-once, stale-version safe, and restart-persistent", () => {
    const state = seededState();
    const directory = mkdtempSync(join(tmpdir(), "lantern-world-object-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    store.createCampaign({ requestId: randomUUID(), accountId: state.accountId, actorId: state.actorId, capabilities: ["player", "dm"] }, state);
    const request = context(state);
    const command = engineCommandSchema.parse({ kind: "interact", targetId: "gatehouse-door", affordance: "unlock", goal: "Unlock the door." });
    const clientCommandId = randomUUID();
    const execute = (expectedCampaignVersion: number, id = clientCommandId) => store.executeCommand({
      context: request,
      clientCommandId: id,
      expectedCampaignVersion,
      command,
      tool: "interact",
      resolve: (current) => resolveEngineCommand(current, request, id, command, "interact"),
    });
    const committed = execute(state.version);
    expect(committed.accepted).toBe(true);
    expect(committed.state.version).toBe(state.version + 1);
    const replay = execute(state.version);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(committed.event);
    expect(store.listCampaignEvents(request)).toHaveLength(1);
    const beforeStale = JSON.stringify(store.getCampaign(request));
    expect(() => execute(state.version, randomUUID())).toThrow(EngineVersionConflictError);
    expect(JSON.stringify(store.getCampaign(request))).toBe(beforeStale);
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const reloaded = reopened.getCampaign(request);
    expect(reloaded.worldContext?.objects.find((object) => object.id === "gatehouse-door")?.state).toBe("unlocked");
    expect(reloaded.worldContext?.objects.find((object) => object.id === "gatehouse-door")?.provenance.sourceCommandId).toBe(clientCommandId);
    const replayAfterRestart = reopened.executeCommand({
      context: request,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "interact",
      resolve: (current) => resolveEngineCommand(current, request, clientCommandId, command, "interact"),
    });
    expect(replayAfterRestart.replayed).toBe(true);
    expect(reopened.listCampaignEvents(request)).toHaveLength(1);
    reopened.close();
  });

  it("replays an acquired world object without duplicating its inventory record", () => {
    const state = seededState();
    const directory = mkdtempSync(join(tmpdir(), "lantern-world-object-inventory-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    const request = context(state);
    store.createCampaign(request, state);
    const command = engineCommandSchema.parse({
      kind: "interact",
      targetId: "gatehouse-clue",
      affordance: "take",
      goal: "Take the clue.",
    });
    const clientCommandId = randomUUID();
    const execute = (expectedCampaignVersion: number) => store.executeCommand({
      context: request,
      clientCommandId,
      expectedCampaignVersion,
      command,
      tool: "interact",
      resolve: (current) => resolveEngineCommand(current, request, clientCommandId, command, "interact"),
    });
    const committed = execute(state.version);
    expect(committed.accepted).toBe(true);
    expect(committed.state.character.inventory.filter((item) => item.id === "gatehouse-clue")).toHaveLength(1);
    const replay = execute(state.version);
    expect(replay.replayed).toBe(true);
    expect(replay.state.character.inventory.filter((item) => item.id === "gatehouse-clue")).toHaveLength(1);
    expect(store.listCampaignEvents(request)).toHaveLength(1);
    store.close();
  });

  it("keeps inspect read-only and retains legacy narration-only compatibility", () => {
    const state = seededState();
    const inspected = interaction(state, "gatehouse-door", "inspect");
    expect(inspected.accepted).toBe(true);
    expect(inspected.readOnly).toBe(true);
    expect(inspected.event).toBeNull();
    expect(inspected.state.version).toBe(state.version);
    expect(inspected.data).toMatchObject({ object: { id: "gatehouse-door", state: "locked" } });

    const legacyArgs = parseToolArguments("interact", { targetId: "feature", goal: "Describe the old feature." });
    const legacy = commandForTool("interact", legacyArgs);
    expect(legacy).toEqual({ kind: "interact", targetId: "feature", goal: "Describe the old feature." });
  });
});
