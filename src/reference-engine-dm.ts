import { randomUUID } from "node:crypto";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError } from "./reference-engine-adapter.js";
import type { ReferenceEngineClient } from "./reference-engine-client.js";
import type { TenantIdentity } from "./reference-engine-tenant.js";
import {
  DOCKET_NAMES,
  type DocketName,
  type ReferenceCommandFailure,
  type ReferenceEngineStore,
  type StoredLogMessage,
} from "./reference-engine-store.js";
import {
  type ReferenceEngineToolCatalog,
  type OpenRouterToolDefinition,
} from "./reference-engine-tools.js";
import type {
  EngineAbility,
  EngineCharacterView,
  EngineSessionView,
  EngineToolCallDisclosure,
  EngineToolDisclosure,
} from "./engine-contracts.js";
import {
  estimateLlmTokens,
  type LlmUsageActual,
  type LlmUsageBucket,
  type LlmUsageReservation,
  type LlmUsageStore,
  usdToMicros,
} from "./llm-usage.js";

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
  public readonly details: ReferenceCommandFailure;

  public constructor(cause: unknown, details: Omit<ReferenceCommandFailure, "correlationId" | "message"> & { correlationId?: string }) {
    super(cause instanceof Error ? cause.message : "The reference-engine DM could not resolve this turn.");
    this.name = "ReferenceDmProviderUnavailableError";
    this.cause = cause;
    this.details = {
      ...details,
      correlationId: details.correlationId ?? randomUUID(),
      message: cause instanceof Error ? cause.message : "The reference-engine DM could not resolve this turn.",
    };
  }
}

export class ReferenceDmCommandInProgressError extends Error {
  public constructor() {
    super("That reference-engine turn is already being resolved.");
    this.name = "ReferenceDmCommandInProgressError";
  }
}

export class ReferenceDmCommandIdReuseError extends Error {
  public constructor() {
    super("A client command ID cannot be reused for a different reference-engine turn.");
    this.name = "ReferenceDmCommandIdReuseError";
  }
}

export class ReferenceDmCommandAlreadyFailedError extends Error {
  public constructor(public readonly details: ReferenceCommandFailure | null) {
    super("That reference-engine turn already failed; reconcile its recorded outcome before retrying.");
    this.name = "ReferenceDmCommandAlreadyFailedError";
  }
}

export class ReferenceDmVersionConflictError extends Error {
  public constructor(public readonly currentVersion: number) {
    super("The campaign changed before this reference-engine turn started.");
    this.name = "ReferenceDmVersionConflictError";
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
  replayed: boolean;
  turnUsage?: LlmUsageBucket;
  diagnostics?: ReferenceTurnDiagnostics;
}

export interface ReferenceTurnDiagnostics {
  providerCalls: number;
  toolRounds: number;
  activatedTools: string[];
  toolCallNames: string[];
  acceptedToolCalls: number;
  acceptedStateChangingToolCalls: number;
  rejectedToolCalls: number;
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
  stateChanging: boolean;
  payload: unknown;
  effectiveArguments: Record<string, unknown>;
  usage?: LlmUsageActual;
}

interface ChatCompletionUsageEnvelope {
  prompt_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: number;
  cost_details?: { upstream_inference_cost?: number };
}

interface ChatCompletionResult {
  content: string | null;
  tool_calls?: ChatMessage["tool_calls"];
  usage?: LlmUsageActual;
  providerCalls?: number;
}

interface DmUsageContext {
  userId: string;
  campaignId: string;
  clientCommandId: string;
  admittedTurn: true;
}

// Read-only actions are still useful context, but a successful read cannot
// make a timed-out turn's commit outcome uncertain. Keep this allowlist
// conservative: an unknown action is treated as state-changing until it is
// explicitly reviewed.
const READ_ONLY_REFERENCE_TOOL_ACTIONS = new Set([
  "character_manage.get",
  "character_manage.list",
  "party_manage.get",
  "party_manage.list",
  "combat_manage.get",
  "combat_manage.list",
  "combat_manage.status",
  "combat_map.get",
  "combat_map.list",
  "item_manage.get",
  "item_manage.list",
  "item_manage.search",
  "inventory_manage.get",
  "inventory_manage.get_detailed",
  "inventory_manage.list",
  "world_manage.get",
  "world_manage.list",
  "world_map.get",
  "world_map.list",
  "spatial_manage.get",
  "spatial_manage.list",
  "spatial_manage.describe",
  "scene_manage.get",
  "quest_manage.get",
  "quest_manage.list",
  "quest_manage.search",
  "npc_manage.get",
  "npc_manage.list",
  "npc_manage.search",
  "agent_manage.get",
  "agent_manage.list",
  "aura_manage.get",
  "aura_manage.list",
  "scroll_manage.get",
  "scroll_manage.list",
  "concentration_manage.get",
  "concentration_manage.list",
  "secret_manage.get",
  "secret_manage.list",
  "narrative_manage.get",
  "narrative_manage.search",
  "narrative_manage.list",
  "math_manage.evaluate",
  "session_manage.get",
  "session_manage.status",
  "travel_manage.get",
  "travel_manage.list",
  "travel_manage.route",
  "improvisation_manage.get",
  "improvisation_manage.list",
]);

function isStateChangingReferenceTool(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName === "read_docket") return false;
  if (toolName === "write_docket") return true;
  return !READ_ONLY_REFERENCE_TOOL_ACTIONS.has(`${toolName}.${String(args.action ?? "")}`);
}

function storedToolCallId(entryId: string, index: number): string {
  const safeEntryId = entryId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "entry";
  return `history_${safeEntryId}_${index + 1}`;
}

const MAX_REPLAYED_TOOL_RESULT_CHARACTERS = 4_000;
const REPLAY_TRUNCATION_MARKER = "... [result truncated for context; call the tool again for the full payload]";
const REPLAYED_NARRATION_PREFIX =
  "[PRIOR DM NARRATION — continuity only, not authoritative state. The accepted RPG MCP results above are the source of truth; this prose never proves possession, a quest, party membership, lighting, movement, combat, or another durable fact.]\n";

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
      messages.push({ role: "assistant", content: `${REPLAYED_NARRATION_PREFIX}${entry.text}` });
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

export interface ReferenceResolveTurnOptions {
  clientCommandId?: string;
  expectedCampaignVersion?: number;
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
  "When the player gives, offers, or hands a carried item to an NPC, use inventory_manage action transfer with fromCharacterId set to the player's exact character id and toCharacterId set to the recipient character id. Do not use inventory_manage give as a handoff: give only adds an item and does not remove it from the player. Narrate acceptance only after the atomic transfer result succeeds.",
  "Prose, improvisation_manage, a docket entry, or an NPC/agent proposal never creates a concrete possession, quest, party membership, or light state. When the player acquires or discovers an item, author it with item_manage, then commit possession with inventory_manage give or transfer before narrating ownership. When a durable goal becomes real, create it with quest_manage and use the exact returned IDs. When a companion joins the party, commit party_manage membership and spatial placement before treating the companion as present. For light, use inventory_manage action use to light a carried source and action extinguish to put it out; narrate only the authoritative result.",
  "Material-action routing is mandatory even when the same action appeared in earlier prose: take, pick up, collect, keep, put away, or claim an absent object means item_manage create (or an existing authoritative item lookup) followed by inventory_manage give with the returned itemId and the player's exact characterId; light, ignite, extinguish, or shield a carried source means inventory_manage use or extinguish; equip or remove gear means inventory_manage equip or unequip; hand, offer, slide, or give a carried item to another character means inventory_manage transfer. Do not substitute improvisation_manage, scene_manage, narrative memory, or prose for these concrete calls. A prose-only completion is not final for one of these material actions.",
  "When creating or advancing a quest, use the exact questId and objective IDs returned by quest_manage.create, quest_manage.get, or quest_manage.get_log. Never derive an objective ID from a quest ID, objective name, or array position; if the ID is unavailable, read the quest log before updating or completing it.",
  "NPC agency has two deliberate modes: an ordinary NPC is DM-portrayed and must not receive an invented agent binding; an explicitly agent-backed NPC uses agent_manage only when the player, campaign, or explicit session policy asks for that mode. For this service's agent-backed NPC policy, use provider openrouter, model deepseek/deepseek-v4-flash, and competencyOverride {model: deepseek/deepseek-v4-flash} unless an explicit player or campaign policy overrides it; when creating that nested agent configuration, use maxTokens 8192 or higher and omit budgetTokens (or use a clearly session-sized budget, never a tiny 300/1000 budget). Never choose direct provider openai unless its credential is confirmed available. Before npc_manage.interact or agent_manage.invoke for a newly authored companion, place every newly authored companion in the current shared room with spatial_manage.move and confirm the result; do not use a companion as a speaker or actor while it is roomless. agent_manage.invoke returns a plain-text NPC proposal, not committed game state; treat that proposal as the agent's creative intent, then interpret it in context and dispatch the normal RPG MCP tool or tools that make the intended companion action real. Do not stop at the proposal, ask the player to approve or select a deterministic companion action, or narrate an uncommitted choice; continue the same tool loop until the relevant tool call is accepted, including a legitimate domain failure such as a miss or failed check. Once an adjudication is accepted, stop retrying that action and continue to scene commitment and narration; retry only rejected, malformed, or otherwise unexecuted calls.",
  "When you introduce combat, make it playable through the engine: prefer combat_manage create with the player's exact character id and sheet stats plus the authored enemy participant, or use spawn_quick_enemy only when its returned encounter is then joined to the player. Use the returned encounterId and participant ids with combat_action; do not narrate an enemy as active until the combat tool result confirms it.",
  "A player mention is an invitation or intent, not proof that a named place, person, enemy, or object exists. Previous DM prose is continuity only; successful RPG MCP results are the authority.",
  "History is not proof: replayed narration is explicitly marked as continuity-only. If it claims concrete possession, a quest, party membership, a lit light, or another durable fact but the replayed calls do not include an accepted authoritative tool for that fact, first consult the current authoritative projection or an appropriate read tool such as inventory_manage.get_detailed, quest_manage.get_log, party_manage.get, scene_manage.get, or spatial_manage.get; if it confirms the fact, continue from that state, otherwise repair it through the RPG MCP tools now; never repeat it as already true merely because it appeared in prose.",
  "The execution order is mandatory orchestration, not an allow/reject classifier: player intent -> relevant engine action -> returned engine result -> scene_manage set -> narration. Never narrate a state-changing outcome before the relevant engine call succeeds, and never turn a skipped call into an 'unresolved' continuity fact; repair the tool sequence or describe the failure at the engine boundary.",
  "For every turn that advances the shared fiction, commit the new or changed world facts through the appropriate engine tools, then commit the resulting DM scene with scene_manage action set using the player's character as a participant. Only after those tool results succeed may you narrate them.",
  "Be decisive and economical: use the smallest complete set of tool calls for the current turn, batch independent calls when possible, do not reread every continuity docket or rewrite unchanged dockets, and do not repeat a tool call after a successful result. Once the scene is committed, stop calling tools and narrate.",
  "If a tool rejects an authoring attempt, repair the tool call or narrate the failed action without claiming the rejected fact became real. Never substitute a docket entry or prose for an engine commitment.",
].join(" ");

export const REFERENCE_DM_SYSTEM_PROMPT = [
  "You are the Dungeon Master for a tabletop RPG session, running on the reference rules engine.",
  REFERENCE_DM_WORLD_AUTHORING_PROTOCOL,
  "The player owns the fiction's direction; you own the concrete scene. Invent places, people, pressures, clues, and opportunities that fit the campaign profile, then use the provided RPG MCP tools to commit every durable fact before narrating it.",
  "You control tool selection. Consult the compact RPG MCP capability directory and call activate_tools with the smallest set of capabilities needed for this turn; you may activate more later whenever the fiction demands it. Activation only reveals schemas and never changes game state.",
  "You may call the provided tools to change game state (including spatial_manage for persistent rooms and character placement, combat, inventory, movement, character updates, quests, notes, and narrative memory).",
  "The engine validates and executes every tool call; you never mutate state directly, only through tools.",
  "Do not invent characterId/worldId/partyId values — omit them and the engine will fill in the correct ones for this session.",
  "If there is no current room or scene, do not narrate that absence. Create a concrete room with spatial_manage action generate, then place the player there with spatial_manage action move. The generated room name and description are your creative decision, but the room and placement must be confirmed by tool results before you describe them.",
  "On an opening or the first player turn, author a persistent room, player placement, and scene_manage set before narration. On later turns, if the player refers to an unestablished place or person, author and commit the needed world facts and scene first instead of saying they do not exist.",
  "If the player says they travel toward a place, look for someone, investigate a lead, enter danger, or otherwise advances the fiction, decide what is there and author it through tools. Do not make the player supply a room, NPC, enemy, item, or clue before you can continue.",
  "For npc_manage.interact, always provide a non-empty content string and the speakerId; use targetId when someone is addressed. For npc_manage.create, omit seedRelationship, seedMemory, and agent unless you have all of their required nested fields. Never send blank optional UUIDs or empty optional strings.",
  "After committing a new scene, write the canonical room id, name, current occupants, active leads, and unresolved pressure to the state/journal dockets so the next turn can continue from it. Never put mechanical numbers in those dockets.",
  "When you are done taking actions for this turn, respond with plain, diegetic D&D narration (no further tool calls) describing what happened, written for the player. Translate authoritative tool results into the scene: do not paste headings, roll ledgers, HP/AC tables, encounter IDs, or generic bookkeeping such as 'the round is complete' into the prose. The tool disclosure and player dossier carry exact mechanics; the narration should show the changed situation and end at the player's next meaningful decision.",
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

const ACTIVATE_TOOLS_NAME = "activate_tools";
const CORE_TOOL_PALETTE = [
  "spatial_manage",
  "scene_manage",
  "item_manage",
  "inventory_manage",
  "quest_manage",
  "npc_manage",
  "party_manage",
  "combat_manage",
  "combat_action",
] as const;
const RECENT_TOOL_PALETTE_LIMIT = 12;
const RECENT_TOOL_PALETTE_EXCLUSIONS = new Set(["improvisation_manage"]);

// This is an internal routing hint, not a player-facing approval/rejection
// classifier.  For an unambiguous state-changing verb, the first provider
// completion must enter the tool loop so the DM can choose and commit the
// appropriate RPG MCP action before it narrates.  Keep the vocabulary narrow:
// ordinary conversational or observational turns should remain tool_choice=auto.
const AUTHORITATIVE_ACTION_INTENT = /\b(?:pick(?:s|ed|ing)?\s+up|take|takes|took|collect|collects|collected|pocket|pockets|pocketed|tuck|tucks|tucked|keep|keeps|kept|claim|claims|claimed|loot|loots|looted|retrieve|retrieves|retrieved|grab|grabs|grabbed|light|lights|lit|ignite|ignites|ignited|extinguish|extinguishes|extinguished|equip|equips|equipped|unequip|unequips|unequipped|remove|removes|removed|wear|wears|wore|hand|hands|handed|offer|offers|offered|slide|slides|slid|transfer|transfers|transferred|give|gives|gave|attack|attacks|attacked|strike|strikes|struck|shoot|shoots|shot|cast|casts|grapple|grapples|grappled|travel|travels|traveled|move|moves|moved|enter|enters|entered|open|opens|opened|rest|rests|rested|heal|heals|healed|drink|drinks|drank|eat|eats|ate|roll|rolls|rolled|check|checks|checked)\b/i;
const NON_ACTION_LOOK_IDIOM = /\btake\s+(?:a|an|the|my)\s+(?:(?:closer|close|quick|brief)\s+)?look\b/i;
const HYPOTHETICAL_OR_QUESTION = /\?|^\s*(?:what if|what happens if|should I|can I|could I|would it|may I|might I)\b/i;
const NEGATED_ACTION_PREFIX = /\b(?:don't|do not|never|not|can't|cannot|won't|wouldn't|shouldn't|didn't|did not|refuse to|avoid)\b[\s\S]{0,40}$/i;

export function hasAuthoritativeActionIntent(playerText: string): boolean {
  const normalized = playerText.replace(/\s+/g, " ").trim();
  if (!normalized || HYPOTHETICAL_OR_QUESTION.test(normalized) || NON_ACTION_LOOK_IDIOM.test(normalized)) return false;
  const actionMatch = AUTHORITATIVE_ACTION_INTENT.exec(normalized);
  if (!actionMatch || actionMatch.index === undefined) return false;
  return !NEGATED_ACTION_PREFIX.test(normalized.slice(0, actionMatch.index));
}

function compactToolDescription(tool: OpenRouterToolDefinition): string {
  const description = tool.function.description.replace(/\s+/g, " ").trim();
  const actionSchema = tool.function.parameters.properties.action as { enum?: unknown[] } | undefined;
  const actions = Array.isArray(actionSchema?.enum)
    ? actionSchema.enum.filter((value): value is string => typeof value === "string").slice(0, 16)
    : [];
  const summary = description.length > 180 ? `${description.slice(0, 177)}...` : description;
  return [summary || "Engine capability.", actions.length ? `Actions: ${actions.join(", ")}.` : ""]
    .filter(Boolean)
    .join(" ");
}

function buildToolDirectory(tools: readonly OpenRouterToolDefinition[]): string {
  return [
    "RPG MCP CAPABILITY DIRECTORY (selection only; successful tool results remain authoritative):",
    "Use activate_tools to expose the full schema for the smallest useful set. You can activate additional capabilities in a later round.",
    ...tools.map((tool) => `- ${tool.function.name}: ${compactToolDescription(tool)}`),
  ].join("\n");
}

function buildActivateToolsDefinition(tools: readonly OpenRouterToolDefinition[]): OpenRouterToolDefinition {
  return {
    type: "function",
    function: {
      name: ACTIVATE_TOOLS_NAME,
      description:
        "Expose full schemas for one or more RPG MCP capabilities on the next tool round. This is DM-controlled tool selection only and does not inspect or mutate game state.",
      parameters: {
        type: "object",
        properties: {
          names: {
            type: "array",
            items: { type: "string", enum: tools.map((tool) => tool.function.name) },
            description: "Capability names selected from the system directory.",
          },
        },
        required: ["names"],
      },
    },
  };
}

function seedRecentToolPalette(
  priorLog: readonly StoredLogMessage[],
  availableNames: ReadonlySet<string>,
): Set<string> {
  // Keep the first request cache-stable and immediately useful for ordinary
  // DM authoring. Rare capabilities remain opt-in through activate_tools;
  // recent successful tools can add a few more without replaying the whole
  // catalog on every turn.
  const selected = new Set<string>(CORE_TOOL_PALETTE.filter((name) => availableNames.has(name)));
  for (let index = priorLog.length - 1; index >= 0 && selected.size < RECENT_TOOL_PALETTE_LIMIT; index -= 1) {
    const entry = priorLog[index];
    if (entry?.kind !== "tool") continue;
    for (const call of entry.toolDisclosure?.calls ?? []) {
      if (call.accepted && availableNames.has(call.name) && !RECENT_TOOL_PALETTE_EXCLUSIONS.has(call.name)) {
        selected.add(call.name);
      }
      if (selected.size >= RECENT_TOOL_PALETTE_LIMIT) break;
    }
  }
  return selected;
}

function activateTools(
  args: Record<string, unknown>,
  activeNames: Set<string>,
  availableNames: ReadonlySet<string>,
): string {
  const requested = Array.isArray(args.names)
    ? args.names.filter((name): name is string => typeof name === "string")
    : [];
  const activated: string[] = [];
  const unknown: string[] = [];
  for (const name of requested) {
    if (!availableNames.has(name)) {
      unknown.push(name);
      continue;
    }
    if (!activeNames.has(name)) activated.push(name);
    activeNames.add(name);
  }
  return JSON.stringify({
    success: requested.length > 0 && unknown.length === 0,
    activated,
    active: [...activeNames],
    ...(unknown.length ? { unknown } : {}),
  });
}

function isDocketName(value: unknown): value is DocketName {
  return typeof value === "string" && (DOCKET_NAMES as readonly string[]).includes(value);
}

export class ReferenceDungeonMaster {
  public constructor(
    private readonly client: ReferenceEngineClient,
    private readonly store: ReferenceEngineStore,
    private readonly catalog: ReferenceEngineToolCatalog,
    private readonly adapter: ReferenceEngineAdapter,
    private readonly openRouter: {
      apiKey: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
      reasoningEffort?: string;
      maxTokens?: number;
      turnTimeoutMs?: number;
      usage?: LlmUsageStore;
    }
  ) {}

  public async resolveTurn(
    accountId: string,
    actorId: string,
    campaignId: string,
    playerText: string,
    options: ReferenceResolveTurnOptions = {}
  ): Promise<ReferenceTurnResult> {
    const routing = this.store.getRouting(accountId, campaignId);
    if (!routing || routing.backend !== "reference") throw new ReferenceEngineNotRoutedError(campaignId);

    const clientCommandId = options.clientCommandId ?? randomUUID();
    let commandStart: ReturnType<ReferenceEngineStore["beginReferenceCommand"]>;
    try {
      commandStart = this.store.beginReferenceCommand(
        accountId,
        campaignId,
        clientCommandId,
        options.expectedCampaignVersion,
        JSON.stringify({ playerText }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("cannot be reused")) {
        throw new ReferenceDmCommandIdReuseError();
      }
      throw error;
    }
    if (commandStart.status === "resolved") {
      return { ...(commandStart.result as ReferenceTurnResult), replayed: true };
    }
    if (commandStart.status === "processing") throw new ReferenceDmCommandInProgressError();
    if (commandStart.status === "failed") throw new ReferenceDmCommandAlreadyFailedError(commandStart.failure);
    if (commandStart.status === "conflict") throw new ReferenceDmVersionConflictError(commandStart.currentVersion);

    let toolRoundCount = 0;
    let providerCallCount = 0;
    const toolCallNames: string[] = [];
    const disclosedToolCalls: EngineToolCallDisclosure[] = [];
    let acceptedToolCalls = 0;
    let acceptedStateChangingToolCalls = 0;
    let rejectedToolCalls = 0;
    const rejectedStateChangingCallNames = new Set<string>();
    let rejectionRecoveryPending = false;
    let rejectionRecoveryNarrationReady = false;
    let narrationOnlyNext = false;
    let authoritativeToolCallObserved = false;
    let authoritativeRoutingRecoveryPending = false;
    const correlationId = randomUUID();
    const deadlineAt = this.openRouter.turnTimeoutMs && this.openRouter.turnTimeoutMs > 0
      ? Date.now() + this.openRouter.turnTimeoutMs
      : null;
    let failureRecorded = false;
    const failTurn = (cause: unknown, phase: string): ReferenceDmProviderUnavailableError => {
      failureRecorded = true;
      const failure = new ReferenceDmProviderUnavailableError(cause, {
        correlationId,
        commitStatus: acceptedStateChangingToolCalls > 0 ? "uncertain" : "not_committed",
        phase,
        toolRounds: toolRoundCount,
        toolCallNames: [...toolCallNames],
        acceptedToolCalls: acceptedStateChangingToolCalls,
      });
      this.store.failReferenceCommand(accountId, campaignId, clientCommandId, failure.details);
      return failure;
    };

    let turnAdmission: LlmUsageReservation | null = null;
    try {
      turnAdmission = this.openRouter.usage?.admitTurn({
        userId: accountId,
        campaignId,
        clientCommandId,
        provider: "openrouter",
        model: this.openRouter.model,
      }) ?? null;
    } catch (error) {
      throw failTurn(error, "admission");
    }

    try {
    const allRemoteTools = await this.catalog.getTools();
    const availableRemoteToolNames = new Set(allRemoteTools.map((tool) => tool.function.name));
    const activationTool = buildActivateToolsDefinition(allRemoteTools);
    const toolDirectory = buildToolDirectory(allRemoteTools);
    const requiresAuthoritativeToolChoice = hasAuthoritativeActionIntent(playerText);
    let narrationText: string | null = null;
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
    const campaignView = routing.referenceCharacterId
      ? (await this.adapter.getCampaign(accountId, actorId, campaignId)).campaign
      : null;
    const sheetContext = campaignView ? formatCharacterSheetContext(campaignView.character) : null;
    const authoritativeStateContext = campaignView ? formatAuthoritativeStateContext(campaignView) : null;

    const priorLog = this.store.getLogMessages(accountId, campaignId);
    const activeRemoteToolNames = seedRecentToolPalette(priorLog, availableRemoteToolNames);
    const activatedToolNames = new Set(activeRemoteToolNames);
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
      { role: "system", content: toolDirectory },
      ...(campaignContext ? [{ role: "system" as const, content: campaignContext }] : []),
      ...historyMessages,
      ...(sheetContext ? [{ role: "system" as const, content: sheetContext }] : []),
      ...(stateMemory ? [{ role: "system" as const, content: `CURRENT NARRATIVE STATE MEMORY (continuity only; RPG MCP results remain authoritative):\n${stateMemory}` }] : []),
      ...(authoritativeStateContext ? [{ role: "system" as const, content: authoritativeStateContext }] : []),
      { role: "user", content: playerText },
    ];

    try {
      // Reserve one completion after the final allowed tool-bearing round so
      // the DM can narrate the authored result instead of exhausting the
      // budget immediately after a valid tool call.
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const tools = [
          activationTool,
          ...allRemoteTools.filter((tool) => activeRemoteToolNames.has(tool.function.name)),
          ...DOCKET_TOOLS,
        ];
        this.store.touchReferenceCommand(accountId, campaignId, clientCommandId);
        const completion = await this.chatCompletion(messages, tools, deadlineAt, {
          userId: accountId,
          campaignId,
          clientCommandId,
          admittedTurn: true,
        }, narrationOnlyNext
          ? "none"
          : requiresAuthoritativeToolChoice && !authoritativeToolCallObserved
            ? "required"
            : "auto");
        providerCallCount += completion.providerCalls ?? 1;
        narrationOnlyNext = false;
        const toolCalls = completion.tool_calls ?? [];
        if (toolCalls.length === 0) {
          const candidate = completion.content?.trim() || "";
          if (rejectionRecoveryPending) {
            rejectionRecoveryPending = false;
            rejectionRecoveryNarrationReady = true;
            messages.push({
              role: "system",
              content: [
                "The previous draft was not published because an authoritative state-changing RPG MCP call was rejected.",
                `Rejected capability: ${[...rejectedStateChangingCallNames].join(", ")}.`,
                "Take one more DM completion now. Use the returned tool error as the boundary: repair the call if the player's intent still needs a commitment, or narrate the attempt failing/being blocked in diegetic D&D prose. Do not claim the rejected state change happened, and do not replace it with prose, a docket entry, or an agent proposal.",
              ].join(" "),
            });
            continue;
          }
          if (requiresAuthoritativeToolChoice && !authoritativeToolCallObserved && !rejectionRecoveryNarrationReady) {
            if (!authoritativeRoutingRecoveryPending) {
              authoritativeRoutingRecoveryPending = true;
              messages.push({ role: "assistant", content: candidate || null });
              messages.push({
                role: "system",
                content: "Internal DM routing correction: this turn contains an explicit state-changing action. The draft above is not final. Use the relevant RPG MCP tool or tools now, wait for their results, and only then narrate the changed situation. Do not substitute prose or improvisation for the authoritative engine call.",
              });
              continue;
            }
            throw new Error("The DM provider returned prose without an authoritative RPG MCP call for an explicit state-changing action.");
          }
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
          if (call.function.name === ACTIVATE_TOOLS_NAME) {
            const requestedNames = Array.isArray(callArgs.names)
              ? callArgs.names.filter((name): name is string => typeof name === "string" && availableRemoteToolNames.has(name))
              : [];
            for (const name of requestedNames) activatedToolNames.add(name);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: activateTools(callArgs, activeRemoteToolNames, availableRemoteToolNames),
            });
            continue;
          }
          const remoteOutcome: ReferenceToolOutcome =
            call.function.name === "read_docket" || call.function.name === "write_docket"
              ? this.callDocketTool(accountId, campaignId, call.function.name, callArgs)
              : await this.callRemoteTool(
                accountId,
                campaignId,
                clientCommandId,
                call.function.arguments,
                call.function.name,
                forcedArgs,
                fillOnlyArgs,
                knownCharacterIds,
                tenant,
                deadlineAt,
              );
          disclosedToolCalls.push(makeToolCallDisclosure(call.function.name, callArgs, remoteOutcome));
          if (remoteOutcome.accepted) acceptedToolCalls += 1;
          if (remoteOutcome.accepted && remoteOutcome.stateChanging) {
            acceptedStateChangingToolCalls += 1;
            authoritativeToolCallObserved = true;
          }
          if (!remoteOutcome.accepted) rejectedToolCalls += 1;
          if (!remoteOutcome.accepted && remoteOutcome.stateChanging) {
            rejectedStateChangingCallNames.add(call.function.name);
            rejectionRecoveryPending = true;
          }
          this.store.touchReferenceCommand(accountId, campaignId, clientCommandId);
          markAuthoredSceneState(authoredScene, call.function.name, callArgs, remoteOutcome);
          messages.push({ role: "tool", tool_call_id: call.id, content: remoteOutcome.text });
        }
        if (
          disclosedToolCalls.at(-1)?.name === "scene_manage"
          && disclosedToolCalls.at(-1)?.accepted
          && authoredScene.committedScene
          && !rejectionRecoveryPending
        ) {
          // The scene commit is the authoritative boundary between tool work
          // and prose. Keep the next provider call for narration, but do not
          // let a model that ignores the prompt start another paid tool round.
          narrationOnlyNext = true;
        }
      }
    } catch (error) {
      throw failTurn(error, "tool_loop");
    }

    if (!narrationText) {
      throw failTurn(
        new Error(
          `The reference-engine DM did not produce narration within the tool-call round budget (toolRounds=${toolRoundCount}, toolCalls=${toolCallNames.join(",") || "none"}).`
        ),
        "narration",
      );
    }

    try {
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
      const result: ReferenceTurnResult = {
        campaignId,
        clientCommandId,
        campaignVersion: version,
        narration: { text: narrationText, proposedFacts: [], suggestedActions: [] },
        narrationSource: "llm",
        toolDisclosure,
        session: campaign,
        replayed: false,
        ...(this.openRouter.usage
          ? { turnUsage: this.openRouter.usage.getCommandUsage(accountId, campaignId, clientCommandId) }
          : {}),
        diagnostics: {
          providerCalls: providerCallCount,
          toolRounds: toolRoundCount,
          activatedTools: [...activatedToolNames],
          toolCallNames: [...toolCallNames],
          acceptedToolCalls,
          acceptedStateChangingToolCalls,
          rejectedToolCalls,
        },
      };
      this.store.resolveReferenceCommand(accountId, campaignId, clientCommandId, result);
      return result;
    } catch (error) {
      throw failTurn(error, "commit");
    }
    } catch (error) {
      if (failureRecorded) throw error;
      throw failTurn(error, "context");
    } finally {
      if (turnAdmission) this.openRouter.usage?.release(turnAdmission.id);
    }
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
    accountId: string,
    campaignId: string,
    clientCommandId: string,
    rawArguments: string,
    toolName: string,
    forcedArgs: Record<string, unknown>,
    fillOnlyArgs: Record<string, unknown>,
    knownCharacterIds: Set<string>,
    tenant: TenantIdentity,
    deadlineAt: number | null = null
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
      return { text, accepted: false, stateChanging: false, payload: { error: "unknown_character_id" }, effectiveArguments: args };
    }
    const remainingMs = deadlineAt === null ? undefined : deadlineAt - Date.now();
    if (deadlineAt !== null && remainingMs !== undefined && remainingMs <= 0) {
      throw new Error("The reference-engine DM turn deadline expired before the next tool call.");
    }
    const nestedAgentCall = toolName === "agent_manage" && args.action === "invoke";
    let nestedReservation: LlmUsageReservation | null = null;
    if (nestedAgentCall && this.openRouter.usage) {
      const policy = this.openRouter.usage.getPolicy();
      const estimatedPromptTokens = Math.ceil(estimateLlmTokens(args) * 1.25);
      nestedReservation = this.openRouter.usage.reserve({
        userId: accountId,
        campaignId,
        clientCommandId,
        source: "npc_agent",
        provider: "openrouter",
        model: this.openRouter.model,
        estimatedPromptTokens,
        estimatedCompletionTokens: Math.max(1, Math.ceil(policy.npcReserveCostMicros / Math.max(0.01, policy.outputCostUsdPerMillion))),
        estimatedCostMicros: policy.npcReserveCostMicros,
        admittedTurn: true,
      });
    }
    try {
      const result = await this.client.callTool(toolName, args, tenant, remainingMs);
      const usage = nestedAgentCall && nestedReservation
        ? extractNestedAgentUsage(result.payload, this.openRouter.usage!, nestedReservation)
        : undefined;
      if (nestedReservation) {
        if (usage) this.openRouter.usage!.settle(nestedReservation.id, usage);
        else this.openRouter.usage!.release(nestedReservation.id);
      }
      collectCharacterIds(result.payload, knownCharacterIds);
      return {
        text: result.text || JSON.stringify(result.payload ?? {}),
        accepted: remoteResultAccepted(result.payload, result.isError),
        stateChanging: isStateChangingReferenceTool(toolName, args),
        payload: result.payload,
        effectiveArguments: args,
        ...(usage ? { usage } : {}),
      };
    } catch (error) {
      if (nestedReservation) this.openRouter.usage!.release(nestedReservation.id);
      throw error;
    }
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
      stateChanging: toolName === "write_docket" && isDocketName(args.name),
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
    tools: OpenRouterToolDefinition[],
    deadlineAt: number | null = null,
    usageContext?: DmUsageContext,
    toolChoice: "auto" | "none" | "required" = "auto",
  ): Promise<ChatCompletionResult> {
    let providerCalls = 0;
    const attempt = async (): Promise<ChatCompletionResult> => {
      providerCalls += 1;
      return this.chatCompletionOnce(messages, tools, deadlineAt, usageContext, toolChoice);
    };
    try {
      const result = await attempt();
      return { ...result, providerCalls };
    } catch (error) {
      if (!(error instanceof EmptyCompletionError)) throw error;
      console.error(`[reference-dm] retrying after empty OpenRouter completion: ${error.message}`);
      const result = await attempt();
      return { ...result, providerCalls };
    }
  }

  private async chatCompletionOnce(
    messages: ChatMessage[],
    tools: OpenRouterToolDefinition[],
    deadlineAt: number | null = null,
    usageContext?: DmUsageContext,
    toolChoice: "auto" | "none" | "required" = "auto",
  ): Promise<ChatCompletionResult> {
    const remainingMs = deadlineAt === null
      ? this.openRouter.timeoutMs
      : Math.min(this.openRouter.timeoutMs, deadlineAt - Date.now());
    if (remainingMs <= 0) throw new Error("The reference-engine DM turn deadline expired.");
    const maxTokens = this.openRouter.maxTokens !== undefined
      ? Math.max(1, Math.floor(this.openRouter.maxTokens))
      : undefined;
    const reasoningModel = /(?:gpt-5|o[1-9]|reasoning|luna)/i.test(this.openRouter.model);
    const body: Record<string, unknown> = {
      model: this.openRouter.model,
      messages,
      tools,
      tool_choice: toolChoice,
      ...(maxTokens === undefined ? {} : { [reasoningModel ? "max_completion_tokens" : "max_tokens"]: maxTokens }),
      ...(reasoningModel && this.openRouter.reasoningEffort ? { reasoning_effort: this.openRouter.reasoningEffort } : {}),
    };
    const usageStore = this.openRouter.usage;
    const estimatedPromptTokens = Math.ceil(estimateLlmTokens({ messages, tools }) * 1.25);
    const reservation = usageStore && usageContext
      ? usageStore.reserve({
        userId: usageContext.userId,
        campaignId: usageContext.campaignId,
        clientCommandId: usageContext.clientCommandId,
        source: "dm",
        provider: "openrouter",
        model: this.openRouter.model,
        estimatedPromptTokens,
        estimatedCompletionTokens: maxTokens ?? 900,
        estimatedCostMicros: usageStore.estimateCostMicros(estimatedPromptTokens, maxTokens ?? 900),
        admittedTurn: usageContext.admittedTurn,
      })
      : null;
    try {
      const response = await fetch(`${this.openRouter.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.openRouter.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: remainingMs > 0 ? AbortSignal.timeout(remainingMs) : undefined,
      });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => "");
        throw new Error(`OpenRouter request failed with status ${response.status}: ${responseBody.slice(0, 500)}`);
      }
      const data = (await response.json()) as {
        id?: string;
        choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatMessage["tool_calls"] }; finish_reason?: string }>;
        usage?: ChatCompletionUsageEnvelope;
        error?: { message?: string; code?: unknown };
      };
      const message = data.choices?.[0]?.message;
      const actualUsage = reservation
        ? buildCompletionUsage(data, message, usageStore!, reservation, this.openRouter.model)
        : undefined;
      if (reservation && actualUsage) usageStore!.settle(reservation.id, actualUsage);
      if (!message) {
        throw new EmptyCompletionError(
          `id=${data.id ?? "?"} finish_reason=${data.choices?.[0]?.finish_reason ?? "?"} error=${JSON.stringify(data.error ?? null)}`
        );
      }
      return { content: message.content ?? null, tool_calls: message.tool_calls, ...(actualUsage ? { usage: actualUsage } : {}) };
    } catch (error) {
      if (reservation) usageStore!.release(reservation.id);
      throw error;
    }
  }
}

class EmptyCompletionError extends Error {}

function buildCompletionUsage(
  data: {
    id?: string;
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatMessage["tool_calls"] } }>;
    usage?: ChatCompletionUsageEnvelope;
  },
  message: { content?: string | null; tool_calls?: ChatMessage["tool_calls"] } | undefined,
  usageStore: LlmUsageStore,
  reservation: LlmUsageReservation,
  model: string,
): LlmUsageActual {
  const envelope = data.usage ?? {};
  const promptTokens = nonnegativeTokenCount(envelope.prompt_tokens) || reservation.estimatedPromptTokens;
  const cachedPromptTokens = nonnegativeTokenCount(envelope.prompt_tokens_details?.cached_tokens);
  const completionTokens = nonnegativeTokenCount(envelope.completion_tokens)
    || estimateLlmTokens({ content: message?.content ?? null, tool_calls: message?.tool_calls ?? [] });
  const reasoningTokens = nonnegativeTokenCount(envelope.completion_tokens_details?.reasoning_tokens);
  const totalTokens = nonnegativeTokenCount(envelope.total_tokens) || promptTokens + completionTokens;
  let costMicros: number;
  let costSource: LlmUsageActual["costSource"];
  if (typeof envelope.cost === "number" && Number.isFinite(envelope.cost)) {
    costMicros = usdToMicros(envelope.cost);
    costSource = "provider";
  } else if (typeof envelope.cost_details?.upstream_inference_cost === "number"
    && Number.isFinite(envelope.cost_details.upstream_inference_cost)) {
    costMicros = usdToMicros(envelope.cost_details.upstream_inference_cost);
    costSource = "provider_upstream";
  } else {
    costMicros = usageStore.estimateCostMicros(promptTokens, completionTokens);
    costSource = "estimated";
  }
  return {
    provider: "openrouter",
    model,
    providerRequestId: data.id ?? null,
    promptTokens,
    cachedPromptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens,
    costMicros,
    costSource,
  };
}

function extractNestedAgentUsage(
  payload: unknown,
  usageStore: LlmUsageStore,
  reservation: LlmUsageReservation,
): LlmUsageActual | null {
  const record = recordValue(payload);
  const nested = recordValue(record.data);
  const source = Object.keys(nested).length > 0 ? nested : record;
  const promptTokens = nonnegativeTokenCount(source.promptTokens);
  const completionTokens = nonnegativeTokenCount(source.completionTokens);
  const totalTokens = nonnegativeTokenCount(source.totalTokens) || promptTokens + completionTokens;
  const hasUsage = promptTokens > 0 || completionTokens > 0 || typeof source.costUsd === "number";
  if (!hasUsage) return null;
  const costUsd = typeof source.costUsd === "number" && Number.isFinite(source.costUsd) ? source.costUsd : null;
  const accountedPromptTokens = promptTokens || reservation.estimatedPromptTokens;
  const accountedCompletionTokens = completionTokens || reservation.estimatedCompletionTokens;
  return {
    provider: typeof source.provider === "string" ? source.provider : "openrouter",
    model: typeof source.model === "string" ? source.model : "unknown-agent-model",
    providerRequestId: typeof source.callId === "string" ? source.callId : null,
    promptTokens: accountedPromptTokens,
    completionTokens: accountedCompletionTokens,
    reasoningTokens: nonnegativeTokenCount(source.reasoningTokens),
    totalTokens: totalTokens || accountedPromptTokens + accountedCompletionTokens,
    costMicros: costUsd === null
      ? usageStore.estimateCostMicros(accountedPromptTokens, accountedCompletionTokens)
      : usdToMicros(costUsd),
    costSource: source.costSource === "provider" || source.costSource === "provider_upstream"
      ? source.costSource
      : "estimated",
  };
}

function nonnegativeTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

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

/** Renders the compact authoritative projection used to arbitrate durable facts in replayed prose. */
function formatAuthoritativeStateContext(campaign: EngineSessionView): string {
  const inventory = campaign.character.inventory
    .map((item) => `${item.authoredDefinition?.name ?? item.id} x${item.quantity}${item.equipped ? " (equipped)" : ""}`)
    .join(", ");
  const quests = campaign.quests
    .map((quest) => `${quest.id} ${quest.title} [${quest.status}, ${quest.progress}%]`)
    .join(" | ");

  return [
    "CURRENT AUTHORITATIVE ENGINE PROJECTION (read before repairing history; this outranks prior narration and narrative memory):",
    `Player inventory (authoritative possession): ${inventory || "empty"}. An item not listed is not possessed; equipped markers are authoritative.`,
    `Campaign quest summary (authoritative title/status/progress only): ${quests || "none"}. Objective IDs are not included here; read quest_manage.get_log before updating or completing an objective.`,
    "Party membership and committed scene are not included in this compatibility projection; read party_manage or scene_manage before relying on those facts, and do not infer that none exists.",
    "Use this projection to distinguish durable facts that exist from prose that only proposed them. If the player asks for a missing durable fact, author it with the relevant RPG MCP tool before narration.",
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
