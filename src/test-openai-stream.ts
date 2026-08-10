type LegacyProviderResponse = {
  body?: unknown;
  status: number;
  json: () => Promise<{ choices?: Array<{ message?: {
    role?: string;
    content?: unknown;
    tool_calls?: unknown[];
  } }> }>;
};

/** Adapt legacy JSON fixtures to the official SDK's streamed response shape. */
export function openAiSdkFetch(fetchMock: (...args: Parameters<typeof fetch>) => unknown): typeof fetch {
  return async (...args: Parameters<typeof fetch>) => {
    const response = await fetchMock(...args) as LegacyProviderResponse;
    if (response.body) return response as unknown as Response;
    const payload = await response.json();
    const message = payload.choices?.[0]?.message ?? {};
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((toolCallUnknown, index) => {
          const toolCall = toolCallUnknown as {
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          };
          return {
            index,
            id: toolCall.id,
            type: toolCall.type ?? "function",
            function: {
              name: toolCall.function?.name ?? "",
              arguments: toolCall.function?.arguments ?? "",
            },
          };
        })
      : [];
    const chunk = {
      id: "test-completion",
      object: "chat.completion.chunk",
      created: 0,
      model: "test-model",
      choices: [{
        index: 0,
        delta: {
          role: message.role ?? "assistant",
          content: message.content ?? null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? "tool_calls" : "stop",
      }],
    };
    const body = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
    return new Response(body, {
      status: response.status,
      headers: { "content-type": "text/event-stream" },
    });
  };
}
