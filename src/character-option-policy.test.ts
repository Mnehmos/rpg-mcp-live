import { describe, expect, it } from "vitest";
import { characterOptionPolicy } from "./character-option-policy.js";
import type { EngineContentPolicy } from "./engine-contracts.js";

const FALLBACK: EngineContentPolicy = {
  gamesystem: "5e-2014",
  baseDocumentKey: "srd-2014",
  allowedDocumentKeys: ["srd-2014"],
  allowedLicenseKeys: ["cc-by-40"],
};

const stored = (contentPolicy: EngineContentPolicy) =>
  JSON.stringify({ name: "A campaign", contentPolicy });

describe("character option policy", () => {
  it("uses the policy the campaign was created with", () => {
    const chosen: EngineContentPolicy = {
      gamesystem: "5e-2014",
      baseDocumentKey: "srd-2014",
      allowedDocumentKeys: ["core", "srd-2014"],
      allowedLicenseKeys: ["cc-by-40", "cc0"],
    };

    expect(characterOptionPolicy(stored(chosen), FALLBACK)).toEqual({
      gamesystem: "5e-2014",
      allowedDocuments: ["core", "srd-2014"],
      allowedLicenses: ["cc-by-40", "cc0"],
    });
  });

  it("falls back to the deployment default for a campaign with no stored policy", () => {
    // Campaigns created before policies were persisted still need filtering;
    // returning nothing would mean no filtering at all.
    expect(characterOptionPolicy(JSON.stringify({ name: "Older campaign" }), FALLBACK)).toEqual({
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
    expect(characterOptionPolicy(profile, FALLBACK).allowedDocuments).toEqual(["srd-2014"]);
  });

  it("falls back rather than throwing on an unparseable profile", () => {
    // A profile row that will not parse is a storage problem; it must not hand
    // the player an unfiltered content list, and must not 500 the endpoint.
    expect(() => characterOptionPolicy("{not json", FALLBACK)).not.toThrow();
    expect(characterOptionPolicy("{not json", FALLBACK).allowedDocuments).toEqual(["srd-2014"]);
  });

  it("never returns an unfiltered policy", () => {
    const policy = characterOptionPolicy(null, FALLBACK);

    expect(policy.gamesystem).toBeTruthy();
    expect(policy.allowedDocuments.length).toBeGreaterThan(0);
    expect(policy.allowedLicenses.length).toBeGreaterThan(0);
  });
});
