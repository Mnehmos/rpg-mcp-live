#!/usr/bin/env node
/**
 * PR-metadata validator.
 *
 * Enforces the Lantern PR contract (section 14 of the operating model):
 *   1. Title follows Conventional Commits:  type(scope): description (#NN)
 *   2. Body contains required sections.
 *
 * Reads the GitHub event payload from GITHUB_EVENT_PATH.
 * No-ops (exit 0) when not running inside a pull-request event so the
 * step can remain in the CI job for push-triggered runs.
 *
 *   node tools/ci/verify-pr-metadata.mjs
 */
import { readFileSync, existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Load event
// ---------------------------------------------------------------------------

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath || !existsSync(eventPath)) {
  console.log("✓ Not in a GitHub Actions PR event — skipping PR metadata check.");
  process.exit(0);
}

const event = JSON.parse(readFileSync(eventPath, "utf8"));
const pr = event.pull_request;
if (!pr) {
  console.log("✓ Not a pull_request event — skipping.");
  process.exit(0);
}

const title = (pr.title || "").trim();
const body = (pr.body || "").trim();
const isDependabot = pr.user?.login === "dependabot[bot]";

let failures = [];

// ---------------------------------------------------------------------------
// 1. Title — Conventional Commits
// ---------------------------------------------------------------------------

// Allowed:  fix(engine): ...  feat(effects): ...  docs(audit): ...  chore: ...
// Optional scope, optional (#NN) suffix.
const titleRe =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test|audit|ops|adr|hotfix)(\([\w-]+\))?!?:\s+.+\s*(\(#\d+\))?$/i;

if (!titleRe.test(title)) {
  failures.push(
    `Title must follow Conventional Commits, e.g. "fix(engine): description (#25)".\n` +
      `   Got: "${title}"`
  );
}

// ---------------------------------------------------------------------------
// 2. Required body sections
// ---------------------------------------------------------------------------

const requiredSections = ["## Risk", "## Acceptance criteria", "## Verification"];

if (!isDependabot) {
  const missingSections = requiredSections.filter((heading) => !body.toLowerCase().includes(heading.toLowerCase()));

  if (missingSections.length > 0) {
    failures.push(`PR body is missing required sections:\n   ${missingSections.join("\n   ")}`);
  }
} else {
  console.log("✓ Dependabot PR detected — human-authored body sections are not required.");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error("\n✗ PR metadata validation failed:\n");
  for (const f of failures) console.error(`   ${f}\n`);
  process.exit(1);
}

console.log(`✓ PR metadata OK — title and required sections present.`);
process.exit(0);
