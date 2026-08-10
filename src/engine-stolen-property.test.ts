import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  engineCommandSchema,
  engineInventoryItemInputSchema,
  engineSocialActionCommandSchema,
  type EngineCommand,
  type LanternCampaignState,
  type RequestContext,
} from "./engine-contracts.js";
import { createInitialCampaign, normalizeCampaignState, readToolData, resolveEngineCommand } from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";

const ITEM_ID = "marked-silver-idol";
const PACK_ID = "theft-fixture-pack";

function markedItem() {
  return {
    id: ITEM_ID,
    quantity: 1,
    authoredDefinition: {
      name: "Marked silver idol",
      kind: "treasure" as const,
      weight: 1,
      valueCopper: 200,
    },
  };
}

function fixtureState(): LanternCampaignState {
  const state = createInitialCampaign("stolen-property-account", "hero");
  state.phase = "sandbox";
  state.character.created = true;
  state.character.name = "Hero";
  state.character.currency.copper = 0;
  state.character.inventory.push({
    id: PACK_ID,
    quantity: 1,
    ownerRef: { kind: "actor", id: state.character.id },
    authoredDefinition: { name: "Satchel", kind: "tool", weight: 1, containerCapacity: 20 },
  });
  state.worldContext = {
    id: "old-market",
    title: "Old Market",
    description: "A market where ownership and witness knowledge are established.",
    features: [],
    exits: [],
    npcs: [],
    merchants: [
      {
        id: "victim-dealer",
        name: "Victim dealer",
        description: "The item's established owner.",
        disposition: "neutral",
        stolenGoodsPolicy: "refuse-known",
        items: [{ item: markedItem(), stock: 1, buyPriceCopper: 200, sellPriceCopper: 100 }],
      },
      {
        id: "witness-merchant",
        name: "Witness merchant",
        description: "An ordinary merchant who saw the theft.",
        disposition: "neutral",
        stolenGoodsPolicy: "refuse-known",
        items: [{ item: markedItem(), stock: 0, buyPriceCopper: 200, sellPriceCopper: 100 }],
      },
      {
        id: "ignorant-merchant",
        name: "Ignorant merchant",
        description: "An ordinary merchant who has not learned of the theft.",
        disposition: "neutral",
        stolenGoodsPolicy: "refuse-known",
        items: [{ item: markedItem(), stock: 0, buyPriceCopper: 200, sellPriceCopper: 100 }],
      },
      {
        id: "reviewed-fence",
        name: "Reviewed fence",
        description: "A merchant using the reviewed fence policy.",
        disposition: "neutral",
        stolenGoodsPolicy: "fence",
        items: [{ item: markedItem(), stock: 0, buyPriceCopper: 200, sellPriceCopper: 100 }],
      },
    ],
    objects: [],
  };
  state.social = {
    relationships: [],
    factions: [],
    reputations: [],
    heat: [],
    obligations: [],
    crimes: [],
    rumors: [],
  };
  return normalizeCampaignState(state);
}

function context(state: LanternCampaignState): RequestContext {
  return {
    requestId: randomUUID(),
    accountId: state.accountId,
    campaignId: state.id,
    actorId: state.actorId,
    capabilities: ["player", "dm"],
  };
}

function resolve(state: LanternCampaignState, command: EngineCommand, clientCommandId: string = randomUUID()) {
  const request = context(state);
  return resolveEngineCommand(state, request, clientCommandId, command, command.kind as never);
}

function steal(state: LanternCampaignState, clientCommandId: string = "137-theft-command") {
  return resolve(state, {
    kind: "social_action",
    action: "theft",
    targetId: "victim-dealer",
    itemId: ITEM_ID,
    witnessId: "witness-merchant",
  }, clientCommandId);
}

function stow(state: LanternCampaignState, clientCommandId: string = "137-stow-command") {
  return resolve(state, {
    kind: "inventory_transfer",
    itemId: ITEM_ID,
    targetContainerId: PACK_ID,
    quantity: 1,
  }, clientCommandId);
}

function fence(state: LanternCampaignState, clientCommandId: string = "137-fence-command") {
  return resolve(state, {
    kind: "merchant_trade",
    merchantId: "reviewed-fence",
    itemId: ITEM_ID,
    side: "sell",
    quantity: 1,
  }, clientCommandId);
}

describe("#137 stolen-property lifecycle", () => {
  it("keeps ownership separate from durable theft provenance through storage and merchant transfer", () => {
    const initial = fixtureState();
    const stolen = steal(initial);
    expect(stolen.accepted).toBe(true);
    expect(stolen.state.worldContext?.merchants.find((merchant) => merchant.id === "victim-dealer")?.items[0]?.stock).toBe(0);
    const stolenItem = stolen.state.character.inventory.find((item) => item.id === ITEM_ID);
    expect(stolenItem).toMatchObject({
      ownerRef: { kind: "actor", id: stolen.state.character.id },
      theftProvenance: [{
        theftEventId: "crime:137-theft-command",
        sourceCommandId: "137-theft-command",
        sourceOwnerRef: { kind: "merchant", id: "victim-dealer" },
        locationRef: "old-market",
        gameTimeMinutes: 0,
        campaignRevision: 0,
        witnessIds: ["witness-merchant"],
        evidenceIds: ["evidence:137-theft-command"],
      }],
    });
    expect(stolen.state.social?.crimes).toHaveLength(1);
    expect(stolen.state.social?.heat).toMatchObject([{ actorId: stolen.state.actorId, score: 20 }]);

    const moved = stow(stolen.state);
    expect(moved.accepted).toBe(true);
    expect(moved.state.character.inventory.find((item) => item.id === ITEM_ID)).toMatchObject({
      ownerRef: { kind: "actor", id: moved.state.character.id },
      containerRef: PACK_ID,
      theftProvenance: [{ sourceOwnerRef: { kind: "merchant", id: "victim-dealer" } }],
    });
    const refreshed = normalizeCampaignState(JSON.parse(JSON.stringify(moved.state)) as LanternCampaignState);
    expect(refreshed.character.inventory.find((item) => item.id === ITEM_ID)?.theftProvenance).toEqual(
      moved.state.character.inventory.find((item) => item.id === ITEM_ID)?.theftProvenance,
    );

    const rejectedBefore = JSON.stringify(moved.state);
    const rejected = resolve(moved.state, {
      kind: "merchant_trade",
      merchantId: "witness-merchant",
      itemId: ITEM_ID,
      side: "sell",
      quantity: 1,
    }, "137-recognized-command");
    expect(rejected.accepted).toBe(false);
    expect(rejected.code).toBe("stolen_property_recognized");
    expect(rejected.data).toMatchObject({ policyKey: "stolen-recognition-v1", knowledgeSource: "witness" });
    expect(JSON.stringify(rejected.state)).toBe(rejectedBefore);

    const ignorant = resolve(moved.state, {
      kind: "merchant_trade",
      merchantId: "ignorant-merchant",
      itemId: ITEM_ID,
      side: "sell",
      quantity: 1,
    }, "137-ignorant-command");
    expect(ignorant.accepted).toBe(true);
    expect(ignorant.data).toMatchObject({ recognition: { recognized: false, knowledgeSource: null } });
    expect(ignorant.state.worldContext?.merchants.find((merchant) => merchant.id === "ignorant-merchant")?.acquiredItems?.[0]).toMatchObject({
      ownerRef: { kind: "merchant", id: "ignorant-merchant" },
      theftProvenance: [{ theftEventId: "crime:137-theft-command" }],
    });

    const fenced = fence(moved.state);
    expect(fenced.accepted).toBe(true);
    expect(fenced.state.character.currency.copper).toBe(50);
    expect(fenced.state.social?.heat).toMatchObject([{ actorId: fenced.state.actorId, score: 25 }]);
    expect(fenced.data).toMatchObject({
      baseUnitPriceCopper: 100,
      unitPriceCopper: 50,
      stolenGoodsPriceMultiplier: 0.5,
      ruleKey: "merchant-fence-v1",
      fenceRiskPolicyKey: "fence-heat-v1",
      localHeat: 25,
    });
    expect(fenced.state.character.inventory.some((item) => item.id === ITEM_ID)).toBe(false);
    expect(fenced.state.worldContext?.merchants.find((merchant) => merchant.id === "reviewed-fence")?.acquiredItems?.[0]).toMatchObject({
      ownerRef: { kind: "merchant", id: "reviewed-fence" },
      theftProvenance: [{
        sourceOwnerRef: { kind: "merchant", id: "victim-dealer" },
        evidenceIds: ["evidence:137-theft-command"],
      }],
    });
    expect(fenced.state.social?.crimes).toHaveLength(1);
    expect(JSON.stringify(readToolData(fenced.state, "merchant_catalog"))).not.toContain("acquiredItems");
    expect(JSON.stringify(readToolData(fenced.state, "merchant_catalog"))).not.toContain("137-theft-command");
  });

  it("keeps recognition, heat, price, and ownership out of model-authored command fields", () => {
    expect(engineInventoryItemInputSchema.safeParse({ ...markedItem(), theftProvenance: [] }).success).toBe(false);
    expect(engineSocialActionCommandSchema.safeParse({
      kind: "social_action",
      action: "theft",
      targetId: "victim-dealer",
      itemId: ITEM_ID,
      ownerRef: { kind: "actor", id: "hero" },
      heat: 100,
    }).success).toBe(false);
    expect(engineCommandSchema.safeParse({
      kind: "merchant_trade",
      merchantId: "reviewed-fence",
      itemId: ITEM_ID,
      side: "sell",
      quantity: 1,
      recognized: false,
      unitPriceCopper: 10_000,
    }).success).toBe(false);

    const unlimited = fixtureState();
    unlimited.worldContext!.merchants.find((merchant) => merchant.id === "victim-dealer")!.items[0]!.stock = -1;
    const before = JSON.stringify(unlimited);
    const rejected = steal(unlimited, "137-unbounded-source");
    expect(rejected.code).toBe("theft_item_not_unique");
    expect(JSON.stringify(rejected.state)).toBe(before);
    expect(rejected.event).toBeNull();
  });

  it("persists the complete lifecycle and replays a fence sale without duplicating evidence, heat, or currency", () => {
    const directory = mkdtempSync(join(tmpdir(), "lantern-stolen-property-"));
    const databasePath = join(directory, "engine.db");
    const store = new LanternEngineStore(databasePath);
    const initial = fixtureState();
    const request = context(initial);
    store.createCampaign(request, initial);

    const theftCommand: EngineCommand = { kind: "social_action", action: "theft", targetId: "victim-dealer", itemId: ITEM_ID, witnessId: "witness-merchant" };
    const transferCommand: EngineCommand = { kind: "inventory_transfer", itemId: ITEM_ID, targetContainerId: PACK_ID, quantity: 1 };
    const fenceCommand: EngineCommand = { kind: "merchant_trade", merchantId: "reviewed-fence", itemId: ITEM_ID, side: "sell", quantity: 1 };
    const theftCommandId = "137-store-theft";
    const transferCommandId = "137-store-transfer";
    const fenceCommandId = "137-store-fence";

    const theftResult = store.executeCommand({
      context: request,
      clientCommandId: theftCommandId,
      expectedCampaignVersion: 0,
      command: theftCommand,
      tool: "social_action",
      resolve: (current) => resolveEngineCommand(current, request, theftCommandId, theftCommand, "social_action"),
    });
    expect(theftResult.accepted).toBe(true);
    const transferResult = store.executeCommand({
      context: request,
      clientCommandId: transferCommandId,
      expectedCampaignVersion: 1,
      command: transferCommand,
      tool: "inventory_transfer",
      resolve: (current) => resolveEngineCommand(current, request, transferCommandId, transferCommand, "inventory_transfer"),
    });
    expect(transferResult.accepted).toBe(true);
    const fenceResult = store.executeCommand({
      context: request,
      clientCommandId: fenceCommandId,
      expectedCampaignVersion: 2,
      command: fenceCommand,
      tool: "merchant_trade",
      resolve: (current) => resolveEngineCommand(current, request, fenceCommandId, fenceCommand, "merchant_trade"),
    });
    expect(fenceResult.accepted).toBe(true);
    expect(store.listCampaignEvents(request)).toHaveLength(3);
    store.close();

    const reopened = new LanternEngineStore(databasePath);
    const persisted = reopened.getCampaign(request);
    expect(persisted.version).toBe(3);
    expect(persisted.character.currency.copper).toBe(50);
    expect(persisted.social?.crimes).toHaveLength(1);
    expect(persisted.social?.heat).toMatchObject([{ actorId: persisted.actorId, score: 25 }]);
    expect(persisted.worldContext?.merchants.find((merchant) => merchant.id === "reviewed-fence")?.acquiredItems?.[0]?.theftProvenance?.[0]).toMatchObject({
      sourceCommandId: theftCommandId,
      sourceOwnerRef: { kind: "merchant", id: "victim-dealer" },
    });
    const persistedBeforeReplay = JSON.stringify(persisted);
    const replay = reopened.executeCommand({
      context: request,
      clientCommandId: fenceCommandId,
      expectedCampaignVersion: 2,
      command: fenceCommand,
      tool: "merchant_trade",
      resolve: () => { throw new Error("replay must not re-enter the resolver"); },
    });
    expect(replay.replayed).toBe(true);
    expect(JSON.stringify(replay.state)).toBe(persistedBeforeReplay);
    expect(reopened.listCampaignEvents(request)).toHaveLength(3);
    reopened.close();
  });
});
