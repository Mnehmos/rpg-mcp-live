import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildDmContext, LanternDungeonMaster } from "./engine-dm.js";
import {
  createInitialCampaign,
  normalizeCampaignState,
  projectResolutionForActor,
  resolveEngineCommand,
  toSessionView,
} from "./engine-domain.js";
import { engineCommandSchema, type EngineCommand, type LanternCampaignState, type RequestContext } from "./engine-contracts.js";
import { LanternEngineStore } from "./engine-store.js";
import { openAiSdkFetch } from "./test-openai-stream.js";

const contextFor = (state: LanternCampaignState): RequestContext => ({
  requestId: randomUUID(),
  accountId: state.accountId,
  campaignId: state.id,
  actorId: state.actorId,
  capabilities: ["player", "dm"],
});

const noticeInput = {
  id: "commander-sealed-notice",
  title: "Commander-sealed attendance notice",
  terms: {
    authorizedAction: "Attend the escorted clerk delivery at the first watch bell.",
    actorScope: "Mnehmos must attend; the duty officer and station clerk may be present.",
    admissibleEvidence: ["The signed notice itself", "The clerk's delivery record"],
    excludedEvidence: ["Unlisted testimony or records", "Evidence outside the written notice"],
    responseWindow: "Answer before the second watch bell after delivery.",
    deadlineAtMinutes: 120,
    attendance: "Remain under escort until the clerk records your response.",
    custodyEffect: "Supervised release continues; no new restraint is authorized by this notice.",
    nextChange: "The procedure changes when the response is entered or the second bell passes.",
    copy: { allowed: true },
    clarification: { allowed: false, denialReason: "The clerk cannot add facts beyond the written notice." },
  },
};

function apply(state: LanternCampaignState, command: EngineCommand, clientCommandId = randomUUID()) {
  return resolveEngineCommand(state, contextFor(state), clientCommandId, engineCommandSchema.parse(command), command.kind === "procedural_notice" ? "procedural_notice" : "declare");
}

describe("procedural notice delivery", () => {
  it("rejects restricted records when a model tries to put them in player-safe terms", () => {
    for (const field of ["authorizedAction", "actorScope", "responseWindow", "attendance", "custodyEffect", "nextChange"] as const) {
      const command = {
        kind: "procedural_notice" as const,
        action: "upsert" as const,
        notice: {
          ...noticeInput,
          terms: { ...noticeInput.terms, [field]: "Titus's sealed statement" },
        },
      };
      expect(engineCommandSchema.safeParse(command).success).toBe(false);
    }
    expect(engineCommandSchema.safeParse({
      kind: "procedural_notice",
      action: "upsert",
      notice: { ...noticeInput, terms: { ...noticeInput.terms, excludedEvidence: ["Titus's sealed statement"] } },
    }).success).toBe(false);
  });

  it("does not send sealed terms to the narrator and rejects terms on transition actions", () => {
    const state = createInitialCampaign("notice-context-account", "notice-context-actor");
    const sealed = apply(state, { kind: "procedural_notice", action: "upsert", notice: noticeInput });
    const context = contextFor(sealed.state);
    const dmContext = buildDmContext(sealed.state, context, "I wait for delivery.", "player_turn") as { proceduralNotices: unknown[] };
    expect(dmContext.proceduralNotices[0]).toMatchObject({
      status: "sealed",
      terms: null,
    });
    expect(engineCommandSchema.safeParse({
      kind: "procedural_notice",
      action: "authorize",
      noticeId: noticeInput.id,
      notice: noticeInput,
    }).success).toBe(false);
  });

  it("withholds sealed terms, delivers them once, and removes stale opening suggestions", () => {
    let state = createInitialCampaign("notice-account", "notice-actor");
    state.suggestedActions = [{ id: "open-notice", label: "Open the notice", prompt: "I open the sealed notice." }];

    const sealed = apply(state, { kind: "procedural_notice", action: "upsert", notice: noticeInput });
    expect(sealed.accepted).toBe(true);
    expect(toSessionView(sealed.state).proceduralNotices[0]).toMatchObject({ status: "sealed", terms: null });
    expect(toSessionView(sealed.state).suggestedActions).toEqual([]);

    const authorized = apply(sealed.state, { kind: "procedural_notice", action: "authorize", noticeId: noticeInput.id });
    const authorizedView = toSessionView(authorized.state).proceduralNotices[0];
    expect(authorizedView).toMatchObject({ status: "authorized", terms: null });

    const delivered = apply(authorized.state, { kind: "procedural_notice", action: "deliver", noticeId: noticeInput.id });
    const deliveredView = toSessionView(delivered.state).proceduralNotices[0];
    expect(deliveredView).toMatchObject({ status: "delivered", terms: noticeInput.terms });
    expect(JSON.stringify(deliveredView)).not.toContain("unlisted testimony");
    expect(delivered.state.version).toBe(3);
  });

  it("returns the operative projection for both granted and denied requests", () => {
    let state = createInitialCampaign("notice-request-account", "notice-request-actor");
    state = apply(state, { kind: "procedural_notice", action: "upsert", notice: noticeInput }).state;
    state = apply(state, { kind: "procedural_notice", action: "authorize", noticeId: noticeInput.id }).state;
    state = apply(state, { kind: "procedural_notice", action: "deliver", noticeId: noticeInput.id }).state;

    const copy = apply(state, { kind: "procedural_notice", action: "request_copy", noticeId: noticeInput.id, requestText: "Please provide a copy." });
    expect(copy.accepted).toBe(true);
    expect(copy.data).toMatchObject({ request: { kind: "copy", outcome: "granted" }, notice: { terms: noticeInput.terms } });

    const clarification = apply(copy.state, { kind: "procedural_notice", action: "request_clarification", noticeId: noticeInput.id, requestText: "What facts may I add?" });
    expect(clarification.accepted).toBe(true);
    expect(clarification.data).toMatchObject({
      request: { kind: "clarification", outcome: "denied", reason: noticeInput.terms.clarification.denialReason },
      notice: { status: "delivered", terms: noticeInput.terms },
    });
    expect(clarification.state.proceduralNotices[0]?.attempts.map((attempt) => attempt.outcome)).toEqual(["granted", "denied"]);
    expect(clarification.message).toContain("operative terms remain available");
  });

  it("survives refresh and replays the delivered notice without exposing restricted records", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-notice-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    const initial = createInitialCampaign("notice-replay-account", "notice-replay-actor");
    const context = contextFor(initial);
    store.createCampaign(context, initial);
    const commands: EngineCommand[] = [
      { kind: "procedural_notice", action: "upsert", notice: noticeInput },
      { kind: "procedural_notice", action: "authorize", noticeId: noticeInput.id },
      { kind: "procedural_notice", action: "deliver", noticeId: noticeInput.id },
    ];
    let version = 0;
    let deliveredId = "";
    for (const command of commands) {
      const clientCommandId = randomUUID();
      const result = store.executeCommand({
        context,
        clientCommandId,
        expectedCampaignVersion: version,
        command,
        tool: "procedural_notice",
        resolve: (current) => resolveEngineCommand(current, context, clientCommandId, command, "procedural_notice"),
      });
      version = result.state.version;
      deliveredId = clientCommandId;
    }
    const firstSession = store.getCampaign(context);
    expect(firstSession.proceduralNotices[0]?.status).toBe("delivered");
    expect(toSessionView(firstSession).proceduralNotices[0]?.terms?.authorizedAction).toContain("Attend");
    const restarted = new LanternEngineStore(databasePath);
    const refreshed = normalizeCampaignState(restarted.getCampaign(context));
    expect(toSessionView(refreshed).proceduralNotices[0]).toEqual(toSessionView(firstSession).proceduralNotices[0]);
    const replay = restarted.executeCommand({
      context,
      clientCommandId: deliveredId,
      expectedCampaignVersion: 2,
      command: commands[2]!,
      tool: "procedural_notice",
      resolve: (current) => resolveEngineCommand(current, context, deliveredId, commands[2]!, "procedural_notice"),
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state.proceduralNotices[0]?.status).toBe("delivered");
    expect(JSON.stringify(toSessionView(refreshed))).not.toContain("unlisted testimony");
    store.close();
    restarted.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("does not expose operative terms in a pre-delivery resolution or event projection", () => {
    let state = createInitialCampaign("notice-redaction-account", "notice-redaction-actor");
    const sealed = apply(state, { kind: "procedural_notice", action: "upsert", notice: noticeInput });
    const projected = projectResolutionForActor(sealed, state.actorId);
    expect((projected.state.proceduralNotices[0] as unknown as { terms: unknown }).terms).toBeNull();
    expect(JSON.stringify(projected.event)).not.toContain("Attend the escorted clerk delivery");
  });

  it("retries a prose-only formal notice and requires the typed tool before accepting narration", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: "assistant", content: JSON.stringify({ text: "A sealed notice arrives, but its terms are not stated.", proposedFacts: [], suggestedActions: [] }) } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "notice-upsert", type: "function", function: { name: "procedural_notice", arguments: JSON.stringify({ action: "upsert", notice: noticeInput }) } }],
        } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: "assistant", content: JSON.stringify({ text: "The sealed notice is recorded for the prescribed delivery step.", proposedFacts: [], suggestedActions: [] }) } }] }),
      });
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));
    const directory = mkdtempSync(join(tmpdir(), "lantern-notice-dm-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    const state = createInitialCampaign("notice-dm-account", "notice-dm-actor");
    const context = contextFor(state);
    store.createCampaign(context, state);
    const result = await new LanternDungeonMaster(store, {
      apiKey: "test-key",
      baseUrl: "https://example.test/v1/chat/completions",
      model: "test-model",
      reasoningEffort: "low",
      maxTokens: 400,
      siteUrl: "https://example.test",
      appName: "Lantern Test",
    }).resolveTurn(context, state, randomUUID(), 0, "A sealed notice arrives and I need its operative terms.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(fetchMock.mock.calls[1]?.[1]?.body)).toContain("procedural_notice");
    expect(result.state.proceduralNotices[0]?.status).toBe("sealed");
    expect(result.narration.text).toContain("recorded");
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
