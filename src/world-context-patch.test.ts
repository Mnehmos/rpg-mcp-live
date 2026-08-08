import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  engineCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, resolveEngineCommand } from "./engine-domain.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";
import { commandForTool, parseToolArguments } from "./engine-tools.js";

type WorldContextCommand = Extract<EngineCommand, { kind: "world_context" }>;

function requestContext(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function worldCommand(overrides: Partial<Omit<WorldContextCommand, "kind">> = {}): WorldContextCommand {
  return {
    kind: "world_context",
    title: "The glass harbor",
    description: "Salt wind carries bell tones across a harbor of mirrored water.",
    features: ["harbor bells", "mirror water"],
    exits: [{ id: "west-pier", label: "Walk the west pier" }],
    ...overrides,
  };
}

function currentWorldCommand(
  state: LanternCampaignState,
  overrides: Partial<Omit<WorldContextCommand, "kind">> = {}
): WorldContextCommand {
  const worldContext = state.worldContext;
  if (!worldContext) throw new Error("Expected a seeded world context.");
  return worldCommand({
    title: worldContext.title,
    description: worldContext.description,
    features: worldContext.features,
    exits: worldContext.exits,
    ...overrides,
  });
}

function seededCampaign(): LanternCampaignState {
  const campaign = createInitialCampaign("account-world", "actor-world");
  campaign.worldContext = {
    id: "world~harbor",
    title: "The glass harbor",
    description: "Salt wind carries bell tones across a harbor of mirrored water.",
    features: ["harbor bells", "mirror water"],
    exits: [{ id: "west-pier", label: "Walk the west pier" }],
    npcs: [
      {
        id: "npc-a",
        name: "Aster",
        description: "A watch captain with a rain-dark cloak.",
        disposition: "friendly",
        goals: ["keep the peace", "learn who rang the bells"],
        socialDc: 14,
        relationshipScore: 37,
        memories: ["The player returned the harbor key."],
      },
      {
        id: "npc-b",
        name: "Bram",
        description: "A ferryman with ink on both thumbs.",
        disposition: "neutral",
        goals: ["protect the ferry"],
        socialDc: 12,
        relationshipScore: -8,
        memories: ["Bram distrusts the customs office."],
      },
    ],
    merchants: [
      {
        id: "merchant-a",
        name: "Aster's supply chest",
        description: "A compact chest of lamp oil and waxed rope.",
        disposition: "friendly",
        items: [{
          item: {
            id: "lamp-oil",
            quantity: 1,
            authoredDefinition: {
              name: "Lamp oil",
              kind: "consumable",
              weight: 1,
              valueCopper: 10,
            },
          },
          stock: 4,
          buyPriceCopper: 12,
          sellPriceCopper: 6,
        }],
      },
      {
        id: "merchant-b",
        name: "Bram's ferry cart",
        description: "A handcart stacked with dry blankets.",
        disposition: "neutral",
        items: [{
          item: {
            id: "ferry-blanket",
            quantity: 1,
            authoredDefinition: {
              name: "Ferry blanket",
              kind: "misc",
              weight: 2,
              valueCopper: 20,
            },
          },
          stock: -1,
          buyPriceCopper: 24,
          sellPriceCopper: 12,
        }],
      },
    ],
    objects: [],
  };
  return normalizeCampaignState(campaign);
}

function resolveWorldContext(state: LanternCampaignState, command: WorldContextCommand) {
  const context = requestContext(state);
  return resolveEngineCommand(state, context, randomUUID(), command, "world_context");
}

function createStore(state: LanternCampaignState): { store: LanternEngineStore; context: RequestContext } {
  const directory = mkdtempSync(join(tmpdir(), "lantern-world-context-"));
  const store = new LanternEngineStore(join(directory, "engine.db"));
  store.createCampaign(
    {
      requestId: randomUUID(),
      accountId: state.accountId,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    },
    state
  );
  return { store, context: requestContext(state) };
}

function executeWorldContext(
  store: LanternEngineStore,
  context: RequestContext,
  expectedCampaignVersion: number,
  clientCommandId: string,
  command: WorldContextCommand,
  playerText?: string
) {
  return store.executeCommand({
    context,
    clientCommandId,
    expectedCampaignVersion,
    command,
    tool: "world_context",
    ...(playerText === undefined ? {} : { playerText }),
    resolve: (state) => resolveEngineCommand(state, context, clientCommandId, command, "world_context"),
  });
}

describe("world_context patch semantics", () => {
  it("shares the strict patch contract across tool parsing and commands, and fails closed for legacy arrays", () => {
    const raw = {
      title: "The glass harbor",
      description: "Salt wind carries bell tones across a harbor of mirrored water.",
      features: ["harbor bells"],
      exits: [],
      npcs: { upsert: [{ id: "npc-a", description: "A new clue changes the captain's posture." }] },
    };
    const parsed = parseToolArguments("world_context", raw);
    const command = commandForTool("world_context", parsed);

    expect(command).toEqual(engineCommandSchema.parse({ kind: "world_context", ...raw }));
    expect(parseToolArguments("world_context", {
      title: raw.title,
      description: raw.description,
      features: raw.features,
      exits: raw.exits,
    })).not.toHaveProperty("npcs");
    expect(engineCommandSchema.safeParse({ kind: "world_context", ...raw, npcs: [] }).success).toBe(false);
    expect(engineCommandSchema.safeParse({ kind: "world_context", ...raw, merchants: [] }).success).toBe(false);
    expect(engineCommandSchema.safeParse({ kind: "world_context", ...raw, npcs: {} }).success).toBe(false);
    expect(engineCommandSchema.safeParse({ kind: "world_context", ...raw, npcs: { upsert: [] } }).success).toBe(false);
    expect(engineCommandSchema.safeParse({ kind: "world_context", ...raw, npcs: { upsert: [{ id: "npc-a", unexpected: true }] } }).success).toBe(false);
    expect(() => parseToolArguments("world_context", { ...raw, npcs: [] })).toThrow();
  });

  it("preserves both canonical actor collections when their patch envelopes are omitted", () => {
    const state = seededCampaign();
    const beforeNpcs = JSON.stringify(state.worldContext?.npcs);
    const beforeMerchants = JSON.stringify(state.worldContext?.merchants);
    const result = resolveWorldContext(state, worldCommand({
      title: "The harbor after the bell",
      description: "A low bell fades into the salt fog.",
      features: ["fading bell", "salt fog"],
      exits: [{ id: "customs", label: "Visit the customs office" }],
    }));

    expect(result.accepted).toBe(true);
    expect(JSON.stringify(result.state.worldContext?.npcs)).toBe(beforeNpcs);
    expect(JSON.stringify(result.state.worldContext?.merchants)).toBe(beforeMerchants);
    expect(result.event?.stateChanges.map((change) => change.path)).toEqual([
      "/worldContext/title",
      "/worldContext/description",
      "/worldContext/features",
      "/worldContext/exits",
    ]);
    expect(result.event?.stateChanges.some((change) => change.path === "/worldContext")).toBe(false);
  });

  it("merges authorable NPC and merchant fields while preserving every omitted field", () => {
    const npcCases = [
      { label: "name", patch: { name: "Aster Vale" } },
      { label: "description", patch: { description: "A watch captain holding a brass signal key." } },
      { label: "disposition", patch: { disposition: "helpful" as const } },
      { label: "goals", patch: { goals: ["open the sealed lock"] } },
      { label: "memories", patch: { memories: ["The player decoded the harbor signal."] } },
    ];
    for (const testCase of npcCases) {
      const state = seededCampaign();
      const before = state.worldContext?.npcs[0];
      const result = resolveWorldContext(state, currentWorldCommand(state, {
        npcs: { upsert: [{ id: "npc-a", ...testCase.patch }] },
      }));
      expect(result.accepted, testCase.label).toBe(true);
      expect(result.state.worldContext?.npcs[0]).toEqual({ ...before, ...testCase.patch });
      expect(result.state.worldContext?.npcs[0]?.relationshipScore).toBe(37);
    }

    const merchantCases = [
      { label: "name", patch: { name: "Aster's shore chest" } },
      { label: "description", patch: { description: "The chest now carries a brass inventory tag." } },
      { label: "disposition", patch: { disposition: "helpful" as const } },
      { label: "items", patch: { items: [] } },
    ];
    for (const testCase of merchantCases) {
      const state = seededCampaign();
      const before = state.worldContext?.merchants[0];
      const result = resolveWorldContext(state, currentWorldCommand(state, {
        merchants: { upsert: [{ id: "merchant-a", ...testCase.patch }] },
      }));
      expect(result.accepted, testCase.label).toBe(true);
      expect(result.state.worldContext?.merchants[0]).toEqual({ ...before, ...testCase.patch });
    }
  });

  it("allows explicit empty authorable fields to clear without clearing omitted canonical fields", () => {
    const state = seededCampaign();
    const result = resolveWorldContext(state, currentWorldCommand(state, {
      npcs: { upsert: [{ id: "npc-a", description: "", goals: [], memories: [] }] },
      merchants: { upsert: [{ id: "merchant-a", description: "", items: [] }] },
    }));

    expect(result.accepted).toBe(true);
    expect(result.state.worldContext?.npcs[0]).toMatchObject({
      id: "npc-a",
      name: "Aster",
      description: "",
      goals: [],
      memories: [],
      relationshipScore: 37,
    });
    expect(result.state.worldContext?.merchants[0]).toMatchObject({
      id: "merchant-a",
      name: "Aster's supply chest",
      description: "",
      items: [],
    });
  });

  it("applies actor operations in stable order and emits escaped granular entity evidence", () => {
    const state = seededCampaign();
    const result = resolveWorldContext(state, currentWorldCommand(state, {
      npcs: {
        upsert: [
          { id: "npc/new~arrival", name: "Cato" },
          { id: "npc-a", description: "Aster grips the brass key." },
        ],
        remove: ["npc-b"],
      },
      merchants: {
        upsert: [{ id: "merchant/new~cart", name: "Cato's cart" }],
        remove: ["merchant-b"],
      },
    }));

    expect(result.accepted).toBe(true);
    expect(result.state.worldContext?.npcs.map((npc) => npc.id)).toEqual(["npc-a", "npc/new~arrival"]);
    expect(result.state.worldContext?.merchants.map((merchant) => merchant.id)).toEqual(["merchant-a", "merchant/new~cart"]);
    expect(result.event?.stateChanges.map((change) => change.path)).toEqual([
      "/worldContext/npcs/npc~1new~0arrival",
      "/worldContext/npcs/npc-a",
      "/worldContext/npcs/npc-b",
      "/worldContext/merchants/merchant~1new~0cart",
      "/worldContext/merchants/merchant-b",
    ]);
    expect(result.event?.stateChanges[0]).toMatchObject({ before: null, after: { id: "npc/new~arrival", name: "Cato" } });
    expect(result.event?.stateChanges[2]).toMatchObject({ before: { id: "npc-b" }, after: null });
  });

  it("accepts a same-content new command with no fake actor delta", () => {
    const state = seededCampaign();
    const result = resolveWorldContext(state, currentWorldCommand(state, {
      npcs: { upsert: [{ id: "npc-a" }] },
      merchants: { upsert: [{ id: "merchant-a" }] },
    }));

    expect(result.accepted).toBe(true);
    expect(result.state.version).toBe(state.version + 1);
    expect(result.event?.stateChanges).toEqual([]);
  });

  it("rejects invalid entity operations atomically and supplies the versioned #22 fixtures", () => {
    const cases: Array<{
      id: string;
      state: () => LanternCampaignState;
      command: (state: LanternCampaignState) => WorldContextCommand;
      code: string;
    }> = [
      {
        id: "duplicate-upsert",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { npcs: { upsert: [{ id: "npc-a" }, { id: "npc-a" }] } }),
        code: "duplicate_entity_id",
      },
      {
        id: "duplicate-remove",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { merchants: { remove: ["merchant-a", "merchant-a"] } }),
        code: "duplicate_entity_id",
      },
      {
        id: "conflicting-operation",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { npcs: { upsert: [{ id: "npc-a" }], remove: ["npc-a"] } }),
        code: "conflicting_entity_operation",
      },
      {
        id: "world_context.npc_remove_missing.v1",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { npcs: { remove: ["npc-missing"] } }),
        code: "npc_not_found",
      },
      {
        id: "world_context.merchant_remove_missing.v1",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { merchants: { remove: ["merchant-missing"] } }),
        code: "merchant_not_found",
      },
      {
        id: "npc-name-required",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { npcs: { upsert: [{ id: "npc-new" }] } }),
        code: "npc_name_required",
      },
      {
        id: "merchant-name-required",
        state: seededCampaign,
        command: (state) => currentWorldCommand(state, { merchants: { upsert: [{ id: "merchant-new" }] } }),
        code: "merchant_name_required",
      },
      {
        id: "npc-limit",
        state: () => {
          const state = seededCampaign();
          state.worldContext!.npcs = Array.from({ length: 20 }, (_, index) => ({
            id: "npc-" + index,
            name: "NPC " + index,
            description: "A durable actor.",
            disposition: "neutral" as const,
            goals: [],
            socialDc: 12,
            relationshipScore: 0,
            memories: [],
          }));
          return state;
        },
        command: (state) => currentWorldCommand(state, { npcs: { upsert: [{ id: "npc-overflow", name: "Overflow" }] } }),
        code: "npc_limit_exceeded",
      },
      {
        id: "ambiguous-legacy-npcs",
        state: () => {
          const state = seededCampaign();
          state.worldContext!.npcs = [state.worldContext!.npcs[0]!, { ...state.worldContext!.npcs[0]! }];
          return state;
        },
        command: (state) => currentWorldCommand(state, { npcs: { upsert: [{ id: "npc-a", description: "Unsafe target." }] } }),
        code: "ambiguous_entity_id",
      },
    ];

    for (const testCase of cases) {
      const state = testCase.state();
      const before = JSON.stringify(state);
      const result = resolveWorldContext(state, testCase.command(state));
      expect(result.accepted, testCase.id).toBe(false);
      expect(result.code, testCase.id).toBe(testCase.code);
      expect(JSON.stringify(result.state), testCase.id).toBe(before);
      expect(result.state.version, testCase.id).toBe(state.version);
      expect(result.event, testCase.id).toBeNull();
    }
  });

  it("rejects relationshipScore by presence through the shared parser and direct resolver/store ingress", () => {
    const scores = [0, 55, 37];
    for (const score of scores) {
      const state = seededCampaign();
      const raw = {
        title: state.worldContext!.title,
        description: state.worldContext!.description,
        features: state.worldContext!.features,
        exits: state.worldContext!.exits,
        npcs: { upsert: [{ id: "npc-a", relationshipScore: score }] },
      };
      const parsed = parseToolArguments("world_context", raw);
      const command = commandForTool("world_context", parsed);
      if (!command || command.kind !== "world_context") throw new Error("Expected a world_context command.");
      expect(engineCommandSchema.safeParse(command).success, String(score)).toBe(true);

      const direct = resolveWorldContext(state, command);
      expect(direct.accepted, String(score)).toBe(false);
      expect(direct.code, String(score)).toBe("field_not_authorable");
      expect(direct.state).toBe(state);
      expect(direct.event).toBeNull();

      const { store, context } = createStore(state);
      const before = store.getCampaign(context);
      const rejected = executeWorldContext(store, context, before.version, randomUUID(), command);
      const after = store.getCampaign(context);
      expect(rejected.accepted, String(score)).toBe(false);
      expect(rejected.code, String(score)).toBe("field_not_authorable");
      expect(JSON.stringify(after.worldContext), String(score)).toBe(JSON.stringify(before.worldContext));
      expect(JSON.stringify(after.character), String(score)).toBe(JSON.stringify(before.character));
      expect(after.version, String(score)).toBe(before.version);
      expect(store.listCampaignEvents(context), String(score)).toHaveLength(0);
      store.close();
    }
  });

  it("rejects free socialDc authoring so social checks cannot gain a new DM-owned DC", () => {
    const state = seededCampaign();
    const raw = {
      title: state.worldContext!.title,
      description: state.worldContext!.description,
      features: state.worldContext!.features,
      exits: state.worldContext!.exits,
      npcs: { upsert: [{ id: "npc-a", socialDc: 18 }] },
    };
    const parsed = parseToolArguments("world_context", raw);
    const next = commandForTool("world_context", parsed);
    if (!next || next.kind !== "world_context") throw new Error("Expected a world_context command.");
    const before = JSON.stringify(state);
    const result = resolveWorldContext(state, next);
    expect(result).toMatchObject({ accepted: false, code: "field_not_authorable" });
    expect(result.message).toContain("reviewed challenge definition");
    expect(JSON.stringify(result.state)).toBe(before);
    expect(result.event).toBeNull();
  });

  it("preserves scoped world/mechanical invariants for a rejected command with player text while retaining the generic player-log exception", () => {
    const state = seededCampaign();
    const { store, context } = createStore(state);
    const before = store.getCampaign(context);
    const command = currentWorldCommand(before, { npcs: { upsert: [{ id: "npc-a", relationshipScore: 0 }] } });
    const rejected = executeWorldContext(store, context, before.version, randomUUID(), command, "I try to rewrite Aster's feelings.");
    const after = store.getCampaign(context);

    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("field_not_authorable");
    expect(JSON.stringify(after.worldContext)).toBe(JSON.stringify(before.worldContext));
    expect(JSON.stringify(after.character)).toBe(JSON.stringify(before.character));
    expect(after.version).toBe(before.version);
    expect(store.listCampaignEvents(context)).toHaveLength(0);
    expect(after.log).toHaveLength(before.log.length + 2);
    expect(after.log.at(-2)).toMatchObject({ kind: "player", text: "I try to rewrite Aster's feelings." });
    expect(after.log.at(-1)?.kind).toBe("narration");
    store.close();
  });

  it("persists one mixed patch, replays it exactly once, rejects stale writes, and survives reopen", () => {
    const state = seededCampaign();
    const directory = mkdtempSync(join(tmpdir(), "lantern-world-context-reopen-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    store.createCampaign(
      {
        requestId: randomUUID(),
        accountId: state.accountId,
        actorId: state.actorId,
        capabilities: ["player", "dm"],
      },
      state
    );
    const context = requestContext(state);
    const command = currentWorldCommand(state, {
      npcs: {
        upsert: [{ id: "npc-c", name: "Cato" }, { id: "npc-a", disposition: "helpful" }],
        remove: ["npc-b"],
      },
      merchants: { remove: ["merchant-b"] },
    });
    const clientCommandId = randomUUID();
    const committed = executeWorldContext(store, context, 0, clientCommandId, command);
    const replay = executeWorldContext(store, context, 0, clientCommandId, command);

    expect(committed.accepted).toBe(true);
    expect(committed.state.version).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(replay.state.version).toBe(1);
    expect(replay.event).toEqual(committed.event);
    expect(committed.state.worldContext?.npcs.map((npc) => npc.id)).toEqual(["npc-a", "npc-c"]);
    expect(store.listCampaignEvents(context)).toHaveLength(1);
    const beforeStale = JSON.stringify(store.getCampaign(context));
    expect(() => executeWorldContext(store, context, 0, randomUUID(), command)).toThrow(EngineVersionConflictError);
    expect(JSON.stringify(store.getCampaign(context))).toBe(beforeStale);
    expect(store.listCampaignEvents(context)).toHaveLength(1);
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const reopenedState = reopened.getCampaign(context);
    const reopenedReplay = executeWorldContext(reopened, context, 0, clientCommandId, command);
    expect(reopenedState.version).toBe(1);
    expect(reopenedState.worldContext?.npcs.map((npc) => npc.id)).toEqual(["npc-a", "npc-c"]);
    expect(reopenedReplay.replayed).toBe(true);
    expect(reopenedReplay.event).toEqual(committed.event);
    expect(reopened.listCampaignEvents(context)).toHaveLength(1);
    reopened.close();
  });

  it("keeps features and exits as required, whole-value inputs", () => {
    const missingBase = {
      kind: "world_context",
      title: "A required base-field check",
      description: "Features and exits must remain explicit whole values.",
    };
    expect(engineCommandSchema.safeParse(missingBase).success).toBe(false);

    const state = seededCampaign();
    const result = resolveWorldContext(state, currentWorldCommand(state, {
      features: ["second feature", "first feature"],
      exits: [
        { id: "z-exit", label: "The last listed exit" },
        { id: "a-exit", label: "The first listed exit" },
      ],
    }));
    expect(result.accepted).toBe(true);
    expect(result.state.worldContext?.features).toEqual(["second feature", "first feature"]);
    expect(result.state.worldContext?.exits).toEqual([
      { id: "z-exit", label: "The last listed exit" },
      { id: "a-exit", label: "The first listed exit" },
    ]);
  });
});
