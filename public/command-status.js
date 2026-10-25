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
  const reason = payload?.reason;
  if ((reason === "provider_auth" || reason === "provider_credit") && payload?.commitStatus === "not_committed") {
    return "The Dungeon Master is offline on our side right now. Your campaign is safe and this turn was not committed; try again later.";
  }
  if ((reason === "capacity" || type === "capacity") && payload?.commitStatus !== "uncertain" && type !== "uncertain") {
    return "The table is busy right now. This turn was not committed; send it again in a moment.";
  }
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

/**
 * The HTTP status a streamed failure stands for, matching what the buffered
 * route sends: an uncertain turn always goes to reconciliation (502), a clean
 * quota or capacity refusal is a 429, anything else a 502.
 */
export function streamedFailureStatus(envelope) {
  if (envelope?.commitStatus === "uncertain" || envelope?.failureType === "uncertain") return 502;
  if (envelope?.failureType === "usage_limit" || envelope?.failureType === "capacity") return 429;
  return 502;
}
