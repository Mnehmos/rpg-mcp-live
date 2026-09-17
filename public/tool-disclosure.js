function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
  });
}

function displayValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function normalizedArguments(call) {
  var value = call && call.arguments;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch (_error) { value = null; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function humanizeToolName(name) {
  return String(name || "world update")
    .replace(/_manage$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
}

function tableMoveLabel(call) {
  var name = String(call && call.name || "").toLowerCase();
  var argumentsValue = normalizedArguments(call);
  var action = String(argumentsValue.action || argumentsValue.kind || "").toLowerCase();
  if (call && call.provenance === "npc_agent") return "A character answered";
  if (/roll|check|combat_action|improvisation/.test(name)) return "Dice and stakes resolved";
  if (name === "session_manage") return action === "advance_time" ? "The clock advanced" : "The session advanced";
  if (name === "spatial_manage") {
    if (/generate|create|establish/.test(action)) return "A place took shape";
    if (/move|position|travel/.test(action)) return "Position changed";
    return "The world found its shape";
  }
  if (name === "scene_manage") return "The scene was framed";
  if (name === "narrative_manage") return "Continuity was anchored";
  if (name === "write_docket") return "The DM kept a note";
  if (name === "inventory_manage") return "Inventory changed";
  if (name === "quest_manage") return "A quest changed";
  if (name === "character_manage") return "Character state changed";
  return humanizeToolName(name) + " resolved";
}

function renderNpcAgentProvenance(call) {
  if (!call || call.provenance !== "npc_agent") return "";
  var result = call.result;
  if (typeof result === "string") {
    try { result = JSON.parse(result); } catch (_error) { result = null; }
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) return "";
  var fields = [
    ["Call ID", result.callId],
    ["Provider", result.provider],
    ["Model", result.model],
    ["Status", result.status],
    ["Prompt tokens", result.promptTokens],
    ["Completion tokens", result.completionTokens],
    ["Duration", result.durationMs == null ? null : String(result.durationMs) + "ms"]
  ].filter(function (entry) { return entry[1] != null && entry[1] !== ""; });
  if (!fields.length) return "";
  var text = fields.map(function (entry) { return entry[0] + ": " + entry[1]; }).join("\n");
  return '<div class="tool-call-section"><span>NPC agent provenance</span><pre>' + escapeHtml(text) + '</pre></div>';
}

export function renderToolDisclosure(disclosure) {
  var calls = disclosure && Array.isArray(disclosure.calls) ? disclosure.calls : [];
  if (!calls.length) return "";
  var acceptedCalls = calls.filter(function (call) { return !(call && call.accepted === false); });
  var revisedCount = calls.length - acceptedCalls.length;
  var labels = acceptedCalls.map(tableMoveLabel);
  var moveSummary = acceptedCalls.length
    ? acceptedCalls.length + " table move" + (acceptedCalls.length === 1 ? "" : "s") + " shaped this moment"
    : "No world changes were committed";
  if (revisedCount) moveSummary += " · " + revisedCount + " draft" + (revisedCount === 1 ? "" : "s") + " revised";
  var callMarkup = calls.map(function (call, index) {
    var name = String(call && call.name || "unknown tool");
    var accepted = !(call && call.accepted === false);
    var status = accepted ? "committed" : "rejected";
    return '<details class="tool-call-entry"><summary><span class="tool-call-name"><strong>' + escapeHtml(tableMoveLabel(call)) + '</strong><code>' + escapeHtml(name) + '</code></span><span class="tool-call-status ' + (status === "committed" ? "is-committed" : "is-rejected") + '">' + escapeHtml(accepted ? "applied" : "revised") + ' · call ' + (index + 1) + '</span></summary>'
      + renderNpcAgentProvenance(call)
      + '<div class="tool-call-section"><span>Arguments</span><pre>' + escapeHtml(displayValue(call && call.arguments || {})) + '</pre></div>'
      + '<div class="tool-call-section"><span>Engine result</span><pre>' + escapeHtml(displayValue(call && call.result)) + '</pre></div>'
      + '</details>';
  }).join("");
  var labelMarkup = labels.length
    ? labels.map(function (label) { return '<span>' + escapeHtml(label) + '</span>'; }).join("")
    : '<span>No committed move</span>';
  return '<details class="table-moves"><summary><span class="table-moves-heading"><span class="table-moves-kicker">AT THE TABLE</span><strong>' + escapeHtml(moveSummary) + '</strong></span><span class="table-move-labels">' + labelMarkup + '</span><span class="table-moves-expand">Details</span></summary>'
    + '<div class="tool-disclosure"><p class="tool-disclosure-warning">⚠ ' + escapeHtml(disclosure.spoilerWarning || "Spoiler warning: behind-the-screen details may reveal hidden game information.") + '</p>'
    + '<p class="tool-disclosure-summary">The fiction above and these authoritative table moves are one DM turn. Expand a move only when you want the technical receipt.</p>'
    + '<div class="tool-call-list">' + callMarkup + '</div></div></details>';
}

export function pairToolDisclosureWithNarration(entries) {
  var source = Array.isArray(entries) ? entries : [];
  var paired = [];
  for (var index = 0; index < source.length; index += 1) {
    var entry = source[index] || {};
    if (entry.toolDisclosure) {
      var next = source[index + 1];
      if (next && String(next.kind || "narration") === "narration" && !next.toolDisclosure) {
        paired.push({ entry: next, toolDisclosure: entry.toolDisclosure, receiptOnly: false });
        index += 1;
      } else {
        paired.push({ entry: entry, toolDisclosure: entry.toolDisclosure, receiptOnly: true });
      }
      continue;
    }
    paired.push({ entry: entry, toolDisclosure: null, receiptOnly: false });
  }
  return paired;
}
