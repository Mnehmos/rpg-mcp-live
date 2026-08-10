import { describe, expect, it } from "vitest";
import {
  derivePlayerIntentClauses,
  uncoveredNarrationClauses,
  uncoveredPlanClauses,
} from "./engine-intent-coverage.js";

describe("compound player-intent coverage", () => {
  it("derives ordered entry and search clauses", () => {
    expect(derivePlayerIntentClauses(
      "I enter the shuttered ferry office and explicitly search the desk and walls for ledger, lamp, or use evidence.",
    )).toEqual([
      expect.objectContaining({ id: "intent-1", kind: "movement", text: "I enter the shuttered ferry office" }),
      expect.objectContaining({ id: "intent-2", kind: "search", text: expect.stringContaining("search the desk") }),
    ]);
    expect(derivePlayerIntentClauses("I enter the ferry office. I search the desk for the ledger."))
      .toEqual([
        expect.objectContaining({ kind: "movement" }),
        expect.objectContaining({ kind: "search" }),
      ]);
  });

  it("derives each coordinated direct question", () => {
    expect(derivePlayerIntentClauses(
      "I ask Mara when the bell rings, where she heard it, and why the stair is barred.",
    )).toEqual([
      expect.objectContaining({ id: "intent-1", kind: "question", text: expect.stringContaining("when the bell rings") }),
      expect.objectContaining({ id: "intent-2", kind: "question", text: "where she heard it" }),
      expect.objectContaining({ id: "intent-3", kind: "question", text: "why the stair is barred" }),
    ]);
  });

  it("does not let movement cover the search half of a compound plan", () => {
    const clauses = derivePlayerIntentClauses("I enter the ferry office and search the desk for the ledger.");
    const missing = uncoveredPlanClauses(clauses, [{
      command: { kind: "move", destinationId: "ferry-office" },
    }]);

    expect(missing.map((clause) => clause.kind)).toEqual(["search"]);
  });

  it("accepts an atomic move plus explicit bounded fictional search consequence", () => {
    const clauses = derivePlayerIntentClauses("I enter the ferry office and search the desk for the ledger.");
    const missing = uncoveredPlanClauses(clauses, [
      { command: { kind: "move", destinationId: "ferry-office" } },
      {
        command: {
          kind: "improvise",
          title: "A careful office search",
          description: "The search turns up no ledger, but confirms the desk has been cleared recently.",
          effectType: "fictional",
        },
      },
    ]);

    expect(missing).toEqual([]);
  });

  it("requires a distinct compatible public beat for every coordinated question", () => {
    const clauses = derivePlayerIntentClauses(
      "I ask Mara when the bell rings, where she heard it, and why the stair is barred.",
    );

    expect(uncoveredNarrationClauses(clauses, [
      { kind: "establishing" },
    ])).toHaveLength(3);
    expect(uncoveredNarrationClauses(clauses, [
      { kind: "dialogue" },
      { kind: "npc" },
      { kind: "dialogue" },
    ])).toEqual([]);
  });

  it("does not let one generic consequence beat stand in for both entry and search", () => {
    const clauses = derivePlayerIntentClauses("I enter the ferry office and search the desk for the ledger.");

    expect(uncoveredNarrationClauses(clauses, [{ kind: "consequence" }]))
      .toEqual([expect.objectContaining({ kind: "search" })]);
    expect(uncoveredNarrationClauses(clauses, [
      { kind: "establishing" },
      { kind: "sensory" },
    ])).toEqual([]);
  });
});
