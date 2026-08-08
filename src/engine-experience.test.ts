import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((min: number, _max: number) => min));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: deterministicRandomInt };
});
import {
  createInitialCampaign,
  projectExperienceProfile,
  resolveEngineCommand,
  sanitizeNarrationForProfile,
} from "./engine-domain.js";
import { engineCommandSchema, type EngineCommand, type LanternCampaignState, type RequestContext } from "./engine-contracts.js";
import { EngineVersionConflictError, LanternEngineStore } from "./engine-store.js";
import { commandForTool, lanternToolDefinitions, parseToolArguments } from "./engine-tools.js";

const profileInput = {
  pillarWeights: { combat: 40, exploration: 20, social: 20, mystery: 20 },
  difficulty: "gentle" as const,
  narrationStyle: "immersive" as const,
  verbosity: "standard" as const,
  guidance: "guided" as const,
  rulesTransparency: "explicit" as const,
  excludedThemes: ["graphic violence"],
  fadeToBlackThemes: ["torture"],
};

function contextFor(state: LanternCampaignState, capabilities = ["player", "dm"]): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities,
  };
}

function createHarness(state: LanternCampaignState): { store: LanternEngineStore; context: RequestContext; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "lantern-experience-"));
  const store = new LanternEngineStore(join(dir, "engine.db"));
  const context = contextFor(state);
  store.createCampaign(context, state);
  return { store, context, dir };
}

function command(raw: unknown): EngineCommand {
  return engineCommandSchema.parse(raw);
}

function execute(
  harness: { store: LanternEngineStore; context: RequestContext },
  state: LanternCampaignState,
  clientCommandId: string,
  next: EngineCommand,
  expectedVersion = state.version,
  context = harness.context
) {
  return harness.store.executeCommand({
    context,
    clientCommandId,
    expectedCampaignVersion: expectedVersion,
    command: next,
    tool: next.kind === "listen" ? "listen" : next.kind,
    resolve: (current) => resolveEngineCommand(current, context, clientCommandId, next, next.kind === "listen" ? "listen" : next.kind),
  });
}

function closeHarness(harness: { store: LanternEngineStore; dir: string }): void {
  harness.store.close();
  rmSync(harness.dir, { recursive: true, force: true });
}

describe("player experience profile", () => {
  it("creates a separate normalized profile with a reviewed difficulty policy key", () => {
    const state = createInitialCampaign("account-experience", "actor-experience", undefined, undefined, undefined, undefined, profileInput);
    expect(state.experienceProfile).toMatchObject({
      version: 1,
      revision: 0,
      source: "player",
      difficulty: "gentle",
      difficultyPolicyKey: "lantern-difficulty-gentle-v1",
      excludedThemes: ["graphic violence"],
    });
    expect(state.experienceProfile).not.toBe(state.character);
    expect(state.character.level).toBe(1);
  });

  it("updates only presentation/preferences, redacts sensitive evidence, and replays once", () => {
    const state = createInitialCampaign("account-update", "actor-update");
    const harness = createHarness(state);
    const beforeCharacter = JSON.stringify(state.character);
    const update = command({ kind: "experience_profile_update", profile: profileInput });
    const clientCommandId = randomUUID();
    const first = execute(harness, state, clientCommandId, update);

    expect(first.accepted).toBe(true);
    expect(first.state.experienceProfile.revision).toBe(1);
    expect(JSON.stringify(first.state.character)).toBe(beforeCharacter);
    expect(first.event?.stateChanges.every((change) => !JSON.stringify(change).includes("graphic violence"))).toBe(true);
    expect(JSON.stringify(first.event?.command)).not.toContain("graphic violence");
    expect(first.state.log.every((message) => !message.text.includes("graphic violence"))).toBe(true);

    const replay = execute(harness, state, clientCommandId, update);
    expect(replay.replayed).toBe(true);
    expect(replay.state.version).toBe(1);
    expect(harness.store.listCampaignEvents(harness.context)).toHaveLength(1);
    closeHarness(harness);
  });

  it("rejects schema-valid domain-invalid, stale, and non-player updates immutably", () => {
    const state = createInitialCampaign("account-reject", "actor-reject");
    const harness = createHarness(state);
    const before = JSON.stringify(harness.store.getCampaign(harness.context));
    const invalid = command({
      kind: "experience_profile_update",
      profile: { ...profileInput, pillarWeights: { combat: 0, exploration: 0, social: 0, mystery: 0 } },
    });
    const rejected = execute(harness, state, randomUUID(), invalid);
    expect(rejected).toMatchObject({ accepted: false, code: "invalid_experience_profile" });
    expect(JSON.stringify(harness.store.getCampaign(harness.context))).toBe(before);
    expect(harness.store.listCampaignEvents(harness.context)).toHaveLength(0);

    const playerOnly = contextFor(state, ["dm"]);
    const playerRejected = execute(harness, state, randomUUID(), command({ kind: "experience_feedback_add", rating: 5 }), 0, playerOnly);
    expect(playerRejected).toMatchObject({ accepted: false, code: "profile_player_only" });
    expect(JSON.stringify(harness.store.getCampaign(harness.context))).toBe(before);

    const accepted = execute(harness, state, randomUUID(), command({ kind: "experience_profile_update", profile: profileInput }));
    expect(accepted.accepted).toBe(true);
    expect(() => execute(harness, state, randomUUID(), command({ kind: "experience_feedback_add", rating: 4 }), 0)).toThrow(EngineVersionConflictError);
    expect(harness.store.getCampaign(harness.context).version).toBe(1);
    closeHarness(harness);
  });

  it("persists feedback and profile revision across replay and restart without logging the note", () => {
    const state = createInitialCampaign("account-feedback", "actor-feedback");
    const harness = createHarness(state);
    const feedback = command({ kind: "experience_feedback_add", rating: 4, note: "Keep the mystery compact." });
    const commandId = randomUUID();
    const first = execute(harness, state, commandId, feedback);
    expect(first.accepted).toBe(true);
    expect(first.state.experienceProfile.feedback).toHaveLength(1);
    expect(first.state.experienceProfile.feedback[0]?.note).toBe("Keep the mystery compact.");
    expect(first.state.log.every((message) => !message.text.includes("Keep the mystery compact."))).toBe(true);
    expect(JSON.stringify(first.event)).not.toContain("Keep the mystery compact.");
    expect(execute(harness, state, commandId, feedback).replayed).toBe(true);
    harness.store.close();

    const restarted = new LanternEngineStore(join(harness.dir, "engine.db"));
    const loaded = restarted.getCampaign(harness.context);
    expect(loaded.experienceProfile.revision).toBe(1);
    expect(loaded.experienceProfile.feedback[0]?.rating).toBe(4);
    restarted.close();
    rmSync(harness.dir, { recursive: true, force: true });
  });

  it("applies boundary actions before fictional detail and rejects blocked commands without mutation", () => {
    const state = createInitialCampaign("account-boundary", "actor-boundary", undefined, undefined, undefined, undefined, profileInput);
    const harness = createHarness(state);
    const blocked = command({ kind: "declare", goal: "Describe graphic violence in detail." });
    const before = JSON.stringify(harness.store.getCampaign(harness.context));
    const blockedResult = execute(harness, state, randomUUID(), blocked);
    expect(blockedResult).toMatchObject({ accepted: false, code: "experience_boundary_blocked" });
    expect(JSON.stringify(harness.store.getCampaign(harness.context))).toBe(before);

    const boundary = execute(harness, state, randomUUID(), command({ kind: "experience_boundary", theme: "graphic violence", action: "fade_to_black" }));
    expect(boundary.accepted).toBe(true);
    expect(boundary.message).not.toContain("graphic violence");
    expect(JSON.stringify(boundary.event)).not.toContain("graphic violence");
    expect(boundary.state.log.at(-1)?.text).not.toContain("graphic violence");

    const narration = sanitizeNarrationForProfile({
      text: "The graphic violence begins.",
      proposedFacts: [{ kind: "record_fact", subjectId: "scene", predicate: "detail", value: "graphic violence" }],
      suggestedActions: [{ id: "bad", label: "Violence", prompt: "I continue the graphic violence." }],
    }, state.experienceProfile);
    expect(narration).toEqual({ text: "Let's fade to black and continue with a safer thread.", proposedFacts: [], suggestedActions: [] });
    closeHarness(harness);
  });

  it("keeps difficulty and presentation out of the mechanical roll path", () => {
    const first = createInitialCampaign("account-roll", "actor-roll", undefined, undefined, undefined, undefined, profileInput);
    const second = JSON.parse(JSON.stringify(first)) as LanternCampaignState;
    second.experienceProfile = {
      ...second.experienceProfile,
      difficulty: "challenging",
      difficultyPolicyKey: "lantern-difficulty-challenging-v1",
      narrationStyle: "compact",
      verbosity: "detailed",
      guidance: "open",
      rulesTransparency: "summary",
      excludedThemes: [],
      fadeToBlackThemes: [],
    };
    const firstContext = contextFor(first);
    const secondContext = contextFor(second);
    const firstResult = resolveEngineCommand(first, firstContext, randomUUID(), command({ kind: "roll_check", ability: "wis", goal: "Study the same challenge." }), "roll_check");
    const secondResult = resolveEngineCommand(second, secondContext, randomUUID(), command({ kind: "roll_check", ability: "wis", goal: "Study the same challenge." }), "roll_check");
    expect(firstResult.accepted).toBe(true);
    expect(secondResult.accepted).toBe(true);
    expect(firstResult.event?.rolls).toEqual(secondResult.event?.rolls);
    expect(firstResult.event?.modifiers).toEqual(secondResult.event?.modifiers);
    expect(firstResult.state.character).toEqual(secondResult.state.character);
  });

  it("keeps the DM projection minimum and profile mutation out of its tool catalog", () => {
    const state = createInitialCampaign("account-projection", "actor-projection", undefined, undefined, undefined, undefined, {
      ...profileInput,
      excludedThemes: ["private boundary"],
      fadeToBlackThemes: [],
    });
    const projection = projectExperienceProfile(state.experienceProfile);
    expect(projection).toMatchObject({ excludedThemes: ["private boundary"], difficultyPolicyKey: "lantern-difficulty-gentle-v1" });
    expect(projection).not.toHaveProperty("feedback");
    expect(projection).not.toHaveProperty("createdAt");
    const names = lanternToolDefinitions.map((definition) => definition.function.name);
    expect(names).not.toContain("experience_profile_update");
    expect(names).not.toContain("experience_feedback_add");
    expect(names).not.toContain("experience_boundary");
    expect(commandForTool("experience_profile_update", { profile: profileInput })?.kind).toBe("experience_profile_update");
    expect(parseToolArguments("experience_boundary", { theme: "private boundary", action: "skip" })).toEqual({ theme: "private boundary", action: "skip" });
  });
});
