/**
 * One structured line per DM tool call. We care about what changed — the
 * action, whether the engine accepted it, and outcome fields such as a roll,
 * hit/miss, DC, damage or HP — not the full payload. Result size is recorded
 * so oversized results (anything the history replay would truncate) show up.
 */

const OUTCOME_KEY = /^(success|accepted|hit|miss|critical|crit|passed|result|outcome|roll|rolls|total|natural|dc|ac|damage|damagetype|healing|hp|hpbefore|hpafter|currenthp|maxhp|tempHp|conditions?|status|winner|level|xp|quantity|gold|state)$/i;
const MAX_OUTCOME_FIELDS = 16;
const MAX_DEPTH = 3;
const MAX_STRING = 60;

export const REPLAY_RESULT_CHARACTER_LIMIT = 4_000;

export interface ToolCallLogInput {
  userId: string;
  campaignId: string;
  name: string;
  args: Record<string, unknown>;
  accepted: boolean;
  stateChanging: boolean;
  resultText: string;
  payload: unknown;
  durationMs: number;
}

function collectOutcome(value: unknown, path: string, depth: number, out: Record<string, unknown>): void {
  if (Object.keys(out).length >= MAX_OUTCOME_FIELDS || depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    value.slice(0, 4).forEach((item, index) => collectOutcome(item, `${path}[${index}]`, depth + 1, out));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_OUTCOME_FIELDS) return;
    const childPath = path ? `${path}.${key}` : key;
    const primitive = typeof child === "number" || typeof child === "boolean"
      || (typeof child === "string" && child.length <= MAX_STRING);
    if (primitive && OUTCOME_KEY.test(key)) out[childPath] = child;
    else if (child && typeof child === "object") collectOutcome(child, childPath, depth + 1, out);
  }
}

export function toolCallOutcome(payload: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  collectOutcome(payload, "", 0, out);
  return out;
}

export function toolCallLogLine(input: ToolCallLogInput): string {
  const action = input.args.action ?? input.args.kind ?? null;
  return JSON.stringify({
    event: "tool_call",
    userId: input.userId,
    campaignId: input.campaignId,
    name: input.name,
    action: typeof action === "string" ? action : null,
    accepted: input.accepted,
    stateChanging: input.stateChanging,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    resultChars: input.resultText.length,
    exceedsReplayLimit: input.resultText.length > REPLAY_RESULT_CHARACTER_LIMIT,
    outcome: toolCallOutcome(input.payload),
  });
}
