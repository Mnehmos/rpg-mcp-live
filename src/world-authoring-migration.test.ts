import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  engineCommandSchema,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import {
  createInitialCampaign,
  normalizeCampaignState,
  resolveEngineCommand,
} from "./engine-domain.js";
import { commandForTool, parseToolArguments } from "./engine-tools.js";

function ironKeyProposal() {
  return {
    kind: "item" as const,
    key: "mundane-iron-key",
    name: "Mundane iron key",
    description: "A plain iron key with no authored mechanics.",
    tags: ["iron-key", "key", "mundane"],
    category: "tool" as const,
    material: "iron",
    weight: 0.1,
    affordances: ["inspect", "take", "drop", "use"] as const,
  };
}

function legacyObject() {
  return {
    id: "legacy-iron-key",
    definition: {
      key: "legacy-iron-key",
      sourceRef: "legacy-fixture:key",
      name: "Legacy iron key",
      description: "A trusted persisted fixture retained for replay compatibility.",
      material: "metal" as const,
      tags: ["key", "mundane"],
      affordances: ["inspect", "take", "carry", "drop", "use"] as const,
      prerequisites: [],
      effectInteractions: [],
      weight: 0.1,
      criticalPolicy: {
        kind: "ordinary_consequence" as const,
        canDestroy: true,
        canLose: true,
        canSell: true,
        canConsume: false,
        canHide: true,
      },
    },
    state: "intact",
    locationRef: null,
  };
}

function authoredState(): LanternCampaignState {
  const state = createInitialCampaign("account-172", "actor-172", randomUUID());
  state.phase = "sandbox";
  state.character.created = true;
  state.worldContext = {
    id: "vault",
    title: "Holding vault",
    description: "A bare stone vault surrounds the prisoner.",
    features: ["iron bars", "a locked service hatch"],
    exits: [],
    npcs: [],
    merchants: [],
    objects: [],
  };
  state.log.push({
    id: "released-iron-key",
    kind: "narration",
    text: "An unattended mundane iron key rests on the stone floor.",
    createdAt: new Date(0).toISOString(),
  });
  state.worldFacts.push({
    id: "hidden-sword",
    kind: "object",
    title: "Hidden sword",
    description: "A sword is sealed behind a false stone.",
    visibility: "hidden",
    obscurity: "clear",
    requiredSense: "normal",
    passiveDc: 18,
    sceneId: "vault",
    revision: 1,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
  return normalizeCampaignState(state);
}

function contextFor(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function materialize(
  state: LanternCampaignState,
  instanceKey: string,
  proposal: ReturnType<typeof ironKeyProposal> = ironKeyProposal(),
  evidence: { kind: "released_narration" | "world_context" | "world_fact"; ref: string } = {
    kind: "released_narration",
    ref: "released-iron-key",
  },
) {
  const command = engineCommandSchema.parse({
    kind: "content_compile",
    proposal,
    instanceKey,
    materialization: { evidence },
  });
  return resolveEngineCommand(state, contextFor(state), randomUUID(), command, "content_compile");
}

describe("canonical world authoring migration", () => {
  it("removes direct object creation from the model-facing world_context contract", () => {
    const worldArgs = {
      title: "Holding vault",
      description: "A bare stone vault.",
      features: ["iron bars"],
      exits: [],
      objects: { upsert: [legacyObject()] },
    };

    expect(() => parseToolArguments("world_context", worldArgs)).toThrow();
    expect(engineCommandSchema.safeParse({ kind: "world_context", ...worldArgs }).success).toBe(true);

    const contentArgs = parseToolArguments("content_compile", {
      proposal: ironKeyProposal(),
      instanceKey: "floor-key",
      materialization: {
        evidence: { kind: "released_narration", ref: "released-iron-key" },
      },
    });
    expect(commandForTool("content_compile", contentArgs)).toMatchObject({
      kind: "content_compile",
      materialization: {
        evidence: { kind: "released_narration", ref: "released-iron-key" },
      },
    });
  });

  it("compiles one evidence-backed object and moves it through normal ownership", () => {
    const initial = authoredState();
    const compiled = materialize(initial, "floor-key");

    expect(compiled.accepted).toBe(true);
    expect(compiled.event?.outcome).toBe("content_materialized");
    expect(compiled.state.version).toBe(initial.version + 1);
    expect(compiled.state.runtimeContent.definitions).toHaveLength(1);
    expect(compiled.state.runtimeContent.instances).toHaveLength(1);
    expect(compiled.state.worldContext?.objects).toHaveLength(1);
    const instance = compiled.state.runtimeContent.instances[0];
    const worldObject = compiled.state.worldContext?.objects[0];
    expect(worldObject).toMatchObject({
      id: instance.id,
      ownerRef: { kind: "world", id: "vault" },
      state: "intact",
      materialization: {
        runtimeDefinitionId: instance.definitionId,
        runtimeInstanceId: instance.id,
        evidence: { kind: "released_narration", ref: "released-iron-key" },
      },
    });
    expect(worldObject?.materialization?.evidence.textHash).toMatch(/^[a-f0-9]{64}$/);
    expect(compiled.state.runtimeContent.definitions[0]?.provenance.sourceRefs).toEqual(expect.arrayContaining([
      "released_narration:released-iron-key",
      expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    ]));
    expect(compiled.state.character.inventory.some((item) => item.runtimeContentInstanceId === instance.id)).toBe(false);

    const taken = resolveEngineCommand(
      compiled.state,
      contextFor(compiled.state),
      randomUUID(),
      engineCommandSchema.parse({
        kind: "interact",
        targetId: instance.id,
        affordance: "take",
        goal: "Take the mundane iron key.",
      }),
      "interact",
    );
    expect(taken.accepted).toBe(true);
    expect(taken.state.worldContext?.objects[0]).toMatchObject({
      id: instance.id,
      state: "carried",
      ownerRef: { kind: "actor", id: initial.actorId },
    });
    expect(taken.state.character.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: instance.id, runtimeContentInstanceId: instance.id }),
    ]));
  });

  it("reuses an equivalent definition and rejects a conflicting stable key byte-for-byte", () => {
    const first = materialize(authoredState(), "floor-key-a");
    expect(first.accepted).toBe(true);
    const equivalentAlias = { ...ironKeyProposal(), key: "plain-iron-key" };
    const second = materialize(first.state, "floor-key-b", equivalentAlias);
    expect(second.accepted).toBe(true);
    expect(second.state.runtimeContent.definitions).toHaveLength(1);
    expect(second.state.runtimeContent.instances).toHaveLength(2);
    expect(second.state.worldContext?.objects).toHaveLength(2);
    expect(second.data).toMatchObject({ definitionReused: true });

    const before = JSON.stringify(second.state);
    const conflictProposal = {
      ...ironKeyProposal(),
      description: "Different canonical content under the same stable key.",
    };
    const conflict = materialize(second.state, "floor-key-c", conflictProposal);
    expect(conflict.accepted).toBe(false);
    expect(conflict.code).toBe("content_definition_conflict");
    expect(conflict.state.version).toBe(second.state.version);
    expect(JSON.stringify(conflict.state)).toBe(before);
  });

  it("rejects missing, mismatched, and actor-hidden evidence without mutation", () => {
    const initial = authoredState();
    const before = JSON.stringify(initial);

    const missing = materialize(initial, "missing-key", ironKeyProposal(), {
      kind: "released_narration",
      ref: "missing-evidence",
    });
    expect(missing).toMatchObject({ accepted: false, code: "materialization_evidence_unavailable" });
    expect(JSON.stringify(missing.state)).toBe(before);

    const swordProposal = {
      ...ironKeyProposal(),
      key: "requested-sword",
      name: "Requested sword",
      description: "A sword requested by the player but absent from public evidence.",
      tags: ["floor"],
    };
    const mismatch = materialize(initial, "requested-sword", swordProposal);
    expect(mismatch).toMatchObject({ accepted: false, code: "materialization_evidence_mismatch" });
    expect(JSON.stringify(mismatch.state)).toBe(before);

    const hidden = materialize(initial, "hidden-sword", swordProposal, {
      kind: "world_fact",
      ref: "hidden-sword",
    });
    expect(hidden).toMatchObject({ accepted: false, code: "materialization_evidence_unavailable" });
    expect(JSON.stringify(hidden.state)).toBe(before);
  });
});
