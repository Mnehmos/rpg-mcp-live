import { describe, expect, it } from "vitest";
import { LlmUsageLimitError } from "./llm-usage.js";
import { ProviderGateTimeoutError } from "./provider-gate.js";
import { ReferenceEngineNotRoutedError } from "./reference-engine-adapter.js";
import {
  ReferenceDmCommandInProgressError,
  ReferenceDmProviderUnavailableError,
  ReferenceDmVersionConflictError,
} from "./reference-engine-dm.js";
import { TurnHealth, providerFailureReason, turnFailure } from "./turn-failure.js";

function providerError(message: string, commitStatus: "not_committed" | "uncertain" = "not_committed") {
  return new ReferenceDmProviderUnavailableError(new Error(message), {
    commitStatus,
    phase: "tool_loop",
    providerCalls: 1,
    toolRounds: 0,
    toolCallNames: [],
    acceptedToolCalls: 0,
  });
}

describe("turn failure envelope", () => {
  it("names provider-account failures separately from transient outages", () => {
    expect(providerFailureReason(providerError("OpenRouter request failed with status 401: API key expired."))).toBe("provider_auth");
    expect(providerFailureReason(providerError("OpenRouter request failed with status 401: User not found."))).toBe("provider_auth");
    expect(providerFailureReason(providerError("OpenRouter request failed with status 402: Insufficient credits"))).toBe("provider_credit");
    expect(providerFailureReason(providerError("OpenRouter request failed with status 503: overloaded"))).toBe("provider_unavailable");
  });

  it("keeps the failure reason separate from commit uncertainty", () => {
    const expired = turnFailure(providerError("OpenRouter request failed with status 401: API key expired."));
    expect(expired).toMatchObject({ status: 502, reason: "provider_auth", commitStatus: "not_committed", systemFault: true });
    expect(expired.body).toMatchObject({ failureType: "not_committed", reason: "provider_auth", retryable: false });
    expect(String(expired.body.error)).toContain("offline on our side");

    const midTurn = turnFailure(providerError("socket hang up", "uncertain"));
    expect(midTurn).toMatchObject({ reason: "provider_unavailable", commitStatus: "uncertain" });
    expect(midTurn.body).toMatchObject({ failureType: "uncertain", retryable: false, stateChanged: "unknown" });
  });

  it("maps quota, capacity and request conflicts the same way on every transport", () => {
    const quota = turnFailure(new LlmUsageLimitError("monthly", 500_000, 10_000, 500_000, "LLM monthly usage limit reached."));
    expect(quota).toMatchObject({ status: 429, reason: "usage_limit", systemFault: false });
    expect(quota.body).toMatchObject({ failureType: "usage_limit", period: "monthly", retryable: false });

    const serviceWide = turnFailure(new LlmUsageLimitError("global_daily", 5_000_000, 10_000, 5_000_000, "LLM global daily usage limit reached."));
    expect(serviceWide).toMatchObject({ reason: "service_limit", systemFault: true });

    const busy = turnFailure(new ReferenceDmProviderUnavailableError(new ProviderGateTimeoutError(10_000, 3), {
      commitStatus: "not_committed", phase: "tool_loop", toolRounds: 0, toolCallNames: [], acceptedToolCalls: 0,
    }));
    expect(busy).toMatchObject({ status: 429, reason: "capacity", commitStatus: "not_committed", systemFault: true });

    expect(turnFailure(new ReferenceDmVersionConflictError(4))).toMatchObject({ status: 409, reason: "stale_version", systemFault: false });
    expect(turnFailure(new ReferenceDmCommandInProgressError())).toMatchObject({ status: 409, reason: "command_conflict", systemFault: false });
    expect(turnFailure(new ReferenceEngineNotRoutedError("campaign-1"))).toMatchObject({ status: 404, reason: "campaign_not_found" });
    expect(turnFailure(new Error("ECONNREFUSED"))).toMatchObject({ status: 502, reason: "engine_unavailable", systemFault: true });
  });
});

describe("commit uncertainty survives the failure reason", () => {
  const afterStateChange = (cause: Error) => new ReferenceDmProviderUnavailableError(cause, {
    commitStatus: "uncertain",
    phase: "tool_loop",
    providerCalls: 2,
    toolRounds: 1,
    toolCallNames: ["inventory_manage"],
    acceptedToolCalls: 1,
  });

  it("does not call a capacity refusal after an applied action safe to repeat", () => {
    const failure = turnFailure(afterStateChange(new ProviderGateTimeoutError(10_000, 2)));
    expect(failure).toMatchObject({ status: 502, reason: "capacity", commitStatus: "uncertain" });
    expect(failure.body).toMatchObject({ failureType: "uncertain", retryable: false, stateChanged: "unknown", acceptedToolCalls: 1 });
  });

  it("does not call a quota refusal after an applied action safe to repeat", () => {
    const failure = turnFailure(afterStateChange(new LlmUsageLimitError("turn", 0, 200_000, 100_000, "This provider request exceeds the per-request safety limit.")));
    expect(failure).toMatchObject({ status: 502, reason: "usage_limit", commitStatus: "uncertain" });
    expect(failure.body).toMatchObject({ failureType: "uncertain", retryable: false });
  });
});

describe("turn health", () => {
  it("counts only consecutive system faults and resets on any completed turn", () => {
    const health = new TurnHealth();
    health.recordFailure(turnFailure(providerError("status 401: API key expired")));
    health.recordFailure(turnFailure(new LlmUsageLimitError("monthly", 1, 1, 1, "limit")));
    health.recordFailure(turnFailure(new ReferenceDmVersionConflictError(2)));
    health.recordFailure(turnFailure(providerError("status 401: API key expired")));
    expect(health.snapshot()).toMatchObject({ consecutiveFailures: 2, lastFailureReason: "provider_auth" });

    health.recordSuccess();
    expect(health.snapshot()).toMatchObject({ consecutiveFailures: 0 });
    expect(health.snapshot().lastSuccessAt).not.toBeNull();
  });
});
