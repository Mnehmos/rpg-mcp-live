import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => max - 1));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});

import {
  compareGauntletBaseline,
  GAUNTLET_EXPECTED_BASELINE_DIGEST,
  GAUNTLET_FIXTURE_VERSION,
  GAUNTLET_RUBRIC_VERSION,
  GAUNTLET_SCENARIO_IDS,
  runDeterministicGauntlet,
  stableGauntletDigest,
} from "./gauntlet.js";

describe("deterministic open-ended play gauntlet", () => {
  it("captures all ten versioned traces with hard invariant gates and separate scorecards", async () => {
    deterministicRandomInt.mockClear();
    const report = await runDeterministicGauntlet();

    expect(report.fixtureVersion).toBe(GAUNTLET_FIXTURE_VERSION);
    expect(report.rubricVersion).toBe(GAUNTLET_RUBRIC_VERSION);
    expect(report.traces.map((trace) => trace.scenarioId)).toEqual(GAUNTLET_SCENARIO_IDS);
    expect(report.traces).toHaveLength(10);
    expect(report.hardPass).toBe(true);
    expect(report.baseline.compatible).toBe(true);
    expect(report.baseline.digest).toBe(GAUNTLET_EXPECTED_BASELINE_DIGEST);
    expect(compareGauntletBaseline(report)).toBe(true);
    expect(report.traces.every((trace) => trace.hardPass && trace.hardAssertions.every((item) => item.passed))).toBe(true);
    expect(report.traces.every((trace) => trace.ownerIssue === "#22" && trace.fixtureVersion === GAUNTLET_FIXTURE_VERSION && trace.rubricVersion === GAUNTLET_RUBRIC_VERSION)).toBe(true);
    expect(report.scorecards).toHaveLength(10);
    expect(report.scorecards.every((scorecard) => scorecard.reviewer === "independent-human" && scorecard.status === "pending" && scorecard.modelSelfScoreUsed === false)).toBe(true);
  }, 30_000);

  it("keeps public traces projected and free of private model/tool fragments", async () => {
    const report = await runDeterministicGauntlet();
    const publicJson = JSON.stringify(report.traces.map((trace) => trace.publicProjection));
    expect(publicJson).not.toContain("watchtower-truth-warden");
    expect(publicJson).not.toContain("The warden diverted the patrol");
    expect(publicJson).not.toContain("tool_calls");
    expect(publicJson).not.toContain("promptContext");
    expect(report.traces.every((trace) => trace.privateRunIds.length === 1 && trace.publicEventIds.every((id) => !trace.privateRunIds.includes(id)))).toBe(true);
  }, 30_000);

  it("produces a stable baseline digest while excluding ids, timestamps, and latency noise", async () => {
    const first = await runDeterministicGauntlet();
    const second = await runDeterministicGauntlet();
    expect(first.baseline.digest).toBe(stableGauntletDigest(first.traces));
    expect(second.baseline.digest).toBe(stableGauntletDigest(second.traces));
    expect(first.baseline.digest).toBe(second.baseline.digest);
    expect(first.generatedAt).toMatch(/T/);
    expect(second.generatedAt).toMatch(/T/);
  }, 30_000);

  it("rejects an incompatible fixture baseline instead of silently comparing it", async () => {
    const report = await runDeterministicGauntlet();
    expect(compareGauntletBaseline({
      ...report,
      fixtureVersion: "open-ended-gauntlet-v0",
    })).toBe(false);
    expect(compareGauntletBaseline({
      ...report,
      traces: report.traces.slice(0, -1),
    })).toBe(false);
  }, 30_000);
});
