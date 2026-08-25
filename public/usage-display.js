const clampPercent = (value) => Math.min(100, Math.max(0, Math.round(value)));

export function usagePercent(summary) {
  const usedMicros = Number(summary?.monthly?.costMicros ?? 0);
  const targetMicros = Number(
    summary?.targets?.monthly?.costMicros ?? summary?.limits?.monthly?.costMicros ?? 0,
  );

  if (!Number.isFinite(usedMicros) || !Number.isFinite(targetMicros) || targetMicros <= 0) {
    return null;
  }

  return clampPercent((Math.max(0, usedMicros) / targetMicros) * 100);
}

export function usageLabel(summary) {
  const percent = usagePercent(summary);
  if (percent === null) return "";

  const plan = summary?.plan === "player_pass" ? "PLAYER PASS" : "FREE";
  return `${plan} · USAGE ${percent}% USED`;
}
