import { afterEach, describe, expect, it, vi } from "vitest";
import { LanternEngineClient } from "./engine-client.js";

describe("Lantern engine active-command transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the caller cancellation signal without adding a command deadline", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBe(signal);
      return Response.json({ accepted: true, state: { version: 1 } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LanternEngineClient({
      baseUrl: "http://engine.example",
      sharedSecret: "shared-secret",
      timeoutMs: 30_000,
    });
    await client.executeCommand(
      "account-a",
      "actor-a",
      "campaign-a",
      { expectedCampaignVersion: 0, playerText: "I wait." },
      signal
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a bounded stream page with the acknowledgement cursor", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        "http://engine.example/v1/campaigns/campaign-a/events/stream?after=cursor-a&limit=2"
      );
      return Response.json({
        schemaRevision: 1,
        campaignId: "campaign-a",
        events: [],
        nextCursor: "cursor-a",
        hasMore: false,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LanternEngineClient({
      baseUrl: "http://engine.example",
      sharedSecret: "shared-secret",
      timeoutMs: 30_000,
    });
    const page = await client.getCampaignEventStream("account-a", "actor-a", "campaign-a", {
      after: "cursor-a",
      limit: 2,
    });

    expect(page).toMatchObject({ campaignId: "campaign-a", nextCursor: "cursor-a", hasMore: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
