export function composerSubmission(previous, campaignId, playerText, createCommandId) {
  var text = playerText.trim();
  if (previous && previous.campaignId === campaignId && previous.playerText === text) return previous;
  return { campaignId: campaignId, playerText: text, clientCommandId: createCommandId() };
}

export function updateComposerCounter(input, counter) {
  if (input && counter) counter.textContent = input.value.length + " / " + input.maxLength;
}

export function settleComposer(input, counter, sent) {
  if (!sent) return false;
  input.value = "";
  updateComposerCounter(input, counter);
  return true;
}
