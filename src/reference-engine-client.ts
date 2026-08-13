import { randomUUID } from "node:crypto";
import { signTenantToken, type TenantIdentity } from "./reference-engine-tenant.js";

/**
 * Pure MCP JSON-RPC transport to the mnehmos-rpg-mcp reference engine
 * (Streamable HTTP, stateless: sessionIdGenerator undefined server-side).
 * No game logic and no LLM calls belong in this file — see ADR-H13 override
 * note in src/reference-engine-dm.ts for why a reference-engine call exists
 * on the production request path at all.
 */

export interface ReferenceEngineClientOptions {
  baseUrl: string;
  authToken: string;
  timeoutMs: number;
  /**
   * Shared secret for signing the per-call tenant context. Must match the
   * engine's RPG_MCP_TENANT_SECRET. When absent, calls are sent unscoped and
   * the engine will refuse any tool that touches tenant-owned storage.
   */
  tenantSecret?: string;
}

export class ReferenceEngineError extends Error {
  public constructor(
    public readonly status: number,
    public readonly rpcError?: { code: number; message: string; data?: unknown }
  ) {
    super(rpcError?.message ?? `Reference engine request failed with status ${status}.`);
    this.name = "ReferenceEngineError";
  }
}

export interface ReferenceToolCallResult {
  text: string;
  isError: boolean;
  data: unknown;
  /**
   * The full raw `result` object from the tool's JSON-RPC response. Most
   * consolidated tools put everything in `content[0].text` (see `text`
   * above), but some meta-tools (e.g. load_tool_schema) return an empty
   * `content` array and place their payload as sibling fields on `result`
   * itself — callers that need those must read `raw` directly.
   */
  raw: unknown;
  /**
   * The tool's structured payload, normalized across the three response
   * shapes confirmed live against the deployed reference engine: RichFormatter
   * markdown with an embedded `<!-- TAG_JSON -->` block (most consolidated
   * tools), plain JSON directly in `content[0].text` (e.g. search_tools,
   * narrative_manage), or sibling fields on the raw result with empty content
   * (load_tool_schema). Prefer this over `text`/`data`/`raw` unless you
   * specifically need the human-readable text.
   */
  payload: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = "2025-06-18";

export class ReferenceEngineClient {
  private readonly baseUrl: string;
  private initialized: Promise<void> | null = null;

  public constructor(private readonly options: ReferenceEngineClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  public async health(): Promise<Record<string, unknown>> {
    const healthUrl = this.baseUrl.replace(/\/mcp$/i, "/health");
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${this.options.authToken}` },
      signal: this.options.timeoutMs > 0 ? AbortSignal.timeout(this.options.timeoutMs) : undefined,
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      payload = { raw };
    }
    if (!response.ok) throw new ReferenceEngineError(response.status);
    return payload;
  }

  /**
   * `tenant` is required for any tool that touches campaign state. It is
   * deliberately a separate argument rather than a field on `args`: `args` is
   * assembled from model output, and the whole point of the signed context is
   * that the model cannot influence which tenant a call resolves to.
   *
   * Omitting it is correct only for genuinely tenant-agnostic meta-tools
   * (load_tool_schema, search_tools), which the engine serves without a scope.
   */
  /**
   * Erases a campaign's game state in the reference engine.
   *
   * Targets the engine's `/campaign` route rather than a tool: erasure is not
   * a capability the model should be able to reach, and this way it cannot —
   * the route is not part of the MCP tool surface at all. The campaign erased
   * is whichever one the signed tenant context names, so a caller cannot name
   * someone else's.
   */
  public async deleteCampaignData(tenant: TenantIdentity): Promise<{ deleted: boolean }> {
    if (!this.options.tenantSecret) {
      throw new Error("Cannot delete campaign data without REFERENCE_ENGINE_TENANT_SECRET.");
    }
    const url = this.baseUrl.replace(/\/mcp$/i, "/campaign");
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${this.options.authToken}`,
        "x-rpg-tenant": signTenantToken(tenant, this.options.tenantSecret),
      },
      signal: this.options.timeoutMs > 0 ? AbortSignal.timeout(this.options.timeoutMs) : undefined,
    });
    if (!response.ok) throw new ReferenceEngineError(response.status);
    return (await response.json()) as { deleted: boolean };
  }

  public async callTool(
    name: string,
    args: Record<string, unknown>,
    tenant?: TenantIdentity
  ): Promise<ReferenceToolCallResult> {
    await this.ensureInitialized();
    const response = await this.send("tools/call", { name, arguments: args }, tenant);
    const result = response.result as
      | { content?: Array<{ type: string; text?: string }>; isError?: boolean }
      | undefined;
    const text = (result?.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n");
    const data = extractEmbeddedJson(text);
    const payload = data ?? tryJsonParse(text) ?? result;
    return { text, isError: Boolean(result?.isError), data, raw: result, payload };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.initialize();
    }
    try {
      await this.initialized;
    } catch (error) {
      this.initialized = null;
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "rpg-mcp-live", version: "1.0.0" },
    });
    await this.sendNotification("notifications/initialized", {});
  }

  private async send(
    method: string,
    params: Record<string, unknown>,
    tenant?: TenantIdentity
  ): Promise<JsonRpcResponse> {
    const response = await this.post({ jsonrpc: "2.0", id: randomUUID(), method, params }, tenant);
    const body = await parseJsonRpcBody(response);
    if (!response.ok) {
      throw new ReferenceEngineError(response.status, body?.error);
    }
    if (body?.error) {
      throw new ReferenceEngineError(response.status, body.error);
    }
    return body ?? { jsonrpc: "2.0", result: undefined };
  }

  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const response = await this.post({ jsonrpc: "2.0", method, params });
    if (!response.ok && response.status !== 202) {
      const body = await parseJsonRpcBody(response);
      throw new ReferenceEngineError(response.status, body?.error);
    }
  }

  private post(body: Record<string, unknown>, tenant?: TenantIdentity): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.options.authToken}`,
    };
    if (tenant && this.options.tenantSecret) {
      headers["x-rpg-tenant"] = signTenantToken(tenant, this.options.tenantSecret);
    }
    return fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: this.options.timeoutMs > 0 ? AbortSignal.timeout(this.options.timeoutMs) : undefined,
    });
  }
}

async function parseJsonRpcBody(response: Response): Promise<JsonRpcResponse | null> {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  if (!raw) return null;
  if (contentType.includes("text/event-stream")) {
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    const last = dataLines[dataLines.length - 1];
    return last ? safeJsonParse(last) : null;
  }
  return safeJsonParse(raw);
}

function safeJsonParse(raw: string): JsonRpcResponse | null {
  try {
    return JSON.parse(raw) as JsonRpcResponse;
  } catch {
    return null;
  }
}

const EMBEDDED_JSON_PATTERN = /<!--\s*\w+_JSON\r?\n([\s\S]*?)\r?\n\w+_JSON\s*-->/;

export function extractEmbeddedJson(text: string): unknown {
  const match = EMBEDDED_JSON_PATTERN.exec(text);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function tryJsonParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}
