import { describe, expect, it } from "vitest";
import {
  reconcileAbilityScoreAssignments,
  uniqueAbilityScoreOptions,
} from "./ability-score-pool.js";

describe("ability score assignment pool", () => {
  it("swaps the displaced standard-array score when a used value is selected", () => {
    const result = reconcileAbilityScoreAssignments(
      { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 },
      [15, 14, 13, 12, 10, 8],
      "dex"
    );

    expect(result).toEqual({ str: 14, dex: 15, con: 13, int: 12, wis: 10, cha: 8 });
  });

  it("preserves the exact multiplicity of duplicate rolled values", () => {
    const result = reconcileAbilityScoreAssignments(
      { str: 16, dex: 16, con: 16, int: 12, wis: 10, cha: 8 },
      [16, 16, 14, 12, 10, 8],
      "con"
    );

    expect(Object.values(result).sort(function (a, b) { return a - b; }))
      .toEqual([8, 10, 12, 14, 16, 16]);
    expect(result.con).toBe(16);
    expect(Object.values(result).filter(function (score) { return score === 16; })).toHaveLength(2);
    expect(uniqueAbilityScoreOptions([16, 16, 14, 12, 10, 8])).toEqual([16, 14, 12, 10, 8]);
  });
});
