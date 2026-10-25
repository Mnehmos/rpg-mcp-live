import { LlmUsageLimitError } from "./llm-usage.js";
import { ProviderGateAccountBusyError, ProviderGateTimeoutError } from "./provider-gate.js";
import { ReferenceEngineNotRoutedError, ReferenceEngineUnsupportedError } from "./reference-engine-adapter.js";
import {
  ReferenceDmCommandAlreadyFailedError,
  ReferenceDmCommandIdReuseError,
  ReferenceDmCommandInProgressError,
  ReferenceDmProviderUnavailableError,
  ReferenceDmVersionConflictError,
} from "./reference-engine-dm.js";

export const REFERENCE_DM_NOT_COMMITTED_MESSAGE =
  "The DM provider did not return a result; no game state was committed. Your action is safe to retry.";

const PROVIDER_OFFLINE_MESSAGE =
  "The Dungeon Master is offline on our side right now. Your campaign is safe and this turn was not committed; try again later.";

/**
 * Why a turn failed, kept separate from whether it changed state
 * (`commitStatus`). Every opening and turn transport answers with this one
 * envelope so quota, capacity, provider-account and engine problems reach the
 * player as themselves instead of a generic failure.
 */
export type TurnFailureReason =
  | "campaign_not_found"
  | "unsupported"
  | "command_conflict"
  | "command_id_reuse"
  | "stale_version"
  | "already_failed"
  | "capacity"
  | "usage_limit"
  | "service_limit"
  | "provider_auth"
  | "provider_credit"
  | "provider_unavailable"
  | "engine_unavailable";

export type CommitStatus = "not_committed" | "uncertain" | "unknown";

export interface TurnFailure {
  status: number;
  reason: TurnFailureReason;
  commitStatus: CommitStatus;
  /** True when the fault is ours (provider, engine, capacity), not the player's request or plan. */
  systemFault: boolean;
  body: Record<string, unknown>;
}

function causeChainText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof Error) parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

export function providerFailureReason(error: unknown): "provider_auth" | "provider_credit" | "provider_unavailable" {
  const text = causeChainText(error);
  if (/status 40[13]\b|api key|invalid_token|user not found|unauthori[sz]ed/i.test(text)) return "provider_auth";
  if (/status 402\b|insufficient (credits|funds|balance)|credit limit|key limit|out of credits/i.test(text)) return "provider_credit";
  return "provider_unavailable";
}

function failureTypeFor(commitStatus: CommitStatus): "not_committed" | "uncertain" {
  return commitStatus === "not_committed" ? "not_committed" : "uncertain";
}

export function turnFailure(error: unknown): TurnFailure {
  const make = (
    status: number,
    reason: TurnFailureReason,
    commitStatus: CommitStatus,
    systemFault: boolean,
    body: Record<string, unknown>,
  ): TurnFailure => ({
    status,
    reason,
    commitStatus,
    systemFault,
    body: { reason, commitStatus, stateChanged: commitStatus === "not_committed" ? "not_committed" : "unknown", ...body },
  });

  if (error instanceof ReferenceEngineNotRoutedError) {
    return make(404, "campaign_not_found", "not_committed", false, { code: "campaign_not_found", failureType: "campaign_not_found", retryable: false, error: error.message });
  }
  if (error instanceof ReferenceEngineUnsupportedError) {
    return make(409, "unsupported", "not_committed", false, { code: "unsupported_on_reference_backend", failureType: "unsupported", retryable: false, error: error.message });
  }
  if (error instanceof ReferenceDmCommandInProgressError) {
    return make(409, "command_conflict", "unknown", false, { code: "command_conflict", failureType: "command_conflict", retryable: false, error: error.message });
  }
  if (error instanceof ReferenceDmCommandIdReuseError) {
    return make(409, "command_id_reuse", "not_committed", false, { code: "command_id_reuse", failureType: "command_id_reuse", retryable: false, error: error.message });
  }
  if (error instanceof ReferenceDmVersionConflictError) {
    return make(409, "stale_version", "not_committed", false, { code: "stale_version", failureType: "stale_version", retryable: true, error: "The campaign changed before this turn started." });
  }
  if (error instanceof ReferenceDmCommandAlreadyFailedError) {
    const commitStatus: CommitStatus = error.details?.commitStatus === "not_committed" ? "not_committed" : "uncertain";
    return make(502, "already_failed", commitStatus, false, {
      code: "reference_dm_unavailable",
      failureType: failureTypeFor(commitStatus),
      retryable: commitStatus === "not_committed",
      error: commitStatus === "not_committed"
        ? REFERENCE_DM_NOT_COMMITTED_MESSAGE
        : "That turn already has a recorded failure. The table may have changed; refresh before continuing.",
      ...failureDetails(error.details ?? undefined),
    });
  }

  const gateError = error instanceof ProviderGateTimeoutError || error instanceof ProviderGateAccountBusyError
    ? error
    : error instanceof ReferenceDmProviderUnavailableError
      && (error.cause instanceof ProviderGateTimeoutError || error.cause instanceof ProviderGateAccountBusyError)
      ? error.cause
      : null;
  if (gateError) {
    // Refused before reaching the provider: definitively not committed.
    return make(429, "capacity", "not_committed", true, {
      code: gateError.code,
      failureType: "capacity",
      retryable: true,
      error: gateError.message,
      ...(gateError instanceof ProviderGateTimeoutError
        ? { waitedMs: gateError.waitedMs, queueDepth: gateError.queueDepth }
        : { inFlight: gateError.inFlight, limit: gateError.limit }),
    });
  }

  const usageError = error instanceof LlmUsageLimitError
    ? error
    : error instanceof ReferenceDmProviderUnavailableError && error.cause instanceof LlmUsageLimitError
      ? error.cause
      : null;
  if (usageError) {
    const serviceWide = usageError.period === "global_daily" || usageError.period === "global_monthly";
    return make(429, serviceWide ? "service_limit" : "usage_limit", "not_committed", serviceWide, {
      code: usageError.code,
      failureType: "usage_limit",
      retryable: false,
      error: usageError.message,
      period: usageError.period,
      limitMicros: usageError.limit,
      requestedMicros: usageError.requested,
    });
  }

  if (error instanceof ReferenceDmProviderUnavailableError) {
    const commitStatus: CommitStatus = error.details.commitStatus === "not_committed" ? "not_committed" : "uncertain";
    const reason = providerFailureReason(error);
    const offline = reason === "provider_auth" || reason === "provider_credit";
    return make(502, reason, commitStatus, true, {
      code: "reference_dm_unavailable",
      failureType: failureTypeFor(commitStatus),
      retryable: commitStatus === "not_committed" && !offline,
      error: commitStatus !== "not_committed"
        ? "The reference-engine DM stopped after a state change; refresh the table before continuing."
        : offline ? PROVIDER_OFFLINE_MESSAGE : REFERENCE_DM_NOT_COMMITTED_MESSAGE,
      ...failureDetails(error.details),
    });
  }

  return make(502, "engine_unavailable", "unknown", true, {
    code: "reference_engine_unavailable",
    failureType: "reference_engine_unavailable",
    retryable: true,
    error: "The reference engine is unavailable. Your campaign was not confirmed changed. Try again shortly.",
  });
}

function failureDetails(details: ReferenceDmProviderUnavailableError["details"] | undefined): Record<string, unknown> {
  if (!details) return {};
  return {
    correlationId: details.correlationId,
    phase: details.phase,
    providerCalls: details.providerCalls ?? 0,
    toolRounds: details.toolRounds,
    activatedTools: details.activatedTools ?? [],
    toolCallNames: details.toolCallNames,
    acceptedToolCalls: details.acceptedToolCalls,
    rejectedToolCalls: details.rejectedToolCalls ?? 0,
  };
}

/**
 * Consecutive system-fault failures across all players. A player's own
 * quota, a stale version or a duplicate command is not a system fault and
 * does not move it; any completed turn resets it.
 */
export class TurnHealth {
  private consecutiveFailures = 0;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastFailureReason: TurnFailureReason | null = null;

  public recordSuccess(now = new Date()): void {
    this.consecutiveFailures = 0;
    this.lastSuccessAt = now.toISOString();
  }

  public recordFailure(failure: TurnFailure, now = new Date()): void {
    if (!failure.systemFault) return;
    this.consecutiveFailures += 1;
    this.lastFailureAt = now.toISOString();
    this.lastFailureReason = failure.reason;
  }

  public snapshot(): { consecutiveFailures: number; lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureReason: TurnFailureReason | null } {
    return {
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastFailureReason: this.lastFailureReason,
    };
  }
}
