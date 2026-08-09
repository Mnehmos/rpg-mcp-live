import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { RailwayApiClient, type FetchLike, type RailwayScope } from "./railway-api.js";

const PROJECT_ID = "project-67";
const STAGING_ID = "staging-67";
const PRODUCTION_ID = "production-67";
const ENGINE_ID = "engine-67";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "project-token-that-must-never-be-logged";

const stagingScope: RailwayScope = {
  projectId: PROJECT_ID,
  environmentId: STAGING_ID,
  environmentName: "staging",
  serviceId: ENGINE_ID,
  expectedRepository: "Mnehmos/rpg-mcp-live",
  expectedBranch: "main",
  expectedRailwayConfigFile: "/railway/engine.json",
};

function graphqlResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function tokenData(overrides: Partial<{ projectId: string; environmentId: string }> = {}) {
  return {
    projectToken: {
      projectId: PROJECT_ID,
      environmentId: STAGING_ID,
      ...overrides,
    },
  };
}

function scopeData(overrides: { serviceInstance?: Record<string, unknown>; serviceInstanceAutoDeployStatus?: Record<string, unknown>; deploymentTriggers?: Record<string, unknown> } = {}) {
  const trigger = { repository: "Mnehmos/rpg-mcp-live", branch: "main", environmentId: STAGING_ID, serviceId: ENGINE_ID };
  return {
    project: {
      id: PROJECT_ID,
      environments: { edges: [{ node: { id: STAGING_ID, name: "staging" } }, { node: { id: PRODUCTION_ID, name: "production" } }] },
    },
    serviceInstance: {
      id: "instance-67",
      serviceId: ENGINE_ID,
      serviceName: "lantern-engine",
      environmentId: STAGING_ID,
      railwayConfigFile: "/railway/engine.json",
      source: { repo: "Mnehmos/rpg-mcp-live", image: null },
      service: { repoTriggers: { edges: [{ node: trigger }] } },
      activeDeployments: [{ id: "active-67", status: "SUCCESS", meta: { repo: "Mnehmos/rpg-mcp-live", branch: "main" } }],
      ...overrides.serviceInstance,
    },
    serviceInstanceAutoDeployStatus: { enabled: false, ...overrides.serviceInstanceAutoDeployStatus },
    deploymentTriggers: { edges: [{ node: trigger }], ...overrides.deploymentTriggers },
  };
}

function client(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift() ?? graphqlResponse({}));
  const instance = new RailwayApiClient({ token: TOKEN, fetchImpl, pollIntervalMs: 0, timeoutMs: 100, sleepImpl: async () => undefined });
  return { instance, fetchImpl };
}

describe("Railway exact-SHA deployment API", () => {
  it("uses Project-Access-Token and accepts the correctly scoped connected repo", async () => {
    const { instance, fetchImpl } = client([graphqlResponse(tokenData()), graphqlResponse(scopeData())]);
    const evidence = await instance.validateScope(stagingScope);
    expect(evidence).toMatchObject({ projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, sourceRepository: "Mnehmos/rpg-mcp-live", sourceBranch: "main", railwayConfigFile: "/railway/engine.json", nativeAutodeployEnabled: false });
    const call = fetchImpl.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined;
    const headers = call?.[1].headers as Record<string, string>;
    expect(headers["Project-Access-Token"]).toBe(TOKEN);
    expect(JSON.stringify(call?.[1])).not.toContain("Authorization");
  });

  it("rejects a project/environment scope mismatch before mutation", async () => {
    const wrongProject = scopeData();
    wrongProject.project.id = "other-project";
    const { instance } = client([graphqlResponse(tokenData()), graphqlResponse(wrongProject)]);
    await expect(instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "PROJECT_SCOPE_MISMATCH" });

    const wrongEnvironment = scopeData();
    wrongEnvironment.project.environments.edges = [{ node: { id: STAGING_ID, name: "production" } }];
    const { instance: wrongEnvironmentClient } = client([graphqlResponse(tokenData()), graphqlResponse(wrongEnvironment)]);
    await expect(wrongEnvironmentClient.validateScope(stagingScope)).rejects.toMatchObject({ code: "ENVIRONMENT_SCOPE_MISMATCH" });
  });

  it("rejects a project token scoped to a different environment before service lookup", async () => {
    const { instance, fetchImpl } = client([graphqlResponse(tokenData({ environmentId: PRODUCTION_ID }))]);
    await expect(instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "TOKEN_ENVIRONMENT_SCOPE_MISMATCH" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an unconnected or wrong repository source", async () => {
    const { instance } = client([graphqlResponse(tokenData()), graphqlResponse(scopeData({ serviceInstance: { source: { repo: "other/repo", image: null } } }))]);
    await expect(instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "SOURCE_NOT_CONNECTED" });
  });

  it("accepts the current successful deployment source when Railway has no trigger records", async () => {
    const scope = scopeData({
      serviceInstance: {
        source: null,
        service: { repoTriggers: { edges: [] } },
        activeDeployments: [{ id: "active-67", status: "SUCCESS", meta: { deployment: { repository: "Mnehmos/rpg-mcp-live", branch: "main" } } }],
      },
      deploymentTriggers: { edges: [] },
    });
    const { instance } = client([graphqlResponse(tokenData()), graphqlResponse(scope)]);
    await expect(instance.validateScope(stagingScope)).resolves.toMatchObject({ sourceRepository: "Mnehmos/rpg-mcp-live", sourceBranch: "main" });
  });

  it("rejects current config drift and native Railway autodeploy", async () => {
    const wrongConfig = client([graphqlResponse(tokenData()), graphqlResponse(scopeData({ serviceInstance: { railwayConfigFile: "/railway/web.json" } }))]);
    await expect(wrongConfig.instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "CONFIG_PATH_MISMATCH" });

    const autodeploy = client([graphqlResponse(tokenData()), graphqlResponse(scopeData({ serviceInstanceAutoDeployStatus: { enabled: true } }))]);
    await expect(autodeploy.instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "NATIVE_AUTODEPLOY_ENABLED" });
  });

  it("rejects an unknown or malformed SHA before making an API request", async () => {
    const { instance, fetchImpl } = client([]);
    await expect(instance.deployExactCommit(stagingScope, "unknown-sha")).rejects.toMatchObject({ code: "INVALID_COMMIT_SHA" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when Railway rejects a well-formed but unknown SHA", async () => {
    const unknownSha = "f".repeat(40);
    const { instance } = client([
      graphqlResponse(tokenData()),
      graphqlResponse(scopeData()),
      new Response(JSON.stringify({ errors: [{ message: "Commit not found" }] }), { status: 200 }),
    ]);
    await expect(instance.deployExactCommit(stagingScope, unknownSha)).rejects.toMatchObject({ code: "GRAPHQL_ERROR" });
  });

  it("fails closed on GraphQL errors without exposing the project token", async () => {
    const { instance } = client([new Response(JSON.stringify({ errors: [{ message: `token=${TOKEN}` }] }), { status: 200 })]);
    await expect(instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "GRAPHQL_ERROR", message: expect.stringContaining("[REDACTED]") });
  });

  it("deploys the exact SHA, polls, and returns the Railway deployment ID", async () => {
    const deploymentId = "deployment-67";
    const { instance } = client([
      graphqlResponse(tokenData()),
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: deploymentId }),
      graphqlResponse({ deployment: { id: deploymentId, status: "SUCCESS", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: { commitSha: SHA } } }),
    ]);
    await expect(instance.deployExactCommit(stagingScope, SHA)).resolves.toMatchObject({ deploymentId, requestedCommitSha: SHA, railwayCommitSha: SHA });
  });

  it("recognizes Railway's current commitHash deployment metadata", async () => {
    const deploymentId = "deployment-67-hash";
    const { instance } = client([
      graphqlResponse(tokenData()),
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: deploymentId }),
      graphqlResponse({ deployment: { id: deploymentId, status: "SUCCESS", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: { commitHash: SHA } } }),
    ]);
    await expect(instance.deployExactCommit(stagingScope, SHA)).resolves.toMatchObject({ deploymentId, requestedCommitSha: SHA, railwayCommitSha: SHA });
  });

  it.each(["FAILED", "CANCELED"])("fails closed on a %s deployment", async (status) => {
    const { instance } = client([
      graphqlResponse(tokenData()),
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: "deployment-67" }),
      graphqlResponse({ deployment: { id: "deployment-67", status, projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: null } }),
    ]);
    await expect(instance.deployExactCommit(stagingScope, SHA)).rejects.toMatchObject({ code: "DEPLOYMENT_FAILED" });
  });

  it("fails closed on an unknown deployment status and timeout", async () => {
    const unknown = client([
      graphqlResponse(tokenData()),
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: "deployment-67" }),
      graphqlResponse({ deployment: { id: "deployment-67", status: "MYSTERY", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: null } }),
    ]);
    await expect(unknown.instance.deployExactCommit(stagingScope, SHA)).rejects.toMatchObject({ code: "DEPLOYMENT_STATUS_UNKNOWN" });

    const timeoutResponses = [
      graphqlResponse(tokenData()),
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: "deployment-67" }),
      graphqlResponse({ deployment: { id: "deployment-67", status: "BUILDING", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: null } }),
    ];
    const timeoutFetch: FetchLike = async () => timeoutResponses.shift() ?? graphqlResponse({
      deployment: { id: "deployment-67", status: "BUILDING", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: null },
    });
    const timeoutClient = new RailwayApiClient({ token: TOKEN, fetchImpl: timeoutFetch, pollIntervalMs: 0, timeoutMs: 0, sleepImpl: async () => undefined });
    await expect(timeoutClient.deployExactCommit(stagingScope, SHA)).rejects.toMatchObject({ code: "DEPLOYMENT_TIMEOUT" });
  });

  it("blocks production unless the explicit promotion guard is enabled", async () => {
    const productionScope = { ...stagingScope, environmentId: PRODUCTION_ID, environmentName: "production" };
    const { instance, fetchImpl } = client([]);
    await expect(instance.deployExactCommit(productionScope, SHA, false)).rejects.toMatchObject({ code: "PRODUCTION_GUARD" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("workflow ownership guardrails", () => {
  const staging = readFileSync(new URL("../.github/workflows/deploy-staging.yml", import.meta.url), "utf8");
  const production = readFileSync(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./railway-api.ts", import.meta.url), "utf8");

  it("deploys engine before web and never uses a local archive upload", () => {
    expect(staging.indexOf("Deploy engine to Railway staging")).toBeLessThan(staging.indexOf("Deploy web to Railway staging"));
    expect(staging).toContain("railway-deploy.ts");
    expect(staging).not.toContain("railway up");
  });

  it("keeps production behind a runtime environment guard", () => {
    expect(production).toContain("RAILWAY_PRODUCTION_PROMOTION_ENABLED");
    expect(production).toContain("Evaluate production promotion guard");
    expect(production).toContain("steps.promotion.outputs.enabled == 'true'");
    expect(production).not.toMatch(/if:\s*>[\s\S]*RAILWAY_PRODUCTION_PROMOTION_ENABLED/);
    expect(production.indexOf("Deploy engine to Railway production")).toBeLessThan(production.indexOf("Deploy web to Railway production"));
  });

  it("preflights release material before mutating production and uses the GitHub API for tags", () => {
    expect(production).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
    expect(production).not.toContain("actions/setup-node@49933a5288caeca8642d1e84afbd3f7d6820020");
    expect(staging).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(staging).not.toContain("actions/upload-artifact@65462800fd7603444615e87bf5d454d6f9ee93b4");
    expect(production).toContain("fetch-depth: 0");
    expect(production).toContain("git fetch --force --tags origin");
    expect(production).toContain("already exists; refusing to mutate production");
    expect(production.indexOf("Preflight release tag, changelog, and write capability")).toBeLessThan(production.indexOf("Deploy engine to Railway production"));
    expect(production.indexOf("Write production deployment manifest before publishing the tag")).toBeLessThan(production.indexOf("Create annotated GitHub tag after deployment evidence is complete"));
    expect(production).toContain("git/tags");
    expect(production).toContain("git/refs");
    expect(production).not.toContain("git push");
  });

  it("binds health checks to each service and environment", () => {
    for (const workflow of [staging, production]) {
      expect(workflow).toContain("EXPECTED_SERVICE: lantern-engine");
      expect(workflow).toContain("EXPECTED_ENGINE_SERVICE: lantern-engine");
      expect(workflow).toContain(".service == $service");
      expect(workflow).toContain(".environment == $environment");
      expect(workflow).toContain("EXPECTED_COMMIT_SHA");
      expect(workflow).toContain("RAILWAY_CONFIG_FILE");
      expect(workflow).toContain("RAILWAY_EXPECTED_BRANCH: main");
    }
  });

  it("does not push protected main or mutate CHANGELOG during deployment", () => {
    expect(production).not.toContain("git push origin main");
    expect(production).not.toContain("git checkout main");
    expect(production).not.toContain("--update-file");
    expect(production).not.toContain("git add CHANGELOG.md");
  });

  it("contains no token or variable-value logging path", () => {
    expect(helper).not.toMatch(/console\.(log|error).*token/i);
    expect(helper).not.toMatch(/console\.(log|error).*variables/i);
    expect(staging).not.toMatch(/echo.*RAILWAY_PROJECT_TOKEN/i);
    expect(production).not.toMatch(/echo.*RAILWAY_PROJECT_TOKEN/i);
  });

  it("validates current source state without consulting stale latest-deployment metadata", () => {
    expect(helper).toContain("activeDeployments");
    expect(helper).not.toContain("latestDeployment");
  });
});
