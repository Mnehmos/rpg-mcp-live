import type { ReferenceEngineClient } from "./reference-engine-client.js";

/**
 * The reference engine's ~31 consolidated action-routed tools, as of the
 * checkout audited for this integration (src/server/consolidated/index.ts in
 * mnehmos.rpg.mcp). There is no reliable enumeration endpoint — search_tools
 * paginates by relevance/category rather than listing everything — so this
 * list is curated by hand and fetched via load_tool_schema at boot. Update it
 * if the reference engine's tool set changes.
 */
export const REFERENCE_ENGINE_TOOL_NAMES = [
  "character_manage",
  "party_manage",
  "combat_manage",
  "combat_action",
  "combat_map",
  "item_manage",
  "inventory_manage",
  "corpse_manage",
  "theft_manage",
  "world_manage",
  "world_map",
  "spatial_manage",
  "spawn_manage",
  "scene_manage",
  "quest_manage",
  "npc_manage",
  "agent_manage",
  "aura_manage",
  "scroll_manage",
  "rest_manage",
  "concentration_manage",
  "secret_manage",
  "narrative_manage",
  "improvisation_manage",
  "math_manage",
  "session_manage",
  "travel_manage",
] as const;

export type ReferenceEngineToolName = (typeof REFERENCE_ENGINE_TOOL_NAMES)[number];

/** The reference engine's own load_tool_schema field shape (not standard JSON Schema). */
interface ReferenceSchemaField {
  type: string;
  description?: string;
  optional?: boolean;
  default?: unknown;
  values?: string[];
  itemType?: ReferenceSchemaField;
  properties?: Record<string, ReferenceSchemaField>;
}

interface LoadToolSchemaResult {
  toolName: string;
  description: string;
  inputSchema: Record<string, ReferenceSchemaField>;
}

/** OpenAI/OpenRouter tool-call format. */
export interface OpenRouterToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

const JSON_SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "array", "object", "null"]);

function convertField(field: ReferenceSchemaField): Record<string, unknown> {
  if (field.values) {
    return { type: "string", enum: field.values, description: field.description };
  }
  if (field.type === "array") {
    return {
      type: "array",
      description: field.description,
      items: field.itemType ? convertField(field.itemType) : {},
    };
  }
  if (field.type === "object" && field.properties) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [name, sub] of Object.entries(field.properties)) {
      properties[name] = convertField(sub);
      if (!sub.optional) required.push(name);
    }
    return { type: "object", description: field.description, properties, required };
  }
  const jsonType = field.type === "enum" ? "string" : field.type;
  if (!JSON_SCHEMA_TYPES.has(jsonType)) {
    // The reference engine's schema reporter has no JSON Schema equivalent
    // for its own "any" fields (e.g. combat_manage's terrain/participants/
    // savingThrow, backed by z.any()). Passing that through as a literal
    // `type: "any"` gets the whole tool definition rejected by OpenAI's
    // function-calling validator ("'any' is not valid under any of the
    // given schemas"). An empty schema has no `type` constraint and is
    // valid JSON Schema for "accepts anything".
    return { description: field.description };
  }
  return { type: jsonType, description: field.description };
}

function convertToolSchema(result: LoadToolSchemaResult): OpenRouterToolDefinition {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, field] of Object.entries(result.inputSchema)) {
    properties[name] = convertField(field);
    if (!field.optional) required.push(name);
  }
  return {
    type: "function",
    function: {
      name: result.toolName,
      description: result.description,
      parameters: { type: "object", properties, required },
    },
  };
}

/**
 * Fetches and caches the reference engine's tool schemas (via its
 * load_tool_schema meta-tool), converted to OpenRouter tool-call format for
 * ReferenceDungeonMaster's LLM tool-loop. Meta-tools return plain JSON text
 * (not the RichFormatter <!-- TAG_JSON --> convention consolidated tools
 * use), so this reads `result.text` directly rather than `result.data`.
 */
export class ReferenceEngineToolCatalog {
  private tools: OpenRouterToolDefinition[] | null = null;
  private loading: Promise<OpenRouterToolDefinition[]> | null = null;

  public constructor(
    private readonly client: ReferenceEngineClient,
    private readonly toolNames: readonly string[] = REFERENCE_ENGINE_TOOL_NAMES
  ) {}

  public async getTools(): Promise<OpenRouterToolDefinition[]> {
    if (this.tools) return this.tools;
    if (!this.loading) {
      this.loading = this.load().catch((error) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  public async getTool(name: string): Promise<OpenRouterToolDefinition | undefined> {
    const tools = await this.getTools();
    return tools.find((tool) => tool.function.name === name);
  }

  private async load(): Promise<OpenRouterToolDefinition[]> {
    const tools = await Promise.all(
      this.toolNames.map(async (toolName) => {
        const result = await this.client.callTool("load_tool_schema", { toolName });
        // load_tool_schema returns an empty content[] and places its payload
        // as sibling fields on the raw JSON-RPC result instead (see
        // ReferenceToolCallResult.raw) — a non-standard shape confirmed live
        // against the deployed reference engine.
        const parsed = result.raw as LoadToolSchemaResult;
        return convertToolSchema(parsed);
      })
    );
    this.tools = tools;
    return tools;
  }
}
