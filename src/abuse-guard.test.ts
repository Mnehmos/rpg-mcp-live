import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import DatabaseConstructor from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  AbuseBlockedError,
  AbuseGuard,
  type AbuseGuardPolicy,
  AbuseRateLimitError,
  SignupThrottledError,
  normaliseOrigin,
} from "./abuse-guard.js";

function createGuard(policy: Partial<AbuseGuardPolicy> = {}): AbuseGuard {
  const directory = mkdtempSync(join(tmpdir(), "rpg-mcp-live-abuse-"));
  const db = new DatabaseConstructor(join(directory, "abuse.db"));
  return new AbuseGuard(db, policy);
}

describe("normaliseOrigin", () => {
  it("groups IPv4 addresses to a /24", () => {
    expect(normaliseOrigin("203.0.113.7")).toBe("v4:203.0.113");
    expect(normaliseOrigin("203.0.113.250")).toBe("v4:203.0.113");
    expect(normaliseOrigin("203.0.114.7")).not.toBe("v4:203.0.113");
  });

  it("unwraps IPv6-mapped IPv4 addresses", () => {
    expect(normaliseOrigin("::ffff:203.0.113.7")).toBe("v4:203.0.113");
  });

  it("groups IPv6 addresses to a /48", () => {
    expect(normaliseOrigin("2001:db8:abcd:0012::1")).toBe("v6:2001:db8:abcd");
    expect(normaliseOrigin("2001:db8:abcd:9999::42")).toBe("v6:2001:db8:abcd");
  });

  it("returns null for absent input", () => {
    expect(normaliseOrigin(null)).toBeNull();
    expect(normaliseOrigin(undefined)).toBeNull();
    expect(normaliseOrigin("   ")).toBeNull();
  });

  it("is idempotent so stored keys survive a second pass", () => {
    for (const raw of ["203.0.113.7", "::ffff:203.0.113.7", "2001:db8:abcd:12::1", "example-host"]) {
      const once = normaliseOrigin(raw);
      expect(normaliseOrigin(once)).toBe(once);
    }
  });
});

describe("AbuseGuard turn burst window", () => {
  it("admits turns up to the limit and rejects the next one", () => {
    const guard = createGuard({ turnWindowMs: 60_000, maxTurnsPerWindow: 3 });
    const now = Date.now();

    guard.admitTurn("account-a", now);
    guard.admitTurn("account-a", now + 10);
    guard.admitTurn("account-a", now + 20);

    expect(() => guard.admitTurn("account-a", now + 30)).toThrow(AbuseRateLimitError);
  });

  it("reports how long the caller must wait", () => {
    const guard = createGuard({ turnWindowMs: 10_000, maxTurnsPerWindow: 1 });
    const now = Date.now();
    guard.admitTurn("account-a", now);

    try {
      guard.admitTurn("account-a", now + 4_000);
      throw new Error("expected a rate limit");
    } catch (error) {
      expect(error).toBeInstanceOf(AbuseRateLimitError);
      const limited = error as AbuseRateLimitError;
      expect(limited.limit).toBe(1);
      expect(limited.retryAfterMs).toBe(6_000);
    }
  });

  it("lets the window slide so the account recovers", () => {
    const guard = createGuard({ turnWindowMs: 1_000, maxTurnsPerWindow: 2 });
    const now = Date.now();

    guard.admitTurn("account-a", now);
    guard.admitTurn("account-a", now + 100);
    expect(() => guard.admitTurn("account-a", now + 200)).toThrow(AbuseRateLimitError);

    // Once the earlier attempts age out, the account is admitted again.
    guard.admitTurn("account-a", now + 1_500);
  });

  it("meters each account separately", () => {
    const guard = createGuard({ turnWindowMs: 60_000, maxTurnsPerWindow: 1 });
    const now = Date.now();

    guard.admitTurn("account-a", now);
    expect(() => guard.admitTurn("account-a", now + 1)).toThrow(AbuseRateLimitError);
    // A different account has its own budget.
    guard.admitTurn("account-b", now + 2);
  });
});

describe("AbuseGuard blocking", () => {
  it("blocks a disputed account from taking turns", () => {
    const guard = createGuard();
    guard.block("account-a", "payment_disputed", "dispute dp_123");

    expect(guard.isBlocked("account-a")).toBe(true);
    expect(() => guard.admitTurn("account-a")).toThrow(AbuseBlockedError);
  });

  it("carries the reason through to the error", () => {
    const guard = createGuard();
    guard.block("account-a", "payment_refunded");

    try {
      guard.admitTurn("account-a");
      throw new Error("expected a block");
    } catch (error) {
      expect(error).toBeInstanceOf(AbuseBlockedError);
      expect((error as AbuseBlockedError).reason).toBe("payment_refunded");
    }
  });

  it("re-blocking updates the reason rather than duplicating", () => {
    const guard = createGuard();
    guard.block("account-a", "manual_review");
    guard.block("account-a", "payment_disputed");

    expect(guard.getBlock("account-a")?.reason).toBe("payment_disputed");
  });

  it("unblocks cleanly", () => {
    const guard = createGuard();
    guard.block("account-a", "manual_review");
    guard.unblock("account-a");

    expect(guard.isBlocked("account-a")).toBe(false);
    guard.admitTurn("account-a");
  });

  it("blocks free-tier signup for a suspended account", () => {
    const guard = createGuard();
    guard.block("account-a", "signup_abuse");
    expect(() => guard.admitFreeTierSignup("account-a", "203.0.113.7", false)).toThrow(AbuseBlockedError);
  });
});

describe("AbuseGuard signup origin clustering", () => {
  it("throttles free accounts past the per-origin limit", () => {
    const guard = createGuard({ maxAccountsPerOrigin: 3 });
    const now = Date.now();

    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now);
    guard.admitFreeTierSignup("account-2", "203.0.113.11", false, now);
    guard.admitFreeTierSignup("account-3", "203.0.113.12", false, now);

    // Fourth account from the same /24 is throttled.
    expect(() => guard.admitFreeTierSignup("account-4", "203.0.113.13", false, now)).toThrow(
      SignupThrottledError,
    );
  });

  it("never throttles an entitled account", () => {
    const guard = createGuard({ maxAccountsPerOrigin: 1 });
    const now = Date.now();

    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now);
    // A paying account from the same household must still get in.
    guard.admitFreeTierSignup("account-2", "203.0.113.11", true, now);

    expect(guard.isBlocked("account-2")).toBe(false);
  });

  it("treats a returning account as known rather than a new cluster member", () => {
    const guard = createGuard({ maxAccountsPerOrigin: 2 });
    const now = Date.now();

    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now);
    guard.admitFreeTierSignup("account-2", "203.0.113.11", false, now);

    // account-1 coming back must not be rejected by the limit it helped fill.
    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now + 1_000);
  });

  it("keeps distinct origins independent", () => {
    const guard = createGuard({ maxAccountsPerOrigin: 1 });
    const now = Date.now();

    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now);
    guard.admitFreeTierSignup("account-2", "198.51.100.10", false, now);

    expect(guard.countAccountsForOrigin("203.0.113.10", now)).toBe(1);
    expect(guard.countAccountsForOrigin("198.51.100.10", now)).toBe(1);
  });

  it("ages origin clusters out of the window", () => {
    const guard = createGuard({ maxAccountsPerOrigin: 1, originWindowMs: 1_000 });
    const now = Date.now();

    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now);
    // Long after the window, the origin looks clean again.
    guard.admitFreeTierSignup("account-2", "203.0.113.11", false, now + 5_000);
  });

  it("ignores signups with no usable origin", () => {
    const guard = createGuard({ maxAccountsPerOrigin: 1 });
    guard.admitFreeTierSignup("account-1", null, false);
    guard.admitFreeTierSignup("account-2", null, false);
    expect(guard.countAccountsForOrigin(null)).toBe(0);
  });
});

describe("AbuseGuard assessment", () => {
  it("summarises risk for support tooling", () => {
    const guard = createGuard({ turnWindowMs: 60_000, maxTurnsPerWindow: 10, maxAccountsPerOrigin: 10 });
    const now = Date.now();

    guard.admitFreeTierSignup("account-1", "203.0.113.10", false, now);
    guard.admitFreeTierSignup("account-2", "203.0.113.11", false, now);
    guard.admitTurn("account-1", now);
    guard.admitTurn("account-1", now + 5);
    guard.block("account-2", "payment_disputed");

    const clean = guard.assess("account-1", now + 10);
    expect(clean.blocked).toBe(false);
    expect(clean.turnsInWindow).toBe(2);
    expect(clean.originAccountCount).toBe(2);

    const flagged = guard.assess("account-2", now + 10);
    expect(flagged.blocked).toBe(true);
    expect(flagged.blockReason).toBe("payment_disputed");
  });
});
