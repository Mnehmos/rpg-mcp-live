import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAction, createInitialSession, gameActionSchema, resolveIntent } from "./game.js";

describe("the first player loop", () => {
  it("creates a session with a meaningful opening scene", () => {
    const session = createInitialSession("player-1");

    expect(session.userId).toBe("player-1");
    expect(session.version).toBe(0);
    expect(session.sceneTitle).toBe("The Opening");
    expect(session.log).toHaveLength(1);
    expect(session.availableActions).toContain("observe");
  });

  it("moves the player to the first waypoint when they follow the first lead", () => {
    const session = createInitialSession("player-1");
    const next = applyAction(session, "enter");

    expect(next.sceneId).toBe("waypoint");
    expect(next.sceneTitle).toBe("The First Waypoint");
    expect(next.version).toBe(1);
    expect(next.log).toHaveLength(2);
  });

  it("accepts only server-supported actions", () => {
    expect(gameActionSchema.safeParse("listen").success).toBe(true);
    expect(gameActionSchema.safeParse("cast-fireball").success).toBe(false);
  });

  it("resolves a free-form ability check with server-owned math", () => {
    const session = createInitialSession("player-1");
    const intent = {
      kind: "ability_check" as const,
      ability: "wis" as const,
      skill: "perception",
      goal: "Study the lantern for a hidden mechanism.",
    };

    const resolution = resolveIntent(session, intent, "I study the lantern.", randomUUID());
    const check = resolution.event.check;

    expect(resolution.event.action).toBeNull();
    expect(resolution.event.intent).toEqual(intent);
    expect(resolution.event.playerText).toBe("I study the lantern.");
    expect(check).not.toBeNull();
    expect(check?.roll).toBeGreaterThanOrEqual(1);
    expect(check?.roll).toBeLessThanOrEqual(20);
    expect(check?.modifier).toBe(1);
    expect(check?.total).toBe((check?.roll ?? 0) + (check?.modifier ?? 0));
    expect(check?.success).toBe(check !== null && check.total >= check.dc);
    expect(resolution.session.version).toBe(1);
  });
});
