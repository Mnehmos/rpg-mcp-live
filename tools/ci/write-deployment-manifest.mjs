#!/usr/bin/env node
/**
 * Deployment-manifest writer.
 *
 * Writes a JSON manifest recording what was deployed, to which Railway
 * environment, from which Git SHA, with which content pack.  Used by
 * Deployment evidence consumers. Native Railway deployment is not initiated
 * by GitHub Actions; this helper is retained for historical evidence formats.
 *
 *   node tools/ci/write-deployment-manifest.mjs \
 *       --env staging \
 *       --git-sha abc123 \
 *       --git-ref main \
 *       --engine-deployment-id railway-engine-deployment \
 *       --web-deployment-id railway-web-deployment \
 *       --engine-railway-commit-sha abc123 \
 *       --web-railway-commit-sha abc123 \
 *       --pack-version open5e-v2-full-corpus-s8 \
 *       --pack-hash 56bdfbda... \
 *       --tool-count 42 \
 *       --engine-health pass \
 *       --web-health pass \
 *       --smoke pass \
 *       --output deployment-manifest.json
 */
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, cur, i, arr) => {
      if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
      return acc;
    }, [])
);

const manifest = {
  environment: args["env"] ?? "unknown",
  gitSha: args["git-sha"] ?? process.env.GITHUB_SHA ?? "unknown",
  gitRef: args["git-ref"] ?? process.env.GITHUB_REF_NAME ?? "unknown",
  nodeVersion: process.version,
  packId: args["pack-version"] ?? "unknown",
  packHash: args["pack-hash"] ?? "unknown",
  schemaVersion: args["schema-version"] ?? "unknown",
  toolCount: Number(args["tool-count"] ?? 0),
  engineDeploymentId: args["engine-deployment-id"] ?? null,
  webDeploymentId: args["web-deployment-id"] ?? null,
  engineRailwayCommitSha: args["engine-railway-commit-sha"] ?? null,
  webRailwayCommitSha: args["web-railway-commit-sha"] ?? null,
  engineHealth: args["engine-health"] ?? "unknown",
  webHealth: args["web-health"] ?? "unknown",
  smoke: args["smoke"] ?? "unknown",
  gauntletVersion: args["gauntlet-version"] ?? null,
  deployedAt: new Date().toISOString(),
  deployedBy: "ci",
};

const out = args.output ?? "deployment-manifest.json";
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`✓ Deployment manifest written to ${out}`);
console.log(JSON.stringify(manifest, null, 2));
