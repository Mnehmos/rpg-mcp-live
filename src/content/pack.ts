import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import {
  compiledContentRecordSchema,
  normalizedContentRecordSchema,
  open5eCollectionSchema,
  open5ePackManifestSchema,
  OPEN5E_COLLECTIONS,
  type CompiledContentRecord,
  type NormalizedContentRecord,
  type Open5eCollection,
  type Open5ePackManifest,
} from "./schema.js";
import { verifyOpen5ePack } from "./open5e-pack-verify.js";

export const ACTIVE_OPEN5E_PACK_VERSION = "open5e-v2-full-corpus-s8";
export const HISTORICAL_OPEN5E_PACK_VERSIONS = Object.freeze([
  "open5e-v2-srd-2014-s1",
  "open5e-v2-srd-2014-s7",
] as const);
export const INSTALLED_OPEN5E_PACK_VERSIONS = Object.freeze([
  ...HISTORICAL_OPEN5E_PACK_VERSIONS,
  ACTIVE_OPEN5E_PACK_VERSION,
]);

export function open5ePackDirectory(packVersion: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(packVersion)) {
    throw new Error(`Invalid Open5e pack version path: ${packVersion}.`);
  }
  return fileURLToPath(new URL(`../../content/open5e/${packVersion}/`, import.meta.url));
}

export const ACTIVE_OPEN5E_PACK_DIRECTORY = open5ePackDirectory(ACTIVE_OPEN5E_PACK_VERSION);
export const HISTORICAL_OPEN5E_PACK_DIRECTORIES = Object.freeze(
  HISTORICAL_OPEN5E_PACK_VERSIONS.map(open5ePackDirectory)
);

export interface Open5ePackDescriptor {
  packHash: string;
  packVersion: string;
  rulesVersion: string;
  targetDocumentKey: string;
  taxonomyDocumentKey: string;
  gamesystems: string[];
  packDirectory: string;
}

export class Open5eContentPack {
  public readonly descriptor: Open5ePackDescriptor;
  public readonly manifest: Open5ePackManifest;
  private readonly normalizedIndex: Map<string, NormalizedContentRecord>;
  private readonly compiledIndex: Map<string, CompiledContentRecord>;
  private readonly compiledBySourceIndex: Map<string, readonly CompiledContentRecord[]>;
  private readonly collectionIndex: Map<Open5eCollection, readonly NormalizedContentRecord[]>;
  private readonly rawIndex: Map<string, unknown>;

  public constructor(
    descriptor: Open5ePackDescriptor,
    manifest: Open5ePackManifest,
    normalizedRecords: NormalizedContentRecord[],
    compiledRecords: CompiledContentRecord[],
    collections: Map<Open5eCollection, readonly NormalizedContentRecord[]>,
    rawRecords: Array<{ collection: Open5eCollection; sourceKey: string; payload: unknown }> = []
  ) {
    this.descriptor = deepFreeze({ ...descriptor, gamesystems: [...descriptor.gamesystems] });
    this.manifest = deepFreeze(manifest);
    this.normalizedIndex = indexUnique(normalizedRecords, "normalized");
    this.compiledIndex = indexUnique(compiledRecords, "compiled");
    this.compiledBySourceIndex = indexCompiledBySource(compiledRecords);
    this.collectionIndex = collections;
    this.rawIndex = new Map(rawRecords.map((record) => [
      `${record.collection}\u0000${record.sourceKey}`,
      deepFreeze(record.payload),
    ]));
  }

  public getNormalized(contentKey: string): NormalizedContentRecord | null {
    return this.normalizedIndex.get(contentKey) ?? null;
  }

  public getCompiled(contentKey: string): CompiledContentRecord | null {
    return this.compiledIndex.get(contentKey) ?? null;
  }

  public getCompiledForSource(contentKey: string): readonly CompiledContentRecord[] {
    return this.compiledBySourceIndex.get(contentKey) ?? [];
  }

  public compiledRecords(): readonly CompiledContentRecord[] {
    return [...this.compiledIndex.values()];
  }

  public records(collection?: Open5eCollection): readonly NormalizedContentRecord[] {
    if (collection) return this.collectionIndex.get(collection) ?? [];
    return [...this.normalizedIndex.values()];
  }

  public collectionNames(): Open5eCollection[] {
    return OPEN5E_COLLECTIONS.filter((collection) => this.collectionIndex.has(collection));
  }

  public getRaw(collection: Open5eCollection, sourceKey: string): unknown | null {
    return this.rawIndex.get(`${collection}\u0000${sourceKey}`) ?? null;
  }
}

export async function loadOpen5eContentPack(packDirectory: string): Promise<Open5eContentPack> {
  const absolutePackDirectory = resolve(packDirectory);
  const verification = await verifyOpen5ePack(absolutePackDirectory);
  const manifest = open5ePackManifestSchema.parse(
    JSON.parse(await readFile(join(absolutePackDirectory, "manifest.json"), "utf8")) as unknown
  );
  const normalizedRecords: NormalizedContentRecord[] = [];
  const compiledRecords: CompiledContentRecord[] = [];
  const collectionIndex = new Map<Open5eCollection, readonly NormalizedContentRecord[]>();
  const rawRecords: Array<{ collection: Open5eCollection; sourceKey: string; payload: unknown }> = [];

  const collectionNames = OPEN5E_COLLECTIONS.filter((collection) => manifest.collections[collection] !== undefined);
  for (const collection of collectionNames) {
    open5eCollectionSchema.parse(collection);
    const collectionManifest = manifest.collections[collection];
    if (!collectionManifest) throw new Error(`Verified Open5e collection disappeared: ${collection}.`);
    const raw = parseNdjson(
      await readFile(join(absolutePackDirectory, ...collectionManifest.raw.path.split("/")), "utf8")
    );
    for (const payload of raw) {
      const sourceKey = rawRecordKey(payload);
      if (sourceKey) rawRecords.push({ collection, sourceKey, payload });
    }
    const normalized = parseNdjson(
      await readFile(join(absolutePackDirectory, ...collectionManifest.normalized.path.split("/")), "utf8")
    ).map((record) => deepFreeze(normalizedContentRecordSchema.parse(record)));
    const compiled = parseNdjson(
      await readFile(join(absolutePackDirectory, ...collectionManifest.compiled.path.split("/")), "utf8")
    ).map((record) => deepFreeze(compiledContentRecordSchema.parse(record)));
    collectionIndex.set(collection, Object.freeze(normalized));
    normalizedRecords.push(...normalized);
    compiledRecords.push(...compiled);
  }

  return new Open5eContentPack(
    {
      packHash: verification.packHash,
      packVersion: verification.packVersion,
      rulesVersion: verification.rulesVersion,
      targetDocumentKey: manifest.targetDocumentKey,
      taxonomyDocumentKey: manifest.taxonomyDocumentKey,
      gamesystems: [...manifest.gamesystems],
      packDirectory: absolutePackDirectory,
    },
    manifest,
    normalizedRecords,
    compiledRecords,
    collectionIndex,
    rawRecords
  );
}

function rawRecordKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.key === "string" && record.key) return record.key;
  if (typeof record.slug === "string" && record.slug) return record.slug;
  return null;
}

export async function loadActiveOpen5eContentPack(): Promise<Open5eContentPack> {
  return loadOpen5eContentPack(ACTIVE_OPEN5E_PACK_DIRECTORY);
}

function parseNdjson(text: string): unknown[] {
  if (!text) return [];
  return text.trimEnd().split("\n").map((line) => JSON.parse(line) as unknown);
}

function indexUnique<T extends { contentKey: string }>(records: T[], label: string): Map<string, T> {
  const index = new Map<string, T>();
  for (const record of records) {
    if (index.has(record.contentKey)) {
      throw new Error(`Duplicate ${label} Open5e content key across collections: ${record.contentKey}.`);
    }
    index.set(record.contentKey, record);
  }
  return index;
}

function indexCompiledBySource(records: CompiledContentRecord[]): Map<string, readonly CompiledContentRecord[]> {
  const mutable = new Map<string, CompiledContentRecord[]>();
  for (const record of records) {
    const programs = mutable.get(record.sourceContentKey) ?? [];
    programs.push(record);
    mutable.set(record.sourceContentKey, programs);
  }
  return new Map(
    [...mutable.entries()].map(([sourceContentKey, programs]) => [
      sourceContentKey,
      Object.freeze([...programs].sort((left, right) => left.key.localeCompare(right.key))),
    ])
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
