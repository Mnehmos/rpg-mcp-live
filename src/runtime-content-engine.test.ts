import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createInitialCampaign,
  normalizeCampaignState,
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
    ]);
    expect(toSessionView(result.state).runtimeContent).toEqual(result.state.runtimeContent);
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
    expect(restarted.getCampaign(requestContext).runtimeContent.definitions).toHaveLength(1);
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
});
