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
    freeDailyPromptTokens: 1_000,
    freeDailyCompletionTokens: 1_000,
    freeMonthlyPromptTokens: 2_000,
    freeMonthlyCompletionTokens: 2_000,
    playerDailyCostMicros: 100,
    playerMonthlyCostMicros: 200,
    playerDailyPromptTokens: 10_000,
    playerDailyCompletionTokens: 10_000,
    playerMonthlyPromptTokens: 20_000,
    playerMonthlyCompletionTokens: 20_000,
    globalDailyCostMicros: 1_000,
    globalMonthlyCostMicros: 2_000,
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
    expect(usage.getSummary("player-1").plan).toBe("player_pass");
    game.close();
  });
});
