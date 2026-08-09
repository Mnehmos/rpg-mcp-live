import { appendFileSync } from "node:fs";

export const RAILWAY_API_ENDPOINT = "https://backboard.railway.com/graphql/v2";
export const EXPECTED_REPOSITORY = "Mnehmos/rpg-mcp-live";

const ACTIVE_STATUSES = new Set([
  "QUEUED",
  "INITIALIZING",
  "WAITING",
  "BUILDING",
  "DEPLOYING",
]);
const FAILED_STATUSES = new Set([
  "FAILED",
  "CRASHED",
  "CANCELED",
  "CANCELLED",
  "SKIPPED",
  "REMOVED",
  "REMOVING",
  "SLEEPING",
]);

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface RailwayScope {
  projectId: string;
  environmentId: string;
  environmentName: string;
  serviceId: string;
  expectedRepository?: string;
  expectedBranch?: string;
  expectedRailwayConfigFile?: string;
  /** Require Railway's connected GitHub source to be the active deploy trigger. */
  requireNativeAutodeploy?: boolean;
}

export interface RailwayClientOptions {
  token: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleepImpl?: (milliseconds: number) => Promise<void>;
}

export interface RailwayScopeEvidence {
  projectId: string;
  environmentId: string;
  environmentName: string;
  serviceId: string;
  serviceName: string;
  sourceRepository: string | null;
  sourceBranch: string | null;
  railwayConfigFile: string;
  nativeAutodeployEnabled: boolean;
}

export interface RailwayDeploymentEvidence {
  deploymentId: string;
  status: "SUCCESS";
  projectId: string;
  environmentId: string;
  serviceId: string;
  requestedCommitSha: string;
  railwayCommitSha: string | null;
}

export class RailwayApiError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "RailwayApiError";
    this.code = code;
  }
}

interface GraphQlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface ScopeResponse {
  project: {
    id: string;
    environments: { edges: Array<{ node: { id: string; name: string } }> };
  } | null;
  serviceInstance: {
    id: string;
    serviceId: string;
    serviceName: string;
    environmentId: string;
    railwayConfigFile: string | null;
    source: { repo: string | null; image: string | null } | null;
    service: {
      repoTriggers: {
        edges: Array<{ node: { repository: string; branch: string; environmentId: string; serviceId: string | null } }>;
      };
    };
    activeDeployments: Array<{ id: string; status: string; meta: unknown }>;
  } | null;
  serviceInstanceAutoDeployStatus: { enabled: boolean } | null;
  deploymentTriggers: {
    edges: Array<{ node: { repository: string; branch: string; environmentId: string; serviceId: string | null } }>;
  };
}

interface ProjectTokenScopeResponse {
  projectToken: { projectId: string; environmentId: string } | null;
}

interface DeploymentResponse {
  deployment: DeploymentRecord | null;
}

interface DeploymentRecord {
    id: string;
    status: string;
    projectId: string;
    environmentId: string;
    serviceId: string;
    meta: unknown;
}

interface DeploymentListResponse {
  deployments: {
    edges: Array<{ node: DeploymentRecord }>;
  };
}

interface DeployResponse {
  serviceInstanceDeployV2: string | null;
}

function redact(message: string, token: string): string {
  return message
    .replaceAll(token, "[REDACTED]")
    .replace(/(token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]");
}

function isFullSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

function findCommitSha(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["commitSha", "commitSHA", "commitHash", "gitCommitSha", "gitSha", "RAILWAY_GIT_COMMIT_SHA"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && isFullSha(candidate)) return candidate;
  }
  for (const key of ["build", "buildMetadata", "source", "deployment", "metadata"]) {
    const nested = findCommitSha(record[key]);
    if (nested) return nested;
  }
  return null;
}

interface CurrentSourceRecord {
  repository: string;
  branch: string;
}

function findDeploymentSource(value: unknown): CurrentSourceRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const repository = typeof record.repo === "string"
    ? record.repo
    : typeof record.repository === "string"
      ? record.repository
      : null;
  const branch = typeof record.branch === "string" ? record.branch : null;
  if (repository && branch) return { repository, branch };
  for (const nested of Object.values(record)) {
    const found = findDeploymentSource(nested);
    if (found) return found;
  }
  return null;
}

function currentSource(
  source: { repo: string | null; image: string | null } | null,
  triggers: Array<{ repository: string; branch: string; environmentId: string; serviceId: string | null }>,
  activeDeployments: Array<{ status: string; meta: unknown }>,
  environmentId: string,
  serviceId: string,
): CurrentSourceRecord | null {
  const scopedTriggers = triggers.filter((trigger) =>
    trigger.environmentId === environmentId && (trigger.serviceId === null || trigger.serviceId === serviceId));
  const uniqueTriggers = Array.from(new Map(
    scopedTriggers.map((trigger) => [`${trigger.repository}\u0000${trigger.branch}`, { repository: trigger.repository, branch: trigger.branch }]),
  ).values());
  if (!source?.repo) return null;
  const activeSources = Array.from(new Map(
    activeDeployments
      .filter((deployment) => deployment.status === "SUCCESS")
      .map((deployment) => findDeploymentSource(deployment.meta))
      .filter((candidate): candidate is CurrentSourceRecord => candidate !== null)
      .map((candidate) => [`${candidate.repository}\u0000${candidate.branch}`, candidate]),
  ).values());
  if (activeSources.length > 1 || uniqueTriggers.length > 1) return null;
  const active = activeSources[0] ?? null;
  const trigger = uniqueTriggers[0] ?? null;
  if (source?.repo && active && source.repo !== active.repository) return null;
  if (trigger && active && (trigger.repository !== active.repository || trigger.branch !== active.branch)) return null;
  const current = trigger ?? active;
  if (!current) return null;
  if (source.repo !== current.repository) return null;
  return current;
}

export class RailwayApiClient {
  private readonly token: string;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;

  public constructor(options: RailwayClientOptions) {
    if (!options.token.trim()) throw new RailwayApiError("TOKEN_MISSING", "A project access token is required.");
    this.token = options.token;
    this.endpoint = options.endpoint ?? RAILWAY_API_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000;
    this.timeoutMs = options.timeoutMs ?? 15 * 60_000;
    this.sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Project-Access-Token": this.token,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new RailwayApiError("NETWORK_ERROR", redact(error instanceof Error ? error.message : "Railway API request failed.", this.token));
    }

    let payload: GraphQlEnvelope<T>;
    try {
      payload = await response.json() as GraphQlEnvelope<T>;
    } catch (error) {
      throw new RailwayApiError("INVALID_RESPONSE", redact(error instanceof Error ? error.message : "Railway API returned invalid JSON.", this.token));
    }
    if (!response.ok) throw new RailwayApiError("HTTP_ERROR", `Railway API returned HTTP ${response.status}.`);
    if (payload.errors?.length) {
      const message = payload.errors.map((entry) => entry.message ?? "GraphQL error").join("; ");
      throw new RailwayApiError("GRAPHQL_ERROR", redact(message, this.token));
    }
    if (!payload.data) throw new RailwayApiError("EMPTY_RESPONSE", "Railway API returned no data.");
    return payload.data;
  }

  public async validateScope(scope: RailwayScope): Promise<RailwayScopeEvidence> {
    const expectedRepository = scope.expectedRepository ?? EXPECTED_REPOSITORY;
    const expectedBranch = scope.expectedBranch ?? "main";
    const expectedRailwayConfigFile = scope.expectedRailwayConfigFile;
    if (!expectedRailwayConfigFile?.trim()) {
      throw new RailwayApiError("CONFIG_PATH_MISSING", "The service-specific Railway config path is required.");
    }

    const tokenScope = await this.request<ProjectTokenScopeResponse>(
      `query railwayProjectTokenScope {
        projectToken { projectId environmentId }
      }`,
      {},
    );
    if (!tokenScope.projectToken || tokenScope.projectToken.projectId !== scope.projectId) {
      throw new RailwayApiError("TOKEN_PROJECT_SCOPE_MISMATCH", "The Railway project token is not scoped to the requested project.");
    }
    if (tokenScope.projectToken.environmentId !== scope.environmentId) {
      throw new RailwayApiError("TOKEN_ENVIRONMENT_SCOPE_MISMATCH", "The Railway project token is not scoped to the requested environment.");
    }

    const data = await this.request<ScopeResponse>(
      `query railwayDeploymentScope($projectId: String!, $environmentId: String!, $serviceId: String!) {
        project(id: $projectId) {
          id
          environments { edges { node { id name } } }
        }
        serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
          id serviceId serviceName environmentId
          railwayConfigFile
          source { repo image }
          service {
            repoTriggers { edges { node { repository branch environmentId serviceId } } }
          }
          activeDeployments { id status meta }
        }
        serviceInstanceAutoDeployStatus(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) { enabled }
        deploymentTriggers(first: 100, projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
          edges { node { repository branch environmentId serviceId } }
        }
      }`,
      { projectId: scope.projectId, environmentId: scope.environmentId, serviceId: scope.serviceId },
    );
    if (!data.project || data.project.id !== scope.projectId) {
      throw new RailwayApiError("PROJECT_SCOPE_MISMATCH", "The token cannot access the requested Railway project.");
    }
    const environment = data.project.environments.edges.map((edge) => edge.node).find((candidate) => candidate.id === scope.environmentId);
    if (!environment || environment.name !== scope.environmentName) {
      throw new RailwayApiError("ENVIRONMENT_SCOPE_MISMATCH", "The requested environment ID/name pair is not valid for this project.");
    }
    const instance = data.serviceInstance;
    if (!instance || instance.serviceId !== scope.serviceId || instance.environmentId !== scope.environmentId) {
      throw new RailwayApiError("SERVICE_SCOPE_MISMATCH", "The requested service is not in the requested environment.");
    }
    if (instance.railwayConfigFile !== expectedRailwayConfigFile) {
      throw new RailwayApiError("CONFIG_PATH_MISMATCH", `The service Railway config path must be ${expectedRailwayConfigFile}.`);
    }
    const nativeAutodeployEnabled = data.serviceInstanceAutoDeployStatus?.enabled;
    const requireNativeAutodeploy = scope.requireNativeAutodeploy ?? false;
    if (nativeAutodeployEnabled === undefined) {
      throw new RailwayApiError("NATIVE_AUTODEPLOY_STATUS_MISSING", "Railway did not return the service native autodeploy state.");
    }
    if (nativeAutodeployEnabled !== requireNativeAutodeploy) {
      if (requireNativeAutodeploy) {
        throw new RailwayApiError("NATIVE_AUTODEPLOY_DISABLED", "Railway native autodeploy must be enabled for the connected GitHub source.");
      }
      throw new RailwayApiError("NATIVE_AUTODEPLOY_ENABLED", "Railway native autodeploy must be disabled before GitHub deploys.");
    }
    const source = currentSource(
      instance.source,
      [
        ...instance.service.repoTriggers.edges.map((edge) => edge.node),
        ...data.deploymentTriggers.edges.map((edge) => edge.node),
      ],
      instance.activeDeployments,
      scope.environmentId,
      scope.serviceId,
    );
    if (!source || source.repository !== expectedRepository || source.branch !== expectedBranch) {
      throw new RailwayApiError("SOURCE_NOT_CONNECTED", `The service is not connected to ${expectedRepository} on ${expectedBranch}.`);
    }
    return {
      projectId: data.project.id,
      environmentId: environment.id,
      environmentName: environment.name,
      serviceId: instance.serviceId,
      serviceName: instance.serviceName,
      sourceRepository: source.repository,
      sourceBranch: source.branch,
      railwayConfigFile: instance.railwayConfigFile,
      nativeAutodeployEnabled,
    };
  }

  public async deployExactCommit(scope: RailwayScope, commitSha: string, allowProduction = false): Promise<RailwayDeploymentEvidence> {
    if (!isFullSha(commitSha)) throw new RailwayApiError("INVALID_COMMIT_SHA", "An exact 40-character commit SHA is required.");
    if (scope.environmentName === "production" && !allowProduction) {
      throw new RailwayApiError("PRODUCTION_GUARD", "Production promotion is disabled.");
    }
    const validated = await this.validateScope(scope);
    const deployed = await this.request<DeployResponse>(
      `mutation railwayDeployExactCommit($serviceId: String!, $environmentId: String!, $commitSha: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
      }`,
      { serviceId: validated.serviceId, environmentId: validated.environmentId, commitSha },
    );
    if (!deployed.serviceInstanceDeployV2) throw new RailwayApiError("DEPLOYMENT_ID_MISSING", "Railway did not return a deployment ID.");
    return this.pollDeployment(scope, deployed.serviceInstanceDeployV2, commitSha);
  }

  /**
   * Wait for Railway's native GitHub integration to build the requested SHA.
   * This is deliberately read-only: the GitHub push is the deployment trigger,
   * and this method only observes the scoped deployment history.
   */
  public async waitForNativeCommit(scope: RailwayScope, commitSha: string, allowProduction = false): Promise<RailwayDeploymentEvidence> {
    if (!isFullSha(commitSha)) throw new RailwayApiError("INVALID_COMMIT_SHA", "An exact 40-character commit SHA is required.");
    if (scope.environmentName === "production" && !allowProduction) {
      throw new RailwayApiError("PRODUCTION_GUARD", "Production promotion is disabled.");
    }
    await this.validateScope({ ...scope, requireNativeAutodeploy: true });
    return this.pollNativeDeployment(scope, commitSha);
  }

  private async pollNativeDeployment(scope: RailwayScope, requestedCommitSha: string): Promise<RailwayDeploymentEvidence> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      const data = await this.request<DeploymentListResponse>(
        `query railwayNativeDeploymentHistory($input: DeploymentListInput!, $first: Int!) {
          deployments(input: $input, first: $first) {
            edges { node { id status projectId environmentId serviceId meta } }
          }
        }`,
        {
          input: {
            projectId: scope.projectId,
            environmentId: scope.environmentId,
            serviceId: scope.serviceId,
            includeDeleted: true,
          },
          first: 20,
        },
      );
      const candidates = data.deployments.edges
        .map((edge) => edge.node)
        .filter((deployment) => {
          const railwayCommitSha = findCommitSha(deployment.meta);
          return railwayCommitSha?.toLowerCase() === requestedCommitSha.toLowerCase();
        });
      const candidate = candidates.find((deployment) => deployment.status === "SUCCESS") ?? candidates[0];
      if (candidate) {
        if (candidate.projectId !== scope.projectId || candidate.environmentId !== scope.environmentId || candidate.serviceId !== scope.serviceId) {
          throw new RailwayApiError("DEPLOYMENT_SCOPE_MISMATCH", "Railway returned a native deployment outside the requested scope.");
        }
        if (candidate.status === "SUCCESS") {
          const railwayCommitSha = findCommitSha(candidate.meta);
          return {
            deploymentId: candidate.id,
            status: "SUCCESS",
            projectId: candidate.projectId,
            environmentId: candidate.environmentId,
            serviceId: candidate.serviceId,
            requestedCommitSha,
            railwayCommitSha,
          };
        }
        if (FAILED_STATUSES.has(candidate.status)) {
          throw new RailwayApiError("DEPLOYMENT_FAILED", `Railway native deployment ended in ${candidate.status}.`);
        }
        if (!ACTIVE_STATUSES.has(candidate.status)) {
          throw new RailwayApiError("DEPLOYMENT_STATUS_UNKNOWN", `Railway returned unsupported native deployment status ${candidate.status}.`);
        }
      }
      await this.sleepImpl(this.pollIntervalMs);
    }
    throw new RailwayApiError("DEPLOYMENT_TIMEOUT", "Railway native deployment did not reach SUCCESS before the timeout.");
  }

  private async pollDeployment(scope: RailwayScope, deploymentId: string, requestedCommitSha: string): Promise<RailwayDeploymentEvidence> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      const data = await this.request<DeploymentResponse>(
        `query railwayDeploymentStatus($deploymentId: String!) {
          deployment(id: $deploymentId) { id status projectId environmentId serviceId meta }
        }`,
        { deploymentId },
      );
      const deployment = data.deployment;
      if (!deployment) throw new RailwayApiError("DEPLOYMENT_NOT_FOUND", "Railway returned no deployment for the requested ID.");
      if (deployment.projectId !== scope.projectId || deployment.environmentId !== scope.environmentId || deployment.serviceId !== scope.serviceId) {
        throw new RailwayApiError("DEPLOYMENT_SCOPE_MISMATCH", "Railway returned a deployment outside the requested scope.");
      }
      if (deployment.status === "SUCCESS") {
        const railwayCommitSha = findCommitSha(deployment.meta);
        if (railwayCommitSha && railwayCommitSha.toLowerCase() !== requestedCommitSha.toLowerCase()) {
          throw new RailwayApiError("DEPLOYMENT_SHA_MISMATCH", "Railway deployment metadata does not match the requested commit SHA.");
        }
        return {
          deploymentId: deployment.id,
          status: "SUCCESS",
          projectId: deployment.projectId,
          environmentId: deployment.environmentId,
          serviceId: deployment.serviceId,
          requestedCommitSha,
          railwayCommitSha,
        };
      }
      if (FAILED_STATUSES.has(deployment.status)) throw new RailwayApiError("DEPLOYMENT_FAILED", `Railway deployment ended in ${deployment.status}.`);
      if (!ACTIVE_STATUSES.has(deployment.status)) throw new RailwayApiError("DEPLOYMENT_STATUS_UNKNOWN", `Railway returned unsupported status ${deployment.status}.`);
      await this.sleepImpl(this.pollIntervalMs);
    }
    throw new RailwayApiError("DEPLOYMENT_TIMEOUT", "Railway deployment did not reach SUCCESS before the timeout.");
  }
}

export function writeGithubOutputs(result: RailwayDeploymentEvidence, outputPath = process.env.GITHUB_OUTPUT): void {
  if (!outputPath) return;
  appendFileSync(outputPath, [
    `deployment_id=${result.deploymentId}`,
    `deployment_status=${result.status}`,
    `environment_id=${result.environmentId}`,
    `service_id=${result.serviceId}`,
    `requested_commit_sha=${result.requestedCommitSha}`,
    `railway_commit_sha=${result.railwayCommitSha ?? "unknown"}`,
  ].join("\n") + "\n", "utf8");
}
