import { randomUUID } from "node:crypto";
import { ReferenceEngineAdapter, ReferenceEngineNotRoutedError } from "./reference-engine-adapter.js";
import type { ReferenceEngineClient } from "./reference-engine-client.js";
import type { TenantIdentity } from "./reference-engine-tenant.js";
import { DOCKET_NAMES, type DocketName, type ReferenceEngineStore, type StoredLogMessage } from "./reference-engine-store.js";
import type { ReferenceEngineToolCatalog, OpenRouterToolDefinition } from "./reference-engine-tools.js";
import type { EngineAbility, EngineCharacterView, EngineSessionView } from "./engine-contracts.js";

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
const MAX_TOOL_ROUNDS = 12;

export const REFERENCE_DM_WORLD_AUTHORING_PROTOCOL = [
  "Every player turn is intent, not a pre-existing world description. The player drives what happens next; you invent the concrete world that makes that intent playable.",
  "There are no rooms, locations, NPCs, enemies, items, quests, clues, or other world facts until the DM authors them through an RPG MCP tool and a successful tool result commits them to engine state.",
  "Never ask the player to provide a missing location, NPC, enemy, or situation merely because it has not been established. Invent a fitting one from the campaign profile, player intent, and current pressures, then commit it before narration.",
  "Do not wait for the engine to reject an absent fact and do not answer with a deterministic absence check. Treat every player intent as an invitation to author the next playable situation; inspect current state, make the creative decision, call the relevant tools, and keep the flow in-world.",
  "Use spatial_manage generate and move for places and player placement; npc_manage create or spawn_manage for NPCs and populated locations; combat_manage spawn_quick_enemy or spawn_manage for enemies and encounters; item_manage and inventory_manage for authored objects and possession; quest_manage for durable quests; and scene_manage set for the DM-authored shared scene frame.",
  "A player mention is an invitation or intent, not proof that a named place, person, enemy, or object exists. Previous DM prose is continuity only; successful RPG MCP results are the authority.",
  "For every turn that advances the shared fiction, commit the new or changed world facts through the appropriate engine tools, then commit the resulting DM scene with scene_manage action set using the player's character as a participant. Only after those tool results succeed may you narrate them.",
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
    // values the model has actually learned from a real tool result in this
    // turn (or the player's own bound character); anything else is rejected
    // before it reaches the network, the same "engine validates, never
    // trusts the model" discipline the adapter already applies elsewhere.
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

    // Prior turns are never replayed as actual tool-call/tool-result pairs
    // here (that history isn't retained — see this file's class doc "known,
    // disclosed MVP gap" note), only as narration text. That's sufficient
    // for narrative continuity, which is what was actually missing: without
    // this, every turn started a brand-new conversation with just the
    // current playerText, so the model had no memory of anything said or
    // narrated before it and would confabulate ("this is the first
    // conversation turn") rather than recall it.
    const priorLog = this.store.getLogMessages(accountId, campaignId);
    const authoredScene = emptyAuthoredSceneState();
    const campaignContext = formatCampaignProfile(routing.campaignProfileJson);
    const stateMemory = this.store.getDocket(accountId, campaignId, "state");
    const historyMessages: ChatMessage[] = priorLog
      .filter((entry): entry is StoredLogMessage & { kind: "player" | "narration" } => entry.kind === "player" || entry.kind === "narration")
      .map((entry) => ({ role: entry.kind === "player" ? "user" : "assistant", content: entry.text }) as ChatMessage);

    const messages: ChatMessage[] = [
      { role: "system", content: REFERENCE_DM_SYSTEM_PROMPT },
      ...(sheetContext ? [{ role: "system" as const, content: sheetContext }] : []),
      ...(campaignContext ? [{ role: "system" as const, content: campaignContext }] : []),
      ...(stateMemory ? [{ role: "system" as const, content: `CURRENT NARRATIVE STATE MEMORY (continuity only; RPG MCP results remain authoritative):\n${stateMemory}` }] : []),
      ...historyMessages,
      { role: "user", content: playerText },
    ];

    let narrationText: string | null = null;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const completion = await this.chatCompletion(messages, tools);
        const toolCalls = completion.tool_calls ?? [];
        if (toolCalls.length === 0) {
          const candidate = completion.content?.trim() || "";
          narrationText = candidate || null;
          break;
        }
        messages.push({ role: "assistant", content: completion.content ?? null, tool_calls: toolCalls });
        for (const call of toolCalls) {
          const callArgs = parseArguments(call.function.arguments);
          const remoteOutcome: ReferenceToolOutcome =
            call.function.name === "read_docket" || call.function.name === "write_docket"
              ? { text: this.handleDocketTool(accountId, campaignId, call.function.name, callArgs), accepted: true, payload: null }
              : await this.callRemoteTool(call.function.arguments, call.function.name, forcedArgs, fillOnlyArgs, knownCharacterIds, tenant);
          markAuthoredSceneState(authoredScene, call.function.name, callArgs, remoteOutcome);
          messages.push({ role: "tool", tool_call_id: call.id, content: remoteOutcome.text });
        }
      }
    } catch (error) {
      throw new ReferenceDmProviderUnavailableError(error);
    }

    if (!narrationText) {
      throw new ReferenceDmProviderUnavailableError(
        new Error("The reference-engine DM did not produce narration within the tool-call round budget.")
      );
    }

    if (authoredScene.roomId) {
      this.persistAuthoredSceneState(accountId, campaignId, authoredScene);
    }

    const version = this.store.bumpVersion(accountId, campaignId);
    const now = new Date().toISOString();
    const logMessages: StoredLogMessage[] = [
      { id: randomUUID(), kind: "player", text: playerText, createdAt: now },
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
    const args = forceArgs(fillMissingArgs(parseArguments(rawArguments), fillOnlyArgs), forcedArgs);
    const requestedCharacterId = args.characterId;
    if (typeof requestedCharacterId === "string" && requestedCharacterId && !knownCharacterIds.has(requestedCharacterId)) {
      const text = JSON.stringify({
        error:
          "Unknown characterId. Only use a characterId you learned from an actual tool result earlier in this turn " +
          "(e.g. from create/list/get), or omit it to target your own character.",
      });
      return { text, accepted: false, payload: { error: "unknown_character_id" } };
    }
    const result = await this.client.callTool(toolName, args, tenant);
    collectCharacterIds(result.payload, knownCharacterIds);
    return {
      text: result.text || JSON.stringify(result.payload ?? {}),
      accepted: remoteResultAccepted(result.payload, result.isError),
      payload: result.payload,
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
  return record.success !== false && record.error === undefined;
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
