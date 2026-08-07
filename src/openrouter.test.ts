import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackIntentForPlayerText, OpenRouterInterpreter } from "./openrouter.js";

const options = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.example/v1",
  model: "openai/gpt-5.6-luna",
  reasoningEffort: "medium",
  maxTokens: 900,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table",
};

describe("OpenRouter DM adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates the interpreter response before returning an intent", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                kind: "ability_check",
                ability: "wis",
                skill: "perception",
                goal: "Study the first lead for a useful detail.",
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const interpreter = new OpenRouterInterpreter(options);
    const intent = await interpreter.interpret({
      sceneId: "opening",
      sceneTitle: "The Opening",
      sceneDescription: "The campaign begins at the edge of its first decision.",
      playerText: "I study the first lead for a useful detail.",
      recentLog: [],
    });

    expect(intent.kind).toBe("ability_check");
    if (intent.kind === "ability_check") expect(intent.ability).toBe("wis");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a safe scene-description intent when model JSON is malformed", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "A room" }) } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const interpreter = new OpenRouterInterpreter(options);
    const intent = await interpreter.interpret({
      sceneId: "opening",
      sceneTitle: "The Opening",
      sceneDescription: "The campaign begins at the edge of its first decision.",
      playerText: "Describe the room I am in.",
      recentLog: [],
    });

    expect(intent).toEqual({ kind: "nonmechanical", goal: "Describe the room I am in." });
    expect(fallbackIntentForPlayerText("I attack the guard")).toBeNull();
  });
});
