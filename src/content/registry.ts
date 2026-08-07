import type { EngineEvent } from "../engine-contracts.js";
import { LEGACY_LANTERN_RULES_VERSION } from "./legacy-repin.js";
import {
  ACTIVE_OPEN5E_PACK_DIRECTORY,
  HISTORICAL_OPEN5E_PACK_DIRECTORIES,
  loadOpen5eContentPack,
  type Open5eContentPack,
  type Open5ePackDescriptor,
} from "./pack.js";
import {
  ContentAccessError,
  Open5eContentResolver,
  type ContentPolicy,
} from "./resolve.js";

export interface ResolvedEventContentEvidence {
  contentKey: string;
  sourceContentKey: string;
  packHash: string;
  rulesVersion: string;
  recordKind: "normalized" | "compiled";
  kind: string;
  documentKey: string;
  gamesystem: string;
  effectiveTier: 0 | 1 | 2;
}

export interface ResolvedEngineEventEvidence {
  event: EngineEvent;
  pack: Open5ePackDescriptor | null;
  content: ResolvedEventContentEvidence[];
  legacyUnversioned: boolean;
  legacyRulesVersion: typeof LEGACY_LANTERN_RULES_VERSION | null;
}

export class Open5ePackRegistry {
  public readonly activePack: Open5eContentPack;
  private readonly packsByRulesVersion: ReadonlyMap<string, Open5eContentPack>;
  private readonly packsByHash: ReadonlyMap<string, Open5eContentPack>;

  public constructor(activePack: Open5eContentPack, packs: readonly Open5eContentPack[]) {
    const byRulesVersion = new Map<string, Open5eContentPack>();
    const byHash = new Map<string, Open5eContentPack>();
    for (const pack of packs) {
      const rulesConflict = byRulesVersion.get(pack.descriptor.rulesVersion);
      const hashConflict = byHash.get(pack.descriptor.packHash);
      if (rulesConflict && rulesConflict.descriptor.packDirectory !== pack.descriptor.packDirectory) {
        throw new Error(`Duplicate Open5e rules identity: ${pack.descriptor.rulesVersion}.`);
      }
      if (hashConflict && hashConflict.descriptor.packDirectory !== pack.descriptor.packDirectory) {
        throw new Error(`Duplicate Open5e pack hash: ${pack.descriptor.packHash}.`);
      }
      byRulesVersion.set(pack.descriptor.rulesVersion, pack);
      byHash.set(pack.descriptor.packHash, pack);
    }
    if (byRulesVersion.get(activePack.descriptor.rulesVersion) !== activePack) {
      throw new Error("The active Open5e pack must be present in its registry.");
    }
    this.activePack = activePack;
    this.packsByRulesVersion = byRulesVersion;
    this.packsByHash = byHash;
  }

  public getByRulesVersion(rulesVersion: string): Open5eContentPack | null {
    return this.packsByRulesVersion.get(rulesVersion) ?? null;
  }

  public getByHash(packHash: string): Open5eContentPack | null {
    return this.packsByHash.get(packHash) ?? null;
  }

  public requireByRulesVersion(rulesVersion: string): Open5eContentPack {
    const pack = this.getByRulesVersion(rulesVersion);
    if (!pack) {
      throw new ContentAccessError(
        "content_pack_not_installed",
        `Content pack ${rulesVersion} is not installed in this engine.`
      );
    }
    return pack;
  }

  public descriptors(): Open5ePackDescriptor[] {
    return [...this.packsByRulesVersion.values()]
      .map((pack) => pack.descriptor)
      .sort((left, right) => left.packVersion.localeCompare(right.packVersion));
  }

  public resolver(rulesVersion: string, policy: ContentPolicy): Open5eContentResolver {
    return new Open5eContentResolver(this.requireByRulesVersion(rulesVersion), policy);
  }

  public resolveEvent(event: EngineEvent, policy: ContentPolicy): ResolvedEngineEventEvidence {
    const persisted = event as EngineEvent & { rulesVersion?: unknown; contentKeys?: unknown };
    const rulesVersion = typeof persisted.rulesVersion === "string" ? persisted.rulesVersion : null;
    const contentKeys = Array.isArray(persisted.contentKeys)
      ? persisted.contentKeys.filter((value): value is string => typeof value === "string")
      : [];
    if (!rulesVersion || rulesVersion === LEGACY_LANTERN_RULES_VERSION) {
      if (contentKeys.length) {
        throw new ContentAccessError(
          "content_pack_not_installed",
          `Legacy event ${event.id} claims content keys without a provable content-pack identity.`
        );
      }
      return {
        event,
        pack: null,
        content: [],
        legacyUnversioned: true,
        legacyRulesVersion: LEGACY_LANTERN_RULES_VERSION,
      };
    }
    const pack = this.requireByRulesVersion(rulesVersion);
    const resolver = new Open5eContentResolver(pack, policy);
    const content = [...new Set(contentKeys)].sort().map((contentKey) => {
      const normalized = pack.getNormalized(contentKey);
      if (normalized) {
        const resolved = resolver.get(contentKey, rulesVersion);
        return {
          contentKey,
          sourceContentKey: contentKey,
          packHash: pack.descriptor.packHash,
          rulesVersion: pack.descriptor.rulesVersion,
          recordKind: "normalized" as const,
          kind: normalized.kind,
          documentKey: normalized.documentKey,
          gamesystem: normalized.gamesystem,
          effectiveTier: resolved.effectiveTier,
        };
      }
      const compiled = pack.getCompiled(contentKey);
      if (!compiled) {
        throw new ContentAccessError(
          "content_not_found",
          `Event ${event.id} references content that is absent from its historical pack.`,
          contentKey
        );
      }
      const source = resolver.get(compiled.sourceContentKey, rulesVersion);
      return {
        contentKey,
        sourceContentKey: compiled.sourceContentKey,
        packHash: pack.descriptor.packHash,
        rulesVersion: pack.descriptor.rulesVersion,
        recordKind: "compiled" as const,
        kind: compiled.kind,
        documentKey: compiled.documentKey,
        gamesystem: compiled.gamesystem,
        effectiveTier: source.effectiveTier,
      };
    });
    return {
      event,
      pack: pack.descriptor,
      content,
      legacyUnversioned: false,
      legacyRulesVersion: null,
    };
  }
}

export async function loadInstalledOpen5ePackRegistry(): Promise<Open5ePackRegistry> {
  const directories = [...HISTORICAL_OPEN5E_PACK_DIRECTORIES, ACTIVE_OPEN5E_PACK_DIRECTORY];
  const packs = await Promise.all(directories.map(loadOpen5eContentPack));
  const active = packs.find((pack) => pack.descriptor.packVersion === contentPackVersion(ACTIVE_OPEN5E_PACK_DIRECTORY));
  if (!active) throw new Error("The active Open5e pack was not loaded.");
  return new Open5ePackRegistry(active, packs);
}

function contentPackVersion(packDirectory: string): string {
  return packDirectory.replace(/[\\/]$/, "").split(/[\\/]/).at(-1) ?? "";
}
