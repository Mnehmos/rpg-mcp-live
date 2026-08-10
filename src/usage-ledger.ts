import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const MODEL_USAGE_SCHEMA_REVISION = "model-usage-v1";

export type ModelUsagePurpose =
  | "opening"
  | "player_turn"
  | "narration_repair"
  | "scene_build"
  | "scene_extension"
  | "world_reaction"
  | "npc_agency"
  | "narration";

export type ModelUsageSelection = "primary" | "fallback";

export type ModelUsageStatus =
  | "success"
  | "provider_error"
  | "timeout_before_output"
  | "interrupted_after_output"
  | "invalid_response";

export type ModelUsageCostSource = "provider_reported" | "derived_fallback" | "unavailable";

/**
 * Provider-boundary telemetry. It deliberately contains identifiers and
 * numeric usage only; prompts, completions, tool arguments, and secrets never
 * enter this shape.
 */
export interface ModelUsageTelemetry {
  provider: "openrouter";
  selection: ModelUsageSelection;
  accountId?: string;
  campaignId?: string;
  actorId?: string;
  requestId?: string;
  clientCommandId?: string;
  dmRunId?: string;
  requestSequence?: number;
  purpose?: ModelUsagePurpose;
  toolsEnabled?: boolean;
  providerRequestId?: string | null;
  requestedModel: string;
  resolvedModel?: string | null;
  providerRoute?: string | null;
  inputTokens: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costMicrousd?: number | null;
  costSource?: ModelUsageCostSource;
  latencyMs: number;
  ttftMs: number | null;
  status?: ModelUsageStatus;
  finishReason?: string | null;
  toolCallCount?: number | null;
  createdAt?: string;
  completedAt?: string;
}

export interface ModelUsageRecord extends Required<Pick<
  ModelUsageTelemetry,
  "provider" | "selection" | "requestedModel" | "inputTokens" | "outputTokens" | "totalTokens" | "latencyMs" | "ttftMs"
>> {
  id: string;
  accountId: string;
  campaignId: string;
  actorId: string;
  requestId: string;
  clientCommandId: string;
  dmRunId: string;
  requestSequence: number;
  purpose: ModelUsagePurpose;
  toolsEnabled: boolean;
  providerRequestId: string | null;
  resolvedModel: string | null;
  providerRoute: string | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  costMicrousd: number | null;
  costSource: ModelUsageCostSource;
  status: ModelUsageStatus;
  finishReason: string | null;
  toolCallCount: number | null;
  createdAt: string;
  completedAt: string;
  schemaRevision: string;
}

export interface ModelUsageSummaryFilters {
  accountId?: string;
  campaignId?: string;
  clientCommandId?: string;
  from?: string;
  to?: string;
  provider?: string;
  model?: string;
}

export interface ModelUsageBreakdown {
  provider: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicrousd: number;
  failureCount: number;
}

export interface ModelUsagePurposeBreakdown {
  purpose: string;
  requestCount: number;
  costMicrousd: number;
}

export interface ModelUsageDayBreakdown {
  day: string;
  requestCount: number;
  costMicrousd: number;
}

export interface ModelUsageSummary {
  filters: ModelUsageSummaryFilters;
  requestCount: number;
  playerTurnCount: number;
  modelBackedTurnCount: number;
  zeroModelTurnCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicrousd: number;
  successfulRequestCount: number;
  failureCount: number;
  fallbackCount: number;
  repairCount: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  averageRequestsPerModelBackedTurn: number;
  p50RequestsPerModelBackedTurn: number | null;
  p95RequestsPerModelBackedTurn: number | null;
  byProviderModel: ModelUsageBreakdown[];
  byPurpose: ModelUsagePurposeBreakdown[];
  byDay: ModelUsageDayBreakdown[];
}

interface UsageRow {
  usage_record_id: string;
  account_id: string;
  campaign_id: string;
  actor_id: string;
  request_id: string;
  client_command_id: string;
  dm_run_id: string;
  request_sequence: number;
  purpose: string;
  provider: string;
  selection: string;
  provider_request_id: string | null;
  requested_model: string;
  resolved_model: string | null;
  provider_route: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_microusd: number | null;
  cost_source: string;
  latency_ms: number;
  ttft_ms: number | null;
  status: string;
  finish_reason: string | null;
  tools_enabled: number;
  tool_call_count: number | null;
  created_at: string;
  completed_at: string;
  schema_revision: string;
}

const MODEL_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS model_usage_records (
  usage_record_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  client_command_id TEXT NOT NULL,
  dm_run_id TEXT NOT NULL,
  request_sequence INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  selection TEXT NOT NULL,
  provider_request_id TEXT,
  requested_model TEXT NOT NULL,
  resolved_model TEXT,
  provider_route TEXT,
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  reasoning_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_microusd INTEGER,
  cost_source TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  ttft_ms INTEGER,
  status TEXT NOT NULL,
  finish_reason TEXT,
  tools_enabled INTEGER NOT NULL,
  tool_call_count INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  schema_revision TEXT NOT NULL,
  UNIQUE (account_id, client_command_id, dm_run_id, request_sequence),
  UNIQUE (provider, provider_request_id)
);
CREATE INDEX IF NOT EXISTS model_usage_account_created_idx
  ON model_usage_records (account_id, created_at);
CREATE INDEX IF NOT EXISTS model_usage_campaign_created_idx
  ON model_usage_records (campaign_id, created_at);
CREATE INDEX IF NOT EXISTS model_usage_command_idx
  ON model_usage_records (account_id, client_command_id);
`;

export function ensureModelUsageTable(db: Database.Database): void {
  db.exec(MODEL_USAGE_TABLE);
}

export function insertModelUsage(db: Database.Database, telemetry: ModelUsageTelemetry): ModelUsageRecord | null {
  if (!telemetry.accountId || !telemetry.campaignId || !telemetry.actorId || !telemetry.requestId
    || !telemetry.clientCommandId || !telemetry.dmRunId || typeof telemetry.requestSequence !== "number"
    || !Number.isInteger(telemetry.requestSequence)) {
    return null;
  }

  const now = new Date().toISOString();
  const id = `usage:${randomUUID()}`;
  const record: ModelUsageRecord = {
    id,
    accountId: telemetry.accountId,
    campaignId: telemetry.campaignId,
    actorId: telemetry.actorId,
    requestId: telemetry.requestId,
    clientCommandId: telemetry.clientCommandId,
    dmRunId: telemetry.dmRunId,
    requestSequence: Math.max(1, Math.trunc(telemetry.requestSequence)),
    purpose: telemetry.purpose ?? "player_turn",
    provider: telemetry.provider,
    selection: telemetry.selection,
    providerRequestId: telemetry.providerRequestId ?? null,
    requestedModel: telemetry.requestedModel,
    resolvedModel: telemetry.resolvedModel ?? null,
    providerRoute: telemetry.providerRoute ?? null,
    inputTokens: nonnegativeIntegerOrNull(telemetry.inputTokens),
    cachedInputTokens: nonnegativeIntegerOrNull(telemetry.cachedInputTokens ?? null),
    reasoningTokens: nonnegativeIntegerOrNull(telemetry.reasoningTokens ?? null),
    outputTokens: nonnegativeIntegerOrNull(telemetry.outputTokens),
    totalTokens: nonnegativeIntegerOrNull(telemetry.totalTokens),
    costMicrousd: nonnegativeIntegerOrNull(telemetry.costMicrousd ?? null),
    costSource: telemetry.costSource ?? (telemetry.costMicrousd === null || telemetry.costMicrousd === undefined ? "unavailable" : "provider_reported"),
    latencyMs: Math.max(0, Math.trunc(telemetry.latencyMs)),
    ttftMs: nonnegativeIntegerOrNull(telemetry.ttftMs),
    status: telemetry.status ?? "success",
    finishReason: telemetry.finishReason ?? null,
    toolsEnabled: telemetry.toolsEnabled ?? false,
    toolCallCount: nonnegativeIntegerOrNull(telemetry.toolCallCount ?? null),
    createdAt: telemetry.createdAt ?? now,
    completedAt: telemetry.completedAt ?? now,
    schemaRevision: MODEL_USAGE_SCHEMA_REVISION,
  };

  db.prepare(`
    INSERT OR IGNORE INTO model_usage_records (
      usage_record_id, account_id, campaign_id, actor_id, request_id,
      client_command_id, dm_run_id, request_sequence, purpose, provider,
      selection, provider_request_id, requested_model, resolved_model,
      provider_route, input_tokens, cached_input_tokens, reasoning_tokens,
      output_tokens, total_tokens, cost_microusd, cost_source, latency_ms,
      ttft_ms, status, finish_reason, tools_enabled, tool_call_count,
      created_at, completed_at, schema_revision
    ) VALUES (
      @id, @accountId, @campaignId, @actorId, @requestId,
      @clientCommandId, @dmRunId, @requestSequence, @purpose, @provider,
      @selection, @providerRequestId, @requestedModel, @resolvedModel,
      @providerRoute, @inputTokens, @cachedInputTokens, @reasoningTokens,
      @outputTokens, @totalTokens, @costMicrousd, @costSource, @latencyMs,
      @ttftMs, @status, @finishReason, @toolsEnabled, @toolCallCount,
      @createdAt, @completedAt, @schemaRevision
    )
  `).run({
    id: record.id,
    accountId: record.accountId,
    campaignId: record.campaignId,
    actorId: record.actorId,
    requestId: record.requestId,
    clientCommandId: record.clientCommandId,
    dmRunId: record.dmRunId,
    requestSequence: record.requestSequence,
    purpose: record.purpose,
    provider: record.provider,
    selection: record.selection,
    providerRequestId: record.providerRequestId,
    requestedModel: record.requestedModel,
    resolvedModel: record.resolvedModel,
    providerRoute: record.providerRoute,
    inputTokens: record.inputTokens,
    cachedInputTokens: record.cachedInputTokens,
    reasoningTokens: record.reasoningTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    costMicrousd: record.costMicrousd,
    costSource: record.costSource,
    latencyMs: record.latencyMs,
    ttftMs: record.ttftMs,
    status: record.status,
    finishReason: record.finishReason,
    toolsEnabled: record.toolsEnabled ? 1 : 0,
    toolCallCount: record.toolCallCount,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    schemaRevision: record.schemaRevision,
  });

  const stored = db.prepare(
    "SELECT * FROM model_usage_records WHERE account_id = ? AND client_command_id = ? AND dm_run_id = ? AND request_sequence = ?"
  ).get(record.accountId, record.clientCommandId, record.dmRunId, record.requestSequence) as UsageRow | undefined;
  return stored ? mapUsageRow(stored) : null;
}

export function countModelUsage(db: Database.Database, filters: ModelUsageSummaryFilters = {}): number {
  const where = usageWhere(filters);
  const row = db.prepare(`SELECT COUNT(*) AS count FROM model_usage_records ${where.sql}`).get(...where.params) as { count: number };
  return Number(row.count);
}

export function queryModelUsageSummary(
  db: Database.Database,
  filters: ModelUsageSummaryFilters = {}
): ModelUsageSummary {
  const where = usageWhere(filters);
  const aggregate = db.prepare(`
    SELECT
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_microusd), 0) AS cost_microusd,
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS successful_count,
      COALESCE(SUM(CASE WHEN status <> 'success' THEN 1 ELSE 0 END), 0) AS failure_count,
      COALESCE(SUM(CASE WHEN selection = 'fallback' THEN 1 ELSE 0 END), 0) AS fallback_count,
      COALESCE(SUM(CASE WHEN purpose = 'narration_repair' THEN 1 ELSE 0 END), 0) AS repair_count,
      COALESCE(SUM(latency_ms), 0) AS total_latency_ms,
      COALESCE(MAX(latency_ms), 0) AS max_latency_ms
    FROM model_usage_records ${where.sql}
  `).get(...where.params) as Record<string, number>;

  const rows = db.prepare(`SELECT * FROM model_usage_records ${where.sql} ORDER BY latency_ms, usage_record_id`).all(...where.params) as UsageRow[];
  const usageCommandWhere = usageWhere(filters, "u");
  const commandWhere = usageWhere(filters, "c", "created_at", false);
  const playerTurns = db.prepare(`
    SELECT COUNT(DISTINCT c.client_command_id) AS count
    FROM engine_commands c
    ${withCondition(commandWhere.sql, "json_type(c.request_json, '$.playerText') = 'text'")}
  `).get(...commandWhere.params) as { count: number };
  const modelBackedTurns = db.prepare(`
    SELECT COUNT(DISTINCT u.client_command_id) AS count
    FROM model_usage_records u
    JOIN engine_commands c
      ON c.account_id = u.account_id AND c.client_command_id = u.client_command_id
    ${withCondition(usageCommandWhere.sql, "json_type(c.request_json, '$.playerText') = 'text'")}
  `).get(...usageCommandWhere.params) as { count: number };

  const requestsPerTurn = db.prepare(`
    SELECT u.client_command_id, COUNT(*) AS request_count
    FROM model_usage_records u
    JOIN engine_commands c
      ON c.account_id = u.account_id AND c.client_command_id = u.client_command_id
    ${withCondition(where.sql.replaceAll("model_usage_records.", "u."), "json_type(c.request_json, '$.playerText') = 'text'")}
    GROUP BY u.client_command_id
    ORDER BY request_count, u.client_command_id
  `).all(...where.params) as Array<{ client_command_id: string; request_count: number }>;
  const byProviderModel = db.prepare(`
    SELECT provider, COALESCE(resolved_model, requested_model) AS model,
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_microusd), 0) AS cost_microusd,
      COALESCE(SUM(CASE WHEN status <> 'success' THEN 1 ELSE 0 END), 0) AS failure_count
    FROM model_usage_records ${where.sql}
    GROUP BY provider, COALESCE(resolved_model, requested_model)
    ORDER BY provider, model
  `).all(...where.params) as Array<Record<string, string | number>>;
  const byPurpose = db.prepare(`
    SELECT purpose, COUNT(*) AS request_count, COALESCE(SUM(cost_microusd), 0) AS cost_microusd
    FROM model_usage_records ${where.sql}
    GROUP BY purpose ORDER BY purpose
  `).all(...where.params) as Array<Record<string, string | number>>;
  const byDay = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS request_count, COALESCE(SUM(cost_microusd), 0) AS cost_microusd
    FROM model_usage_records ${where.sql}
    GROUP BY substr(created_at, 1, 10) ORDER BY day
  `).all(...where.params) as Array<Record<string, string | number>>;

  const latencies = rows.map((row) => row.latency_ms);
  const requestCounts = requestsPerTurn.map((row) => Number(row.request_count));
  const playerTurnCount = Number(playerTurns.count);
  const modelBackedTurnCount = Number(modelBackedTurns.count);
  return {
    filters: { ...filters },
    requestCount: Number(aggregate.request_count),
    playerTurnCount,
    modelBackedTurnCount,
    zeroModelTurnCount: Math.max(0, playerTurnCount - modelBackedTurnCount),
    inputTokens: Number(aggregate.input_tokens),
    cachedInputTokens: Number(aggregate.cached_input_tokens),
    reasoningTokens: Number(aggregate.reasoning_tokens),
    outputTokens: Number(aggregate.output_tokens),
    totalTokens: Number(aggregate.total_tokens),
    costMicrousd: Number(aggregate.cost_microusd),
    successfulRequestCount: Number(aggregate.successful_count),
    failureCount: Number(aggregate.failure_count),
    fallbackCount: Number(aggregate.fallback_count),
    repairCount: Number(aggregate.repair_count),
    totalLatencyMs: Number(aggregate.total_latency_ms),
    maxLatencyMs: Number(aggregate.max_latency_ms),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    averageRequestsPerModelBackedTurn: modelBackedTurnCount > 0
      ? requestCounts.reduce((sum, count) => sum + count, 0) / modelBackedTurnCount
      : 0,
    p50RequestsPerModelBackedTurn: percentile(requestCounts, 0.5),
    p95RequestsPerModelBackedTurn: percentile(requestCounts, 0.95),
    byProviderModel: byProviderModel.map((row) => ({
      provider: String(row.provider),
      model: String(row.model),
      requestCount: Number(row.request_count),
      inputTokens: Number(row.input_tokens),
      cachedInputTokens: Number(row.cached_input_tokens),
      reasoningTokens: Number(row.reasoning_tokens),
      outputTokens: Number(row.output_tokens),
      totalTokens: Number(row.total_tokens),
      costMicrousd: Number(row.cost_microusd),
      failureCount: Number(row.failure_count),
    })),
    byPurpose: byPurpose.map((row) => ({
      purpose: String(row.purpose),
      requestCount: Number(row.request_count),
      costMicrousd: Number(row.cost_microusd),
    })),
    byDay: byDay.map((row) => ({
      day: String(row.day),
      requestCount: Number(row.request_count),
      costMicrousd: Number(row.cost_microusd),
    })),
  };
}

function nonnegativeIntegerOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function mapUsageRow(row: UsageRow): ModelUsageRecord {
  return {
    id: row.usage_record_id,
    accountId: row.account_id,
    campaignId: row.campaign_id,
    actorId: row.actor_id,
    requestId: row.request_id,
    clientCommandId: row.client_command_id,
    dmRunId: row.dm_run_id,
    requestSequence: row.request_sequence,
    purpose: row.purpose as ModelUsagePurpose,
    provider: row.provider as "openrouter",
    selection: row.selection as ModelUsageSelection,
    providerRequestId: row.provider_request_id,
    requestedModel: row.requested_model,
    resolvedModel: row.resolved_model,
    providerRoute: row.provider_route,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    reasoningTokens: row.reasoning_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    costMicrousd: row.cost_microusd,
    costSource: row.cost_source as ModelUsageCostSource,
    latencyMs: row.latency_ms,
    ttftMs: row.ttft_ms,
    status: row.status as ModelUsageStatus,
    finishReason: row.finish_reason,
    toolsEnabled: row.tools_enabled === 1,
    toolCallCount: row.tool_call_count,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    schemaRevision: row.schema_revision,
  };
}

function usageWhere(
  filters: ModelUsageSummaryFilters,
  alias = "model_usage_records",
  dateColumn = "created_at",
  includeUsageDimensions = true
): { sql: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.accountId) { conditions.push(`${alias}.account_id = ?`); params.push(filters.accountId); }
  if (filters.campaignId) { conditions.push(`${alias}.campaign_id = ?`); params.push(filters.campaignId); }
  if (filters.clientCommandId) { conditions.push(`${alias}.client_command_id = ?`); params.push(filters.clientCommandId); }
  if (filters.from) { conditions.push(`${alias}.${dateColumn} >= ?`); params.push(filters.from); }
  if (filters.to) { conditions.push(`${alias}.${dateColumn} < ?`); params.push(filters.to); }
  if (includeUsageDimensions && filters.provider) { conditions.push(`${alias}.provider = ?`); params.push(filters.provider); }
  if (includeUsageDimensions && filters.model) { conditions.push(`COALESCE(${alias}.resolved_model, ${alias}.requested_model) = ?`); params.push(filters.model); }
  return { sql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

function withCondition(where: string, condition: string): string {
  return where ? `${where} AND ${condition}` : `WHERE ${condition}`;
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index] ?? null;
}
