import type { ResolvedEngineEventEvidence } from "./content/registry.js";
import type { EngineEvent } from "./engine-contracts.js";
import { z } from "zod";

/**
 * The stream is a read projection over the committed `EngineEvent` record.
 * It does not introduce another mutation or persistence path.
 */
export const ENGINE_EVENT_STREAM_SCHEMA_REVISION = 1 as const;
export const ENGINE_EVENT_STREAM_MAX_PAGE_SIZE = 100 as const;
export const ENGINE_EVENT_STREAM_DEFAULT_PAGE_SIZE = 50 as const;

const cursorSchema = z.object({
  schemaRevision: z.literal(ENGINE_EVENT_STREAM_SCHEMA_REVISION),
  campaignId: z.string().trim().min(1).max(200),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  eventId: z.string().trim().min(1).max(200),
}).strict();

const querySchema = z.object({
  after: z.string().trim().min(1).max(512).nullable().optional(),
  limit: z.coerce.number().int().min(1).max(ENGINE_EVENT_STREAM_MAX_PAGE_SIZE).default(ENGINE_EVENT_STREAM_DEFAULT_PAGE_SIZE),
}).strict();

export interface EngineEventStreamCursor {
  schemaRevision: typeof ENGINE_EVENT_STREAM_SCHEMA_REVISION;
  campaignId: string;
  version: number;
  createdAt: string;
  eventId: string;
}

export interface EngineEventStreamQuery {
  after: string | null;
  limit: number;
}

export interface EngineEventStreamPage<T> {
  schemaRevision: typeof ENGINE_EVENT_STREAM_SCHEMA_REVISION;
  campaignId: string;
  events: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface EngineEventStreamRecord {
  id: string;
  kind: EngineEvent["kind"];
  schemaRevision: typeof ENGINE_EVENT_STREAM_SCHEMA_REVISION;
  accountId: string;
  campaignId: string;
  actorId: string;
  commandId: string;
  previousRevision: number;
  revision: number;
  createdAt: string;
  provenance: {
    requestId: string;
    rulesVersion: string;
    contentKeys: string[];
  };
  projection: {
    audience: "actor";
    actorId: string;
  };
  event: EngineEvent;
}

export type EngineEventStreamEvidence = Omit<ResolvedEngineEventEvidence, "event"> & {
  event: EngineEventStreamRecord;
};

export class EngineEventStreamQueryError extends Error {
  public constructor(message = "The event stream query is invalid.") {
    super(message);
    this.name = "EngineEventStreamQueryError";
  }
}

export class EngineEventStreamCursorError extends Error {
  public constructor(message = "The event stream cursor is invalid.") {
    super(message);
    this.name = "EngineEventStreamCursorError";
  }
}

export function parseEngineEventStreamQuery(input: unknown): EngineEventStreamQuery {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new EngineEventStreamQueryError();
  return {
    after: parsed.data.after ?? null,
    limit: parsed.data.limit,
  };
}

export function encodeEngineEventStreamCursor(cursor: EngineEventStreamCursor): string {
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success) throw new EngineEventStreamCursorError();
  return Buffer.from(JSON.stringify(parsed.data), "utf8").toString("base64url");
}

export function decodeEngineEventStreamCursor(value: string | null | undefined, campaignId: string): EngineEventStreamCursor | null {
  if (value == null || value === "") return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new EngineEventStreamCursorError();
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(decoded));
    if (!parsed.success || parsed.data.campaignId !== campaignId) throw new EngineEventStreamCursorError();
    return parsed.data;
  } catch (error) {
    if (error instanceof EngineEventStreamCursorError) throw error;
    throw new EngineEventStreamCursorError();
  }
}

export function cursorForEngineEvent(campaignId: string, event: Pick<EngineEvent, "id" | "version" | "createdAt">): string {
  return encodeEngineEventStreamCursor({
    schemaRevision: ENGINE_EVENT_STREAM_SCHEMA_REVISION,
    campaignId,
    version: event.version,
    createdAt: event.createdAt,
    eventId: event.id,
  });
}

export function toEngineEventStreamRecord(
  event: EngineEvent,
  projectedEvent: EngineEvent,
  projectionActorId: string,
): EngineEventStreamRecord {
  return {
    id: event.id,
    kind: event.kind,
    schemaRevision: ENGINE_EVENT_STREAM_SCHEMA_REVISION,
    accountId: event.accountId,
    campaignId: event.campaignId,
    actorId: event.actorId,
    commandId: event.clientCommandId,
    previousRevision: event.previousVersion,
    revision: event.version,
    createdAt: event.createdAt,
    provenance: {
      requestId: event.requestId,
      rulesVersion: event.rulesVersion,
      contentKeys: [...event.contentKeys],
    },
    projection: {
      audience: "actor",
      actorId: projectionActorId,
    },
    event: projectedEvent,
  };
}
