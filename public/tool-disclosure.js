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

export function renderToolDisclosure(disclosure) {
  var calls = disclosure && Array.isArray(disclosure.calls) ? disclosure.calls : [];
  if (!calls.length) return "";
  var names = calls.map(function (call) { return String(call && call.name || "unknown tool"); });
  var callMarkup = calls.map(function (call, index) {
    var name = String(call && call.name || "unknown tool");
    var status = call && call.accepted === false ? "rejected" : "committed";
    return '<details class="tool-call-entry"><summary><code>' + escapeHtml(name) + '</code><span class="tool-call-status ' + (status === "committed" ? "is-committed" : "is-rejected") + '">' + escapeHtml(status) + ' · call ' + (index + 1) + '</span></summary>'
      + '<div class="tool-call-section"><span>Arguments</span><pre>' + escapeHtml(displayValue(call && call.arguments || {})) + '</pre></div>'
      + '<div class="tool-call-section"><span>Engine result</span><pre>' + escapeHtml(displayValue(call && call.result)) + '</pre></div>'
      + '</details>';
  }).join("");
  return '<div class="tool-disclosure"><p class="tool-disclosure-warning">⚠ ' + escapeHtml(disclosure.spoilerWarning || "Spoiler warning: these DM tool calls may reveal hidden game details.") + '</p>'
    + '<p class="tool-disclosure-summary">DM tool activity: <strong>' + escapeHtml(names.join(", ")) + '</strong>. Click a call to inspect its arguments and engine result.</p>'
    + '<div class="tool-call-list">' + callMarkup + '</div></div>';
}
