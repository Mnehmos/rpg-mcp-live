import { randomUUID } from "node:crypto";
import type {
  EngineCampaignCreate,
  EngineCampaignDeleteRequest,
  EngineCampaignDeletionResult,
  EngineCommandRequest,
  EngineCommandResult,
  EngineOpeningRequest,
  EngineProductionRoomEnterRequest,
  EngineSessionView,
  EngineToolCallRequest,
  EngineToolResult,
} from "./engine-contracts.js";
import type { ProductionRoomNarrationReleaseRequest } from "./engine-production-room.js";
import type { OrchestrationDecisionRequest, OrchestrationState } from "./engine-orchestration.js";
import type { Open5eCharacterOptions } from "./open5e-rules.js";
import type { Open5eContentCatalog } from "./content/catalog.js";
import type { ResolvedEngineEventEvidence } from "./content/registry.js";

export interface EngineClientOptions {
  baseUrl: string;
  sharedSecret: string;
  timeoutMs: number;
}

export interface EngineHttpResponse<T> {
  status: number;
  data: T;
}

export class EngineHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>
  ) {
    super(typeof data.error === "string" ? data.error : "The Lantern engine request failed.");
    this.name = "EngineHttpError";
  }
}

export interface EngineCampaignResponse {
  campaign: EngineSessionView;
  state?: unknown;
}

export interface EngineCommandStatusResponse {
  status: "processing" | "resolved";
  campaignVersion: number;
  result?: EngineCommandResult;
}

export class LanternEngineClient {
  private readonly baseUrl: string;

  public constructor(private readonly options: EngineClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  public async health(): Promise<Record<string, unknown>> {
    const result = await this.request<Record<string, unknown>>("/health", { method: "GET" }, null);
    return result.data;
  }

  public async listCampaigns(accountId: string, actorId: string): Promise<EngineSessionView[]> {
    const result = await this.request<{ campaigns: EngineSessionView[] }>(
      "/v1/campaigns",
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data.campaigns;
  }

  public async getCharacterOptions(accountId: string, actorId: string, campaignId?: string): Promise<Open5eCharacterOptions> {
    const result = await this.request<{ options: Open5eCharacterOptions }>(
      "/v1/character-options" + (campaignId ? "?campaignId=" + encodeURIComponent(campaignId) : ""),
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data.options;
  }

  public async getContentCatalog(accountId: string, actorId: string): Promise<Open5eContentCatalog> {
    const result = await this.request<{ catalog: Open5eContentCatalog }>(
      "/v1/content-catalog",
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data.catalog;
  }

  public async getOrCreateCampaign(accountId: string, actorId: string): Promise<EngineCampaignResponse> {
    const campaigns = await this.listCampaigns(accountId, actorId);
    if (campaigns[0]) return this.getCampaign(accountId, actorId, campaigns[0].id);
    return this.createCampaign(accountId, actorId);
  }

  public async createCampaign(
    accountId: string,
    actorId: string,
    campaign: EngineCampaignCreate = {
      name: "Unnamed Campaign",
      premise: "A new world is waiting for you to decide what matters.",
      setting: "Open fantasy",
      tone: "Adventurous",
    }
  ): Promise<EngineCampaignResponse> {
    const result = await this.request<EngineCampaignResponse>(
      "/v1/campaigns",
      { method: "POST", body: JSON.stringify(campaign) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async getCurrentCampaign(accountId: string, actorId: string): Promise<EngineCampaignResponse | null> {
    const campaigns = await this.listCampaigns(accountId, actorId);
    if (!campaigns[0]) return null;
    return this.getCampaign(accountId, actorId, campaigns[0].id);
  }

  public async getCampaign(
    accountId: string,
    actorId: string,
    campaignId: string
  ): Promise<EngineCampaignResponse> {
    const result = await this.request<EngineCampaignResponse>(
      "/v1/campaigns/" + encodeURIComponent(campaignId),
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data;
  }

  public async getCommandStatus(
    accountId: string,
    actorId: string,
    campaignId: string,
    clientCommandId: string
  ): Promise<EngineCommandStatusResponse> {
    const result = await this.request<EngineCommandStatusResponse>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/commands/" + encodeURIComponent(clientCommandId),
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data;
  }

  public async getCampaignEvents(
    accountId: string,
    actorId: string,
    campaignId: string
  ): Promise<ResolvedEngineEventEvidence[]> {
    const result = await this.request<{ events: ResolvedEngineEventEvidence[] }>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/events",
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data.events;
  }

  public async deleteCampaign(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: EngineCampaignDeleteRequest
  ): Promise<EngineCampaignDeletionResult> {
    const result = await this.request<EngineCampaignDeletionResult>(
      "/v1/campaigns/" + encodeURIComponent(campaignId),
      { method: "DELETE", body: JSON.stringify(request) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async executeCommand(
    accountId: string,
    actorId: string,
    campaignId: string,
    command: Omit<EngineCommandRequest, "clientCommandId"> & { clientCommandId?: string }
  ): Promise<EngineCommandResult> {
    const body = {
      ...command,
      clientCommandId: command.clientCommandId ?? randomUUID(),
    };
    const result = await this.request<EngineCommandResult>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/commands",
      { method: "POST", body: JSON.stringify(body) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async executeToolCall(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: Omit<EngineToolCallRequest, "clientCommandId"> & { clientCommandId?: string }
  ): Promise<EngineToolResult> {
    const body = {
      ...request,
      clientCommandId: request.clientCommandId ?? randomUUID(),
    };
    const result = await this.request<EngineToolResult>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/tool-calls",
      { method: "POST", body: JSON.stringify(body) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async startOpening(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: Omit<EngineOpeningRequest, "clientCommandId"> & { clientCommandId?: string }
  ): Promise<EngineCommandResult> {
    const body = {
      ...request,
      clientCommandId: request.clientCommandId ?? randomUUID(),
    };
    const result = await this.request<EngineCommandResult>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/opening",
      { method: "POST", body: JSON.stringify(body) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async enterProductionRoom(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: Omit<EngineProductionRoomEnterRequest, "clientCommandId"> & { clientCommandId?: string }
  ): Promise<EngineCommandResult> {
    const body = { ...request, clientCommandId: request.clientCommandId ?? randomUUID() };
    const result = await this.request<EngineCommandResult>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/production-room/enter",
      { method: "POST", body: JSON.stringify(body) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async getProductionRoom(
    accountId: string,
    actorId: string,
    campaignId: string
  ): Promise<{ productionRoom: unknown }> {
    const result = await this.request<{ productionRoom: unknown }>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/production-room",
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data;
  }

  public async releaseProductionRoomNarration(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: ProductionRoomNarrationReleaseRequest
  ): Promise<EngineCommandResult & { productionRoom?: unknown }> {
    const result = await this.request<EngineCommandResult & { productionRoom?: unknown }>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/production-room/narration",
      { method: "POST", body: JSON.stringify(request) },
      { accountId, actorId }
    );
    return result.data;
  }

  public async getOrchestration(
    accountId: string,
    actorId: string,
    campaignId: string
  ): Promise<{ orchestration: OrchestrationState & { resume: unknown } }> {
    const result = await this.request<{ orchestration: OrchestrationState & { resume: unknown } }>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/orchestration",
      { method: "GET" },
      { accountId, actorId }
    );
    return result.data;
  }

  public async decideOrchestration(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: OrchestrationDecisionRequest
  ): Promise<EngineCommandResult> {
    const result = await this.request<EngineCommandResult>(
      "/v1/campaigns/" + encodeURIComponent(campaignId) + "/orchestration/decisions",
      { method: "POST", body: JSON.stringify(request) },
      { accountId, actorId }
    );
    return result.data;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    identity: { accountId: string; actorId: string } | null
  ): Promise<EngineHttpResponse<T>> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    headers.set("x-request-id", randomUUID());
    if (this.options.sharedSecret) headers.set("x-lantern-engine-token", this.options.sharedSecret);
    if (identity) {
      headers.set("x-lantern-account-id", identity.accountId);
      headers.set("x-lantern-actor-id", identity.actorId);
      headers.set("x-lantern-capabilities", "player,dm");
    }

    const response = await fetch(this.baseUrl + path, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    const data = (await response.json().catch(() => ({}))) as T & Record<string, unknown>;
    if (!response.ok) throw new EngineHttpError(response.status, data);
    return { status: response.status, data };
  }
}
