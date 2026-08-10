import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const deterministicRandomInt = vi.hoisted(() => vi.fn((_min: number, max: number) => max - 1));
vi.mock("node:crypto", async (importOriginal) => ({ ...await importOriginal<typeof import("node:crypto")>(), randomInt: deterministicRandomInt }));

import { createInitialCampaign, normalizeCampaignState } from "./engine-domain.js";
import { LanternDungeonMaster } from "./engine-dm.js";
import { LanternEngineStore } from "./engine-store.js";
import type { EngineWorldObjectInstance, LanternCampaignState, RequestContext } from "./engine-contracts.js";
import { openAiSdkFetch } from "./test-openai-stream.js";

const options = { apiKey: "test-key", baseUrl: "https://openrouter.example/v1", model: "openai/gpt-5.6-luna", reasoningEffort: "medium", maxTokens: 2_500, siteUrl: "https://lantern.example", appName: "Lantern Table Engine" };

function response(message: Record<string, unknown>): Response {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) } as Response;
}

function narration(text: string): Response {
  return response({ role: "assistant", content: JSON.stringify({ text, proposedFacts: [], suggestedActions: [] }) });
}

function call(id: string, name: string, args: Record<string, unknown>) {
  return { id, name, args };
}

function toolResponse(...calls: Array<{ id: string; name: string; args: Record<string, unknown> }>): Response {
  return response({ role: "assistant", content: null, tool_calls: calls.map(({ id, name, args }) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } })) });
}

function object(id: string, name: string, sourceRef: string, tags: string[], affordances: string[], criticalPolicy: Record<string, unknown>, state: string, locationRef: string | null = null): EngineWorldObjectInstance {
  return {
    id,
    definition: { key: id, sourceRef, name, description: `A mundane ${name} established in public fiction.`, material: "metal", tags, affordances, prerequisites: [], effectInteractions: [], weight: 1, criticalPolicy },
    state, locationRef,
  } as unknown as EngineWorldObjectInstance;
}

const keyRing = () => object("ledrus-key-ring", "Ledrus's key ring", "public-log:released-key-ring-beat", ["key-ring", "keys", "mundane"], ["inspect", "move", "carry", "throw", "take", "steal", "drop"], { kind: "ordinary_consequence", canDestroy: true, canLose: true, canSell: false, canConsume: false, canHide: true }, "intact", "ledrus");
const serviceHatch = () => object("service-hatch", "service hatch", "public-feature:ludus-vault", ["hatch", "locked", "mundane"], ["inspect", "unlock", "open", "close", "lock"], { kind: "recoverable_route", canDestroy: false, canLose: false, canSell: false, canConsume: false, canHide: false }, "locked");

function heldObjectState(): LanternCampaignState {
  const state = createInitialCampaign("account-held-object", "actor-held-object");
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Mnehmos";
  state.character.abilities.dex = 20;
  state.worldContext = {
    id: "ludus-vault", title: "The Ludus Holding Vault", description: "Ledrus guards a service hatch with a key ring hanging from his belt.",
    features: ["Ledrus's key ring", "a locked service hatch"], exits: [],
    npcs: [{ id: "ledrus", name: "Ledrus", description: "A wary lanista guarding the service hatch.", disposition: "unfriendly", goals: ["Keep the prisoner contained"], socialDc: 14, relationshipScore: 0, memories: [] }],
    merchants: [], objects: [serviceHatch()],
  };
  state.log.push({ id: "released-key-ring-beat", kind: "narration", text: "Ledrus shifts at the bars; his iron key ring hangs from his belt.", createdAt: new Date(0).toISOString() });
  return normalizeCampaignState(state);
}

function contextFor(state: LanternCampaignState): RequestContext {
  return { requestId: randomUUID(), accountId: state.accountId, campaignId: state.id, actorId: state.actorId, capabilities: ["player", "dm"] };
}

function createStore(state: LanternCampaignState, context: RequestContext): LanternEngineStore {
  const dir = mkdtempSync(join(tmpdir(), "lantern-dm-held-object-"));
  const store = new LanternEngineStore(join(dir, "engine.db"));
  store.createCampaign(context, state);
  return store;
}

describe("DM held-object reconciliation", () => {
  it("repairs prose-only transfer and then resolves a key-use action from authoritative state", async () => {
    deterministicRandomInt.mockClear();
    const state = heldObjectState();
    const context = contextFor(state);
    const store = createStore(state, context);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolResponse(call("social-check", "social_check", { npcId: "ledrus", ability: "cha", goal: "Loosen Ledrus's grip on the key ring." })))
      .mockResolvedValueOnce(narration("You wrench the key ring free and close your hand around it."))
      .mockResolvedValueOnce(toolResponse(
        call("materialize-key-ring", "world_context", { title: state.worldContext!.title, description: state.worldContext!.description, features: state.worldContext!.features, exits: [], objects: { upsert: [keyRing()] } }),
        call("seize-key-ring", "challenge_attempt", { challengeId: "seize-held-object-v1", goal: "Seize Ledrus's key ring", approach: "Lunge through the opening and wrench it from Ledrus's belt.", sceneId: "ludus-vault:ledrus-key-ring", opponentId: "ledrus" }),
        call("steal-key-ring", "interact", { targetId: "ledrus-key-ring", affordance: "steal", goal: "Take the key ring from Ledrus." }),
      ))
      .mockResolvedValueOnce(narration("The contest is settled: the key ring is now in your hand."))
      .mockResolvedValueOnce(narration("The hatch remains shut for the moment."))
      .mockResolvedValueOnce(toolResponse(call("unlock-hatch", "interact", { targetId: "service-hatch", sourceId: "ledrus-key-ring", affordance: "unlock", goal: "Use the key ring to unlock the service hatch." })))
      .mockResolvedValueOnce(narration("The key ring turns the lock, and the service hatch clicks open."));
    vi.stubGlobal("fetch", openAiSdkFetch(fetchMock));

    const dm = new LanternDungeonMaster(store, options);
    const transfer = await dm.resolveTurn(context, state, randomUUID(), state.version, "I wrench Ledrus's key ring from his belt and seize it.");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(transfer.event?.effects?.map((effect) => effect.tool)).toEqual(["social_check", "world_context", "challenge_attempt", "interact"]);
    expect(transfer.state.worldContext?.objects).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ledrus-key-ring", state: "carried", locationRef: null, ownerRef: { kind: "actor", id: state.actorId } })]));
    expect(transfer.narration.text).toContain("now in your hand");

    const unlock = await dm.resolveTurn(context, transfer.state, randomUUID(), transfer.state.version, "I use Ledrus's key ring to unlock the service hatch.");
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(unlock.event?.effects?.map((effect) => effect.tool)).toEqual(["interact"]);
    expect(unlock.state.worldContext?.objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ledrus-key-ring", ownerRef: { kind: "actor", id: state.actorId }, state: "carried" }),
      expect.objectContaining({ id: "service-hatch", state: "unlocked" }),
    ]));
    expect(unlock.narration.text).toContain("clicks open");
    expect(JSON.stringify(unlock.narration)).not.toContain("object_not_found");
    store.close();
  });
});
