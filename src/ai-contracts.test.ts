import { describe, expect, it } from "vitest";
import { actionIntentSchema, narrationEnvelopeSchema } from "./ai-contracts.js";

describe("DM adapter contracts", () => {
  it("accepts a bounded ability-check proposal", () => {
    const result = actionIntentSchema.safeParse({
      kind: "ability_check",
      ability: "wis",
      skill: "perception",
      goal: "Study the lantern for a hidden mechanism.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects narration that tries to smuggle an untyped fact", () => {
    const result = narrationEnvelopeSchema.safeParse({
      text: "The lantern answers.",
      proposedFacts: [{ kind: "change_everything", value: "win" }],
      suggestedActions: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a bounded player prompt for a generated move", () => {
    const result = narrationEnvelopeSchema.safeParse({
      text: "The courier watches your hands.",
      proposedFacts: [],
      suggestedActions: [{
        id: "speak-courier",
        label: "Question the courier",
        prompt: "I ask the courier why they keep watching my hands.",
      }],
    });

    expect(result.success).toBe(true);
  });
});
