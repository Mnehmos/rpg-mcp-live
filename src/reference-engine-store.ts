import type Database from "better-sqlite3";
import type { EngineToolDisclosure } from "./engine-contracts.js";

export type EngineBackend = "reference";

export interface StoredLogMessage {
  id: string;
  kind: "narration" | "roll" | "system" | "player" | "tool";
  text: string;
  createdAt: string;
  toolDisclosure?: EngineToolDisclosure;
}

const MAX_LOG_MESSAGES = 40;

export type ReferenceCommandStatus = "processing" | "resolved" | "failed";
export type ReferenceCommandCommitStatus = "not_committed" | "uncertain";

export interface ReferenceCommandFailure {
  correlationId: string;
  commitStatus: ReferenceCommandCommitStatus;
  phase: string;
  toolRounds: number;
  toolCallNames: string[];
  acceptedToolCalls: number;
  message: string;
}

export interface ReferenceCommandRecord {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  expectedCampaignVersion: number | null;
  requestJson: string;
  status: ReferenceCommandStatus;
  result: unknown | null;
  failure: ReferenceCommandFailure | null;
  createdAt: string;
  updatedAt: string;
}

export type ReferenceCommandStart =
  | { status: "started" }
  | { status: "resolved"; result: unknown }
  | { status: "processing" }
  | { status: "failed"; failure: ReferenceCommandFailure | null }
  | { status: "conflict"; currentVersion: number };

export const DOCKET_NAMES = ["state", "player", "npcs", "journal", "secrets", "campaign"] as const;
export type DocketName = (typeof DOCKET_NAMES)[number];

export interface ReferenceEngineRouting {
  backend: EngineBackend;
  referenceWorldId: string | null;
  referencePartyId: string | null;
  referenceSessionId: string | null;
  referenceCharacterId: string | null;
  /**
   * The campaign profile (name/premise/setting/tone) has no reference-engine
   * equivalent, so it's stored here rather than reconstructed on every read.
   */
  campaignProfileJson: string | null;
  /** Adapter-owned optimistic-concurrency counter; the reference engine has no equivalent. */
  version: number;
}

interface RoutingRow {
  user_id: string;
  campaign_id: string;
  backend: EngineBackend;
  reference_world_id: string | null;
  reference_party_id: string | null;
  reference_session_id: string | null;
  reference_character_id: string | null;
  campaign_profile_json: string | null;
  version: number;
}

interface ReferenceCommandRow {
  user_id: string;
  campaign_id: string;
  client_command_id: string;
  expected_version: number | null;
  request_json: string;
  status: ReferenceCommandStatus;
  result_json: string | null;
  failure_json: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tenant-isolation control point for the reference-engine A/B path (ADR-H13 override,
 * accepted 2026-08-11): the reference engine itself does not scope its storage by
 * caller, so this table is the only place accountId+campaignId are bound to specific
 * reference-engine world/party/session/character IDs. The adapter and orchestrator
 * must resolve IDs through this store and must never accept a client-supplied raw
 * reference-engine ID, and must never call session_manage.initialize without the IDs
 * already recorded here.
 */
export class ReferenceEngineStore {
  public constructor(private readonly db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reference_engine_sessions (
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        backend TEXT NOT NULL DEFAULT 'reference',
        reference_world_id TEXT,
        reference_party_id TEXT,
        reference_session_id TEXT,
        reference_character_id TEXT,
        campaign_profile_json TEXT,
        version INTEGER NOT NULL DEFAULT 0,
        log_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, campaign_id)
      );

      CREATE TABLE IF NOT EXISTS reference_engine_dockets (
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        docket_name TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, campaign_id, docket_name)
      );

      CREATE TABLE IF NOT EXISTS reference_engine_commands (
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        expected_version INTEGER,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        failure_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, client_command_id)
      );
    `);
  }

  /**
   * Starts a reference-DM turn exactly once. Reference-engine tools mutate
   * immediately, so the host needs this durable receipt before calling the
   * model: a browser retry must never silently execute the same turn twice.
   */
  public beginReferenceCommand(
    userId: string,
    campaignId: string,
    clientCommandId: string,
    expectedCampaignVersion: number | undefined,
    requestJson: string
  ): ReferenceCommandStart {
    const transaction = this.db.transaction((): ReferenceCommandStart => {
      const existing = this.db
        .prepare(
          `SELECT user_id, campaign_id, client_command_id, expected_version,
                  request_json, status, result_json, failure_json, created_at, updated_at
           FROM reference_engine_commands
           WHERE user_id = ? AND client_command_id = ?`
        )
        .get(userId, clientCommandId) as ReferenceCommandRow | undefined;

      if (existing) {
        if (existing.campaign_id !== campaignId || existing.request_json !== requestJson) {
          throw new Error("A client command ID cannot be reused for a different reference-engine turn.");
        }
        if (existing.status === "resolved" && existing.result_json) {
          return { status: "resolved", result: JSON.parse(existing.result_json) };
        }
        if (existing.status === "failed") {
          return {
            status: "failed",
            failure: existing.failure_json ? JSON.parse(existing.failure_json) as ReferenceCommandFailure : null,
          };
        }
        return { status: "processing" };
      }

      const current = this.getRouting(userId, campaignId);
      if (expectedCampaignVersion !== undefined && current && current.version !== expectedCampaignVersion) {
        return { status: "conflict", currentVersion: current.version };
      }

      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO reference_engine_commands (
             user_id, campaign_id, client_command_id, expected_version,
             request_json, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`
        )
        .run(userId, campaignId, clientCommandId, expectedCampaignVersion ?? null, requestJson, now, now);
      return { status: "started" };
    });
    return transaction();
  }

  public resolveReferenceCommand(
    userId: string,
    campaignId: string,
    clientCommandId: string,
    result: unknown
  ): void {
    this.db
      .prepare(
        `UPDATE reference_engine_commands
         SET status = 'resolved', result_json = ?, failure_json = NULL, updated_at = ?
         WHERE user_id = ? AND campaign_id = ? AND client_command_id = ?`
      )
      .run(JSON.stringify(result), new Date().toISOString(), userId, campaignId, clientCommandId);
  }

  public failReferenceCommand(
    userId: string,
    campaignId: string,
    clientCommandId: string,
    failure: ReferenceCommandFailure
  ): void {
    this.db
      .prepare(
        `UPDATE reference_engine_commands
         SET status = 'failed', failure_json = ?, updated_at = ?
         WHERE user_id = ? AND campaign_id = ? AND client_command_id = ?`
      )
      .run(JSON.stringify(failure), new Date().toISOString(), userId, campaignId, clientCommandId);
  }

  public getReferenceCommand(userId: string, campaignId: string, clientCommandId: string): ReferenceCommandRecord | null {
    const row = this.db
      .prepare(
        `SELECT user_id, campaign_id, client_command_id, expected_version,
                request_json, status, result_json, failure_json, created_at, updated_at
         FROM reference_engine_commands
         WHERE user_id = ? AND campaign_id = ? AND client_command_id = ?`
      )
      .get(userId, campaignId, clientCommandId) as ReferenceCommandRow | undefined;
    if (!row) return null;
    return {
      userId: row.user_id,
      campaignId: row.campaign_id,
      clientCommandId: row.client_command_id,
      expectedCampaignVersion: row.expected_version,
      requestJson: row.request_json,
      status: row.status,
      result: row.result_json ? JSON.parse(row.result_json) : null,
      failure: row.failure_json ? JSON.parse(row.failure_json) as ReferenceCommandFailure : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * secrets is DM-only narrative memory the LLM writes and reads for its own
   * context — it must never reach a player-facing API response. getDocket is
   * for the orchestrator's own internal use (it may read 'secrets'); every
   * server.ts route that serializes campaign data to the client must go
   * through listDockets with the default excludeSecrets: true instead.
   */
  public getDocket(userId: string, campaignId: string, name: DocketName): string {
    const row = this.db
      .prepare(
        "SELECT content FROM reference_engine_dockets WHERE user_id = ? AND campaign_id = ? AND docket_name = ?"
      )
      .get(userId, campaignId, name) as { content: string } | undefined;
    return row?.content ?? "";
  }

  public setDocket(userId: string, campaignId: string, name: DocketName, content: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reference_engine_dockets (user_id, campaign_id, docket_name, content, updated_at)
         VALUES (@userId, @campaignId, @name, @content, @now)
         ON CONFLICT(user_id, campaign_id, docket_name) DO UPDATE SET
           content = excluded.content,
           updated_at = excluded.updated_at`
      )
      .run({ userId, campaignId, name, content, now });
  }

  public listDockets(
    userId: string,
    campaignId: string,
    options: { excludeSecrets?: boolean } = {}
  ): Partial<Record<DocketName, string>> {
    const excludeSecrets = options.excludeSecrets ?? true;
    const rows = this.db
      .prepare("SELECT docket_name, content FROM reference_engine_dockets WHERE user_id = ? AND campaign_id = ?")
      .all(userId, campaignId) as Array<{ docket_name: DocketName; content: string }>;
    const result: Partial<Record<DocketName, string>> = {};
    for (const row of rows) {
      if (excludeSecrets && row.docket_name === "secrets") continue;
      result[row.docket_name] = row.content;
    }
    return result;
  }

  public getRouting(userId: string, campaignId: string): ReferenceEngineRouting | null {
    const row = this.db
      .prepare(
        `SELECT user_id, campaign_id, backend, reference_world_id, reference_party_id,
                reference_session_id, reference_character_id, campaign_profile_json, version
         FROM reference_engine_sessions
         WHERE user_id = ? AND campaign_id = ?`
      )
      .get(userId, campaignId) as RoutingRow | undefined;
    return row ? mapRouting(row) : null;
  }

  public setCampaignProfile(userId: string, campaignId: string, profile: unknown): void {
    this.db
      .prepare(
        `UPDATE reference_engine_sessions
         SET campaign_profile_json = @profileJson, updated_at = @now
         WHERE user_id = @userId AND campaign_id = @campaignId`
      )
      .run({ userId, campaignId, profileJson: JSON.stringify(profile), now: new Date().toISOString() });
  }

  /** Bumps and returns the new version, for adapter methods that mutate reference-engine state. */
  public bumpVersion(userId: string, campaignId: string): number {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE reference_engine_sessions
         SET version = version + 1, updated_at = @now
         WHERE user_id = @userId AND campaign_id = @campaignId`
      )
      .run({ userId, campaignId, now });
    return this.getRouting(userId, campaignId)?.version ?? 0;
  }

  public resolveBackend(userId: string, campaignId: string): EngineBackend {
    return this.getRouting(userId, campaignId)?.backend ?? "reference";
  }

  public setBackend(userId: string, campaignId: string, backend: EngineBackend): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reference_engine_sessions (user_id, campaign_id, backend, created_at, updated_at)
         VALUES (@userId, @campaignId, @backend, @now, @now)
         ON CONFLICT(user_id, campaign_id) DO UPDATE SET
           backend = excluded.backend,
           updated_at = excluded.updated_at`
      )
      .run({ userId, campaignId, backend, now });
  }

  /**
   * Merge-updates the resolved reference-engine IDs for a campaign. Only supplied
   * fields are changed. Requires an existing row (set the backend first).
   */
  public setReferenceIds(
    userId: string,
    campaignId: string,
    ids: Partial<{
      worldId: string;
      partyId: string;
      sessionId: string;
      characterId: string;
    }>
  ): void {
    const current = this.getRouting(userId, campaignId);
    if (!current) {
      throw new Error(
        `No reference_engine_sessions row for user ${userId} / campaign ${campaignId}; call setBackend first.`
      );
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE reference_engine_sessions
         SET reference_world_id = @worldId,
             reference_party_id = @partyId,
             reference_session_id = @sessionId,
             reference_character_id = @characterId,
             updated_at = @now
         WHERE user_id = @userId AND campaign_id = @campaignId`
      )
      .run({
        userId,
        campaignId,
        worldId: ids.worldId ?? current.referenceWorldId,
        partyId: ids.partyId ?? current.referencePartyId,
        sessionId: ids.sessionId ?? current.referenceSessionId,
        characterId: ids.characterId ?? current.referenceCharacterId,
        now,
      });
  }

  /**
   * Reference-routed campaigns have no persisted log elsewhere (buildState()
   * rebuilds a fresh LanternCampaignState shell on every read), so the chat
   * transcript is stored here directly, capped at MAX_LOG_MESSAGES.
   */
  public appendLogMessages(userId: string, campaignId: string, messages: StoredLogMessage[]): StoredLogMessage[] {
    const row = this.db
      .prepare("SELECT log_json FROM reference_engine_sessions WHERE user_id = ? AND campaign_id = ?")
      .get(userId, campaignId) as { log_json: string } | undefined;
    const current = row ? (JSON.parse(row.log_json) as StoredLogMessage[]) : [];
    const next = [...current, ...messages].slice(-MAX_LOG_MESSAGES);
    this.db
      .prepare(
        `UPDATE reference_engine_sessions
         SET log_json = @logJson, updated_at = @now
         WHERE user_id = @userId AND campaign_id = @campaignId`
      )
      .run({ userId, campaignId, logJson: JSON.stringify(next), now: new Date().toISOString() });
    return next;
  }

  public getLogMessages(userId: string, campaignId: string): StoredLogMessage[] {
    const row = this.db
      .prepare("SELECT log_json FROM reference_engine_sessions WHERE user_id = ? AND campaign_id = ?")
      .get(userId, campaignId) as { log_json: string } | undefined;
    return row ? (JSON.parse(row.log_json) as StoredLogMessage[]) : [];
  }

  public deleteRouting(userId: string, campaignId: string): void {
    this.db
      .prepare("DELETE FROM reference_engine_commands WHERE user_id = ? AND campaign_id = ?")
      .run(userId, campaignId);
    this.db
      .prepare("DELETE FROM reference_engine_sessions WHERE user_id = ? AND campaign_id = ?")
      .run(userId, campaignId);
  }

  /** All routing rows for a user, most recently updated first. */
  public listForUser(userId: string): Array<{ campaignId: string; routing: ReferenceEngineRouting }> {
    const rows = this.db
      .prepare(
        `SELECT user_id, campaign_id, backend, reference_world_id, reference_party_id,
                reference_session_id, reference_character_id, campaign_profile_json, version
         FROM reference_engine_sessions
         WHERE user_id = ?
         ORDER BY updated_at DESC`
      )
      .all(userId) as RoutingRow[];
    return rows.map((row) => ({ campaignId: row.campaign_id, routing: mapRouting(row) }));
  }
}

function mapRouting(row: RoutingRow): ReferenceEngineRouting {
  return {
    backend: "reference",
    referenceWorldId: row.reference_world_id,
    referencePartyId: row.reference_party_id,
    referenceSessionId: row.reference_session_id,
    referenceCharacterId: row.reference_character_id,
    campaignProfileJson: row.campaign_profile_json,
    version: row.version,
  };
}
