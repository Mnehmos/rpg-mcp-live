import { describe, expect, it } from "vitest";
import {
  compileRuntimeContent,
  contentProposalSchema,
  normalizeRuntimeContentState,
} from "./runtime-compiler.js";

const context = {
  campaignId: "campaign-131",
  authorId: "dm-1",
  source: "dm" as const,
  sourceRefs: ["command-1"],
  createdAt: "2026-08-10T12:00:00.000Z",
};

describe("strict runtime content compiler", () => {
  it("compiles an inert item with separate definition and instance ids", () => {
    const result = compileRuntimeContent({
      kind: "item",
      key: "bronze-key",
      name: "Bronze key",
      description: "A plain key with no assigned mechanics.",
      tags: ["mundane"],
      category: "tool",
      material: "bronze",
      weight: 0.1,
      affordances: ["inspect", "take"],
    }, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.id).toMatch(/^runtime:item:bronze-key-/);
    expect(result.instance?.definitionId).toBe(result.definition.id);
    expect(result.definition.executionTier).toBe(0);
    expect(result.definition.capabilities).toEqual(["inventory"]);
    expect(result.definition.provenance).toMatchObject({
      campaignId: context.campaignId,
      authorId: context.authorId,
      compilerRevision: "runtime-content-v1",
      policyRevision: "runtime-content-policy-v1",
    });
  });

  it("compiles a location parent relationship outside the definition", () => {
    const result = compileRuntimeContent({
      kind: "location",
      key: "north-gate",
      name: "North gate",
      description: "A gate into the city.",
      tags: [],
      locationKind: "building",
      parentKey: "old-city",
      features: ["portcullis"],
      exits: [{ key: "road", label: "North road", kind: "road" }],
    }, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition).not.toHaveProperty("state");
    expect(result.instance).toMatchObject({ kind: "location", state: { status: "active" } });
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({ relation: "located_in", fromId: result.instance?.id });
  });

  it("keeps spell proposals descriptive and rejects unreviewed mechanics", () => {
    const valid = contentProposalSchema.safeParse({
      kind: "spell",
      key: "lantern-glow",
      name: "Lantern glow",
      description: "A small light described without executable effects.",
      tags: ["light"],
      school: "evocation",
      level: 0,
      intent: "Create a visible light source.",
    });
    expect(valid.success).toBe(true);

    const unsafeProposal = {
      kind: "spell",
      key: "unsafe-fire",
      name: "Unsafe fire",
      description: "This includes an unreviewed damage primitive.",
      tags: [],
      school: "evocation",
      level: 1,
      intent: "Burn a target.",
      damageDice: "10d6",
    };
    const invalid = contentProposalSchema.safeParse(unsafeProposal);
    expect(invalid.success).toBe(false);
    expect(compileRuntimeContent(unsafeProposal, context).ok).toBe(false);
  });

  it("is deterministic for the same proposal and context and normalizes duplicate state", () => {
    const proposal = {
      kind: "item" as const,
      key: "rope",
      name: "Rope",
      description: "A length of hemp rope.",
      tags: [],
      category: "tool" as const,
      material: "hemp",
      weight: 5,
      affordances: ["take"] as const,
    };
    const first = compileRuntimeContent(proposal, context);
    const second = compileRuntimeContent(proposal, context);
    expect(second).toEqual(first);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const normalized = normalizeRuntimeContentState({
      definitions: [first.definition, first.definition],
      instances: [first.instance, first.instance],
      relationships: [],
    });
    expect(normalized.definitions).toHaveLength(1);
    expect(normalized.instances).toHaveLength(1);
  });
});
