export const ABILITY_SCORE_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Preserve the exact score multiset while honoring the field the player just
 * changed. Selecting a score already used to capacity therefore swaps the
 * displaced score into another ability instead of creating an invalid form.
 */
export function reconcileAbilityScoreAssignments(assignments, pool, changedKey) {
  const scores = Array.isArray(pool)
    ? pool.map(Number).filter(Number.isFinite)
    : [];
  if (scores.length !== ABILITY_SCORE_KEYS.length) return {};

  const preferredOrder = ABILITY_SCORE_KEYS.includes(changedKey)
    ? [changedKey].concat(ABILITY_SCORE_KEYS.filter(function (key) { return key !== changedKey; }))
    : ABILITY_SCORE_KEYS.slice();
  const remaining = scores.slice();
  const resolved = {};

  preferredOrder.forEach(function (key) {
    const candidate = Number(assignments && assignments[key]);
    const availableIndex = remaining.findIndex(function (score) { return score === candidate; });
    if (Number.isFinite(candidate) && availableIndex !== -1) {
      resolved[key] = candidate;
      remaining.splice(availableIndex, 1);
    }
  });

  ABILITY_SCORE_KEYS.forEach(function (key) {
    if (resolved[key] === undefined) resolved[key] = remaining.shift();
  });
  return resolved;
}

export function uniqueAbilityScoreOptions(pool) {
  return Array.from(new Set((Array.isArray(pool) ? pool : []).map(Number).filter(Number.isFinite)));
}
