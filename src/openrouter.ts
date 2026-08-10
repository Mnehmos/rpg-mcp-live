import {
  actionIntentSchema,
  narrationEnvelopeSchema,
  type ActionIntent,
  type NarrationEnvelope,
} from "./ai-contracts.js";
import type { AbilityCheckOutcome } from "./game.js";
import type {
  ModelUsageCostSource,
  ModelUsagePurpose,
  ModelUsageSelection,
  ModelUsageStatus,
} from "./usage-ledger.js";

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackBaseUrl?: string;
  fallbackModel?: string;
  firstTokenTimeoutMs?: number;
  onCompletionTelemetry?: (event: OpenRouterCompletionTelemetry) => void;
  reasoningEffort: string;
  maxTokens: number;
  siteUrl: string;
  appName: string;
}

export interface OpenRouterCompletionTelemetry {
  provider: "openrouter";
  selection: ModelUsageSelection;
  model: string;
  ttftMs: number | null;
  durationMs: number;
  outcome: "completed" | "failed";
  failureReason: "ttft_timeout" | "provider_error_before_output" | "stream_error_after_output" | "invalid_response" | null;
  inputTokens: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  accountId?: string;
  campaignId?: string;
  actorId?: string;
  requestId?: string;
  clientCommandId?: string;
  dmRunId?: string;
  requestSequence?: number;
  purpose?: ModelUsagePurpose;
  toolsEnabled?: boolean;
  providerRequestId?: string | null;
  resolvedModel?: string | null;
  providerRoute?: string | null;
  costMicrousd?: number | null;
  costSource?: ModelUsageCostSource;
  status?: ModelUsageStatus;
  finishReason?: string | null;
  toolCallCount?: number | null;
  createdAt?: string;
  completedAt?: string;
}

export interface NarrationRequest {
  sceneId: string;
  sceneTitle: string;
  sceneDescription: string;
  action: string;
  roll: number | null;
  check?: AbilityCheckOutcome | null;
  playerText?: string | null;
  recentLog: Array<{ kind: string; text: string }>;
}

export interface IntentInterpretationRequest {
  sceneId: string;
  sceneTitle: string;
  sceneDescription: string;
  playerText: string;
  recentLog: Array<{ kind: string; text: string }>;
}

interface ChatCompletionPayload {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

export class OpenRouterNarrator {
  public constructor(private readonly options: OpenRouterOptions) {}

  public async narrate(request: NarrationRequest): Promise<NarrationEnvelope> {
    const content = await requestJsonCompletion(
      this.options,
      "You are the Dungeon Master for a text-first tabletop game. Return only valid JSON with exactly three keys: text, proposedFacts, and suggestedActions. Keep text vivid but concise. proposedFacts and suggestedActions must be arrays. Each suggested action must include id, label, and a natural-language first-person prompt. The server result is authoritative: never invent a different roll, DC, modifier, success, location, or character fact. Narration is an output projection; proposed facts are suggestions for a future validator.",
      request
    );
    return narrationEnvelopeSchema.parse(JSON.parse(stripJsonFence(content)));
  }
}

export class OpenRouterInterpreter {
  public constructor(private readonly options: OpenRouterOptions) {}

  public async interpret(request: IntentInterpretationRequest): Promise<ActionIntent> {
    const fallback = fallbackIntentForPlayerText(request.playerText);
    try {
      const content = await requestJsonCompletion(
        this.options,
        "You translate one player's tabletop RPG message into exactly one validated ActionIntent JSON object. Choose ability_check when the action has meaningful uncertainty and needs a check; choose nonmechanical for ordinary exploration, scene description, or conversation; choose clarification_required only when the player's goal is genuinely ambiguous. For a request like 'describe the room I am in', return nonmechanical. The server owns all dice, DCs, modifiers, outcomes, state changes, and facts. Do not choose attack or cast_spell yet because combat rules are not implemented in this slice. Return only JSON matching the requested schema, with no markdown.",
        request
      );
      return actionIntentSchema.parse(JSON.parse(stripJsonFence(content)));
    } catch (error) {
      if (fallback) return fallback;
      throw error;
    }
  }
}

export function createOpenRouterNarrator(options: OpenRouterOptions): OpenRouterNarrator | null {
  return options.apiKey ? new OpenRouterNarrator(options) : null;
}

export function createOpenRouterInterpreter(options: OpenRouterOptions): OpenRouterInterpreter | null {
  return options.apiKey ? new OpenRouterInterpreter(options) : null;
}

async function requestJsonCompletion(
  options: OpenRouterOptions,
  systemPrompt: string,
  request: unknown
): Promise<string> {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.siteUrl ? { "HTTP-Referer": options.siteUrl } : {}),
      "X-OpenRouter-Title": options.appName,
    },
    body: JSON.stringify({
      model: options.model,
      reasoning_effort: options.reasoningEffort,
      max_tokens: options.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(request) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ChatCompletionPayload;
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned no JSON content.");
  }

  return content;
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function fallbackIntentForPlayerText(playerText: string): ActionIntent | null {
  if (!/\b(describe|look|observe|room|surroundings|where\s+am\s+i|what\s+(?:do|can)\s+i\s+see)\b/i.test(playerText)) {
    return null;
  }

  return {
    kind: "nonmechanical",
    goal: playerText.trim(),
  };
}
