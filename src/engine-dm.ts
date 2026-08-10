import {
  narrationEnvelopeJsonSchema,
  narrationEnvelopeSchema,
  type NarrationEnvelope,
} from "./ai-contracts.js";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { Open5eContentResolver } from "./content/resolve.js";
import {
  cloneCampaign,
  actorKnowledgeProjection,
  deriveActionOffers,
  projectExperienceProfile,
  projectStateForActor,
  projectResolutionForActor,
  resolveEngineCommand,
  sanitizeNarrationForProfile,
} from "./engine-domain.js";
import { hasActiveCondition } from "./engine-effects.js";
import { projectSituationForActor } from "./engine-situations.js";
import {
  compileAtomicTurnResolution,
  provisionalState,
  type StagedEngineTurnEffect,
} from "./engine-turn-plan.js";
import { materializeInventoryItem } from "./open5e-rules.js";
import type {
  EngineCommand,
  EngineCommandResult,
  EngineSocialCheckAttribution,
  EngineToolName,
  EngineToolResult,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";
import {
  commandForTool,
  executeReadTool,
  isEngineToolName,
  lanternToolDefinitions,
  parseToolArguments,
} from "./engine-tools.js";
import {
  EngineCommandIdReuseError,
  EngineCommandInProgressError,
  LanternEngineStore,
} from "./engine-store.js";
import type { OpenRouterCompletionTelemetry, OpenRouterOptions } from "./openrouter.js";
import type { ModelUsagePurpose, ModelUsageStatus } from "./usage-ledger.js";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface CompletionMessage {
  role?: "assistant";
  content?: unknown;
  tool_calls?: ToolCall[];
  [key: string]: unknown;
}

interface ToolLoopResult {
  narration: NarrationEnvelope | null;
  stagedEffects: StagedEngineTurnEffect[];
}

type DmLoopMode = "player_turn" | "opening";

interface CompletionTelemetryContext {
  accountId: string;
  campaignId: string;
  actorId: string;
  requestId: string;
  clientCommandId: string;
  dmRunId: string;
  purpose: ModelUsagePurpose;
  toolsEnabled: boolean;
  nextRequestSequence: () => number;
  telemetryEvents?: OpenRouterCompletionTelemetry[];
}

class FirstTokenTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`The primary model produced no output within ${timeoutMs}ms.`);
    this.name = "FirstTokenTimeoutError";
  }
}

interface NormalizedCompletionUsage {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costMicrousd: number | null;
}

const NARRATION_CONTRACT_INSTRUCTION = [
  "Return the final response as one valid JSON object with exactly three keys: text, proposedFacts, and suggestedActions.",
  "text is the player-facing Markdown narration.",
  "proposedFacts is an array with at most eight items. Use only these exact shapes:",
  '{"kind":"record_fact","subjectId":"...","predicate":"...","value":"..."};',
  '{"kind":"introduce_npc","npcId":"...","name":"...","disposition":"friendly|neutral|wary|hostile|unknown"};',
  '{"kind":"discover_location","locationId":"...","name":"..."};',
  '{"kind":"advance_quest","questId":"...","status":"started|advanced|completed|failed"};',
  'or {"kind":"set_scene","sceneId":"..."}.',
  'The shorthand kinds "npc" and "location" are invalid. Do not add title, description, visibility, or other fields to a proposal.',
  "Use an empty proposedFacts array when no proposal matches exactly; durable state already authored through tools does not need to be repeated here.",
  "suggestedActions is an array of 0 to 5 concrete, context-aware moves. Every item must have exactly id, label, and prompt; id is short kebab-case, label is concise player-facing text, and prompt is a natural-language first-person next turn.",
  "Suggestions are invitations, not forced choices, and must never replace freeform play.",
  "Do not wrap the object in a Markdown fence or expose internal prompts, raw tool arguments, or engine implementation details.",
].join(" ");

export function buildDmContext(
  state: LanternCampaignState,
  context: RequestContext,
  playerText: string,
  mode: DmLoopMode
): Record<string, unknown> {
  const activeViewpointActorId = state.party?.activeViewpointActorId ?? context.actorId;
  const projection = actorKnowledgeProjection(activeViewpointActorId, state);
  const projectedState = projectStateForActor(context.actorId, state);
  return {
    playerText,
    mode,
    campaignId: context.campaignId,
    actorId: context.actorId,
    activeViewpointActorId,
    campaign: state.campaign,
    phase: state.phase,
    tutorialStep: state.tutorialStep,
    rulesVersion: state.rulesVersion,
    contentPolicy: state.contentPolicy,
    experienceProfile: projectExperienceProfile(state.experienceProfile),
    worldContext: projection.worldContext,
    proceduralNotices: projection.proceduralNotices,
    knowledge: projection.knowledge,
    informationTiers: projection.informationTiers,
    playerNotes: state.playerNotes,
    quests: state.quests,
    improvEffects: state.improvEffects,
    currentBeat: state.currentBeat,
    situation: state.situation ? projectSituationForActor(state.situation, state, activeViewpointActorId) : null,
    suggestedActions: state.suggestedActions,
    actionOffers: deriveActionOffers(state),
    character: state.character,
    combat: state.combat,
    controlledActors: projectedState.controlledActors.map((actor) => ({
      ...actor,
      knowledge: actor.id === activeViewpointActorId
        ? state.actorKnowledge.filter((record) => record.actorId === actor.id)
        : [],
    })),
    party: state.party,
    recentLog: state.log.slice(-12),
  };
}

interface ProvisionalToolResult extends EngineToolResult {
  stagedEffect?: StagedEngineTurnEffect;
}

export class LanternDungeonMaster {
  public constructor(
    private readonly store: LanternEngineStore,
    private readonly options: OpenRouterOptions,
    private readonly contentResolver:
      | Open5eContentResolver
      | ((state: LanternCampaignState) => Open5eContentResolver)
      | null = null
  ) {}

  public async startOpening(
    context: RequestContext,
    state: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number
  ): Promise<EngineCommandResult> {
    const existing = this.store.getStoredCommand(context.accountId, clientCommandId);
    if (existing) {
      let storedRequest: { campaignId?: string; playerText?: string | null } = {};
      try {
        storedRequest = JSON.parse(existing.requestJson) as typeof storedRequest;
      } catch (_error) {
        storedRequest = {};
      }
      if (storedRequest.campaignId !== context.campaignId || storedRequest.playerText) {
        throw new EngineCommandIdReuseError();
      }
      if (existing.result) return { ...existing.result, replayed: true };
    }
    if (existing) throw new EngineCommandInProgressError();

    let committed: EngineCommandResult | null = null;
    try {
      const openingPrompt = [
        "Open this campaign before the player takes their first action.",
        "Use the campaign premise, setting, tone, and the completed character to author a concrete first situation.",
        "The opening must create immediate dramatic motion: a present-tense circumstance, a relevant NPC or threat when appropriate, and a clear thing the player can respond to.",
        "Persist the authored situation with world_context before you finish. You may also create a quest or campaign beat when the opening warrants one.",
        "Any concrete item shown as held, guarded, dropped, offered, usable, movable, breakable, openable, or otherwise actionable must be included in world_context.objects.upsert before it appears in the final narration; features alone are descriptive, not authoritative objects.",
        "Do not wait for the player to ask what is in the room; the DM is opening the story now.",
      ].join(" ");
      const toolLoop = await this.runToolLoop(
        context,
        state,
        clientCommandId,
        expectedCampaignVersion,
        openingPrompt,
        "opening"
      );
      if (!toolLoop.stagedEffects.some((effect) => effect.command.kind === "world_context")) {
        throw new Error("The DM opening did not persist a world context.");
      }

      const command = {
        kind: "turn_plan" as const,
        effects: toolLoop.stagedEffects.map((effect) => ({ tool: effect.tool, command: effect.command })),
      };
      committed = this.store.executeCommand({
        context,
        clientCommandId,
        expectedCampaignVersion,
        command,
        tool: "turn_plan",
        resolve: (current) => compileAtomicTurnResolution(
          current,
          context,
          clientCommandId,
          toolLoop.stagedEffects
        ),
      });
      if (!toolLoop.narration) {
        return {
          ...committed,
          narration: rulesNarration(
            committed.message,
            "The opening is committed; the prose provider did not complete its first narration."
          ),
          narrationSource: "rules",
        };
      }
      const preservedNarration = preserveMediatedCheckAttribution(
        committed,
        toolLoop.narration,
        committed.state.experienceProfile,
      );
      return this.store.updateCommandNarration(
        context,
        clientCommandId,
        preservedNarration.narration,
        preservedNarration.source,
      ) ?? {
        ...committed,
        narration: preservedNarration.narration,
        narrationSource: preservedNarration.source,
      };
    } catch (error) {
      if (committed) {
        return {
          ...committed,
          narration: rulesNarration(
            committed.message,
            "The opening is committed. The DM prose provider needs a moment, so the table keeps the authored situation."
          ),
          narrationSource: "rules",
        };
      }
      throw error;
    }
  }

  public async resolveTurn(
    context: RequestContext,
    state: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string
  ): Promise<EngineCommandResult> {
    const existing = this.store.getStoredCommand(context.accountId, clientCommandId);
    if (existing) {
      let storedRequest: { campaignId?: string; playerText?: string } = {};
      try {
        storedRequest = JSON.parse(existing.requestJson) as typeof storedRequest;
      } catch (_error) {
        storedRequest = {};
      }
      if (storedRequest.campaignId !== context.campaignId || storedRequest.playerText !== playerText) {
        throw new EngineCommandIdReuseError();
      }
      if (existing.result) return { ...existing.result, replayed: true };
    }
    if (existing) throw new EngineCommandInProgressError();

    let committed: EngineCommandResult | null = null;
    try {
      const toolLoop = await this.runToolLoop(
        context,
        state,
        clientCommandId,
        expectedCampaignVersion,
        playerText,
        "player_turn"
      );

      if (toolLoop.stagedEffects.length > 0) {
        const command = {
          kind: "turn_plan" as const,
          effects: toolLoop.stagedEffects.map((effect) => ({ tool: effect.tool, command: effect.command })),
        };
        committed = this.store.executeCommand({
          context,
          clientCommandId,
          expectedCampaignVersion,
          command,
          tool: "turn_plan",
          playerText,
          resolve: (current) => compileAtomicTurnResolution(
            current,
            context,
            clientCommandId,
            toolLoop.stagedEffects
          ),
        });
      } else {
        committed = this.commitDeclaration(
          context,
          clientCommandId,
          expectedCampaignVersion,
          playerText
        );
      }

      if (!toolLoop.narration) {
        const fallback = committedRulesNarration(committed);
        return this.store.updateCommandNarration(context, clientCommandId, fallback, "rules") ?? {
          ...committed,
          narration: fallback,
          narrationSource: "rules",
        };
      }
      const preservedNarration = preserveMediatedCheckAttribution(
        committed,
        toolLoop.narration,
        committed.state.experienceProfile,
      );
      return this.store.updateCommandNarration(
        context,
        clientCommandId,
        preservedNarration.narration,
        preservedNarration.source,
      ) ?? {
        ...committed,
        narration: preservedNarration.narration,
        narrationSource: preservedNarration.source,
      };
    } catch (error) {
      if (committed) {
        const fallback = committedRulesNarration(committed);
        return this.store.updateCommandNarration(context, clientCommandId, fallback, "rules")
          ?? { ...committed, narration: fallback, narrationSource: "rules" };
      }
      console.warn(error instanceof Error ? "DM tool loop fallback: " + error.message : "DM tool loop fallback.");
      return this.resolveFallback(context, state, clientCommandId, expectedCampaignVersion, playerText);
    }
  }

  private async runToolLoop(
    context: RequestContext,
    initialState: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string,
    mode: DmLoopMode
  ): Promise<ToolLoopResult> {
    if (!this.options.apiKey) throw new Error("OpenRouter is not configured.");

    let currentState = cloneCampaign(initialState);
    const stagedEffects: StagedEngineTurnEffect[] = [];
    const dmRunId = `dm-run:${randomUUID()}`;
    let requestSequence = 0;
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "You are the live Dungeon Master for Lantern Table.",
          "The campaign profile belongs to the player; preserve its premise, setting, and tone as the world canon.",
          "The player experience profile is also player-owned. Use only its minimum projection for presentation and situation selection; never attempt to mutate it through DM tools.",
          "Do not deliberately introduce excluded or fade-to-black themes. If the player asks for one, redirect or fade before authoring detail. The difficulty policy key selects a reviewed band only; it never changes dice, modifiers, HP, enemy stats, or committed mechanics.",
          "For open-ended challenge adjudication, call challenge_attempt with a reviewed challenge id, explicit goal, and approach. The engine decides automatic, impossible, or uncertain feasibility, the final DC, bounded outcomes, costs, and retry policy; do not invent a DC or consequence.",
          "The user context is an actor-scoped knowledge projection. Hidden facts absent from it are not available to infer, summarize, hint, or narrate. Use search-hidden-fact-v1 for an authorized active search; never pass raw campaign state or hidden fact identifiers through prose.",
          "For checks, the engine derives ability, skill proficiency, expertise, validated tools, passive scores, advantage cancellation, and opposed totals. Name a legal helper or established opponent only when the fiction supports it, and use informationPolicy=withheld when the player must not receive check details. Fictional improvise is non-mechanical; use a typed effect for a real consequence.",
          "Respect the campaign lifecycle: character creation and tutorial are onboarding chapters; the sandbox begins only after the tutorial is complete.",
          mode === "opening"
            ? "This is the opening pass before the first player action. Author the first situation from campaign context and persist it with world_context; do not wait for a player prompt."
            : "There is no fixed location, room, scene number, or shared map. When the fiction needs a current context, author it from the campaign and persist it with world_context.",
          "When the fiction establishes a meaningful place or situation, use world_context so the current context persists. It may be a town, ship, wilderness, battlefield, or anything else the story calls for.",
          "When the player travels or the current place changes, update world_context; do not force the campaign through a preset route.",
          "Formal notices are typed state, not prose. When the fiction introduces a sealed letter, warrant, order, docket, clerk notice, or similar procedure, call procedural_notice with player-safe operative terms before narrating it. Keep restricted records out of every notice field. Use authorize then deliver for the prescribed clerk step; after delivery, call request_copy or request_clarification when asked. A denied request must still expose the minimum operative projection and a concrete next event; never leave the player in a wait/return loop or claim a read-back without the typed tool result.",
          "If public recentLog or the current features already establish a mundane object that is absent from worldContext.objects, do not refuse the player's action. In the same atomic turn, preserve the current context and upsert one stable object through world_context, using definition.sourceRef for the public evidence and definition.tags for ordinary aliases, then continue the original action. Never materialize from private or rejected text, and never add unsupported magic or mechanics.",
          "Use player_note_add only for durable facts, goals, preferences, promises, or other information the player explicitly states or clearly confirms.",
          "Treat the character sheet details as durable canon. When the player establishes appearance, personality, ideals, bonds, flaws, backstory, allies, faction, treasure, inspiration, or temporary hit points, use character_update so the sheet stays current; never rename the player character without consent.",
          "The campaign's pinned Open5e content policy defines its exact game system, base rules, enabled source documents, and licenses. Never borrow a rule or creature from another partition. The deterministic kernel owns ability modifiers, proficiency, skills, saving throws, hit dice, equipment, armor class, currency, combat, and rest at the fidelity each source record reached. Use authored campaign fiction for things the sources do not define, but never invent source-backed mechanics.",
          "You are the creative director of this campaign. You may invent rewards, paid goods, prices, quests, NPCs, motives, locations, factions, hazards, and story turns. Author durable content through the available tools so it persists; do not pretend narration alone changed state.",
          "The engine does not decide whether an invented story idea is canon or fun. It validates structure and resolves mechanical consequences: rolls, DCs, modifiers, HP, inventory, currency arithmetic, equipment, stock, quest progress, conditions, and persistence.",
          "Be proactive. NPCs pursue goals, events change, threats advance, and the world responds to the player. End a quiet turn with an immediate development, pressure, or clear choice rather than waiting for an invisible NPC deliberation.",
          "Never narrate that a merchant, NPC, or faction is merely still considering an action unless the player explicitly chose to wait and a time-passing consequence is being resolved. Give a concrete answer, counteroffer, refusal, escalation, or new opportunity now.",
          "For commerce, read merchant_catalog first. For a completed purchase or sale use merchant_trade. For a negotiated deal, decide the creative price in prose and use merchant_trade side=offer with that explicit price; there is no pending-offer state.",
          "When a fight begins, choose the fiction and opposition, search the installed creatures by name, then call combat_start with exact creature content keys and counts. Never invent or copy enemy stats; the engine hydrates the pinned statblocks.",
          "For the reviewed guards-surrender-v1 encounter slice, provide the stealth-perception-v1 approach and let the engine derive surprise, initiative, morale, surrender, capture, retreat, and outcome; use encounter_decision only for a server-offered response and never force morale in prose.",
          "When authoring an encounter, include the fictionally established distance for each creature group. Range checks use that persisted distance; never invent a different distance only to make an attack or spell legal.",
          "Controlled actors are first-class persistent companions or summons. Read controlled_actor_context before using them; create only the fixed familiar-scout-v1 or summon-scout-v1 profiles, then command them during the controller's turn with controlled_actor_command. Never author their stats, HP, senses, inventory, duration, action cost, or initiative policy. Use controlled_actor_dismiss for dismissal/source termination; an uncommanded actor deterministically guards at controller turn end.",
          "When a party exists, read party_context before coordinating actors. Use party_set_viewpoint, party_split, party_rejoin, party_shared_transfer, and party_group_check for the bounded party slice; the active viewpoint changes presentation only, and hidden knowledge absent from that viewpoint remains unavailable. Party rewards use the explicit leader-only policy; do not invent multiplayer or duplicate rewards.",
          "On a creature turn, read combat_state and call advance_turn with the active combatant id and a source-backed actionKey. Exact S7 multiattacks and save/damage programs are executable; fragment, legendary, reaction, or other tier rejections mean narrate no mechanical result. If a recharge roll fails without ending the turn, choose a legal fallback action in the same atomic turn plan.",
          "For spell choices, search the installed spells and use exact content keys. Use learn_spell for known cantrips, known-caster repertoires, and wizard spellbooks; use prepare_spell for prepared casters and wizard prepared spells; use cast_spell for resolution.",
          "The spell engine owns class-list eligibility, level limits, spellbook and preparation capacity, slots, action economy, concentration, range, target count, attacks, saves, damage dice, damage type, and creature defenses. If a spell or upcast returns content_tier_insufficient, do not substitute a guessed mechanical effect.",
          "After an encounter, use loot with the items, currency, and XP you are awarding. Include questId only when this defeated encounter completes that authored quest. The engine never supplies fixed demo loot.",
          "For social contests use social_check. If an established NPC speaks or acts for the player (for example, the player tells Titus to address the guards), pass that NPC as actingNpcId; the engine keeps the player as the roller and modifier source, and the committed result will say so. Never narrate an NPC as having rolled unless a reviewed NPC actor mechanic explicitly exists. For a new quest use quest_create; graph-quest branches advance only through quest_transition from committed predicates, while legacy flat quests may use quest_update. For a proactive story turn use campaign_beat, and for a rule-of-cool stunt use improvise with a typed mechanical effect when one exists.",
          "For an established world object, use interact with its typed affordance and stable targetId; the engine owns object state, material prerequisites, ownership, and consequences. For an object held or guarded by an NPC, call challenge_attempt with seize-held-object-v1, that holder's opponentId, and sceneId exactly worldContext.id + ':' + targetId. Then call interact affordance=take or steal only after success. One contest authorizes only that target; a failed contest preserves possession. Do not invent a final object state in prose. Use legacy interact only for non-mechanical features.",
          "For travel, use the reviewed travel tool with route/destination references and normal or fast pace; the engine owns elapsed time, navigation, supplies, watches, weather, random events, deadlines, and world clocks. Use project only with the reviewed project id; never author time, distance, rolls, supplies, or completion in prose.",
          "For the reviewed watchtower situation, use situation_context, situation_create, situation_visit, situation_clue_attempt, situation_ignore, and situation_choose. The engine owns clues, discoveries, pressure, fallback roles, object loss, and outcomes; never invent those commitments in narration.",
          "Quest completion may create a server-owned pending level 1-to-2 milestone. Show the pending preview and use advancement_confirm only with its exact id; never author HP, proficiency, slots, level, or feature consequences. NPC progression is separate: use npc_advance only for the reviewed veteran template on a live encounter instance, never alter the pinned statblock.",
          "The player speaks naturally, but the engine is authoritative.",
          "Use read tools to inspect context before acting when needed.",
          "Use rules_reference before making an exact SRD ruling; it searches the campaign's pinned rules, rulesets, legacy sections, and planes. Use content_search and content_get for creatures, spells, equipment, and other definitions. Respect each record's fidelity tier: tier 0 is reference-only, tier 1 resolves only typed fields, and tier 2 may execute its reviewed program.",
          "A player turn may require several ordered mechanical effects. Call every required mutating tool; Lantern stages accepted effects against one working snapshot and commits the complete plan atomically with one campaign-version increment.",
          "Mutating tool results are provisional until your final response. A rejected effect is not part of the plan; correct it before narration if the consequence is required. Never narrate a provisional effect that was rejected.",
          "An object_not_found result for a mundane object already present in public recentLog or current features must be repaired with world_context.objects.upsert and the original action retried in this turn. Never expose missing engine state as an in-world explanation.",
          "Never invent a mechanical result in prose. If a result matters, call the matching engine tool. You may invent the content being offered to the engine.",
          "Never use prose to imply that a rejected action succeeded.",
          "After a tool result, narrate only the committed result and keep the response concise and immersive.",
          "If a tool rejects an action, explain the constraint and offer a legal next choice.",
          NARRATION_CONTRACT_INSTRUCTION,
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(buildDmContext(initialState, context, playerText, mode)),
      },
    ];

    let repairPending = false;
    let repairAttempted = false;
    let noticeRepairAttempted = false;
    let safeNarrationCandidate: string | null = null;
    const objectIntent = detectObjectTurnIntent(initialState, playerText);
    let objectRepairAttempted = false;

    let toolLoopTurns = 0;
    while (toolLoopTurns < 8 || repairPending) {
      if (!repairPending) toolLoopTurns += 1;
      let assistant: CompletionMessage;
      const telemetryEvents: OpenRouterCompletionTelemetry[] = [];
      try {
        assistant = await this.requestCompletion(messages, !repairPending, {
          accountId: context.accountId,
          campaignId: context.campaignId,
          actorId: context.actorId,
          requestId: context.requestId,
          clientCommandId,
          dmRunId,
          purpose: repairPending ? "narration_repair" : mode,
          toolsEnabled: !repairPending,
          nextRequestSequence: () => ++requestSequence,
          telemetryEvents,
        });
      } catch (error) {
        this.flushCompletionTelemetry(telemetryEvents, repairPending ? "narration_repair" : mode);
        if (repairPending) {
          console.warn(
            "DM narration contract repair request failed; using safe text-only fallback: "
              + (error instanceof Error ? error.message : "unknown provider error")
          );
          return {
            narration: safeNarrationCandidate ? rulesNarration(safeNarrationCandidate) : null,
            stagedEffects,
          };
        }
        if (stagedEffects.length > 0) return { narration: null, stagedEffects };
        throw error;
      }
      const toolCalls = assistant.tool_calls ?? [];
      this.flushCompletionTelemetry(
        telemetryEvents,
        repairPending ? "narration_repair" : toolCalls.length > 0 ? mode : "narration"
      );
      if (!toolCalls.length) {
        const content = typeof assistant.content === "string" ? assistant.content.trim() : "";
        if (objectIntent) {
          const repair = objectTurnRepair(objectIntent, currentState, stagedEffects);
          if (repair) {
            if (!objectRepairAttempted) {
              objectRepairAttempted = true;
              messages.push({ role: "assistant", content: content || null });
              messages.push({ role: "user", content: repair });
              continue;
            }
            return {
              narration: null,
              stagedEffects: stagedEffects.filter((effect) => objectIntent.kind !== "held-transfer" || heldContest(effect)?.outcome !== "success"),
            };
          }
        }
        const validation = validateNarration(content);
        if (validation.success) {
          const noticeRepair = proceduralNoticeRepair(playerText, content, currentState, stagedEffects);
          if (noticeRepair) {
            if (!noticeRepairAttempted) {
              noticeRepairAttempted = true;
              messages.push({ role: "assistant", content: content || null });
              messages.push({ role: "user", content: noticeRepair });
              continue;
            }
            return {
              narration: rulesNarration("The formal procedure is waiting for an authoritative notice record before it can govern your next action."),
              stagedEffects,
            };
          }
          return { narration: validation.data, stagedEffects };
        }
        safeNarrationCandidate ??= validation.safeText;

        if (!repairAttempted) {
          repairAttempted = true;
          repairPending = true;
          messages.push({
            role: "assistant",
            content: content || null,
          });
          messages.push({
            role: "user",
            content: narrationRepairInstruction(validation.issues),
          });
          continue;
        }

        console.warn(
          "DM narration contract repair failed; using safe text-only fallback: "
            + validation.issues.join("; ").slice(0, 1_000)
        );
        return {
          narration: safeNarrationCandidate ? rulesNarration(safeNarrationCandidate) : null,
          stagedEffects,
        };
      }

      repairPending = false;

      messages.push({
        role: "assistant",
        content: typeof assistant.content === "string" ? assistant.content : null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolOutput = this.executeToolCall(
          context,
          currentState,
          clientCommandId,
          toolCall,
          stagedEffects.length
        );
        if (toolOutput.stagedEffect) {
          stagedEffects.push(toolOutput.stagedEffect);
          currentState = provisionalState(toolOutput.stagedEffect.resolution, expectedCampaignVersion);
        }
        messages.push({
          role: "tool",
          content: JSON.stringify({
            tool: toolOutput.tool,
            accepted: toolOutput.accepted,
            readOnly: toolOutput.readOnly,
            code: toolOutput.code,
            message: toolOutput.message,
            data: toolOutput.data,
            campaignVersion: toolOutput.campaignVersion,
            provisional: toolOutput.provisional ?? false,
          }),
          tool_call_id: toolCall.id,
        });
      }
    }

    if (stagedEffects.length > 0) return { narration: null, stagedEffects };
    throw new Error("The DM exceeded the tool-call turn budget.");
  }

  private executeToolCall(
    context: RequestContext,
    currentState: LanternCampaignState,
    clientCommandId: string,
    toolCall: ToolCall,
    stagedEffectCount: number
  ): ProvisionalToolResult {
    const toolName = toolCall.function.name;
    if (!isEngineToolName(toolName)) {
      return {
        tool: "campaign_context",
        readOnly: true,
        accepted: false,
        code: "unknown_tool",
        message: "That tool is not available in Lantern.",
        data: { requestedTool: toolName },
        campaignVersion: currentState.version,
      };
    }

    if (
      toolName === "experience_profile_update"
      || toolName === "experience_feedback_add"
      || toolName === "experience_boundary"
    ) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: "profile_player_only",
        message: "Experience preferences can only be changed by an explicit player command.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    let rawArguments: unknown;
    try {
      rawArguments = JSON.parse(toolCall.function.arguments || "{}");
    } catch (_error) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "invalid_tool_arguments",
        message: "The tool arguments were not valid JSON.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    let args: Record<string, unknown>;
    try {
      args = parseToolArguments(toolName, rawArguments);
    } catch (error) {
      return {
        tool: toolName,
        readOnly: true,
        accepted: false,
        code: "invalid_tool_arguments",
        message: error instanceof Error ? error.message : "The tool arguments were invalid.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    const command = commandForTool(
      toolName,
      toolName === "player_note_add" ? { ...args, source: "dm" } : args
    );
    if (!command) return executeReadTool(currentState, toolName, args, this.resolverFor(currentState));

    if (stagedEffectCount >= 16) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: "turn_plan_effect_limit",
        message: "This turn plan already contains the maximum of 16 ordered effects.",
        data: null,
        campaignVersion: currentState.version,
      };
    }

    try {
      const resolution = resolveEngineCommand(
        currentState,
        context,
        `${clientCommandId}:${stagedEffectCount}`,
        command,
        toolName
      );
      const publicResolution = projectResolutionForActor(resolution, context.actorId);
      return {
        tool: toolName,
        readOnly: publicResolution.readOnly,
        accepted: publicResolution.accepted,
        code: publicResolution.code,
        message: publicResolution.message,
        data: publicResolution.data,
        campaignVersion: currentState.version,
        provisional: resolution.accepted,
        ...(resolution.accepted && !resolution.readOnly
          ? { stagedEffect: { tool: toolName, command, resolution } }
          : {}),
      };
    } catch (error) {
      return {
        tool: toolName,
        readOnly: false,
        accepted: false,
        code: "tool_execution_failed",
        message: error instanceof Error ? error.message : "The tool could not execute.",
        data: null,
        campaignVersion: currentState.version,
      };
    }
  }

  private resolverFor(state: LanternCampaignState): Open5eContentResolver | null {
    return typeof this.contentResolver === "function"
      ? this.contentResolver(state)
      : this.contentResolver;
  }

  private commitDeclaration(
    context: RequestContext,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string
  ): EngineCommandResult {
    const command: EngineCommand = { kind: "declare", goal: playerText };
    return this.store.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion,
      command,
      tool: "declare",
      playerText,
      resolve: (state) => resolveEngineCommand(state, context, clientCommandId, command, "declare", playerText),
    });
  }

  private resolveFallback(
    context: RequestContext,
    state: LanternCampaignState,
    clientCommandId: string,
    expectedCampaignVersion: number,
    playerText: string
  ): EngineCommandResult {
    const selected = fallbackCommand(state, playerText);
    const result = this.store.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion,
      command: selected.command,
      tool: selected.tool,
      playerText,
      resolve: (current) =>
        resolveEngineCommand(current, context, clientCommandId, selected.command, selected.tool, playerText),
    });
    const fallback = committedRulesNarration(result);
    return this.store.updateCommandNarration(context, clientCommandId, fallback, "rules") ?? {
      ...result,
      narration: fallback,
      narrationSource: "rules",
    };
  }

  private async requestCompletion(
    messages: ChatMessage[],
    allowTools: boolean,
    telemetryContext?: CompletionTelemetryContext
  ): Promise<CompletionMessage> {
    try {
      return await this.requestStreamingCompletion(
        messages,
        allowTools,
        this.options.baseUrl,
        this.options.model,
        "primary",
        telemetryContext ? {
          ...telemetryContext,
          requestSequence: telemetryContext.nextRequestSequence(),
        } : undefined
      );
    } catch (error) {
      if (!(error instanceof FirstTokenTimeoutError) || !this.options.fallbackModel) throw error;
      console.warn(`Primary model produced no first output; retrying once with ${this.options.fallbackModel}.`);
      return this.requestStreamingCompletion(
        messages,
        allowTools,
        this.options.fallbackBaseUrl || this.options.baseUrl,
        this.options.fallbackModel,
        "fallback",
        telemetryContext ? {
          ...telemetryContext,
          requestSequence: telemetryContext.nextRequestSequence(),
        } : undefined
      );
    }
  }

  private flushCompletionTelemetry(
    events: OpenRouterCompletionTelemetry[],
    purpose: ModelUsagePurpose
  ): void {
    for (const event of events) {
      event.purpose = purpose;
      this.emitCompletionTelemetry(event);
    }
    events.length = 0;
  }

  private emitCompletionTelemetry(event: OpenRouterCompletionTelemetry): void {
    try {
      this.options.onCompletionTelemetry?.(event);
    } catch (error) {
      console.error(
        "lantern.model_usage_callback_failed "
        + (error instanceof Error ? error.message : "unknown error")
      );
    }
  }

  private async requestStreamingCompletion(
    messages: ChatMessage[],
    allowTools: boolean,
    baseUrl: string,
    model: string,
    selection: "primary" | "fallback",
    telemetryContext?: Omit<CompletionTelemetryContext, "nextRequestSequence"> & { requestSequence: number }
  ): Promise<CompletionMessage> {
    const startedAt = Date.now();
    let firstOutputAt: number | null = null;
    let failureReason: OpenRouterCompletionTelemetry["failureReason"] = null;
    let completionUsage: NormalizedCompletionUsage | undefined;
    let providerRequestId: string | null = null;
    let resolvedModel: string | null = null;
    let finishReason: string | null = null;
    let toolCallCount: number | null = null;
    const client = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: baseUrl,
      maxRetries: 0,
      defaultHeaders: {
        ...(this.options.siteUrl ? { "HTTP-Referer": this.options.siteUrl } : {}),
        "X-OpenRouter-Title": this.options.appName,
      },
    });
    let firstOutput = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: ReturnType<typeof client.chat.completions.stream> | undefined;
    const markFirstOutput = (): void => {
      if (firstOutput) return;
      firstOutput = true;
      firstOutputAt = Date.now() - startedAt;
      if (timer) clearTimeout(timer);
    };

    try {
      stream = client.chat.completions.stream({
        model,
        reasoning_effort: this.options.reasoningEffort,
        max_tokens: this.options.maxTokens,
        stream_options: { include_usage: true },
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "lantern_narration",
            strict: true,
            schema: narrationEnvelopeJsonSchema,
          },
        },
        ...(allowTools
          ? {
              tool_choice: "auto",
              tools: lanternToolDefinitions,
            }
          : { tool_choice: "none" }),
        messages,
      } as never);
      stream.on("chunk", (chunk) => {
        const chunkRecord = chunk as unknown as Record<string, unknown>;
        if (typeof chunkRecord.id === "string") providerRequestId ??= chunkRecord.id;
        if (typeof chunkRecord.model === "string") resolvedModel ??= chunkRecord.model;
        if (chunkRecord.usage) completionUsage = normalizeCompletionUsage(chunkRecord.usage);
        const delta = chunk.choices[0]?.delta;
        if (delta?.content || delta?.tool_calls?.length) markFirstOutput();
        if (delta?.tool_calls?.length) toolCallCount = Math.max(toolCallCount ?? 0, delta.tool_calls.length);
        const chunkFinishReason = chunk.choices[0]?.finish_reason;
        if (typeof chunkFinishReason === "string") finishReason = chunkFinishReason;
      });
      stream.on("content", (delta) => {
        if (delta) markFirstOutput();
      });
      stream.on("tool_calls.function.arguments.delta", (delta) => {
        if (delta.arguments_delta || delta.name) markFirstOutput();
      });
      const timeoutMs = Math.max(0, Math.trunc(this.options.firstTokenTimeoutMs ?? 8_000));
      timer = timeoutMs > 0
        ? setTimeout(() => {
            if (firstOutput || !stream) return;
            timedOut = true;
            stream.abort();
          }, timeoutMs)
        : undefined;

      const completion = await stream.finalChatCompletion();
      const completionRecord = completion as unknown as Record<string, unknown>;
      if (typeof completionRecord.id === "string") providerRequestId = completionRecord.id;
      if (typeof completionRecord.model === "string") resolvedModel = completionRecord.model;
      if (completionRecord.usage) completionUsage = normalizeCompletionUsage(completionRecord.usage);
      const message = completion.choices[0]?.message;
      if (!message) {
        failureReason = "invalid_response";
        throw new Error("OpenRouter returned no message.");
      }
      if (typeof completion.choices[0]?.finish_reason === "string") {
        finishReason = completion.choices[0].finish_reason;
      }
      if (Array.isArray(message.tool_calls)) toolCallCount = message.tool_calls.length;
      return {
        role: "assistant",
        content: typeof message.content === "string" ? message.content : null,
        tool_calls: message.tool_calls
          ?.filter((toolCall) => toolCall.type === "function")
          .map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          })),
      };
    } catch (error) {
      if (timedOut) {
        failureReason = "ttft_timeout";
        throw new FirstTokenTimeoutError(Math.max(0, Math.trunc(this.options.firstTokenTimeoutMs ?? 8_000)));
      }
      failureReason ??= firstOutput ? "stream_error_after_output" : "provider_error_before_output";
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      const telemetry: OpenRouterCompletionTelemetry = {
        provider: "openrouter",
        selection,
        model,
        ttftMs: firstOutputAt,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: failureReason ? "failed" : "completed",
        failureReason,
        inputTokens: completionUsage?.inputTokens ?? null,
        cachedInputTokens: completionUsage?.cachedInputTokens ?? null,
        reasoningTokens: completionUsage?.reasoningTokens ?? null,
        outputTokens: completionUsage?.outputTokens ?? null,
        totalTokens: completionUsage?.totalTokens ?? null,
        providerRequestId,
        resolvedModel,
        providerRoute: providerRouteFor(baseUrl),
        costMicrousd: completionUsage?.costMicrousd ?? null,
        costSource: completionUsage?.costMicrousd === null || completionUsage?.costMicrousd === undefined
          ? "unavailable"
          : "provider_reported",
        status: completionStatus(failureReason),
        finishReason,
        toolCallCount,
        ...(telemetryContext ? {
          accountId: telemetryContext.accountId,
          campaignId: telemetryContext.campaignId,
          actorId: telemetryContext.actorId,
          requestId: telemetryContext.requestId,
          clientCommandId: telemetryContext.clientCommandId,
          dmRunId: telemetryContext.dmRunId,
          requestSequence: telemetryContext.requestSequence,
          purpose: telemetryContext.purpose,
          toolsEnabled: telemetryContext.toolsEnabled,
        } : {}),
        createdAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
      };
      if (telemetryContext?.telemetryEvents) {
        telemetryContext.telemetryEvents.push(telemetry);
      } else {
        this.emitCompletionTelemetry(telemetry);
      }
    }
  }
}

function normalizeCompletionUsage(value: unknown): NormalizedCompletionUsage {
  const usage = asRecord(value);
  const inputTokens = nonnegativeIntegerOrNull(usage?.prompt_tokens);
  const outputTokens = nonnegativeIntegerOrNull(usage?.completion_tokens);
  const totalTokens = nonnegativeIntegerOrNull(usage?.total_tokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const directCostMicrousd = numberOrNull(usage?.cost_microusd ?? usage?.costMicroUsd);
  const costUsd = numberOrNull(usage?.cost);
  return {
    inputTokens,
    cachedInputTokens: nonnegativeIntegerOrNull(promptDetails?.cached_tokens),
    reasoningTokens: nonnegativeIntegerOrNull(completionDetails?.reasoning_tokens),
    outputTokens,
    totalTokens,
    costMicrousd: directCostMicrousd !== null
      ? Math.max(0, Math.trunc(directCostMicrousd))
      : costUsd === null ? null : Math.round(Math.max(0, costUsd) * 1_000_000),
  };
}

function completionStatus(failureReason: OpenRouterCompletionTelemetry["failureReason"]): ModelUsageStatus {
  if (!failureReason) return "success";
  if (failureReason === "ttft_timeout") return "timeout_before_output";
  if (failureReason === "stream_error_after_output") return "interrupted_after_output";
  if (failureReason === "invalid_response") return "invalid_response";
  return "provider_error";
}

function providerRouteFor(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname || null;
  } catch (_error) {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function nonnegativeIntegerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number === null ? null : Math.max(0, Math.trunc(number));
}

type NarrationValidation =
  | { success: true; data: NarrationEnvelope }
  | { success: false; issues: string[]; safeText: string | null };

function validateNarration(content: string): NarrationValidation {
  const trimmed = content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(trimmed));
  } catch (_error) {
    return {
      success: false,
      issues: ["response: expected one valid JSON object matching the narration envelope"],
      safeText: safeNarrationText(content),
    };
  }

  const result = narrationEnvelopeSchema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.slice(0, 8).map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "response";
      return path + ": " + issue.message;
    }),
    safeText: safeNarrationText(content, parsed),
  };
}

function narrationRepairInstruction(issues: string[]): string {
  return [
    "Your previous final response failed the narration contract.",
    "Validation errors: " + issues.join("; ").slice(0, 1_000) + ".",
    "Correct the response now. Do not call tools and do not add commentary.",
    NARRATION_CONTRACT_INSTRUCTION,
  ].join(" ");
}

function proceduralNoticeRepair(
  playerText: string,
  narrationText: string,
  state: LanternCampaignState,
  effects: StagedEngineTurnEffect[],
): string | null {
  const combined = `${playerText} ${narrationText}`;
  const formalNoticeMentioned = /\b(?:sealed\s+(?:notice|letter)|clerk\s+notice|formal\s+(?:order|notice)|warrant|docket|operative\s+terms|response\s+window|read[- ]back)\b/i.test(combined);
  const noticeEffects = effects.filter((effect) => effect.command.kind === "procedural_notice");
  const hasNotice = state.proceduralNotices.length > 0 || noticeEffects.length > 0;
  if (formalNoticeMentioned && !hasNotice) {
    return "A formal procedural notice was mentioned without authoritative state. Call procedural_notice with action upsert and complete player-safe operative terms before producing narration. Do not include restricted records in any term.";
  }
  const requestKind = /\b(?:copy|photocopy|exact\s+(?:read|wording)|read[- ]back)\b/i.test(playerText)
    ? "request_copy"
    : /\b(?:clarif(?:y|ication)|what\s+(?:does|are)|which\s+facts|what\s+can\s+I\s+respond)\b/i.test(playerText)
      ? "request_clarification"
      : null;
  const delivered = state.proceduralNotices.some((notice) => notice.status === "delivered" || notice.status === "resolved");
  if (requestKind && delivered && !noticeEffects.some((effect) => effect.command.kind === "procedural_notice" && effect.command.action === requestKind)) {
    return `The player requested a ${requestKind === "request_copy" ? "copy/read-back" : "clarification"} of an already delivered notice. Call procedural_notice with ${requestKind} and the existing noticeId before narrating; a denied request must still return the typed operative projection.`;
  }
  return null;
}

type ObjectTurnIntent = {
  kind: "held-transfer" | "object-action";
  objectId?: string;
};

function objectReferenceMatches(value: string, aliases: string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return aliases.some((alias) => {
    const phrase = alias.toLocaleLowerCase().replace(/[-_]+/g, " ").trim();
    if (phrase.length >= 3 && normalized.includes(phrase)) return true;
    return phrase.split(/\s+/).some((token) => token.length >= 4 && normalized.includes(token));
  });
}

function detectObjectTurnIntent(state: LanternCampaignState, playerText: string): ObjectTurnIntent | null {
  const world = state.worldContext;
  if (!world) return null;
  const transferVerb = /\b(seize|snatch|grab|wrench|steal|take|carry|pick\s+up|pocket|claim|secure)\b/i.test(playerText);
  const actionVerb = /\b(use|unlock|open|close|lock|equip|drop|throw|move|ignite|extinguish|break|damage|attach|activate)\b/i.test(playerText);
  if (!transferVerb && !actionVerb) return null;

  for (const object of world.objects) {
    const aliases = [object.id, object.definition.name, ...object.definition.tags];
    if (!objectReferenceMatches(playerText, aliases)) continue;
    const holder = object.locationRef && world.npcs.some((npc) => npc.id === object.locationRef);
    if (transferVerb && holder && object.ownerRef.kind !== "actor") {
      return { kind: "held-transfer", objectId: object.id };
    }
    return { kind: "object-action", objectId: object.id };
  }

  if (!transferVerb) return null;
  const npcMentioned = world.npcs.some((npc) => objectReferenceMatches(playerText, [npc.id, npc.name]));
  const holderLanguage = /\b(from|away|off|grip|belt|hands?|held|loosened|before\s+.+\s+react)\b/i.test(playerText);
  const evidenceTokens = new Set(
    [world.description, ...world.features, ...state.log.slice(-12).map((entry) => entry.text)]
      .join(" ").toLocaleLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4)
  );
  const sharedEvidence = playerText.toLocaleLowerCase().split(/[^a-z0-9]+/).some((token) => token.length >= 4 && evidenceTokens.has(token));
  return npcMentioned && holderLanguage && sharedEvidence ? { kind: "held-transfer" } : null;
}

function heldContest(effect: StagedEngineTurnEffect): { outcome: string; targetId: string | null } | null {
  if (effect.command.kind !== "challenge_attempt" || effect.command.challengeId !== "seize-held-object-v1") return null;
  const latest = effect.resolution.state.adjudicationHistory.at(-1);
  return latest ? { outcome: latest.outcome, targetId: effect.command.sceneId?.split(":").at(-1) ?? null } : null;
}

function objectTurnResolved(intent: ObjectTurnIntent, effects: StagedEngineTurnEffect[]): boolean {
  if (intent.kind === "object-action") {
    return effects.some((effect) =>
      effect.command.kind === "interact"
      && (!intent.objectId || effect.command.targetId === intent.objectId || effect.command.sourceId === intent.objectId)
    );
  }

  const contest = effects.map(heldContest).find((value) => value !== null);
  if (!contest) return false;
  if (contest.outcome === "failure-with-complication") return true;
  if (contest.outcome !== "success") return false;
  const targetId = intent.objectId ?? contest.targetId;
  return effects.some((effect) =>
    effect.command.kind === "interact"
    && (effect.command.affordance === "take" || effect.command.affordance === "steal")
    && (!targetId || effect.command.targetId === targetId)
  );
}

function objectTurnRepair(intent: ObjectTurnIntent, state: LanternCampaignState, effects: StagedEngineTurnEffect[]): string | null {
  if (objectTurnResolved(intent, effects)) return null;
  if (intent.kind === "held-transfer") {
    return [
      "The previous plan did not complete the player's attempted transfer of an established NPC-held object.",
      "Continue with tools before narration; do not claim possession in prose.",
      "If the object is present in recentLog or features but absent from worldContext.objects, call world_context first and preserve the existing context while upserting exactly one stable object with a public-evidence sourceRef, the established holder's id as locationRef, and ordinary affordances.",
      "Then call challenge_attempt with challengeId seize-held-object-v1, the established holder as opponentId, and sceneId exactly worldContext.id + ':' + targetId.",
      "If the contest succeeds, immediately call interact with that same targetId and affordance take or steal. If it fails, do not call interact; preserve the holder's ownership and narrate that outcome.",
      `Current authoritative context: ${state.worldContext?.id ?? "none"}.`,
    ].join(" ");
  }
  return [
    "The previous response did not resolve the player's use of an authoritative object.",
    "Continue with tools before narration; do not substitute a generic no-check or prose-only consequence.",
    "Use the actor-owned source object from worldContext.objects. If the target is described publicly but missing, upsert it with world_context while preserving the current context, then call interact with the typed affordance and sourceId for that source object.",
  ].join(" ");
}

function safeNarrationText(content: string, parsed?: unknown): string | null {
  const trimmed = stripJsonFence(content.trim());
  let candidate = parsed;
  if (candidate === undefined) {
    try {
      candidate = JSON.parse(trimmed);
    } catch (_error) {
      candidate = undefined;
    }
  }
  if (typeof candidate === "string") {
    const decoded = candidate.trim();
    return decoded ? decoded.slice(0, 6_000) : null;
  }
  if (candidate !== undefined && (candidate === null || typeof candidate !== "object")) {
    return null;
  }
  if (candidate && typeof candidate === "object" && "text" in candidate) {
    const text = (candidate as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, 6_000);
    return null;
  }
  if (
    !trimmed
    || /^[\[{]/.test(trimmed)
    || /["']?(?:text|proposedFacts|suggestedActions)["']?\s*:/.test(trimmed)
  ) {
    return null;
  }
  return trimmed.slice(0, 6_000);
}

function rulesNarration(text: string, suffix?: string): NarrationEnvelope {
  return {
    text: suffix ? text + " " + suffix : text,
    proposedFacts: [],
    suggestedActions: [],
  };
}

function committedCheckText(data: unknown, scene?: string): string | null {
  if (data === null || typeof data !== "object" || typeof (data as { success?: unknown }).success !== "boolean") {
    return null;
  }
  const check = data as { success: boolean; goal?: unknown; attribution?: EngineSocialCheckAttribution };
  const goal = typeof check.goal === "string" ? check.goal.trim().replace(/[.!?]+$/, "") : "";
  const outcome = check.success ? "The attempt succeeds" : "The attempt falls short";
  const location = scene ? " in " + scene : "";
  const purpose = goal ? ": " + goal : "";
  const attribution = check.attribution?.mode === "npc-mediated"
    ? mediatedCheckAttributionText(check.attribution) + " "
    : "";
  const consequence = check.success
    ? "The outcome now stands in the scene."
    : "The setback now stands, and the situation continues from there.";
  return `${attribution}${outcome}${location}${purpose}. ${consequence}`;
}

function mediatedCheckAttributionText(attribution: EngineSocialCheckAttribution): string {
  return `${attribution.actingActorName} acts for ${attribution.rollingActorName} toward ${attribution.targetName}; the check uses ${attribution.modifierSourceActorName}'s modifiers.`;
}

function mediatedCheckAttributions(result: EngineCommandResult): EngineSocialCheckAttribution[] {
  const effectAttributions = result.event?.effects
    ?.map((effect) => effect.check?.attribution)
    .filter((attribution): attribution is EngineSocialCheckAttribution => attribution?.mode === "npc-mediated")
    ?? [];
  if (effectAttributions.length > 0) return effectAttributions;
  return result.event?.check?.attribution?.mode === "npc-mediated"
    ? [result.event.check.attribution]
    : [];
}

function narrationContradictsMediatedCheck(text: string, attribution: EngineSocialCheckAttribution): boolean {
  const actor = attribution.actingActorName.trim().toLocaleLowerCase("en-US").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = attribution.modifierSourceActorName.trim().toLocaleLowerCase("en-US");
  const normalized = text.toLocaleLowerCase("en-US");
  const actorClaim = new RegExp(`\\b${actor}\\b[^.!?]{0,80}\\b(?:rolled|rolls|rolling|made|makes|attempted|attempts|performed|performs|got|gets|scored|scores|achieved|achieves|totaled|totals)\\b[^.!?]{0,60}\\b(?:check|roll|score|result|total)\\b`, "i");
  const numericScoreClaim = new RegExp(`\\b${actor}\\b[^.!?]{0,40}\\b(?:got|gets|scored|scores|achieved|achieves|totaled|totals)\\b[^.!?]{0,20}\\b\\d+(?:\\.\\d+)?\\b`, "i");
  const possessiveClaim = new RegExp(`\\b${actor}(?:['’]s)\\b[^.!?]{0,80}\\b(?:check|roll|modifier)\\b`, "i");
  const pronounModifierClaim = new RegExp(`\\b${actor}\\b[^.!?]{0,80}\\b(?:uses?|used|has|gets?|takes?)\\b[^.!?]{0,40}\\b(?:his|her|their)\\b[^.!?]{0,20}\\bmodifiers?\\b`, "i");
  return actorClaim.test(normalized)
    || numericScoreClaim.test(normalized)
    || possessiveClaim.test(normalized)
    || pronounModifierClaim.test(normalized)
    || (source !== attribution.actingActorName.trim().toLocaleLowerCase("en-US")
      && new RegExp(`\\b${actor}(?:['’]s)?\\b[^.!?]{0,40}\\bmodifiers?\\b`, "i").test(normalized));
}

function appendMissingMediatedAttributions(
  narration: NarrationEnvelope,
  attributions: EngineSocialCheckAttribution[],
  requireAuthoritativeLabel: boolean,
): NarrationEnvelope {
  const missing = attributions
    .map((attribution) => {
      const text = mediatedCheckAttributionText(attribution);
      const marker = "Authoritative check record: " + text;
      const present = requireAuthoritativeLabel ? narration.text.includes(marker) : narration.text.includes(text);
      return present ? null : attribution;
    })
    .filter((attribution): attribution is EngineSocialCheckAttribution => attribution !== null);
  if (missing.length === 0) return narration;
  const fullSuffix = missing
    .map((attribution) => "Authoritative check record: " + mediatedCheckAttributionText(attribution))
    .join("\n\n");
  const compactSuffix = missing
    .map((attribution, index) => `Authoritative mediated check ${index + 1}: ${compactActorName(attribution.actingActorName)} acts for ${compactActorName(attribution.rollingActorName)} toward ${compactActorName(attribution.targetName)}; modifiers: ${compactActorName(attribution.modifierSourceActorName)}.`)
    .join("\n");
  const suffix = fullSuffix.length <= 6_000 ? fullSuffix : compactSuffix.length <= 6_000
    ? compactSuffix
    : `Authoritative mediated checks: ${missing.length} committed checks; the player remained the roller and modifier source for each.`;
  const prefixSeparator = "\n\n";
  const availablePrefixLength = Math.max(0, 6_000 - prefixSeparator.length - suffix.length);
  const prefix = narration.text.trim().slice(0, availablePrefixLength).trimEnd();
  return {
    ...narration,
    text: prefix ? `${prefix}${prefixSeparator}${suffix}` : suffix,
  };
}

function compactActorName(name: string): string {
  const normalized = name.trim();
  return normalized.length <= 48 ? normalized : normalized.slice(0, 45) + "...";
}

function preserveMediatedCheckAttribution(
  result: EngineCommandResult,
  narration: NarrationEnvelope,
  experienceProfile: LanternCampaignState["experienceProfile"],
): { narration: NarrationEnvelope; source: "llm" | "rules" } {
  const attributions = mediatedCheckAttributions(result);
  const sanitized = sanitizeNarrationForProfile(narration, experienceProfile);
  if (attributions.length === 0) return { narration: sanitized, source: "llm" };
  if (attributions.some((attribution) => narrationContradictsMediatedCheck(sanitized.text, attribution))) {
    const fallback = appendMissingMediatedAttributions(committedRulesNarration(result), attributions, false);
    return {
      narration: sanitizeNarrationForProfile(fallback, experienceProfile),
      source: "rules",
    };
  }
  const completed = appendMissingMediatedAttributions(sanitized, attributions, true);
  return {
    narration: sanitizeNarrationForProfile(completed, experienceProfile),
    source: "llm",
  };
}

function committedMoveText(data: unknown): string {
  const exit = data !== null && typeof data === "object"
    ? (data as { exit?: unknown }).exit
    : null;
  const label = exit !== null && typeof exit === "object" && typeof (exit as { label?: unknown }).label === "string"
    ? (exit as { label: string }).label.trim().replace(/[.!?]+$/, "")
    : "";
  return label ? `You continue along the chosen path: ${label}.` : "You continue along the chosen path.";
}

function committedDeclarationText(result: EngineCommandResult): string {
  const worldContext = result.state.worldContext;
  if (!worldContext) return "You put your plan into motion. What do you do next?";
  const title = worldContext.title.trim().replace(/[.!?]+$/, "");
  const description = worldContext.description.trim();
  const detail = description ? `${description}${/[.!?]$/.test(description) ? "" : "."}` : "";
  const paths = worldContext.exits
    .slice(0, 3)
    .map((exit) => exit.label.trim().replace(/[.!?]+$/, ""));
  const nextChoice = paths.length > 0 ? `Paths onward: ${paths.join("; ")}.` : "What do you do next?";
  return [`You put your plan into motion in ${title}.`, detail, nextChoice].filter(Boolean).join(" ");
}

function committedRulesNarration(result: EngineCommandResult): NarrationEnvelope {
  const effects = result.event?.effects ?? [];
  if (effects.length === 0 && result.event?.command.kind === "declare") {
    return rulesNarration(committedDeclarationText(result));
  }
  const worldContext = effects.some((effect) => effect.command.kind === "world_context")
    ? result.state.worldContext
    : null;
  if (worldContext) {
    const title = worldContext.title.trim().replace(/[.!?]+$/, "");
    const description = worldContext.description.trim();
    const entersContext = effects.some((effect) =>
      effect.command.kind === "world_context"
      && effect.stateChanges.some((change) => change.path === "/worldContext/id" || change.path === "/worldContext/title")
    );
    const scene = `${entersContext ? `You reach ${title}.` : `${title}:`} ${description}${/[.!?]$/.test(description) ? "" : "."}`;
    const paths = worldContext.exits
      .slice(0, 3)
      .map((exit) => exit.label.trim().replace(/[.!?]+$/, ""));
    const lastWorldContextIndex = effects.reduce(
      (last, effect, index) => effect.command.kind === "world_context" ? index : last,
      -1
    );
    const hasTrailingMove = effects.some(
      (effect, index) => effect.command.kind === "move" && index > lastWorldContextIndex
    );
    const otherOutcomes = effects
      .map((effect, index) => {
        if (effect.command.kind === "world_context") return "";
        if (effect.command.kind === "move") {
          return index < lastWorldContextIndex ? "" : committedMoveText(effect.data);
        }
        return committedCheckText(effect.check ? effect.data : null) ?? effect.outcome.trim();
      })
      .filter(Boolean);
    const nextChoice = !hasTrailingMove && paths.length > 0
      ? `Paths onward: ${paths.join("; ")}.`
      : "What do you do next?";
    return rulesNarration(
      scene,
      [...otherOutcomes, nextChoice].join(" ")
    );
  }
  const checkData = effects.length === 1 && effects[0]?.check
    ? effects[0].data
    : effects.length === 0 && result.event?.check
      ? result.data
      : null;
  const scene = result.state.worldContext?.title.trim();
  const checkText = committedCheckText(checkData, scene);
  if (checkText) return rulesNarration(checkText);

  const authoritative = result.message.trim() || "The action changes the situation.";
  return rulesNarration(scene ? `${authoritative} The situation in ${scene} now reflects that result.` : authoritative);
}

function stripJsonFence(content: string): string {
  const fence = String.fromCharCode(96).repeat(3);
  if (!content.startsWith(fence)) return content;
  return content
    .replace(new RegExp("^" + fence + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp("\\s*" + fence + "$"), "")
    .trim();
}

function fallbackCommand(
  state: LanternCampaignState,
  playerText: string
): { command: EngineCommand; tool: EngineToolName | "listen" | "declare" } {
  const text = playerText.toLowerCase();
  if (state.combat.status === "active") {
    if (hasActiveCondition(state.effects, state.character.id, "unconscious")) return { command: { kind: "death_save" }, tool: "death_save" };
    if (/\b(advance|end turn|wait|pass)\b/.test(text)) return { command: { kind: "advance_turn" }, tool: "advance_turn" };
    if (/\b(dodge|defend|guard)\b/.test(text)) return { command: { kind: "combat_action", action: "dodge" }, tool: "combat_action" };
    if (/\b(dash|run)\b/.test(text)) return { command: { kind: "combat_action", action: "dash" }, tool: "combat_action" };
    return { command: { kind: "combat_action", action: "attack" }, tool: "combat_action" };
  }
  if (/\b(rest|sleep|camp)\b/.test(text)) return { command: { kind: "rest", restType: "long" }, tool: "rest" };
  if (/\b(loot|take|claim|search)\b/.test(text)) return { command: { kind: "loot", items: [], rewardXp: 0, rewardCopper: 0 }, tool: "loot" };
  if (/\b(use|drink|consume)\b.*\b(potion|draught|ration)\b/.test(text)) {
    const itemId = state.character.inventory.find((item) => {
      const view = materializeInventoryItem(item);
      return view.kind === "consumable" && Boolean(view.healing);
    })?.id ?? "healing-draught";
    return { command: { kind: "use_item", itemId }, tool: "use_item" };
  }
  if (state.worldContext && /\b(follow|continue|head|travel|move|go|leave|enter)\b/.test(text)) {
    const exit = state.worldContext.exits[0];
    if (exit) return { command: { kind: "move", destinationId: exit.id }, tool: "move" };
  }
  if (/\b(listen|hear)\b/.test(text)) return { command: { kind: "listen" }, tool: "listen" };
  if (/\b(look|observe|describe|room|surroundings|see)\b/.test(text)) return { command: { kind: "observe" }, tool: "observe" };
  if (/\b(search|inspect|study|check|investigate)\b/.test(text)) {
    return {
      command: { kind: "roll_check", ability: /\b(mind|rune|book|mechanism)\b/.test(text) ? "int" : "wis", goal: playerText },
      tool: "roll_check",
    };
  }
  return { command: { kind: "declare", goal: playerText }, tool: "declare" };
}
