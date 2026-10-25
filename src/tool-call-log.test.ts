import { describe, expect, it } from "vitest";
import { REPLAY_RESULT_CHARACTER_LIMIT, toolCallLogLine, toolCallOutcome } from "./tool-call-log.js";

describe("tool_call log line", () => {
  it("keeps what changed and drops the prose", () => {
    const payload = {
      success: true,
      attack: { roll: 17, total: 21, ac: 15, hit: true, critical: false },
      damage: 9,
      target: { name: "Bandit", hpBefore: 11, hpAfter: 2, description: "A wiry bandit in a salt-stained coat, scarred across one cheek from an old knife fight." },
      narrative: "The arrow takes the bandit high in the shoulder.",
    };

    expect(toolCallOutcome(payload)).toEqual({
      success: true,
      "attack.roll": 17,
      "attack.total": 21,
      "attack.ac": 15,
      "attack.hit": true,
      "attack.critical": false,
      damage: 9,
      "target.hpBefore": 11,
      "target.hpAfter": 2,
    });
  });

  it("records size, acceptance, and whether history replay would truncate it", () => {
    const line = JSON.parse(toolCallLogLine({
      userId: "user_abc",
      campaignId: "campaign-1",
      name: "combat_action",
      args: { action: "attack", targetId: "bandit" },
      accepted: true,
      stateChanging: true,
      resultText: "x".repeat(REPLAY_RESULT_CHARACTER_LIMIT + 1),
      payload: { hit: true },
      durationMs: 812.4,
    }));

    expect(line).toMatchObject({
      event: "tool_call",
      name: "combat_action",
      action: "attack",
      accepted: true,
      stateChanging: true,
      durationMs: 812,
      resultChars: REPLAY_RESULT_CHARACTER_LIMIT + 1,
      exceedsReplayLimit: true,
      outcome: { hit: true },
    });
  });
});
