import { describe, expect, it } from "vitest";
import {
  RAILWAY_BOT,
  RAILWAY_SERVICE_CONTEXTS,
  evaluateNativeRailwayEvidence,
  isRailwayServiceStatusEvent,
  latestRailwayServiceStatuses,
  selectNativeDeployment,
  statusEventMatchesEnvironment,
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
    payload: { environmentId: ENVIRONMENT_ID },
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
  it("accepts only Railway success events for expected service contexts", () => {
    expect(
      isRailwayServiceStatusEvent({
        state: "success",
        sender: { login: RAILWAY_BOT },
        context: RAILWAY_SERVICE_CONTEXTS[0],
        sha: SHA,
        target_url: `https://railway.com/service/service?environmentId=${ENVIRONMENT_ID}`,
      })
    ).toBe(true);
    expect(
      isRailwayServiceStatusEvent({
        state: "success",
        sender: { login: "someone-else" },
        context: RAILWAY_SERVICE_CONTEXTS[0],
        sha: SHA,
      })
    ).toBe(false);
    expect(
      statusEventMatchesEnvironment(
        {
          state: "success",
          sender: { login: RAILWAY_BOT },
          context: RAILWAY_SERVICE_CONTEXTS[0],
          sha: SHA,
          target_url: `https://railway.com/service/service?environmentId=${ENVIRONMENT_ID}`,
        },
        ENVIRONMENT_ID,
      )
    ).toBe(true);
    expect(
      statusEventMatchesEnvironment(
        {
          state: "success",
          sender: { login: RAILWAY_BOT },
          context: RAILWAY_SERVICE_CONTEXTS[0],
          sha: SHA,
          target_url: `https://railway.com/service/service?environmentId=${PRODUCTION_ENVIRONMENT_ID}`,
        },
        ENVIRONMENT_ID,
      )
    ).toBe(false);
    expect(
      isRailwayServiceStatusEvent({
        state: "success",
        sender: { login: RAILWAY_BOT },
        context: "unrelated-check",
        sha: SHA,
      })
    ).toBe(false);
  });

  it("selects only the newest exact-SHA deployment for the requested environment", () => {
    const selected = selectNativeDeployment(
      [
        deployment({ id: "staging-old", created_at: "2026-08-10T09:00:00Z" }),
        deployment({ id: "staging-new", created_at: "2026-08-10T10:00:00Z" }),
        deployment({
          id: "production",
          environment: "RPG MCP Live / production",
          created_at: "2026-08-10T11:00:00Z",
        }),
        deployment({ id: "other-sha", sha: OTHER_SHA, ref: OTHER_SHA }),
      ],
      SHA,
      ENVIRONMENT,
      ENVIRONMENT_ID,
    );
    expect(selected.id).toBe("staging-new");
    expect(
      selectNativeDeployment(
        [deployment({ environment: "RPG MCP Live / production" })],
        SHA,
        ENVIRONMENT,
        ENVIRONMENT_ID,
      )
    ).toBeUndefined();
  });

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

  it("uses the newest Railway status for the expected service", () => {
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
  });

  it("accepts healthy service statuses while aggregate deployment stays in progress", () => {
    const result = evaluateNativeRailwayEvidence(evidence());
    expect(result.ready).toBe(true);
    expect(result.deploymentState).toBe("in_progress");
    expect(result.missingContexts).toEqual([]);
    expect(Object.values(result.serviceStatusBindings)).toEqual([true]);
  });

  it("is idempotent when the same successful status event is delivered twice", () => {
    const first = evaluateNativeRailwayEvidence(evidence());
    const duplicate = evaluateNativeRailwayEvidence(evidence());
    expect(duplicate).toEqual(first);
  });

  it("waits until the expected service status succeeds", () => {
    const result = evaluateNativeRailwayEvidence(
      evidence({
        commitStatuses: [serviceStatus(RAILWAY_SERVICE_CONTEXTS[0], "pending")],
      })
    );
    expect(result.ready).toBe(false);
    expect(result.missingContexts).toEqual([RAILWAY_SERVICE_CONTEXTS[0]]);
  });

  it("accepts aggregate success with a healthy service status", () => {
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
    expect(Object.values(result.serviceStatusBindings)).toEqual([false]);
  });

  it("accepts nested API pages from slurped GitHub responses", () => {
    expect(
      latestRailwayServiceStatuses([
        [serviceStatus(RAILWAY_SERVICE_CONTEXTS[0])],
      ])[RAILWAY_SERVICE_CONTEXTS[0]].state
    ).toBe("success");
  });
});
