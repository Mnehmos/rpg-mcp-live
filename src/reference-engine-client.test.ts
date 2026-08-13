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

describe("ReferenceEngineClient tenant context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function capture(
    options: { tenantSecret?: string },
    call: (client: ReferenceEngineClient) => Promise<unknown>
  ): Promise<Headers[]> {
    const headers: Headers[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      headers.push(new Headers(init?.headers));
      if (body.method === "initialize") {
        return jsonRpcResponse(body.id as string, { protocolVersion: "2025-06-18", capabilities: {} });
      }
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return jsonRpcResponse(body.id as string, { content: [{ type: "text", text: "ok" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ReferenceEngineClient({
      baseUrl: "http://reference-engine.example/mcp",
      authToken: "service-token",
      timeoutMs: 5000,
      ...options,
    });
    await call(client);
    return headers;
  }

  function decodePayload(header: string): Record<string, unknown> {
    const [encoded] = header.split(".");
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  }

  it("sends a signed x-rpg-tenant header naming the campaign for a scoped call", async () => {
    const headers = await capture({ tenantSecret: "shared-secret" }, (client) =>
      client.callTool("character_manage", { action: "get" }, { accountId: "acct-1", campaignId: "camp-1" })
    );

    const toolCall = headers[headers.length - 1];
    const token = toolCall.get("x-rpg-tenant");
    expect(token).toBeTruthy();
    expect(decodePayload(token!)).toMatchObject({ accountId: "acct-1", campaignId: "camp-1" });
  });

  it("still sends the service auth token alongside the tenant context", async () => {
    const headers = await capture({ tenantSecret: "shared-secret" }, (client) =>
      client.callTool("character_manage", { action: "get" }, { accountId: "acct-1", campaignId: "camp-1" })
    );

    // The two answer different questions and both must be present: one proves
    // the caller is this service, the other names the customer.
    expect(headers[headers.length - 1].get("authorization")).toBe("Bearer service-token");
  });

  it("omits the tenant header for tenant-agnostic meta-tool calls", async () => {
    // The tool catalog loads schemas before any campaign is in play. Sending a
    // fabricated tenant here would be worse than sending none.
    const headers = await capture({ tenantSecret: "shared-secret" }, (client) =>
      client.callTool("load_tool_schema", { toolName: "character_manage" })
    );

    expect(headers[headers.length - 1].get("x-rpg-tenant")).toBeNull();
  });

  it("omits the tenant header when no secret is configured, rather than sending an unsigned one", async () => {
    const headers = await capture({}, (client) =>
      client.callTool("character_manage", { action: "get" }, { accountId: "acct-1", campaignId: "camp-1" })
    );

    // Fail closed at the engine (which refuses unscoped data access) rather
    // than inventing a context the engine would have to trust blindly.
    expect(headers[headers.length - 1].get("x-rpg-tenant")).toBeNull();
  });

  it("scopes each call independently so two campaigns never share a token", async () => {
    const headers = await capture({ tenantSecret: "shared-secret" }, async (client) => {
      await client.callTool("character_manage", { action: "get" }, { accountId: "acct-1", campaignId: "camp-1" });
      await client.callTool("character_manage", { action: "get" }, { accountId: "acct-2", campaignId: "camp-2" });
    });

    const tokens = headers.map((h) => h.get("x-rpg-tenant")).filter(Boolean) as string[];
    expect(tokens).toHaveLength(2);
    expect(decodePayload(tokens[0])).toMatchObject({ accountId: "acct-1", campaignId: "camp-1" });
    expect(decodePayload(tokens[1])).toMatchObject({ accountId: "acct-2", campaignId: "camp-2" });
  });
});
