import { describe, expect, it } from "vitest";
import {
  activeCampaignStorageKey,
  campaignSessionUrl,
  isCurrentCampaignSelection,
  isConfirmedMissingCommand,
  isCurrentRequest,
  nextRequestSequence,
  pendingCommandStorageKey,
  retryDelayMs,
  shouldRetryCampaignLoad,
} from "./campaign-resume.js";

describe("authenticated campaign resume", () => {
  it("keeps the active campaign storage isolated per account", () => {
    expect(activeCampaignStorageKey("user_123")).toBe("lantern.activeCampaignId.user_123");
    expect(activeCampaignStorageKey("")).toBe("lantern.activeCampaignId.anonymous");
    expect(pendingCommandStorageKey("user_123")).toBe("lantern.pendingCommand.user_123");
  });

  it("requests the persisted campaign without allowing URL injection", () => {
    expect(campaignSessionUrl("campaign/one")).toBe("/api/session?campaignId=campaign%2Fone");
    expect(campaignSessionUrl(" ")).toBe("/api/session");
  });

  it("retries transient campaign-load failures but not permanent selection errors", () => {
    expect(shouldRetryCampaignLoad(408)).toBe(true);
    expect(shouldRetryCampaignLoad(425)).toBe(true);
    expect(shouldRetryCampaignLoad(502)).toBe(true);
    expect(shouldRetryCampaignLoad(429)).toBe(true);
    expect(shouldRetryCampaignLoad(404)).toBe(false);
    expect(shouldRetryCampaignLoad(403)).toBe(false);
  });

  it("keeps retries bounded and deterministic", () => {
    expect(retryDelayMs(1)).toBe(400);
    expect(retryDelayMs(3)).toBe(1200);
    expect(retryDelayMs(0)).toBe(400);
    expect(nextRequestSequence(4)).toBe(5);
    expect(nextRequestSequence("bad")).toBe(1);
  });

  it("ignores stale refreshes and superseded campaign selections", () => {
    expect(isCurrentRequest(4, 4)).toBe(true);
    expect(isCurrentRequest(4, 5)).toBe(false);
    expect(isCurrentCampaignSelection("campaign-a", "campaign-a")).toBe(true);
    expect(isCurrentCampaignSelection("campaign-a", "campaign-b")).toBe(false);
    expect(isCurrentCampaignSelection("", "")).toBe(false);
    expect(isConfirmedMissingCommand(404, "command_not_found")).toBe(true);
    expect(isConfirmedMissingCommand(404, "temporary_error")).toBe(false);
  });
});

