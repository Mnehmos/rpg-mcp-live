import { randomUUID } from "node:crypto";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError } from "./reference-engine-adapter.js";
import type { ReferenceEngineClient } from "./reference-engine-client.js";
import type { TenantIdentity } from "./reference-engine-tenant.js";
import { DOCKET_NAMES, type DocketName, type ReferenceEngineStore, type StoredLogMessage } from "./reference-engine-store.js";
import type { ReferenceEngineToolCatalog, OpenRouterToolDefinition } from "./reference-engine-tools.js";
import type {
  EngineAbility,
  EngineCharacterView,
  EngineSessionView,
  EngineToolCallDisclosure,
  EngineToolDisclosure,
} from "./engine-contracts.js";

/**
 * ADR-H37 doctrine, applied to the ADR-H13 override: "the LLM calls the
 * engine" — the reference engine (mnehmos-rpg-mcp) never calls an LLM
 * itself; only this orchestrator does, and it lives entirely in the web
 * service, structurally separate from both engine processes. This file is
 * the ONLY place in the reference-engine integration that talks to an LLM
 * provider.
 *
 * Deliberately simpler than LanternDungeonMaster (src/engine-dm.ts): the
 * reference engine has no staged-effects/atomic-commit model — each tool
 * call mutates its state immediately — so there is no transactional replay/
 * idempotency ledger here yet. A resubmitted clientCommandId will re-run the
 * turn rather than replay a stored result. That's a known, disclosed MVP gap.
 */

export class ReferenceDmProviderUnavailableError extends Error {
  public constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "The reference-engine DM could not resolve this turn.");
    this.name = "ReferenceDmProviderUnavailableError";
    this.cause = cause;
  }
}

export interface ReferenceTurnResult {
  campaignId: string;
  clientCommandId: string;
  campaignVersion: number;
  narration: { text: string; proposedFacts: []; suggestedActions: [] };
  narrationSource: "llm";
  toolDisclosure: EngineToolDisclosure | null;
  session: EngineSessionView;
  replayed: false;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface ReferenceToolOutcome {
  text: string;
  accepted: boolean;
  payload: unknown;
  effectiveArguments: Record<string, unknown>;
}

function storedToolCallId(entryId: string, index: number): string {
  const safeEntryId = entryId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "entry";
  return `history_${safeEntryId}_${index + 1}`;
}

const MAX_REPLAYED_TOOL_RESULT_CHARACTERS = 4_000;
const REPLAY_TRUNCATION_MARKER = "... [result truncated for context; call the tool again for the full payload]";

function serializeStoredToolResult(result: unknown): string {
  const serialized = typeof result === "string" ? result : JSON.stringify(result) ?? "null";
  if (serialized.length <= MAX_REPLAYED_TOOL_RESULT_CHARACTERS) return serialized;
  return serialized.slice(0, MAX_REPLAYED_TOOL_RESULT_CHARACTERS - REPLAY_TRUNCATION_MARKER.length)
    + REPLAY_TRUNCATION_MARKER;
}

/**
 * Reconstruct the assistant/tool exchanges that produced prior narration.
 * Only accepted engine results extend the cross-turn character allowlist;
 * model-supplied arguments and rejected results never grant authority.
 */
function replayStoredHistory(
  priorLog: readonly StoredLogMessage[],
  knownCharacterIds: Set<string>
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const entry of priorLog) {
    if (entry.kind === "player") {
      messages.push({ role: "user", content: entry.text });
      continue;
    }
    if (entry.kind === "narration") {
      messages.push({ role: "assistant", content: entry.text });
      continue;
    }
    if (entry.kind !== "tool" || !entry.toolDisclosure?.calls.length) continue;

    const toolCalls = entry.toolDisclosure.calls.map((call, index) => {
      if (call.accepted) collectCharacterIds(call.result, knownCharacterIds);
      return {
        id: storedToolCallId(entry.id, index),
        type: "function" as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.requestedArguments ?? call.arguments),
        },
      };
    });
    messages.push({ role: "assistant", content: null, tool_calls: toolCalls });
    entry.toolDisclosure.calls.forEach((call, index) => {
      messages.push({
        role: "tool",
        tool_call_id: toolCalls[index]!.id,
        content: serializeStoredToolResult(call.result),
      });
    });
  }
  return messages;
}

const TOOL_DISCLOSURE_WARNING =
  "Spoiler warning: the DM used game tools to author or resolve this moment. Expand the calls to see newly created locations, characters, enemies, items, rolls, and state changes.";
const SENSITIVE_DISCLOSURE_KEY = /^(?:api[_-]?key|authorization|cookie|credential|password|secret|token)$/i;

function sanitizeToolDisclosureValue(value: unknown, secretDocket: boolean, depth = 0): unknown {
  if (secretDocket) return "[DM-only content withheld]";
  if (depth > 8) return "[content truncated]";
  if (Array.isArray(value)) return value.map((item) => sanitizeToolDisclosureValue(item, false, depth + 1));
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  const dmOnly = source.visibility === "dm_only";
  for (const [key, child] of Object.entries(source)) {
    if (SENSITIVE_DISCLOSURE_KEY.test(key) || (dmOnly && key === "content")) {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizeToolDisclosureValue(child, false, depth + 1);
  }
  return sanitized;
}

function makeToolCallDisclosure(
  toolName: string,
  args: Record<string, unknown>,
  outcome: ReferenceToolOutcome
): EngineToolCallDisclosure {
  const secretDocket = args.name === "secrets" && (toolName === "read_docket" || toolName === "write_docket");
  const safeArguments = sanitizeToolDisclosureValue(outcome.effectiveArguments, false) as Record<string, unknown>;
  const safeRequestedArguments = sanitizeToolDisclosureValue(args, false) as Record<string, unknown>;
  if (toolName === "write_docket" && args.name === "secrets") {
    safeArguments.content = "[DM-only content withheld]";
    safeRequestedArguments.content = "[DM-only content withheld]";
  }
  const argumentsChanged = JSON.stringify(args) !== JSON.stringify(outcome.effectiveArguments);
  return {
    name: toolName,
    ...(toolName === "agent_manage" && args.action === "invoke" ? { provenance: "npc_agent" as const } : {}),
    arguments: safeArguments,
    ...(argumentsChanged ? { requestedArguments: safeRequestedArguments } : {}),
    result: sanitizeToolDisclosureValue(outcome.payload ?? outcome.text, secretDocket),
    accepted: outcome.accepted,
  };
}

export interface AuthoredSceneState {
  generatedRoom: boolean;
  movedCharacter: boolean;
  committedScene: boolean;
  roomId: string | null;
  roomName: string | null;
  description: string | null;
  sceneId: string | null;
}

// Creative scene authoring can legitimately need room generation, placement,
// NPC/object creation, scene commitment, continuity writes, and then a final
// narration response. This is only a runaway-loop bound; it is not a
// deterministic test for whether a player turn is allowed.
const MAX_TOOL_ROUNDS = 16;

export const REFERENCE_DM_WORLD_AUTHORING_PROTOCOL = [
  "Every player turn is intent, not a pre-existing world description. The player drives what happens next; you invent the concrete world that makes that intent playable.",
  "There are no rooms, locations, NPCs, enemies, items, quests, clues, or other world facts until the DM authors them through an RPG MCP tool and a successful tool result commits them to engine state.",
  "Never ask the player to provide a missing location, NPC, enemy, or situation merely because it has not been established. Invent a fitting one from the campaign profile, player intent, and current pressures, then commit it before narration.",
  "Do not wait for the engine to reject an absent fact and do not answer with a deterministic absence check. Treat every player intent as an invitation to author the next playable situation; inspect current state, make the creative decision, call the relevant tools, and keep the flow in-world.",
  "Use spatial_manage generate and move for places and player placement; npc_manage create or spawn_manage for NPCs and populated locations; combat_manage spawn_quick_enemy or spawn_manage for enemies and encounters; item_manage and inventory_manage for authored objects and possession; quest_manage for durable quests; and scene_manage set for the DM-authored shared scene frame.",
  "NPC agency has two deliberate modes: an ordinary NPC is DM-portrayed and must not receive an invented agent binding; an explicitly agent-backed NPC uses agent_manage only when the player, campaign, or explicit session policy asks for that mode. For this service's agent-backed NPC policy, use provider openrouter, model openai/gpt-5.6-luna, and competencyOverride {model: openai/gpt-5.6-luna, reasoningEffort: medium} unless an explicit player or campaign policy overrides it; when creating that nested agent configuration, use maxTokens 8192 or higher and omit budgetTokens (or use a clearly session-sized budget, never a tiny 300/1000 budget). Never choose direct provider openai unless its credential is confirmed available. Before npc_manage.interact or agent_manage.invoke for a newly authored companion, place every newly authored companion in the current shared room with spatial_manage.move and confirm the result; do not use a companion as a speaker or actor while it is roomless. agent_manage.invoke returns a plain-text NPC proposal, not committed game state; treat that proposal as the agent's creative intent, then interpret it in context and dispatch the normal RPG MCP tool or tools that make the intended companion action real. Do not stop at the proposal, ask the player to approve or select a deterministic companion action, or narrate an uncommitted choice; continue the same tool loop until the relevant tool result succeeds or the proposal is clearly non-actionable.",
  "When you introduce combat, make it playable through the engine: prefer combat_manage create with the player's exact character id and sheet stats plus the authored enemy participant, or use spawn_quick_enemy only when its returned encounter is then joined to the player. Use the returned encounterId and participant ids with combat_action; do not narrate an enemy as active until the combat tool result confirms it.",
  "A player mention is an invitation or intent, not proof that a named place, person, enemy, or object exists. Previous DM prose is continuity only; successful RPG MCP results are the authority.",
  "The execution order is mandatory orchestration, not an allow/reject classifier: player intent -> relevant engine action -> returned engine result -> scene_manage set -> narration. Never narrate a state-changing outcome before the relevant engine call succeeds, and never turn a skipped call into an 'unresolved' continuity fact; repair the tool sequence or describe the failure at the engine boundary.",
  "For every turn that advances the shared fiction, commit the new or changed world facts through the appropriate engine tools, then commit the resulting DM scene with scene_manage action set using the player's character as a participant. Only after those tool results succeed may you narrate them.",
  "Be decisive and economical: use the smallest complete set of tool calls for the current turn, batch independent calls when possible, do not reread every continuity docket or rewrite unchanged dockets, and do not repeat a tool call after a successful result. Once the scene is committed, stop calling tools and narrate.",
  "If a tool rejects an authoring attempt, repair the tool call or narrate the failed action without claiming the rejected fact became real. Never substitute a docket entry or prose for an engine commitment.",
].join(" ");

export const REFERENCE_DM_SYSTEM_PROMPT = [
  "You are the Dungeon Master for a tabletop RPG session, running on the reference rules engine.",
  REFERENCE_DM_WORLD_AUTHORING_PROTOCOL,
  "The player owns the fiction's direction; you own the concrete scene. Invent places, people, pressures, clues, and opportunities that fit the campaign profile, then use the provided RPG MCP tools to commit every durable fact before narrating it.",
  "You may call the provided tools to change game state (including spatial_manage for persistent rooms and character placement, combat, inventory, movement, character updates, quests, notes, and narrative memory).",
  "The engine validates and executes every tool call; you never mutate state directly, only through tools.",
  "Do not invent characterId/worldId/partyId values — omit them and the engine will fill in the correct ones for this session.",
  "If there is no current room or scene, do not narrate that absence. Create a concrete room with spatial_manage action generate, then place the player there with spatial_manage action move. The generated room name and description are your creative decision, but the room and placement must be confirmed by tool results before you describe them.",
  "On an opening or the first player turn, author a persistent room, player placement, and scene_manage set before narration. On later turns, if the player refers to an unestablished place or person, author and commit the needed world facts and scene first instead of saying they do not exist.",
  "If the player says they travel toward a place, look for someone, investigate a lead, enter danger, or otherwise advances the fiction, decide what is there and author it through tools. Do not make the player supply a room, NPC, enemy, item, or clue before you can continue.",
  "For npc_manage.interact, always provide a non-empty content string and the speakerId; use targetId when someone is addressed. For npc_manage.create, omit seedRelationship, seedMemory, and agent unless you have all of their required nested fields. Never send blank optional UUIDs or empty optional strings.",
  "After committing a new scene, write the canonical room id, name, current occupants, active leads, and unresolved pressure to the state/journal dockets so the next turn can continue from it. Never put mechanical numbers in those dockets.",
  "When you are done taking actions for this turn, respond with plain narration text (no further tool calls) describing what happened, written for the player.",
  "Keep narration grounded only in what the tools actually returned. Do not narrate outcomes that no tool call confirmed.",
  "You also keep six narrative memory documents via read_docket/write_docket: state (current scene summary), player (character personality/backstory/lore prose), npcs (notes on NPCs met), journal (session-by-session recap), campaign (premise/setting/tone), and secrets (DM-only facts the player hasn't learned).",
  "Never put mechanical numbers (hp, ac, ability scores, inventory, gold, xp) in a docket — those are owned by the engine tools and read from there, not from dockets.",
  "Never reveal the contents of the secrets docket in narration or in any other docket a player can see — it exists only for your own continuity.",
].join(" ");

const DOCKET_TOOLS: OpenRouterToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_docket",
      description:
        "Read one of your six narrative memory documents (state, player, npcs, journal, secrets, campaign). Returns the raw markdown content, or an empty string if never written.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", enum: DOCKET_NAMES, description: "Which docket to read." } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_docket",
      description:
        "Fully replace one of your six narrative memory documents with new markdown content. This is a full overwrite, not an append — read the current content first if you want to preserve it. Never write mechanical stats here.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", enum: DOCKET_NAMES, description: "Which docket to write." },
          content: { type: "string", description: "The new full markdown content for this docket." },
        },
        required: ["name", "content"],
      },
    },
  },
];

function isDocketName(value: unknown): value is DocketName {
  return typeof value === "string" && (DOCKET_NAMES as readonly string[]).includes(value);
}

export class ReferenceDungeonMaster {
  public constructor(
    private readonly client: ReferenceEngineClient,
    private readonly store: ReferenceEngineStore,
    private readonly catalog: ReferenceEngineToolCatalog,
    private readonly adapter: ReferenceEngineAdapter,
    private readonly openRouter: { apiKey: string; baseUrl: string; model: string; timeoutMs: number }
  ) {}

  public async resolveTurn(
    accountId: string,
    actorId: string,
    campaignId: string,
    playerText: string
  ): Promise<ReferenceTurnResult> {
    const routing = this.store.getRouting(accountId, campaignId);
    if (!routing || routing.backend !== "reference") throw new ReferenceEngineNotRoutedError(campaignId);

    const clientCommandId = randomUUID();
    const tools = [...(await this.catalog.getTools()), ...DOCKET_TOOLS];
    // worldId/partyId/sessionId scope which game/tenant a call touches, so
    // they're forced to this campaign's IDs regardless of what the model
    // supplied — never trust the model's own tenant-scoping fields (same
    // rule the adapter follows for real client requests). characterId is
    // filled only when missing: many tools legitimately target a different
    // character/NPC within the same session (e.g. combat_action on an enemy
    // the model itself spawned).
    const forcedArgs: Record<string, unknown> = {
      worldId: routing.referenceWorldId ?? undefined,
      partyId: routing.referencePartyId ?? undefined,
    };
    const fillOnlyArgs: Record<string, unknown> = {
      characterId: routing.referenceCharacterId ?? undefined,
    };
    // The tenant this turn acts for, derived from the authenticated web
    // session — never from anything the model produced. Signed per outbound
    // call by ReferenceEngineClient so the engine can verify it.
    const tenant: TenantIdentity = {
      accountId,
      campaignId,
      worldId: routing.referenceWorldId ?? undefined,
      partyId: routing.referencePartyId ?? undefined,
    };
    // The reference engine has zero tenant isolation (ADR-H13): any
    // characterId the model supplies is otherwise forwarded as-is, and a
    // prompt-injected or hallucinated ID belonging to a *different* account's
    // character would be honored just as readily as this campaign's own.
    // worldId/partyId close this for tools scoped by party, but characterId
    // itself is deliberately fill-only (many tools target an NPC/enemy the
    // model just created in this same session, not always the player's own
    // PC) — so it can't be blanket-forced. Instead, only allow characterId
    // values the model has actually learned from an accepted result in this
    // campaign's replayed history or the current turn (plus the player's own
    // bound character); anything else is rejected before it reaches the
    // network, the same "engine validates, never trusts the model" discipline
    // the adapter already applies elsewhere.
    const knownCharacterIds = new Set<string>();
    if (routing.referenceCharacterId) knownCharacterIds.add(routing.referenceCharacterId);

    // character_manage.get (a raw call straight to the reference engine, not
    // routed through the adapter) returns the engine's bare mechanical
    // record, which has no saving-throw/skill proficiency flags at all —
    // that derivation only happens in ReferenceEngineAdapter.buildState()
    // via hydrateCharacter, for the player-facing sheet. Without this, the
    // model would only ever see the same incomplete record and (confirmed
    // live) tell the player their save proficiencies "aren't currently
    // recorded" even though the real sheet has them. Fetching the fully-
    // hydrated view once up front and handing it over as context means the
    // model never needs to guess, and never needs an extra tool round just
    // to ask.
    const sheetContext = routing.referenceCharacterId
      ? formatCharacterSheetContext((await this.adapter.getCampaign(accountId, actorId, campaignId)).campaign.character)
      : null;

    const priorLog = this.store.getLogMessages(accountId, campaignId);
    const authoredScene = emptyAuthoredSceneState();
    const campaignContext = formatCampaignProfile(routing.campaignProfileJson);
    const stateMemory = this.store.getDocket(accountId, campaignId, "state");
    // Replay the actual assistant/tool exchange, not a prose-only rewrite of
    // prior turns. Besides restoring the model's own successful tool-use
    // pattern, accepted engine results safely carry discovered NPC/enemy IDs
    // across turns. Rejected results and model arguments never seed the
    // allowlist.
    const historyMessages = replayStoredHistory(priorLog, knownCharacterIds);

    const messages: ChatMessage[] = [
      { role: "system", content: REFERENCE_DM_SYSTEM_PROMPT },
      ...(sheetContext ? [{ role: "system" as const, content: sheetContext }] : []),
      ...(campaignContext ? [{ role: "system" as const, content: campaignContext }] : []),
      ...(stateMemory ? [{ role: "system" as const, content: `CURRENT NARRATIVE STATE MEMORY (continuity only; RPG MCP results remain authoritative):\n${stateMemory}` }] : []),
      ...historyMessages,
      { role: "user", content: playerText },
    ];

    let narrationText: string | null = null;
    let toolRoundCount = 0;
    const toolCallNames: string[] = [];
    const disclosedToolCalls: EngineToolCallDisclosure[] = [];
    try {
      // Reserve one completion after the final allowed tool-bearing round so
      // the DM can narrate the authored result instead of exhausting the
      // budget immediately after a valid tool call.
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const completion = await this.chatCompletion(messages, tools);
        const toolCalls = completion.tool_calls ?? [];
        if (toolCalls.length === 0) {
          const candidate = completion.content?.trim() || "";
          narrationText = candidate || null;
          break;
        }
        toolRoundCount = round + 1;
        toolCallNames.push(...toolCalls.map((call) => call.function.name));
        if (round === MAX_TOOL_ROUNDS) {
          break;
        }
        messages.push({ role: "assistant", content: completion.content ?? null, tool_calls: toolCalls });
        for (const call of toolCalls) {
          const callArgs = parseArguments(call.function.arguments);
          const remoteOutcome: ReferenceToolOutcome =
            call.function.name === "read_docket" || call.function.name === "write_docket"
              ? this.callDocketTool(accountId, campaignId, call.function.name, callArgs)
              : await this.callRemoteTool(call.function.arguments, call.function.name, forcedArgs, fillOnlyArgs, knownCharacterIds, tenant);
          disclosedToolCalls.push(makeToolCallDisclosure(call.function.name, callArgs, remoteOutcome));
          markAuthoredSceneState(authoredScene, call.function.name, callArgs, remoteOutcome);
          messages.push({ role: "tool", tool_call_id: call.id, content: remoteOutcome.text });
        }
      }
    } catch (error) {
      throw new ReferenceDmProviderUnavailableError(error);
    }

    if (!narrationText) {
      throw new ReferenceDmProviderUnavailableError(
        new Error(
          `The reference-engine DM did not produce narration within the tool-call round budget (toolRounds=${toolRoundCount}, toolCalls=${toolCallNames.join(",") || "none"}).`
        )
      );
    }

    if (authoredScene.roomId) {
      this.persistAuthoredSceneState(accountId, campaignId, authoredScene);
    }

    const version = this.store.bumpVersion(accountId, campaignId);
    const now = new Date().toISOString();
    const toolDisclosure = disclosedToolCalls.length > 0
      ? {
          spoilerWarning: TOOL_DISCLOSURE_WARNING,
          calls: disclosedToolCalls,
        }
      : null;
    const logMessages: StoredLogMessage[] = [
      { id: randomUUID(), kind: "player", text: playerText, createdAt: now },
      ...(toolDisclosure
        ? [{ id: randomUUID(), kind: "tool" as const, text: "The DM consulted the game world.", createdAt: now, toolDisclosure }]
        : []),
      { id: randomUUID(), kind: "narration", text: narrationText, createdAt: new Date().toISOString() },
    ];
    this.store.appendLogMessages(accountId, campaignId, logMessages);

    const { campaign } = await this.adapter.getCampaign(accountId, actorId, campaignId);

    return {
      campaignId,
      clientCommandId,
      campaignVersion: version,
      narration: { text: narrationText, proposedFacts: [], suggestedActions: [] },
      narrationSource: "llm",
      toolDisclosure,
      session: campaign,
      replayed: false,
    };
  }

  private persistAuthoredSceneState(
    accountId: string,
    campaignId: string,
    scene: AuthoredSceneState,
  ): void {
    const existing = this.store.getDocket(accountId, campaignId, "state");
    const marker = /<!-- canonical-scene:start -->[\s\S]*?<!-- canonical-scene:end -->/;
    const block = [
      "<!-- canonical-scene:start -->",
      "## Current canonical scene",
      `- Room id: ${scene.roomId}`,
      `- Room name: ${scene.roomName ?? "Unnamed room"}`,
      `- Description: ${scene.description ?? "See the authoritative spatial tool result."}`,
      `- Player placed here this turn: ${scene.movedCharacter ? "yes" : "not confirmed"}`,
      `- Shared scene committed this turn: ${scene.committedScene ? "yes" : "not confirmed"}`,
      `- Scene id: ${scene.sceneId ?? "not confirmed"}`,
      "<!-- canonical-scene:end -->",
    ].join("\n");
    const next = marker.test(existing)
      ? existing.replace(marker, block)
      : [existing.trim(), block].filter(Boolean).join("\n\n");
    this.store.setDocket(accountId, campaignId, "state", next);
  }

  private async callRemoteTool(
    rawArguments: string,
    toolName: string,
    forcedArgs: Record<string, unknown>,
    fillOnlyArgs: Record<string, unknown>,
    knownCharacterIds: Set<string>,
    tenant: TenantIdentity
  ): Promise<ReferenceToolOutcome> {
    const parsedArgs = parseArguments(rawArguments);
    const toolDefinition = await this.catalog.getTool(toolName);
    const normalizedArgs = normalizeToolArguments(parsedArgs, toolDefinition);
    const combatArgs = toolName === "combat_action"
      ? fillMissingArgs(normalizedArgs, { actorId: fillOnlyArgs.characterId })
      : normalizedArgs;
    const args = forceArgs(fillMissingArgs(combatArgs, fillOnlyArgs), forcedArgs);
    const requestedCharacterId = args.characterId;
    if (typeof requestedCharacterId === "string" && requestedCharacterId && !knownCharacterIds.has(requestedCharacterId)) {
      const text = JSON.stringify({
        error:
          "Unknown characterId. Only use a characterId learned from an accepted tool result in this campaign or current turn " +
          "(e.g. from create/list/get), or omit it to target your own character.",
      });
      return { text, accepted: false, payload: { error: "unknown_character_id" }, effectiveArguments: args };
    }
    const result = await this.client.callTool(toolName, args, tenant);
    collectCharacterIds(result.payload, knownCharacterIds);
    return {
      text: result.text || JSON.stringify(result.payload ?? {}),
      accepted: remoteResultAccepted(result.payload, result.isError),
      payload: result.payload,
      effectiveArguments: args,
    };
  }

  private callDocketTool(
    accountId: string,
    campaignId: string,
    toolName: "read_docket" | "write_docket",
    args: Record<string, unknown>
  ): ReferenceToolOutcome {
    return {
      text: this.handleDocketTool(accountId, campaignId, toolName, args),
      accepted: isDocketName(args.name),
      payload: null,
      effectiveArguments: args,
    };
  }

  /**
   * read_docket/write_docket never reach the remote reference engine — they're
   * resolved directly against ReferenceEngineStore. secrets is readable and
   * writable here (the model needs its own secrets in context); the
   * player-facing exclusion happens only at the API boundary
   * (ReferenceEngineAdapter.getCampaign), never here.
   */
  private handleDocketTool(
    accountId: string,
    campaignId: string,
    toolName: "read_docket" | "write_docket",
    args: Record<string, unknown>
  ): string {
    if (!isDocketName(args.name)) {
      return JSON.stringify({ error: `Unknown docket name. Valid names: ${DOCKET_NAMES.join(", ")}` });
    }
    if (toolName === "read_docket") {
      return this.store.getDocket(accountId, campaignId, args.name) || "(empty)";
    }
    const content = typeof args.content === "string" ? args.content : "";
    this.store.setDocket(accountId, campaignId, args.name, content);
    return JSON.stringify({ success: true, docket: args.name });
  }

  /**
   * A provider occasionally returns 200 with an empty choices array (seen
   * live: "OpenRouter response had no choices", no further detail) — a
   * transient upstream hiccup, not something retrying the exact same request
   * can't plausibly fix. One retry here is worth it: the alternative is
   * losing the player's whole turn (they'd have to retype it) over what's
   * often a one-off blip.
   */
  private async chatCompletion(
    messages: ChatMessage[],
    tools: OpenRouterToolDefinition[]
  ): Promise<{ content: string | null; tool_calls?: ChatMessage["tool_calls"] }> {
    try {
      return await this.chatCompletionOnce(messages, tools);
    } catch (error) {
      if (!(error instanceof EmptyCompletionError)) throw error;
      console.error(`[reference-dm] retrying after empty OpenRouter completion: ${error.message}`);
      return await this.chatCompletionOnce(messages, tools);
    }
  }

  private async chatCompletionOnce(
    messages: ChatMessage[],
    tools: OpenRouterToolDefinition[]
  ): Promise<{ content: string | null; tool_calls?: ChatMessage["tool_calls"] }> {
    const response = await fetch(`${this.openRouter.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.openRouter.apiKey}`,
      },
      body: JSON.stringify({
        model: this.openRouter.model,
        messages,
        tools,
        tool_choice: "auto",
      }),
      signal: this.openRouter.timeoutMs > 0 ? AbortSignal.timeout(this.openRouter.timeoutMs) : undefined,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenRouter request failed with status ${response.status}: ${body.slice(0, 500)}`);
    }
    const data = (await response.json()) as {
      id?: string;
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatMessage["tool_calls"] }; finish_reason?: string }>;
      error?: { message?: string; code?: unknown };
    };
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new EmptyCompletionError(
        `id=${data.id ?? "?"} finish_reason=${data.choices?.[0]?.finish_reason ?? "?"} error=${JSON.stringify(data.error ?? null)}`
      );
    }
    return { content: message.content ?? null, tool_calls: message.tool_calls };
  }
}

class EmptyCompletionError extends Error {}

const ABILITY_ORDER: EngineAbility[] = ["str", "dex", "con", "int", "wis", "cha"];

function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** Renders the same server-owned character projection that the UI receives. */
function formatCharacterSheetContext(character: EngineCharacterView): string {
  const saves = ABILITY_ORDER.map((ability) => {
    const proficient = character.derived.savingThrowProficiencies.includes(ability);
    return `${ability.toUpperCase()} ${formatModifier(character.savingThrows[ability])}${proficient ? " (proficient)" : ""}`;
  }).join(", ");
  const skills = Object.entries(character.skills)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, skill]) => `${name} ${formatModifier(skill.bonus)}${skill.proficient ? " (proficient)" : ""}${skill.expertise ? " (expertise)" : ""}`)
    .join(", ");
  const abilities = ABILITY_ORDER.map(
    (ability) => `${ability.toUpperCase()} ${character.abilities[ability]} (${formatModifier(character.abilityModifiers[ability])})`
  ).join(", ");
  const inventory = character.inventory
    .map((item) => `${item.authoredDefinition?.name ?? item.id} x${item.quantity}${item.equipped ? " (equipped)" : ""}`)
    .join(", ");
  const currency = character.derived.currencyBreakdown;
  const spells = character.spellcasting
    ? `ability ${character.spellcasting.ability}, save DC ${character.spellcasting.spellSaveDc}, attack ${formatModifier(character.spellcasting.spellAttackBonus)}, known ${character.spellcasting.knownSpells.map((spell) => spell.name).join(", ") || "none"}`
    : "none";

  return [
    "CURRENT CHARACTER SHEET (authoritative server projection of reference-engine state plus pinned rules derivation; do not infer missing fields):",
    `Player character id: ${character.id} (use this exact id for combat participants and actorId; never invent another id).`,
    `${character.name} — ${character.species} ${character.className}, level ${character.level}, background ${character.background}, alignment ${character.alignment}.`,
    `HP ${character.hp}/${character.maxHp} | AC ${character.ac} | Proficiency bonus ${formatModifier(character.proficiencyBonus)} | Hit die d${character.hitDie} | Size ${character.size} | Speed ${character.speed} ft`,
    `Ability scores: ${abilities}`,
    `Saving throws: ${saves}`,
    `Skills: ${skills || "none"}`,
    `Proficiencies: armor ${character.proficiencies.armor.join(", ") || "none"}; weapons ${character.proficiencies.weapons.join(", ") || "none"}; tools ${character.proficiencies.tools.join(", ") || "none"}; languages ${character.proficiencies.languages.join(", ") || "none"}`,
    `Features: ${character.features.join(", ") || "none"}`,
    `Derived: initiative ${formatModifier(character.derived.initiative)} | passive perception ${character.derived.passivePerception} | carry ${character.derived.carryWeight}/${character.derived.carryCapacity} lb | currency ${currency.gold} gp, ${currency.silver} sp, ${currency.copper} cp`,
    `Inventory: ${inventory || "none"}`,
    `Spellcasting: ${spells}`,
    `Conditions: ${character.conditions.join(", ") || "none"}`,
  ].join("\n");
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * OpenRouter can return empty strings for optional fields when a tool schema
 * is broad (for example the top-level npc_manage envelope). Remove those
 * values only when the loaded schema says the property is optional, while
 * preserving empty required values so the engine can return its real
 * validation error. This also walks nested objects and arrays, which keeps
 * optional UUIDs out of seedRelationship/seedMemory without hiding missing
 * required nested IDs from the engine.
 */
export function normalizeToolArguments(
  args: Record<string, unknown>,
  tool?: OpenRouterToolDefinition
): Record<string, unknown> {
  const normalized = normalizeToolValue(args, tool?.function.parameters);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized as Record<string, unknown>
    : {};
}

function normalizeToolValue(value: unknown, schema?: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    const itemSchema = recordValue(schema?.items);
    return value.map((item) => normalizeToolValue(item, itemSchema));
  }
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const properties = recordValue(schema?.properties);
  const required = new Set(
    Array.isArray(schema?.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : []
  );
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (child === "" && !required.has(key)) continue;
    const normalizedChild = normalizeToolValue(child, recordValue(properties[key]));
    if (normalizedChild !== undefined) normalized[key] = normalizedChild;
  }
  return normalized;
}

function formatCampaignProfile(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const profile = JSON.parse(raw) as Record<string, unknown>;
    const fields = ["name", "setting", "premise", "tone"]
      .map((key) => `${key}: ${typeof profile[key] === "string" ? profile[key] : ""}`)
      .filter((line) => !line.endsWith(": "));
    return fields.length > 0 ? `CAMPAIGN PROFILE (player-authored; preserve its direction):\n${fields.join("\n")}` : null;
  } catch {
    return null;
  }
}

function emptyAuthoredSceneState(): AuthoredSceneState {
  return {
    generatedRoom: false,
    movedCharacter: false,
    committedScene: false,
    roomId: null,
    roomName: null,
    description: null,
    sceneId: null,
  };
}

function spatialAction(args: Record<string, unknown>): string | null {
  const action = typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
  if (["generate", "create", "room", "new_room"].includes(action)) return "generate";
  if (["move", "enter", "go", "travel"].includes(action)) return "move";
  return null;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function markAuthoredSceneState(
  scene: AuthoredSceneState,
  toolName: string,
  args: Record<string, unknown>,
  outcome: ReferenceToolOutcome,
): void {
  if (!outcome.accepted) return;
  const payload = recordValue(outcome.payload);
  const nested = recordValue(payload.data);
  const data = Object.keys(payload).length > 0 ? payload : nested;
  if (toolName === "scene_manage") {
    const action = typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
    const scenePayload = recordValue(data.scene);
    const sceneId = stringValue(data, "sceneId") ?? stringValue(scenePayload, "id", "sceneId");
    if (action === "set" && sceneId) {
      scene.committedScene = true;
      scene.sceneId = sceneId;
    }
    return;
  }
  if (toolName !== "spatial_manage") return;
  const action = spatialAction(args);
  if (!action) return;
  const roomId = stringValue(data, "roomId", "newRoomId");
  const roomName = stringValue(data, "name", "newRoomName", "roomName");
  const description = stringValue(data, "description", "baseDescription");
  if (roomId) scene.roomId = roomId;
  if (roomName) scene.roomName = roomName;
  if (description) scene.description = description;
  if (action === "generate" && roomId) scene.generatedRoom = true;
  if (action === "move" && (roomId || stringValue(args, "roomId"))) scene.movedCharacter = true;
}

function remoteResultAccepted(payload: unknown, isError: boolean): boolean {
  if (isError) return false;
  const record = recordValue(payload);
  // `success: false` is a legitimate domain outcome for checks, attacks,
  // saves, and other adjudications. Only transport/tool-envelope errors make
  // the invocation itself rejected; the disclosure must preserve the failed
  // game outcome as a completed call.
  return record.error === undefined;
}

function fillMissingArgs(args: Record<string, unknown>, fillers: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...args };
  for (const [key, value] of Object.entries(fillers)) {
    if (value === undefined) continue;
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") merged[key] = value;
  }
  return merged;
}

/** Unconditionally overrides tenant-scoping fields — never trust the model's own values for these. */
function forceArgs(args: Record<string, unknown>, forced: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...args };
  for (const [key, value] of Object.entries(forced)) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * Recursively walks a tool result payload and records every string value
 * found under a key literally named "id" (case-insensitive) into `sink` —
 * this is how a characterId the model just legitimately learned (e.g. from
 * character_manage create/list/get, or an NPC id embedded in a combat/party
 * result) becomes usable in a later tool call this same turn. Deliberately
 * broad (any "id" field, not just ones we know are characters) since the
 * reference engine's response shapes aren't uniform across tools and an
 * over-inclusive allowlist only widens what the model may legitimately
 * reference, never what it may forge.
 */
function collectCharacterIds(value: unknown, sink: Set<string>, depth = 0): void {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectCharacterIds(item, sink, depth + 1);
    return;
  }
  for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "id" && typeof sub === "string" && sub) sink.add(sub);
    collectCharacterIds(sub, sink, depth + 1);
  }
}
