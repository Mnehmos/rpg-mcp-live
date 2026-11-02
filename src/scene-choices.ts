import type { StoredLogMessage } from "./reference-engine-store.js";

/**
 * Choose-your-own-adventure choices for the foot of each DM turn. A cheap,
 * fast model reads the scene the DM just narrated and offers a few concrete
 * ways forward. They are suggestions only: the player can always type
 * anything, and nothing here touches the world.
 */
export interface SceneChoice {
  label: string;
  prompt: string;
}

export const SCENE_CHOICES_SYSTEM_PROMPT = [
  "You write the choices at the foot of a choose-your-own-adventure page for a tabletop RPG.",
  "Read the scene and offer 3 or 4 distinct things the player's character could do next.",
  "Ground every choice in a specific person, object, place, or threat the scene names. Vary them: something bold, something careful or investigative, and something social or clever when the scene allows.",
  "Never decide outcomes, never add facts the scene does not establish, and never speak as the DM.",
  "label: 2 to 5 words, an imperative the player taps (e.g. \"Follow the cliff path\").",
  "prompt: one first-person sentence the player sends as their turn (e.g. \"I follow the boot prints down the cliff path before the tide rises.\").",
  "Return only JSON: {\"choices\":[{\"label\":\"...\",\"prompt\":\"...\"}]}",
].join("\n");

/** Recent play gives the choices continuity; the latest narration is the page they belong to. */
const RECENT_ENTRIES = 6;

export function buildSceneChoicesMessages(
  priorLog: StoredLogMessage[],
  playerText: string,
  narrationText: string,
): Array<{ role: "system" | "user"; content: string }> {
  const recent = priorLog
    .filter((entry) => entry.kind === "player" || entry.kind === "narration")
    .slice(-RECENT_ENTRIES)
    .map((entry) => `${entry.kind === "player" ? "PLAYER" : "DM"}: ${entry.text}`);
  const scene = [
    ...(recent.length ? ["EARLIER:", ...recent, ""] : []),
    `PLAYER: ${playerText}`,
    "",
    `DM (the scene to choose from): ${narrationText}`,
  ].join("\n");
  return [
    { role: "system", content: SCENE_CHOICES_SYSTEM_PROMPT },
    { role: "user", content: scene },
  ];
}

/** Accepts the JSON object, a bare array, or either wrapped in prose or a code fence. */
export function parseSceneChoices(content: string | null | undefined): SceneChoice[] {
  const text = String(content ?? "");
  const start = text.search(/[[{]/);
  if (start === -1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")) + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { choices?: unknown }).choices)
      ? (parsed as { choices: unknown[] }).choices
      : [];
  const seen = new Set<string>();
  const choices: SceneChoice[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "").trim();
    const prompt = String((item as { prompt?: unknown }).prompt ?? "").trim();
    if (!label || !prompt || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    choices.push({ label, prompt });
  }
  return choices;
}

/** "a, b" -> ["a", "b"]; empty means the feature is off. */
export function parseChoicesModels(value: string): string[] {
  return value.split(",").map((model) => model.trim()).filter(Boolean);
}
