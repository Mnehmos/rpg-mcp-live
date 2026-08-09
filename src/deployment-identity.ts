export type DeploymentService = "web" | "engine";

export interface DeploymentIdentity {
  service: DeploymentService;
  environment: string;
  commitSha: string | null;
  deploymentId: string | null;
}

function railwayValue(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function deploymentIdentity(
  service: DeploymentService,
  fallbackEnvironment: string
): DeploymentIdentity {
  return {
    service,
    environment: railwayValue("RAILWAY_ENVIRONMENT_NAME") ?? fallbackEnvironment,
    commitSha: railwayValue("RAILWAY_GIT_COMMIT_SHA"),
    deploymentId: railwayValue("RAILWAY_DEPLOYMENT_ID"),
  };
}
