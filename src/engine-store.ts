import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { NarrationEnvelope } from "./ai-contracts.js";
import type { Open5ePackDescriptor } from "./content/pack.js";
import { cloneCampaign, normalizeCampaignState, toSessionView } from "./engine-domain.js";
import type {
  CreateCampaignContext,
  EngineCampaignDeletionResult,
  EngineCommandResult,
  EngineEvent,
  EngineMessage,
  EnginePersistedCommand,
  EngineResolution,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";

interface CampaignRow {
  account_id: string;
  campaign_id: string;
  actor_id: string;
  version: number;
  state_json: string;
  updated_at: string;
}

interface CommandRow {
  account_id: string;
  campaign_id: string;
  client_command_id: string;
  request_json: string;
  status: "processing" | "resolved";
  result_json: string | null;
}

interface ContentPackRow {
  pack_hash: string;
  pack_version: string;
  rules_version: string;
  target_document_key: string;
  gamesystems_json: string;
  pack_directory: string;
  installed_at: string;
}

interface EventRow {
  event_json: string;
}

export interface InstalledEngineContentPack {
  packHash: string;
  packVersion: string;
  rulesVersion: string;
  targetDocumentKey: string;
  gamesystems: string[];
  packDirectory: string;
  installedAt: string;
}

export class EngineCampaignNotFoundError extends Error {
  public constructor() {
    super("Campaign not found.");
    this.name = "EngineCampaignNotFoundError";
  }
}

export class EngineActorMismatchError extends Error {
  public constructor() {
    super("The actor is not part of this campaign.");
    this.name = "EngineActorMismatchError";
  }
}

export class EngineVersionConflictError extends Error {
  public readonly currentState: LanternCampaignState;
  public readonly expectedVersion: number;

  public constructor(currentState: LanternCampaignState, expectedVersion: number) {
    super("The campaign has changed since this command was prepared.");
    this.name = "EngineVersionConflictError";
    this.currentState = currentState;
    this.expectedVersion = expectedVersion;
  }
}

export class EngineCommandIdReuseError extends Error {
  public constructor() {
    super("A client command ID cannot be reused for a different engine command.");
    this.name = "EngineCommandIdReuseError";
  }
}

export class EngineCommandInProgressError extends Error {
  public constructor() {
    super("That engine command is already being resolved.");
    this.name = "EngineCommandInProgressError";
  }
}

export interface StoredEngineCommand {
  requestJson: string;
  status: "processing" | "resolved";
  result: EngineCommandResult | null;
}

export interface ExecuteEngineCommandInput {
  context: RequestContext;
  clientCommandId: string;
  expectedCampaignVersion: number;
  command: EnginePersistedCommand;
  tool: EngineResolution["tool"];
  playerText?: string;
  resolve: (state: LanternCampaignState) => EngineResolution;
}

function appendPlayerTurn(
  current: LanternCampaignState,
  resolution: EngineResolution,
  playerText: string
): EngineResolution {
  const text = playerText.trim();
  if (!text) return resolution;

  const next = cloneCampaign(resolution.state);
  const currentMessageIds = new Set(current.log.map((message) => message.id));
  const firstGeneratedIndex = next.log.findIndex((message) => !currentMessageIds.has(message.id));
  const insertionIndex = firstGeneratedIndex < 0 ? next.log.length : firstGeneratedIndex;
  const generatedMessages = firstGeneratedIndex < 0
    ? [
        {
          id: randomUUID(),
          kind: "narration" as const,
          text: resolution.message,
          createdAt: new Date().toISOString(),
        },
      ]
    : [];

  next.log = [
    ...next.log.slice(0, insertionIndex),
    {
      id: randomUUID(),
      kind: "player" as const,
      text,
      createdAt: new Date().toISOString(),
    },
    ...next.log.slice(insertionIndex),
    ...generatedMessages,
  ].slice(-40);
  next.updatedAt = new Date().toISOString();
  return { ...resolution, state: next };
}

export class LanternEngineStore {
  private readonly db: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      [
        "CREATE TABLE IF NOT EXISTS engine_campaigns (",
        "  account_id TEXT NOT NULL,",
        "  campaign_id TEXT NOT NULL,",
        "  actor_id TEXT NOT NULL,",
        "  version INTEGER NOT NULL DEFAULT 0,",
        "  state_json TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL,",
        "  PRIMARY KEY (account_id, campaign_id)",
        ");",
        "CREATE INDEX IF NOT EXISTS engine_campaigns_account_idx ON engine_campaigns (account_id, updated_at);",
        "CREATE TABLE IF NOT EXISTS engine_content_packs (",
        "  pack_hash TEXT PRIMARY KEY,",
        "  pack_version TEXT NOT NULL,",
        "  rules_version TEXT NOT NULL UNIQUE,",
        "  target_document_key TEXT NOT NULL,",
        "  gamesystems_json TEXT NOT NULL,",
        "  pack_directory TEXT NOT NULL,",
        "  installed_at TEXT NOT NULL",
        ");",
        "CREATE TABLE IF NOT EXISTS engine_commands (",
        "  account_id TEXT NOT NULL,",
        "  campaign_id TEXT NOT NULL,",
        "  client_command_id TEXT NOT NULL,",
        "  request_json TEXT NOT NULL,",
        "  status TEXT NOT NULL,",
        "  result_json TEXT,",
        "  created_at TEXT NOT NULL,",
        "  PRIMARY KEY (account_id, client_command_id)",
        ");",
        "CREATE TABLE IF NOT EXISTS engine_events (",
        "  event_id TEXT PRIMARY KEY,",
        "  account_id TEXT NOT NULL,",
        "  campaign_id TEXT NOT NULL,",
        "  actor_id TEXT NOT NULL,",
        "  client_command_id TEXT NOT NULL,",
        "  version INTEGER NOT NULL,",
        "  event_json TEXT NOT NULL,",
        "  created_at TEXT NOT NULL,",
        "  UNIQUE (account_id, client_command_id)",
        ");",
      ].join("\n")
    );
  }

  public installContentPack(descriptor: Open5ePackDescriptor): InstalledEngineContentPack {
    const installedAt = new Date().toISOString();
    this.db.prepare(
      [
        "INSERT OR IGNORE INTO engine_content_packs",
        "(pack_hash, pack_version, rules_version, target_document_key, gamesystems_json, pack_directory, installed_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      ].join(" ")
    ).run(
      descriptor.packHash,
      descriptor.packVersion,
      descriptor.rulesVersion,
      descriptor.targetDocumentKey,
      JSON.stringify(descriptor.gamesystems),
      descriptor.packDirectory,
      installedAt
    );
    const installed = this.getInstalledContentPacks().find((pack) => pack.packHash === descriptor.packHash);
    if (!installed) throw new Error("The verified Open5e content pack could not be registered.");
    if (
      installed.packVersion !== descriptor.packVersion
      || installed.rulesVersion !== descriptor.rulesVersion
      || installed.targetDocumentKey !== descriptor.targetDocumentKey
      || JSON.stringify(installed.gamesystems) !== JSON.stringify(descriptor.gamesystems)
    ) {
      throw new Error("Installed Open5e content pack metadata conflicts with the verified descriptor.");
    }
    return installed;
  }

  public getInstalledContentPacks(): InstalledEngineContentPack[] {
    const rows = this.db.prepare(
      "SELECT pack_hash, pack_version, rules_version, target_document_key, gamesystems_json, pack_directory, installed_at FROM engine_content_packs ORDER BY installed_at, pack_hash"
    ).all() as ContentPackRow[];
    return rows.map((row) => ({
      packHash: row.pack_hash,
      packVersion: row.pack_version,
      rulesVersion: row.rules_version,
      targetDocumentKey: row.target_document_key,
      gamesystems: JSON.parse(row.gamesystems_json) as string[],
      packDirectory: row.pack_directory,
      installedAt: row.installed_at,
    }));
  }

  public createCampaign(context: CreateCampaignContext, state: LanternCampaignState): LanternCampaignState {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO engine_campaigns (account_id, campaign_id, actor_id, version, state_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          context.accountId,
          state.id,
          context.actorId,
          state.version,
          JSON.stringify(state),
          state.updatedAt
        );
    });
    transaction();
    return cloneCampaign(state);
  }

  public listCampaigns(accountId: string): LanternCampaignState[] {
    const rows = this.db
      .prepare(
        "SELECT account_id, campaign_id, actor_id, version, state_json, updated_at FROM engine_campaigns WHERE account_id = ? ORDER BY updated_at DESC"
      )
      .all(accountId) as CampaignRow[];
    return rows.map((row) => this.mapState(row));
  }

  public getCampaign(context: RequestContext): LanternCampaignState {
    const state = this.readState(context.accountId, context.campaignId);
    if (!state) throw new EngineCampaignNotFoundError();
    if (state.actorId !== context.actorId) throw new EngineActorMismatchError();
    return state;
  }

  public deleteCampaign(
    context: RequestContext,
    expectedCampaignVersion: number
  ): EngineCampaignDeletionResult {
    const transaction = this.db.transaction((): EngineCampaignDeletionResult => {
      const current = this.getCampaign(context);
      if (current.version !== expectedCampaignVersion) {
        throw new EngineVersionConflictError(current, expectedCampaignVersion);
      }

      const deletedAt = new Date().toISOString();
      const deletedEvents = this.db
        .prepare("DELETE FROM engine_events WHERE account_id = ? AND campaign_id = ?")
        .run(context.accountId, context.campaignId).changes;
      const deletedCommands = this.db
        .prepare("DELETE FROM engine_commands WHERE account_id = ? AND campaign_id = ?")
        .run(context.accountId, context.campaignId).changes;
      const deletedCampaign = this.db
        .prepare("DELETE FROM engine_campaigns WHERE account_id = ? AND campaign_id = ?")
        .run(context.accountId, context.campaignId).changes;
      if (deletedCampaign !== 1) throw new EngineCampaignNotFoundError();

      return {
        deleted: true,
        campaignId: context.campaignId,
        previousVersion: current.version,
        deletedCommands,
        deletedEvents,
        deletedAt,
      };
    });

    return transaction();
  }

  public listCampaignEvents(context: RequestContext): EngineEvent[] {
    this.getCampaign(context);
    const rows = this.db.prepare(
      "SELECT event_json FROM engine_events WHERE account_id = ? AND campaign_id = ? ORDER BY version, created_at, event_id"
    ).all(context.accountId, context.campaignId) as EventRow[];
    return rows.map((row) => JSON.parse(row.event_json) as EngineEvent);
  }

  public getStoredCommand(accountId: string, clientCommandId: string): StoredEngineCommand | null {
    const row = this.db
      .prepare(
        "SELECT request_json, status, result_json FROM engine_commands WHERE account_id = ? AND client_command_id = ?"
      )
      .get(accountId, clientCommandId) as CommandRow | undefined;
    if (!row) return null;
    return {
      requestJson: row.request_json,
      status: row.status,
      result: row.result_json ? (JSON.parse(row.result_json) as EngineCommandResult) : null,
    };
  }

  public executeCommand(input: ExecuteEngineCommandInput): EngineCommandResult {
    const requestJson = JSON.stringify({
      campaignId: input.context.campaignId,
      clientCommandId: input.clientCommandId,
      expectedCampaignVersion: input.expectedCampaignVersion,
      command: input.command,
      tool: input.tool,
      playerText: input.playerText ?? null,
    });

    const transaction = this.db.transaction((): EngineCommandResult => {
      const existing = this.db
        .prepare(
          "SELECT account_id, campaign_id, client_command_id, request_json, status, result_json FROM engine_commands WHERE account_id = ? AND client_command_id = ?"
        )
        .get(input.context.accountId, input.clientCommandId) as CommandRow | undefined;

      if (existing) {
        if (existing.request_json !== requestJson) throw new EngineCommandIdReuseError();
        if (existing.status !== "resolved" || !existing.result_json) throw new EngineCommandInProgressError();
        return { ...(JSON.parse(existing.result_json) as EngineCommandResult), replayed: true };
      }

      const current = this.getCampaign(input.context);
      if (current.version !== input.expectedCampaignVersion) {
        throw new EngineVersionConflictError(current, input.expectedCampaignVersion);
      }

      const createdAt = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO engine_commands (account_id, campaign_id, client_command_id, request_json, status, created_at) VALUES (?, ?, ?, ?, 'processing', ?)"
        )
        .run(
          input.context.accountId,
          input.context.campaignId,
          input.clientCommandId,
          requestJson,
          createdAt
        );

      const rawResolution = input.resolve(current);
      const resolution = input.playerText ? appendPlayerTurn(current, rawResolution, input.playerText) : rawResolution;
      if ((!resolution.readOnly && resolution.accepted) || input.playerText) {
        this.writeState(resolution.state);
      }
      if (resolution.event) {
        this.db
          .prepare(
            "INSERT INTO engine_events (event_id, account_id, campaign_id, actor_id, client_command_id, version, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .run(
            resolution.event.id,
            input.context.accountId,
            input.context.campaignId,
            input.context.actorId,
            input.clientCommandId,
            resolution.event.version,
            JSON.stringify(resolution.event),
            resolution.event.createdAt
          );
      }

      const result: EngineCommandResult = {
        ...resolution,
        context: input.context,
        campaignId: input.context.campaignId,
        clientCommandId: input.clientCommandId,
        replayed: false,
        session: toSessionView(resolution.state),
        narrationSource: "rules",
      };
      this.db
        .prepare(
          "UPDATE engine_commands SET status = 'resolved', result_json = ? WHERE account_id = ? AND client_command_id = ?"
        )
        .run(JSON.stringify(result), input.context.accountId, input.clientCommandId);
      return result;
    });

    return transaction();
  }

  public updateCommandNarration(
    context: RequestContext,
    clientCommandId: string,
    narration: NarrationEnvelope
  ): EngineCommandResult | null {
    const row = this.db
      .prepare(
        "SELECT result_json FROM engine_commands WHERE account_id = ? AND client_command_id = ?"
      )
      .get(context.accountId, clientCommandId) as { result_json: string | null } | undefined;
    if (!row?.result_json) return null;

    const stored = JSON.parse(row.result_json) as EngineCommandResult;
    if (stored.narrationSource === "llm") return stored;
    const state = stored.readOnly ? stored.state : this.getCampaign(context);
    const createdAt = new Date().toISOString();
    const nextState = cloneCampaign(state);
    if (!stored.readOnly) {
      const narrationMessage: EngineMessage = {
        id: randomUUID(),
        kind: "narration",
        text: narration.text,
        createdAt,
      };
      let playerIndex = -1;
      for (let index = nextState.log.length - 1; index >= 0; index -= 1) {
        if (nextState.log[index]?.kind === "player") {
          playerIndex = index;
          break;
        }
      }
      const retainedMessages = playerIndex >= 0
        ? [
            ...nextState.log.slice(0, playerIndex + 1),
            ...nextState.log.slice(playerIndex + 1).filter((message) => message.kind === "roll"),
          ]
        : nextState.log;
      nextState.log = [...retainedMessages, narrationMessage].slice(-40);
      nextState.updatedAt = createdAt;
      this.writeState(nextState);
    }

    const updated: EngineCommandResult = {
      ...stored,
      state: nextState,
      session: toSessionView(nextState),
      narration,
      narrationSource: "llm",
    };
    this.db
      .prepare(
        "UPDATE engine_commands SET result_json = ? WHERE account_id = ? AND client_command_id = ?"
      )
      .run(JSON.stringify(updated), context.accountId, clientCommandId);
    return updated;
  }

  public close(): void {
    this.db.close();
  }

  private readState(accountId: string, campaignId: string): LanternCampaignState | null {
    const row = this.db
      .prepare(
        "SELECT account_id, campaign_id, actor_id, version, state_json, updated_at FROM engine_campaigns WHERE account_id = ? AND campaign_id = ?"
      )
      .get(accountId, campaignId) as CampaignRow | undefined;
    return row ? this.mapState(row) : null;
  }

  private writeState(state: LanternCampaignState): void {
    this.db
      .prepare(
        "UPDATE engine_campaigns SET actor_id = ?, version = ?, state_json = ?, updated_at = ? WHERE account_id = ? AND campaign_id = ?"
      )
      .run(
        state.actorId,
        state.version,
        JSON.stringify(state),
        state.updatedAt,
        state.accountId,
        state.id
      );
  }

  private mapState(row: CampaignRow): LanternCampaignState {
    return normalizeCampaignState(JSON.parse(row.state_json) as LanternCampaignState);
  }
}
