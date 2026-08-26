import { describe, expect, it } from "vitest";

import { usageLabel, usagePercent, usageResetAt, usageResetLabel } from "./usage-display.js";

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

  it("counts down to the daily reset while free play is available", () => {
    const summary = {
      plan: "free",
      daily: { costMicros: 5 },
      monthly: { costMicros: 5 },
      limits: { daily: { costMicros: 10 }, monthly: { costMicros: 20 } },
      resetsAt: { daily: "2026-08-27T00:00:00.000Z", monthly: "2026-09-01T00:00:00.000Z" },
    };

    expect(usageResetAt(summary)).toBe("2026-08-27T00:00:00.000Z");
    expect(usageResetLabel(summary, new Date("2026-08-26T22:58:30.000Z"))).toBe("NEXT RESET IN 1H 1M");
  });

  it("names the daily reset that lifts an exhausted free tier", () => {
    const summary = {
      plan: "free",
      daily: { costMicros: 10 },
      monthly: { costMicros: 10 },
      limits: { daily: { costMicros: 10 }, monthly: { costMicros: 20 } },
      resetsAt: { daily: "2026-08-27T00:00:00.000Z", monthly: "2026-09-01T00:00:00.000Z" },
    };

    expect(usageResetLabel(summary, new Date("2026-08-26T22:58:30.000Z"))).toBe("FREE PLAY IN 1H 1M");
  });

  it("uses the monthly reset when the monthly free limit is exhausted", () => {
    const summary = {
      plan: "free",
      daily: { costMicros: 5 },
      monthly: { costMicros: 20 },
      limits: { daily: { costMicros: 10 }, monthly: { costMicros: 20 } },
      resetsAt: { daily: "2026-08-27T00:00:00.000Z", monthly: "2026-09-01T00:00:00.000Z" },
    };

    expect(usageResetAt(summary)).toBe("2026-09-01T00:00:00.000Z");
    expect(usageResetLabel(summary, new Date("2026-08-26T22:00:00.000Z"))).toBe("FREE PLAY IN 5D 2H");
  });

  it("does not expose a countdown when the reset timestamp is absent", () => {
    expect(usageResetLabel({ plan: "free", daily: { costMicros: 10 }, limits: { daily: { costMicros: 10 } } })).toBe("");
  });

  it("does not keep displaying an expired countdown", () => {
    const summary = {
      plan: "free",
      daily: { costMicros: 10 },
      limits: { daily: { costMicros: 10 } },
      resetsAt: { daily: "2026-08-27T00:00:00.000Z" },
    };

    expect(usageResetLabel(summary, new Date("2026-08-27T00:00:01.000Z"))).toBe("");
  });
});
