export function isStaleCommandStatus(status) {
  if (!status || status.status !== "resolved" || !status.result || !status.result.session) return false;
  var currentVersion = Number(status.campaignVersion);
  var resultVersion = Number(status.result.session.version);
  return Number.isFinite(currentVersion) && Number.isFinite(resultVersion) && resultVersion < currentVersion;
}
