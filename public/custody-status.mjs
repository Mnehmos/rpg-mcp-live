/**
 * Stable browser projection for server-owned custody.  It intentionally reads
 * only the session projection; narration cannot create a row here.
 */
export function projectCustodyActors(session) {
  var rows = [];
  var add = function (actor, kind) {
    if (!actor || !actor.custody || typeof actor.custody !== "object") return;
    rows.push({
      id: actor.id || actor.custody.actorId,
      name: actor.name || actor.id || "Unknown actor",
      kind: kind,
      status: actor.custody.status,
      sourceGuardId: actor.custody.sourceGuardId,
      locationRef: actor.custody.locationRef,
      groupId: actor.custody.groupId,
    });
  };
  add(session && session.character, "player");
  var worldContext = session && session.worldContext;
  (worldContext && Array.isArray(worldContext.npcs) ? worldContext.npcs : []).forEach(function (npc) { add(npc, "npc"); });
  (session && Array.isArray(session.controlledActors) ? session.controlledActors : []).forEach(function (actor) { add(actor, "controlled"); });
  return rows;
}
