#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAILWAY_BOT = "railway-app[bot]";
export const RAILWAY_SERVICE_CONTEXTS = Object.freeze([
  "RPG MCP Live - lantern-engine",
  "RPG MCP Live - rpg-mcp-live",
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const TERMINAL_FAILURE_STATES = new Set(["error", "failure", "inactive"]);
const READY_DEPLOYMENT_STATES = new Set(["success", "in_progress", "queued"]);

function flattenPages(value) {
  if (!Array.isArray(value)) return value === undefined ? [] : [value];
  return value.flatMap((entry) => flattenPages(entry));
}

function timestamp(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function newest(items) {
  return [...items].sort((left, right) => {
    const rightTime = timestamp(right.updated_at ?? right.created_at);
    const leftTime = timestamp(left.updated_at ?? left.created_at);
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(right.id ?? "").localeCompare(String(left.id ?? ""));
  })[0];
}

function assertSha(sha) {
  if (!SHA_PATTERN.test(sha ?? "")) throw new Error("Expected a full 40-character SHA");
}

export function isRailwayServiceStatusEvent(event) {
  return Boolean(
    event?.state === "success" &&
      event?.sender?.login === RAILWAY_BOT &&
      RAILWAY_SERVICE_CONTEXTS.includes(event.context) &&
      SHA_PATTERN.test(event.sha ?? "")
  );
}

export function statusEventMatchesEnvironment(event, expectedEnvironmentId) {
  return Boolean(
    isRailwayServiceStatusEvent(event) &&
      expectedEnvironmentId &&
      environmentId(event.target_url) === expectedEnvironmentId
  );
}

export function selectNativeDeployment(
  deployments,
  expectedSha,
  expectedEnvironment,
  expectedEnvironmentId,
) {
  assertSha(expectedSha);
  return newest(
    flattenPages(deployments).filter(
      (deployment) =>
        deployment?.sha === expectedSha &&
        deployment?.ref === expectedSha &&
        deployment?.environment === expectedEnvironment &&
        deployment?.creator?.login === RAILWAY_BOT &&
        (!expectedEnvironmentId ||
          deployment?.payload?.environmentId === expectedEnvironmentId)
    )
  );
}

function environmentId(url) {
  try {
    return new URL(url).searchParams.get("environmentId");
  } catch {
    return null;
  }
}

function statusBelongsToDeployment(status, environmentUrl) {
  const expectedEnvironmentId = environmentId(environmentUrl);
  const actualEnvironmentId = environmentId(status?.target_url);
  return Boolean(
    expectedEnvironmentId &&
      actualEnvironmentId &&
      expectedEnvironmentId === actualEnvironmentId
  );
}

export function validateNativeDeployment({
  deployment,
  expectedSha,
  expectedEnvironment,
  expectedDeploymentId,
}) {
  assertSha(expectedSha);
  if (!deployment || String(deployment.id) !== String(expectedDeploymentId)) {
    throw new Error("Native Railway deployment identity is missing or changed");
  }
  if (deployment.sha !== expectedSha || deployment.ref !== expectedSha) {
    throw new Error("Native Railway deployment does not target the expected SHA");
  }
  if (deployment.environment !== expectedEnvironment) {
    throw new Error("Native Railway deployment environment does not match");
  }
  if (deployment.creator?.login !== RAILWAY_BOT) {
    throw new Error("Native Railway deployment is not Railway-authored");
  }
  return {
    id: String(deployment.id),
    sha: deployment.sha,
    ref: deployment.ref,
    environment: deployment.environment,
    environmentUrl: deployment.environment_url,
    creator: deployment.creator.login,
  };
}

export function latestRailwayServiceStatuses(statuses) {
  const relevant = flattenPages(statuses).filter(
    (status) =>
      status?.creator?.login === RAILWAY_BOT &&
      RAILWAY_SERVICE_CONTEXTS.includes(status.context)
  );
  return Object.fromEntries(
    RAILWAY_SERVICE_CONTEXTS.map((context) => [
      context,
      newest(relevant.filter((status) => status.context === context)),
    ])
  );
}

export function evaluateNativeRailwayEvidence({
  deployment,
  deploymentStatuses,
  commitStatuses,
  expectedSha,
  expectedEnvironment,
  expectedDeploymentId,
}) {
  const identity = validateNativeDeployment({
    deployment,
    expectedSha,
    expectedEnvironment,
    expectedDeploymentId,
  });
  const latestDeploymentStatus = newest(
    flattenPages(deploymentStatuses).filter(
      (status) => status?.creator?.login === RAILWAY_BOT
    )
  );
  if (!latestDeploymentStatus) {
    throw new Error("Native Railway deployment has no Railway status");
  }
  if (latestDeploymentStatus.environment !== expectedEnvironment) {
    throw new Error("Native Railway deployment status environment does not match");
  }
  const deploymentEnvironmentUrl =
    deployment.environment_url ?? latestDeploymentStatus.environment_url;
  const serviceStatuses = latestRailwayServiceStatuses(commitStatuses);
  const missingContexts = RAILWAY_SERVICE_CONTEXTS.filter(
    (context) =>
      serviceStatuses[context]?.state !== "success" ||
      !statusBelongsToDeployment(
        serviceStatuses[context],
        deploymentEnvironmentUrl
      )
  );

  if (TERMINAL_FAILURE_STATES.has(latestDeploymentStatus.state)) {
    throw new Error(
      `Native Railway deployment reached terminal state ${latestDeploymentStatus.state}`
    );
  }
  if (!READY_DEPLOYMENT_STATES.has(latestDeploymentStatus.state)) {
    throw new Error(
      `Unexpected native Railway deployment state ${latestDeploymentStatus.state}`
    );
  }

  return {
    ...identity,
    deploymentState: latestDeploymentStatus.state,
    serviceStatuses: Object.fromEntries(
      RAILWAY_SERVICE_CONTEXTS.map((context) => [
        context,
        serviceStatuses[context]?.state ?? null,
      ])
    ),
    serviceStatusBindings: Object.fromEntries(
      RAILWAY_SERVICE_CONTEXTS.map((context) => [
        context,
        statusBelongsToDeployment(serviceStatuses[context], deploymentEnvironmentUrl),
      ])
    ),
    ready: missingContexts.length === 0,
    missingContexts,
  };
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

function readJson(path) {
  if (!path || !existsSync(path)) throw new Error(`JSON input is missing: ${path ?? ""}`);
  return JSON.parse(readFileSync(resolve(path), "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const [command, ...tokens] = process.argv.slice(2);
  if (command !== "check" && command !== "resolve") {
    throw new Error(
      "Usage: native-railway-evidence.mjs <check|resolve> --deployment <path> --deployment-statuses <path> --commit-statuses <path> --deployments <path> --sha <sha> --environment <environment> --deployment-id <id> [--target-url <url>]"
    );
  }
  const args = parseArgs(tokens);
  if (command === "resolve") {
    const targetEnvironmentId = args["target-url"]
      ? environmentId(args["target-url"])
      : undefined;
    if (args["target-url"] && !targetEnvironmentId) {
      process.exitCode = 2;
      return;
    }
    const deployment = selectNativeDeployment(
      readJson(args.deployments),
      args.sha,
      args.environment,
      targetEnvironmentId,
    );
    if (!deployment) {
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`${JSON.stringify(deployment)}\n`);
    return;
  }
  const result = evaluateNativeRailwayEvidence({
    deployment: readJson(args.deployment),
    deploymentStatuses: readJson(args["deployment-statuses"]),
    commitStatuses: readJson(args["commit-statuses"]),
    expectedSha: args.sha,
    expectedEnvironment: args.environment,
    expectedDeploymentId: args["deployment-id"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ready) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
