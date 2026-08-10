import type { EngineCommand } from "./engine-contracts.js";

export type PlayerIntentClauseKind =
  | "movement"
  | "search"
  | "question"
  | "observation"
  | "interaction"
  | "other";

export interface PlayerIntentClause {
  id: string;
  text: string;
  kind: PlayerIntentClauseKind;
}

interface PlannedEffect {
  command: EngineCommand;
}

interface DraftBeat {
  kind: "establishing" | "sensory" | "npc" | "dialogue" | "mechanical" | "consequence" | "question";
}

const ACTION_VERBS = [
  "approach",
  "ask",
  "attack",
  "break",
  "cast",
  "check",
  "climb",
  "close",
  "create",
  "cross",
  "deceive",
  "distract",
  "enter",
  "examine",
  "follow",
  "go",
  "head",
  "inspect",
  "investigate",
  "leave",
  "listen",
  "look",
  "move",
  "observe",
  "open",
  "question",
  "read",
  "run",
  "search",
  "signal",
  "slip",
  "speak",
  "study",
  "take",
  "talk",
  "tell",
  "touch",
  "travel",
  "use",
  "walk",
  "warn",
  "watch",
] as const;

const ACTION_SPLIT = new RegExp(
  String.raw`\s*,?\s+and\s+(?=(?:I\s+)?(?:(?:carefully|closely|explicitly|immediately|quietly|quickly|then)\s+)*(?:${ACTION_VERBS.join("|")})\b)`,
  "i",
);
const QUESTION_SPLIT = /\s*,\s*(?=(?:what|when|where|who|whom|whose|why|how|whether)\b)|\s+and\s+(?=(?:what|when|where|who|whom|whose|why|how|whether)\b)/i;

/**
 * Derive only the coarse clauses needed to prevent a compound turn from being
 * reduced to one convenient sub-action. This is deliberately not a general
 * natural-language parser: the model still interprets intent and the engine
 * only checks that obvious coordinated clauses survive the plan boundary.
 */
export function derivePlayerIntentClauses(playerText: string): PlayerIntentClause[] {
  const normalized = playerText.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const clauses: string[] = [];
  for (const sentence of normalized.split(/\s*;\s*|(?<=[.!?])\s+/)) {
    for (const sequenced of sentence.split(/\s*,?\s+then\s+/i)) {
      const coordinated = sequenced.split(ACTION_SPLIT);
      for (const part of coordinated) {
        const questionParts = /\b(?:ask|question|inquire)\b/i.test(part)
          ? part.split(QUESTION_SPLIT)
          : [part];
        for (const questionPart of questionParts) {
          const text = questionPart
            .replace(/^\s*(?:and|then)\s+/i, "")
            .replace(/[,;.!?]+$/g, "")
            .trim();
          if (text) clauses.push(text);
        }
      }
    }
  }

  return clauses.slice(0, 8).map((text, index) => ({
    id: `intent-${index + 1}`,
    text,
    kind: classifyClause(text),
  }));
}

/** Clauses whose authoritative consequence is absent from a compound plan. */
export function uncoveredPlanClauses(
  clauses: readonly PlayerIntentClause[],
  effects: readonly PlannedEffect[],
): PlayerIntentClause[] {
  if (clauses.length < 2) return [];

  const hasMovement = effects.some(({ command }) =>
    command.kind === "move"
    || command.kind === "travel"
    || command.kind === "combat_move"
    || command.kind === "world_context"
  );
  const hasSearch = effects.some(({ command }) =>
    command.kind === "challenge_attempt"
    || command.kind === "situation_clue_attempt"
    || command.kind === "world_context"
    || (command.kind === "interact" && command.affordance === "inspect")
    || (command.kind === "improvise" && command.effectType === "fictional")
  );
  const hasInteraction = effects.some(({ command }) =>
    command.kind !== "move"
    && command.kind !== "travel"
    && command.kind !== "combat_move"
    && command.kind !== "world_context"
  );

  return clauses.filter((clause) => {
    switch (clause.kind) {
      case "movement":
        return !hasMovement;
      case "search":
        return !hasSearch;
      case "interaction":
        return !hasInteraction;
      case "question":
      case "observation":
      case "other":
        return false;
    }
  });
}

/**
 * Match each ordered clause to a distinct compatible public beat. The text is
 * still model-authored; this check only prevents an entire question, search,
 * movement, or interaction clause from disappearing into a generic recap.
 */
export function uncoveredNarrationClauses(
  clauses: readonly PlayerIntentClause[],
  beats: readonly DraftBeat[],
): PlayerIntentClause[] {
  if (clauses.length < 2) return [];

  const missing: PlayerIntentClause[] = [];
  let nextBeatIndex = 0;
  const requiredClauses = clauses.filter((clause, index) =>
    clause.kind === "question"
    || index === 0
    || clauses[index - 1]?.kind !== clause.kind
  );
  for (const clause of requiredClauses) {
    const relativeIndex = beats
      .slice(nextBeatIndex)
      .findIndex((beat) => beatCoversClause(beat.kind, clause.kind));
    if (relativeIndex < 0) {
      missing.push(clause);
      continue;
    }
    nextBeatIndex += relativeIndex + 1;
  }
  return missing;
}

function classifyClause(text: string): PlayerIntentClauseKind {
  if (/^\s*(?:what|when|where|who|whom|whose|why|how|whether)\b|\b(?:ask|question|inquire)\b/i.test(text)) {
    return "question";
  }
  if (/\b(?:search|investigate|inspect|examine|look\s+for|check\s+(?:the\s+)?\w+\s+for|read|study)\b/i.test(text)) {
    return "search";
  }
  if (/\b(?:watch|observe|listen|look\s+at|keep\s+an\s+eye)\b/i.test(text)) {
    return "observation";
  }
  if (/\b(?:signal|distract|decoy|divert|misdirect|deceive|speak|talk|tell|warn|persuade|open|close|take|use|touch|attack|cast|break|create)\b/i.test(text)) {
    return "interaction";
  }
  if (/\b(?:enter|go|move|walk|run|climb|slip|approach|leave|follow|travel|head|cross)\b/i.test(text)) {
    return "movement";
  }
  return "other";
}

function beatCoversClause(beatKind: DraftBeat["kind"], clauseKind: PlayerIntentClauseKind): boolean {
  switch (clauseKind) {
    case "movement":
      return beatKind === "establishing" || beatKind === "sensory" || beatKind === "consequence";
    case "search":
      return beatKind === "sensory" || beatKind === "mechanical" || beatKind === "consequence";
    case "question":
      return beatKind === "dialogue" || beatKind === "npc";
    case "observation":
      return beatKind === "sensory" || beatKind === "npc" || beatKind === "dialogue";
    case "interaction":
      return beatKind === "mechanical" || beatKind === "consequence" || beatKind === "npc" || beatKind === "dialogue";
    case "other":
      return beatKind !== "question";
  }
}
