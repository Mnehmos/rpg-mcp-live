import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialCampaign, resolveEngineCommand, toSessionView } from "../engine-domain.js";
import { LanternEngineStore } from "../engine-store.js";
import type { EngineContentRepinCommand, EngineEvent, RequestContext } from "../engine-contracts.js";
import { diffOpen5ePacks } from "./pack-diff.js";
import { loadOpen5eContentPack, open5ePackDirectory, type Open5eContentPack } from "./pack.js";
import { Open5ePackRegistry } from "./registry.js";
import { assessCampaignRepin, collectCampaignContentReferences, resolveCampaignRepin } from "./repin.js";

const S1_VERSION = "open5e-v2-srd-2014-s1";
const S7_VERSION = "open5e-v2-srd-2014-s7";
const S8_VERSION = "open5e-v2-full-corpus-s8";
const REVIEW_SHA = "b80b3ed1ac62f64d39f3cfcee2ff204f0dbdcaced4a9997c118dd55f872db985";
const BEDROLL_KEY = "open5e:item:5e-2014:srd-2014:srd_bedroll";
const GOBLIN_KEY = "open5e:creature:5e-2014:srd-2014:srd_goblin";

let s1: Open5eContentPack;
let s7: Open5eContentPack;
let s8: Open5eContentPack;

beforeAll(async () => {
  [s1, s7, s8] = await Promise.all([
    loadOpen5eContentPack(open5ePackDirectory(S1_VERSION)),
    loadOpen5eContentPack(open5ePackDirectory(S7_VERSION)),
    loadOpen5eContentPack(open5ePackDirectory(S8_VERSION)),
  ]);
});

describe("Open5e S9 pack review and campaign re-pin", () => {
  it("produces a deterministic S7-to-S8 coverage and compatibility review", () => {
    const diff = diffOpen5ePacks(s7, s8);

    expect(diff.reviewSha256).toBe(REVIEW_SHA);
    expect(diff.normalized.removed).toEqual([]);
    expect(diff.compiled.removed).toEqual([]);
    expect(diff.compiled.changed).toEqual([]);
    expect(diff.normalized.provenanceOnly).toContain(BEDROLL_KEY);
    expect(diff.normalized.changed).toHaveLength(5);
    expect(diff.normalized.added.length).toBeGreaterThan(7_000);
  });

  it("atomically re-pins compatible state while preserving and resolving the original event", () => {
    const store = testStore();
    const accountId = "repin-account";
    const actorId = "repin-actor";
    const state = createInitialCampaign(
      accountId,
      actorId,
      randomUUID(),
      undefined,
      s7.descriptor.rulesVersion
    );
    state.character.inventory = [{
      id: "bedroll",
      quantity: 1,
      contentKey: BEDROLL_KEY,
      packHash: s7.descriptor.packHash,
    }];
    state.combat.enemies = [{
      id: "historical-goblin",
      contentKey: GOBLIN_KEY,
      packHash: s7.descriptor.packHash,
      hp: 7,
      alive: true,
      position: { frameId: state.combat.tactical.geometry.frameId, x: 6, y: 0, z: 0 },
      footprint: { width: 1, height: 1 },
      distanceFeet: 30,
      conditions: [],
      actionResources: {},
    }];
    store.createCampaign({
      requestId: randomUUID(),
      accountId,
      actorId,
      capabilities: ["player", "dm"],
    }, state);
    const commandContext = context(accountId, state.id, actorId);
    const historicalCommandId = randomUUID();
    const historical = store.executeCommand({
      context: commandContext,
      clientCommandId: historicalCommandId,
      expectedCampaignVersion: 0,
      command: { kind: "roll_check", ability: "wis", goal: "Record historical content evidence." },
      tool: "roll_check",
      resolve: (current) => {
        const resolution = resolveEngineCommand(
          current,
          commandContext,
          historicalCommandId,
          { kind: "roll_check", ability: "wis", goal: "Record historical content evidence." },
          "roll_check"
        );
        return resolution.event
          ? { ...resolution, event: { ...resolution.event, contentKeys: [BEDROLL_KEY] } }
          : resolution;
      },
    });
    expect(historical.event?.rulesVersion).toBe(s7.descriptor.rulesVersion);
    const originalEvent = store.listCampaignEvents(commandContext)[0] as EngineEvent;

    const assessment = assessCampaignRepin(historical.state, s7, s8);
    expect(assessment).toMatchObject({ accepted: true, reviewSha256: REVIEW_SHA });
    expect(assessment.compatibility["provenance-only"]).toEqual([GOBLIN_KEY, BEDROLL_KEY]);
    const migrationCommandId = randomUUID();
    const migrationCommand: EngineContentRepinCommand = {
      kind: "content_repin",
      fromRulesVersion: s7.descriptor.rulesVersion,
      toRulesVersion: s8.descriptor.rulesVersion,
      reviewSha256: REVIEW_SHA,
      approvedChangedKeys: [],
    };
    const migration = store.executeCommand({
      context: commandContext,
      clientCommandId: migrationCommandId,
      expectedCampaignVersion: historical.state.version,
      command: migrationCommand,
      tool: "content_repin",
      resolve: (current) => resolveCampaignRepin(
        current,
        commandContext,
        migrationCommandId,
        s7,
        s8,
        REVIEW_SHA
      ),
    });

    expect(migration).toMatchObject({ accepted: true, code: null });
    expect(migration.state.rulesVersion).toBe(s8.descriptor.rulesVersion);
    expect(migration.state.version).toBe(2);
    expect(JSON.stringify(migration.state)).not.toContain(s7.descriptor.packHash);
    expect(collectCampaignContentReferences(migration.state).map((reference) => reference.packHash)).toEqual([
      s8.descriptor.packHash,
      s8.descriptor.packHash,
    ]);
    expect(toSessionView(migration.state).combat.enemies[0]).toMatchObject({ name: "Goblin", armorClass: 15 });

    const events = store.listCampaignEvents(commandContext);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(originalEvent);
    expect(events[0]?.rulesVersion).toBe(s7.descriptor.rulesVersion);
    expect(events[1]).toMatchObject({ rulesVersion: s8.descriptor.rulesVersion, tool: "content_repin" });
    const registry = new Open5ePackRegistry(s8, [s1, s7, s8]);
    const policy = { gamesystem: "5e-2014", allowedDocuments: ["srd-2014"], allowedLicenses: ["cc-by-40"] };
    expect(registry.resolveEvent(events[0] as EngineEvent, policy).content[0]).toMatchObject({
      contentKey: BEDROLL_KEY,
      packHash: s7.descriptor.packHash,
      recordKind: "normalized",
    });
    expect(registry.resolveEvent(events[1] as EngineEvent, policy).content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentKey: BEDROLL_KEY, packHash: s8.descriptor.packHash }),
        expect.objectContaining({ contentKey: GOBLIN_KEY, packHash: s8.descriptor.packHash }),
      ])
    );
    store.close();
  });

  it("resolves deployed S1 event evidence from S1 after S8 becomes active", () => {
    const registry = new Open5ePackRegistry(s8, [s1, s7, s8]);
    const skillKey = "open5e:skill:5e-2014:srd-2014:athletics";
    const event = syntheticEvent(s1.descriptor.rulesVersion, [skillKey]);
    const resolved = registry.resolveEvent(event, {
      gamesystem: "5e-2014",
      allowedDocuments: ["srd-2014"],
      allowedLicenses: ["cc-by-40"],
    });

    expect(resolved.pack?.packHash).toBe(s1.descriptor.packHash);
    expect(resolved.content).toEqual([
      expect.objectContaining({ contentKey: skillKey, packHash: s1.descriptor.packHash, effectiveTier: 1 }),
    ]);
  });

  it("rejects an unconfirmed review without changing campaign state or events", () => {
    const store = testStore();
    const accountId = "repin-review-account";
    const actorId = "repin-review-actor";
    const state = createInitialCampaign(accountId, actorId, randomUUID(), undefined, s7.descriptor.rulesVersion);
    state.character.inventory = [];
    store.createCampaign({ requestId: randomUUID(), accountId, actorId, capabilities: ["admin"] }, state);
    const commandContext = context(accountId, state.id, actorId);
    const clientCommandId = randomUUID();
    const command: EngineContentRepinCommand = {
      kind: "content_repin",
      fromRulesVersion: s7.descriptor.rulesVersion,
      toRulesVersion: s8.descriptor.rulesVersion,
      reviewSha256: "0".repeat(64),
      approvedChangedKeys: [],
    };
    const result = store.executeCommand({
      context: commandContext,
      clientCommandId,
      expectedCampaignVersion: 0,
      command,
      tool: "content_repin",
      resolve: (current) => resolveCampaignRepin(
        current,
        commandContext,
        clientCommandId,
        s7,
        s8,
        "0".repeat(64)
      ),
    });

    expect(result).toMatchObject({ accepted: false, code: "content_repin_review_mismatch" });
    expect(store.getCampaign(commandContext).version).toBe(0);
    expect(store.getCampaign(commandContext).rulesVersion).toBe(s7.descriptor.rulesVersion);
    expect(store.listCampaignEvents(commandContext)).toEqual([]);
    store.close();
  });
});

function testStore(): LanternEngineStore {
  return new LanternEngineStore(join(mkdtempSync(join(tmpdir(), "lantern-repin-")), "engine.db"));
}

function context(accountId: string, campaignId: string, actorId: string): RequestContext {
  return { requestId: randomUUID(), accountId, campaignId, actorId, capabilities: ["admin", "dm"] };
}

function syntheticEvent(rulesVersion: string, contentKeys: string[]): EngineEvent {
  const id = randomUUID();
  return {
    id,
    kind: "command",
    tool: "roll_check",
    command: { kind: "roll_check", ability: "wis", goal: "Historical evidence fixture." },
    accountId: "history-account",
    campaignId: "history-campaign",
    actorId: "history-actor",
    requestId: randomUUID(),
    clientCommandId: randomUUID(),
    previousVersion: 0,
    version: 1,
    rulesVersion,
    contentKeys,
    rolls: [],
    modifiers: [],
    outcome: "history_fixture",
    stateChanges: [],
    createdAt: "2026-08-07T00:00:00.000Z",
  };
}
