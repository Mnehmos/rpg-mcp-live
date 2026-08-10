export function activeCampaignStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim();
  return `lantern.activeCampaignId.${normalizedUserId || "anonymous"}`;
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

