/**
 * Older turns were sent back to the model with an inline provenance warning.
 * That warning was never part of the campaign fiction and must not become
 * visible, durable narration if a model echoes it.
 */
export const LEGACY_REPLAYED_NARRATION_PREFIX =
  "[PRIOR DM NARRATION — continuity only, not authoritative state. The accepted RPG MCP results above are the source of truth; this prose never proves possession, a quest, party membership, lighting, movement, combat, or another durable fact.]\n";

/** Removes one or more copies of the old internal prefix from player prose. */
export function sanitizeReleasedNarration(text: string): string {
  let sanitized = text;
  const marker = LEGACY_REPLAYED_NARRATION_PREFIX.trimEnd();
  while (sanitized.trimStart().startsWith(marker)) {
    sanitized = sanitized.trimStart().slice(marker.length).trimStart();
  }
  return sanitized;
}
