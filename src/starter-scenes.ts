import type { StoredLogMessage } from "./reference-engine-store.js";

/**
 * A playable first scene committed without the model (architecture audit R01).
 * Quickstarts commit the room, place the character there and set the scene,
 * so a new player is at the table instantly even if the provider is slow or
 * down. The DM then personalizes the same scene once; if that fails, this
 * hand-written opening stands.
 */
export interface StarterScene {
  room: {
    name: string;
    baseDescription: string;
    biomeContext: "forest" | "mountain" | "urban" | "dungeon" | "coastal" | "cavern" | "divine" | "arcane";
    atmospherics: Array<"DARKNESS" | "FOG" | "ANTIMAGIC" | "SILENCE" | "BRIGHT" | "MAGICAL">;
  };
  scene: { title: string; placeLabel: string };
  narration: string;
}

export interface StarterLogMarker {
  roomId: string;
  roomName: string;
  sceneId: string | null;
  title: string;
}

const STARTER_SCENES: Readonly<Record<string, StarterScene>> = {
  "salt-road": {
    room: {
      name: "The Wreckers' Milestone",
      baseDescription: "A crooked milestone where the salt road bends along the cliffs, its carved mile-number worn smooth by spray. Below, the tide hisses over black rocks; above, a gull-picked courier's satchel hangs from a thornbush, its strap cut clean.",
      biomeContext: "coastal",
      atmospherics: ["FOG"],
    },
    scene: { title: "The Cut Strap", placeLabel: "The Wreckers' Milestone, salt road" },
    narration: [
      "Rain has finally stopped, but the wind off the sea hasn't. You come round the last bend of the salt road with your collar up and find what the harbor master paid you to find: the courier's satchel, snagged in a thornbush beside the old wreckers' milestone.",
      "The strap wasn't torn. It was cut, one clean stroke, and the flap hangs open. The sealed letter everyone wants is gone. A single wax crumb, deep red, clings to the leather.",
      "Fresh boot prints lead two ways. One set goes down the cliff path toward the tide caves, already half-filled with seawater. The other heads inland toward the lamplit roof of the Gull & Anchor, where someone has just shuttered a window.",
      "The tide turns within the hour. What do you do, Mara?",
    ].join("\n\n"),
  },
  "ember-watch": {
    room: {
      name: "Brinewick Quay",
      baseDescription: "A stone harbor quay under a dead-calm fog, moored skiffs motionless on water flat as glass. At the end of the breakwater the abandoned lighthouse burns with a cold white light that gives off no smoke and no heat.",
      biomeContext: "coastal",
      atmospherics: ["FOG"],
    },
    scene: { title: "No Wind in Brinewick", placeLabel: "Brinewick Quay, under the lighthouse" },
    narration: [
      "Three days without a breath of wind, and the fog over Brinewick harbor hasn't moved an inch. The skiffs sit on water as flat as poured glass. Nothing creaks. Nothing drips.",
      "At the end of the breakwater the old lighthouse is burning: a pale, steady light in the lamp room, cold as a fish's eye. No smoke rises from it. The keeper died eleven years ago.",
      "On the quay beside you, harbor watchwoman Marla Tull grips a lantern with both hands. \"Three men rowed out toward that light,\" she says. \"Kessick last night. The Dorn brothers before him. No boats came back. No bodies either.\" She looks at your sword, then at you. \"I can't go up there alone.\"",
      "The breakwater runs into the fog, toward the light. What do you do, Tovin?",
    ].join("\n\n"),
  },
  "glass-under-moon": {
    room: {
      name: "The Lantern Street Glazier's",
      baseDescription: "A cramped glazier's shop on Lantern Street in the old river city, its walls hung with unsold panes. Each pane shows a faint, wrong reflection of some other night. A trapdoor in the floor leads down to the buried streets below.",
      biomeContext: "urban",
      atmospherics: ["DARKNESS", "MAGICAL"],
    },
    scene: { title: "The Bell Below", placeLabel: "A glazier's shop on Lantern Street, near midnight" },
    narration: [
      "The glazier, old Hesper Quill, wrote to you because no one else in the river city would listen. Now you stand among her unsold windows, a minute before midnight, and see what she meant.",
      "Every pane is reflecting the wrong night. In one, snow falls on a summer street. In another, the shop is lit by candles that aren't here, and a woman you don't know is mouthing a name. Hesper keeps her eyes on the floor.",
      "Then it comes: a single bell, struck once, from somewhere beneath the cobbles. The glass hums with it. Every reflection turns, as one, toward the iron trapdoor behind the counter.",
      "\"That's the old drowned quarter down there,\" Hesper whispers. \"It's been sealed since my grandmother's time. Every night the bell rings, and every night something new shows up in the glass.\"",
      "What do you do, Elian?",
    ].join("\n\n"),
  },
};

export function getStarterScene(presetId: string): StarterScene | null {
  return STARTER_SCENES[presetId] ?? null;
}

/** Hidden from the player's log, like the plain opening instruction. */
export const PERSONALIZE_OPENING_PREFIX = "Personalize the opening scene.";

/**
 * The committed starter narration, while the DM has not yet narrated anything
 * after it (the personalization pass has not landed).
 */
export function pendingStarterEntry(log: readonly StoredLogMessage[]): (StoredLogMessage & { starter: StarterLogMarker }) | null {
  let starter: (StoredLogMessage & { starter: StarterLogMarker }) | null = null;
  for (const entry of log) {
    if (entry.kind === "narration" && entry.starter) starter = entry as StoredLogMessage & { starter: StarterLogMarker };
    else if (starter && entry.kind === "narration") return null;
  }
  return starter;
}

export function personalizeOpeningInstruction(entry: StoredLogMessage & { starter: StarterLogMarker }): string {
  return [
    PERSONALIZE_OPENING_PREFIX,
    `The starter scene is already committed in the engine: the player character is in room "${entry.starter.roomName}" (roomId ${entry.starter.roomId})`
      + (entry.starter.sceneId ? `, and scene "${entry.starter.title}" (sceneId ${entry.starter.sceneId}) is set.` : "."),
    "Do not generate a new room, move the character, or set a new scene unless the fiction truly needs it.",
    "Rewrite the opening below for this character, keeping its place, people, stakes and closing question, then narrate it as the first scene.",
    "",
    "Starter opening:",
    entry.text,
  ].join("\n");
}
