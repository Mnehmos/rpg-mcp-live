import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceEngineClient, ReferenceEngineError, extractEmbeddedJson } from "./reference-engine-client.js";

function jsonRpcResponse(id: string | number | null, result: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("ReferenceEngineClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes once (initialize + notifications/initialized) before the first tool call, then reuses it", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body, headers: new Headers(init?.headers) });
      if (body.method === "initialize") {
        return jsonRpcResponse(body.id as string, { protocolVersion: "2025-06-18", capabilities: {} });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      return jsonRpcResponse(body.id as string, {
        content: [{ type: "text", text: "ok" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ReferenceEngineClient({
      baseUrl: "http://reference-engine.example/mcp",
      authToken: "secret-token",
      timeoutMs: 5000,
    });

    await client.callTool("character_manage", { action: "create", name: "Test" });
    await client.callTool("character_manage", { action: "get", characterId: "abc" });

    const methods = calls.map((c) => c.body.method);
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    expect(calls[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(calls[2].body.params).toEqual({
      name: "character_manage",
      arguments: { action: "create", name: "Test" },
    });
  });

  it("extracts the embedded JSON payload from a tool's text response", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.method === "initialize") return jsonRpcResponse(body.id as string, {});
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return jsonRpcResponse(body.id as string, {
        content: [
          {
            type: "text",
            text: '⚔️ COMBAT STARTED\n<!-- COMBAT_MANAGE_JSON\n{"success":true,"encounterId":"enc-1"}\nCOMBAT_MANAGE_JSON -->\n',
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ReferenceEngineClient({
      baseUrl: "http://reference-engine.example/mcp",
      authToken: "secret-token",
      timeoutMs: 5000,
    });

    const result = await client.callTool("combat_manage", { action: "create" });
    expect(result.data).toEqual({ success: true, encounterId: "enc-1" });
    expect(result.isError).toBe(false);
  });

  it("throws ReferenceEngineError when the server returns a JSON-RPC error", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.method === "initialize") return jsonRpcResponse(body.id as string, {});
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "Unknown tool" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ReferenceEngineClient({
      baseUrl: "http://reference-engine.example/mcp",
      authToken: "secret-token",
      timeoutMs: 5000,
    });

    await expect(client.callTool("nonexistent_tool", {})).rejects.toThrow(ReferenceEngineError);
  });

  it("retries initialization if the first attempt fails", async () => {
    let initializeAttempts = 0;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.method === "initialize") {
        initializeAttempts += 1;
        if (initializeAttempts === 1) return new Response("boom", { status: 500 });
        return jsonRpcResponse(body.id as string, {});
      }
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return jsonRpcResponse(body.id as string, { content: [{ type: "text", text: "ok" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ReferenceEngineClient({
      baseUrl: "http://reference-engine.example/mcp",
      authToken: "secret-token",
      timeoutMs: 5000,
    });

    await expect(client.callTool("session_manage", { action: "initialize" })).rejects.toThrow(ReferenceEngineError);
    const result = await client.callTool("session_manage", { action: "initialize" });
    expect(result.text).toBe("ok");
    expect(initializeAttempts).toBe(2);
  });
});

describe("extractEmbeddedJson", () => {
  it("returns undefined when no embedded JSON block is present", () => {
    expect(extractEmbeddedJson("just some prose")).toBeUndefined();
  });

  it("returns undefined for a malformed embedded JSON block", () => {
    expect(extractEmbeddedJson("<!-- FOO_JSON\nnot json\nFOO_JSON -->")).toBeUndefined();
  });

  it("parses a well-formed embedded JSON block", () => {
    expect(extractEmbeddedJson('<!-- FOO_JSON\n{"a":1}\nFOO_JSON -->')).toEqual({ a: 1 });
  });
});
