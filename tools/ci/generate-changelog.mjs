#!/usr/bin/env node
/**
 * Automated changelog generator.
 *
 * Parses conventional-commit squash-merge messages between the last `v*` tag
 * and HEAD, groups them by type, and produces a markdown changelog entry.
 *
 * Usage:
 *
 *   # Print the changelog entry for a version (stdout only)
 *   node tools/ci/generate-changelog.mjs --version v0.2.0
 *
 *   # Prepend the entry to CHANGELOG.md and print it
 *   node tools/ci/generate-changelog.mjs --version v0.2.0 --update-file
 *
 *   # Fail if no changelog entries exist (used as a release gate)
 *   node tools/ci/generate-changelog.mjs --version v0.2.0 --fail-empty
 *
 * Every squash-merged PR must use a conventional-commit title
 * (enforced by verify-pr-metadata.mjs), so this always has material to work with.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = {};
{
  const tokens = process.argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = tokens[i + 1];
    // Boolean flag: --update-file or --fail-empty with no value, or followed by another --flag
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
}

const version = args["version"];
const updateFile = args["update-file"] !== undefined;
const failEmpty = args["fail-empty"] !== undefined;
const changelogPath = args["file"] ?? "CHANGELOG.md";

if (!version) {
  console.error("Usage: node tools/ci/generate-changelog.mjs --version v0.2.0 [--update-file] [--fail-empty]");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Type → changelog section mapping
// ---------------------------------------------------------------------------

const SECTIONS = [
  { types: ["feat"], heading: "Added" },
  { types: ["fix"], heading: "Fixed" },
  { types: ["perf"], heading: "Performance" },
  { types: ["refactor"], heading: "Changed" },
  { types: ["audit"], heading: "Audits" },
  { types: ["docs"], heading: "Documentation" },
  { types: ["test"], heading: "Tests" },
  { types: ["ci", "ops"], heading: "Infrastructure" },
  { types: ["build"], heading: "Build" },
];
// Skipped types: chore, style, revert (internal noise)

// ---------------------------------------------------------------------------
// Get commit range
// ---------------------------------------------------------------------------

function getLastTag() {
  try {
    return execSync("git describe --tags --abbrev=0 --match 'v*' 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const lastTag = getLastTag();
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const commits = execSync(`git log --format="%s" ${range}`, {
  encoding: "utf8",
})
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Parse conventional commits
// ---------------------------------------------------------------------------

const commitRe =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test|audit|ops|adr|hotfix)(\([\w-]+\))?(!)?:\s+(.+?)(?:\s+\(#(\d+\)))?$/i;

const groups = {};
let unparsed = 0;

for (const line of commits) {
  const m = line.match(commitRe);
  if (!m) {
    unparsed++;
    continue;
  }
  const type = m[1].toLowerCase();
  const breaking = Boolean(m[3]);
  const desc = m[4].trim();
  const pr = m[5] ? ` (#${m[5]})` : "";
  const entry = `${breaking ? "**BREAKING** " : ""}${desc}${pr}`;

  if (!groups[type]) groups[type] = [];
  groups[type].push(entry);
}

// ---------------------------------------------------------------------------
// Build markdown
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);

let md = `## [${version}] - ${today}\n\n`;

let hasEntries = false;

for (const section of SECTIONS) {
  const entries = section.types.flatMap((t) => groups[t] || []);
  if (entries.length === 0) continue;
  hasEntries = true;
  md += `### ${section.heading}\n\n`;
  for (const e of entries) md += `- ${e}\n`;
  md += "\n";
}

// Breaking changes get their own callout
const breaking = Object.entries(groups).flatMap(([type, entries]) =>
  entries.filter((e) => e.startsWith("**BREAKING**")).map((e) => `[${type}] ${e}`)
);
if (breaking.length > 0) {
  hasEntries = true;
  md += `### ⚠ Breaking changes\n\n`;
  for (const e of breaking) md += `- ${e}\n`;
  md += "\n";
}

if (!hasEntries) {
  md += `_No notable changes since ${lastTag ?? "the initial commit"}._\n\n`;
  if (failEmpty) {
    console.error(`\n✗ Changelog for ${version} is empty — no conventional commits found since ${lastTag ?? "HEAD"}.\n`);
    console.error(`  ${commits.length} commit(s) in range, ${unparsed} did not match conventional-commit format.`);
    console.error(`  Every PR title must follow: type(scope): description (#NN)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log(`✓ Generated changelog for ${version} (${commits.length} commits, ${unparsed} unparsed).`);
console.log("---");
console.log(md.trimEnd());

if (updateFile) {
  let existing = "";
  if (existsSync(changelogPath)) {
    existing = readFileSync(changelogPath, "utf8");
    // Insert after the title header
    const lines = existing.split("\n");
    const titleIdx = lines.findIndex((l) => l.startsWith("# Changelog") || l.startsWith("# CHANGELOG"));
    if (titleIdx !== -1) {
      const before = lines.slice(0, titleIdx + 2).join("\n");
      const after = lines.slice(titleIdx + 2).join("\n");
      writeFileSync(changelogPath, `${before}\n${md}\n${after.trimStart()}\n`, "utf8");
    } else {
      writeFileSync(changelogPath, `# Changelog\n\n${md}${existing}`, "utf8");
    }
  } else {
    writeFileSync(changelogPath, `# Changelog\n\n${md}`, "utf8");
  }
  console.log(`✓ Updated ${changelogPath}`);
}
