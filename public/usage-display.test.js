import { describe, expect, it } from "vitest";

import { usageLabel, usagePercent } from "./usage-display.js";

describe("player-facing usage display", () => {
  it("uses the plan target instead of exposing dollar or token values", () => {
    const summary = {
      plan: "player_pass",
      monthly: { costMicros: 500_000 },
      targets: { monthly: { costMicros: 2_000_000 } },
      limits: { monthly: { costMicros: 10_000_000 } },
    };

    expect(usagePercent(summary)).toBe(25);
    expect(usageLabel(summary)).toBe("PLAYER PASS · USAGE 25% USED");
  });

  it("clamps over-budget values and supports the free tier", () => {
    const summary = {
      plan: "free",
      monthly: { costMicros: 400_000 },
      targets: { monthly: { costMicros: 250_000 } },
    };

    expect(usagePercent(summary)).toBe(100);
    expect(usageLabel(summary)).toBe("FREE · USAGE 100% USED");
  });

  it("does not invent a percentage when the server provides no budget", () => {
    expect(usagePercent({ monthly: { costMicros: 1 } })).toBeNull();
    expect(usageLabel({ monthly: { costMicros: 1 } })).toBe("");
  });
});
