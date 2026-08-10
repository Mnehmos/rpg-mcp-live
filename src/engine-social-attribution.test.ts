import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, _max: number) => 15));
vi.mock("node:crypto", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:crypto")>(),
  randomInt: deterministicRandomInt,
}));

import { createInitialCampaign, normalizeCampaignState, projectEventForActor, resolveEngineCommand } from "./engine-domain.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { LanternEngineStore } from "./engine-store.js";
import { commandForTool, parseToolArguments } from "./engine-tools.js";
import type { EngineCommand, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { openAiSdkFetch } from "./test-openai-stream.js";

const dmOptions = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.example/v1",
  model: "openai/gpt-5.6-luna",
  reasoningEffort: "medium",
  maxTokens: 2_500,
  siteUrl: "https://lantern.example",
  appName: "Lantern Table Engine",
};

function contextFor(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function socialState(): LanternCampaignState {
  const state = createInitialCampaign("account-social-attribution", "actor-social-attribution");
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Mnehmos";
  state.character.abilities.cha = 16;
  state.worldContext = {
    id: "arena-gate",
    title: "The Arena Gate",
    description: "Titus stands before the sentries at the barred arena gate.",
    features: ["barred arena gate"],
    exits: [],
    npcs: [
      {
        id: "titus",
        name: "Titus",
        description: "A nervous guard who can speak for the prisoner.",
        disposition: "unfriendly",
        goals: ["survive the shift"],
        socialDc: 12,
        relationshipScore: 0,
        memories: [],
      },
      {
        id: "marcus",
        name: "Marcus",
        description: "A veteran guard who can act for the prisoner.",
        disposition: "unfriendly",
        goals: ["keep the gate secure"],
        socialDc: 12,
        relationshipScore: 0,
        memories: [],
      },
      {
        id: "arena-sentries",
        name: "Arena Sentries",
        description: "The sentries decide who passes through the gate.",
        disposition: "unfriendly",
        goals: ["keep the gate secure"],
        socialDc: 12,
        relationshipScore: 0,
        memories: [],
      },
    ],
    merchants: [],
    objects: [],
  };
  return normalizeCampaignState(state);
}

function resolve(state: LanternCampaignState, command: EngineCommand) {
  const context = contextFor(state);
  return resolveEngineCommand(state, context, randomUUID(), command, command.kind);
}

function legacyResponse(message: Record<string, unknown>): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) } as Response;
}

async function resolveWithModelNarration(
  modelText: string,
  actingNpcIds = ["titus"],
  configureState?: (state: LanternCampaignState) => void,
  providerFailure = false,
  suggestedActions: Array<{ id: string; label: string; prompt: string }> = [],
) {
  const state = socialState();
  configureState?.(state);
  const context = contextFor(state);
  const directory = mkdtempSync(join(tmpdir(), "lantern-social-attribution-model-"));
  const store = new LanternEngineStore(join(directory, "engine.db"));
  store.createCampaign(context, state);
  const fetchMock = vi.fn().mockResolvedValueOnce(legacyResponse({
      role: "assistant",
      content: null,
      tool_calls: actingNpcIds.map((actingNpcId, index) => ({
        id: `social-tool-${index}`,
        type: "function",
        function: {
          name: "social_check",
          arguments: JSON.stringify({
            npcId: "arena-sentries",
            actingNpcId,
            ability: "cha",
            goal: `Have ${actingNpcId} act for the prisoner at the gate.`,
          }),
        },
      })),
    }));
  if (providerFailure) {
    fetchMock.mockRejectedValueOnce(new Error("provider timeout after social commit"));
  } else {
    fetchMock.mockResolvedValueOnce(legacyResponse({
      role: "assistant",
      content: JSON.stringify({ text: modelText, proposedFacts: [], suggestedActions }),
    }));
  }
  vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

  try {
    const dm = new LanternDungeonMaster(store, dmOptions);
    const result = await dm.resolveTurn(
      context,
      state,
      randomUUID(),
      state.version,
      "I tell Titus to explain what happened and turn the sentries against Ledrus.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    return result;
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("social check actor attribution", () => {
  it("records an NPC speaker while keeping the player as roller, modifier source, and action owner", () => {
    deterministicRandomInt.mockClear().mockReturnValue(15);
    const state = socialState();
    const result = resolve(state, {
      kind: "social_check",
      npcId: "arena-sentries",
      actingNpcId: "titus",
      ability: "cha",
      goal: "Tell Titus to explain what happened and turn the sentries against Ledrus.",
    });

    expect(result.accepted).toBe(true);
    expect(result.message).toContain("Titus acts for you toward Arena Sentries");
    expect(result.message).toContain("Mnehmos's modifiers");
    expect(result.event?.actorId).toBe(state.actorId);
    expect(result.event?.command).toMatchObject({ kind: "social_check", npcId: "arena-sentries", actingNpcId: "titus" });
    expect(result.event?.check).toMatchObject({
      actorId: state.actorId,
      attribution: {
        actionOwnerActorId: state.actorId,
        rollingActorId: state.actorId,
        rollingActorName: "Mnehmos",
        actingActorId: "titus",
        actingActorName: "Titus",
        targetId: "arena-sentries",
        targetName: "Arena Sentries",
        modifierSourceActorId: state.actorId,
        modifierSourceActorName: "Mnehmos",
        mode: "npc-mediated",
      },
    });
    expect(result.data).toMatchObject({
      attribution: {
        actingActorId: "titus",
        targetId: "arena-sentries",
        modifierSourceActorId: state.actorId,
      },
    });

    const projected = projectEventForActor(state.actorId, state, result.event!);
    expect(projected.check?.attribution).toEqual(result.event?.check?.attribution);
    expect(deterministicRandomInt).toHaveBeenCalledTimes(1);
  });

  it("keeps direct social checks explicitly player-owned and rejects unknown speakers before rolling", () => {
    deterministicRandomInt.mockClear().mockReturnValue(15);
    const state = socialState();
    const direct = resolve(state, {
      kind: "social_check",
      npcId: "arena-sentries",
      ability: "cha",
      goal: "Ask the sentries for passage.",
    });
    expect(direct.accepted).toBe(true);
    expect(direct.message).toContain("You make a social check with Arena Sentries");
    expect(direct.event?.check?.attribution).toMatchObject({
      actionOwnerActorId: state.actorId,
      actingActorId: state.actorId,
      rollingActorId: state.actorId,
      modifierSourceActorId: state.actorId,
      targetId: "arena-sentries",
      mode: "direct",
    });

    deterministicRandomInt.mockClear();
    const before = JSON.stringify(state);
    const rejected = resolve(state, {
      kind: "social_check",
      npcId: "arena-sentries",
      actingNpcId: "missing-titus",
      ability: "cha",
      goal: "Ask the missing speaker to intervene.",
    });
    expect(rejected).toMatchObject({ accepted: false, code: "acting_npc_not_found" });
    expect(JSON.stringify(rejected.state)).toBe(before);
    expect(deterministicRandomInt).not.toHaveBeenCalled();
  });

  it("exposes the mediated actor field through the model tool parser", () => {
    const args = parseToolArguments("social_check", {
      npcId: "arena-sentries",
      actingNpcId: "titus",
      ability: "cha",
      goal: "Have Titus address the sentries.",
    });
    expect(args).toMatchObject({ npcId: "arena-sentries", actingNpcId: "titus" });
    expect(commandForTool("social_check", args)).toEqual({
      kind: "social_check",
      npcId: "arena-sentries",
      actingNpcId: "titus",
      ability: "cha",
      goal: "Have Titus address the sentries.",
    });
  });

  it("preserves mediated attribution when narration falls back to committed rules", async () => {
    const state = socialState();
    const context = contextFor(state);
    const directory = mkdtempSync(join(tmpdir(), "lantern-social-attribution-"));
    const store = new LanternEngineStore(join(directory, "engine.db"));
    store.createCampaign(context, state);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(legacyResponse({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "social-tool",
          type: "function",
          function: {
            name: "social_check",
            arguments: JSON.stringify({
              npcId: "arena-sentries",
              actingNpcId: "titus",
              ability: "cha",
              goal: "Tell Titus to explain what happened and turn the sentries against Ledrus.",
            }),
          },
        }],
      }))
      .mockRejectedValueOnce(new Error("provider timeout after social commit"));
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

    try {
      const dm = new LanternDungeonMaster(store, dmOptions);
      const result = await dm.resolveTurn(
        context,
        state,
        randomUUID(),
        state.version,
        "I tell Titus to explain what happened and turn the sentries against Ledrus.",
      );
      expect(result.narrationSource).toBe("rules");
      expect(result.narration.text).toContain("Titus acts for Mnehmos toward Arena Sentries");
      expect(result.narration.text).toContain("Mnehmos's modifiers");
      expect(result.event?.effects?.[0]?.check?.attribution).toMatchObject({ mode: "npc-mediated", actingActorId: "titus" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("appends authoritative mediated attribution to successful model narration", async () => {
    const result = await resolveWithModelNarration("Titus speaks using Mnehmos's modifiers.");

    expect(result.narrationSource).toBe("llm");
    expect(result.narration.text).toContain("Titus speaks using Mnehmos's modifiers");
    expect(result.narration.text).toContain(
      "Authoritative check record: Titus acts for Mnehmos toward Arena Sentries; the check uses Mnehmos's modifiers.",
    );
  });

  it("falls back to the committed result when model narration claims the NPC rolled", async () => {
    const result = await resolveWithModelNarration("Titus rolled the check using his modifiers.");

    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toContain("Titus acts for Mnehmos toward Arena Sentries");
    expect(result.narration.text).not.toContain("Titus rolled");
  });

  it("rejects possessive NPC roll claims and covers every mediated check in one turn", async () => {
    const result = await resolveWithModelNarration(
      "Titus's Persuasion roll succeeds, then Marcus's check opens the gate.",
      ["titus", "marcus"],
    );

    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toContain("Titus acts for Mnehmos toward Arena Sentries");
    expect(result.narration.text).toContain("Marcus acts for Mnehmos toward Arena Sentries");
    expect(result.narration.text).not.toContain("Titus's Persuasion roll");
  });

  it("rejects NPC score claims even without an explicit roll verb", async () => {
    const result = await resolveWithModelNarration("Titus got a 19 on his Persuasion check.");

    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toContain("Titus acts for Mnehmos toward Arena Sentries");
    expect(result.narration.text).not.toContain("Titus got a 19");
  });

  it("guards non-ASCII acting NPC names", async () => {
    const result = await resolveWithModelNarration(
      "\u00c9lodie rolled the check using her modifiers.",
      ["titus"],
      (state) => {
        const titus = state.worldContext?.npcs.find((npc) => npc.id === "titus");
        if (titus) titus.name = "\u00c9lodie";
      },
    );

    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).not.toContain("\u00c9lodie rolled");
  });

  it("keeps the authoritative suffix inside the narration contract limit", async () => {
    const result = await resolveWithModelNarration("A".repeat(6_000));

    expect(result.narrationSource).toBe("llm");
    expect(result.narration.text.length).toBeLessThanOrEqual(6_000);
    expect(result.narration.text).toContain("Authoritative check record: Titus acts for Mnehmos toward Arena Sentries");
  });

  it("compacts an oversized mediated-check suffix while retaining the contract bound", async () => {
    const result = await resolveWithModelNarration(
      "The gate shudders but the committed checks remain authoritative.",
      Array.from({ length: 16 }, () => "titus"),
      (state) => {
        state.character.name = `Player ${"P".repeat(113)}`;
        const titus = state.worldContext?.npcs.find((npc) => npc.id === "titus");
        const sentries = state.worldContext?.npcs.find((npc) => npc.id === "arena-sentries");
        if (titus) titus.name = `Titus ${"T".repeat(114)}`;
        if (sentries) sentries.name = `Arena Sentries ${"S".repeat(104)}`;
      },
    );

    expect(result.narrationSource).toBe("llm");
    expect(result.narration.text.length).toBeLessThanOrEqual(6_000);
    expect(result.narration.text).toContain("Authoritative mediated check 1:");
  });

  it("re-sanitizes attribution after appending authoritative records", async () => {
    const result = await resolveWithModelNarration(
      "The scene continues safely.",
      ["titus"],
      (state) => { state.experienceProfile.excludedThemes = ["Arena Sentries"]; },
    );

    expect(result.narration.text).toBe("Let's fade to black and continue with a safer thread.");
  });

  it("sanitizes a rules fallback after a provider timeout", async () => {
    const result = await resolveWithModelNarration(
      "",
      ["titus"],
      (state) => { state.experienceProfile.excludedThemes = ["Arena Sentries"]; },
      true,
    );

    expect(result.narrationSource).toBe("rules");
    expect(result.narration.text).toBe("Let's fade to black and continue with a safer thread.");
  });

  it("removes suggested actions that ask the mediated NPC to roll", async () => {
    const result = await resolveWithModelNarration(
      "The sentries answer cautiously.",
      ["titus"],
      undefined,
      false,
      [{ id: "titus-roll", label: "Roll again", prompt: "Have Titus roll again using his modifier." }],
    );

    expect(result.narrationSource).toBe("llm");
    expect(result.narration.suggestedActions).toEqual([]);
  });
});
