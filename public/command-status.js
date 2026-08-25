export function isStaleCommandStatus(status) {
  if (!status || status.status !== "resolved" || !status.result || !status.result.session) return false;
  var currentVersion = Number(status.campaignVersion);
  var resultVersion = Number(status.result.session.version);
  return Number.isFinite(currentVersion) && Number.isFinite(resultVersion) && resultVersion < currentVersion;
}

export function commandFailureMessage(payload) {
  if (payload && typeof payload.error === "string" && payload.error.trim()) return payload.error;
  if (payload && payload.commitStatus === "not_committed") {
    return "The DM provider did not return a result; no game state was committed. Your action is safe to retry.";
  }
  return "The server could not prove whether this turn committed; refresh the table before continuing.";
}
