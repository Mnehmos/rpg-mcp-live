import type { ReferenceTurnResult } from "./reference-engine-dm.js";

export type CompletedTurnKind = "turn" | "opening";

/**
 * One structured line per completed DM turn. Failures were already logged
 * (streamed_turn_failed); without this line, real play was invisible in the
 * service logs. Carries no player text or narration.
 */
export function turnCompletedLogLine(
  kind: CompletedTurnKind,
  userId: string,
  plan: string,
  result: ReferenceTurnResult,
  durationMs: number,
  streamed: boolean,
): string {
  return JSON.stringify({
    event: "turn_completed",
    kind,
    userId,
    plan,
    campaignId: result.campaignId,
    campaignVersion: result.campaignVersion,
    replayed: result.replayed,
    streamed,
    durationMs: Math.max(0, Math.round(durationMs)),
    costUsd: result.turnUsage?.costUsd ?? null,
    providerCalls: result.diagnostics?.providerCalls ?? result.turnUsage?.calls ?? null,
    toolRounds: result.diagnostics?.toolRounds ?? null,
    stateChanges: result.diagnostics?.acceptedStateChangingToolCalls ?? null,
  });
}
