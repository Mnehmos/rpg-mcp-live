import { describe, expect, it } from "vitest";
import {
  assessProductionReleaseEvidence,
  productionReleaseTag,
} from "./production-release-evidence.mjs";

const SHA = "1".repeat(40);
const OTHER_SHA = "2".repeat(40);
const VERSION = "0.1.0";
const TAG = productionReleaseTag(VERSION, SHA);

function evidence(overrides = {}) {
  return {
    expectedSha: SHA,
    expectedTag: TAG,
    tagRef: { object: { type: "tag", sha: "tag-object-sha" } },
    tagObject: { tag: TAG, object: { type: "commit", sha: SHA } },
    release: { tag_name: TAG },
    manifest: {
      controller: "railway-native-github-autodeploy",
      environment: "RPG MCP Live / production",
      sha: SHA,
      gitSha: SHA,
    },
    ...overrides,
  };
}

describe("production release evidence", () => {
  it("creates a deterministic full-SHA tag", () => {
    expect(TAG).toBe(`v0.1.0-${SHA}`);
    expect(productionReleaseTag(VERSION, OTHER_SHA)).not.toBe(TAG);
  });

  it("plans a first release when no evidence exists", () => {
    expect(
      assessProductionReleaseEvidence({
        expectedSha: SHA,
        expectedTag: TAG,
      })
    ).toBe("create");
  });

  it("reuses complete evidence for the same SHA", () => {
    expect(assessProductionReleaseEvidence(evidence())).toBe("reuse");
  });

  it("allows the same package version to create evidence for another SHA", () => {
    const otherTag = productionReleaseTag(VERSION, OTHER_SHA);
    expect(otherTag).toBe(`v0.1.0-${OTHER_SHA}`);
    expect(
      assessProductionReleaseEvidence({
        expectedSha: OTHER_SHA,
        expectedTag: otherTag,
      })
    ).toBe("create");
  });

  it("fails closed when a tag points at another SHA", () => {
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({ tagObject: { tag: TAG, object: { type: "commit", sha: OTHER_SHA } } })
      )
    ).toThrow("different SHA");
  });

  it("fails closed on incomplete or mismatched release evidence", () => {
    expect(() =>
      assessProductionReleaseEvidence(evidence({ release: undefined }))
    ).toThrow("incomplete");
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({ manifest: { ...evidence().manifest, sha: OTHER_SHA } })
      )
    ).toThrow("does not match");
  });

  it("accepts a lightweight tag only when it targets the same commit", () => {
    expect(
      assessProductionReleaseEvidence(
        evidence({ tagRef: { object: { type: "commit", sha: SHA } }, tagObject: undefined })
      )
    ).toBe("reuse");
  });
});
