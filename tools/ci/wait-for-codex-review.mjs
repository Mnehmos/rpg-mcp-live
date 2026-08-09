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

export function findExactHeadCleanCodexComment(comments, headSha) {
  const normalizedHead = headSha.toLowerCase();
  return [...comments]
    .filter((comment) => {
      if (comment?.user?.login !== CODEX_REVIEWER || typeof comment.body !== "string") return false;
      if (!comment.body.startsWith("Codex Review: Didn't find any major issues.")) return false;
      const reviewedCommit = comment.body.match(/\*\*Reviewed commit:\*\*\s*`([0-9a-f]{10,40})`/i)?.[1]?.toLowerCase();
      return Boolean(reviewedCommit && normalizedHead.startsWith(reviewedCommit));
    })
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
    .at(-1) ?? null;
}

async function fetchGitHubJson(path, token) {
  const response = await fetch(
    `https://api.github.com${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "lantern-codex-review-gate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} for ${path}.`);
  return response.json();
}

async function setCommitStatus(repository, headSha, token, state, description, targetUrl) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/statuses/${headSha}`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "lantern-codex-review-gate",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        state,
        context: "Codex review",
        description,
        ...(targetUrl ? { target_url: targetUrl } : {}),
      }),
    }
  );
  if (!response.ok) throw new Error(`GitHub status API returned HTTP ${response.status}.`);
}

async function waitForReview() {
  const repository = process.env.CODEX_REPOSITORY?.trim();
  const pullNumber = process.env.CODEX_PR_NUMBER?.trim();
  let headSha = process.env.CODEX_HEAD_SHA?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();
  const runUrl = process.env.CODEX_RUN_URL?.trim();
  if (!repository || !pullNumber || !token) {
    throw new Error("Codex review gate environment is incomplete.");
  }
  if (!headSha) {
    const pull = await fetchGitHubJson(`/repos/${repository}/pulls/${pullNumber}`, token);
    headSha = pull?.head?.sha;
  }
  if (!headSha) throw new Error("Could not resolve the pull request head SHA.");

  await setCommitStatus(repository, headSha, token, "pending", "Waiting for subscription-backed Codex review.", runUrl);

  const attempts = Number.parseInt(process.env.CODEX_REVIEW_ATTEMPTS ?? "90", 10);
  const delayMs = Number.parseInt(process.env.CODEX_REVIEW_DELAY_MS ?? "10000", 10);
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const [reviews, comments] = await Promise.all([
        fetchGitHubJson(`/repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`, token),
        fetchGitHubJson(`/repos/${repository}/issues/${pullNumber}/comments?per_page=100&sort=created&direction=desc`, token),
      ]);
      const review = findExactHeadCodexReview(reviews, headSha);
      if (review) {
        if (review.state === "CHANGES_REQUESTED") {
          throw new Error(`Codex requested changes for exact head ${headSha}.`);
        }
        await setCommitStatus(repository, headSha, token, "success", "Subscription Codex reviewed this exact commit.", runUrl);
        console.log(`Codex subscription review ${review.id} covers exact head ${headSha}.`);
        return;
      }
      const cleanComment = findExactHeadCleanCodexComment(comments, headSha);
      if (cleanComment) {
        await setCommitStatus(repository, headSha, token, "success", "Subscription Codex found no major issues on this commit.", runUrl);
        console.log(`Clean Codex subscription review comment ${cleanComment.id} covers exact head ${headSha}.`);
        return;
      }
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(
      `No review from ${CODEX_REVIEWER} covers exact head ${headSha}. `
        + "Enable Codex automatic reviews or comment @codex review on the pull request."
    );
  } catch (error) {
    try {
      await setCommitStatus(repository, headSha, token, "failure", "No acceptable subscription Codex review covers this commit.", runUrl);
    } catch (statusError) {
      console.error(statusError instanceof Error ? statusError.message : statusError);
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  waitForReview().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
