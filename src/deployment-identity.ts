export type DeploymentService = "web" | "engine";

export interface DeploymentIdentity {
  service: DeploymentService;
  environment: string | null;
  commitSha: string | null;
  deploymentId: string | null;
}

export function deploymentIdentity(
  service: DeploymentService,
  environment: NodeJS.ProcessEnv = process.env
): DeploymentIdentity {
  const railwayValue = (name: string): string | null => environment[name]?.trim() || null;
  return {
    service,
    environment: railwayValue("RAILWAY_ENVIRONMENT_NAME"),
    commitSha: railwayValue("RAILWAY_GIT_COMMIT_SHA"),
    deploymentId: railwayValue("RAILWAY_DEPLOYMENT_ID"),
  };
}
