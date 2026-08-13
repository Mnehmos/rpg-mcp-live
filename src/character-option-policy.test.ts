import { describe, expect, it, vi } from "vitest";
import { characterOptionPolicy } from "./character-option-policy.js";
import type { EngineContentPolicy } from "./engine-contracts.js";

const FALLBACK: EngineContentPolicy = {
  gamesystem: "5e-2014",
  baseDocumentKey: "srd-2014",
  allowedDocumentKeys: ["srd-2014"],
  allowedLicenseKeys: ["cc-by-40"],
};

const CHOSEN: EngineContentPolicy = {
  gamesystem: "5e-2014",
  baseDocumentKey: "srd-2014",
  allowedDocumentKeys: ["core", "srd-2014"],
  allowedLicenseKeys: ["cc-by-40", "cc0"],
};

const stored = (contentPolicy: EngineContentPolicy) =>
  JSON.stringify({ name: "A campaign", contentPolicy });

/** Stand-in for validateCampaignContentPolicy, which needs a content pack. */
const accept = (policy: EngineContentPolicy) => policy;
const reject = () => {
  throw new Error("Document tob is not enabled by the deployment policy.");
};

describe("character option policy", () => {
  it("uses the policy the campaign was created with", () => {
    expect(characterOptionPolicy(stored(CHOSEN), FALLBACK, accept)).toEqual({
      gamesystem: "5e-2014",
      allowedDocuments: ["core", "srd-2014"],
      allowedLicenses: ["cc-by-40", "cc0"],
    });
  });

  it("falls back to the deployment default for a campaign with no stored policy", () => {
    // Campaigns created before policies were persisted still need filtering;
    // returning nothing would mean no filtering at all.
    expect(characterOptionPolicy(JSON.stringify({ name: "Older" }), FALLBACK, accept)).toEqual({
      gamesystem: "5e-2014",
      allowedDocuments: ["srd-2014"],
      allowedLicenses: ["cc-by-40"],
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
  ])("falls back when the profile is %s", (_label, profile) => {
    expect(characterOptionPolicy(profile, FALLBACK, accept).allowedDocuments).toEqual(["srd-2014"]);
  });

  it("falls back rather than throwing on an unparseable profile", () => {
    expect(() => characterOptionPolicy("{not json", FALLBACK, accept)).not.toThrow();
    expect(characterOptionPolicy("{not json", FALLBACK, accept).allowedDocuments).toEqual(["srd-2014"]);
  });

  describe("stored policies the deployment no longer permits", () => {
    it("falls back to the default instead of serving forbidden documents", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      // A campaign created before creation-time validation existed, or before
      // the deployment's allowlist narrowed, must not keep its wider reach.
      const policy = characterOptionPolicy(stored(CHOSEN), FALLBACK, reject);

      expect(policy.allowedDocuments).toEqual(["srd-2014"]);
      expect(policy.allowedLicenses).toEqual(["cc-by-40"]);
      warn.mockRestore();
    });

    it("does not throw out of the endpoint", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => characterOptionPolicy(stored(CHOSEN), FALLBACK, reject)).not.toThrow();
      warn.mockRestore();
    });

    it("records why the stored policy was discarded", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      characterOptionPolicy(stored(CHOSEN), FALLBACK, reject);

      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it("validates the stored policy rather than trusting it", () => {
    const validate = vi.fn(accept);

    characterOptionPolicy(stored(CHOSEN), FALLBACK, validate);

    expect(validate).toHaveBeenCalledWith(CHOSEN);
  });

  it("never returns an unfiltered policy", () => {
    const policy = characterOptionPolicy(null, FALLBACK, accept);

    expect(policy.gamesystem).toBeTruthy();
    expect(policy.allowedDocuments.length).toBeGreaterThan(0);
    expect(policy.allowedLicenses.length).toBeGreaterThan(0);
  });
});
