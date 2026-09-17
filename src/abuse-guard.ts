import type Database from "better-sqlite3";

/**
 * Abuse controls that sit beside, not inside, the cost ledger.
 *
 * `LlmUsageStore` already answers "has this account spent too much money over
 * a day or a month". That is the right shape for billing and the wrong shape
 * for abuse: it cannot see a script firing turns as fast as the network
 * allows (a burst is cheap right up until it isn't), it cannot see one person
 * running twenty free accounts from one machine, and it happily keeps serving
 * an account whose payment was clawed back.
 *
 * This module covers those three gaps:
 *
 * - a short sliding window on turn attempts, so bursts are shaped before they
 *   reach either the provider gate or the cost ledger;
 * - signup-origin clustering, so free-tier farming from a single origin is
 *   visible and throttleable;
 * - a durable block list, so a chargeback or refund actually removes access
 *   instead of leaving a paid-then-reversed account playing on.
 *
 * Every decision is advisory data plus one boolean: callers get a typed
 * error they can map to an HTTP status, never a silent drop.
 */

export type AbuseBlockReason =
  | "payment_disputed"
  | "payment_refunded"
  | "manual_review"
  | "signup_abuse";

export interface AbuseGuardPolicy {
  /** Length of the burst window for turn attempts. */
  turnWindowMs: number;
  /** Maximum turn attempts inside one window, per account. */
  maxTurnsPerWindow: number;
  /**
   * How many distinct accounts one signup origin may register before further
   * free-tier accounts from that origin are throttled. Paid accounts are
   * never throttled by this: a household or campus sharing one address is a
   * normal case, and a card charge is a far stronger identity signal than an
   * IP address.
   */
  maxAccountsPerOrigin: number;
  /** Window over which signup origins are clustered. */
  originWindowMs: number;
}

export const DEFAULT_ABUSE_POLICY: AbuseGuardPolicy = {
  turnWindowMs: 60_000,
  maxTurnsPerWindow: 12,
  maxAccountsPerOrigin: 4,
  originWindowMs: 24 * 60 * 60 * 1_000,
};

export class AbuseRateLimitError extends Error {
  public readonly code = "abuse_rate_limited";

  public constructor(
    public readonly attempts: number,
    public readonly limit: number,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Too many turns too quickly: ${attempts} in the last window (limit ${limit}). Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
    );
    this.name = "AbuseRateLimitError";
  }
}

export class AbuseBlockedError extends Error {
  public readonly code = "abuse_blocked";

  public constructor(
    public readonly reason: AbuseBlockReason,
    public readonly blockedAt: string,
  ) {
    super(reasonMessage(reason));
    this.name = "AbuseBlockedError";
  }
}

export class SignupThrottledError extends Error {
  public readonly code = "signup_throttled";

  public constructor(
    public readonly originAccounts: number,
    public readonly limit: number,
  ) {
    super(
      `This location has already registered ${originAccounts} free accounts (limit ${limit}). A Player Pass removes this limit.`,
    );
    this.name = "SignupThrottledError";
  }
}

function reasonMessage(reason: AbuseBlockReason): string {
  switch (reason) {
    case "payment_disputed":
      return "This account is suspended because a payment was disputed. Resolve the dispute with support to restore access.";
    case "payment_refunded":
      return "This account is suspended because its payment was refunded.";
    case "signup_abuse":
      return "This account is suspended for automated signup abuse.";
    case "manual_review":
    default:
      return "This account is suspended pending review.";
  }
}

export interface AccountRiskAssessment {
  accountId: string;
  blocked: boolean;
  blockReason: AbuseBlockReason | null;
  /** Accounts sharing this account's signup origin, including itself. */
  originAccountCount: number;
  turnsInWindow: number;
}

interface BlockRow {
  reason: string;
  blocked_at: string;
}

const ABUSE_SCHEMA = `
CREATE TABLE IF NOT EXISTS abuse_turn_attempts (
  account_id TEXT NOT NULL,
  attempted_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS abuse_turn_attempts_account_idx
  ON abuse_turn_attempts (account_id, attempted_at_ms);

CREATE TABLE IF NOT EXISTS abuse_account_origins (
  account_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  first_seen_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS abuse_account_origins_origin_idx
  ON abuse_account_origins (origin, first_seen_at_ms);

CREATE TABLE IF NOT EXISTS abuse_blocks (
  account_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  blocked_at TEXT NOT NULL,
  detail TEXT
);
`;

export class AbuseGuard {
  private readonly policy: AbuseGuardPolicy;

  public constructor(
    private readonly db: Database.Database,
    policy: Partial<AbuseGuardPolicy> = {},
  ) {
    this.policy = { ...DEFAULT_ABUSE_POLICY, ...policy };
    this.db.exec(ABUSE_SCHEMA);
  }

  /**
   * Records a turn attempt and enforces the burst window.
   *
   * Called before the turn does any work, so a rejected burst costs a row
   * insert rather than a provider call. Throws if the account is blocked, so
   * a single call covers both checks on the hot path.
   */
  public admitTurn(accountId: string, now = Date.now()): void {
    this.assertNotBlocked(accountId);

    const windowStart = now - this.policy.turnWindowMs;
    this.db.prepare("DELETE FROM abuse_turn_attempts WHERE attempted_at_ms < ?").run(windowStart);

    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS attempts, MIN(attempted_at_ms) AS oldest FROM abuse_turn_attempts WHERE account_id = ? AND attempted_at_ms >= ?",
      )
      .get(accountId, windowStart) as { attempts: number; oldest: number | null };

    if (row.attempts >= this.policy.maxTurnsPerWindow) {
      // The window frees up when its oldest attempt ages out.
      const oldest = row.oldest ?? now;
      const retryAfterMs = Math.max(1, oldest + this.policy.turnWindowMs - now);
      throw new AbuseRateLimitError(row.attempts, this.policy.maxTurnsPerWindow, retryAfterMs);
    }

    this.db
      .prepare("INSERT INTO abuse_turn_attempts (account_id, attempted_at_ms) VALUES (?, ?)")
      .run(accountId, now);
  }

  /**
   * Binds an account to the origin it was first seen from.
   *
   * Only the first origin per account is retained. Travelling users and
   * changing addresses are normal; what matters is how many accounts trace
   * back to one origin, not where any one account connects from today.
   */
  public recordAccountOrigin(accountId: string, origin: string | null, now = Date.now()): void {
    const normalised = normaliseOrigin(origin);
    if (!normalised) return;
    this.db
      .prepare(
        "INSERT OR IGNORE INTO abuse_account_origins (account_id, origin, first_seen_at_ms) VALUES (?, ?, ?)",
      )
      .run(accountId, normalised, now);
  }

  /** Distinct accounts registered from `origin` inside the origin window. */
  public countAccountsForOrigin(origin: string | null, now = Date.now()): number {
    const normalised = normaliseOrigin(origin);
    if (!normalised) return 0;
    const windowStart = now - this.policy.originWindowMs;
    const row = this.db
      .prepare(
        "SELECT COUNT(DISTINCT account_id) AS count FROM abuse_account_origins WHERE origin = ? AND first_seen_at_ms >= ?",
      )
      .get(normalised, windowStart) as { count: number };
    return Number(row.count);
  }

  /**
   * Throttles free-tier signup clusters from one origin.
   *
   * `entitled` accounts skip the check entirely: a completed card charge is a
   * much stronger identity signal than a shared address, and throttling
   * paying customers behind their household's IP is worse than the abuse.
   */
  public admitFreeTierSignup(
    accountId: string,
    origin: string | null,
    entitled: boolean,
    now = Date.now(),
  ): void {
    this.assertNotBlocked(accountId);
    if (entitled) {
      this.recordAccountOrigin(accountId, origin, now);
      return;
    }

    const normalised = normaliseOrigin(origin);
    if (!normalised) return;

    // An account already bound to this origin is a returning user, not a new
    // member of the cluster, so it must not be counted against the limit.
    const known = this.db
      .prepare("SELECT 1 FROM abuse_account_origins WHERE account_id = ?")
      .get(accountId);
    if (known) return;

    const existing = this.countAccountsForOrigin(normalised, now);
    if (existing >= this.policy.maxAccountsPerOrigin) {
      throw new SignupThrottledError(existing, this.policy.maxAccountsPerOrigin);
    }
    this.recordAccountOrigin(accountId, normalised, now);
  }

  public block(accountId: string, reason: AbuseBlockReason, detail?: string, now = new Date()): void {
    this.db
      .prepare(
        `INSERT INTO abuse_blocks (account_id, reason, blocked_at, detail)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET reason = excluded.reason, blocked_at = excluded.blocked_at, detail = excluded.detail`,
      )
      .run(accountId, reason, now.toISOString(), detail ?? null);
  }

  public unblock(accountId: string): void {
    this.db.prepare("DELETE FROM abuse_blocks WHERE account_id = ?").run(accountId);
  }

  public isBlocked(accountId: string): boolean {
    return this.getBlock(accountId) !== null;
  }

  public getBlock(accountId: string): { reason: AbuseBlockReason; blockedAt: string } | null {
    const row = this.db
      .prepare("SELECT reason, blocked_at FROM abuse_blocks WHERE account_id = ?")
      .get(accountId) as BlockRow | undefined;
    if (!row) return null;
    return { reason: row.reason as AbuseBlockReason, blockedAt: row.blocked_at };
  }

  public assertNotBlocked(accountId: string): void {
    const block = this.getBlock(accountId);
    if (block) throw new AbuseBlockedError(block.reason, block.blockedAt);
  }

  /** Read-only view for support tooling and the observability surface. */
  public assess(accountId: string, now = Date.now()): AccountRiskAssessment {
    const block = this.getBlock(accountId);
    const originRow = this.db
      .prepare("SELECT origin FROM abuse_account_origins WHERE account_id = ?")
      .get(accountId) as { origin: string } | undefined;
    const windowStart = now - this.policy.turnWindowMs;
    const turns = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM abuse_turn_attempts WHERE account_id = ? AND attempted_at_ms >= ?",
      )
      .get(accountId, windowStart) as { count: number };

    return {
      accountId,
      blocked: block !== null,
      blockReason: block?.reason ?? null,
      originAccountCount: originRow ? this.countAccountsForOrigin(originRow.origin, now) : 0,
      turnsInWindow: Number(turns.count),
    };
  }
}

/**
 * Normalises a client address into a clustering key.
 *
 * IPv4 is grouped to its /24 and IPv6 to its /48, because a single abuser
 * rotating addresses inside one allocation is the common case and exact-match
 * clustering would miss it entirely.
 */
export function normaliseOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const trimmed = origin.trim().toLowerCase();
  if (!trimmed) return null;

  // Idempotent: an already-normalised key passes through untouched. Stored
  // keys get read back and re-checked on several paths, and re-normalising a
  // key silently produces a *different* key, which quietly splits one cluster
  // into two and defeats the limit it exists to enforce.
  if (/^(?:v4|v6|raw):/.test(trimmed)) return trimmed;

  // Strip an IPv6-mapped IPv4 prefix and any port suffix.
  const unmapped = trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(unmapped)) {
    const octets = unmapped.split(".");
    return `v4:${octets[0]}.${octets[1]}.${octets[2]}`;
  }

  if (unmapped.includes(":")) {
    const groups = unmapped.split(":").filter((group) => group.length > 0);
    if (groups.length === 0) return null;
    return `v6:${groups.slice(0, 3).join(":")}`;
  }

  return `raw:${unmapped}`;
}
