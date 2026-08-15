import { describe, expect, it } from "vitest";
import { questProgress, questStatusLabel, visibleQuestEntries } from "./quest-projection.js";

describe("quest projection", () => {
  it("keeps authored active and completed quests visible while ignoring unknown shell entries", () => {
    const quests = visibleQuestEntries([
      { id: "starter", status: "active", title: "The first chapter" },
      { id: "rescue", status: "completed", title: "Rescue Sergeant Pell", progress: 80 },
      { id: "relay", status: "active", title: "War-machine relay", progress: 35 },
      { id: "unknown", status: "not-a-status", title: "Bad data" },
    ]);

    expect(quests.map((quest) => quest.id)).toEqual(["starter", "rescue", "relay"]);
    expect(questProgress(quests[1])).toBe(100);
    expect(questProgress(quests[2])).toBe(35);
    expect(questStatusLabel("completed")).toBe("Completed");
  });
});
