import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./hash.js";
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

const S0_COLLECTIONS = ["conditions", "damagetypes", "sizes", "documents"] as const;
const S1_COLLECTIONS = [...S0_COLLECTIONS, "skills", "rules"] as const;
const S2_COLLECTIONS = [
  ...S1_COLLECTIONS,
  "items",
  "weapons",
  "armor",
  "magicitems",
  "weaponproperties",
  "itemrarities",
] as const;
const S3_COLLECTIONS = [
  ...S2_COLLECTIONS,
  "creaturetypes",
  "environments",
  "creaturesets",
  "creatures",
] as const;
const S4_COLLECTIONS = [
  ...S3_COLLECTIONS,
  "spellschools",
  "spells",
  "spelllists",
  "spellprogressions",
] as const;
const S5_COLLECTIONS = [
  ...S4_COLLECTIONS,
  "abilities",
  "languages",
  "alignments",
  "species",
  "classes",
  "backgrounds",
  "feats",
] as const;
const S6_COLLECTIONS = [
  ...S5_COLLECTIONS,
  "rulesets",
  "sections",
  "planes",
] as const;
const S7_COLLECTIONS = [...S6_COLLECTIONS] as const;
const S8_COLLECTIONS = [
  ...S7_COLLECTIONS,
  "itemsets",
  "itemcategories",
  "licenses",
  "publishers",
  "gamesystems",
  "images",
  "services",
] as const;

const EXPECTED_KINDS = {
  conditions: "condition",
  damagetypes: "damage-type",
  sizes: "size",
  documents: "document",
  skills: "skill",
  rules: "rule",
  rulesets: "ruleset",
  sections: "section",
  planes: "plane",
  items: "item",
  itemsets: "corpus-reference",
  itemcategories: "corpus-reference",
  weapons: "weapon",
  armor: "armor",
  magicitems: "magic-item",
  weaponproperties: "weapon-property",
  itemrarities: "item-rarity",
  creaturetypes: "creature-type",
  environments: "environment",
  creaturesets: "creature-set",
  creatures: "creature",
  spellschools: "spell-school",
  spells: "spell",
  spelllists: "spell-list",
  spellprogressions: "spell-progression",
  abilities: "ability",
  languages: "language",
  alignments: "alignment",
  species: "species",
  classes: "class",
  backgrounds: "background",
  feats: "feat",
  licenses: "corpus-reference",
  publishers: "corpus-reference",
  gamesystems: "corpus-reference",
  images: "corpus-reference",
  services: "corpus-reference",
} as const satisfies Record<Open5eCollection, NormalizedContentRecord["kind"]>;

export interface VerifiedOpen5eCollection {
  raw: number;
  normalized: number;
  compiled: number;
}

export interface Open5ePackVerificationResult {
  packDirectory: string;
  packVersion: string;
  packHash: string;
  rulesVersion: string;
  collections: Partial<Record<Open5eCollection, VerifiedOpen5eCollection>>;
}

interface VerifyOpen5ePackOptions {
  expectedCollections?: readonly Open5eCollection[];
  requireEmptyCompiled?: boolean;
}

export async function verifyOpen5ePack(
  packDirectory: string,
  options: VerifyOpen5ePackOptions = {}
): Promise<Open5ePackVerificationResult> {
  const absolutePackDirectory = resolve(packDirectory);
  const manifestPath = resolveArtifactPath(absolutePackDirectory, "manifest.json");
  const manifest = open5ePackManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown
  );

  verifyPackHash(manifest);
  const collectionNames = collectionNamesFromManifest(manifest);
  if (options.expectedCollections) {
    const expected = orderCollections(options.expectedCollections);
    if (canonicalJson(collectionNames) !== canonicalJson(expected)) {
      throw new Error(
        `Open5e pack collection mismatch: expected ${expected.join(", ")}, received ${collectionNames.join(", ")}.`
      );
    }
  }

  const collections: Partial<Record<Open5eCollection, VerifiedOpen5eCollection>> = {};
  const normalizedByCollection: Partial<Record<Open5eCollection, NormalizedContentRecord[]>> = {};
  const compiledByCollection: Partial<Record<Open5eCollection, CompiledContentRecord[]>> = {};

  for (const collection of collectionNames) {
    const collectionManifest = manifest.collections[collection];
    if (!collectionManifest) {
      throw new Error(`Open5e manifest collection is missing after validation: ${collection}.`);
    }
    assertArtifactPath(collectionManifest.raw.path, `raw/${collection}.ndjson`);
    assertArtifactPath(collectionManifest.normalized.path, `normalized/${collection}.ndjson`);
    assertArtifactPath(collectionManifest.compiled.path, `compiled/${collection}.ndjson`);

    const rawText = await verifyArtifact(
      absolutePackDirectory,
      collectionManifest.raw.path,
      collectionManifest.raw.sha256,
      collectionManifest.raw.recordCount
    );
    const rawRecords = parseNdjson(rawText, collectionManifest.raw.path);

    const normalizedText = await verifyArtifact(
      absolutePackDirectory,
      collectionManifest.normalized.path,
      collectionManifest.normalized.sha256,
      collectionManifest.normalized.recordCount
    );
    const normalizedRecords = parseNdjson(normalizedText, collectionManifest.normalized.path)
      .map((record) => normalizedContentRecordSchema.parse(record));
    verifyNormalizedRecords(collection, normalizedRecords, manifest, rawRecords);
    normalizedByCollection[collection] = normalizedRecords;

    const compiledText = await verifyArtifact(
      absolutePackDirectory,
      collectionManifest.compiled.path,
      collectionManifest.compiled.sha256,
      collectionManifest.compiled.recordCount
    );
    const compiledRecords = parseNdjson(compiledText, collectionManifest.compiled.path)
      .map((record) => compiledContentRecordSchema.parse(record));
    verifyCompiledRecords(collection, compiledRecords, normalizedRecords, manifest);
    compiledByCollection[collection] = compiledRecords;
    if (options.requireEmptyCompiled && compiledRecords.length > 0) {
      throw new Error(`This Open5e pack slice requires an empty compiled artifact: ${collection}.`);
    }

    collections[collection] = {
      raw: collectionManifest.raw.recordCount,
      normalized: collectionManifest.normalized.recordCount,
      compiled: collectionManifest.compiled.recordCount,
    };
  }

  const documentRecords = normalizedByCollection.documents;
  if (!documentRecords) {
    throw new Error("An Open5e pack must include its normalized document inventory.");
  }
  verifyDocumentInventory(manifest, documentRecords);
  verifyNormalizedReferences(normalizedByCollection);
  verifyCompiledReferences(normalizedByCollection, compiledByCollection);
  await verifyReport(absolutePackDirectory, "ATTRIBUTION.md", manifest.reports.attributionSha256);
  await verifyReport(absolutePackDirectory, "COVERAGE.md", manifest.reports.coverageSha256);

  return {
    packDirectory: absolutePackDirectory,
    packVersion: manifest.packVersion,
    packHash: manifest.packHash,
    rulesVersion: `open5e-pack@${manifest.packHash}`,
    collections,
  };
}

export async function verifyOpen5eS0Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  return verifyOpen5ePack(packDirectory, {
    expectedCollections: S0_COLLECTIONS,
    requireEmptyCompiled: true,
  });
}

export async function verifyOpen5eS1Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S1_COLLECTIONS });
  if (result.collections.rules?.compiled !== 1) {
    throw new Error("Open5e S1 requires exactly one compiled currency rule.");
  }
  for (const collection of S1_COLLECTIONS.filter((name) => name !== "rules")) {
    if (result.collections[collection]?.compiled !== 0) {
      throw new Error(`Open5e S1 does not compile ${collection}.`);
    }
  }
  return result;
}

export async function verifyOpen5eS2Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S2_COLLECTIONS });
  const expectedCompiledCounts: Partial<Record<Open5eCollection, number>> = {
    rules: 1,
    items: 1,
  };
  for (const collection of S2_COLLECTIONS) {
    const expected = expectedCompiledCounts[collection] ?? 0;
    const actual = result.collections[collection]?.compiled;
    if (actual !== expected) {
      throw new Error(
        `Open5e S2 requires ${expected} compiled ${collection} record${expected === 1 ? "" : "s"}; received ${actual ?? "none"}.`
      );
    }
  }
  return result;
}

export async function verifyOpen5eS3Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S3_COLLECTIONS });
  for (const collection of S3_COLLECTIONS) {
    const actual = result.collections[collection]?.compiled;
    if (collection === "rules" || collection === "items") {
      if (actual !== 1) throw new Error(`Open5e S3 requires exactly one compiled ${collection} record.`);
    } else if (collection === "creatures") {
      if (!actual || actual < 1) throw new Error("Open5e S3 requires at least one compiled exact creature attack.");
    } else if (actual !== 0) {
      throw new Error(`Open5e S3 does not compile ${collection}.`);
    }
  }
  return result;
}

export async function verifyOpen5eS4Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S4_COLLECTIONS });
  for (const collection of S4_COLLECTIONS) {
    const actual = result.collections[collection]?.compiled;
    if (collection === "rules" || collection === "items") {
      if (actual !== 1) throw new Error(`Open5e S4 requires exactly one compiled ${collection} record.`);
    } else if (collection === "creatures" || collection === "spells") {
      if (!actual || actual < 1) throw new Error(`Open5e S4 requires at least one compiled ${collection} program.`);
    } else if (actual !== 0) {
      throw new Error(`Open5e S4 does not compile ${collection}.`);
    }
  }
  return result;
}

export async function verifyOpen5eS5Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S5_COLLECTIONS });
  for (const collection of S5_COLLECTIONS) {
    const actual = result.collections[collection]?.compiled;
    if (collection === "rules" || collection === "items") {
      if (actual !== 1) throw new Error(`Open5e S5 requires exactly one compiled ${collection} record.`);
    } else if (
      collection === "creatures"
      || collection === "spells"
      || collection === "species"
      || collection === "classes"
      || collection === "backgrounds"
    ) {
      if (!actual || actual < 1) throw new Error(`Open5e S5 requires at least one compiled ${collection} program.`);
    } else if (actual !== 0) {
      throw new Error(`Open5e S5 does not compile ${collection}.`);
    }
  }
  return result;
}

export async function verifyOpen5eS6Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S6_COLLECTIONS });
  for (const collection of S6_COLLECTIONS) {
    const actual = result.collections[collection]?.compiled;
    if (collection === "rules" || collection === "items") {
      if (actual !== 1) throw new Error(`Open5e S6 requires exactly one compiled ${collection} record.`);
    } else if (
      collection === "creatures"
      || collection === "spells"
      || collection === "species"
      || collection === "classes"
      || collection === "backgrounds"
    ) {
      if (!actual || actual < 1) throw new Error(`Open5e S6 requires at least one compiled ${collection} program.`);
    } else if (actual !== 0) {
      throw new Error(`Open5e S6 does not compile ${collection}.`);
    }
  }
  const rules = result.collections.rules?.normalized ?? 0;
  const rulesets = result.collections.rulesets?.normalized ?? 0;
  const sections = result.collections.sections?.normalized ?? 0;
  const planes = result.collections.planes?.normalized ?? 0;
  if (rules < 1 || rulesets < 1 || sections < 1 || planes < 1) {
    throw new Error("Open5e S6 requires non-empty v2 rules/rulesets and v1 sections/planes.");
  }
  return result;
}

export async function verifyOpen5eS7Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S7_COLLECTIONS });
  for (const collection of S7_COLLECTIONS) {
    const actual = result.collections[collection]?.compiled;
    if (collection === "rules" || collection === "items") {
      if (actual !== 1) throw new Error(`Open5e S7 requires exactly one compiled ${collection} record.`);
    } else if (
      collection === "creatures"
      || collection === "spells"
      || collection === "species"
      || collection === "classes"
      || collection === "backgrounds"
    ) {
      if (!actual || actual < 1) throw new Error(`Open5e S7 requires at least one compiled ${collection} program.`);
    } else if (actual !== 0) {
      throw new Error(`Open5e S7 does not compile ${collection}.`);
    }
  }
  return result;
}

export async function verifyOpen5eS8Pack(packDirectory: string): Promise<Open5ePackVerificationResult> {
  const result = await verifyOpen5ePack(packDirectory, { expectedCollections: S8_COLLECTIONS });
  const manifest = open5ePackManifestSchema.parse(
    JSON.parse(await readFile(resolve(packDirectory, "manifest.json"), "utf8")) as unknown
  );
  if (manifest.schemaVersion !== 2 || manifest.scope?.kind !== "corpus") {
    throw new Error("Open5e S8 requires a schema-v2 corpus manifest.");
  }
  const inventoryGamesystems = [...new Set(manifest.documents.map((document) => document.gamesystem))].sort();
  if (canonicalJson(inventoryGamesystems) !== canonicalJson([...manifest.gamesystems].sort())) {
    throw new Error("Open5e S8 game-system inventory diverges from its documents.");
  }
  for (const collection of ["licenses", "publishers", "gamesystems"] as const) {
    const counts = result.collections[collection];
    if (!counts || counts.raw < 1 || counts.normalized !== 0 || counts.compiled !== 0) {
      throw new Error(`Open5e S8 ${collection} must be pinned as a raw catalog artifact only.`);
    }
  }
  if (manifest.documents.some((document) => !manifest.gamesystems.includes(document.gamesystem))) {
    throw new Error("Open5e S8 document inventory contains an unregistered game system.");
  }
  return result;
}

function collectionNamesFromManifest(manifest: Open5ePackManifest): Open5eCollection[] {
  return orderCollections(Object.keys(manifest.collections).map((collection) => open5eCollectionSchema.parse(collection)));
}

function orderCollections(collections: readonly Open5eCollection[]): Open5eCollection[] {
  const requested = new Set(collections);
  return OPEN5E_COLLECTIONS.filter((collection) => requested.has(collection));
}

function verifyPackHash(manifest: Open5ePackManifest): void {
  const { packHash, ...hashInput } = manifest;
  const actual = sha256(canonicalJson(hashInput));
  if (actual !== packHash) {
    throw new Error(`Open5e pack hash mismatch: expected ${packHash}, received ${actual}.`);
  }
}

async function verifyArtifact(
  packDirectory: string,
  relativePath: string,
  expectedHash: string,
  expectedRecordCount: number
): Promise<string> {
  const absolutePath = resolveArtifactPath(packDirectory, relativePath);
  const content = await readFile(absolutePath);
  const actualHash = sha256(content);
  if (actualHash !== expectedHash) {
    throw new Error(`Open5e artifact hash mismatch for ${relativePath}: expected ${expectedHash}, received ${actualHash}.`);
  }
  const text = content.toString("utf8");
  const actualRecordCount = countNdjsonRecords(text, relativePath);
  if (actualRecordCount !== expectedRecordCount) {
    throw new Error(
      `Open5e artifact count mismatch for ${relativePath}: expected ${expectedRecordCount}, received ${actualRecordCount}.`
    );
  }
  return text;
}

async function verifyReport(packDirectory: string, relativePath: string, expectedHash: string): Promise<void> {
  const content = await readFile(resolveArtifactPath(packDirectory, relativePath));
  const actualHash = sha256(content);
  if (actualHash !== expectedHash) {
    throw new Error(`Open5e report hash mismatch for ${relativePath}: expected ${expectedHash}, received ${actualHash}.`);
  }
}

function parseNdjson(text: string, relativePath: string): unknown[] {
  const lineCount = countNdjsonRecords(text, relativePath);
  if (lineCount === 0) {
    return [];
  }
  return text.slice(0, -1).split("\n").map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid NDJSON in ${relativePath} at line ${index + 1}: ${reason}`);
    }
  });
}

function countNdjsonRecords(text: string, relativePath: string): number {
  if (text === "") {
    return 0;
  }
  if (!text.endsWith("\n")) {
    throw new Error(`Open5e NDJSON artifact must end with a newline: ${relativePath}`);
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) {
    throw new Error(`Open5e NDJSON artifact contains an empty record: ${relativePath}`);
  }
  return lines.length;
}

function verifyNormalizedRecords(
  collection: Open5eCollection,
  records: NormalizedContentRecord[],
  manifest: Open5ePackManifest,
  rawRecords: unknown[]
): void {
  verifyRecordOrdering(collection, records);
  const expectedKind = EXPECTED_KINDS[collection];
  const corpusScoped = manifest.scope?.kind === "corpus";
  const inventoryDocuments = new Set(manifest.documents.map((document) => document.key));
  const rawBySourceKey = new Map(rawRecords.flatMap((payload) => {
    if (!payload || typeof payload !== "object") return [];
    const candidate = payload as Record<string, unknown>;
    const sourceKey = typeof candidate.key === "string"
      ? candidate.key
      : typeof candidate.slug === "string"
        ? candidate.slug
        : null;
    return sourceKey ? [[sourceKey, payload] as const] : [];
  }));
  for (const record of records) {
    const isCorpusReference = corpusScoped
      && record.kind === "corpus-reference"
      && record.collection === collection;
    if (record.kind !== expectedKind && !isCorpusReference) {
      throw new Error(`Unexpected normalized kind in ${collection}: ${record.kind}.`);
    }
    const expectedApiVersion = manifest.collections[collection]?.sourceApiVersion ?? manifest.sourceApiVersion;
    if (record.sourceApiVersion !== expectedApiVersion || record.sourceFetchedAt !== manifest.sourceFetchedAt) {
      throw new Error(`Normalized provenance does not match the manifest: ${record.key}.`);
    }
    if (record.kind === "corpus-reference") {
      const payload = rawBySourceKey.get(record.sourceRecordKey);
      if (!payload || sha256(canonicalJson(payload)) !== record.sourcePayloadSha256) {
        throw new Error(`Corpus reference does not match its raw source payload: ${record.contentKey}.`);
      }
    }
    if (corpusScoped) {
      if (!inventoryDocuments.has(record.documentKey) || !manifest.gamesystems.includes(record.gamesystem)) {
        throw new Error(`Normalized corpus record has unregistered provenance: ${record.key}.`);
      }
      continue;
    }
    if (
      collection === "conditions"
      || collection === "damagetypes"
      || collection === "skills"
      || collection === "rules"
      || collection === "rulesets"
      || collection === "sections"
      || collection === "planes"
      || collection === "items"
      || collection === "weapons"
      || collection === "armor"
      || collection === "magicitems"
      || collection === "weaponproperties"
      || collection === "itemrarities"
      || collection === "creaturetypes"
      || collection === "creaturesets"
      || collection === "creatures"
      || collection === "spells"
      || collection === "spelllists"
      || collection === "spellprogressions"
      || collection === "abilities"
      || collection === "alignments"
      || collection === "species"
      || collection === "classes"
      || collection === "backgrounds"
      || collection === "feats"
    ) {
      if (record.documentKey !== manifest.targetDocumentKey || !manifest.gamesystems.includes(record.gamesystem)) {
        throw new Error(`Normalized target record escapes the pinned SRD document: ${record.key}.`);
      }
    } else if (
      (collection === "sizes" || collection === "spellschools" || collection === "languages")
      && record.documentKey !== manifest.taxonomyDocumentKey
    ) {
      throw new Error(`Normalized taxonomy record escapes the pinned taxonomy document: ${record.key}.`);
    } else if (
      collection === "environments"
      && record.documentKey !== manifest.taxonomyDocumentKey
      && record.documentKey !== manifest.targetDocumentKey
    ) {
      throw new Error(`Normalized environment escapes the core/SRD partition: ${record.key}.`);
    }
  }
}

function verifyCompiledRecords(
  collection: Open5eCollection,
  records: CompiledContentRecord[],
  normalizedRecords: NormalizedContentRecord[],
  manifest: Open5ePackManifest
): void {
  verifyRecordOrdering(collection, records);
  const normalizedKeys = new Set(normalizedRecords.map((record) => record.contentKey));
  const corpusScoped = manifest.scope?.kind === "corpus";
  const inventoryDocuments = new Set(manifest.documents.map((document) => document.key));
  for (const record of records) {
    const expectedKinds: CompiledContentRecord["kind"][] = collection === "rules"
      ? ["currency-table"]
      : collection === "items"
        ? ["equipment-effect"]
        : collection === "creatures"
          ? ["creature-attack", "effect-program"]
          : collection === "spells"
            ? ["spell-effect", "effect-program"]
            : collection === "species"
              ? ["species-profile"]
              : collection === "classes"
                ? ["class-profile"]
                : collection === "backgrounds"
                  ? ["background-profile"]
            : [];
    if (!expectedKinds.includes(record.kind)) {
      throw new Error(`Unexpected compiled kind in ${collection}: ${record.kind}.`);
    }
    const sourceIdentityIsValid = record.kind === "creature-attack"
      || record.kind === "spell-effect"
      || record.kind === "species-profile"
      || record.kind === "class-profile"
      || record.kind === "background-profile"
      || record.kind === "effect-program"
      ? record.contentKey !== record.sourceContentKey
      : record.contentKey === record.sourceContentKey;
    if (!sourceIdentityIsValid || !normalizedKeys.has(record.sourceContentKey)) {
      throw new Error(`Compiled Open5e record does not identify a normalized source record: ${record.key}.`);
    }
    if (
      record.sourceApiVersion !== (manifest.collections[collection]?.sourceApiVersion ?? manifest.sourceApiVersion)
      || record.sourceFetchedAt !== manifest.sourceFetchedAt
      || (!corpusScoped && record.documentKey !== manifest.targetDocumentKey)
      || (corpusScoped && !inventoryDocuments.has(record.documentKey))
      || !manifest.gamesystems.includes(record.gamesystem)
    ) {
      throw new Error(`Compiled provenance does not match the manifest: ${record.key}.`);
    }
  }
}

function verifyNormalizedReferences(
  collections: Partial<Record<Open5eCollection, NormalizedContentRecord[]>>
): void {
  const recordsByContentKey = new Map<string, NormalizedContentRecord>();
  const recordsByKindAndSourceKey = new Map<string, NormalizedContentRecord>();
  for (const records of Object.values(collections)) {
    for (const record of records ?? []) {
      const existing = recordsByContentKey.get(record.contentKey);
      if (existing) {
        throw new Error(
          `Open5e content key is duplicated across collections: ${record.contentKey} (${existing.kind}, ${record.kind}).`
        );
      }
      recordsByContentKey.set(record.contentKey, record);
      recordsByKindAndSourceKey.set(`${record.kind}\u0000${record.sourceKey}`, record);
    }
  }

  const requireReference = (
    owner: NormalizedContentRecord,
    contentKey: string,
    kind: NormalizedContentRecord["kind"]
  ): NormalizedContentRecord => {
    const referenced = recordsByContentKey.get(contentKey);
    if (!referenced) {
      throw new Error(`${owner.contentKey} references missing content ${contentKey}.`);
    }
    if (referenced.kind !== kind) {
      throw new Error(
        `${owner.contentKey} references ${contentKey} as ${kind}, but the installed record is ${referenced.kind}.`
      );
    }
    return referenced;
  };
  const requireSourceReference = (
    owner: NormalizedContentRecord,
    sourceKey: string,
    kind: NormalizedContentRecord["kind"]
  ): NormalizedContentRecord => {
    const referenced = recordsByKindAndSourceKey.get(`${kind}\u0000${sourceKey}`);
    if (!referenced) throw new Error(`${owner.contentKey} references missing ${kind} source ${sourceKey}.`);
    return referenced;
  };

  if ((collections.rulesets?.length ?? 0) > 0) {
    const referencedRules = new Set<string>();
    for (const record of collections.rules ?? []) {
      if (record.kind !== "rule") continue;
      if (record.index === undefined || record.initialHeaderLevel === undefined || record.crossReferences === undefined) {
        throw new Error(`${record.contentKey} is missing S6 rule hierarchy metadata.`);
      }
      requireSourceReference(record, record.rulesetKey, "ruleset");
    }
    for (const record of collections.rulesets ?? []) {
      if (record.kind !== "ruleset") continue;
      for (const contentKey of record.ruleContentKeys) {
        const rule = requireReference(record, contentKey, "rule");
        if (rule.kind !== "rule" || rule.rulesetKey !== record.sourceKey) {
          throw new Error(`${record.contentKey} contains a divergent rule ${contentKey}.`);
        }
        if (referencedRules.has(contentKey)) {
          throw new Error(`${contentKey} appears in more than one ruleset.`);
        }
        referencedRules.add(contentKey);
      }
    }
    const ruleCount = (collections.rules ?? []).filter((record) => record.kind === "rule").length;
    if (referencedRules.size !== ruleCount) {
      throw new Error(`Open5e ruleset graph covers ${referencedRules.size} of ${ruleCount} rules.`);
    }
  }

  for (const record of collections.items ?? []) {
    if (record.kind !== "item") continue;
    if (record.weaponContentKey) requireReference(record, record.weaponContentKey, "weapon");
    if (record.armorContentKey) requireReference(record, record.armorContentKey, "armor");
  }
  for (const record of collections.magicitems ?? []) {
    if (record.kind !== "magic-item") continue;
    if (record.weaponContentKey) requireReference(record, record.weaponContentKey, "weapon");
    if (record.armorContentKey) requireReference(record, record.armorContentKey, "armor");
    requireReference(record, record.rarity.contentKey, "item-rarity");
  }
  for (const record of collections.weapons ?? []) {
    if (record.kind !== "weapon") continue;
    requireReference(record, record.damageTypeContentKey, "damage-type");
    for (const property of record.properties) {
      requireReference(record, property.contentKey, "weapon-property");
    }
  }
  for (const record of collections.creaturesets ?? []) {
    if (record.kind !== "creature-set") continue;
    for (const creature of record.creatures) requireReference(record, creature.contentKey, "creature");
  }
  for (const record of collections.creatures ?? []) {
    if (record.kind !== "creature") continue;
    requireReference(record, record.creatureType.contentKey, "creature-type");
    requireReference(record, record.size.contentKey, "size");
    for (const set of record.creatureSets) requireReference(record, set.contentKey, "creature-set");
    for (const environment of record.environments) requireReference(record, environment.contentKey, "environment");
    for (const damageType of [
      ...record.defenses.damageImmunities,
      ...record.defenses.damageResistances,
      ...record.defenses.damageVulnerabilities,
    ]) requireReference(record, damageType.contentKey, "damage-type");
    for (const condition of record.defenses.conditionImmunities) {
      requireReference(record, condition.contentKey, "condition");
    }
  }
  for (const record of collections.spells ?? []) {
    if (record.kind !== "spell") continue;
    requireReference(record, record.school.contentKey, "spell-school");
    for (const damageType of record.damageTypes) {
      requireReference(record, damageType.contentKey, "damage-type");
    }
  }
  for (const record of collections.spelllists ?? []) {
    if (record.kind !== "spell-list") continue;
    for (const spell of record.spells) requireReference(record, spell.contentKey, "spell");
  }
  for (const record of collections.abilities ?? []) {
    if (record.kind !== "ability") continue;
    for (const skill of record.skills) requireReference(record, skill.contentKey, "skill");
  }
  for (const record of collections.languages ?? []) {
    if (record.kind !== "language" || !record.scriptLanguageSourceKey) continue;
    requireSourceReference(record, record.scriptLanguageSourceKey, "language");
  }
  for (const record of collections.species ?? []) {
    if (record.kind !== "species" || !record.subspeciesOfSourceKey) continue;
    const parent = requireSourceReference(record, record.subspeciesOfSourceKey, "species");
    if (parent.kind !== "species" || parent.isSubspecies) {
      throw new Error(`${record.contentKey} references an invalid parent species.`);
    }
  }
  for (const record of collections.classes ?? []) {
    if (record.kind !== "class") continue;
    if (record.subclassOf) requireReference(record, record.subclassOf.contentKey, "class");
    for (const ability of [...record.savingThrows, ...record.primaryAbilities]) {
      requireReference(record, ability.contentKey, "ability");
    }
  }
}

function verifyCompiledReferences(
  normalizedCollections: Partial<Record<Open5eCollection, NormalizedContentRecord[]>>,
  compiledCollections: Partial<Record<Open5eCollection, CompiledContentRecord[]>>
): void {
  const normalized = new Map<string, NormalizedContentRecord>();
  for (const records of Object.values(normalizedCollections)) {
    for (const record of records ?? []) normalized.set(record.contentKey, record);
  }
  const actionIdentities = new Set<string>();
  for (const record of compiledCollections.creatures ?? []) {
    if (record.kind !== "creature-attack") continue;
    const creature = normalized.get(record.sourceContentKey);
    if (!creature || creature.kind !== "creature") {
      throw new Error(`${record.contentKey} references missing source creature ${record.sourceContentKey}.`);
    }
    const action = creature.actions.find((candidate) => candidate.actionKey === record.actionKey);
    if (!action || action.name !== record.name) {
      throw new Error(`${record.contentKey} references missing or divergent source action ${record.actionKey}.`);
    }
    const damageType = normalized.get(record.damage.typeContentKey);
    if (
      !damageType
      || damageType.kind !== "damage-type"
      || damageType.sourceKey !== record.damage.typeKey
      || damageType.name !== record.damage.typeName
    ) {
      throw new Error(`${record.contentKey} references missing or divergent damage type.`);
    }
    const identity = `${record.sourceContentKey}\u0000${record.actionKey}`;
    if (actionIdentities.has(identity)) {
      throw new Error(`Duplicate compiled creature action identity: ${identity}.`);
    }
    actionIdentities.add(identity);
  }
  const compiledAttacks = new Map(
    (compiledCollections.creatures ?? [])
      .filter((record) => record.kind === "creature-attack")
      .map((record) => [record.contentKey, record])
  );
  const effectProgramIdentities = new Set<string>();
  for (const [collection, records] of [
    ["creatures", compiledCollections.creatures ?? []],
    ["spells", compiledCollections.spells ?? []],
  ] as const) {
    for (const record of records) {
      if (record.kind !== "effect-program") continue;
      const source = normalized.get(record.sourceContentKey);
      if (!source) {
        throw new Error(`${record.contentKey} references missing effect-program source ${record.sourceContentKey}.`);
      }
      if (record.sourceDescriptionSha256 !== sha256(record.sourceDescription)) {
        throw new Error(`${record.contentKey} does not round-trip its retained source description.`);
      }
      if (record.sourceType === "creature-action") {
        if (collection !== "creatures" || source.kind !== "creature" || !record.sourceActionKey) {
          throw new Error(`${record.contentKey} has an invalid creature-action source.`);
        }
        const action = source.actions.find((candidate) => candidate.actionKey === record.sourceActionKey);
        if (
          !action
          || action.name !== record.sourceName
          || action.description.trim() !== record.sourceDescription
          || sha256(action.description.trim()) !== record.sourceDescriptionSha256
        ) {
          throw new Error(`${record.contentKey} source action no longer round-trips exactly.`);
        }
      } else {
        if (collection !== "spells" || source.kind !== "spell" || record.sourceActionKey !== null) {
          throw new Error(`${record.contentKey} has an invalid spell source.`);
        }
        if (
          source.name !== record.sourceName
          || source.description !== record.sourceDescription
          || sha256(source.description) !== record.sourceDescriptionSha256
        ) {
          throw new Error(`${record.contentKey} source spell no longer round-trips exactly.`);
        }
      }
      const identity = `${record.sourceContentKey}\u0000${record.sourceActionKey ?? "spell"}`;
      if (effectProgramIdentities.has(identity)) {
        throw new Error(`Duplicate compiled effect-program identity: ${identity}.`);
      }
      effectProgramIdentities.add(identity);
      for (const operation of record.operations) {
        if (operation.kind === "damage") {
          const damageType = normalized.get(operation.damageType.contentKey);
          if (
            !damageType
            || damageType.kind !== "damage-type"
            || damageType.sourceKey !== operation.damageType.sourceKey
            || damageType.name !== operation.damageType.name
          ) {
            throw new Error(`${record.contentKey} references a divergent effect damage type.`);
          }
        }
        if (operation.kind === "apply-condition") {
          const condition = normalized.get(operation.condition.contentKey);
          if (
            !condition
            || condition.kind !== "condition"
            || condition.sourceKey !== operation.condition.sourceKey
            || condition.name !== operation.condition.name
          ) {
            throw new Error(`${record.contentKey} references a divergent effect condition.`);
          }
        }
        if (operation.kind === "attack-sequence") {
          for (const step of operation.steps) {
            const attack = compiledAttacks.get(step.attackContentKey);
            if (
              !attack
              || attack.sourceContentKey !== record.sourceContentKey
              || attack.actionKey !== step.actionKey
              || attack.name !== step.name
            ) {
              throw new Error(`${record.contentKey} references a missing or divergent multiattack step.`);
            }
          }
        }
      }
      verifyEffectExecutionContract(record);
    }
  }
  for (const record of compiledCollections.spells ?? []) {
    if (record.kind !== "spell-effect") continue;
    const spell = normalized.get(record.sourceContentKey);
    if (!spell || spell.kind !== "spell") {
      throw new Error(`${record.contentKey} references missing source spell ${record.sourceContentKey}.`);
    }
    if (record.sourceDescriptionSha256 !== sha256(spell.description)) {
      throw new Error(`${record.contentKey} source-description hash diverges from ${spell.contentKey}.`);
    }
    if (record.effectKind === "damage") {
      const damageType = normalized.get(record.damageType.contentKey);
      if (
        !damageType
        || damageType.kind !== "damage-type"
        || damageType.sourceKey !== record.damageType.sourceKey
        || damageType.name !== record.damageType.name
      ) {
        throw new Error(`${record.contentKey} references missing or divergent spell damage type.`);
      }
    } else if (record.effectKind === "healing") {
      if (spell.sourceKey !== "srd_cure-wounds" || record.targetPolicy !== "single-creature") {
        throw new Error(`${record.contentKey} has an unreviewed healing producer.`);
      }
    } else if (record.effectKind === "stat-modifier") {
      if (
        spell.sourceKey !== "srd_shield"
        || record.modifier.stat !== "armor-class"
        || record.modifier.amount !== 5
        || record.modifier.trigger !== "incoming-attack-would-hit"
      ) {
        throw new Error(`${record.contentKey} has an unreviewed stat-modifier producer.`);
      }
    }
  }
  const speciesProfiles = new Map(
    (compiledCollections.species ?? [])
      .filter((record) => record.kind === "species-profile")
      .map((record) => [record.sourceContentKey, record])
  );
  for (const record of speciesProfiles.values()) {
    const source = normalized.get(record.sourceContentKey);
    if (!source || source.kind !== "species") {
      throw new Error(`${record.contentKey} references missing source species ${record.sourceContentKey}.`);
    }
    const parentProfile = record.parent ? speciesProfiles.get(record.parent.contentKey) : undefined;
    if (record.parent && !parentProfile) {
      throw new Error(`${record.contentKey} references missing parent species profile ${record.parent.contentKey}.`);
    }
    if (record.sourceTraitsSha256 !== sha256(canonicalJson({
      parent: parentProfile?.sourceTraitsSha256 ?? null,
      traits: source.traits,
    }))) {
      throw new Error(`${record.contentKey} source-trait hash diverges from ${source.contentKey}.`);
    }
    for (const language of record.languages) {
      const installed = normalized.get(language.contentKey);
      if (!installed || installed.kind !== "language" || installed.name !== language.name) {
        throw new Error(`${record.contentKey} references missing or divergent language ${language.contentKey}.`);
      }
    }
  }
  for (const record of compiledCollections.classes ?? []) {
    if (record.kind !== "class-profile") continue;
    const source = normalized.get(record.sourceContentKey);
    if (!source || source.kind !== "class" || source.isSubclass) {
      throw new Error(`${record.contentKey} references missing or invalid source class ${record.sourceContentKey}.`);
    }
    if (record.sourceFeaturesSha256 !== sha256(canonicalJson(source.features))) {
      throw new Error(`${record.contentKey} source-feature hash diverges from ${source.contentKey}.`);
    }
    for (const skill of record.skillChoice.options) {
      const installed = normalized.get(skill.contentKey);
      if (!installed || installed.kind !== "skill" || installed.name !== skill.name) {
        throw new Error(`${record.contentKey} references missing or divergent skill ${skill.contentKey}.`);
      }
    }
  }
  for (const record of compiledCollections.backgrounds ?? []) {
    if (record.kind !== "background-profile") continue;
    const source = normalized.get(record.sourceContentKey);
    if (!source || source.kind !== "background") {
      throw new Error(`${record.contentKey} references missing source background ${record.sourceContentKey}.`);
    }
    if (record.sourceBenefitsSha256 !== sha256(canonicalJson(source.benefits))) {
      throw new Error(`${record.contentKey} source-benefit hash diverges from ${source.contentKey}.`);
    }
    for (const skill of record.skillProficiencies) {
      const installed = normalized.get(skill.contentKey);
      if (!installed || installed.kind !== "skill" || installed.name !== skill.name) {
        throw new Error(`${record.contentKey} references missing or divergent skill ${skill.contentKey}.`);
      }
    }
    for (const sourceKey of record.startingItemSourceKeys) {
      const installed = [...normalized.values()].find((candidate) => candidate.kind === "item" && candidate.sourceKey === sourceKey);
      if (!installed) throw new Error(`${record.contentKey} references missing starting item ${sourceKey}.`);
    }
  }
}

function verifyEffectExecutionContract(
  record: Extract<CompiledContentRecord, { kind: "effect-program" }>
): void {
  const count = (kind: CompiledContentRecord extends never ? never : string): number =>
    record.operations.filter((operation) => operation.kind === kind).length;
  if (record.executionMode === "multiattack") {
    if (record.hasDeferredProse || count("attack-sequence") !== 1) {
      throw new Error(`${record.contentKey} has an incomplete multiattack execution contract.`);
    }
  } else if (record.executionMode === "saving-throw-damage") {
    if (record.hasDeferredProse || count("saving-throw") !== 1 || count("damage") !== 1) {
      throw new Error(`${record.contentKey} has an incomplete save-damage execution contract.`);
    }
  } else if (record.executionMode === "saving-throw-condition") {
    if (record.hasDeferredProse || count("saving-throw") !== 1 || count("apply-condition") !== 1) {
      throw new Error(`${record.contentKey} has an incomplete save-condition execution contract.`);
    }
  } else if (record.executionMode === "spell-area") {
    if (record.sourceType !== "spell" || count("area") !== 1) {
      throw new Error(`${record.contentKey} has an invalid spell-area execution contract.`);
    }
  }
}

function verifyRecordOrdering(
  collection: Open5eCollection,
  records: Array<{ key: string; contentKey: string }>
): void {
  const keys = records.map((record) => record.key);
  const sortedKeys = [...keys].sort((left, right) => left.localeCompare(right));
  if (keys.some((key, index) => key !== sortedKeys[index])) {
    throw new Error(`Open5e records are not key-sorted: ${collection}.`);
  }
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Open5e records contain duplicate keys: ${collection}.`);
  }
  const contentKeys = records.map((record) => record.contentKey);
  if (new Set(contentKeys).size !== contentKeys.length) {
    throw new Error(`Open5e records contain duplicate content keys: ${collection}.`);
  }
}

function verifyDocumentInventory(manifest: Open5ePackManifest, records: NormalizedContentRecord[]): void {
  const documents = records.map((record) => {
    if (record.kind !== "document") {
      throw new Error(`The normalized document inventory contains ${record.kind}.`);
    }
    return record;
  });
  const actual = documents.map((document) => ({
    key: document.sourceKey,
    packRole: document.packRole,
    gamesystem: document.gamesystem,
    publisher: document.publisher,
    licenseKeys: document.licenseKeys,
    permalink: document.permalink,
  }));
  if (canonicalJson(actual) !== canonicalJson(manifest.documents)) {
    throw new Error("Normalized Open5e documents do not match the manifest document inventory.");
  }
  const targetDocuments = documents.filter((document) => document.packRole === "target");
  if (targetDocuments.length !== 1) {
    throw new Error("Open5e pack must contain exactly one target document.");
  }
  if (targetDocuments[0]?.sourceKey !== manifest.targetDocumentKey) {
    throw new Error("Open5e target document role does not match the manifest target key.");
  }
  const taxonomyDocuments = documents.filter((document) => document.packRole === "taxonomy");
  if (taxonomyDocuments.length !== 1) {
    throw new Error("Open5e pack must contain exactly one taxonomy document.");
  }
  if (taxonomyDocuments[0]?.sourceKey !== manifest.taxonomyDocumentKey) {
    throw new Error("Open5e taxonomy document role does not match the manifest taxonomy key.");
  }
}

function assertArtifactPath(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Unexpected Open5e artifact path: expected ${expected}, received ${actual}.`);
  }
}

function resolveArtifactPath(packDirectory: string, artifactPath: string): string {
  if (isAbsolute(artifactPath)) {
    throw new Error(`Open5e artifact path must be relative: ${artifactPath}`);
  }
  const absolutePackDirectory = resolve(packDirectory);
  const absoluteArtifactPath = resolve(absolutePackDirectory, ...artifactPath.split("/"));
  const pathFromPack = relative(absolutePackDirectory, absoluteArtifactPath);
  if (pathFromPack === "" || pathFromPack === ".." || pathFromPack.startsWith(`..${sep}`) || isAbsolute(pathFromPack)) {
    throw new Error(`Open5e artifact path escapes its pack: ${artifactPath}`);
  }
  return absoluteArtifactPath;
}
