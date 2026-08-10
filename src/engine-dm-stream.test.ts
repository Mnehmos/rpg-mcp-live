import { afterEach, describe, expect, it, vi } from "vitest";
import { LanternDungeonMaster } from "./engine-dm.js";
import type { OpenRouterCompletionTelemetry } from "./openrouter.js";

const baseOptions = {
  apiKey: "test-key",
  baseUrl: "https://primary.example/v1",
  model: "primary-model",
  reasoningEffort: "medium",
  maxTokens: 2500,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table Engine",
};

type StreamEvent = { data: unknown | "[DONE]"; delayMs?: number };

function responseFor(events: StreamEvent[]): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let index = 0;
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (): void => {
        const event = events[index++];
        if (!event) {
          controller.close();
          return;
        }
        const payload = event.data === "[DONE]" ? "[DONE]" : JSON.stringify(event.data);
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        timer = setTimeout(emit, event.delayMs ?? 0);
      };
      emit();
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): StreamEvent {
  return {
    data: {
      id: "test-stream",
      object: "chat.completion.chunk",
      created: 0,
      model: "test-model",
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    },
  };
}

function requestCompletion(dm: LanternDungeonMaster): Promise<unknown> {
  return (dm as unknown as {
    requestCompletion(messages: Array<{ role: "user"; content: string }>, allowTools: boolean): Promise<unknown>;
  }).requestCompletion([{ role: "user", content: "Return the response." }], false);
}

describe("Lantern model first-output streaming policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("falls back exactly once when the primary emits no delta before TTFT", async () => {
    const telemetry: OpenRouterCompletionTelemetry[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseFor([{ data: "[DONE]", delayMs: 200 }]))
      .mockResolvedValueOnce(responseFor([
        chunk({ role: "assistant", content: "fallback response" }, "stop"),
        { data: "[DONE]" },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    const dm = new LanternDungeonMaster(null as never, {
      ...baseOptions,
      fallbackBaseUrl: "https://fallback.example/v1",
      fallbackModel: "fallback-model",
      firstTokenTimeoutMs: 25,
      onCompletionTelemetry: (event) => telemetry.push(event),
    });
    const result = await requestCompletion(dm) as { content?: string; tool_calls?: unknown[] };

    expect(result).toMatchObject({ content: "fallback response" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "primary-model" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ model: "fallback-model" });
    expect(telemetry).toEqual([
      expect.objectContaining({
        selection: "primary",
        outcome: "failed",
        failureReason: "ttft_timeout",
        ttftMs: null,
      }),
      expect.objectContaining({
        selection: "fallback",
        outcome: "completed",
        failureReason: null,
      }),
    ]);
  }, 5_000);

  it("treats a tool-call delta as first output and permits the stream to finish", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(responseFor([
      chunk({
        role: "assistant",
        tool_calls: [{
          index: 0,
          id: "tool-1",
          type: "function",
          function: { name: "observe", arguments: "{}" },
        }],
      }, "tool_calls"),
      { data: "[DONE]", delayMs: 100 },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const dm = new LanternDungeonMaster(null as never, {
      ...baseOptions,
      fallbackModel: "fallback-model",
      firstTokenTimeoutMs: 25,
    });
    const result = await requestCompletion(dm) as { tool_calls?: Array<{ function?: { name?: string } }> };

    expect(result.tool_calls?.[0]?.function?.name).toBe("observe");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 5_000);

  it("does not impose a second deadline after the first content delta", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(responseFor([
      chunk({ role: "assistant", content: '{"text":"active ' }),
      { data: {
        id: "test-stream",
        object: "chat.completion.chunk",
        created: 0,
        model: "test-model",
        choices: [{
          index: 0,
          delta: { content: 'generation","proposedFacts":[],"suggestedActions":[]}' },
          finish_reason: "stop",
        }],
      }, delayMs: 100 },
      { data: "[DONE]" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const dm = new LanternDungeonMaster(null as never, {
      ...baseOptions,
      fallbackModel: "fallback-model",
      firstTokenTimeoutMs: 25,
    });
    const result = await requestCompletion(dm) as { content?: string };

    expect(result.content).toBe('{"text":"active generation","proposedFacts":[],"suggestedActions":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 5_000);

  it("allows an active stream to finish beyond the old 25-second deadline", async () => {
    vi.useFakeTimers();
    const telemetry: OpenRouterCompletionTelemetry[] = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(responseFor([
      chunk({ role: "assistant", content: "long-running" }, "stop"),
      {
        data: {
          id: "test-stream",
          object: "chat.completion.chunk",
          created: 0,
          model: "test-model",
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
        },
        delayMs: 26_000,
      },
      { data: "[DONE]" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const dm = new LanternDungeonMaster(null as never, {
      ...baseOptions,
      fallbackModel: "fallback-model",
      firstTokenTimeoutMs: 100,
      onCompletionTelemetry: (event) => telemetry.push(event),
    });
    const completion = requestCompletion(dm);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(26_000);
    await vi.runOnlyPendingTimersAsync();
    const result = await completion as { content?: string };

    expect(result.content).toBe("long-running");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(telemetry[0]).toMatchObject({
      selection: "primary",
      outcome: "completed",
      ttftMs: 0,
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
    });
  }, 5_000);

  it("does not start a fallback after a partial stream fails", async () => {
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const partialFailure = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        const first = chunk({ role: "assistant", content: "partial output" });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(first.data)}\n\n`));
        timer = setTimeout(() => controller.error(new Error("stream interrupted")), 60);
      },
      cancel() {
        if (timer) clearTimeout(timer);
      },
    }), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(partialFailure);
    vi.stubGlobal("fetch", fetchMock);

    const dm = new LanternDungeonMaster(null as never, {
      ...baseOptions,
      fallbackModel: "fallback-model",
      firstTokenTimeoutMs: 15,
    });

    await expect(requestCompletion(dm)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 5_000);

  it("attaches tenant, turn, purpose, and normalized provider usage without content", async () => {
    const telemetry: OpenRouterCompletionTelemetry[] = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(responseFor([
      chunk({ role: "assistant", content: "done" }, "stop"),
      {
        data: {
          id: "provider-generation-1",
          object: "chat.completion.chunk",
          created: 0,
          model: "resolved-model",
          choices: [],
          usage: {
            prompt_tokens: 10_000,
            prompt_tokens_details: { cached_tokens: 2_000 },
            completion_tokens: 500,
            completion_tokens_details: { reasoning_tokens: 50 },
            total_tokens: 10_500,
            cost: 0.005,
          },
        },
      },
      { data: "[DONE]" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const dm = new LanternDungeonMaster(null as never, {
      ...baseOptions,
      firstTokenTimeoutMs: 25,
      onCompletionTelemetry: (event) => telemetry.push(event),
    });
    await (dm as unknown as {
      requestCompletion(
        messages: Array<{ role: "user"; content: string }>,
        allowTools: boolean,
        context: Record<string, unknown>,
      ): Promise<unknown>;
    }).requestCompletion([{ role: "user", content: "Return the response." }], false, {
      accountId: "account-a",
      campaignId: "campaign-a",
      actorId: "actor-a",
      requestId: "request-a",
      clientCommandId: "command-a",
      dmRunId: "run-a",
      purpose: "player_turn",
      toolsEnabled: false,
      nextRequestSequence: () => 1,
    });

    expect(telemetry[0]).toMatchObject({
      accountId: "account-a",
      campaignId: "campaign-a",
      clientCommandId: "command-a",
      dmRunId: "run-a",
      requestSequence: 1,
      purpose: "player_turn",
      toolsEnabled: false,
      providerRequestId: "provider-generation-1",
      resolvedModel: "resolved-model",
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
      reasoningTokens: 50,
      outputTokens: 500,
      totalTokens: 10_500,
      costMicrousd: 5_000,
      status: "success",
    });
    expect(JSON.stringify(telemetry[0])).not.toContain("Return the response.");
  }, 5_000);
});
