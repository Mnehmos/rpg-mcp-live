export function isStaleCommandStatus(status) {
  if (!status || status.status !== "resolved" || !status.result || !status.result.session) return false;
  var currentVersion = Number(status.campaignVersion);
  var resultVersion = Number(status.result.session.version);
  return Number.isFinite(currentVersion) && Number.isFinite(resultVersion) && resultVersion < currentVersion;
}

export function commandFailureType(payload, status) {
  if (payload?.failureType) return payload.failureType;
  if (payload?.code === "llm_usage_limit_exceeded" || status === 429) return "usage_limit";
  if (payload?.commitStatus === "not_committed") return "not_committed";
  if (payload?.commitStatus === "uncertain") return "uncertain";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}

export function commandFailureMessage(payload, status) {
  const type = commandFailureType(payload, status);
  if (type === "usage_limit") {
    if (payload?.period === "global_daily" || payload?.period === "global_monthly") {
      const period = payload.period === "global_daily" ? "today" : "this month";
      return `Quest Keeper has reached its service-wide usage limit for ${period}. Your campaign is safe; this turn was not committed.`;
    }
    const period = payload?.period === "daily" || payload?.period === "global_daily" ? "today" : "this month";
    const plan = payload?.usage?.plan === "player_pass" ? "Player Pass" : "free play";
    return `Your ${plan} limit for ${period} has been reached. Your campaign is safe; this turn was not committed.`;
  }
  if (type === "not_committed") {
    return "The Dungeon Master could not finish this turn. No game state changed, so you can safely try again.";
  }
  if (type === "uncertain") {
    return "The table is checking whether this turn committed. Your campaign is protected; wait for the table status before retrying.";
  }
  if (type === "provider_unavailable") {
    return "The Dungeon Master service is temporarily unavailable. Your campaign was not confirmed changed; try again shortly.";
  }
  if (payload && typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return "The table could not confirm this turn. Your campaign is protected; check the table status before retrying.";
}
