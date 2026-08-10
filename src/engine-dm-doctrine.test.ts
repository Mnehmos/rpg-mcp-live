import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CORE_DM_DOCTRINE,
  CORE_DM_DOCTRINE_REVISION,
  CORE_DM_DOCTRINE_SOURCE,
} from "./engine-dm-doctrine.js";

describe("The Sand Remembers doctrine", () => {
  it("tracks the complete amended product constitution", () => {
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const manifesto = readFileSync(resolve(repositoryRoot, CORE_DM_DOCTRINE_SOURCE), "utf8");

    expect(manifesto.length).toBeGreaterThan(45_000);
    expect(manifesto).toContain("Status: normative Lantern product constitution");
    expect(manifesto).toContain("# LAW ZERO — THE GAME MOVES");
    expect(manifesto).toContain("State trust");
    expect(manifesto).toContain("Procedural trust");
    expect(manifesto).toContain("Momentum trust");
    expect(manifesto).toContain("Every resolved action must leave the player in a meaningfully different situation");
    expect(manifesto).toContain("No orphaned mechanics; no orphaned fiction");
    expect(manifesto).toContain("player intent\n→ meaningful stakes\n→ authoritative resolution\n→ atomic commit\n→ DM narration\n→ changed situation");
    expect(manifesto).toContain("The player steers. The rules resolve uncertainty.");
    expect(manifesto).not.toContain("tokens truncated");

    for (const law of [
      "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX",
      "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII",
    ]) {
      expect(manifesto).toContain(`## LAW ${law} —`);
    }
  });

  it("keeps the runtime projection compact and bound to the constitution", () => {
    expect(CORE_DM_DOCTRINE_SOURCE).toBe("docs/THE-SAND-REMEMBERS.md");
    expect(CORE_DM_DOCTRINE_REVISION).toBe(2);
    expect(CORE_DM_DOCTRINE).toContain("LAW ZERO — THE GAME MOVES");
    expect(CORE_DM_DOCTRINE).toContain("STATE TRUST");
    expect(CORE_DM_DOCTRINE).toContain("PROCEDURAL TRUST");
    expect(CORE_DM_DOCTRINE).toContain("MOMENTUM TRUST");
    expect(CORE_DM_DOCTRINE).toContain("NO ORPHANED MECHANICS; NO ORPHANED FICTION");
    expect(CORE_DM_DOCTRINE).toContain("Never claim a fact, state, or successful write you have not verified");
    expect(CORE_DM_DOCTRINE).toContain("meaningfully changed situation");
    expect(Buffer.byteLength(CORE_DM_DOCTRINE, "utf8")).toBeLessThan(6_000);
    expect(CORE_DM_DOCTRINE).not.toContain("Zuberi");
  });
});
