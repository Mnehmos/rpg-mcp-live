import { describe, expect, it } from "vitest";
import { commandFailureMessage, commandFailureType, isStaleCommandStatus, streamedFailureStatus } from "./command-status.js";

describe("command status", () => {
  it("rejects a stored result older than the current campaign", () => {
    expect(isStaleCommandStatus({
      status: "resolved",
      campaignVersion: 4,
      result: { session: { version: 3 } },
    })).toBe(true);
  });

  it("accepts the stored result when it is current", () => {
    expect(isStaleCommandStatus({
      status: "resolved",
      campaignVersion: 3,
      result: { session: { version: 3 } },
    })).toBe(false);
    expect(isStaleCommandStatus({ status: "processing", campaignVersion: 3 })).toBe(false);
  });

  it("classifies a usage gate before the frontend starts reconciliation", () => {
    expect(commandFailureType({ code: "llm_usage_limit_exceeded", period: "daily" }, 429)).toBe("usage_limit");
    expect(commandFailureMessage({
      code: "llm_usage_limit_exceeded",
      period: "daily",
      usage: { plan: "free" },
    }, 429)).toBe("Your free play limit for today has been reached. Your campaign is safe; this turn was not committed.");
  });

  it("does not mislabel a service-wide brake as a Player Pass limit", () => {
    expect(commandFailureMessage({
      code: "llm_usage_limit_exceeded",
      period: "global_daily",
      usage: { plan: "player_pass" },
    }, 429)).toBe(
      "Quest Keeper has reached its service-wide usage limit for today. Your campaign is safe; this turn was not committed.",
    );
  });

  it("explains safe retry when the DM failed before any state commit", () => {
    expect(commandFailureMessage({ commitStatus: "not_committed" })).toBe(
      "The Dungeon Master could not finish this turn. No game state changed, so you can safely try again."
    );
    expect(commandFailureMessage({
      commitStatus: "not_committed",
      error: "A more specific provider message.",
    })).toBe("The Dungeon Master could not finish this turn. No game state changed, so you can safely try again.");
  });

  it("distinguishes an unavailable provider from an uncertain commit", () => {
    expect(commandFailureType({ failureType: "provider_unavailable" }, 502)).toBe("provider_unavailable");
    expect(commandFailureMessage({ failureType: "provider_unavailable" }, 502)).toContain("temporarily unavailable");
    expect(commandFailureMessage({ failureType: "uncertain" }, 502)).toContain("checking whether this turn committed");
  });

  it("tells the player when the DM is offline on our side or the table is busy", () => {
    expect(commandFailureMessage({ failureType: "not_committed", reason: "provider_auth", commitStatus: "not_committed" }, 502)).toContain("offline on our side");
    expect(commandFailureMessage({ failureType: "not_committed", reason: "provider_credit", commitStatus: "not_committed" }, 502)).toContain("offline on our side");
    expect(commandFailureMessage({ failureType: "capacity", reason: "capacity", commitStatus: "not_committed" }, 429)).toContain("busy");
    expect(commandFailureMessage({ failureType: "uncertain", reason: "provider_auth", commitStatus: "uncertain" }, 502)).toContain("checking whether this turn committed");
    expect(commandFailureMessage({ failureType: "uncertain", reason: "capacity", commitStatus: "uncertain" }, 429)).toContain("checking whether this turn committed");
  });

  it("gives a streamed failure the status its buffered twin would have", () => {
    expect(streamedFailureStatus({ failureType: "capacity", commitStatus: "not_committed" })).toBe(429);
    expect(streamedFailureStatus({ failureType: "usage_limit", commitStatus: "not_committed" })).toBe(429);
    expect(streamedFailureStatus({ failureType: "uncertain", reason: "capacity", commitStatus: "uncertain" })).toBe(502);
    expect(streamedFailureStatus({ failureType: "not_committed", reason: "provider_auth", commitStatus: "not_committed" })).toBe(502);
  });
});
