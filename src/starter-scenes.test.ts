import { describe, expect, it } from "vitest";
import { listQuickstartPresets } from "./quickstarts.js";
import type { StoredLogMessage } from "./reference-engine-store.js";
import { PERSONALIZE_OPENING_PREFIX, getStarterScene, pendingStarterEntry, personalizeOpeningInstruction } from "./starter-scenes.js";

const BIOMES = ["forest", "mountain", "urban", "dungeon", "coastal", "cavern", "divine", "arcane"];
const ATMOSPHERICS = ["DARKNESS", "FOG", "ANTIMAGIC", "SILENCE", "BRIGHT", "MAGICAL"];

const starterEntry = (text = "The fog lies still.") => ({
  id: "n1",
  kind: "narration" as const,
  text,
  createdAt: "2026-10-25T00:00:00Z",
  starter: { roomId: "room-1", roomName: "Brinewick Quay", sceneId: "scene-1", title: "No Wind in Brinewick" },
});

describe("starter scenes", () => {
  it("gives every quickstart a starter the engine schema accepts", () => {
    for (const preset of listQuickstartPresets()) {
      const starter = getStarterScene(preset.id);
      expect(starter, preset.id).not.toBeNull();
      expect(starter!.room.name.length).toBeGreaterThan(0);
      expect(starter!.room.name.length).toBeLessThanOrEqual(100);
      expect(starter!.room.baseDescription.length).toBeGreaterThanOrEqual(10);
      expect(starter!.room.baseDescription.length).toBeLessThanOrEqual(2000);
      expect(BIOMES).toContain(starter!.room.biomeContext);
      for (const atmospheric of starter!.room.atmospherics) expect(ATMOSPHERICS).toContain(atmospheric);
      expect(starter!.narration).toMatch(/What do you do/);
    }
  });

  it("is pending only until the DM narrates after it", () => {
    const log: StoredLogMessage[] = [{ id: "s", kind: "system", text: "Campaign created.", createdAt: "t" }, starterEntry()];
    expect(pendingStarterEntry(log)?.starter.roomId).toBe("room-1");
    expect(pendingStarterEntry([...log, { id: "p", kind: "player", text: "x", createdAt: "t" }, { id: "d", kind: "narration", text: "Personalized.", createdAt: "t" }])).toBeNull();
    expect(pendingStarterEntry([{ id: "d", kind: "narration", text: "Model opening.", createdAt: "t" }])).toBeNull();
  });

  it("asks the DM to personalize the committed scene rather than build a new one", () => {
    const instruction = personalizeOpeningInstruction(starterEntry("Three days without wind."));
    expect(instruction.startsWith(PERSONALIZE_OPENING_PREFIX)).toBe(true);
    expect(instruction).toContain("roomId room-1");
    expect(instruction).toContain("sceneId scene-1");
    expect(instruction).toContain("Do not generate a new room");
    expect(instruction).toContain("Three days without wind.");
  });
});
