import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  normalizeCampaignState,
  projectResolutionForActor,
  projectStateForActor,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";
import {
  engineCommandSchema,
  type EngineCommand,
  type RequestContext,
} from "./engine-contracts.js";

function context(campaignId: string): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: "account-131",
    campaignId,
    actorId: "actor-131",
    capabilities: ["player", "dm"],
  };
}

function itemProposal() {
  return {
    kind: "item" as const,
    key: "bronze-key",
    name: "Bronze key",
    description: "A plain key with no assigned mechanics.",
    tags: ["mundane"],
    category: "tool" as const,
    material: "bronze",
    weight: 0.1,
    affordances: ["inspect", "take"] as const,
  };
}

function locationProposal(key: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "location" as const,
    key,
    name: key.replaceAll("-", " "),
    description: `The canonical ${key} location.`,
    tags: [],
    locationKind: "room" as const,
    exits: [],
    ...extra,
  };
}

describe("runtime content engine boundary", () => {
  it("commits typed definitions, instances, and state-change evidence", () => {
    const initial = createInitialCampaign("account-131", "actor-131", randomUUID());
    const requestContext = context(initial.id);
    const commandId = randomUUID();
    const command = engineCommandSchema.parse({
      kind: "content_compile",
      proposal: itemProposal(),
    });
    const result = resolveEngineCommand(initial, requestContext, commandId, command, "content_compile");

    expect(result.accepted).toBe(true);
    expect(result.state.version).toBe(1);
    expect(result.state.runtimeContent.definitions).toHaveLength(1);
    expect(result.state.runtimeContent.instances).toHaveLength(1);
    expect(result.event?.outcome).toBe("content_compiled");
    expect(result.event?.stateChanges.map((change) => change.path)).toEqual([
      expect.stringMatching(/^\/runtimeContent\/definitions\//),
      expect.stringMatching(/^\/runtimeContent\/instances\//),
      "/character/inventory",
    ]);
    const runtimeInstance = result.state.runtimeContent.instances[0];
    expect(result.state.character.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: runtimeInstance.id,
        runtimeContentInstanceId: runtimeInstance.id,
        ownerRef: { kind: "actor", id: initial.character.id },
      }),
    ]));
    expect(toSessionView(result.state).runtimeContent).toEqual(result.state.runtimeContent);
  });

  it("creates a new derived definition with explicit provenance and normal inventory placement", () => {
    const initial = createInitialCampaign("account-133", "actor-133", randomUUID());
    const requestContext = context(initial.id);
    const base = resolveEngineCommand(
      initial,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "content_compile", proposal: itemProposal() }),
      "content_compile",
    );
    expect(base.accepted).toBe(true);
    const baseDefinition = base.state.runtimeContent.definitions.find((definition) => definition.kind === "item");
    const baseInstance = base.state.runtimeContent.instances.find((instance) => instance.kind === "item");
    expect(baseDefinition).toBeDefined();
    expect(baseInstance).toBeDefined();

    const derived = resolveEngineCommand(
      base.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({
        kind: "content_compile",
        proposal: {
          ...itemProposal(),
          key: "silver-bronze-key",
          name: "Silver-coated bronze key",
          description: "The same key with a plainly recorded silver coating.",
          derivation: {
            sourceDefinitionIds: [baseDefinition!.id],
            sourceInstanceIds: [baseInstance!.id],
            recipeKey: "silver-coating",
            modification: "Apply a reviewed silver coating without changing the base key definition.",
          },
        },
      }),
      "content_compile",
    );

    expect(derived.accepted).toBe(true);
    const derivedDefinition = derived.state.runtimeContent.definitions.find((definition) => definition.key === "silver-bronze-key");
    expect(derivedDefinition).toMatchObject({
      kind: "item",
      provenance: { source: "derived", sourceRefs: expect.arrayContaining([baseDefinition!.id, baseInstance!.id]) },
      derivation: {
        sourceDefinitionIds: [baseDefinition!.id],
        sourceInstanceIds: [baseInstance!.id],
        recipeKey: "silver-coating",
      },
    });
    expect(derived.state.runtimeContent.definitions).toHaveLength(2);
    expect(derived.state.runtimeContent.instances).toHaveLength(2);
    expect(derived.state.character.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runtimeContentInstanceId: derived.state.runtimeContent.instances.find((instance) => instance.definitionId === derivedDefinition?.id)?.id,
        ownerRef: { kind: "actor", id: initial.character.id },
      }),
    ]));
    expect(derived.state.runtimeContent.definitions.find((definition) => definition.id === baseDefinition!.id)).toEqual(baseDefinition);
  });

  it("rejects derived references that are not canonical without mutating state", () => {
    const initial = createInitialCampaign("account-133", "actor-133", randomUUID());
    const requestContext = context(initial.id);
    const command = engineCommandSchema.parse({
      kind: "content_compile",
      proposal: {
        ...itemProposal(),
        key: "derived-without-source",
        derivation: {
          sourceDefinitionIds: ["runtime:item:missing-definition"],
          recipeKey: "missing-recipe",
          modification: "A source that was never compiled.",
        },
      },
    });
    const result = resolveEngineCommand(initial, requestContext, randomUUID(), command, "content_compile");
    expect(result.accepted).toBe(false);
    expect(result.code).toBe("derived_source_definition_not_found");
    expect(result.state.version).toBe(initial.version);
    expect(result.state.runtimeContent).toEqual({ definitions: [], instances: [], relationships: [] });
    expect(result.state.character.inventory).toEqual(initial.character.inventory);
  });

  it("moves a runtime item through the ordinary container relationship", () => {
    const initial = createInitialCampaign("account-133", "actor-133", randomUUID());
    const requestContext = context(initial.id);
    const base = resolveEngineCommand(
      initial,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "content_compile", proposal: itemProposal() }),
      "content_compile",
    );
    const runtimeItem = base.state.runtimeContent.instances.find((instance) => instance.kind === "item");
    expect(runtimeItem).toBeDefined();
    base.state.character.inventory.push({
      id: "runtime-test-pack",
      quantity: 1,
      authoredDefinition: { name: "Test pack", kind: "tool", weight: 1, containerCapacity: 10, mechanicsTier: 0 },
      ownerRef: { kind: "actor", id: initial.character.id },
    });
    const moved = resolveEngineCommand(
      base.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "inventory_transfer", itemId: runtimeItem!.id, targetContainerId: "runtime-test-pack", quantity: 1 }),
      "inventory_transfer",
    );
    expect(moved.accepted).toBe(true);
    expect(moved.state.character.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: runtimeItem!.id, runtimeContentInstanceId: runtimeItem!.id, containerRef: "runtime-test-pack" }),
    ]));
    expect(moved.state.runtimeContent.instances.find((instance) => instance.id === runtimeItem!.id)?.state).toMatchObject({ status: "available", quantity: 1 });

    const dropped = resolveEngineCommand(
      moved.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "drop_item", itemId: runtimeItem!.id, quantity: 1 }),
      "drop_item",
    );
    expect(dropped.accepted).toBe(true);
    expect(dropped.state.character.inventory.some((item) => item.runtimeContentInstanceId === runtimeItem!.id)).toBe(false);
    expect(dropped.state.runtimeContent.instances.find((instance) => instance.id === runtimeItem!.id)?.state).toMatchObject({ status: "known", quantity: 0 });
  });

  it("fails closed on unknown mechanical fields without changing campaign state", () => {
    const initial = createInitialCampaign("account-131", "actor-131", randomUUID());
    const unsafe = {
      kind: "content_compile",
      proposal: { ...itemProposal(), damageDice: "10d6" },
    };
    expect(engineCommandSchema.safeParse(unsafe).success).toBe(false);
    const before = JSON.stringify(initial);
    const parsed = engineCommandSchema.safeParse(unsafe);
    if (parsed.success) throw new Error("Unsafe content proposal unexpectedly parsed.");
    expect(JSON.stringify(initial)).toBe(before);
    expect(normalizeCampaignState(initial).runtimeContent).toEqual({ definitions: [], instances: [], relationships: [] });
  });

  it("replays idempotently, survives reload, and rejects a second stable definition", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-runtime-content-"));
    const databasePath = join(directory, "engine.db");
    const firstStore = new LanternEngineStore(databasePath);
    const initial = createInitialCampaign("account-131", "actor-131", randomUUID());
    const createContext = {
      requestId: randomUUID(),
      accountId: initial.accountId,
      actorId: initial.actorId,
      capabilities: ["player", "dm"],
    };
    firstStore.createCampaign(createContext, initial);
    const requestContext = context(initial.id);
    const commandId = randomUUID();
    const command = engineCommandSchema.parse({ kind: "content_compile", proposal: itemProposal() });
    const execute = (state: typeof initial, id: string, currentCommand: EngineCommand) =>
      resolveEngineCommand(state, requestContext, id, currentCommand, "content_compile");
    const first = firstStore.executeCommand({
      context: requestContext,
      clientCommandId: commandId,
      expectedCampaignVersion: 0,
      command,
      tool: "content_compile",
      resolve: (state) => execute(state, commandId, command),
    });
    const replay = firstStore.executeCommand({
      context: requestContext,
      clientCommandId: commandId,
      expectedCampaignVersion: 0,
      command,
      tool: "content_compile",
      resolve: (state) => execute(state, commandId, command),
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.event).toEqual(first.event);
    firstStore.close();

    const restarted = new LanternEngineStore(databasePath);
    const reloaded = restarted.getCampaign(requestContext);
    expect(reloaded.runtimeContent.definitions).toHaveLength(1);
    const reloadedInstance = reloaded.runtimeContent.instances.find((instance) => instance.kind === "item");
    expect(reloadedInstance).toBeDefined();
    expect(reloaded.character.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: reloadedInstance!.id,
        runtimeContentInstanceId: reloadedInstance!.id,
        ownerRef: { kind: "actor", id: reloaded.character.id },
      }),
    ]));
    const duplicateId = randomUUID();
    const duplicate = restarted.executeCommand({
      context: requestContext,
      clientCommandId: duplicateId,
      expectedCampaignVersion: 1,
      command,
      tool: "content_compile",
      resolve: (state) => execute(state, duplicateId, command),
    });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.code).toBe("content_already_exists");
    expect(duplicate.state.version).toBe(1);
    expect(restarted.getCampaign(requestContext).runtimeContent.definitions).toHaveLength(1);
    restarted.close();
  });

  it("persists typed topology, moves only through canonical exits, and patches exit state exactly once", () => {
    const initial = createInitialCampaign("account-132", "actor-132", randomUUID());
    const requestContext = { ...context(initial.id), accountId: initial.accountId, actorId: initial.actorId };
    const parent = engineCommandSchema.parse({ kind: "content_compile", proposal: locationProposal("guard-room") });
    const parentResult = resolveEngineCommand(initial, requestContext, randomUUID(), parent, "content_compile");
    expect(parentResult.accepted).toBe(true);
    const parentInstance = parentResult.state.runtimeContent.instances.find((instance) => instance.kind === "location");
    expect(parentInstance).toBeDefined();

    const child = engineCommandSchema.parse({
      kind: "content_compile",
      proposal: locationProposal("holding-vault", {
        parentKey: "guard-room",
        occupants: [{ kind: "actor", id: initial.actorId }],
        exits: [{
          key: "west-door",
          label: "West door",
          kind: "door",
          targetKey: "guard-room",
          open: false,
          locked: true,
          hidden: true,
          discovered: false,
          requirements: [],
        }],
      }),
    });
    const childResult = resolveEngineCommand(parentResult.state, requestContext, randomUUID(), child, "content_compile");
    expect(childResult.accepted).toBe(true);
    const childInstance = childResult.state.runtimeContent.instances.find((instance) => instance.definitionId.includes("holding-vault"));
    expect(childInstance).toBeDefined();
    expect(childResult.state.runtimeContent.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: "located_in", fromKind: "actor", fromId: initial.actorId, toId: childInstance?.id }),
      expect.objectContaining({ relation: "located_in", fromId: childInstance?.id, toId: parentInstance?.id }),
      expect.objectContaining({ relation: "connects_to", exit: expect.objectContaining({ key: "west-door", hidden: true, discovered: false }) }),
    ]));
    expect(toSessionView(childResult.state).runtimeContent.relationships).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: "connects_to", exit: expect.objectContaining({ key: "west-door" }) }),
    ]));

    const blockedMove = resolveEngineCommand(
      childResult.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "move", destinationId: "west-door" }),
      "move",
    );
    expect(blockedMove.accepted).toBe(false);
    expect(blockedMove.code).toBe("location_exit_undiscovered");
    expect(blockedMove.state.version).toBe(childResult.state.version);

    const location = childResult.state.runtimeContent.instances.find((instance) => instance.id === childInstance?.id);
    const reveal = engineCommandSchema.parse({
      kind: "content_compile",
      exitPatch: {
        locationInstanceId: location?.id,
        exitKey: "west-door",
        patch: { discovered: true, open: true, locked: false },
      },
    });
    const revealed = resolveEngineCommand(childResult.state, requestContext, randomUUID(), reveal, "content_compile");
    expect(revealed.accepted).toBe(true);
    const moved = resolveEngineCommand(
      revealed.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "move", destinationId: "west-door" }),
      "move",
    );
    expect(moved.accepted).toBe(true);
    expect(moved.event?.outcome).toBe("location_moved");
    expect(moved.state.runtimeContent.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: "located_in", fromKind: "actor", fromId: initial.actorId, toId: parentInstance?.id }),
    ]));
  });

  it("rejects an exit whose target location has not been compiled", () => {
    const initial = createInitialCampaign("account-132", "actor-132", randomUUID());
    const command = engineCommandSchema.parse({
      kind: "content_compile",
      proposal: locationProposal("holding-vault", {
        exits: [{ key: "missing", label: "Missing", kind: "passage", targetKey: "not-yet-authored" }],
      }),
    });
    const result = resolveEngineCommand(initial, context(initial.id), randomUUID(), command, "content_compile");
    expect(result.accepted).toBe(false);
    expect(result.code).toBe("location_exit_target_not_found");
    expect(result.state.runtimeContent).toEqual({ definitions: [], instances: [], relationships: [] });
  });

  it("resolves exits to the one canonical non-default target instance", () => {
    const initial = createInitialCampaign("account-132", "actor-132", randomUUID());
    const requestContext = context(initial.id);
    const target = resolveEngineCommand(
      initial,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "content_compile", proposal: locationProposal("tower", {}), instanceKey: "upper" }),
      "content_compile",
    );
    expect(target.accepted).toBe(true);
    const targetInstance = target.state.runtimeContent.instances.find((instance) => instance.instanceKey === "upper");
    expect(targetInstance).toBeDefined();
    const source = resolveEngineCommand(
      target.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({
        kind: "content_compile",
        proposal: locationProposal("courtyard", {
          exits: [{ key: "tower-stairs", label: "Stairs", kind: "stairs", targetKey: "tower" }],
        }),
      }),
      "content_compile",
    );
    expect(source.accepted).toBe(true);
    expect(source.state.runtimeContent.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: "connects_to", toId: targetInstance?.id, exit: expect.objectContaining({ targetKey: "tower" }) }),
    ]));
  });

  it("rejects duplicate actor containment and createInstance false without mutation", () => {
    const initial = createInitialCampaign("account-132", "actor-132", randomUUID());
    const requestContext = context(initial.id);
    const first = resolveEngineCommand(
      initial,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({
        kind: "content_compile",
        proposal: locationProposal("first-room", { occupants: [{ kind: "actor", id: initial.actorId }] }),
      }),
      "content_compile",
    );
    expect(first.accepted).toBe(true);
    const before = JSON.stringify(first.state);
    const duplicate = resolveEngineCommand(
      first.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({
        kind: "content_compile",
        proposal: locationProposal("second-room", { occupants: [{ kind: "actor", id: initial.actorId }] }),
      }),
      "content_compile",
    );
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.code).toBe("location_actor_already_located");
    expect(JSON.stringify(duplicate.state)).toBe(before);

    const noInstance = resolveEngineCommand(
      initial,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({
        kind: "content_compile",
        createInstance: false,
        proposal: locationProposal("orphan-room", { exits: [{ key: "door", label: "Door", kind: "door", targetKey: "first-room" }] }),
      }),
      "content_compile",
    );
    expect(noInstance.accepted).toBe(false);
    expect(noInstance.code).toBe("location_instance_required");
    expect(noInstance.state.runtimeContent).toEqual({ definitions: [], instances: [], relationships: [] });
  });

  it("redacts undiscovered exits from state, command, resolution data, and event evidence", () => {
    const initial = createInitialCampaign("account-132", "actor-132", randomUUID());
    const requestContext = context(initial.id);
    const target = resolveEngineCommand(
      initial,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({ kind: "content_compile", proposal: locationProposal("target-room") }),
      "content_compile",
    );
    const result = resolveEngineCommand(
      target.state,
      requestContext,
      randomUUID(),
      engineCommandSchema.parse({
        kind: "content_compile",
        proposal: locationProposal("secret-room", {
          exits: [{ key: "hidden-door", label: "Hidden door", kind: "door", targetKey: "target-room", hidden: true, discovered: false }],
        }),
      }),
      "content_compile",
    );
    expect(result.accepted).toBe(true);
    const publicState = projectStateForActor(initial.actorId, result.state);
    expect(JSON.stringify(publicState)).not.toContain("hidden-door");
    const publicResult = projectResolutionForActor(result, initial.actorId);
    expect(JSON.stringify(publicResult.event?.command)).not.toContain("hidden-door");
    expect(JSON.stringify(publicResult.event?.command)).not.toContain("target-room");
    expect(JSON.stringify(publicResult.data)).not.toContain("hidden-door");
    expect(JSON.stringify(publicResult.data)).not.toContain("target-room");
  });
});
