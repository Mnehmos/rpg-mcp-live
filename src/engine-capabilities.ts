import {
  engineCapabilityFamilyIdSchema,
  type EngineCapabilityFamilyId,
  type EngineCampaignPhase,
  type EngineToolName,
  type LanternCampaignState,
} from "./engine-contracts.js";
import {
  lanternToolDefinitions,
  type EngineToolDefinition,
} from "./engine-tools.js";

/**
 * The small surface sent on the first DM request.  These tools are either
 * context reads or the common, low-risk proposals needed to orient a turn.
 * The full engine registry remains in engine-tools.ts; this list only changes
 * what the model can see on a particular request.
 */
export const engineCoreToolNames = [
  "campaign_context",
  "capability_load",
  "observe",
  "character_sheet",
  "world_context",
  "content_compile",
  "player_notes",
  "player_note_add",
  "roll_check",
  "challenge_attempt",
  "move",
  "quest_create",
  "death_save",
  "campaign_beat",
  "improvise",
  "character_roll_stats",
  "character_create",
  "character_update",
  "tutorial_advance",
] as const satisfies readonly EngineToolName[];

type CapabilityAuthority = "read" | "propose" | "resolve";

export interface EngineCapabilityFamily {
  id: EngineCapabilityFamilyId;
  revision: number;
  description: string;
  promptlet: string;
  phases: readonly EngineCampaignPhase[];
  visibility: "dm";
  requiredCapabilities: readonly ["dm"];
  authority: CapabilityAuthority;
  toolNames: readonly EngineToolName[];
}

export interface EngineCapabilityDescriptor extends Omit<EngineCapabilityFamily, "toolNames"> {
  toolNames: readonly EngineToolName[];
  toolCount: number;
  schemaBytes: number;
  estimatedSchemaTokens: number;
}

const family = (
  id: EngineCapabilityFamilyId,
  description: string,
  promptlet: string,
  phases: readonly EngineCampaignPhase[],
  authority: CapabilityAuthority,
  toolNames: readonly EngineToolName[],
): EngineCapabilityFamily => ({
  id,
  revision: 2,
  description,
  promptlet,
  phases,
  visibility: "dm",
  requiredCapabilities: ["dm"],
  authority,
  toolNames,
});

const allPhases: readonly EngineCampaignPhase[] = ["character_creation", "tutorial", "sandbox"];

/** One reviewed family registry; the tool registry itself remains authoritative. */
export const engineCapabilityFamilies: readonly EngineCapabilityFamily[] = [
  family(
    "rules",
    "Pinned rules and source-backed character/content lookup.",
    "RULES CAPABILITY (rev 2). Use rules_reference for exact rulings and content_search/content_get for definitions. Stay inside the campaign's pinned game system and sources. Fidelity tier 0 is reference-only, tier 1 resolves only typed fields, and tier 2 may execute its reviewed program. Never fill a missing mechanical field from memory.",
    allPhases,
    "read",
    ["content_search", "content_get", "rules_reference", "character_options"],
  ),
  family(
    "exploration",
    "Travel, world-object interaction, notices, and bounded situations.",
    "EXPLORATION CAPABILITY (rev 2). Traverse only persisted open exits and interact through stable object affordances. Travel owns elapsed time, supplies, weather, random events, deadlines, and clocks. A broad search may reveal only canonical or previously authorized evidence; it cannot create the requested item, exit, trap, enemy, or treasure. Formal notices and authored situations are typed state: commit their safe terms, truths, clues, roles, pressure, and outcomes before portraying them.",
    allPhases,
    "resolve",
    [
      "procedural_notice",
      "travel",
      "interact",
      "situation_context",
      "situation_create",
      "situation_visit",
      "situation_clue_attempt",
      "situation_ignore",
      "situation_choose",
    ],
  ),
  family(
    "social",
    "NPC context, social checks, contests, and NPC turns.",
    "SOCIAL CAPABILITY (rev 2). Portray every present NPC directly from actor-safe knowledge, goals, relationships, and current state. Answer an ordinary question in character when the NPC can answer; refusal, uncertainty, a lie, or a counteroffer is still a concrete answer. Use a social check only for meaningful uncertainty, and set actingNpcId when an established NPC acts for the player. Never let pleasing prose silently rewrite established hostility, loyalty, trust, or commitment; persist only durable consequences.",
    allPhases,
    "resolve",
    ["npc_context", "social_check", "npc_tick", "social_action"],
  ),
  family(
    "commerce",
    "Merchant, inventory, equipment, and item ownership actions.",
    "COMMERCE CAPABILITY (rev 2). Read merchant_catalog before trading. Commit purchases, sales, negotiated explicit prices, inventory transfers, equipment, drops, and uses through their typed operations. Ownership, stock, currency arithmetic, and item state are authoritative; never imply a completed exchange in prose alone.",
    ["sandbox"],
    "resolve",
    ["merchant_catalog", "merchant_trade", "inventory", "inventory_transfer", "equip_item", "unequip_item", "drop_item", "use_item"],
  ),
  family(
    "quests",
    "Quest progress, advancement, and reviewed downtime projects.",
    "QUESTS CAPABILITY (rev 2). Advance graph quests only through committed predicates and quest_transition; legacy flat quests may use quest_update. Pending advancement uses the exact server preview and id. Projects use reviewed definitions. Never author level, HP, proficiency, slots, rewards, elapsed time, or completion in prose.",
    ["tutorial", "sandbox"],
    "resolve",
    ["quest_progress", "quest_transition", "quest_update", "advancement_confirm", "project"],
  ),
  family(
    "combat",
    "Encounter lifecycle, tactical turns, creature actions, loot, and rest.",
    "COMBAT CAPABILITY (rev 2). Start opposition from exact installed creature content keys and fictionally established distances; never invent or copy stats. Read combat_state, use the active combatant and source-backed action keys, and obey turn, range, reaction, condition, morale, custody, loot, rest, and action-economy results. A tier or legality rejection means no mechanical effect occurred. Narrate the committed combat result as physical consequence, with exact mechanics secondary.",
    ["sandbox"],
    "resolve",
    ["combat_state", "combat_start", "encounter_decision", "custody_action", "spawn_creature", "combat_action", "combat_move", "end_turn", "advance_turn", "npc_advance", "loot", "rest"],
  ),
  family(
    "magic",
    "Reviewed spell learning, preparation, casting, and reactions.",
    "MAGIC CAPABILITY (rev 2). Use exact installed spell keys for learning, preparation, casting, and reactions. The spell engine owns eligibility, slots, action economy, concentration, range, targets, attacks, saves, damage, and defenses. Never guess an effect after a fidelity rejection. New executable spells use content_compile synthesis from one reviewed damage primitive; omit caller-authored mechanics.",
    ["sandbox"],
    "resolve",
    ["learn_spell", "prepare_spell", "cast_spell", "reaction_response"],
  ),
  family(
    "party",
    "Controlled actors and bounded party viewpoint/split operations.",
    "PARTY CAPABILITY (rev 2). Read controlled_actor_context or party_context before coordination. Active viewpoint changes presentation, never authority; knowledge absent from that actor remains unavailable. Use typed split, rejoin, transfer, group-check, command, create, and dismiss operations. Never author companion stats, HP, senses, inventory, duration, initiative, or action cost.",
    ["sandbox"],
    "resolve",
    ["controlled_actor_context", "party_context", "party_create", "party_set_viewpoint", "party_split", "party_rejoin", "party_shared_transfer", "party_group_check", "controlled_actor_create", "controlled_actor_command", "controlled_actor_dismiss"],
  ),
];

const familyById = new Map(engineCapabilityFamilies.map((definition) => [definition.id, definition]));
const coreToolSet = new Set<EngineToolName>(engineCoreToolNames);
const definitionByName = new Map(lanternToolDefinitions.map((definition) => [definition.function.name, definition]));

function schemaBytes(definitions: readonly EngineToolDefinition[]): number {
  return JSON.stringify(definitions).length;
}

function assertCapabilityRegistry(): void {
  const modelFacingNames = new Set(lanternToolDefinitions.map((definition) => definition.function.name));
  const assigned = new Set<EngineToolName>();
  for (const name of engineCoreToolNames) {
    if (!modelFacingNames.has(name)) throw new Error(`Core capability tool is missing from the engine registry: ${name}`);
    if (!assigned.add(name)) throw new Error(`Duplicate core capability tool: ${name}`);
  }
  for (const definition of engineCapabilityFamilies) {
    for (const name of definition.toolNames) {
      if (!modelFacingNames.has(name)) throw new Error(`Capability tool is missing from the engine registry: ${name}`);
      if (!assigned.add(name)) throw new Error(`Tool appears in more than one capability family: ${name}`);
    }
  }
  const unassigned = [...modelFacingNames].filter((name) => !assigned.has(name));
  if (unassigned.length) throw new Error(`Model-facing tools are not assigned to a capability surface: ${unassigned.join(", ")}`);
}

assertCapabilityRegistry();

export function capabilityDescriptor(id: EngineCapabilityFamilyId): EngineCapabilityDescriptor {
  const definition = familyById.get(id);
  if (!definition) throw new Error(`Unknown capability family: ${id}`);
  const definitions = definition.toolNames.map((name) => definitionByName.get(name)!);
  const bytes = schemaBytes(definitions);
  return {
    ...definition,
    toolCount: definitions.length,
    schemaBytes: bytes,
    estimatedSchemaTokens: Math.ceil(bytes / 4),
  };
}

export function engineCapabilityDescriptors(): readonly EngineCapabilityDescriptor[] {
  return engineCapabilityFamilies.map((definition) => capabilityDescriptor(definition.id));
}

export function engineCoreToolDefinitions(): readonly EngineToolDefinition[] {
  return lanternToolDefinitions.filter((definition) => coreToolSet.has(definition.function.name));
}

export function engineToolDefinitionsForLoadedCapabilities(
  loadedFamilies: readonly EngineCapabilityFamilyId[],
): readonly EngineToolDefinition[] {
  const visible = new Set<EngineToolName>(engineCoreToolNames);
  for (const id of loadedFamilies) {
    for (const name of familyById.get(id)?.toolNames ?? []) visible.add(name);
  }
  return lanternToolDefinitions.filter((definition) => visible.has(definition.function.name));
}

export function capabilitySchemaOverhead(): {
  fullToolCount: number;
  fullSchemaBytes: number;
  coreToolCount: number;
  coreSchemaBytes: number;
  estimatedFullSchemaTokens: number;
  estimatedCoreSchemaTokens: number;
} {
  const core = engineCoreToolDefinitions();
  const fullSchemaBytes = schemaBytes(lanternToolDefinitions);
  const coreSchemaBytes = schemaBytes(core);
  return {
    fullToolCount: lanternToolDefinitions.length,
    fullSchemaBytes,
    coreToolCount: core.length,
    coreSchemaBytes,
    estimatedFullSchemaTokens: Math.ceil(fullSchemaBytes / 4),
    estimatedCoreSchemaTokens: Math.ceil(coreSchemaBytes / 4),
  };
}

export function isCapabilityFamilyAllowed(
  id: EngineCapabilityFamilyId,
  state: Pick<LanternCampaignState, "phase">,
  capabilities: readonly string[],
): boolean {
  const definition = familyById.get(id);
  return Boolean(
    definition
      && capabilities.includes("dm")
      && definition.requiredCapabilities.every((capability) => capabilities.includes(capability))
      && definition.phases.includes(state.phase),
  );
}

export function isToolVisibleForLoadedCapabilities(
  toolName: EngineToolName,
  loadedFamilies: readonly EngineCapabilityFamilyId[],
): boolean {
  if (coreToolSet.has(toolName)) return true;
  return loadedFamilies.some((id) => familyById.get(id)?.toolNames.includes(toolName) ?? false);
}

export function capabilityFamilyForToolName(toolName: EngineToolName): EngineCapabilityFamilyId | null {
  for (const definition of engineCapabilityFamilies) {
    if (definition.toolNames.includes(toolName)) return definition.id;
  }
  return null;
}

export function capabilityLoadResult(id: EngineCapabilityFamilyId): EngineCapabilityDescriptor {
  return capabilityDescriptor(id);
}

export function parseCapabilityFamilyId(value: unknown): EngineCapabilityFamilyId | null {
  const parsed = engineCapabilityFamilyIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
