export function activeCampaignStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  return `lantern.activeCampaignId.${normalizedUserId || "anonymous"}`;
}

export function pendingCommandStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  return `lantern.pendingCommand.${normalizedUserId || "anonymous"}`;
}

export function normalizePendingCommandRecord(record) {
  const campaignId = String(record?.campaignId || "").trim();
  const clientCommandId = String(record?.clientCommandId || "").trim();
  if (!campaignId || !clientCommandId) return null;
  return {
    campaignId,
    clientCommandId,
    playerText: String(record.playerText || ""),
    status: record.status === "uncertain" ? "uncertain" : "processing",
  };
}

/**
 * Read both the pre-#265 single-record format and the durable per-campaign
 * format. The browser may switch campaigns while another campaign's command
 * is reconciling, so storage cannot be a single global lease.
 */
export function pendingCommandRecordsFromValue(value) {
  if (!value) return [];
  var candidates = [];
  if (Array.isArray(value)) candidates = value;
  else if (Array.isArray(value.commands)) candidates = value.commands;
  else if (value.commands && typeof value.commands === "object") candidates = Object.values(value.commands);
  else candidates = [value];

  var byCampaign = new Map();
  candidates.forEach(function (candidate) {
    var normalized = normalizePendingCommandRecord(candidate);
    if (normalized) byCampaign.set(normalized.campaignId, normalized);
  });
  return Array.from(byCampaign.values());
}

export function pendingCommandStorageValue(records) {
  return {
    version: 2,
    commands: pendingCommandRecordsFromValue(records),
  };
}

export function isPendingCommandForCampaign(record, campaignId) {
  const normalizedCampaignId = String(campaignId || "").trim();
  const normalizedRecordCampaignId = String(record?.campaignId || "").trim();
  const normalizedCommandId = String(record?.clientCommandId || "").trim();
  return Boolean(normalizedCampaignId && normalizedRecordCampaignId === normalizedCampaignId && normalizedCommandId);
}

export function isPendingCommandForRequest(record, campaignId, clientCommandId) {
  const normalizedCommandId = String(clientCommandId || "").trim();
  return Boolean(normalizedCommandId && isPendingCommandForCampaign(record, campaignId)
    && String(record.clientCommandId).trim() === normalizedCommandId);
}

export function isPendingCommandConflict(record, campaignId, clientCommandId) {
  if (!record || !record.campaignId || !record.clientCommandId) return false;
  return !isPendingCommandForRequest(record, campaignId, clientCommandId);
}

export function isPendingCommandResponseCurrent(record, campaignId, clientCommandId) {
  return !record || isPendingCommandForRequest(record, campaignId, clientCommandId);
}

export function campaignSessionUrl(campaignId) {
  const normalizedCampaignId = String(campaignId || "").trim();
  return normalizedCampaignId
    ? "/api/session?campaignId=" + encodeURIComponent(normalizedCampaignId)
    : "/api/session";
}

export function shouldRetryCampaignLoad(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function retryDelayMs(attempt) {
  const normalizedAttempt = Math.max(1, Number(attempt) || 1);
  return 400 * normalizedAttempt;
}

export function nextRequestSequence(currentSequence) {
  const normalizedSequence = Number(currentSequence);
  return (Number.isFinite(normalizedSequence) ? normalizedSequence : 0) + 1;
}

export function isCurrentRequest(requestSequence, currentSequence) {
  return requestSequence === currentSequence;
}

export function isCurrentCampaignSelection(campaignId, selectedCampaignId) {
  const normalizedCampaignId = String(campaignId || "").trim();
  const normalizedSelectedCampaignId = String(selectedCampaignId || "").trim();
  return Boolean(normalizedCampaignId) && normalizedCampaignId === normalizedSelectedCampaignId;
}

export function isConfirmedMissingCommand(status, code) {
  return status === 404 && code === "command_not_found";
}

