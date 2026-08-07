import type { Open5eContentPack } from "./pack.js";
import { canonicalJson, sha256 } from "./hash.js";
import type {
  CompiledContentRecord,
  NormalizedContentRecord,
  Open5eCollection,
} from "./schema.js";

export interface ContentPolicy {
  gamesystem: string;
  allowedLicenses: readonly string[];
  allowedDocuments: readonly string[];
}

export type ContentAccessCode =
  | "content_pack_not_installed"
  | "content_not_found"
  | "content_gamesystem_forbidden"
  | "content_license_forbidden"
  | "content_document_forbidden"
  | "content_tier_insufficient";

export class ContentAccessError extends Error {
  public constructor(
    public readonly code: ContentAccessCode,
    message: string,
    public readonly contentKey: string | null = null
  ) {
    super(message);
    this.name = "ContentAccessError";
  }
}

export interface ResolvedContentRecord {
  packHash: string;
  rulesVersion: string;
  effectiveTier: 0 | 1 | 2;
  normalized: NormalizedContentRecord;
  compiled: CompiledContentRecord | null;
  compiledPrograms: readonly CompiledContentRecord[];
  sourcePayload: unknown | null;
}

export interface ContentSearchInput {
  query?: string;
  collection?: Open5eCollection;
  limit?: number;
  includeDescription?: boolean;
}

export class Open5eContentResolver {
  public constructor(
    public readonly pack: Open5eContentPack,
    public readonly policy: ContentPolicy
  ) {
    if (!policy.gamesystem.trim()) throw new Error("Content policy requires a game system.");
    if (policy.allowedLicenses.length === 0) throw new Error("Content policy requires at least one allowed license.");
  }

  public get(contentKey: string, rulesVersion: string): ResolvedContentRecord {
    this.assertRulesVersion(rulesVersion);
    const record = this.pack.getNormalized(contentKey);
    if (!record) {
      throw new ContentAccessError("content_not_found", "That content key is not installed in this pack.", contentKey);
    }
    this.assertPolicy(record);
    const compiledPrograms = this.pack.getCompiledForSource(contentKey);
    const compiled = this.pack.getCompiled(contentKey) ?? primaryCompiledProgram(compiledPrograms);
    const sourcePayload = record.kind === "corpus-reference"
      ? this.pack.getRaw(record.collection, record.sourceRecordKey)
      : null;
    if (record.kind === "corpus-reference") {
      if (sourcePayload === null || sha256(canonicalJson(sourcePayload)) !== record.sourcePayloadSha256) {
        throw new ContentAccessError(
          "content_pack_not_installed",
          "The corpus reference does not match its verified raw source payload.",
          contentKey
        );
      }
    }
    return {
      packHash: this.pack.descriptor.packHash,
      rulesVersion: this.pack.descriptor.rulesVersion,
      effectiveTier: compiled ? 2 : record.fidelityTier,
      normalized: record,
      compiled,
      compiledPrograms,
      sourcePayload,
    };
  }

  public search(input: ContentSearchInput, rulesVersion: string): ResolvedContentRecord[] {
    this.assertRulesVersion(rulesVersion);
    const query = input.query?.trim().toLocaleLowerCase("en-US") ?? "";
    const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 10)));
    const records = this.pack.records(input.collection);
    const results: ResolvedContentRecord[] = [];
    for (const record of records) {
      if (!this.allowed(record)) continue;
      const haystack = [
        record.contentKey,
        record.sourceKey,
        record.kind,
        searchableName(record),
        input.includeDescription ? searchableDescription(record) : "",
        input.includeDescription && "parent" in record && typeof record.parent === "string" ? record.parent : "",
        input.includeDescription && "rulesetKey" in record && typeof record.rulesetKey === "string" ? record.rulesetKey : "",
      ]
        .join("\n")
        .toLocaleLowerCase("en-US");
      if (query && !haystack.includes(query)) continue;
      const compiledPrograms = this.pack.getCompiledForSource(record.contentKey);
      const compiled = this.pack.getCompiled(record.contentKey) ?? primaryCompiledProgram(compiledPrograms);
      results.push({
        packHash: this.pack.descriptor.packHash,
        rulesVersion: this.pack.descriptor.rulesVersion,
        effectiveTier: compiled ? 2 : record.fidelityTier,
        normalized: record,
        compiled,
        compiledPrograms,
        sourcePayload: null,
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  public resolveAtTier(
    contentKey: string,
    minimumTier: 1 | 2,
    rulesVersion: string
  ): ResolvedContentRecord {
    const result = this.get(contentKey, rulesVersion);
    if (result.effectiveTier < minimumTier) {
      throw new ContentAccessError(
        "content_tier_insufficient",
        `Content reached tier ${result.effectiveTier}; tier ${minimumTier} is required for this mechanical resolution.`,
        contentKey
      );
    }
    return result;
  }

  private assertRulesVersion(rulesVersion: string): void {
    if (rulesVersion !== this.pack.descriptor.rulesVersion) {
      throw new ContentAccessError(
        "content_pack_not_installed",
        `Campaign rules ${rulesVersion} are not installed in the active content resolver.`
      );
    }
  }

  private assertPolicy(record: NormalizedContentRecord): void {
    if (record.gamesystem !== this.policy.gamesystem) {
      throw new ContentAccessError(
        "content_gamesystem_forbidden",
        `Content belongs to ${record.gamesystem}; this campaign uses ${this.policy.gamesystem}.`,
        record.contentKey
      );
    }
    if (
      this.policy.allowedDocuments.length > 0
      && !this.policy.allowedDocuments.includes(record.documentKey)
    ) {
      throw new ContentAccessError(
        "content_document_forbidden",
        `Document ${record.documentKey} is not enabled by the content policy.`,
        record.contentKey
      );
    }
    if (!record.licenseKeys.some((license) => this.policy.allowedLicenses.includes(license))) {
      throw new ContentAccessError(
        "content_license_forbidden",
        `Content has no license enabled by the deployment policy.`,
        record.contentKey
      );
    }
  }

  private allowed(record: NormalizedContentRecord): boolean {
    try {
      this.assertPolicy(record);
      return true;
    } catch (error) {
      if (error instanceof ContentAccessError) return false;
      throw error;
    }
  }
}

function primaryCompiledProgram(
  programs: readonly CompiledContentRecord[]
): CompiledContentRecord | null {
  return programs.find((program) => program.kind !== "effect-program")
    ?? programs.find((program) =>
      program.kind === "effect-program"
      && !program.hasDeferredProse
      && program.executionMode !== "fragments"
      && program.executionMode !== "spell-area"
    )
    ?? null;
}

function searchableName(record: NormalizedContentRecord): string {
  return "name" in record && typeof record.name === "string" ? record.name : "";
}

function searchableDescription(record: NormalizedContentRecord): string {
  return "description" in record && typeof record.description === "string" ? record.description : "";
}
