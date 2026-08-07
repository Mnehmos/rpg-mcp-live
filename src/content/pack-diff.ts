import { canonicalJson, sha256 } from "./hash.js";
import type { Open5eContentPack } from "./pack.js";
import type { CompiledContentRecord, NormalizedContentRecord, Open5eCollection } from "./schema.js";

export type ContentCompatibility = "identical" | "provenance-only" | "changed" | "missing-source" | "missing-target";

export interface Open5ePackRecordDiff {
  identical: string[];
  provenanceOnly: string[];
  changed: string[];
  added: string[];
  removed: string[];
}

export interface Open5eCollectionDelta {
  collection: Open5eCollection;
  rawBefore: number;
  rawAfter: number;
  normalizedBefore: number;
  normalizedAfter: number;
  compiledBefore: number;
  compiledAfter: number;
}

export interface Open5ePackDiff {
  from: { packVersion: string; packHash: string; rulesVersion: string };
  to: { packVersion: string; packHash: string; rulesVersion: string };
  normalized: Open5ePackRecordDiff;
  compiled: Open5ePackRecordDiff;
  collections: Open5eCollectionDelta[];
  reviewSha256: string;
}

export function comparePackContentKey(
  from: Open5eContentPack,
  to: Open5eContentPack,
  contentKey: string
): ContentCompatibility {
  const fromNormalized = from.getNormalized(contentKey);
  const toNormalized = to.getNormalized(contentKey);
  const fromCompiled = from.getCompiled(contentKey);
  const toCompiled = to.getCompiled(contentKey);
  if (!fromNormalized && !fromCompiled) return "missing-source";
  if ((fromNormalized && !toNormalized) || (fromCompiled && !toCompiled)) return "missing-target";
  if (fromNormalized && toNormalized) {
    const normalizedStatus = compareRecord(fromNormalized, toNormalized);
    const programStatus = compareRecordArrays(
      from.getCompiledForSource(contentKey),
      to.getCompiledForSource(contentKey)
    );
    return mergeCompatibility(normalizedStatus, programStatus);
  }
  if (fromCompiled && toCompiled) return compareRecord(fromCompiled, toCompiled);
  return "changed";
}

export function diffOpen5ePacks(from: Open5eContentPack, to: Open5eContentPack): Open5ePackDiff {
  const normalized = diffRecordMaps(
    new Map(from.records().map((record) => [record.contentKey, record])),
    new Map(to.records().map((record) => [record.contentKey, record]))
  );
  const compiled = diffRecordMaps(
    new Map(from.compiledRecords().map((record) => [record.contentKey, record])),
    new Map(to.compiledRecords().map((record) => [record.contentKey, record]))
  );
  const collections = [...new Set([...from.collectionNames(), ...to.collectionNames()])]
    .sort()
    .map((collection) => {
      const before = from.manifest.collections[collection];
      const after = to.manifest.collections[collection];
      return {
        collection,
        rawBefore: before?.raw.recordCount ?? 0,
        rawAfter: after?.raw.recordCount ?? 0,
        normalizedBefore: before?.normalized.recordCount ?? 0,
        normalizedAfter: after?.normalized.recordCount ?? 0,
        compiledBefore: before?.compiled.recordCount ?? 0,
        compiledAfter: after?.compiled.recordCount ?? 0,
      };
    });
  const base = {
    from: descriptorIdentity(from),
    to: descriptorIdentity(to),
    normalized,
    compiled,
    collections,
  };
  return { ...base, reviewSha256: sha256(canonicalJson(base)) };
}

export function renderOpen5ePackDiffMarkdown(diff: Open5ePackDiff): string {
  const lines = [
    "# Open5e Pack Upgrade Review",
    "",
    `Review SHA-256: \`${diff.reviewSha256}\``,
    "",
    `From: \`${diff.from.packVersion}\` / \`${diff.from.packHash}\``,
    "",
    `To: \`${diff.to.packVersion}\` / \`${diff.to.packHash}\``,
    "",
    "## Record compatibility",
    "",
    "| Layer | Identical | Provenance-only | Changed | Added | Removed |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    recordSummary("Normalized", diff.normalized),
    recordSummary("Compiled", diff.compiled),
    "",
    "`provenance-only` means canonical bytes differ only in import timestamps. It is mechanically compatible, but remains visible in this review.",
    "",
    "## Collection coverage delta",
    "",
    "| Collection | Raw | Normalized | Compiled |",
    "| --- | ---: | ---: | ---: |",
    ...diff.collections.map((entry) => `| ${entry.collection} | ${delta(entry.rawBefore, entry.rawAfter)} | ${delta(entry.normalizedBefore, entry.normalizedAfter)} | ${delta(entry.compiledBefore, entry.compiledAfter)} |`),
    "",
    ...renderKeySection("Changed normalized records", diff.normalized.changed),
    ...renderKeySection("Removed normalized records", diff.normalized.removed),
    ...renderKeySection("Changed compiled records", diff.compiled.changed),
    ...renderKeySection("Removed compiled records", diff.compiled.removed),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

function descriptorIdentity(pack: Open5eContentPack): Open5ePackDiff["from"] {
  return {
    packVersion: pack.descriptor.packVersion,
    packHash: pack.descriptor.packHash,
    rulesVersion: pack.descriptor.rulesVersion,
  };
}

function diffRecordMaps<T extends NormalizedContentRecord | CompiledContentRecord>(
  from: ReadonlyMap<string, T>,
  to: ReadonlyMap<string, T>
): Open5ePackRecordDiff {
  const result: Open5ePackRecordDiff = { identical: [], provenanceOnly: [], changed: [], added: [], removed: [] };
  const keys = [...new Set([...from.keys(), ...to.keys()])].sort();
  for (const key of keys) {
    const before = from.get(key);
    const after = to.get(key);
    if (!before) result.added.push(key);
    else if (!after) result.removed.push(key);
    else {
      const compatibility = compareRecord(before, after);
      if (compatibility === "identical") result.identical.push(key);
      else if (compatibility === "provenance-only") result.provenanceOnly.push(key);
      else result.changed.push(key);
    }
  }
  return result;
}

function compareRecord(
  left: NormalizedContentRecord | CompiledContentRecord,
  right: NormalizedContentRecord | CompiledContentRecord
): Exclude<ContentCompatibility, "missing-source" | "missing-target"> {
  const leftExact = canonicalJson(left);
  const rightExact = canonicalJson(right);
  if (leftExact === rightExact) return "identical";
  return canonicalJson(withoutFetchTimestamp(left)) === canonicalJson(withoutFetchTimestamp(right))
    ? "provenance-only"
    : "changed";
}

function compareRecordArrays(
  left: readonly CompiledContentRecord[],
  right: readonly CompiledContentRecord[]
): Exclude<ContentCompatibility, "missing-source" | "missing-target"> {
  const leftSorted = [...left].sort((a, b) => a.contentKey.localeCompare(b.contentKey));
  const rightSorted = [...right].sort((a, b) => a.contentKey.localeCompare(b.contentKey));
  if (leftSorted.length !== rightSorted.length) return "changed";
  return leftSorted.reduce<Exclude<ContentCompatibility, "missing-source" | "missing-target">>(
    (status, record, index) => mergeCompatibility(status, compareRecord(record, rightSorted[index] as CompiledContentRecord)),
    "identical"
  );
}

function mergeCompatibility(
  left: Exclude<ContentCompatibility, "missing-source" | "missing-target">,
  right: Exclude<ContentCompatibility, "missing-source" | "missing-target">
): Exclude<ContentCompatibility, "missing-source" | "missing-target"> {
  if (left === "changed" || right === "changed") return "changed";
  if (left === "provenance-only" || right === "provenance-only") return "provenance-only";
  return "identical";
}

function withoutFetchTimestamp(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFetchTimestamp);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "sourceFetchedAt")
      .map(([key, child]) => [key, withoutFetchTimestamp(child)])
  );
}

function recordSummary(label: string, diff: Open5ePackRecordDiff): string {
  return `| ${label} | ${diff.identical.length} | ${diff.provenanceOnly.length} | ${diff.changed.length} | ${diff.added.length} | ${diff.removed.length} |`;
}

function delta(before: number, after: number): string {
  const change = after - before;
  return `${before} -> ${after} (${change >= 0 ? "+" : ""}${change})`;
}

function renderKeySection(title: string, keys: string[]): string[] {
  if (!keys.length) return [`## ${title}`, "", "None.", ""];
  return [`## ${title}`, "", ...keys.map((key) => `- \`${key}\``), ""];
}
