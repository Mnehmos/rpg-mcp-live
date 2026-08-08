import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createInitialCampaign, resolveEngineCommand, toSessionView } from "../engine-domain.js";
import { LanternEngineStore } from "../engine-store.js";
import type { EngineEvent, RequestContext } from "../engine-contracts.js";
import {
  assessLegacyCampaignRepin,
  buildLegacyRepinReview,
  LEGACY_LANTERN_RULES_VERSION,
  resolveLegacyCampaignRepin,
} from "./legacy-repin.js";
import { loadOpen5eContentPack, open5ePackDirectory, type Open5eContentPack } from "./pack.js";
import { Open5ePackRegistry } from "./registry.js";

const S8_VERSION = "open5e-v2-full-corpus-s8";
const ATHLETICS_KEY = "open5e:skill:5e-2014:srd-2014:athletics";
const LEGACY_REVIEW_SHA = "df0258d1b44820b249c332e126396cb1ba4c3ef9a1b4494b4dc655cbb41fdc0c";

let s8: Open5eContentPack;

beforeAll(async () => {
  s8 = await loadOpen5eContentPack(open5ePackDirectory(S8_VERSION));
});

describe("legacy Lantern campaign re-pin", () => {
  it("constructs one deterministic legacy-to-S8 review", () => {
    const first = buildLegacyRepinReview(s8);
    const second = buildLegacyRepinReview(s8);

    expect(second).toEqual(first);
    expect(first.from.rulesVersion).toBe(LEGACY_LANTERN_RULES_VERSION);
    expect(first.to.packHash).toBe(s8.descriptor.packHash);
    expect(first.reviewSha256).toBe(LEGACY_REVIEW_SHA);
  });

  it("atomically migrates a content-free legacy aggregate and preserves unversioned event bytes", () => {
    const store = testStore();
    const accountId = "legacy-account";
    const actorId = "legacy-actor";
    const state = createInitialCampaign(
      accountId,
      actorId,
      randomUUID(),
      undefined,
      LEGACY_LANTERN_RULES_VERSION
    );
    state.character.inventory = [];
    const commandContext = context(accountId, state.id, actorId);
    store.createCampaign({ requestId: randomUUID(), accountId, actorId, capabilities: ["player", "dm"] }, state);

    const historicalCommandId = randomUUID();
    const historical = store.executeCommand({
      context: commandContext,
      clientCommandId: historicalCommandId,
      expectedCampaignVersion: 0,
      command: { kind: "roll_check", ability: "wis", goal: "Persist a pre-pack event." },
      tool: "roll_check",
      resolve: (current) => {
        const resolution = resolveEngineCommand(
          current,
          commandContext,
          historicalCommandId,
          { kind: "roll_check", ability: "wis", goal: "Persist a pre-pack event." },
          "roll_check"
        );
        if (!resolution.event) return resolution;
        const legacyEvent = { ...resolution.event } as Partial<EngineEvent>;
        delete legacyEvent.rulesVersion;
        delete legacyEvent.contentKeys;
        return { ...resolution, event: legacyEvent as EngineEvent };
      },
    });
    const originalEvent = store.listCampaignEvents(commandContext)[0] as EngineEvent;
    expect(Object.hasOwn(originalEvent, "rulesVersion")).toBe(false);
    expect(Object.hasOwn(originalEvent, "contentKeys")).toBe(false);

    const review = buildLegacyRepinReview(s8);
    const assessment = assessLegacyCampaignRepin(historical.state, s8);
    expect(assessment).toMatchObject({ accepted: true, reviewSha256: review.reviewSha256 });
    const migrationCommandId = randomUUID();
    const migration = store.executeCommand({
      context: commandContext,
      clientCommandId: migrationCommandId,
      expectedCampaignVersion: historical.state.version,
      command: {
        kind: "content_repin",
        fromRulesVersion: LEGACY_LANTERN_RULES_VERSION,
        toRulesVersion: s8.descriptor.rulesVersion,
        reviewSha256: review.reviewSha256,
        approvedChangedKeys: [],
      },
      tool: "content_repin",
      resolve: (current) => resolveLegacyCampaignRepin(
        current,
        commandContext,
        migrationCommandId,
        s8,
        review.reviewSha256
      ),
    });

    expect(migration).toMatchObject({ accepted: true, code: null });
    expect(migration.state.rulesVersion).toBe(s8.descriptor.rulesVersion);
    expect(migration.state.version).toBe(2);
    expect(() => toSessionView(migration.state)).not.toThrow();
    const events = store.listCampaignEvents(commandContext);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(originalEvent);
    expect(Object.hasOwn(events[0] as object, "rulesVersion")).toBe(false);
    expect(events[1]).toMatchObject({ rulesVersion: s8.descriptor.rulesVersion, tool: "content_repin" });

    const registry = new Open5ePackRegistry(s8, [s8]);
    expect(registry.resolveEvent(events[0] as EngineEvent, policy())).toMatchObject({
      pack: null,
      content: [],
      legacyUnversioned: true,
      legacyRulesVersion: LEGACY_LANTERN_RULES_VERSION,
    });
    expect(registry.resolveEvent(events[1] as EngineEvent, policy())).toMatchObject({
      pack: { packHash: s8.descriptor.packHash },
      content: [],
      legacyUnversioned: false,
    });
    store.close();
  });

  it("blocks a legacy campaign with an unprovable content marker", () => {
    const state = createInitialCampaign(
      "legacy-marker-account",
      "legacy-marker-actor",
      randomUUID(),
      undefined,
      LEGACY_LANTERN_RULES_VERSION
    );
    state.character.inventory = [];
    state.character.inventory = [{
      id: "unprovable-source-item",
      quantity: 1,
      contentKey: ATHLETICS_KEY,
      packHash: s8.descriptor.packHash,
    }];

    const assessment = assessLegacyCampaignRepin(state, s8);

    expect(assessment).toMatchObject({
      accepted: false,
      code: "content_repin_legacy_content_present",
    });
    expect(assessment.contentMarkers.map((marker) => marker.field)).toEqual(["contentKey", "packHash"]);
  });

  it("rejects a wrong review hash and an unversioned event that claims content", () => {
    const state = createInitialCampaign(
      "legacy-review-account",
      "legacy-review-actor",
      randomUUID(),
      undefined,
      LEGACY_LANTERN_RULES_VERSION
    );
    state.character.inventory = [];
    const commandContext = context(state.accountId, state.id, state.actorId);
    const rejected = resolveLegacyCampaignRepin(state, commandContext, randomUUID(), s8, "0".repeat(64));
    expect(rejected).toMatchObject({ accepted: false, code: "content_repin_review_mismatch" });
    expect(rejected.state).toEqual(state);
    expect(rejected.event).toBeNull();

    const event = {
      id: randomUUID(),
      contentKeys: [ATHLETICS_KEY],
    } as EngineEvent;
    const registry = new Open5ePackRegistry(s8, [s8]);
    expect(() => registry.resolveEvent(event, policy())).toThrowError(
      expect.objectContaining({ code: "content_pack_not_installed" })
    );
  });
});

function testStore(): LanternEngineStore {
  return new LanternEngineStore(join(mkdtempSync(join(tmpdir(), "lantern-legacy-repin-")), "engine.db"));
}

function context(accountId: string, campaignId: string, actorId: string): RequestContext {
  return { requestId: randomUUID(), accountId, campaignId, actorId, capabilities: ["admin", "dm"] };
}

function policy() {
  return {
    gamesystem: "5e-2014",
    allowedDocuments: ["srd-2014"],
    allowedLicenses: ["cc-by-40"],
  };
}
