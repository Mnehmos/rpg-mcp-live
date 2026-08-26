import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type LlmUsagePlan = "free" | "player_pass";
export type LlmUsageSource = "dm" | "npc_agent";
export type LlmUsageCostSource = "provider" | "provider_upstream" | "estimated";

export interface LlmUsagePolicy {
  freeDailyCostMicros: number;
  freeMonthlyCostMicros: number;
  playerDailyCostMicros: number;
  playerMonthlyTargetCostMicros: number;
  playerMonthlyCostMicros: number;
  globalDailyCostMicros: number;
  globalMonthlyCostMicros: number;
  turnAdmissionReserveCostMicros: number;
  maxTurnCostMicros: number;
  npcReserveCostMicros: number;
  reservationTtlMs: number;
  inputCostUsdPerMillion: number;
  outputCostUsdPerMillion: number;
}

export interface LlmUsageActual {
  provider: string;
  model: string;
  providerRequestId?: string | null;
  promptTokens: number;
  cachedPromptTokens?: number | null;
  completionTokens: number;
  reasoningTokens?: number | null;
  totalTokens?: number;
  costMicros: number;
  costSource: LlmUsageCostSource;
}

export interface LlmUsageReservationInput {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  source: LlmUsageSource;
  provider: string;
  model: string;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostMicros: number;
  /** The command already passed the cost-only gate before any world mutation. */
  admittedTurn?: boolean;
}

export interface LlmTurnAdmissionInput {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  provider: string;
  model: string;
}

export interface LlmUsageReservation {
  id: string;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostMicros: number;
}

export interface LlmUsageBucket {
  calls: number;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costMicros: number;
  costUsd: number;
}

export interface LlmUsageLimitBucket {
  costMicros: number;
  costUsd: number;
}

export interface LlmUsageSummary {
  plan: LlmUsagePlan;
  currency: "USD";
  daily: LlmUsageBucket;
  monthly: LlmUsageBucket;
  resetsAt: {
    daily: string;
    monthly: string;
  };
  targets: {
    monthly: Pick<LlmUsageLimitBucket, "costMicros" | "costUsd">;
  };
  limits: {
    daily: LlmUsageLimitBucket;
    monthly: LlmUsageLimitBucket;
    global: {
      dailyCostMicros: number;
      dailyCostUsd: number;
      monthlyCostMicros: number;
      monthlyCostUsd: number;
    };
  };
  remaining: {
    daily: LlmUsageLimitBucket;
    monthly: LlmUsageLimitBucket;
  };
}

interface AggregateRow {
  calls: number | null;
  prompt_tokens: number | null;
  cached_prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  cost_micros: number | null;
}

interface ReservationRow {
  id: string;
  estimated_prompt_tokens: number;
  estimated_completion_tokens: number;
  estimated_cost_micros: number;
  status: "reserved" | "settled" | "released" | "expired";
}

export class LlmUsageLimitError extends Error {
  public readonly code = "llm_usage_limit_exceeded";
  public readonly period: "turn" | "daily" | "monthly" | "global_daily" | "global_monthly";
  public readonly used: number;
  public readonly requested: number;
  public readonly limit: number;

  public constructor(
    period: "turn" | "daily" | "monthly" | "global_daily" | "global_monthly",
    used: number,
    requested: number,
    limit: number,
    message: string,
  ) {
    super(message);
    this.name = "LlmUsageLimitError";
    this.period = period;
    this.used = used;
    this.requested = requested;
    this.limit = limit;
  }
}

/**
 * Account-bound usage ledger for every provider completion made by the web
 * host. Player commands use a cost-only admission gate before mutation;
 * reservations retain exact call attribution and protect standalone calls.
 */
export class LlmUsageStore {
  public constructor(private readonly db: Database.Database, private readonly policy: LlmUsagePolicy) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('dm', 'npc_agent')),
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_request_id TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        cached_prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_micros INTEGER NOT NULL DEFAULT 0,
        cost_source TEXT NOT NULL CHECK (cost_source IN ('provider', 'provider_upstream', 'estimated')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created
        ON llm_usage(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_llm_usage_command
        ON llm_usage(user_id, campaign_id, client_command_id);

      CREATE TABLE IF NOT EXISTS llm_usage_reservations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('dm', 'npc_agent')),
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        estimated_prompt_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_completion_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released', 'expired')),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        settled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_llm_usage_reservations_scope
        ON llm_usage_reservations(user_id, status, expires_at);
    `);
    const usageColumns = this.db.prepare("PRAGMA table_info(llm_usage)").all() as Array<{ name: string }>;
    if (!usageColumns.some((column) => column.name === "cached_prompt_tokens")) {
      this.db.exec("ALTER TABLE llm_usage ADD COLUMN cached_prompt_tokens INTEGER NOT NULL DEFAULT 0");
    }
  }

  /**
   * Admit a complete player command before the DM can mutate world state.
   * Settled dollar cost plus short-lived in-flight turn reservations form the
   * product gate. Once admitted, provider calls for this command may finish
   * regardless of raw token totals; only settled and reserved USD cost controls
   * admission. If the command overshoots a cost cap, the next command is then
   * rejected at this boundary.
   */
  public admitTurn(input: LlmTurnAdmissionInput, now = new Date()): LlmUsageReservation {
    const estimatedCostMicros = nonnegativeInteger(this.policy.turnAdmissionReserveCostMicros);
    const admission: LlmUsageReservation = {
      id: randomUUID(),
      estimatedPromptTokens: 0,
      estimatedCompletionTokens: 0,
      estimatedCostMicros,
    };
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.policy.reservationTtlMs).toISOString();

    const transaction = this.db.transaction(() => {
      this.expireReservations(nowIso);
      const plan = this.planForUser(input.userId);
      const limits = this.limitsForPlan(plan);
      const periods = periodBoundaries(now);
      const userDaily = this.aggregateUser(input.userId, periods.dailyStart);
      const userMonthly = this.aggregateUser(input.userId, periods.monthlyStart);
      const userReserved = this.aggregateReservations(input.userId);
      const globalDaily = this.aggregateAll(periods.dailyStart);
      const globalMonthly = this.aggregateAll(periods.monthlyStart);
      const globalReserved = this.aggregateAllReservations();

      assertWithin("daily", (userDaily.cost_micros ?? 0) + userReserved.costMicros, estimatedCostMicros, limits.dailyCostMicros);
      assertWithin("monthly", (userMonthly.cost_micros ?? 0) + userReserved.costMicros, estimatedCostMicros, limits.monthlyCostMicros);
      assertWithin("global_daily", (globalDaily.cost_micros ?? 0) + globalReserved.dailyCostMicros, estimatedCostMicros, this.policy.globalDailyCostMicros);
      assertWithin("global_monthly", (globalMonthly.cost_micros ?? 0) + globalReserved.monthlyCostMicros, estimatedCostMicros, this.policy.globalMonthlyCostMicros);

      this.db
        .prepare(
          `INSERT INTO llm_usage_reservations (
             id, user_id, campaign_id, client_command_id, source, provider, model,
             estimated_prompt_tokens, estimated_completion_tokens, estimated_cost_micros,
             status, expires_at, created_at
           ) VALUES (?, ?, ?, ?, 'dm', ?, ?, 0, 0, ?, 'reserved', ?, ?)`,
        )
        .run(
          admission.id,
          input.userId,
          input.campaignId,
          input.clientCommandId,
          input.provider,
          input.model,
          estimatedCostMicros,
          expiresAt,
          nowIso,
        );
    });
    transaction.immediate();
    return admission;
  }

  public reserve(input: LlmUsageReservationInput): LlmUsageReservation {
    const estimatedPromptTokens = nonnegativeInteger(input.estimatedPromptTokens);
    const estimatedCompletionTokens = nonnegativeInteger(input.estimatedCompletionTokens);
    const estimatedCostMicros = nonnegativeInteger(input.estimatedCostMicros);
    if (estimatedCostMicros > this.policy.maxTurnCostMicros) {
      throw new LlmUsageLimitError(
        "turn",
        0,
        estimatedCostMicros,
        this.policy.maxTurnCostMicros,
        "This provider request exceeds the per-request safety limit.",
      );
    }

    const reservation = {
      id: randomUUID(),
      ...input,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostMicros,
    };
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.policy.reservationTtlMs).toISOString();

    const transaction = this.db.transaction(() => {
      this.expireReservations(nowIso);
      if (!input.admittedTurn) {
        const plan = this.planForUser(input.userId);
        const limits = this.limitsForPlan(plan);
        const periods = periodBoundaries(now);
        const userDaily = this.aggregateUser(input.userId, periods.dailyStart);
        const userMonthly = this.aggregateUser(input.userId, periods.monthlyStart);
        const userReserved = this.aggregateReservations(input.userId);
        const globalDaily = this.aggregateAll(periods.dailyStart);
        const globalMonthly = this.aggregateAll(periods.monthlyStart);
        const globalReserved = this.aggregateAllReservations();

        assertWithin("daily", (userDaily.cost_micros ?? 0) + userReserved.costMicros, estimatedCostMicros, limits.dailyCostMicros);
        assertWithin("monthly", (userMonthly.cost_micros ?? 0) + userReserved.costMicros, estimatedCostMicros, limits.monthlyCostMicros);
        assertWithin("global_daily", (globalDaily.cost_micros ?? 0) + globalReserved.dailyCostMicros, estimatedCostMicros, this.policy.globalDailyCostMicros);
        assertWithin("global_monthly", (globalMonthly.cost_micros ?? 0) + globalReserved.monthlyCostMicros, estimatedCostMicros, this.policy.globalMonthlyCostMicros);
      }

      this.db
        .prepare(
          `INSERT INTO llm_usage_reservations (
             id, user_id, campaign_id, client_command_id, source, provider, model,
             estimated_prompt_tokens, estimated_completion_tokens, estimated_cost_micros,
             status, expires_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
        )
        .run(
          reservation.id,
          input.userId,
          input.campaignId,
          input.clientCommandId,
          input.source,
          input.provider,
          input.model,
          estimatedPromptTokens,
          estimatedCompletionTokens,
          estimatedCostMicros,
          expiresAt,
          nowIso,
        );
    });
    transaction.immediate();

    return {
      id: reservation.id,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostMicros,
    };
  }

  public settle(reservationId: string, actual: LlmUsageActual): void {
    const promptTokens = nonnegativeInteger(actual.promptTokens);
    const cachedPromptTokens = nonnegativeInteger(actual.cachedPromptTokens ?? 0);
    const completionTokens = nonnegativeInteger(actual.completionTokens);
    const reasoningTokens = nonnegativeInteger(actual.reasoningTokens ?? 0);
    const totalTokens = nonnegativeInteger(actual.totalTokens ?? promptTokens + completionTokens);
    const costMicros = nonnegativeInteger(actual.costMicros);
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      const reservation = this.db
        .prepare(
          `SELECT id, estimated_prompt_tokens, estimated_completion_tokens,
                  estimated_cost_micros, status
           FROM llm_usage_reservations WHERE id = ?`,
        )
        .get(reservationId) as ReservationRow | undefined;
      if (!reservation) throw new Error(`Unknown LLM usage reservation ${reservationId}.`);
      if (reservation.status === "settled") return;
      if (reservation.status !== "reserved") {
        throw new Error(`LLM usage reservation ${reservationId} is no longer active.`);
      }

      const reservationScope = this.db
        .prepare(
          `SELECT user_id, campaign_id, client_command_id, source
           FROM llm_usage_reservations WHERE id = ?`,
        )
        .get(reservationId) as {
          user_id: string;
          campaign_id: string;
          client_command_id: string;
          source: LlmUsageSource;
        } | undefined;
      if (!reservationScope) throw new Error(`Unknown LLM usage reservation ${reservationId}.`);

      this.db
        .prepare(
          `INSERT INTO llm_usage (
             id, user_id, campaign_id, client_command_id, source, provider, model,
             provider_request_id, prompt_tokens, cached_prompt_tokens, completion_tokens, reasoning_tokens,
             total_tokens, cost_micros, cost_source, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reservationId,
          reservationScope.user_id,
          reservationScope.campaign_id,
          reservationScope.client_command_id,
          reservationScope.source,
          actual.provider,
          actual.model,
          actual.providerRequestId ?? null,
          promptTokens,
          cachedPromptTokens,
          completionTokens,
          reasoningTokens,
          totalTokens,
          costMicros,
          actual.costSource,
          now,
        );
      this.db
        .prepare("UPDATE llm_usage_reservations SET status = 'settled', settled_at = ? WHERE id = ?")
        .run(now, reservationId);
    });
    transaction.immediate();
  }

  public release(reservationId: string): void {
    this.db
      .prepare(
        `UPDATE llm_usage_reservations
         SET status = 'released', settled_at = ?
         WHERE id = ? AND status = 'reserved'`,
      )
      .run(new Date().toISOString(), reservationId);
  }

  public getSummary(userId: string, now = new Date()): LlmUsageSummary {
    const plan = this.planForUser(userId);
    const limits = this.limitsForPlan(plan);
    const periods = periodBoundaries(now);
    const daily = mapBucket(this.aggregateUser(userId, periods.dailyStart));
    const monthly = mapBucket(this.aggregateUser(userId, periods.monthlyStart));
    const dailyLimit = mapLimit(limits.dailyCostMicros);
    const monthlyLimit = mapLimit(limits.monthlyCostMicros);
    const monthlyTargetCostMicros = plan === "player_pass"
      ? Math.min(this.policy.playerMonthlyTargetCostMicros, limits.monthlyCostMicros)
      : limits.monthlyCostMicros;
    return {
      plan,
      currency: "USD",
      daily,
      monthly,
      resetsAt: {
        daily: periods.dailyResetAt,
        monthly: periods.monthlyResetAt,
      },
      targets: {
        monthly: {
          costMicros: monthlyTargetCostMicros,
          costUsd: microsToUsd(monthlyTargetCostMicros),
        },
      },
      limits: {
        daily: dailyLimit,
        monthly: monthlyLimit,
        global: {
          dailyCostMicros: this.policy.globalDailyCostMicros,
          dailyCostUsd: microsToUsd(this.policy.globalDailyCostMicros),
          monthlyCostMicros: this.policy.globalMonthlyCostMicros,
          monthlyCostUsd: microsToUsd(this.policy.globalMonthlyCostMicros),
        },
      },
      remaining: {
        daily: remainingLimit(dailyLimit, daily),
        monthly: remainingLimit(monthlyLimit, monthly),
      },
    };
  }

  public getCommandUsage(userId: string, campaignId: string, clientCommandId: string): LlmUsageBucket {
    return mapBucket(
      this.db
        .prepare(
          `SELECT COUNT(*) AS calls,
                  COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                  COALESCE(SUM(cached_prompt_tokens), 0) AS cached_prompt_tokens,
                  COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                  COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                  COALESCE(SUM(total_tokens), 0) AS total_tokens,
                  COALESCE(SUM(cost_micros), 0) AS cost_micros
           FROM llm_usage
           WHERE user_id = ? AND campaign_id = ? AND client_command_id = ?`,
        )
        .get(userId, campaignId, clientCommandId) as AggregateRow,
    );
  }

  public estimateCostMicros(promptTokens: number, completionTokens: number): number {
    const input = (nonnegativeInteger(promptTokens) / 1_000_000) * this.policy.inputCostUsdPerMillion;
    const output = (nonnegativeInteger(completionTokens) / 1_000_000) * this.policy.outputCostUsdPerMillion;
    return Math.max(0, Math.round((input + output) * 1_000_000));
  }

  public getPolicy(): LlmUsagePolicy {
    return this.policy;
  }

  private planForUser(userId: string): LlmUsagePlan {
    const row = this.db
      .prepare("SELECT status FROM subscriptions WHERE user_id = ?")
      .get(userId) as { status: string } | undefined;
    return row && ["active", "trialing", "past_due", "checkout_complete"].includes(row.status) ? "player_pass" : "free";
  }

  private limitsForPlan(plan: LlmUsagePlan): {
    dailyCostMicros: number;
    monthlyCostMicros: number;
  } {
    return plan === "player_pass"
      ? {
          dailyCostMicros: this.policy.playerDailyCostMicros,
          monthlyCostMicros: this.policy.playerMonthlyCostMicros,
        }
      : {
          dailyCostMicros: this.policy.freeDailyCostMicros,
          monthlyCostMicros: this.policy.freeMonthlyCostMicros,
        };
  }

  private expireReservations(nowIso: string): void {
    this.db
      .prepare(
        `UPDATE llm_usage_reservations
         SET status = 'expired', settled_at = ?
         WHERE status = 'reserved' AND expires_at <= ?`,
      )
      .run(nowIso, nowIso);
  }

  private aggregateUser(userId: string, startIso: string): AggregateRow {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS calls,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(cached_prompt_tokens), 0) AS cached_prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost_micros), 0) AS cost_micros
         FROM llm_usage WHERE user_id = ? AND created_at >= ?`,
      )
      .get(userId, startIso) as AggregateRow;
  }

  private aggregateAll(startIso: string): AggregateRow {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS calls,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(cached_prompt_tokens), 0) AS cached_prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(cost_micros), 0) AS cost_micros
         FROM llm_usage WHERE created_at >= ?`,
      )
      .get(startIso) as AggregateRow;
  }

  private aggregateReservations(userId: string): { costMicros: number } {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_micros), 0) AS cost_micros
         FROM llm_usage_reservations
         WHERE user_id = ? AND status = 'reserved'`,
      )
      .get(userId) as { cost_micros: number };
    return { costMicros: row.cost_micros };
  }

  private aggregateAllReservations(): {
    dailyCostMicros: number;
    monthlyCostMicros: number;
  } {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_micros), 0) AS cost_micros
         FROM llm_usage_reservations WHERE status = 'reserved'`,
      )
      .get() as { cost_micros: number };
    return { dailyCostMicros: row.cost_micros, monthlyCostMicros: row.cost_micros };
  }
}

export function microsToUsd(value: number): number {
  return Number((value / 1_000_000).toFixed(6));
}

export function usdToMicros(value: number): number {
  return Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 1_000_000));
}

/** Conservative enough for reservation purposes, without pretending this is a tokenizer. */
export function estimateLlmTokens(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return Math.max(1, Math.ceil(serialized.length / 4));
}

function nonnegativeInteger(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

function mapBucket(row: AggregateRow): LlmUsageBucket {
  const costMicros = nonnegativeInteger(row.cost_micros ?? 0);
  return {
    calls: nonnegativeInteger(row.calls ?? 0),
    promptTokens: nonnegativeInteger(row.prompt_tokens ?? 0),
    cachedPromptTokens: nonnegativeInteger(row.cached_prompt_tokens ?? 0),
    completionTokens: nonnegativeInteger(row.completion_tokens ?? 0),
    reasoningTokens: nonnegativeInteger(row.reasoning_tokens ?? 0),
    totalTokens: nonnegativeInteger(row.total_tokens ?? 0),
    costMicros,
    costUsd: microsToUsd(costMicros),
  };
}

function mapLimit(costMicros: number): LlmUsageLimitBucket {
  return {
    costMicros,
    costUsd: microsToUsd(costMicros),
  };
}

function remainingLimit(limit: LlmUsageLimitBucket, used: LlmUsageBucket): LlmUsageLimitBucket {
  return {
    costMicros: Math.max(0, limit.costMicros - used.costMicros),
    costUsd: microsToUsd(Math.max(0, limit.costMicros - used.costMicros)),
  };
}

function assertWithin(
  period: "daily" | "monthly" | "global_daily" | "global_monthly",
  used: number,
  requested: number,
  limit: number,
): void {
  if (used + requested <= limit) return;
  throw new LlmUsageLimitError(
    period,
    used,
    requested,
    limit,
    `LLM ${period.replace("_", " ")} usage limit reached.`,
  );
}

function periodBoundaries(now: Date): {
  dailyStart: string;
  monthlyStart: string;
  dailyResetAt: string;
  monthlyResetAt: string;
} {
  const daily = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dailyReset = new Date(daily);
  dailyReset.setUTCDate(dailyReset.getUTCDate() + 1);
  const monthlyReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    dailyStart: daily.toISOString(),
    monthlyStart: monthly.toISOString(),
    dailyResetAt: dailyReset.toISOString(),
    monthlyResetAt: monthlyReset.toISOString(),
  };
}
