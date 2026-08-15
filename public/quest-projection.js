const VISIBLE_QUEST_STATUSES = new Set(["active", "completed", "failed", "abandoned", "expired"]);

export function visibleQuestEntries(quests) {
  return (Array.isArray(quests) ? quests : [])
    .filter((quest) => quest && VISIBLE_QUEST_STATUSES.has(String(quest.status || "active")));
}

export function questProgress(quest) {
  if (quest && quest.status === "completed") return 100;
  const value = Number(quest && quest.progress);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.trunc(value))) : 0;
}

export function questStatusLabel(status) {
  const value = String(status || "active");
  return value.charAt(0).toUpperCase() + value.slice(1);
}
