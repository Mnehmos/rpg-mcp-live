import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { createInitialCampaign, resolveEngineCommand } from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";
import type { RequestContext } from "./engine-contracts.js";
import type { ModelUsageTelemetry } from "./usage-ledger.js";

function createFixture(): { store: LanternEngineStore; path: string; context: RequestContext } {
  const directory = mkdtempSync(join(tmpdir(), "lantern-usage-"));
  const path = join(directory, "engine.db");
  const store = new LanternEngineStore(path);
  const state = createInitialCampaign("account-a", "actor-a");
  store.createCampaign({
    requestId: randomUUID(),
    accountId: state.accountId,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  }, state);
  return {
    store,
    path,
    context: {
      requestId: randomUUID(),
      accountId: state.accountId,
      campaignId: state.id,
      actorId: state.actorId,
      capabilities: ["player", "dm"],
    },
  };
}

function usage(overrides: Partial<ModelUsageTelemetry> = {}): ModelUsageTelemetry {
  return {
    provider: "openrouter",
    selection: "primary",
    accountId: "account-a",
    campaignId: "campaign-a",
    actorId: "actor-a",
    requestId: "request-a",
    clientCommandId: "command-a",
    dmRunId: "run-a",
    requestSequence: 1,
    purpose: "player_turn",
    toolsEnabled: true,
    requestedModel: "model-a",
    resolvedModel: "model-a",
    providerRoute: "openrouter.ai",
    inputTokens: 10_000,
    cachedInputTokens: null,
    reasoningTokens: null,
    outputTokens: 100,
    totalTokens: 10_100,
    costMicrousd: 5_000,
    costSource: "provider_reported",
    latencyMs: 100,
    ttftMs: 20,
    status: "success",
    finishReason: "stop",
    toolCallCount: 1,
    createdAt: "2026-08-10T00:00:00.000Z",
    completedAt: "2026-08-10T00:00:00.100Z",
    ...overrides,
  };
}

function commitPlayerTurn(fixture: ReturnType<typeof createFixture>): void {
  const { store, context } = fixture;
  const command = { kind: "declare" as const, goal: "I look around." };
  const current = store.getCampaign(context);
  store.executeCommand({
    context,
    clientCommandId: "command-a",
    expectedCampaignVersion: current.version,
    command,
    tool: "declare",
    playerText: "I look around.",
    resolve: (state) => resolveEngineCommand(state, context, "command-a", command, "declare", "I look around."),
  });
}

describe("durable model usage ledger", () => {
  it("aggregates a three-request turn and makes duplicate telemetry idempotent", () => {
    const fixture = createFixture();
    commitPlayerTurn(fixture);
    const { store } = fixture;
    store.recordModelUsage(usage({ campaignId: fixture.context.campaignId, requestSequence: 1, providerRequestId: "provider-a", inputTokens: 10_000, outputTokens: 100, totalTokens: 10_100, costMicrousd: 5_000 }));
    store.recordModelUsage(usage({
      campaignId: fixture.context.campaignId,
      requestSequence: 2,
      inputTokens: 12_000,
      cachedInputTokens: 2_000,
      reasoningTokens: 50,
      outputTokens: 150,
      totalTokens: 12_150,
      costMicrousd: 6_000,
      selection: "fallback",
    }));
    store.recordModelUsage(usage({
      campaignId: fixture.context.campaignId,
      requestSequence: 3,
      inputTokens: 13_000,
      outputTokens: 500,
      totalTokens: 13_500,
      costMicrousd: 8_000,
      purpose: "narration_repair",
    }));
    const duplicate = store.recordModelUsage(usage({ campaignId: fixture.context.campaignId, requestSequence: 2, inputTokens: 999, outputTokens: 999, totalTokens: 1_998, costMicrousd: 999_000 }));
    store.recordModelUsage(usage({
      campaignId: fixture.context.campaignId,
      requestSequence: 4,
      dmRunId: "recovered-run",
      providerRequestId: "provider-a",
    }));
    const summary = store.getModelUsageSummary({ accountId: "account-a", campaignId: fixture.context.campaignId });

    expect(duplicate?.inputTokens).toBe(12_000);
    expect(summary).toMatchObject({
      requestCount: 3,
      playerTurnCount: 1,
      modelBackedTurnCount: 1,
      zeroModelTurnCount: 0,
      inputTokens: 35_000,
      cachedInputTokens: 2_000,
      reasoningTokens: 50,
      outputTokens: 750,
      totalTokens: 35_750,
      costMicrousd: 19_000,
      successfulRequestCount: 3,
      failureCount: 0,
      fallbackCount: 1,
      repairCount: 1,
      averageRequestsPerModelBackedTurn: 3,
      p50RequestsPerModelBackedTurn: 3,
      p95RequestsPerModelBackedTurn: 3,
    });
    expect(summary.byProviderModel).toEqual([expect.objectContaining({ provider: "openrouter", model: "model-a", requestCount: 3, costMicrousd: 19_000 })]);
    expect(summary.byPurpose).toEqual([
      { purpose: "narration_repair", requestCount: 1, costMicrousd: 8_000 },
      { purpose: "player_turn", requestCount: 2, costMicrousd: 11_000 },
    ]);
  });

  it("persists across store restart, isolates accounts, and retains evidence after campaign deletion", () => {
    const fixture = createFixture();
    commitPlayerTurn(fixture);
    fixture.store.recordModelUsage(usage({ campaignId: fixture.context.campaignId }));
    const other = usage({
      accountId: "account-b",
      campaignId: "campaign-b",
      actorId: "actor-b",
      clientCommandId: "command-b",
      dmRunId: "run-b",
      costMicrousd: 7_000,
    });
    fixture.store.recordModelUsage(other);
    const beforeDelete = fixture.store.getCampaign(fixture.context);
    fixture.store.deleteCampaign(fixture.context, beforeDelete.version);
    fixture.store.close();

    const reopened = new LanternEngineStore(fixture.path);
    const accountSummary = reopened.getModelUsageSummary({ accountId: "account-a" });
    const globalSummary = reopened.getModelUsageSummary();
    expect(accountSummary.requestCount).toBe(1);
    expect(accountSummary.costMicrousd).toBe(5_000);
    expect(globalSummary.requestCount).toBe(2);
    expect(globalSummary.costMicrousd).toBe(12_000);
    reopened.close();
  });

  it("supports bounded date, model, provider, and command filters without storing content", () => {
    const fixture = createFixture();
    fixture.store.recordModelUsage(usage({ campaignId: fixture.context.campaignId, createdAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:00:00.100Z" }));
    fixture.store.recordModelUsage(usage({
      campaignId: fixture.context.campaignId,
      requestSequence: 2,
      clientCommandId: "command-other",
      dmRunId: "run-other",
      requestedModel: "model-b",
      resolvedModel: "model-b",
      provider: "openrouter",
      createdAt: "2026-08-10T00:00:00.000Z",
      completedAt: "2026-08-10T00:00:00.100Z",
    }));

    expect(fixture.store.getModelUsageSummary({ from: "2026-08-09", to: "2026-08-11", model: "model-b" }).requestCount).toBe(1);
    expect(fixture.store.getModelUsageSummary({ clientCommandId: "command-a" }).requestCount).toBe(1);
    expect(fixture.store.getModelUsageSummary({ provider: "not-a-provider" }).requestCount).toBe(0);
  });

  it("does not mistake opening or read-only commands for player turns", () => {
    const fixture = createFixture();
    commitPlayerTurn(fixture);
    fixture.store.recordModelUsage(usage({ campaignId: fixture.context.campaignId }));
    const current = fixture.store.getCampaign(fixture.context);
    const command = { kind: "observe" as const };
    fixture.store.executeCommand({
      context: fixture.context,
      clientCommandId: "opening-command",
      expectedCampaignVersion: current.version,
      command,
      tool: "observe",
      resolve: (state) => resolveEngineCommand(state, fixture.context, "opening-command", command, "observe"),
    });
    fixture.store.recordModelUsage(usage({
      campaignId: fixture.context.campaignId,
      clientCommandId: "opening-command",
      dmRunId: "opening-run",
      purpose: "opening",
      requestSequence: 1,
    }));

    const summary = fixture.store.getModelUsageSummary({ campaignId: fixture.context.campaignId });
    expect(summary.playerTurnCount).toBe(1);
    expect(summary.modelBackedTurnCount).toBe(1);
    expect(summary.zeroModelTurnCount).toBe(0);
    expect(summary.averageRequestsPerModelBackedTurn).toBe(1);
    fixture.store.close();
  });
});
