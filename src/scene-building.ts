import type { OpenRouterToolDefinition } from "./reference-engine-tools.js";

/**
 * World building for the 3D view. The engine knows rooms, exits and who is
 * where, but not what a room looks like inside. The DM lays each room out
 * with scene_layout: named features at positions, where the people stand,
 * and ways onward toward places that do not exist yet. The 3D view renders
 * exactly that, so what the DM narrates is what the player can walk up to.
 *
 * Room frame: x runs west (-9) to east (9), z runs north (-7) to south (7),
 * and (0, 0) is the middle of the room.
 */
export const FEATURE_KINDS = [
  "tree", "bush", "rock", "boulder", "crate", "barrel", "pillar", "rubble", "brazier", "post",
  "stalagmite", "crystal", "chest", "table", "altar", "statue", "campfire", "well", "door",
  "bookshelf", "bed", "sign", "bones", "water", "cart",
  // Someone the narration names who is not (yet) a character in the engine.
  "person",
] as const;
export const PATH_DIRECTIONS = [
  "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest", "up", "down",
] as const;
export const ROOM_HALF_WIDTH = 9;
export const ROOM_HALF_DEPTH = 7;

export interface SceneFeature {
  name: string;
  kind: (typeof FEATURE_KINDS)[number];
  x: number;
  z: number;
  description: string;
}
export interface ScenePath {
  direction: (typeof PATH_DIRECTIONS)[number];
  label: string;
}
export interface ScenePerson {
  name: string;
  x: number;
  z: number;
}
export interface SceneLayout {
  features: SceneFeature[];
  paths: ScenePath[];
  people: ScenePerson[];
}

export const SCENE_LAYOUT_TOOL: OpenRouterToolDefinition = {
  type: "function",
  function: {
    name: "scene_layout",
    description:
      "Lay out a room for the player's 3D view: what is in it and where, where the people stand, and the ways onward to places not built yet. " +
      "action set replaces the layout of roomId (default: the room the player is in); action get returns it. " +
      `Positions are in the room's frame: x from -${ROOM_HALF_WIDTH} (west wall) to ${ROOM_HALF_WIDTH} (east wall), z from -${ROOM_HALF_DEPTH} (north wall) to ${ROOM_HALF_DEPTH} (south wall), 0,0 in the middle; the player usually enters from the south. ` +
      "Presentation only: it never creates items, NPCs, or rooms, so still commit those with their engine tools.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["set", "get"] },
        roomId: { type: "string", description: "The room to lay out. Omit for the player's current room." },
        features: {
          type: "array",
          description: "3 to 10 things in the room the player can see and walk up to.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "What the player calls it, e.g. \"the cut satchel\"." },
              kind: { type: "string", enum: FEATURE_KINDS, description: "Closest shape to draw it with." },
              x: { type: "number" },
              z: { type: "number" },
              description: { type: "string", description: "One line shown when the player looks at it." },
            },
            required: ["name", "kind", "x", "z"],
          },
        },
        people: {
          type: "array",
          description: "Where each person present stands, by the name they have in the engine.",
          items: {
            type: "object",
            properties: { name: { type: "string" }, x: { type: "number" }, z: { type: "number" } },
            required: ["name", "x", "z"],
          },
        },
        paths: {
          type: "array",
          description: "Ways onward that lead somewhere not built yet. When the player takes one, build that room with spatial_manage generate using previousNodeId and direction.",
          items: {
            type: "object",
            properties: {
              direction: { type: "string", enum: PATH_DIRECTIONS },
              label: { type: "string", description: "Where it seems to lead, e.g. \"down to the tide caves\"." },
            },
            required: ["direction", "label"],
          },
        },
      },
      required: ["action"],
    },
  },
};

export const SCENE_BUILDING_GUIDE = [
  "WORLD BUILDING FOR THE 3D VIEW: the player sees and walks around the current room in 3D, drawn from what you lay out with scene_layout.",
  "Whenever you create a room or what is in it changes, call scene_layout set for it in the same round as scene_manage set: place the things your narration mentions (and a few that make the place feel real), position the people present, and give one to three ways onward.",
  "When the player heads along a way onward or an exit, build that room with spatial_manage generate using previousNodeId (the room they are leaving) and direction so the rooms connect, move the player there, lay it out, then narrate.",
  "Keep the layout and the narration consistent: anything you describe being in the room should be placed in it.",
].join(" ");

function clamp(value: unknown, limit: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(-limit, Math.min(limit, number));
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Accepts what a model sends, keeps what can be drawn, and says what was dropped. */
export function normalizeSceneLayout(args: Record<string, unknown>): { layout: SceneLayout; dropped: string[] } {
  const dropped: string[] = [];
  const list = (value: unknown, label: string, max: number): Record<string, unknown>[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { dropped.push(`${label} must be an array`); return []; }
    if (value.length > max) dropped.push(`${label} beyond the first ${max}`);
    return value.slice(0, max).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  };
  const features: SceneFeature[] = [];
  for (const item of list(args.features, "features", 16)) {
    const name = text(item.name, 60);
    const kind = (FEATURE_KINDS as readonly string[]).includes(String(item.kind)) ? item.kind as SceneFeature["kind"] : null;
    const x = clamp(item.x, ROOM_HALF_WIDTH);
    const z = clamp(item.z, ROOM_HALF_DEPTH);
    if (!name || x === null || z === null) { dropped.push(`feature ${JSON.stringify(item.name ?? "?")} (needs name, x, z)`); continue; }
    features.push({ name, kind: kind ?? "crate", x, z, description: text(item.description, 240) });
  }
  const people: ScenePerson[] = [];
  for (const item of list(args.people, "people", 12)) {
    const name = text(item.name, 60);
    const x = clamp(item.x, ROOM_HALF_WIDTH);
    const z = clamp(item.z, ROOM_HALF_DEPTH);
    if (!name || x === null || z === null) { dropped.push(`person ${JSON.stringify(item.name ?? "?")} (needs name, x, z)`); continue; }
    people.push({ name, x, z });
  }
  const paths: ScenePath[] = [];
  for (const item of list(args.paths, "paths", 6)) {
    const direction = String(item.direction ?? "").toLowerCase();
    const label = text(item.label, 80);
    if (!(PATH_DIRECTIONS as readonly string[]).includes(direction) || !label) { dropped.push(`path ${JSON.stringify(item.direction ?? "?")} (needs a direction and label)`); continue; }
    if (paths.some((path) => path.direction === direction)) continue;
    paths.push({ direction: direction as ScenePath["direction"], label });
  }
  return { layout: { features, paths, people }, dropped };
}
