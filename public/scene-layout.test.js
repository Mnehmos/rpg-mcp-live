import { describe, expect, it } from "vitest";
import { HERO_RADIUS, moveDirection, nearestInteraction, planScene, stepHero } from "./scene-layout.js";

const scene = {
  room: { id: "room-9", name: "Brinewick Quay", description: "A stone quay.", biome: "coastal", atmospherics: ["FOG"], lit: false },
  exits: [{ direction: "north", description: "The breakwater" }, { direction: "east", description: "" }],
  actors: [{ id: "npc-1", name: "Marla Tull", kind: "npc" }, { id: "foe-1", name: "Drowned Man", kind: "enemy" }],
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("scene layout", () => {
  it("lays the same room out the same way every time", () => {
    expect(planScene(scene)).toEqual(planScene(scene));
    expect(planScene({ ...scene, room: { ...scene.room, id: "room-10" } })).not.toEqual(planScene(scene));
  });

  it("plans nothing when the hero has no room", () => {
    expect(planScene({ room: null, exits: [], actors: [] })).toBeNull();
  });

  it("puts each exit on its wall with a move the DM can act on", () => {
    const plan = planScene(scene);
    const north = plan.exits.find((exit) => exit.direction === "north");
    const east = plan.exits.find((exit) => exit.direction === "east");
    expect(north).toMatchObject({ wall: "north", prompt: "I take the way north.", verb: "Go north" });
    expect(north.z).toBeLessThan(0);
    expect(east).toMatchObject({ wall: "east" });
    expect(east.x).toBeGreaterThan(0);
  });

  it("offers people as moves, warier for enemies", () => {
    const plan = planScene(scene);
    expect(plan.actors.find((actor) => actor.id === "npc-1")).toMatchObject({ verb: "Talk to Marla Tull", prompt: "I walk over to Marla Tull and speak with them." });
    expect(plan.actors.find((actor) => actor.id === "foe-1").prompt).toBe("I move toward Drowned Man, ready for trouble.");
  });

  it("keeps props clear of the spawn, exits, and people", () => {
    const plan = planScene(scene);
    expect(plan.props.length).toBeGreaterThan(0);
    for (const prop of plan.props) {
      expect(distance(prop, plan.spawn)).toBeGreaterThan(prop.r + 1.2);
      for (const other of [...plan.exits, ...plan.actors]) expect(distance(prop, other)).toBeGreaterThan(prop.r + other.r);
    }
  });

  it("reads the room's atmosphere", () => {
    expect(planScene(scene)).toMatchObject({ fog: true, dark: false });
    expect(planScene({ ...scene, room: { ...scene.room, atmospherics: ["DARKNESS"] } }).dark).toBe(true);
    expect(planScene({ ...scene, room: { ...scene.room, atmospherics: ["DARKNESS"], lit: true } }).dark).toBe(false);
  });

  it("stops the hero at the walls and slides them around people", () => {
    const plan = planScene(scene);
    const atWall = stepHero({ x: 0, z: 0 }, 0, -100, plan);
    expect(atWall.z).toBeCloseTo(-(plan.size.d / 2 - HERO_RADIUS - 0.25));
    const marla = plan.actors[0];
    const pushed = stepHero({ x: marla.x, z: marla.z + 2 }, 0, -2, plan);
    expect(distance(pushed, marla)).toBeGreaterThanOrEqual(HERO_RADIUS + marla.r - 1e-9);
  });

  it("offers the nearest person or exit in reach, and nothing out of reach", () => {
    const plan = planScene(scene);
    const marla = plan.actors[0];
    expect(nearestInteraction({ x: marla.x, z: marla.z + 1 }, plan)).toBe(marla);
    expect(nearestInteraction(plan.spawn, plan)).toBeNull();
  });

  it("moves relative to the camera", () => {
    expect(moveDirection({ forward: true }, 0)).toEqual({ x: 0, z: -1 });
    expect(moveDirection({ right: true }, 0)).toMatchObject({ x: 1 });
    const turned = moveDirection({ forward: true }, Math.PI / 2);
    expect(turned.x).toBeCloseTo(-1);
    expect(turned.z).toBeCloseTo(0);
    expect(moveDirection({}, 0)).toEqual({ x: 0, z: 0 });
  });

  it("draws the DM's layout: features where it put them, people by name, ways onward as unexplored exits", () => {
    const plan = planScene({
      ...scene,
      layout: {
        features: [{ name: "the old well", kind: "well", x: 3, z: -2, description: "Deep." }, { name: "Hesper Quill", kind: "person", x: -2, z: 1, description: "" }],
        people: [{ name: "marla tull", x: -4, z: -3 }],
        paths: [{ direction: "north", label: "duplicate of a real exit" }, { direction: "down", label: "the tide caves" }],
      },
    });
    expect(plan.size).toEqual({ w: 20, d: 16 });
    expect(plan.features[0]).toMatchObject({ kind: "feature", shape: "well", x: 3, z: -2, verb: "Examine the old well", prompt: "I examine the old well." });
    expect(plan.features[1]).toMatchObject({ shape: "person", verb: "Talk to Hesper Quill" });
    expect(plan.actors.find((actor) => actor.id === "npc-1")).toMatchObject({ x: -4, z: -3 });
    expect(plan.exits.map((exit) => exit.direction)).toEqual(["north", "east", "down"]);
    expect(plan.exits.find((exit) => exit.direction === "down")).toMatchObject({ unexplored: true, prompt: "I head down, the tide caves." });
    expect(nearestInteraction({ x: 3, z: -0.6 }, plan)).toBe(plan.features[0]);
    const blocked = stepHero({ x: 3, z: 0 }, 0, -2, plan);
    expect(distance(blocked, plan.features[0])).toBeGreaterThanOrEqual(HERO_RADIUS + plan.features[0].r - 1e-9);
  });

  it("brings the hero in through the doorway they came from", () => {
    const withBack = { ...scene, exits: [{ direction: "east", description: "", targetRoomId: "room-8" }] };
    const plan = planScene(withBack, { fromRoomId: "room-8" });
    const east = plan.exits[0];
    expect(plan.spawn.x).toBeGreaterThan(0);
    expect(distance(plan.spawn, east)).toBeCloseTo(1.6);
  });
});
