#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export const CODEX_REVIEWER = "chatgpt-codex-connector[bot]";

export function findExactHeadCodexReview(reviews, headSha) {
  return [...reviews]
    .filter((review) =>
      review?.user?.login === CODEX_REVIEWER
      && review.commit_id === headSha
      && review.state !== "DISMISSED"
    )
    .sort((left, right) => String(left.submitted_at).localeCompare(String(right.submitted_at)))
    .at(-1) ?? null;
}

async function fetchReviews(repository, pullNumber, token) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "lantern-codex-review-gate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!response.ok) throw new Error(`GitHub reviews API returned HTTP ${response.status}.`);
  return response.json();
}

async function waitForReview() {
  const repository = process.env.CODEX_REPOSITORY?.trim();
  const pullNumber = process.env.CODEX_PR_NUMBER?.trim();
  const headSha = process.env.CODEX_HEAD_SHA?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!repository || !pullNumber || !headSha || !token) {
    throw new Error("Codex review gate environment is incomplete.");
  }

  const attempts = Number.parseInt(process.env.CODEX_REVIEW_ATTEMPTS ?? "90", 10);
  const delayMs = Number.parseInt(process.env.CODEX_REVIEW_DELAY_MS ?? "10000", 10);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reviews = await fetchReviews(repository, pullNumber, token);
    const review = findExactHeadCodexReview(reviews, headSha);
    if (review) {
      if (review.state === "CHANGES_REQUESTED") {
        throw new Error(`Codex requested changes for exact head ${headSha}.`);
      }
      console.log(`Codex subscription review ${review.id} covers exact head ${headSha}.`);
      return;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `No review from ${CODEX_REVIEWER} covers exact head ${headSha}. `
      + "Enable Codex automatic reviews or comment @codex review on the pull request."
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  waitForReview().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
