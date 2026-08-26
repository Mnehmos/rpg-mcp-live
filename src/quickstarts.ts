export interface QuickstartPreset {
  id: string;
  title: string;
  tagline: string;
  description: string;
  campaign: {
    name: string;
    premise: string;
    setting: string;
    tone: string;
  };
  character: {
    name: string;
    species: string;
    className: string;
    background: string;
    alignment: string;
    abilityScores: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>;
  };
}

const QUICKSTART_PRESETS: readonly QuickstartPreset[] = [
  {
    id: "salt-road",
    title: "The Salt Road",
    tagline: "A missing courier. One night before the tide turns.",
    description: "A grounded mystery on a dangerous coast. Start as Mara Venn, a capable human rogue.",
    campaign: {
      name: "The Salt Road",
      premise: "A courier vanished on the salt road, carrying a sealed letter that several powerful people want found.",
      setting: "A storm-worn coastal trade road",
      tone: "Mysterious",
    },
    character: {
      name: "Mara Venn",
      species: "human",
      className: "rogue",
      background: "Urchin",
      alignment: "Chaotic Good",
      abilityScores: { str: 10, dex: 15, con: 13, int: 14, wis: 12, cha: 8 },
    },
  },
  {
    id: "ember-watch",
    title: "The Ember Watch",
    tagline: "The old lighthouse is burning in a dead calm.",
    description: "A fast-moving rescue story. Start as Tovin Ash, a human fighter ready to act.",
    campaign: {
      name: "The Ember Watch",
      premise: "A lighthouse burns without flame while fishermen disappear from a harbor that has not seen wind in three days.",
      setting: "A fogbound harbor beneath an abandoned lighthouse",
      tone: "Adventurous",
    },
    character: {
      name: "Tovin Ash",
      species: "human",
      className: "fighter",
      background: "Soldier",
      alignment: "Lawful Good",
      abilityScores: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 },
    },
  },
  {
    id: "glass-under-moon",
    title: "Glass Under Moonlight",
    tagline: "Something beneath the city is answering the bells.",
    description: "A strange arcane investigation. Start as Elian Vale, an elven wizard with questions.",
    campaign: {
      name: "Glass Under Moonlight",
      premise: "Every midnight, the city bells ring once from below the streets, and every pane of glass remembers a different night.",
      setting: "An old river city built over buried ruins",
      tone: "Mysterious",
    },
    character: {
      name: "Elian Vale",
      species: "elf",
      className: "wizard",
      background: "Sage",
      alignment: "Neutral Good",
      abilityScores: { str: 8, dex: 14, con: 12, int: 15, wis: 13, cha: 10 },
    },
  },
];

export function listQuickstartPresets(): Array<Pick<QuickstartPreset, "id" | "title" | "tagline" | "description">> {
  return QUICKSTART_PRESETS.map(({ id, title, tagline, description }) => ({ id, title, tagline, description }));
}

export function getQuickstartPreset(id: string): QuickstartPreset | null {
  return QUICKSTART_PRESETS.find((preset) => preset.id === id) ?? null;
}
