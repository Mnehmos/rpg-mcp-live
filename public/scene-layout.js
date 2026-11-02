/**
 * Layout and movement for the 3D scene view, kept free of Three.js so it can
 * be tested. The engine knows a room's name, biome, atmosphere, exits and who
 * is there, but not where anything stands, so the room is laid out here,
 * seeded by the room id: the same room always looks the same.
 *
 * Coordinates: x runs west to east, z runs north (negative) to south
 * (positive), y is up. The camera starts south of the hero, looking north.
 */

export var HERO_RADIUS = 0.42;
export var ACTOR_RADIUS = 0.45;
export var REACH = 1.9;

var BIOME_STYLES = {
  forest: { floor: "#2f3b22", wall: "#3b2f20", accent: "#7fa35b", sky: "#1b2216", props: ["tree", "tree", "rock", "bush"] },
  mountain: { floor: "#4a4640", wall: "#5b554c", accent: "#b9b2a4", sky: "#26282c", props: ["rock", "rock", "boulder"] },
  urban: { floor: "#3c362e", wall: "#5a4a38", accent: "#e9a75b", sky: "#1c1914", props: ["crate", "barrel", "crate"] },
  dungeon: { floor: "#2c2a28", wall: "#3d3934", accent: "#c98f4a", sky: "#121110", props: ["pillar", "rubble", "brazier"] },
  coastal: { floor: "#5a5244", wall: "#3e4a4c", accent: "#7fb3c4", sky: "#1c2629", props: ["rock", "barrel", "post"] },
  cavern: { floor: "#2b2724", wall: "#37312b", accent: "#8fa3a8", sky: "#0f0e0d", props: ["stalagmite", "rock", "stalagmite"] },
  divine: { floor: "#4d4738", wall: "#6d6250", accent: "#f0d98a", sky: "#242016", props: ["pillar", "brazier", "pillar"] },
  arcane: { floor: "#2a2638", wall: "#3a3350", accent: "#a98ce8", sky: "#14121d", props: ["crystal", "pillar", "crystal"] },
};

var PROP_RADIUS = { tree: 0.6, rock: 0.5, boulder: 0.8, bush: 0.45, crate: 0.5, barrel: 0.4, pillar: 0.45, rubble: 0.5, brazier: 0.35, post: 0.2, stalagmite: 0.4, crystal: 0.35 };

/** Wall the exit sits on, and how far along it (-1..1). */
var EXIT_SLOTS = {
  north: ["north", 0], south: ["south", 0], east: ["east", 0], west: ["west", 0],
  northeast: ["north", 0.7], northwest: ["north", -0.7], southeast: ["south", 0.7], southwest: ["south", -0.7],
  up: ["north", -0.45], down: ["south", 0.45], in: ["north", 0.35], out: ["south", -0.35],
};

export function biomeStyle(biome) {
  return BIOME_STYLES[biome] || BIOME_STYLES.dungeon;
}

function hashString(text) {
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic random numbers in [0, 1) for a seed string (mulberry32). */
export function seededRandom(seed) {
  var state = hashString(String(seed));
  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function exitPrompt(exit) {
  var direction = String(exit.direction).toLowerCase();
  if (direction === "up") return "I climb up.";
  if (direction === "down") return "I head down.";
  return "I take the way " + direction + ".";
}

function actorPrompt(actor) {
  return actor.kind === "enemy"
    ? "I move toward " + actor.name + ", ready for trouble."
    : "I walk over to " + actor.name + " and speak with them.";
}

function exitPosition(direction, size) {
  var slot = EXIT_SLOTS[String(direction).toLowerCase()] || ["north", 0];
  var halfW = size.w / 2;
  var halfD = size.d / 2;
  var along = slot[1];
  if (slot[0] === "north") return { wall: "north", x: along * (halfW - 2), z: -halfD + 0.9 };
  if (slot[0] === "south") return { wall: "south", x: along * (halfW - 2), z: halfD - 0.9 };
  if (slot[0] === "east") return { wall: "east", x: halfW - 0.9, z: along * (halfD - 2) };
  return { wall: "west", x: -halfW + 0.9, z: along * (halfD - 2) };
}

function farEnough(x, z, radius, placed, gap) {
  for (var index = 0; index < placed.length; index += 1) {
    var other = placed[index];
    var dx = x - other.x;
    var dz = z - other.z;
    if (Math.sqrt(dx * dx + dz * dz) < radius + other.r + gap) return false;
  }
  return true;
}

/** How much floor each kind of feature takes up (it blocks the hero). */
var FEATURE_RADIUS = {
  tree: 0.6, bush: 0.45, rock: 0.5, boulder: 0.8, crate: 0.5, barrel: 0.4, pillar: 0.45, rubble: 0.35,
  brazier: 0.35, post: 0.2, stalagmite: 0.4, crystal: 0.35, chest: 0.5, table: 0.9, altar: 0.8,
  statue: 0.6, campfire: 0.6, well: 0.9, door: 0.7, bookshelf: 0.9, bed: 0.9, sign: 0.25, bones: 0.35,
  water: 1.8, cart: 1.1, person: ACTOR_RADIUS,
};

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sameName(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function featurePrompt(feature) {
  return feature.kind === "person"
    ? "I walk over to " + feature.name + " and speak with them."
    : "I examine " + feature.name + ".";
}

/**
 * Plans a room from the scene view. With a DM layout (scene_layout), its
 * features, people and ways onward are placed where the DM put them; without
 * one, the room is laid out from its id. Either way seeded props fill in
 * around, never blocking an exit, a feature, a person, or the spawn.
 * options.fromRoomId puts the hero just inside the doorway they came through.
 */
export function planScene(scene, options) {
  var room = scene && scene.room;
  if (!room) return null;
  var random = seededRandom(room.id);
  var style = biomeStyle(room.biome);
  var atmospherics = Array.isArray(room.atmospherics) ? room.atmospherics : [];
  var layout = scene.layout && typeof scene.layout === "object" ? scene.layout : null;
  // The DM lays rooms out in a fixed 18 x 14 frame (scene-building.ts), plus a margin for the walls.
  var size = layout ? { w: 20, d: 16 } : { w: 14 + Math.round(random() * 8), d: 12 + Math.round(random() * 6) };
  var limitX = size.w / 2 - 1;
  var limitZ = size.d / 2 - 1;
  var clampX = function (value) { return Math.max(-limitX, Math.min(limitX, Number(value) || 0)); };
  var clampZ = function (value) { return Math.max(-limitZ, Math.min(limitZ, Number(value) || 0)); };

  var exitSources = (scene.exits || []).map(function (exit) {
    return { direction: String(exit.direction), description: exit.description || "", targetRoomId: exit.targetRoomId || null, unexplored: false };
  });
  (layout && Array.isArray(layout.paths) ? layout.paths : []).forEach(function (path) {
    var direction = String(path.direction || "");
    if (!direction || exitSources.some(function (exit) { return sameName(exit.direction, direction); })) return;
    exitSources.push({ direction: direction, description: String(path.label || ""), targetRoomId: null, unexplored: true });
  });
  var exits = exitSources.map(function (exit) {
    var spot = exitPosition(exit.direction, size);
    var direction = exit.direction.toLowerCase();
    return {
      id: "exit-" + direction,
      kind: "exit",
      direction: exit.direction,
      label: capitalize(direction),
      description: exit.description,
      targetRoomId: exit.targetRoomId,
      unexplored: exit.unexplored,
      wall: spot.wall,
      x: spot.x,
      z: spot.z,
      r: 0.9,
      prompt: exit.unexplored && exit.description ? "I head " + direction + ", " + exit.description + "." : exitPrompt(exit),
      verb: exit.unexplored && exit.description ? "Go " + direction + ": " + exit.description : "Go " + direction,
    };
  });

  var spawn = { x: 0, z: size.d / 2 - 2.4, r: 1.2 };
  var cameFrom = options && options.fromRoomId
    ? exits.filter(function (exit) { return exit.targetRoomId === options.fromRoomId; })[0]
    : null;
  if (cameFrom) {
    // Step in from the doorway, toward the middle of the room.
    var length = Math.sqrt(cameFrom.x * cameFrom.x + cameFrom.z * cameFrom.z) || 1;
    spawn = { x: cameFrom.x - (cameFrom.x / length) * 1.6, z: cameFrom.z - (cameFrom.z / length) * 1.6, r: 1.2 };
  }
  var placed = [spawn].concat(exits);

  var features = (layout && Array.isArray(layout.features) ? layout.features : []).map(function (feature, index) {
    var shape = FEATURE_RADIUS[feature.kind] ? feature.kind : "crate";
    var planned = {
      id: "feature-" + index,
      kind: "feature",
      shape: shape,
      name: String(feature.name || "something"),
      label: String(feature.name || "something"),
      description: String(feature.description || ""),
      x: clampX(feature.x),
      z: clampZ(feature.z),
      r: FEATURE_RADIUS[shape],
      prompt: featurePrompt({ kind: shape, name: String(feature.name || "something") }),
      verb: shape === "person" ? "Talk to " + feature.name : "Examine " + feature.name,
    };
    placed.push(planned);
    return planned;
  });

  var people = layout && Array.isArray(layout.people) ? layout.people : [];
  var unplaced = (scene.actors || []).filter(function (actor) {
    return !people.some(function (person) { return sameName(person.name, actor.name); });
  });
  var actors = (scene.actors || []).map(function (actor) {
    var spot = people.filter(function (person) { return sameName(person.name, actor.name); })[0];
    var x;
    var z;
    if (spot) {
      x = clampX(spot.x);
      z = clampZ(spot.z);
    } else {
      // Anyone the DM did not place stands in a loose arc across the north half.
      var index = unplaced.indexOf(actor);
      var span = Math.min(Math.PI * 0.8, 0.5 * unplaced.length);
      var angle = unplaced.length === 1 ? 0 : -span / 2 + (span * index) / (unplaced.length - 1);
      var radius = Math.min(size.d * 0.42, 4 + random() * 1.5);
      x = Math.sin(angle) * radius;
      z = -Math.cos(angle) * radius + 0.5;
    }
    var planned = {
      id: actor.id,
      kind: actor.kind === "enemy" ? "enemy" : "npc",
      name: actor.name,
      label: actor.name,
      x: x,
      z: z,
      r: ACTOR_RADIUS,
      prompt: actorPrompt(actor),
      verb: actor.kind === "enemy" ? "Face " + actor.name : "Talk to " + actor.name,
    };
    placed.push(planned);
    return planned;
  });

  var props = [];
  var target = layout ? 3 + Math.round(random() * 2) : 6 + Math.round(random() * 6);
  for (var attempt = 0; attempt < 200 && props.length < target; attempt += 1) {
    var kind = style.props[Math.floor(random() * style.props.length)];
    var r = PROP_RADIUS[kind] || 0.5;
    var x = (random() - 0.5) * (size.w - 2.4);
    var z = (random() - 0.5) * (size.d - 2.4);
    if (!farEnough(x, z, r, placed, 1.1)) continue;
    var prop = { kind: kind, x: x, z: z, r: r, scale: 0.8 + random() * 0.5, rotation: random() * Math.PI * 2 };
    placed.push(prop);
    props.push(prop);
  }

  return {
    roomId: room.id,
    name: room.name,
    size: size,
    style: style,
    fog: atmospherics.indexOf("FOG") !== -1,
    dark: atmospherics.indexOf("DARKNESS") !== -1 && !room.lit,
    bright: atmospherics.indexOf("BRIGHT") !== -1,
    magical: atmospherics.indexOf("MAGICAL") !== -1,
    lit: Boolean(room.lit),
    spawn: { x: spawn.x, z: spawn.z },
    exits: exits,
    features: features,
    actors: actors,
    props: props,
  };
}

/**
 * Moves the hero by (dx, dz), sliding along walls and around anything solid.
 * Exits are walk-through markers, not obstacles.
 */
export function stepHero(position, dx, dz, plan) {
  var x = position.x + dx;
  var z = position.z + dz;
  var limitX = plan.size.w / 2 - HERO_RADIUS - 0.25;
  var limitZ = plan.size.d / 2 - HERO_RADIUS - 0.25;
  var solids = plan.props.concat(plan.actors, plan.features);
  for (var pass = 0; pass < 2; pass += 1) {
    for (var index = 0; index < solids.length; index += 1) {
      var solid = solids[index];
      var ox = x - solid.x;
      var oz = z - solid.z;
      var distance = Math.sqrt(ox * ox + oz * oz);
      var minimum = HERO_RADIUS + solid.r;
      if (distance < minimum) {
        if (distance < 1e-6) { ox = 0; oz = 1; distance = 1; }
        x = solid.x + (ox / distance) * minimum;
        z = solid.z + (oz / distance) * minimum;
      }
    }
    x = Math.max(-limitX, Math.min(limitX, x));
    z = Math.max(-limitZ, Math.min(limitZ, z));
  }
  return { x: x, z: z };
}

/** The closest person, feature, or exit within reach of the hero, or null. */
export function nearestInteraction(position, plan) {
  var best = null;
  var bestDistance = Infinity;
  var targets = plan.actors.concat(plan.features, plan.exits);
  for (var index = 0; index < targets.length; index += 1) {
    var target = targets[index];
    var dx = position.x - target.x;
    var dz = position.z - target.z;
    var distance = Math.sqrt(dx * dx + dz * dz) - target.r;
    if (distance <= REACH && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

/** Turns keyboard state into a camera-relative movement direction (unit length or zero). */
export function moveDirection(keys, cameraYaw) {
  var forward = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  var strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (!forward && !strafe) return { x: 0, z: 0 };
  // Forward is away from the camera; with yaw 0 the camera looks north (-z).
  var sin = Math.sin(cameraYaw);
  var cos = Math.cos(cameraYaw);
  var x = strafe * cos - forward * sin;
  var z = -forward * cos - strafe * sin;
  var length = Math.sqrt(x * x + z * z);
  return { x: x / length, z: z / length };
}
