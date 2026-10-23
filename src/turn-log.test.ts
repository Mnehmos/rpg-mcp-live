import { describe, expect, it } from "vitest";
import type { ReferenceTurnResult } from "./reference-engine-dm.js";
import { turnCompletedLogLine } from "./turn-log.js";

const result = {
  campaignId: "campaign-1",
  clientCommandId: "command-1",
  campaignVersion: 7,
  narration: { text: "The fog parts over the harbor.", proposedFacts: [], suggestedActions: [] },
  narrationSource: "llm",
  toolDisclosure: null,
  session: {},
  replayed: false,
  turnUsage: {
    calls: 3,
    promptTokens: 1000,
    cachedPromptTokens: 0,
    completionTokens: 200,
    reasoningTokens: 0,
    totalTokens: 1200,
    costMicros: 1234,
    costUsd: 0.001234,
  },
  diagnostics: {
    providerCalls: 3,
    toolRounds: 2,
    activatedTools: [],
    toolCallNames: ["scene_manage"],
    acceptedToolCalls: 2,
    acceptedStateChangingToolCalls: 1,
    rejectedToolCalls: 0,
  },
} as unknown as ReferenceTurnResult;

describe("turn_completed log line", () => {
  it("records who played, how long it took, and what it cost", () => {
    const line = JSON.parse(turnCompletedLogLine("turn", "user_abc", "free", result, 31_480.6, true));

    expect(line).toEqual({
      event: "turn_completed",
      kind: "turn",
      userId: "user_abc",
      plan: "free",
      campaignId: "campaign-1",
      campaignVersion: 7,
      replayed: false,
      streamed: true,
      durationMs: 31_481,
      costUsd: 0.001234,
      providerCalls: 3,
      toolRounds: 2,
      stateChanges: 1,
    });
  });

  it("never carries narration or player text", () => {
    const line = turnCompletedLogLine("opening", "user_abc", "player", result, 100, false);

    expect(line).not.toContain("fog parts");
    expect(line).not.toContain("narration");
  });
});
