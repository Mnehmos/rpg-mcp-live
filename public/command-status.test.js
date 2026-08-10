import { describe, expect, it } from "vitest";
import { isStaleCommandStatus } from "./command-status.js";

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
});
