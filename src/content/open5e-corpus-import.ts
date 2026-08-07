import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson, sha256 } from "./hash.js";
import { verifyOpen5eS7Pack } from "./open5e-pack-verify.js";
import {
  compiledContentRecordSchema,
  normalizedContentRecordSchema,
  open5ePackManifestSchema,
  type CompiledContentRecord,
  type NormalizedContentRecord,
  type NormalizedCorpusReference,
  type NormalizedDocument,
  type Open5eCollection,
  type Open5ePackManifest,
} from "./schema.js";
import { promoteOpen5e2014Backgrounds, type Open5eImportOptions, type Open5eImportResult } from "./open5e-import.js";

const S8_V2_COLLECTIONS: readonly Open5eCollection[] = [
  "conditions",
  "damagetypes",
  "sizes",
  "documents",
  "skills",
  "rules",
  "rulesets",
  "items",
  "itemsets",
  "itemcategories",
  "weapons",
  "armor",
  "magicitems",
  "weaponproperties",
  "itemrarities",
  "creaturetypes",
  "environments",
  "creaturesets",
  "creatures",
  "spellschools",
  "spells",
  "abilities",
  "languages",
  "alignments",
  "species",
  "classes",
  "backgrounds",
  "feats",
  "licenses",
  "publishers",
  "gamesystems",
  "images",
  "services",
] as const;

const S8_V1_DERIVED_COLLECTIONS: readonly Open5eCollection[] = [
  "spelllists",
  "spellprogressions",
  "sections",
  "planes",
] as const;

const catalogOnlyCollections = new Set<Open5eCollection>([
  "licenses",
  "publishers",
  "gamesystems",
]);

const rawPublisherSchema = z.object({ key: z.string().min(1), name: z.string().min(1) });
const rawGamesystemSchema = z.object({ key: z.string().min(1), name: z.string().min(1) });
const rawLicenseSchema = z.object({ key: z.string().min(1), name: z.string().min(1) });
const rawDocumentSchema = z.object({
  key: z.string().min(1),
  licenses: z.array(rawLicenseSchema).min(1),
  publisher: rawPublisherSchema,
  gamesystem: rawGamesystemSchema,
  display_name: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().nullish(),
  type: z.string().min(1),
  author: z.string().nullish(),
  publication_date: z.string().nullish(),
  permalink: z.string().url(),
  distance_unit: z.string().nullish(),
  weight_unit: z.string().nullish(),
}).passthrough();
const paginationSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().url().nullable(),
  previous: z.string().url().nullable(),
  results: z.array(z.unknown()),
});

type RawDocument = z.infer<typeof rawDocumentSchema>;

export interface Open5eCorpusImportOptions extends Open5eImportOptions {
  basePackDirectory?: string;
}

interface FetchResult {
  records: unknown[];
  sourceUrls: string[];
  reportedCount: number;
}

interface ProvenanceCandidate {
  document: RawDocument;
  gamesystem: string;
  description: string;
}

export async function importOpen5eS8(
  options: Open5eCorpusImportOptions
): Promise<Open5eImportResult> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl ?? "https://api.open5e.com/v2");
  const pageSize = options.pageSize ?? 500;
  const maxAttempts = options.maxAttempts ?? 4;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const targetDocumentKey = options.targetDocumentKey ?? "srd-2014";
  const taxonomyDocumentKey = options.taxonomyDocumentKey ?? "core";
  const basePackDirectory = resolve(
    options.basePackDirectory
      ?? fileURLToPath(new URL("../../content/open5e/open5e-v2-srd-2014-s7/", import.meta.url))
  );

  assertSafePackVersion(options.packVersion);
  assertIsoTimestamp(options.sourceFetchedAt);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("Open5e pageSize must be an integer from 1 through 500.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("Open5e maxAttempts must be an integer from 1 through 10.");
  }
  await verifyOpen5eS7Pack(basePackDirectory);
  const baseManifest = open5ePackManifestSchema.parse(
    JSON.parse(await readFile(join(basePackDirectory, "manifest.json"), "utf8")) as unknown
  );
  if (baseManifest.targetDocumentKey !== targetDocumentKey) {
    throw new Error(`S8 base pack targets ${baseManifest.targetDocumentKey}, not ${targetDocumentKey}.`);
  }

  const packDirectory = join(options.outputRoot, options.packVersion);
  if (!options.overwrite && await pathExists(join(packDirectory, "manifest.json"))) {
    throw new Error(`Open5e pack already exists: ${packDirectory}`);
  }

  const fetchedEntries = await mapWithConcurrency(S8_V2_COLLECTIONS, 8, async (collection) => {
    const result = await fetchPaginated(
      `${apiBaseUrl}/${collection}/?limit=${pageSize}`,
      { fetchImpl, maxAttempts, sleep }
    );
    return [collection, result] as const;
  });
  const fetched = new Map<Open5eCollection, FetchResult>(fetchedEntries);
  const rawDocuments = requireFetch(fetched, "documents").records
    .map((record) => rawDocumentSchema.parse(record))
    .sort((left, right) => left.key.localeCompare(right.key));
  const documents = new Map(rawDocuments.map((document) => [document.key, document]));
  const targetDocument = requireDocument(documents, targetDocumentKey);
  requireDocument(documents, taxonomyDocumentKey);
  verifyCatalogConsistency(fetched, rawDocuments);

  const rawByCollection = new Map<Open5eCollection, unknown[]>();
  const normalizedByCollection = new Map<Open5eCollection, NormalizedContentRecord[]>();
  const compiledByCollection = new Map<Open5eCollection, CompiledContentRecord[]>();
  const sourceUrlsByCollection = new Map<Open5eCollection, string[]>();

  for (const collection of S8_V2_COLLECTIONS) {
    const result = requireFetch(fetched, collection);
    const rawRecords = validateAndSortRaw(result.records, collection);
    if (rawRecords.length !== result.reportedCount) {
      throw new Error(
        `Open5e ${collection} pagination returned ${rawRecords.length} records; the API reported ${result.reportedCount}.`
      );
    }
    rawByCollection.set(collection, rawRecords);
    sourceUrlsByCollection.set(collection, [...result.sourceUrls].sort());
    if (collection === "documents") {
      normalizedByCollection.set(
        collection,
        normalizeCorpusDocuments(rawDocuments, options.sourceFetchedAt, targetDocumentKey, taxonomyDocumentKey)
      );
      compiledByCollection.set(collection, []);
      continue;
    }

    const baseRawRecords = await readBaseArtifact(basePackDirectory, baseManifest, collection, "raw");
    if (baseRawRecords.length > 0) assertBaseRawSubset(collection, baseRawRecords, rawRecords);
    const typedRecords = (await readBaseArtifact(basePackDirectory, baseManifest, collection, "normalized"))
      .map((record) => normalizedContentRecordSchema.parse({
        ...(record as Record<string, unknown>),
        sourceFetchedAt: options.sourceFetchedAt,
      }));
    let promotedNormalized: NormalizedContentRecord[] = [];
    let promotedCompiled: CompiledContentRecord[] = [];
    if (collection === "backgrounds") {
      const typedSkills = (normalizedByCollection.get("skills") ?? [])
        .filter((record): record is Extract<NormalizedContentRecord, { kind: "skill" }> => record.kind === "skill");
      const typedLanguages = (normalizedByCollection.get("languages") ?? [])
        .filter((record): record is Extract<NormalizedContentRecord, { kind: "language" }> => record.kind === "language");
      const typedItems = (normalizedByCollection.get("items") ?? [])
        .filter((record): record is Extract<NormalizedContentRecord, { kind: "item" }> => record.kind === "item");
      const promotion = promoteOpen5e2014Backgrounds(
        rawRecords,
        rawDocuments,
        typedSkills,
        typedLanguages,
        typedItems,
        options.sourceFetchedAt
      );
      const typedContentKeys = new Set(typedRecords.map((record) => record.contentKey));
      promotedNormalized = promotion.normalized.filter((record) => !typedContentKeys.has(record.contentKey));
      const promotedSourceKeys = new Set(promotedNormalized.map((record) => record.contentKey));
      promotedCompiled = promotion.compiled.filter((record) => promotedSourceKeys.has(record.sourceContentKey));
    }
    const effectiveTypedRecords = [...typedRecords, ...promotedNormalized];
    const typedIdentities = new Set(effectiveTypedRecords.map((record) => provenanceIdentity(
      record.sourceKey,
      record.documentKey,
      record.gamesystem
    )));
    const references = catalogOnlyCollections.has(collection)
      ? []
      : normalizeCorpusReferences(
          collection,
          rawRecords,
          documents,
          typedIdentities,
          options.sourceFetchedAt
        );
    const normalized = [...effectiveTypedRecords, ...references]
      .map((record) => normalizedContentRecordSchema.parse(record))
      .sort(compareContentRecords);
    assertUniqueContentRecords(collection, normalized);
    normalizedByCollection.set(collection, normalized);

    const compiled = [
      ...(await readBaseArtifact(basePackDirectory, baseManifest, collection, "compiled")),
      ...promotedCompiled,
    ]
      .map((record) => compiledContentRecordSchema.parse({
        ...(record as Record<string, unknown>),
        sourceFetchedAt: options.sourceFetchedAt,
      }))
      .sort(compareContentRecords);
    compiledByCollection.set(collection, compiled);
  }

  for (const collection of S8_V1_DERIVED_COLLECTIONS) {
    const raw = await readBaseArtifact(basePackDirectory, baseManifest, collection, "raw");
    const normalized = (await readBaseArtifact(basePackDirectory, baseManifest, collection, "normalized"))
      .map((record) => normalizedContentRecordSchema.parse({
        ...(record as Record<string, unknown>),
        sourceFetchedAt: options.sourceFetchedAt,
      }))
      .sort(compareContentRecords);
    const compiled = (await readBaseArtifact(basePackDirectory, baseManifest, collection, "compiled"))
      .map((record) => compiledContentRecordSchema.parse({
        ...(record as Record<string, unknown>),
        sourceFetchedAt: options.sourceFetchedAt,
      }))
      .sort(compareContentRecords);
    rawByCollection.set(collection, raw);
    normalizedByCollection.set(collection, normalized);
    compiledByCollection.set(collection, compiled);
    sourceUrlsByCollection.set(collection, [
      ...(baseManifest.collections[collection]?.sourceUrls ?? []),
    ].sort());
  }

  await mkdir(join(packDirectory, "raw"), { recursive: true });
  await mkdir(join(packDirectory, "normalized"), { recursive: true });
  await mkdir(join(packDirectory, "compiled"), { recursive: true });

  const allCollections = [...S8_V2_COLLECTIONS, ...S8_V1_DERIVED_COLLECTIONS];
  const coverage = renderCoverage(
    options.packVersion,
    options.sourceFetchedAt,
    baseManifest.packHash,
    allCollections,
    rawByCollection,
    normalizedByCollection,
    compiledByCollection
  );
  const attribution = renderAttribution(options.packVersion, options.sourceFetchedAt, rawDocuments);
  const coverageArtifact = await writeArtifact(packDirectory, "COVERAGE.md", coverage, 0);
  const attributionArtifact = await writeArtifact(packDirectory, "ATTRIBUTION.md", attribution, 0);
  const collectionArtifacts = {} as Open5ePackManifest["collections"];

  for (const collection of allCollections) {
    const raw = requireCollection(rawByCollection, collection);
    const normalized = requireCollection(normalizedByCollection, collection);
    const compiled = requireCollection(compiledByCollection, collection);
    const rawArtifact = await writeArtifact(packDirectory, `raw/${collection}.ndjson`, toNdjson(raw), raw.length);
    const normalizedArtifact = await writeArtifact(
      packDirectory,
      `normalized/${collection}.ndjson`,
      toNdjson(normalized),
      normalized.length
    );
    const compiledArtifact = await writeArtifact(
      packDirectory,
      `compiled/${collection}.ndjson`,
      toNdjson(compiled),
      compiled.length
    );
    const baseCollection = baseManifest.collections[collection];
    const sourceApiVersion = S8_V1_DERIVED_COLLECTIONS.includes(collection) ? "v1" : "v2";
    collectionArtifacts[collection] = {
      sourceApiVersion,
      endpoint: sourceApiVersion === "v2"
        ? `${apiBaseUrl}/${collection}/`
        : baseCollection?.endpoint ?? `https://api.open5e.com/v1/${collection}/`,
      sourceUrls: requireCollection(sourceUrlsByCollection, collection),
      raw: rawArtifact,
      normalized: normalizedArtifact,
      compiled: compiledArtifact,
    };
  }

  const documentInventory = normalizeCorpusDocuments(
    rawDocuments,
    options.sourceFetchedAt,
    targetDocumentKey,
    taxonomyDocumentKey
  ).map((document) => ({
    key: document.sourceKey,
    packRole: document.packRole,
    gamesystem: document.gamesystem,
    publisher: document.publisher,
    licenseKeys: document.licenseKeys,
    permalink: document.permalink,
  }));
  const gamesystems = [...new Set(rawDocuments.map((document) => document.gamesystem.key))].sort();
  const hashInput = {
    schemaVersion: 2,
    packVersion: options.packVersion,
    targetDocumentKey,
    taxonomyDocumentKey,
    gamesystems,
    scope: {
      kind: "corpus" as const,
      basePackHash: baseManifest.packHash,
      defaultDocumentKey: targetDocument.key,
    },
    sourceApiVersion: "v2" as const,
    sourceFetchedAt: options.sourceFetchedAt,
    collections: collectionArtifacts,
    documents: documentInventory,
    reports: {
      attributionSha256: attributionArtifact.sha256,
      coverageSha256: coverageArtifact.sha256,
    },
  };
  const packHash = sha256(canonicalJson(hashInput));
  const manifest = open5ePackManifestSchema.parse({ ...hashInput, packHash });
  await writeFile(join(packDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { packDirectory, manifest };
}

function normalizeCorpusDocuments(
  records: RawDocument[],
  sourceFetchedAt: string,
  targetDocumentKey: string,
  taxonomyDocumentKey: string
): NormalizedDocument[] {
  return records.map<NormalizedDocument>((document) => ({
    kind: "document",
    fidelityTier: 0,
    key: document.key,
    contentKey: `open5e:document:${document.gamesystem.key}:${document.key}:${document.key}`,
    sourceKey: document.key,
    documentKey: document.key,
    gamesystem: document.gamesystem.key,
    publisher: document.publisher,
    licenseKeys: document.licenses.map((license) => license.key).sort(),
    permalink: document.permalink,
    sourceApiVersion: "v2",
    sourceFetchedAt,
    packRole: document.key === targetDocumentKey
      ? "target"
      : document.key === taxonomyDocumentKey
        ? "taxonomy"
        : "content",
    name: document.name,
    displayName: document.display_name,
    description: document.desc ?? "",
    documentType: document.type,
    author: document.author ?? "",
    publicationDate: document.publication_date ?? null,
    distanceUnit: document.distance_unit ?? null,
    weightUnit: document.weight_unit ?? null,
    licenses: [...document.licenses].sort((left, right) => left.key.localeCompare(right.key)),
  })).sort(compareContentRecords);
}

function normalizeCorpusReferences(
  collection: Open5eCollection,
  records: unknown[],
  documents: Map<string, RawDocument>,
  typedIdentities: Set<string>,
  sourceFetchedAt: string
): NormalizedCorpusReference[] {
  const references: NormalizedCorpusReference[] = [];
  for (const payload of records) {
    const sourceRecordKey = requireRawRecordKey(payload, collection);
    const candidates = provenanceCandidates(payload, documents);
    for (const candidate of candidates) {
      const identity = provenanceIdentity(sourceRecordKey, candidate.document.key, candidate.gamesystem);
      if (typedIdentities.has(identity)) continue;
      const name = recordName(payload, sourceRecordKey);
      references.push({
        kind: "corpus-reference",
        fidelityTier: 0,
        key: `${candidate.document.key}_${collection}_${sourceRecordKey}`,
        contentKey: `open5e:corpus-reference:${candidate.gamesystem}:${candidate.document.key}:${collection}:${sourceRecordKey}`,
        sourceKey: sourceRecordKey,
        documentKey: candidate.document.key,
        gamesystem: candidate.gamesystem,
        publisher: candidate.document.publisher,
        licenseKeys: candidate.document.licenses.map((license) => license.key).sort(),
        permalink: candidate.document.permalink,
        sourceApiVersion: "v2",
        sourceFetchedAt,
        collection,
        sourceRecordKey,
        sourcePayloadSha256: sha256(canonicalJson(payload)),
        name,
        description: candidate.description,
        deferredReason: "The full upstream record is pinned and readable, but this source/document variant has not reached a reviewed typed or executable Lantern contract.",
      });
    }
  }
  return references.sort(compareContentRecords);
}

function provenanceCandidates(
  payload: unknown,
  documents: Map<string, RawDocument>
): ProvenanceCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const descriptions = Array.isArray(record.descriptions) ? record.descriptions : [];
  const candidates: ProvenanceCandidate[] = [];
  for (const value of descriptions) {
    if (!value || typeof value !== "object") continue;
    const description = value as Record<string, unknown>;
    if (typeof description.document !== "string" || typeof description.gamesystem !== "string") continue;
    const document = documents.get(description.document);
    if (!document) throw new Error(`Open5e description references missing document ${description.document}.`);
    if (document.gamesystem.key !== description.gamesystem) {
      throw new Error(`Open5e description game system diverges for ${description.document}.`);
    }
    candidates.push({
      document,
      gamesystem: description.gamesystem,
      description: typeof description.desc === "string" ? description.desc : "",
    });
  }
  if (candidates.length > 0) return uniqueCandidates(candidates);

  const documentValue = record.document;
  const documentKey = typeof documentValue === "string"
    ? documentValue
    : documentValue && typeof documentValue === "object"
      ? (documentValue as Record<string, unknown>).key
      : null;
  if (typeof documentKey !== "string") return [];
  const document = documents.get(documentKey);
  if (!document) throw new Error(`Open5e record references missing document ${documentKey}.`);
  const description = typeof record.desc === "string"
    ? record.desc
    : typeof record.description === "string"
      ? record.description
      : "";
  return [{ document, gamesystem: document.gamesystem.key, description }];
}

function uniqueCandidates(candidates: ProvenanceCandidate[]): ProvenanceCandidate[] {
  const unique = new Map<string, ProvenanceCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.document.key}\u0000${candidate.gamesystem}`;
    const existing = unique.get(key);
    if (existing && existing.description !== candidate.description) {
      throw new Error(`Open5e has divergent duplicate description variants for ${candidate.document.key}.`);
    }
    unique.set(key, candidate);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.gamesystem}:${left.document.key}`.localeCompare(`${right.gamesystem}:${right.document.key}`)
  );
}

async function readBaseArtifact(
  basePackDirectory: string,
  manifest: Open5ePackManifest,
  collection: Open5eCollection,
  artifact: "raw" | "normalized" | "compiled"
): Promise<unknown[]> {
  const descriptor = manifest.collections[collection]?.[artifact];
  if (!descriptor) return [];
  return parseNdjson(await readFile(join(basePackDirectory, ...descriptor.path.split("/")), "utf8"));
}

function assertBaseRawSubset(collection: Open5eCollection, base: unknown[], corpus: unknown[]): void {
  const corpusByKey = new Map(corpus.map((record) => [requireRawRecordKey(record, collection), record]));
  for (const record of base) {
    const key = requireRawRecordKey(record, collection);
    const current = corpusByKey.get(key);
    if (!current || canonicalJson(current) !== canonicalJson(record)) {
      throw new Error(
        `The S7 typed source ${collection}/${key} changed before the S8 corpus import; rebuild and review S7 before carrying its contract forward.`
      );
    }
  }
}

function verifyCatalogConsistency(fetched: Map<Open5eCollection, FetchResult>, documents: RawDocument[]): void {
  const gamesystemKeys = new Set(requireFetch(fetched, "gamesystems").records.map((record) =>
    requireRawRecordKey(record, "gamesystems")
  ));
  const licenseKeys = new Set(requireFetch(fetched, "licenses").records.map((record) =>
    requireRawRecordKey(record, "licenses")
  ));
  const publisherKeys = new Set(requireFetch(fetched, "publishers").records.map((record) =>
    requireRawRecordKey(record, "publishers")
  ));
  for (const document of documents) {
    if (!gamesystemKeys.has(document.gamesystem.key)) {
      throw new Error(`Document ${document.key} references missing game system ${document.gamesystem.key}.`);
    }
    if (!publisherKeys.has(document.publisher.key)) {
      throw new Error(`Document ${document.key} references missing publisher ${document.publisher.key}.`);
    }
    for (const license of document.licenses) {
      if (!licenseKeys.has(license.key)) {
        throw new Error(`Document ${document.key} references missing license ${license.key}.`);
      }
    }
  }
}

async function fetchPaginated(
  initialUrl: string,
  options: {
    fetchImpl: typeof fetch;
    maxAttempts: number;
    sleep: (milliseconds: number) => Promise<void>;
  }
): Promise<FetchResult> {
  const records: unknown[] = [];
  const sourceUrls: string[] = [];
  const visited = new Set<string>();
  let nextUrl: string | null = initialUrl;
  let reportedCount: number | null = null;
  while (nextUrl !== null) {
    if (visited.has(nextUrl)) throw new Error(`Open5e pagination cycle detected at ${nextUrl}.`);
    visited.add(nextUrl);
    sourceUrls.push(nextUrl);
    const page = await fetchPageWithRetry(nextUrl, options);
    reportedCount ??= page.count;
    if (page.count !== reportedCount) throw new Error(`Open5e count changed during pagination at ${nextUrl}.`);
    records.push(...page.results);
    nextUrl = page.next;
  }
  return { records, sourceUrls, reportedCount: reportedCount ?? 0 };
}

async function fetchPageWithRetry(
  url: string,
  options: {
    fetchImpl: typeof fetch;
    maxAttempts: number;
    sleep: (milliseconds: number) => Promise<void>;
  }
): Promise<z.infer<typeof paginationSchema>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const response = await options.fetchImpl(url, { headers: { accept: "application/json" } });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === options.maxAttempts) {
          throw new Error(`Open5e request failed (${response.status}) for ${url}.`);
        }
        lastError = new Error(`Open5e retryable response (${response.status}) for ${url}.`);
      } else {
        return paginationSchema.parse(await response.json());
      }
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts || !isRetryableFetchError(error)) throw error;
    }
    await options.sleep(Math.min(4_000, 250 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Open5e request failed for ${url}.`);
}

function renderCoverage(
  packVersion: string,
  sourceFetchedAt: string,
  basePackHash: string,
  collections: readonly Open5eCollection[],
  rawByCollection: Map<Open5eCollection, unknown[]>,
  normalizedByCollection: Map<Open5eCollection, NormalizedContentRecord[]>,
  compiledByCollection: Map<Open5eCollection, CompiledContentRecord[]>
): string {
  const lines = [
    "# Open5e S8 Full-Corpus Coverage",
    "",
    `Pack: \`${packVersion}\`  `,
    `Pinned source timestamp: \`${sourceFetchedAt}\`  `,
    `Reviewed S7 base pack: \`${basePackHash}\``,
    "",
    "S8 captures the complete discovered API corpus. Reviewed S7 SRD records retain their typed or executable tier only when their current raw payload exactly matches the S7 source. Every other content-bearing source variant is pinned as a tier-0 corpus reference with its exact raw payload hash; no record is silently promoted.",
    "",
    "## Collection totals",
    "",
    "| Collection | Raw | Typed normalized | Tier-0 corpus references | Compiled programs |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const collection of collections) {
    const normalized = requireCollection(normalizedByCollection, collection);
    const references = normalized.filter((record) => record.kind === "corpus-reference").length;
    lines.push(
      `| ${collection} | ${requireCollection(rawByCollection, collection).length} | ${normalized.length - references} | ${references} | ${requireCollection(compiledByCollection, collection).length} |`
    );
  }

  const groups = new Map<string, { collection: string; document: string; gamesystem: string; tier0: number; tier1: number; tier2: number }>();
  for (const collection of collections) {
    const compiledSources = new Set(requireCollection(compiledByCollection, collection).map((record) => record.sourceContentKey));
    for (const record of requireCollection(normalizedByCollection, collection)) {
      const key = `${collection}\u0000${record.documentKey}\u0000${record.gamesystem}`;
      const group = groups.get(key) ?? {
        collection,
        document: record.documentKey,
        gamesystem: record.gamesystem,
        tier0: 0,
        tier1: 0,
        tier2: 0,
      };
      const tier = compiledSources.has(record.contentKey) ? 2 : record.fidelityTier;
      if (tier === 0) group.tier0 += 1;
      else if (tier === 1) group.tier1 += 1;
      else group.tier2 += 1;
      groups.set(key, group);
    }
  }
  lines.push(
    "",
    "## Effective fidelity by source partition",
    "",
    "| Collection | Document | Game system | Tier 0 | Tier 1 | Tier 2 |",
    "| --- | --- | --- | ---: | ---: | ---: |"
  );
  for (const group of [...groups.values()].sort((left, right) =>
    `${left.collection}:${left.gamesystem}:${left.document}`.localeCompare(`${right.collection}:${right.gamesystem}:${right.document}`)
  )) {
    lines.push(`| ${group.collection} | ${group.document} | ${group.gamesystem} | ${group.tier0} | ${group.tier1} | ${group.tier2} |`);
  }

  lines.push(
    "",
    "## Deferred source variants",
    "",
    "| Content key | Collection | Status | Reason |",
    "| --- | --- | --- | --- |"
  );
  for (const collection of collections) {
    for (const record of requireCollection(normalizedByCollection, collection)) {
      if (record.kind !== "corpus-reference") continue;
      lines.push(
        `| \`${escapeMarkdown(record.contentKey)}\` | ${collection} | deferred | ${escapeMarkdown(record.deferredReason)} |`
      );
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderAttribution(packVersion: string, sourceFetchedAt: string, documents: RawDocument[]): string {
  const lines = [
    "# Open5e S8 Attribution",
    "",
    `Pack: \`${packVersion}\`  `,
    `Pinned source timestamp: \`${sourceFetchedAt}\``,
    "",
    "This file is generated from the pinned Open5e document inventory. A hosted campaign must surface the entries for every enabled source document.",
    "",
  ];
  for (const document of [...documents].sort((left, right) => left.key.localeCompare(right.key))) {
    lines.push(
      `## ${document.display_name} (\`${document.key}\`)`,
      "",
      `- Publisher: ${document.publisher.name} (\`${document.publisher.key}\`)`,
      `- Author: ${document.author?.trim() || "Not supplied by Open5e"}`,
      `- Game system: ${document.gamesystem.name} (\`${document.gamesystem.key}\`)`,
      `- Licenses: ${document.licenses.map((license) => `${license.name} (\`${license.key}\`)`).join(", ")}`,
      `- Source permalink: ${document.permalink}`,
      `- Open5e document record: https://api.open5e.com/v2/documents/${encodeURIComponent(document.key)}/`,
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function validateAndSortRaw(records: unknown[], collection: Open5eCollection): unknown[] {
  const keyed = records.map((record) => ({ key: requireRawRecordKey(record, collection), record }));
  const keys = keyed.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) throw new Error(`Duplicate Open5e ${collection} source key.`);
  return keyed.sort((left, right) => left.key.localeCompare(right.key)).map((entry) => entry.record);
}

function requireRawRecordKey(record: unknown, collection: Open5eCollection): string {
  if (!record || typeof record !== "object") throw new Error(`Open5e ${collection} returned a non-object record.`);
  const value = record as Record<string, unknown>;
  const key = typeof value.key === "string" ? value.key : typeof value.slug === "string" ? value.slug : null;
  if (!key) throw new Error(`Open5e ${collection} record has no key or slug.`);
  return key;
}

function recordName(record: unknown, fallback: string): string {
  if (!record || typeof record !== "object") return fallback;
  const value = record as Record<string, unknown>;
  if (typeof value.name === "string" && value.name.trim()) return value.name;
  if (typeof value.display_name === "string" && value.display_name.trim()) return value.display_name;
  return fallback;
}

function assertUniqueContentRecords(collection: Open5eCollection, records: NormalizedContentRecord[]): void {
  const keys = records.map((record) => record.key);
  const contentKeys = records.map((record) => record.contentKey);
  if (new Set(keys).size !== keys.length) throw new Error(`Duplicate normalized ${collection} key.`);
  if (new Set(contentKeys).size !== contentKeys.length) throw new Error(`Duplicate normalized ${collection} content key.`);
}

function compareContentRecords(left: { key: string; contentKey: string }, right: { key: string; contentKey: string }): number {
  return left.key.localeCompare(right.key) || left.contentKey.localeCompare(right.contentKey);
}

function provenanceIdentity(sourceKey: string, documentKey: string, gamesystem: string): string {
  return `${sourceKey}\u0000${documentKey}\u0000${gamesystem}`;
}

function requireFetch(map: Map<Open5eCollection, FetchResult>, collection: Open5eCollection): FetchResult {
  const value = map.get(collection);
  if (!value) throw new Error(`Open5e S8 fetch is missing ${collection}.`);
  return value;
}

function requireCollection<T>(map: Map<Open5eCollection, T>, collection: Open5eCollection): T {
  const value = map.get(collection);
  if (!value) throw new Error(`Open5e S8 collection is missing ${collection}.`);
  return value;
}

function requireDocument(documents: Map<string, RawDocument>, key: string): RawDocument {
  const document = documents.get(key);
  if (!document) throw new Error(`Open5e document is missing: ${key}.`);
  return document;
}

function toNdjson(records: unknown[]): string {
  return records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

async function writeArtifact(packDirectory: string, relativePath: string, text: string, recordCount: number) {
  const path = join(packDirectory, ...relativePath.split("/"));
  await writeFile(path, text, "utf8");
  return { path: relativePath, sha256: sha256(text), recordCount };
}

function parseNdjson(text: string): unknown[] {
  return text ? text.trimEnd().split("\n").map((line) => JSON.parse(line) as unknown) : [];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertSafePackVersion(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new Error(`Unsafe Open5e pack version: ${value}.`);
}

function assertIsoTimestamp(value: string): void {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error("Open5e sourceFetchedAt must be a canonical ISO timestamp.");
  }
}

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function isRetryableFetchError(error: unknown): boolean {
  return !(error instanceof Error) || !error.message.startsWith("Open5e request failed (");
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index] as T);
    }
  }));
  return results;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`").replace(/\r?\n/g, " ");
}
