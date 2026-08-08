import { randomUUID } from "node:crypto";
import { cloneCampaign } from "./engine-domain.js";
import type {
  EngineEvent,
  EngineMessage,
  EngineResolution,
  EngineTurnEffectEvidence,
  EngineTurnPlanCommand,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";

export interface StagedEngineTurnEffect {
  tool: EngineTurnPlanCommand["effects"][number]["tool"];
  command: EngineTurnPlanCommand["effects"][number]["command"];
  resolution: EngineResolution;
}

export function compileAtomicTurnResolution(
  initialState: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  stagedEffects: readonly StagedEngineTurnEffect[]
): EngineResolution {
  if (stagedEffects.length === 0) throw new Error("An atomic turn plan needs at least one accepted effect.");

  const evidence = stagedEffects.map(toEffectEvidence);
  const finalEffect = stagedEffects.at(-1);
  if (!finalEffect) throw new Error("The atomic turn plan lost its final effect.");
  const next = cloneCampaign(finalEffect.resolution.state);
  const createdAt = new Date().toISOString();
  const previousMessageIds = new Set(initialState.log.map((message) => message.id));
  const generatedRolls = next.log.filter(
    (message) => !previousMessageIds.has(message.id) && message.kind === "roll"
  );
  const message = evidence.map((effect) => effect.outcome).join(" ");
  const summaryMessage: EngineMessage = {
    id: randomUUID(),
    kind: "narration",
    text: message,
    createdAt,
  };

  next.version = initialState.version + 1;
  next.updatedAt = createdAt;
  next.log = [...initialState.log, ...generatedRolls, summaryMessage].slice(-40);

  const command: EngineTurnPlanCommand = {
    kind: "turn_plan",
    effects: stagedEffects.map((effect) => ({ tool: effect.tool, command: effect.command })),
  };
  const event: EngineEvent = {
    id: randomUUID(),
    kind: "command",
    tool: "turn_plan",
    command,
    effects: evidence,
    accountId: context.accountId,
    campaignId: context.campaignId,
    actorId: context.actorId,
    requestId: context.requestId,
    clientCommandId,
    previousVersion: initialState.version,
    version: next.version,
    rulesVersion: initialState.rulesVersion,
    contentKeys: [...new Set(evidence.flatMap((effect) => effect.contentKeys))].sort(),
    rolls: evidence.flatMap((effect) => effect.rolls),
    modifiers: evidence.flatMap((effect) => effect.modifiers),
    outcome: "atomic_turn_plan",
    stateChanges: evidence.flatMap((effect) => effect.stateChanges),
    createdAt,
  };

  return {
    state: next,
    tool: "turn_plan",
    readOnly: false,
    accepted: true,
    code: null,
    message,
    data: {
      atomic: true,
      effectCount: evidence.length,
      effects: stagedEffects.map((effect, index) => ({
        index,
        tool: effect.tool,
        message: effect.resolution.message,
        data: effect.resolution.data,
      })),
    },
    event,
    narration: { text: message, proposedFacts: [], suggestedActions: [] },
  };
}

export function provisionalState(
  resolution: EngineResolution,
  campaignVersion: number
): LanternCampaignState {
  const state = cloneCampaign(resolution.state);
  state.version = campaignVersion;
  return state;
}

function toEffectEvidence(effect: StagedEngineTurnEffect): EngineTurnEffectEvidence {
  const event = effect.resolution.event;
  if (!effect.resolution.accepted || effect.resolution.readOnly || !event) {
    throw new Error(`Turn-plan effect ${effect.tool} is not an accepted mutating resolution.`);
  }
  return {
    tool: effect.tool,
    command: effect.command,
    contentKeys: [...event.contentKeys],
    rolls: event.rolls.map((roll) => ({ ...roll })),
    modifiers: event.modifiers.map((modifier) => ({ ...modifier })),
    ...(event.adjudication ? { adjudication: event.adjudication } : {}),
    ...(event.check ? { check: event.check } : {}),
    outcome: effect.resolution.message,
    stateChanges: event.stateChanges.map((change) => ({ ...change })),
    data: effect.resolution.data,
  };
}
