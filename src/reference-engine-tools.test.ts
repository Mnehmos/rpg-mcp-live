import { describe, expect, it, vi } from "vitest";
import { ReferenceEngineToolCatalog } from "./reference-engine-tools.js";
import type { ReferenceEngineClient, ReferenceToolCallResult } from "./reference-engine-client.js";

// Fixture captured live from the deployed mnehmos-rpg-mcp service's load_tool_schema.
const CHARACTER_MANAGE_SCHEMA = {
  toolName: "character_manage",
  description: "Manage characters and progression.",
  inputSchema: {
    action: { type: "string", description: "Action: create, get, update, list, delete, add_xp, get_progression, level_up" },
    name: { type: "string", optional: true },
    class: { type: "string", optional: true },
    stats: {
      type: "object",
      optional: true,
      properties: {
        str: { type: "number", optional: true, default: 10 },
        dex: { type: "number", optional: true, default: 10 },
      },
    },
    characterType: { type: "enum", values: ["pc", "npc", "enemy", "neutral"], optional: true },
    knownSpells: { type: "array", itemType: { type: "string" }, optional: true },
  },
};

function fakeClient(schemasByTool: Record<string, unknown>): ReferenceEngineClient {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>): Promise<ReferenceToolCallResult> => {
      expect(name).toBe("load_tool_schema");
      const toolName = args.toolName as string;
      const schema = schemasByTool[toolName];
      if (!schema) throw new Error(`no fixture for ${toolName}`);
      // load_tool_schema returns an empty content[] and puts its payload on
      // the raw result instead (confirmed live against the deployed server).
      return { text: "", isError: false, data: undefined, raw: schema, payload: schema };
    }),
  } as unknown as ReferenceEngineClient;
}

describe("ReferenceEngineToolCatalog", () => {
  it("converts the reference engine's custom schema format to OpenRouter tool-call format", async () => {
    const client = fakeClient({ character_manage: CHARACTER_MANAGE_SCHEMA });
    const catalog = new ReferenceEngineToolCatalog(client, ["character_manage"]);

    const tools = await catalog.getTools();
    expect(tools).toHaveLength(1);
    const tool = tools[0];
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe("character_manage");
    expect(tool.function.parameters.required).toEqual(["action"]);
    expect(tool.function.parameters.properties.characterType).toEqual({
      type: "string",
      enum: ["pc", "npc", "enemy", "neutral"],
      description: undefined,
    });
    expect(tool.function.parameters.properties.knownSpells).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
    expect(tool.function.parameters.properties.stats).toMatchObject({
      type: "object",
      properties: { str: { type: "number" }, dex: { type: "number" } },
      required: [],
    });
  });

  it("fetches each tool's schema only once, caching across repeated getTools() calls", async () => {
    const client = fakeClient({ character_manage: CHARACTER_MANAGE_SCHEMA });
    const catalog = new ReferenceEngineToolCatalog(client, ["character_manage"]);

    await catalog.getTools();
    await catalog.getTools();
    const tool = await catalog.getTool("character_manage");

    expect(client.callTool).toHaveBeenCalledTimes(1);
    expect(tool?.function.name).toBe("character_manage");
  });

  it("converts an unrecognized field type (e.g. the reference engine's 'any') to an empty schema instead of an invalid JSON Schema type", async () => {
    const COMBAT_MANAGE_SCHEMA = {
      toolName: "combat_manage",
      description: "Manage combat.",
      inputSchema: {
        action: { type: "string", description: "Action" },
        participants: { type: "array", itemType: { type: "any" }, optional: true },
        terrain: { type: "any", optional: true },
      },
    };
    const client = fakeClient({ combat_manage: COMBAT_MANAGE_SCHEMA });
    const catalog = new ReferenceEngineToolCatalog(client, ["combat_manage"]);

    const [tool] = await catalog.getTools();

    expect(tool.function.parameters.properties.terrain).toEqual({ description: undefined });
    expect(tool.function.parameters.properties.participants).toMatchObject({
      type: "array",
      items: { description: undefined },
    });
    // Neither should contain a literal `type: "any"` anywhere — that's what
    // OpenAI's function-calling validator rejects.
    expect(JSON.stringify(tool.function.parameters)).not.toContain('"any"');
  });

  it("returns undefined from getTool for a name not in the catalog", async () => {
    const client = fakeClient({ character_manage: CHARACTER_MANAGE_SCHEMA });
    const catalog = new ReferenceEngineToolCatalog(client, ["character_manage"]);

    expect(await catalog.getTool("nonexistent_tool")).toBeUndefined();
  });

  it("does not cache a failed load, allowing a retry to succeed", async () => {
    let attempt = 0;
    const client = {
      callTool: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("network blip");
        return { text: "", isError: false, data: undefined, raw: CHARACTER_MANAGE_SCHEMA, payload: CHARACTER_MANAGE_SCHEMA };
      }),
    } as unknown as ReferenceEngineClient;
    const catalog = new ReferenceEngineToolCatalog(client, ["character_manage"]);

    await expect(catalog.getTools()).rejects.toThrow("network blip");
    const tools = await catalog.getTools();
    expect(tools).toHaveLength(1);
    expect(attempt).toBe(2);
  });
});
