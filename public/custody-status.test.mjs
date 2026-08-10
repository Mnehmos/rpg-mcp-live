import { describe, expect, it } from "vitest";
import { projectCustodyActors } from "./custody-status.mjs";

describe("browser custody projection", () => {
  it("projects persisted player and companion restraint, but ignores narration-only text", () => {
    const session = {
      character: {
        id: "player-1",
        name: "Mnehmos",
        custody: {
          actorId: "player-1",
          groupId: "custody-1",
          status: "restrained",
          sourceGuardId: "guard-patrol",
          reason: "surrender",
          locationRef: "holding-vault",
          startedVersion: 4,
          releasePolicy: "guard-release-or-escape",
        },
      },
      worldContext: {
        npcs: [
          {
            id: "titus",
            name: "Titus",
            custody: {
              actorId: "titus",
              groupId: "custody-1",
              status: "under_guard",
              sourceGuardId: "guard-patrol",
              reason: "surrender",
              locationRef: "holding-vault",
              startedVersion: 4,
              releasePolicy: "guard-release-or-escape",
            },
          },
        ],
      },
      controlledActors: [],
      log: [{ text: "The guards control the stairwell." }],
    };

    expect(projectCustodyActors(session)).toEqual([
      {
        id: "player-1",
        name: "Mnehmos",
        kind: "player",
        status: "restrained",
        sourceGuardId: "guard-patrol",
        locationRef: "holding-vault",
        groupId: "custody-1",
      },
      {
        id: "titus",
        name: "Titus",
        kind: "npc",
        status: "under_guard",
        sourceGuardId: "guard-patrol",
        locationRef: "holding-vault",
        groupId: "custody-1",
      },
    ]);
  });
});
