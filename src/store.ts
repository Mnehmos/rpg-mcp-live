import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { ActionIntent, NarrationEnvelope } from "./ai-contracts.js";
import {
  createDefaultCharacter,
  resolveAction,
  resolveIntent,
  type GameAction,
  type GameCommandResolution,
  type GameCommandResult,
  type GameMessage,
  type GameSession,
} from "./game.js";

export interface SubscriptionRecord {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodEnd: number | null;
  updatedAt: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  version: number;
  state_json: string;
}

interface CommandRow {
  user_id: string;
  campaign_id: string;
  client_command_id: string;
  request_json: string;
  status: "processing" | "resolved";
  result_json: string | null;
}

interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  price_id: string | null;
  current_period_end: number | null;
  updated_at: string;
}

export interface ExecuteActionInput {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  expectedCampaignVersion: number;
  action: GameAction;
  createSession: () => GameSession;
}

export interface ExecuteIntentInput {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  expectedCampaignVersion: number;
  playerText: string;
  intent: ActionIntent;
  createSession: () => GameSession;
}

export interface StoredCommandRecord {
  requestJson: string;
  status: "processing" | "resolved";
  result: GameCommandResult | null;
}

interface ExecuteCommandInput {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  expectedCampaignVersion: number;
  action: string;
  requestJson: string;
  createSession: () => GameSession;
  resolve: (session: GameSession) => GameCommandResolution;
}

export class CampaignVersionConflictError extends Error {
  public readonly currentSession: GameSession;
  public readonly expectedVersion: number;

  public constructor(currentSession: GameSession, expectedVersion: number) {
    super("The campaign has changed since this command was prepared.");
    this.name = "CampaignVersionConflictError";
    this.currentSession = currentSession;
    this.expectedVersion = expectedVersion;
  }
}

export class CommandIdReuseError extends Error {
  public constructor() {
    super("A client command ID cannot be reused for a different command.");
    this.name = "CommandIdReuseError";
  }
}

export class CommandInProgressError extends Error {
  public constructor() {
    super("That client command is already being resolved.");
    this.name = "CommandInProgressError";
  }
}

export class GameStore {
  private readonly db: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        user_id TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_commands (
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        expected_version INTEGER NOT NULL,
        action TEXT NOT NULL,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, client_command_id)
      );

      CREATE TABLE IF NOT EXISTS game_events (
        event_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        client_command_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, client_command_id)
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        user_id TEXT PRIMARY KEY,
        stripe_customer_id TEXT UNIQUE,
        stripe_subscription_id TEXT UNIQUE,
        status TEXT NOT NULL,
        price_id TEXT,
        current_period_end INTEGER,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
    `);

    this.ensureSessionVersionColumn();
  }

  public getOrCreateSession(userId: string, create: () => GameSession): GameSession {
    const row = this.readSessionRow(userId);
    if (row) return this.mapSession(row);

    const session = create();
    this.saveSession(session);
    return session;
  }

  public saveSession(session: GameSession): void {
    this.writeSession(session);
  }

  public executeAction(input: ExecuteActionInput): GameCommandResult {
    const requestJson = JSON.stringify({
      campaignId: input.campaignId,
      clientCommandId: input.clientCommandId,
      expectedCampaignVersion: input.expectedCampaignVersion,
      action: input.action,
    });

    return this.executeCommand({
      userId: input.userId,
      campaignId: input.campaignId,
      clientCommandId: input.clientCommandId,
      expectedCampaignVersion: input.expectedCampaignVersion,
      action: input.action,
      requestJson,
      createSession: input.createSession,
      resolve: (current) => resolveAction(current, input.action, input.clientCommandId),
    });
  }

  public executeIntent(input: ExecuteIntentInput): GameCommandResult {
    const requestJson = JSON.stringify({
      campaignId: input.campaignId,
      clientCommandId: input.clientCommandId,
      expectedCampaignVersion: input.expectedCampaignVersion,
      playerText: input.playerText,
    });

    return this.executeCommand({
      userId: input.userId,
      campaignId: input.campaignId,
      clientCommandId: input.clientCommandId,
      expectedCampaignVersion: input.expectedCampaignVersion,
      action: input.intent.kind,
      requestJson,
      createSession: input.createSession,
      resolve: (current) => resolveIntent(current, input.intent, input.playerText, input.clientCommandId),
    });
  }

  public getStoredCommand(userId: string, clientCommandId: string): StoredCommandRecord | null {
    const row = this.db
      .prepare(
        `SELECT request_json, status, result_json
         FROM game_commands
         WHERE user_id = ? AND client_command_id = ?`
      )
      .get(userId, clientCommandId) as CommandRow | undefined;

    if (!row) return null;
    return {
      requestJson: row.request_json,
      status: row.status,
      result: row.result_json ? (JSON.parse(row.result_json) as GameCommandResult) : null,
    };
  }

  public updateCommandNarration(
    userId: string,
    clientCommandId: string,
    narration: NarrationEnvelope
  ): GameCommandResult | null {
    const row = this.db
      .prepare("SELECT result_json FROM game_commands WHERE user_id = ? AND client_command_id = ?")
      .get(userId, clientCommandId) as { result_json: string | null } | undefined;
    if (!row?.result_json) return null;

    const stored = JSON.parse(row.result_json) as GameCommandResult;
    if (stored.narrationSource === "llm") return stored;

    const updated: GameCommandResult = {
      ...stored,
      narration,
      narrationSource: "llm",
    };
    const currentRow = this.readSessionRow(userId);
    if (currentRow) {
      const session = this.mapSession(currentRow);
      const narrationMessage: GameMessage = {
        id: randomUUID(),
        kind: "narration",
        text: narration.text,
        createdAt: new Date().toISOString(),
      };
      this.writeSession({
        ...session,
        log: [...session.log, narrationMessage].slice(-30),
        updatedAt: narrationMessage.createdAt,
      });
    }
    this.db
      .prepare(
        `UPDATE game_commands
         SET result_json = ?
         WHERE user_id = ? AND client_command_id = ?`
      )
      .run(JSON.stringify(updated), userId, clientCommandId);
    return updated;
  }

  public getSubscription(userId: string): SubscriptionRecord | null {
    const row = this.db
      .prepare(
        `SELECT user_id, stripe_customer_id, stripe_subscription_id, status,
                price_id, current_period_end, updated_at
         FROM subscriptions WHERE user_id = ?`
      )
      .get(userId) as SubscriptionRow | undefined;

    return row ? this.mapSubscription(row) : null;
  }

  public findUserIdByStripeCustomer(stripeCustomerId: string): string | null {
    const row = this.db
      .prepare("SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?")
      .get(stripeCustomerId) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  public upsertSubscription(subscription: Omit<SubscriptionRecord, "updatedAt">): void {
    this.db
      .prepare(
        `INSERT INTO subscriptions (
           user_id, stripe_customer_id, stripe_subscription_id, status,
           price_id, current_period_end, updated_at
         ) VALUES (@userId, @stripeCustomerId, @stripeSubscriptionId, @status,
                   @priceId, @currentPeriodEnd, @updatedAt)
         ON CONFLICT(user_id) DO UPDATE SET
           stripe_customer_id = excluded.stripe_customer_id,
           stripe_subscription_id = excluded.stripe_subscription_id,
           status = excluded.status,
           price_id = excluded.price_id,
           current_period_end = excluded.current_period_end,
           updated_at = excluded.updated_at`
      )
      .run({
        userId: subscription.userId,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        status: subscription.status,
        priceId: subscription.priceId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        updatedAt: new Date().toISOString(),
      });
  }

  public hasWebhookEvent(eventId: string): boolean {
    const row = this.db.prepare("SELECT event_id FROM webhook_events WHERE event_id = ?").get(eventId) as
      | { event_id: string }
      | undefined;
    return Boolean(row);
  }

  public recordWebhookEvent(eventId: string, eventType: string): void {
    this.db
      .prepare(
        `INSERT INTO webhook_events (event_id, event_type, received_at)
         VALUES (?, ?, ?)`
      )
      .run(eventId, eventType, new Date().toISOString());
  }

  public close(): void {
    this.db.close();
  }

  /**
   * Exposes the underlying connection so sibling stores (e.g. ReferenceEngineStore)
   * can share one open handle to the same database file instead of opening a second
   * connection to it.
   */
  public getRawDb(): Database.Database {
    return this.db;
  }

  private executeCommand(input: ExecuteCommandInput): GameCommandResult {
    const transaction = this.db.transaction((): GameCommandResult => {
      const existing = this.db
        .prepare(
          `SELECT user_id, campaign_id, client_command_id, request_json,
                  status, result_json
           FROM game_commands
           WHERE user_id = ? AND client_command_id = ?`
        )
        .get(input.userId, input.clientCommandId) as CommandRow | undefined;

      if (existing) {
        if (existing.request_json !== input.requestJson) throw new CommandIdReuseError();
        if (existing.status !== "resolved" || !existing.result_json) throw new CommandInProgressError();

        const stored = JSON.parse(existing.result_json) as GameCommandResult;
        return { ...stored, replayed: true };
      }

      const currentRow = this.readSessionRow(input.userId);
      const current = currentRow ? this.mapSession(currentRow) : input.createSession();

      if (current.id !== input.campaignId || current.version !== input.expectedCampaignVersion) {
        throw new CampaignVersionConflictError(current, input.expectedCampaignVersion);
      }

      const createdAt = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO game_commands (
             user_id, campaign_id, client_command_id, expected_version,
             action, request_json, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)`
        )
        .run(
          input.userId,
          input.campaignId,
          input.clientCommandId,
          input.expectedCampaignVersion,
          input.action,
          input.requestJson,
          createdAt
        );

      const resolution = input.resolve(current);
      this.writeSession(resolution.session);
      this.db
        .prepare(
          `INSERT INTO game_events (
             event_id, user_id, campaign_id, client_command_id,
             version, event_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          resolution.event.id,
          input.userId,
          input.campaignId,
          input.clientCommandId,
          resolution.event.version,
          JSON.stringify(resolution.event),
          resolution.event.createdAt
        );

      const result: GameCommandResult = {
        ...resolution,
        clientCommandId: input.clientCommandId,
        replayed: false,
      };
      this.db
        .prepare(
          `UPDATE game_commands
           SET status = 'resolved', result_json = ?
           WHERE user_id = ? AND client_command_id = ?`
        )
        .run(JSON.stringify(result), input.userId, input.clientCommandId);

      return result;
    });

    return transaction();
  }

  private readSessionRow(userId: string): SessionRow | undefined {
    return this.db
      .prepare("SELECT id, user_id, version, state_json FROM game_sessions WHERE user_id = ?")
      .get(userId) as SessionRow | undefined;
  }

  private writeSession(session: GameSession): void {
    this.db
      .prepare(
        `INSERT INTO game_sessions (user_id, id, version, state_json, updated_at)
         VALUES (@userId, @id, @version, @stateJson, @updatedAt)
         ON CONFLICT(user_id) DO UPDATE SET
           id = excluded.id,
           version = excluded.version,
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`
      )
      .run({
        userId: session.userId,
        id: session.id,
        version: session.version,
        stateJson: JSON.stringify(session),
        updatedAt: session.updatedAt,
      });
  }

  private mapSession(row: SessionRow): GameSession {
    const session = JSON.parse(row.state_json) as Partial<GameSession>;
    return {
      ...session,
      character: session.character ?? createDefaultCharacter(),
      version: typeof session.version === "number" ? session.version : row.version,
    } as GameSession;
  }

  private ensureSessionVersionColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(game_sessions)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "version")) {
      this.db.exec("ALTER TABLE game_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 0");
    }
  }

  private mapSubscription(row: SubscriptionRow): SubscriptionRecord {
    return {
      userId: row.user_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      status: row.status,
      priceId: row.price_id,
      currentPeriodEnd: row.current_period_end,
      updatedAt: row.updated_at,
    };
  }
}
