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
  return '<div class="log-entry narration dm-response dm-presence" data-opening-state="thinking" role="status" aria-label="The DM is opening your first scene"><span class="log-icon">DM</span><div class="log-content"><p class="dm-presence-kicker"><span class="dm-presence-pulse" aria-hidden="true"></span>THE DM IS THINKING</p><p class="dm-presence-inference">' + escapeHtml(copy.inference) + '</p><ol class="dm-presence-steps">' + steps + '</ol><p class="dm-presence-note">This is a quick read, not campaign history. The finished scene replaces it when the table commits.</p></div></div>';
}

/** The server sends this as the "player" line of the opening turn; it is not something the player said. */
export var OPENING_INSTRUCTION = "Open the first situation and establish the campaign's opening scene.";
/** Start of the instruction that asks the DM to personalize a quickstart's starter scene. */
export var PERSONALIZE_OPENING_PREFIX = "Personalize the opening scene.";

/**
 * Log entries a player should see. The opening instruction stays in the
 * stored log (it anchors the DM's replayed history) but is never shown as a
 * YOU line, and the campaign-created placeholder drops away once the DM has
 * narrated.
 */
export function visibleLogEntries(entries) {
  var list = Array.isArray(entries) ? entries : [];
  var narrated = list.some(function (entry) { return Boolean(entry) && entry.kind === "narration"; });
  // The DM's personalized opening (the narration answering the personalize
  // instruction) replaces the template. Any other later narration, such as a
  // player's first turn after a failed personalization, leaves it in place.
  var personalized = list.some(function (entry, index) {
    return Boolean(entry) && entry.kind === "narration" && !entry.starter
      && list.slice(0, index).some(function (earlier) {
        return Boolean(earlier) && earlier.kind === "player" && String(earlier.text || "").trim().indexOf(PERSONALIZE_OPENING_PREFIX) === 0;
      });
  });
  return list.filter(function (entry) {
    return Boolean(entry) && !isOpeningInstruction(entry) && !(narrated && isCampaignCreatedNotice(entry))
      && !(personalized && entry.starter);
  });
}

function isOpeningInstruction(entry) {
  var text = String(entry.text || "").trim();
  return entry.kind === "player" && (text === OPENING_INSTRUCTION || text.indexOf(PERSONALIZE_OPENING_PREFIX) === 0);
}

function isCampaignCreatedNotice(entry) {
  return entry.kind === "system" && /^Campaign created\./.test(String(entry.text || ""));
}
