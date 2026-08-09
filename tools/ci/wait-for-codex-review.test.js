import { describe, expect, it } from "vitest";
import {
  CODEX_REVIEWER,
  findExactHeadCodexReview,
} from "./wait-for-codex-review.mjs";

describe("subscription-backed Codex review gate", () => {
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
});
