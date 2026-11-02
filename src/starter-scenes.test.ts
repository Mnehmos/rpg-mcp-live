import { describe, expect, it } from "vitest";
import { listQuickstartPresets } from "./quickstarts.js";
import { getStarterScene } from "./starter-scenes.js";

const BIOMES = ["forest", "mountain", "urban", "dungeon", "coastal", "cavern", "divine", "arcane"];
const ATMOSPHERICS = ["DARKNESS", "FOG", "ANTIMAGIC", "SILENCE", "BRIGHT", "MAGICAL"];

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
      // Story starters end on a choice; session zero ends on its first question.
      expect(starter!.narration).toMatch(starter!.sessionZero ? /\?$/ : /What do you do/);
      expect(starter!.firstMoves.length).toBeGreaterThanOrEqual(3);
      for (const move of starter!.firstMoves) {
        expect(move.label.length).toBeGreaterThan(0);
        expect(move.prompt).toMatch(/^I /);
      }
    }
  });
});
