import { describe, expect, it } from "vitest";
import { FEATURE_KINDS, normalizeSceneLayout, SCENE_BUILDING_GUIDE, SCENE_LAYOUT_TOOL } from "./scene-building.js";
import { getStarterScene } from "./starter-scenes.js";
import { listQuickstartPresets } from "./quickstarts.js";

describe("scene building", () => {
  it("keeps what can be drawn, clamps positions into the room, and reports what it dropped", () => {
    const { layout, dropped } = normalizeSceneLayout({
      features: [
        { name: " the old  well ", kind: "well", x: 40, z: -2, description: "Deep." },
        { name: "a mystery", kind: "spaceship", x: 1, z: 1 },
        { name: "", kind: "rock", x: 0, z: 0 },
      ],
      people: [{ name: "Marla Tull", x: "2", z: 1 }, { name: "Nobody" }],
      paths: [{ direction: "North", label: "the breakwater" }, { direction: "north", label: "again" }, { direction: "sideways", label: "x" }],
    });
    expect(layout).toEqual({
      features: [
        { name: "the old well", kind: "well", x: 9, z: -2, description: "Deep." },
        { name: "a mystery", kind: "crate", x: 1, z: 1, description: "" },
      ],
      people: [{ name: "Marla Tull", x: 2, z: 1 }],
      paths: [{ direction: "north", label: "the breakwater" }],
    });
    expect(dropped.length).toBe(3);
  });

  it("tells the DM to build connected rooms as the player explores", () => {
    expect(SCENE_LAYOUT_TOOL.function.name).toBe("scene_layout");
    expect(SCENE_BUILDING_GUIDE).toContain("previousNodeId");
    expect(SCENE_BUILDING_GUIDE).toContain("scene_layout set");
  });

  it("gives every quickstart opening a layout the 3D view can draw", () => {
    for (const preset of listQuickstartPresets()) {
      const layout = getStarterScene(preset.id)!.layout;
      expect(normalizeSceneLayout(layout as unknown as Record<string, unknown>)).toEqual({ layout, dropped: [] });
      for (const feature of layout.features) expect(FEATURE_KINDS).toContain(feature.kind);
    }
  });
});
