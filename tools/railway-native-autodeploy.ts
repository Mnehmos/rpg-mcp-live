import { RailwayApiClient, RailwayApiError, writeGithubOutputs } from "./railway-api.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new RailwayApiError("CONFIG_MISSING", `${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const environmentName = required("RAILWAY_ENVIRONMENT_NAME");
  const projectId = required("RAILWAY_PROJECT_ID");
  const environmentId = required("RAILWAY_ENVIRONMENT_ID");
  const serviceId = required("RAILWAY_SERVICE_ID");
  const commitSha = required("RAILWAY_COMMIT_SHA");
  const token = required("RAILWAY_PROJECT_TOKEN");
  const expectedRailwayConfigFile = required("RAILWAY_CONFIG_FILE");
  const allowProduction = process.env.RAILWAY_PRODUCTION_PROMOTION_ENABLED === "true";
  const client = new RailwayApiClient({ token });
  const result = await client.waitForNativeCommit(
    {
      projectId,
      environmentId,
      environmentName,
      serviceId,
      expectedRepository: process.env.RAILWAY_EXPECTED_REPOSITORY ?? undefined,
      expectedBranch: process.env.RAILWAY_EXPECTED_BRANCH ?? "main",
      expectedRailwayConfigFile,
      requireNativeAutodeploy: true,
    },
    commitSha,
    allowProduction,
  );
  writeGithubOutputs(result);
  console.log(JSON.stringify({
    deploymentId: result.deploymentId,
    status: result.status,
    environmentId: result.environmentId,
    serviceId: result.serviceId,
    requestedCommitSha: result.requestedCommitSha,
    railwayCommitSha: result.railwayCommitSha,
    controller: "railway-native-github-source",
  }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Railway native deployment wait failed.";
  console.error(message);
  process.exitCode = 1;
});
