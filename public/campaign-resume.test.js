import { describe, expect, it } from "vitest";
import {
  activeCampaignStorageKey,
  campaignSessionUrl,
  shouldRetryCampaignLoad,
} from "./campaign-resume.js";

describe("authenticated campaign resume", () => {
  it("keeps the active campaign storage isolated per account", () => {
    expect(activeCampaignStorageKey("user_123")).toBe("lantern.activeCampaignId.user_123");
    expect(activeCampaignStorageKey("")).toBe("lantern.activeCampaignId.anonymous");
  });

  it("requests the persisted campaign without allowing URL injection", () => {
    expect(campaignSessionUrl("campaign/one")).toBe("/api/session?campaignId=campaign%2Fone");
    expect(campaignSessionUrl(" ")).toBe("/api/session");
  });

  it("retries transient campaign-load failures but not permanent selection errors", () => {
    expect(shouldRetryCampaignLoad(502)).toBe(true);
    expect(shouldRetryCampaignLoad(429)).toBe(true);
    expect(shouldRetryCampaignLoad(404)).toBe(false);
    expect(shouldRetryCampaignLoad(403)).toBe(false);
  });
});

