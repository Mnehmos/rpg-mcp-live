import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  cursorForEngineEvent,
  decodeEngineEventStreamCursor,
  encodeEngineEventStreamCursor,
  parseEngineEventStreamQuery,
  toEngineEventStreamRecord,
  type EngineEventStreamCursor,
} from "./engine-event-stream.js";
import { createInitialCampaign, resolveEngineCommand } from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";
import type { CreateCampaignContext, EngineEvent, RequestContext } from "./engine-contracts.js";
import { LEGACY_LANTERN_RULES_VERSION } from "./content/legacy-repin.js";

function context(accountId: string, campaignId: string, actorId = accountId): RequestContext {
  return {
    requestId: randomUUID(),
    accountId,
    campaignId,
    actorId,
    capabilities: ["player", "dm"],
  };
}

function createCampaign(store: LanternEngineStore, accountId = "account-a", actorId = "actor-a") {
  const createContext: CreateCampaignContext = {
    requestId: randomUUID(),
    accountId,
    actorId,
    capabilities: ["player", "dm"],
  };
  return store.createCampaign(createContext, createInitialCampaign(accountId, actorId));
}

function createStore(databasePath = join(mkdtempSync(join(tmpdir(), "lantern-event-stream-")), "engine.db")) {
  return new LanternEngineStore(databasePath);
}

function commitRoll(store: LanternEngineStore, request: RequestContext, expectedCampaignVersion: number, goal: string) {
  const clientCommandId = randomUUID();
  const command = { kind: "roll_check" as const, ability: "wis" as const, goal };
  return store.executeCommand({
    context: request,
    clientCommandId,
    expectedCampaignVersion,
    command,
    tool: "roll_check",
    resolve: (state) => resolveEngineCommand(state, request, clientCommandId, command, "roll_check"),
  });
}

function syntheticEvent(overrides: Partial<EngineEvent> = {}): EngineEvent {
  return {
    id: randomUUID(),
    kind: "command",
    tool: "declare",
    command: { kind: "declare", goal: "event" },
    accountId: "account-a",
    campaignId: "campaign-a",
    actorId: "actor-a",
    requestId: randomUUID(),
    clientCommandId: randomUUID(),
    previousVersion: 0,
    version: 1,
    rulesVersion: "open5e-pack@test",
    contentKeys: ["open5e:rule:test"],
    rolls: [],
    modifiers: [],
    outcome: "accepted",
    stateChanges: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("canonical event stream", () => {
  it("round-trips an opaque cursor and rejects cross-campaign or malformed cursors", () => {
    const cursor: EngineEventStreamCursor = {
      schemaRevision: 1,
      campaignId: "campaign-a",
      version: 3,
      createdAt: "2026-08-10T00:00:00.000Z",
      eventId: randomUUID(),
    };
    const encoded = encodeEngineEventStreamCursor(cursor);
    expect(encoded).not.toContain("campaign-a");
    expect(decodeEngineEventStreamCursor(encoded, "campaign-a")).toEqual(cursor);
    expect(() => decodeEngineEventStreamCursor(encoded, "campaign-b")).toThrow("cursor");
    expect(() => decodeEngineEventStreamCursor("not-a-cursor", "campaign-a")).toThrow("cursor");
  });

  it("parses a bounded default and rejects unbounded or invalid pages", () => {
    expect(parseEngineEventStreamQuery({})).toEqual({ after: null, limit: 50 });
    expect(parseEngineEventStreamQuery({ after: "abc", limit: "2" })).toEqual({ after: "abc", limit: 2 });
    expect(() => parseEngineEventStreamQuery({ limit: "101" })).toThrow("query");
    expect(() => parseEngineEventStreamQuery({ limit: "0" })).toThrow("query");
  });

  it("exposes a typed actor projection without copying a second event ontology", () => {
    const source = syntheticEvent({ version: 4, previousVersion: 3 });
    const projected = { ...source, outcome: "withheld" };
    const record = toEngineEventStreamRecord(source, projected, "actor-a");
    expect(record).toMatchObject({
      id: source.id,
      kind: "command",
      schemaRevision: 1,
      campaignId: source.campaignId,
      commandId: source.clientCommandId,
      previousRevision: 3,
      revision: 4,
      projection: { audience: "actor", actorId: "actor-a" },
      provenance: {
        requestId: source.requestId,
        rulesVersion: source.rulesVersion,
        contentKeys: source.contentKeys,
      },
      event: projected,
    });
  });

  it("normalizes legacy event provenance instead of failing the stream projection", () => {
    const legacy = syntheticEvent();
    delete (legacy as Partial<EngineEvent> & Record<string, unknown>).rulesVersion;
    delete (legacy as Partial<EngineEvent> & Record<string, unknown>).contentKeys;
    delete (legacy as Partial<EngineEvent> & Record<string, unknown>).requestId;
    const record = toEngineEventStreamRecord(legacy, legacy, "actor-a");
    expect(record.provenance).toEqual({
      requestId: `legacy-event:${legacy.id}`,
      rulesVersion: LEGACY_LANTERN_RULES_VERSION,
      contentKeys: [],
    });
  });

  it("pages committed events, resumes without duplicates, and survives restart", () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "lantern-event-stream-restart-")), "engine.db");
    const firstStore = createStore(databasePath);
    const campaign = createCampaign(firstStore);
    const request = context("account-a", campaign.id, "actor-a");
    const first = commitRoll(firstStore, request, campaign.version, "first event");
    const second = commitRoll(firstStore, request, first.state.version, "second event");
    const replay = firstStore.executeCommand({
      context: request,
      clientCommandId: first.clientCommandId,
      expectedCampaignVersion: campaign.version,
      command: { kind: "roll_check", ability: "wis", goal: "first event" },
      tool: "roll_check",
      resolve: () => {
        throw new Error("A replay must not resolve or append another event.");
      },
    });
    expect(replay.replayed).toBe(true);

    const firstPage = firstStore.listCampaignEventStream(request, { after: null, limit: 1 });
    expect(firstPage.events.map((event) => event.id)).toEqual([first.event?.id]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = firstStore.listCampaignEventStream(request, { after: firstPage.nextCursor, limit: 1 });
    expect(secondPage.events.map((event) => event.id)).toEqual([second.event?.id]);
    expect(secondPage.hasMore).toBe(false);

    const emptyPage = firstStore.listCampaignEventStream(request, { after: secondPage.nextCursor, limit: 1 });
    expect(emptyPage.events).toEqual([]);
    expect(emptyPage.nextCursor).toBe(secondPage.nextCursor);
    expect(firstStore.getCampaign(request).version).toBe(2);
    expect(firstStore.listCampaignEvents(request)).toHaveLength(2);
    firstStore.close();

    const restartedStore = createStore(databasePath);
    const resumed = restartedStore.listCampaignEventStream(request, { after: firstPage.nextCursor, limit: 1 });
    expect(resumed.events.map((event) => event.id)).toEqual([second.event?.id]);
    expect(restartedStore.listCampaignEvents(request).map((event) => event.id)).toEqual([first.event?.id, second.event?.id]);
    restartedStore.close();
  });

  it("keeps stream reads campaign-scoped and rejects a cursor from another campaign", () => {
    const store = createStore();
    const campaign = createCampaign(store, "account-a", "actor-a");
    const other = createCampaign(store, "account-a", "actor-a");
    const request = context("account-a", campaign.id, "actor-a");
    const otherRequest = context("account-a", other.id, "actor-a");
    const result = commitRoll(store, request, campaign.version, "scoped event");
    const cursor = cursorForEngineEvent(campaign.id, result.event!);
    expect(() => store.listCampaignEventStream(otherRequest, { after: cursor, limit: 1 })).toThrow("cursor");
    expect(() => store.listCampaignEventStream(context("account-b", campaign.id, "actor-b"), { after: null, limit: 1 })).toThrow("Campaign not found");
    store.close();
  });
});
