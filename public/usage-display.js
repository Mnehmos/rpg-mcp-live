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

function exhaustedPeriod(summary) {
  const dailyUsed = Number(summary?.daily?.costMicros ?? 0);
  const dailyLimit = Number(summary?.limits?.daily?.costMicros ?? 0);
  const monthlyUsed = Number(summary?.monthly?.costMicros ?? 0);
  const monthlyLimit = Number(summary?.limits?.monthly?.costMicros ?? 0);

  if (Number.isFinite(dailyUsed) && Number.isFinite(dailyLimit) && dailyLimit > 0 && dailyUsed >= dailyLimit) {
    return "daily";
  }
  if (Number.isFinite(monthlyUsed) && Number.isFinite(monthlyLimit) && monthlyLimit > 0 && monthlyUsed >= monthlyLimit) {
    return "monthly";
  }
  return "daily";
}

export function usageResetAt(summary) {
  const period = exhaustedPeriod(summary);
  const resetAt = summary?.resetsAt?.[period];
  return typeof resetAt === "string" ? resetAt : "";
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  if (minutes > 0) return `${minutes}M ${seconds}S`;
  return `${seconds}S`;
}

export function usageResetLabel(summary, now = new Date()) {
  const resetAt = usageResetAt(summary);
  const resetTimestamp = Date.parse(resetAt);
  if (!Number.isFinite(resetTimestamp)) return "";
  if (resetTimestamp <= now.getTime()) return "";

  const dailyUsed = Number(summary?.daily?.costMicros ?? 0);
  const dailyLimit = Number(summary?.limits?.daily?.costMicros ?? 0);
  const monthlyUsed = Number(summary?.monthly?.costMicros ?? 0);
  const monthlyLimit = Number(summary?.limits?.monthly?.costMicros ?? 0);
  const exhausted = (
    (Number.isFinite(dailyUsed) && Number.isFinite(dailyLimit) && dailyLimit > 0 && dailyUsed >= dailyLimit)
    || (Number.isFinite(monthlyUsed) && Number.isFinite(monthlyLimit) && monthlyLimit > 0 && monthlyUsed >= monthlyLimit)
  );
  const prefix = exhausted && summary?.plan === "free" ? "FREE PLAY IN" : "NEXT RESET IN";
  return `${prefix} ${formatDuration(resetTimestamp - now.getTime())}`;
}
