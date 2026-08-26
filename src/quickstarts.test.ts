import { describe, expect, it } from "vitest";
import { getQuickstartPreset, listQuickstartPresets } from "./quickstarts.js";

describe("quickstart catalog", () => {
  it("exposes only player-safe metadata to the listing", () => {
    const entries = listQuickstartPresets();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ id: "salt-road", title: "The Salt Road" });
    expect(entries[0]).not.toHaveProperty("character");
    expect(entries[0]).not.toHaveProperty("campaign");
  });

  it("resolves a complete preset for server-side setup", () => {
    const preset = getQuickstartPreset("ember-watch");
    expect(preset).toMatchObject({
      id: "ember-watch",
      campaign: { name: "The Ember Watch" },
      character: { name: "Tovin Ash", species: "human", className: "fighter" },
    });
    expect(preset?.character.abilityScores).toEqual({ str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 });
  });

  it("rejects unknown presets without throwing", () => {
    expect(getQuickstartPreset("does-not-exist")).toBeNull();
  });
});
