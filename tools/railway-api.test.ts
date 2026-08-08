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
};

function graphqlResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
}

function scopeData(overrides: { serviceInstance?: Record<string, unknown>; service?: Record<string, unknown> } = {}) {
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
      latestDeployment: { meta: { repo: "Mnehmos/rpg-mcp-live", branch: "main" }, status: "SUCCESS" },
      ...overrides.serviceInstance,
    },
  };
}

function client(responses: Response[]) {
  const fetchImpl = vi.fn(async () => responses.shift() ?? graphqlResponse({}));
  const instance = new RailwayApiClient({ token: TOKEN, fetchImpl, pollIntervalMs: 0, timeoutMs: 100, sleepImpl: async () => undefined });
  return { instance, fetchImpl };
}

describe("Railway exact-SHA deployment API", () => {
  it("uses Project-Access-Token and accepts the correctly scoped connected repo", async () => {
    const { instance, fetchImpl } = client([graphqlResponse(scopeData())]);
    const evidence = await instance.validateScope(stagingScope);
    expect(evidence).toMatchObject({ projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, sourceRepository: "Mnehmos/rpg-mcp-live", sourceBranch: "main" });
    const call = fetchImpl.mock.calls[0] as unknown as [string | URL, RequestInit] | undefined;
    const headers = call?.[1].headers as Record<string, string>;
    expect(headers["Project-Access-Token"]).toBe(TOKEN);
    expect(JSON.stringify(call?.[1])).not.toContain("Authorization");
  });

  it("rejects a project/environment scope mismatch before mutation", async () => {
    const wrongProject = scopeData();
    wrongProject.project.id = "other-project";
    const { instance } = client([graphqlResponse(wrongProject)]);
    await expect(instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "PROJECT_SCOPE_MISMATCH" });

    const wrongEnvironment = scopeData();
    wrongEnvironment.project.environments.edges = [{ node: { id: STAGING_ID, name: "production" } }];
    const { instance: wrongEnvironmentClient } = client([graphqlResponse(wrongEnvironment)]);
    await expect(wrongEnvironmentClient.validateScope(stagingScope)).rejects.toMatchObject({ code: "ENVIRONMENT_SCOPE_MISMATCH" });
  });

  it("rejects an unconnected or wrong repository source", async () => {
    const { instance } = client([graphqlResponse(scopeData({ serviceInstance: { latestDeployment: { meta: { repo: "other/repo", branch: "main" }, status: "SUCCESS" } } }))]);
    await expect(instance.validateScope(stagingScope)).rejects.toMatchObject({ code: "SOURCE_NOT_CONNECTED" });
  });

  it("rejects an unknown or malformed SHA before making an API request", async () => {
    const { instance, fetchImpl } = client([]);
    await expect(instance.deployExactCommit(stagingScope, "unknown-sha")).rejects.toMatchObject({ code: "INVALID_COMMIT_SHA" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when Railway rejects a well-formed but unknown SHA", async () => {
    const unknownSha = "f".repeat(40);
    const { instance } = client([
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
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: deploymentId }),
      graphqlResponse({ deployment: { id: deploymentId, status: "SUCCESS", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: { commitSha: SHA } } }),
    ]);
    await expect(instance.deployExactCommit(stagingScope, SHA)).resolves.toMatchObject({ deploymentId, requestedCommitSha: SHA, railwayCommitSha: SHA });
  });

  it.each(["FAILED", "CANCELED"])("fails closed on a %s deployment", async (status) => {
    const { instance } = client([
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: "deployment-67" }),
      graphqlResponse({ deployment: { id: "deployment-67", status, projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: null } }),
    ]);
    await expect(instance.deployExactCommit(stagingScope, SHA)).rejects.toMatchObject({ code: "DEPLOYMENT_FAILED" });
  });

  it("fails closed on an unknown deployment status and timeout", async () => {
    const unknown = client([
      graphqlResponse(scopeData()),
      graphqlResponse({ serviceInstanceDeployV2: "deployment-67" }),
      graphqlResponse({ deployment: { id: "deployment-67", status: "MYSTERY", projectId: PROJECT_ID, environmentId: STAGING_ID, serviceId: ENGINE_ID, meta: null } }),
    ]);
    await expect(unknown.instance.deployExactCommit(stagingScope, SHA)).rejects.toMatchObject({ code: "DEPLOYMENT_STATUS_UNKNOWN" });

    const timeoutResponses = [
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

  it("keeps production behind the disabled promotion guard", () => {
    expect(production).toContain("RAILWAY_PRODUCTION_PROMOTION_ENABLED");
    expect(production).toContain("== 'true'");
    expect(production.indexOf("Deploy engine to Railway production")).toBeLessThan(production.indexOf("Deploy web to Railway production"));
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
});
