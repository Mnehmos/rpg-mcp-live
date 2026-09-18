function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
  });
}

function named(value, fallback) {
  var normalized = String(value || "").trim();
  return normalized || fallback;
}

export function openingPresenceCopy(session, snapshot) {
  var current = snapshot || {};
  var campaign = session && session.campaign || current.campaign || {};
  var character = session && session.character || current.character || {};
  var campaignName = named(campaign.name, "this campaign");
  var setting = named(campaign.setting, campaignName);
  var characterName = named(character.name, "your character");
  return {
    inference: "The DM is reading " + characterName + " against " + setting + " and choosing the first pressure that will make both matter.",
    steps: [
      "Reading " + characterName,
      "Finding pressure in " + setting,
      "Opening on a real choice",
    ],
  };
}

export function renderOpeningPresence(session, snapshot, mode) {
  var failed = mode === "error";
  var copy = openingPresenceCopy(session, snapshot);
  if (failed) {
    return '<div class="log-entry narration dm-response dm-presence is-error" data-opening-state="error" role="status"><span class="log-icon">DM</span><div class="log-content"><p class="dm-presence-kicker">THE OPENING PAUSED</p><p class="dm-presence-inference">The first scene did not arrive. The table is still here, and the DM can take another run at it.</p><button class="button button-quiet opening-retry" type="button" data-opening-retry>Try the opening again <span>↗</span></button></div></div>';
  }
  var steps = copy.steps.map(function (step, index) {
    return '<li style="--step:' + index + '"><span aria-hidden="true"></span>' + escapeHtml(step) + '</li>';
  }).join("");
  return '<div class="log-entry narration dm-response dm-presence" data-opening-state="thinking" role="status" aria-label="The DM is opening your first scene"><span class="log-icon">DM</span><div class="log-content"><p class="dm-presence-kicker"><span class="dm-presence-pulse" aria-hidden="true"></span>THE DM IS THINKING</p><p class="dm-presence-inference">' + escapeHtml(copy.inference) + '</p><ol class="dm-presence-steps">' + steps + '</ol><p class="dm-presence-activity" data-presence-live aria-live="polite">Getting started…</p><p class="dm-presence-note">First scenes take longer than later turns: the DM is building the world&mdash;people, places, and stakes&mdash;before anything is written. This is a quick read, not campaign history; the finished scene replaces it when the table commits.</p></div></div>';
}

/**
 * Updates the live activity line in an already-rendered opening presence
 * panel in place, so a real tool-call status (from the server's onProgress
 * stream) doesn't require re-rendering the whole log and losing scroll
 * position or the in-progress narration node.
 */
export function updateOpeningPresenceActivity(message) {
  var node = document.querySelector('[data-opening-state="thinking"] [data-presence-live]');
  if (node && message) node.textContent = message;
}
