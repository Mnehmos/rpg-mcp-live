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

