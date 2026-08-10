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
});
