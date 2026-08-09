import { describe, expect, it } from "vitest";
import {
  assessProductionReleaseEvidence,
  postPublicationEvidenceAction,
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
    release: {
      tag_name: TAG,
      draft: false,
      prerelease: false,
      published_at: "2026-08-09T21:36:23Z",
    },
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

  it("resumes release creation when the exact tag exists alone", () => {
    expect(
      assessProductionReleaseEvidence(
        evidence({ release: undefined, manifest: undefined })
      )
    ).toBe("create-release");
  });

  it("repairs and publishes an exact-tag draft", () => {
    expect(
      assessProductionReleaseEvidence(
        evidence({
          release: {
            tag_name: TAG,
            draft: true,
            prerelease: false,
            published_at: null,
          },
          manifest: undefined,
        })
      )
    ).toBe("publish-draft");
    expect(
      assessProductionReleaseEvidence(
        evidence({
          release: {
            tag_name: TAG,
            draft: true,
            prerelease: false,
            published_at: null,
          },
          manifest: { ...evidence().manifest, sha: OTHER_SHA },
        })
      )
    ).toBe("publish-draft");
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
      assessProductionReleaseEvidence(evidence({ tagRef: undefined }))
    ).toThrow("incomplete");
    expect(() =>
      assessProductionReleaseEvidence(evidence({ manifest: undefined }))
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

  it("rejects draft-like or unpublished evidence as complete", () => {
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({
          release: {
            ...evidence().release,
            draft: true,
            prerelease: true,
            published_at: null,
          },
        })
      )
    ).toThrow("Prerelease draft");
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({ release: { ...evidence().release, prerelease: true } })
      )
    ).toThrow("not a published stable release");
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({ release: { ...evidence().release, draft: undefined } })
      )
    ).toThrow("not a published stable release");
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({ release: { ...evidence().release, published_at: null } })
      )
    ).toThrow("no valid publication timestamp");
    expect(() =>
      assessProductionReleaseEvidence(
        evidence({
          release: {
            ...evidence().release,
            draft: true,
            published_at: "2026-08-09T21:36:23Z",
          },
        })
      )
    ).toThrow("contradictory");
  });

  it("bounds post-publication retries to stale release-list states", () => {
    expect(postPublicationEvidenceAction("create-release", 1, 5)).toBe("retry");
    expect(postPublicationEvidenceAction("publish-draft", 2, 5)).toBe("retry");
    expect(postPublicationEvidenceAction("reuse", 3, 5)).toBe("complete");
    expect(() => postPublicationEvidenceAction("create", 1, 5)).toThrow(
      "Unexpected post-publication evidence state"
    );
    expect(() => postPublicationEvidenceAction("create-release", 5, 5)).toThrow(
      "not visible after 5 attempts"
    );
  });
});
