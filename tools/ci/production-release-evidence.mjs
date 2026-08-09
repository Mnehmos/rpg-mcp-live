#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function productionReleaseTag(version, sha) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`Invalid production SHA: ${sha}`);
  }
  return `v${version}-${sha}`;
}

function resolveTagCommit(tagRef, tagObject, expectedTag) {
  if (tagRef.object?.type === "commit") return tagRef.object.sha;
  if (tagRef.object?.type !== "tag") {
    throw new Error("Release tag ref is neither an annotated tag nor a commit");
  }
  if (!tagObject) throw new Error("Annotated tag object is missing");
  if (tagObject.tag !== expectedTag) throw new Error("Annotated tag name does not match");
  if (tagObject.object?.type !== "commit") {
    throw new Error("Annotated tag does not target a commit");
  }
  return tagObject.object.sha;
}

export function assessProductionReleaseEvidence({
  expectedSha,
  expectedTag,
  tagRef,
  tagObject,
  release,
  manifest,
}) {
  const evidence = [tagRef, tagObject, release, manifest];
  if (evidence.every((value) => value === undefined)) return "create";
  if (!tagRef) {
    throw new Error("Existing production release evidence is incomplete");
  }

  const targetSha = resolveTagCommit(tagRef, tagObject, expectedTag);
  if (targetSha !== expectedSha) throw new Error("Release tag targets a different SHA");
  if (!release) {
    if (manifest) throw new Error("Existing production release evidence is incomplete");
    return "create-release";
  }
  if (release.tag_name !== expectedTag) throw new Error("GitHub release tag does not match");

  if (release.draft === true) {
    if (release.prerelease !== false) {
      throw new Error("Prerelease draft cannot become production release evidence");
    }
    if (release.published_at !== null && release.published_at !== undefined) {
      throw new Error("Draft release has contradictory publication evidence");
    }
    return "publish-draft";
  }
  if (release.draft !== false || release.prerelease !== false) {
    throw new Error("Production release is not a published stable release");
  }
  if (
    typeof release.published_at !== "string" ||
    Number.isNaN(Date.parse(release.published_at))
  ) {
    throw new Error("Production release has no valid publication timestamp");
  }
  if (!manifest) throw new Error("Existing production release evidence is incomplete");

  const manifestShas = [manifest.sha, manifest.gitSha].filter(
    (value) => value !== undefined
  );
  if (manifestShas.length === 0 || manifestShas.some((sha) => sha !== expectedSha)) {
    throw new Error("Deployment manifest does not match the production SHA");
  }
  if (
    manifest.controller !== "railway-native-github-autodeploy" ||
    manifest.environment !== "RPG MCP Live / production"
  ) {
    throw new Error("Deployment manifest is not production Railway evidence");
  }
  return "reuse";
}

function parseArgs(tokens) {
  const args = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2)] = tokens[index + 1];
    index += 1;
  }
  return args;
}

function readOptionalJson(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const [command, ...tokens] = process.argv.slice(2);
  const args = parseArgs(tokens);
  const tag = productionReleaseTag(args.version ?? "", args.sha ?? "");
  if (command === "tag") {
    process.stdout.write(tag);
    return;
  }
  if (command !== "assess" || !args["evidence-dir"]) {
    throw new Error("Usage: production-release-evidence.mjs <tag|assess> --version <version> --sha <sha> [--evidence-dir <dir>]");
  }

  const dir = args["evidence-dir"];
  const result = assessProductionReleaseEvidence({
    expectedSha: args.sha,
    expectedTag: tag,
    tagRef: readOptionalJson(resolve(dir, "tag-ref.json")),
    tagObject: readOptionalJson(resolve(dir, "tag-object.json")),
    release: readOptionalJson(resolve(dir, "release.json")),
    manifest: readOptionalJson(resolve(dir, "deployment-manifest.json")),
  });
  process.stdout.write(result);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
