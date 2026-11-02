/**
 * A playable first scene committed without the model (architecture audit R01).
 * Quickstarts commit the room, place the character there and set the scene,
 * so a new player is at the table instantly even if the provider is slow or
 * down. This opening is the campaign's first narration and is never
 * replaced; the DM takes over from the player's first move, building on it.
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
  /** Scene-specific suggestions for the player's very first move. */
  firstMoves: Array<{ label: string; prompt: string }>;
  /** A session-zero welcome rather than a scene: the DM runs session-zero.ts's agenda until it is done. */
  sessionZero?: true;
}

export interface StarterLogMarker {
  roomId: string;
  roomName: string;
  sceneId: string | null;
  title: string;
  firstMoves?: Array<{ label: string; prompt: string }>;
  sessionZero?: true;
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
    firstMoves: [
      { label: "Follow the cliff path", prompt: "I follow the boot prints down the cliff path toward the tide caves before the water rises." },
      { label: "Head for the Gull & Anchor", prompt: "I follow the inland prints to the Gull & Anchor and watch for whoever shuttered that window." },
      { label: "Study the cut strap", prompt: "I examine the cut strap and the red wax crumb for anything that tells me who did this." },
    ],
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
    firstMoves: [
      { label: "Walk the breakwater", prompt: "I draw my sword and walk the breakwater toward the lighthouse, with Marla and her lantern beside me." },
      { label: "Question Marla", prompt: "I ask Marla what Kessick and the Dorn brothers said before they rowed out." },
      { label: "Search the skiffs", prompt: "I search the moored skiffs and the quay for anything the missing men left behind." },
    ],
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
    firstMoves: [
      { label: "Read the glass", prompt: "I study the pane where the woman is mouthing a name and try to read her lips." },
      { label: "Try the trapdoor", prompt: "I kneel by the iron trapdoor behind the counter and check whether it can be opened." },
      { label: "Press Hesper", prompt: "I ask Hesper what has shown up in the glass on other nights, and what she is not telling me." },
    ],
  },
  "session-zero": {
    room: {
      name: "The Unwritten Map",
      baseDescription: "A table with a blank map spread across it, edges weighted with dice, waiting for a world to be drawn.",
      biomeContext: "arcane",
      atmospherics: [],
    },
    scene: { title: "Session Zero", placeLabel: "At the table, before the first scene" },
    narration: [
      "Welcome to the table. Before we roll a single die, let's build this campaign together. This is session zero: we'll settle what kind of story you want, anything you'd rather never see, the world itself, and who you are in it. Then we play.",
      "Tap a choice below or answer in your own words. Nothing is locked in until you say so.",
      "First question: what kind of story are we telling? Grim and dangerous, where every victory costs something? Heroic, with big swings and bigger villains? A slow-burn mystery? Or something lighter, with room to laugh?",
    ].join("\n\n"),
    firstMoves: [
      { label: "Grim and dangerous", prompt: "I want a grim, dangerous story where every victory costs something." },
      { label: "Heroic adventure", prompt: "I want a heroic adventure with big swings and bigger villains." },
      { label: "Slow-burn mystery", prompt: "I want a slow-burn mystery full of secrets and intrigue." },
      { label: "Light-hearted", prompt: "I want something lighter, with danger but plenty of room to laugh." },
    ],
    sessionZero: true,
  },
};

export function getStarterScene(presetId: string): StarterScene | null {
  return STARTER_SCENES[presetId] ?? null;
}
