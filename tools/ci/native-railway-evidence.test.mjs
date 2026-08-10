import { describe, expect, it } from "vitest";
import {
  RAILWAY_BOT,
  RAILWAY_SERVICE_CONTEXTS,
  evaluateNativeRailwayEvidence,
  latestRailwayServiceStatuses,
  validateNativeDeployment,
} from "./native-railway-evidence.mjs";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const ENVIRONMENT = "RPG MCP Live / staging";
const DEPLOYMENT_ID = "railway-deployment-1";
const ENVIRONMENT_ID = "staging-environment";
const PRODUCTION_ENVIRONMENT_ID = "production-environment";

function deployment(overrides = {}) {
  return {
    id: DEPLOYMENT_ID,
    sha: SHA,
    ref: SHA,
    environment: ENVIRONMENT,
    creator: { login: RAILWAY_BOT },
    ...overrides,
  };
}

function serviceStatus(context, state = "success", overrides = {}) {
  return {
    id: context,
    context,
    state,
    creator: { login: RAILWAY_BOT },
    target_url: `https://railway.com/project/project/service/service?environmentId=${ENVIRONMENT_ID}`,
    updated_at: "2026-08-10T10:00:00Z",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    deployment: deployment(),
    deploymentStatuses: [
      {
        id: "deployment-status-1",
        state: "in_progress",
        creator: { login: RAILWAY_BOT },
        environment: ENVIRONMENT,
        environment_url: `https://railway.com/project/project?environmentId=${ENVIRONMENT_ID}`,
        updated_at: "2026-08-10T10:00:00Z",
      },
    ],
    commitStatuses: RAILWAY_SERVICE_CONTEXTS.map((context) =>
      serviceStatus(context)
    ),
    expectedSha: SHA,
    expectedEnvironment: ENVIRONMENT,
    expectedDeploymentId: DEPLOYMENT_ID,
    ...overrides,
  };
}

describe("native Railway evidence", () => {
  it("requires the exact Railway deployment identity", () => {
    expect(
      validateNativeDeployment({
        deployment: deployment(),
        expectedSha: SHA,
        expectedEnvironment: ENVIRONMENT,
        expectedDeploymentId: DEPLOYMENT_ID,
      }).id
    ).toBe(DEPLOYMENT_ID);
    expect(() =>
      validateNativeDeployment({
        deployment: deployment({ sha: OTHER_SHA }),
        expectedSha: SHA,
        expectedEnvironment: ENVIRONMENT,
        expectedDeploymentId: DEPLOYMENT_ID,
      })
    ).toThrow("expected SHA");
    expect(() =>
      validateNativeDeployment({
        deployment: deployment({ environment: "RPG MCP Live / production" }),
        expectedSha: SHA,
        expectedEnvironment: ENVIRONMENT,
        expectedDeploymentId: DEPLOYMENT_ID,
      })
    ).toThrow("environment");
    expect(() =>
      validateNativeDeployment({
        deployment: deployment({ creator: { login: "someone-else" } }),
        expectedSha: SHA,
        expectedEnvironment: ENVIRONMENT,
        expectedDeploymentId: DEPLOYMENT_ID,
      })
    ).toThrow("Railway-authored");
  });

  it("uses the newest Railway status for each expected service", () => {
    const statuses = [
      serviceStatus(RAILWAY_SERVICE_CONTEXTS[0], "pending"),
      serviceStatus(RAILWAY_SERVICE_CONTEXTS[0], "success", {
        id: "newer",
        updated_at: "2026-08-10T10:01:00Z",
      }),
      serviceStatus("unrelated-check", "success"),
    ];
    const latest = latestRailwayServiceStatuses(statuses);
    expect(latest[RAILWAY_SERVICE_CONTEXTS[0]].state).toBe("success");
    expect(latest[RAILWAY_SERVICE_CONTEXTS[1]]).toBeUndefined();
  });

  it("accepts healthy service statuses while aggregate deployment stays in progress", () => {
    const result = evaluateNativeRailwayEvidence(evidence());
    expect(result.ready).toBe(true);
    expect(result.deploymentState).toBe("in_progress");
    expect(result.missingContexts).toEqual([]);
    expect(Object.values(result.serviceStatusBindings)).toEqual([true, true]);
  });

  it("waits until both service statuses succeed", () => {
    const result = evaluateNativeRailwayEvidence(
      evidence({
        commitStatuses: [serviceStatus(RAILWAY_SERVICE_CONTEXTS[0])],
      })
    );
    expect(result.ready).toBe(false);
    expect(result.missingContexts).toEqual([RAILWAY_SERVICE_CONTEXTS[1]]);
  });

  it("accepts an aggregate success only with both service statuses", () => {
    const result = evaluateNativeRailwayEvidence(
      evidence({
        deploymentStatuses: [
          {
            id: "deployment-status-2",
            state: "success",
            creator: { login: RAILWAY_BOT },
            environment: ENVIRONMENT,
            environment_url: `https://railway.com/project/project?environmentId=${ENVIRONMENT_ID}`,
            updated_at: "2026-08-10T10:02:00Z",
          },
        ],
      })
    );
    expect(result.ready).toBe(true);
  });

  it("fails closed on terminal deployment failure or unrelated statuses", () => {
    expect(() =>
      evaluateNativeRailwayEvidence(
        evidence({
          deploymentStatuses: [
            {
              id: "deployment-status-3",
              state: "failure",
              creator: { login: RAILWAY_BOT },
              environment: ENVIRONMENT,
              environment_url: `https://railway.com/project/project?environmentId=${ENVIRONMENT_ID}`,
              updated_at: "2026-08-10T10:03:00Z",
            },
          ],
        })
      )
    ).toThrow("terminal state failure");
    const result = evaluateNativeRailwayEvidence(
      evidence({
        commitStatuses: [serviceStatus("unrelated-check")],
      })
    );
    expect(result.ready).toBe(false);
    expect(result.missingContexts).toEqual(RAILWAY_SERVICE_CONTEXTS);
  });

  it("does not treat a different Railway environment's green statuses as ready", () => {
    const result = evaluateNativeRailwayEvidence(
      evidence({
        deployment: deployment({
          environment: "RPG MCP Live / production",
        }),
        deploymentStatuses: [
          {
            id: "deployment-status-production",
            state: "in_progress",
            creator: { login: RAILWAY_BOT },
            environment: "RPG MCP Live / production",
            environment_url: `https://railway.com/project/project?environmentId=${PRODUCTION_ENVIRONMENT_ID}`,
            updated_at: "2026-08-10T10:04:00Z",
          },
        ],
        expectedEnvironment: "RPG MCP Live / production",
      })
    );
    expect(result.ready).toBe(false);
    expect(result.missingContexts).toEqual(RAILWAY_SERVICE_CONTEXTS);
    expect(Object.values(result.serviceStatusBindings)).toEqual([false, false]);
  });

  it("accepts nested API pages from slurped GitHub responses", () => {
    expect(
      latestRailwayServiceStatuses([
        [serviceStatus(RAILWAY_SERVICE_CONTEXTS[0])],
        [serviceStatus(RAILWAY_SERVICE_CONTEXTS[1])],
      ])[RAILWAY_SERVICE_CONTEXTS[1]].state
    ).toBe("success");
  });
});
