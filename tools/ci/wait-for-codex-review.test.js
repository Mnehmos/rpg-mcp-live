import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CODEX_REVIEWER,
  fetchAllGitHubPages,
  findExactHeadCleanCodexComment,
  findExactHeadCodexReview,
  findLatestExactHeadCodexVerdict,
  nextPageFromLinkHeader,
} from "./wait-for-codex-review.mjs";

describe("subscription-backed Codex review gate", () => {
  it("starts only from the trusted pull_request_target event", () => {
    const workflow = readFileSync(
      new URL("../../.github/workflows/codex-review.yml", import.meta.url),
      "utf8"
    );

    expect(workflow).toMatch(/^\s{2}pull_request_target:/m);
    expect(workflow).not.toMatch(/^\s{2}(pull_request_review|issue_comment):/m);
    expect(workflow).toContain("github.event.pull_request.base.sha || github.event.repository.default_branch");
  });

  it("accepts a connector review only for the exact head", () => {
    const review = findExactHeadCodexReview([
      { id: 1, user: { login: CODEX_REVIEWER }, commit_id: "old", state: "COMMENTED", submitted_at: "2026-01-01" },
      { id: 2, user: { login: "human" }, commit_id: "head", state: "APPROVED", submitted_at: "2026-01-02" },
      { id: 3, user: { login: CODEX_REVIEWER }, commit_id: "head", state: "COMMENTED", submitted_at: "2026-01-03" },
    ], "head");

    expect(review).toMatchObject({ id: 3, commit_id: "head" });
  });

  it("rejects missing, stale, and dismissed connector reviews", () => {
    expect(findExactHeadCodexReview([], "head")).toBeNull();
    expect(findExactHeadCodexReview([
      { id: 1, user: { login: CODEX_REVIEWER }, commit_id: "old", state: "COMMENTED" },
    ], "head")).toBeNull();
    expect(findExactHeadCodexReview([
      { id: 2, user: { login: CODEX_REVIEWER }, commit_id: "head", state: "DISMISSED" },
    ], "head")).toBeNull();
  });

  it("accepts only a clean connector comment naming the exact head", () => {
    const cleanBody = (commit) => `Codex Review: Didn't find any major issues. Keep them coming!\n\n**Reviewed commit:** \`${commit}\``;
    const comment = findExactHeadCleanCodexComment([
      { id: 1, user: { login: CODEX_REVIEWER }, body: cleanBody("aaaaaaaaaa"), created_at: "2026-01-01" },
      { id: 2, user: { login: "human" }, body: cleanBody("1234567890"), created_at: "2026-01-02" },
      { id: 3, user: { login: CODEX_REVIEWER }, body: cleanBody("1234567890"), created_at: "2026-01-03" },
    ], "1234567890abcdef");

    expect(comment).toMatchObject({ id: 3 });
    expect(findExactHeadCleanCodexComment([
      { id: 4, user: { login: CODEX_REVIEWER }, body: cleanBody("123456789"), created_at: "2026-01-04" },
    ], "1234567890abcdef")).toBeNull();
  });

  it("honors the newest exact-head Codex verdict", () => {
    const cleanBody = "Codex Review: Didn't find any major issues. Keep them coming!\n\n**Reviewed commit:** `1234567890`";
    const review = {
      id: 10,
      user: { login: CODEX_REVIEWER },
      commit_id: "1234567890abcdef",
      state: "COMMENTED",
      submitted_at: "2026-01-02T00:00:00Z",
    };
    const clean = {
      id: 11,
      user: { login: CODEX_REVIEWER },
      body: cleanBody,
      created_at: "2026-01-01T00:00:00Z",
    };

    expect(findLatestExactHeadCodexVerdict([review], [clean], "1234567890abcdef"))
      .toMatchObject({ kind: "findings", evidence: { id: 10 } });
    clean.created_at = "2026-01-03T00:00:00Z";
    expect(findLatestExactHeadCodexVerdict([review], [clean], "1234567890abcdef"))
      .toMatchObject({ kind: "clean", evidence: { id: 11 } });
  });

  it("follows every GitHub evidence page", async () => {
    const secondPage = "https://api.github.com/example?page=2";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ link: `<${secondPage}>; rel="next", <${secondPage}>; rel="last"` }),
        json: async () => [{ id: 1 }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [{ id: 2 }],
      });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(fetchAllGitHubPages("/example?page=1", "token")).resolves.toEqual([{ id: 1 }, { id: 2 }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(nextPageFromLinkHeader(`<${secondPage}>; rel="next"`)).toBe(secondPage);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
