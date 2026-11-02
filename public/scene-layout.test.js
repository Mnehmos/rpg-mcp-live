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
});
