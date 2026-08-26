import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameStore } from "./store.js";
import { LlmUsageLimitError, LlmUsageStore, type LlmUsagePolicy } from "./llm-usage.js";

function policy(overrides: Partial<LlmUsagePolicy> = {}): LlmUsagePolicy {
  return {
    freeDailyCostMicros: 10,
    freeMonthlyCostMicros: 20,
    playerDailyCostMicros: 100,
    playerMonthlyTargetCostMicros: 150,
    playerMonthlyCostMicros: 200,
    globalDailyCostMicros: 1_000,
    globalMonthlyCostMicros: 2_000,
    turnAdmissionReserveCostMicros: 5,
    maxTurnCostMicros: 500,
    npcReserveCostMicros: 100,
    reservationTtlMs: 60_000,
    inputCostUsdPerMillion: 0.2,
    outputCostUsdPerMillion: 1.2,
    ...overrides,
  };
}

function createStores(policyOverride?: Partial<LlmUsagePolicy>): { game: GameStore; usage: LlmUsageStore } {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-usage-"));
  const game = new GameStore(join(directory, "game.db"));
  return { game, usage: new LlmUsageStore(game.getRawDb(), policy(policyOverride)) };
}

describe("LLM usage ledger", () => {
  it("settles provider cost and exposes token and dollar totals", () => {
    const { game, usage } = createStores();
    const reservation = usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 50,
      estimatedCostMicros: 8,
    });

    usage.settle(reservation.id, {
      provider: "openrouter",
      model: "test-model",
      providerRequestId: "provider-request-1",
      promptTokens: 100,
      completionTokens: 50,
      reasoningTokens: 10,
      totalTokens: 150,
      costMicros: 7,
      costSource: "provider",
    });

    expect(usage.getCommandUsage("player-1", "campaign-1", "command-1")).toMatchObject({
      calls: 1,
      promptTokens: 100,
      completionTokens: 50,
      reasoningTokens: 10,
      totalTokens: 150,
      costMicros: 7,
      costUsd: 0.000007,
    });
    expect(usage.getSummary("player-1").daily).toMatchObject({ costMicros: 7, totalTokens: 150 });
    game.close();
  });

  it("exposes UTC daily and monthly reset boundaries", () => {
    const { game, usage } = createStores();
    expect(usage.getSummary("player-1", new Date("2026-08-26T22:58:30.000Z")).resetsAt).toEqual({
      daily: "2026-08-27T00:00:00.000Z",
      monthly: "2026-09-01T00:00:00.000Z",
    });
    game.close();
  });

  it("counts active reservations before allowing another concurrent request", () => {
    const { game, usage } = createStores();
    usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 100,
      estimatedCostMicros: 8,
    });

    expect(() => usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-2",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 100,
      estimatedCostMicros: 3,
    })).toThrowError(LlmUsageLimitError);
    game.close();
  });

  it("uses the subscription tier when selecting the ceiling", () => {
    const { game, usage } = createStores();
    game.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      status: "active",
      priceId: "price_test",
      currentPeriodEnd: null,
    });
    usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 100,
      estimatedCostMicros: 50,
    });
    expect(usage.getSummary("player-1")).toMatchObject({
      plan: "player_pass",
      targets: { monthly: { costMicros: 150, costUsd: 0.00015 } },
      limits: { monthly: { costMicros: 200, costUsd: 0.0002 } },
    });
    game.close();
  });

  it("treats a completed Checkout as a Player Pass before the subscription webhook arrives", () => {
    const { game, usage } = createStores();
    game.upsertSubscription({
      userId: "player-1",
      stripeCustomerId: "cus_checkout",
      stripeSubscriptionId: "sub_checkout",
      status: "checkout_complete",
      priceId: "price_test",
      currentPeriodEnd: null,
    });

    expect(usage.getSummary("player-1")).toMatchObject({
      plan: "player_pass",
      limits: { monthly: { costMicros: 200, costUsd: 0.0002 } },
    });
    game.close();
  });

  it("admits once before mutation and lets every provider call in that command finish", () => {
    const { game, usage } = createStores({
      freeDailyCostMicros: 10,
      freeMonthlyCostMicros: 20,
    });
    usage.admitTurn({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      provider: "openrouter",
      model: "test-model",
    });

    const first = usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 100,
      estimatedCostMicros: 8,
      admittedTurn: true,
    });
    usage.settle(first.id, {
      provider: "openrouter",
      model: "test-model",
      promptTokens: 100,
      completionTokens: 100,
      costMicros: 12,
      costSource: "provider",
    });

    expect(() => usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 100,
      estimatedCostMicros: 8,
      admittedTurn: true,
    })).not.toThrow();
    expect(() => usage.admitTurn({
      userId: "player-1",
      campaignId: "campaign-2",
      clientCommandId: "command-2",
      provider: "openrouter",
      model: "test-model",
    })).toThrowError(LlmUsageLimitError);
    game.close();
  });

  it("keeps raw tokens as telemetry without using them as an admission ceiling", () => {
    const { game, usage } = createStores();
    const admission = usage.admitTurn({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      provider: "openrouter",
      model: "test-model",
    });
    const reservation = usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "dm",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 10_000,
      estimatedCompletionTokens: 5_000,
      estimatedCostMicros: 1,
      admittedTurn: true,
    });
    usage.settle(reservation.id, {
      provider: "openrouter",
      model: "test-model",
      promptTokens: 10_000,
      completionTokens: 5_000,
      costMicros: 1,
      costSource: "provider",
    });

    expect(usage.getSummary("player-1").monthly.totalTokens).toBe(15_000);
    usage.release(admission.id);
    expect(() => usage.admitTurn({
      userId: "player-1",
      campaignId: "campaign-2",
      clientCommandId: "command-2",
      provider: "openrouter",
      model: "test-model",
    })).not.toThrow();
    game.close();
  });

  it("admits standalone calls by dollars even after very large token telemetry", () => {
    const { game, usage } = createStores();
    const first = usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      source: "npc_agent",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 10_000_000,
      estimatedCompletionTokens: 1_000_000,
      estimatedCostMicros: 1,
    });
    usage.settle(first.id, {
      provider: "openrouter",
      model: "test-model",
      promptTokens: 10_000_000,
      completionTokens: 1_000_000,
      costMicros: 1,
      costSource: "provider",
    });

    expect(() => usage.reserve({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-2",
      source: "npc_agent",
      provider: "openrouter",
      model: "test-model",
      estimatedPromptTokens: 10_000_000,
      estimatedCompletionTokens: 1_000_000,
      estimatedCostMicros: 1,
    })).not.toThrow();
    expect(usage.getSummary("player-1").limits.daily).toEqual({
      costMicros: 10,
      costUsd: 0.00001,
    });
    game.close();
  });

  it("atomically counts in-flight turn admissions against the global brake", () => {
    const { game, usage } = createStores({
      freeDailyCostMicros: 100,
      freeMonthlyCostMicros: 100,
      globalDailyCostMicros: 15,
      globalMonthlyCostMicros: 15,
      turnAdmissionReserveCostMicros: 10,
    });
    const first = usage.admitTurn({
      userId: "player-1",
      campaignId: "campaign-1",
      clientCommandId: "command-1",
      provider: "openrouter",
      model: "test-model",
    });

    expect(() => usage.admitTurn({
      userId: "player-2",
      campaignId: "campaign-2",
      clientCommandId: "command-2",
      provider: "openrouter",
      model: "test-model",
    })).toThrowError(LlmUsageLimitError);
    usage.release(first.id);
    expect(() => usage.admitTurn({
      userId: "player-2",
      campaignId: "campaign-2",
      clientCommandId: "command-2",
      provider: "openrouter",
      model: "test-model",
    })).not.toThrow();
    game.close();
  });
});
